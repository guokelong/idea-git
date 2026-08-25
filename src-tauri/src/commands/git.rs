use std::path::Path;
use std::time::Duration;

use tauri::State;

use crate::error::AppError;
use crate::git_parse::{parse_status_porcelain, RepoStatus};
use crate::git_runner::GitRunner;

pub(crate) async fn check_git_available(runner: &GitRunner) -> Result<bool, AppError> {
    match runner
        .run(Path::new("/"), &["--version"], Duration::from_secs(5))
        .await
    {
        Ok(out) => Ok(out.code == 0),
        Err(AppError::GitNotFound) => Ok(false),
        Err(e) => Err(e),
    }
}

pub(crate) async fn fetch_repo_status(
    path: &str,
    runner: &GitRunner,
) -> Result<RepoStatus, AppError> {
    let out = runner
        .run(
            Path::new(path),
            &["status", "--porcelain=v1", "-b"],
            Duration::from_secs(15),
        )
        .await?;
    if out.code != 0 {
        return Err(AppError::GitFailed {
            code: out.code,
            stderr: out.stderr,
        });
    }
    parse_status_porcelain(&out.stdout)
}

#[tauri::command]
pub async fn check_git(runner: State<'_, GitRunner>) -> Result<bool, AppError> {
    log::info!("check_git enter");
    let result = check_git_available(&runner).await;
    match &result {
        Ok(available) => log::info!("check_git exit available={available}"),
        Err(e) => log::warn!("check_git exit err={e}"),
    }
    result
}

#[tauri::command]
pub async fn get_repo_status(
    path: String,
    runner: State<'_, GitRunner>,
) -> Result<RepoStatus, AppError> {
    log::info!("get_repo_status enter path={path}");
    let result = fetch_repo_status(&path, &runner).await;
    match &result {
        Ok(status) => log::info!(
            "get_repo_status exit branch={} dirty={}",
            status.branch,
            status.dirty
        ),
        Err(e) => log::warn!("get_repo_status exit err={e}"),
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;
    use tempfile::tempdir;

    fn init_git_repo(path: &Path) {
        std::fs::create_dir_all(path).unwrap();
        let status = Command::new("git")
            .args(["init", "-b", "main"])
            .current_dir(path)
            .status()
            .unwrap();
        assert!(status.success());
        let status = Command::new("git")
            .args([
                "-c",
                "user.email=test@example.com",
                "-c",
                "user.name=test",
                "commit",
                "--allow-empty",
                "-m",
                "init",
            ])
            .current_dir(path)
            .status()
            .unwrap();
        assert!(status.success());
    }

    #[tokio::test]
    async fn check_git_returns_true_when_git_exists() {
        let runner = GitRunner::new();
        let available = check_git_available(&runner).await.unwrap();
        assert!(available);
    }

    #[tokio::test]
    async fn get_repo_status_reads_temp_repo() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("demo");
        init_git_repo(&repo);
        let runner = GitRunner::new();
        let status = fetch_repo_status(repo.to_str().unwrap(), &runner)
            .await
            .unwrap();
        assert_eq!(status.branch, "main");
        assert!(!status.dirty);
        assert!(!status.has_conflicts);
    }

    #[tokio::test]
    async fn get_repo_status_nonzero_is_git_failed() {
        let dir = tempdir().unwrap();
        let runner = GitRunner::new();
        let err = fetch_repo_status(dir.path().to_str().unwrap(), &runner)
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::GitFailed { code, .. } if code != 0));
    }
}

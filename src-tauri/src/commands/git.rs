use std::path::Path;
use std::time::Duration;

use tauri::State;

use crate::error::AppError;
use crate::git_parse::{
    parse_branches, parse_log, parse_status_porcelain, BranchRow, CommitRow, RepoStatus,
};
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

async fn run_checked(
    runner: &GitRunner,
    path: &str,
    args: &[&str],
    timeout: Duration,
) -> Result<crate::git_runner::GitOutput, AppError> {
    let out = runner.run(Path::new(path), args, timeout).await?;
    if out.code != 0 {
        return Err(AppError::GitFailed {
            code: out.code,
            stderr: out.stderr,
        });
    }
    Ok(out)
}

pub(crate) async fn get_file_diff(
    path: &str,
    file: &str,
    staged: bool,
    runner: &GitRunner,
) -> Result<String, AppError> {
    let args: Vec<&str> = if staged {
        vec!["diff", "--cached", "--", file]
    } else {
        vec!["diff", "--", file]
    };
    let out = run_checked(runner, path, &args, Duration::from_secs(15)).await?;
    Ok(out.stdout)
}

pub(crate) async fn stage_paths_inner(
    path: &str,
    paths: &[String],
    runner: &GitRunner,
) -> Result<(), AppError> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args = vec!["add".to_string(), "--".to_string()];
    args.extend(paths.iter().cloned());
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
    run_checked(runner, path, &args_ref, Duration::from_secs(30)).await?;
    Ok(())
}

pub(crate) async fn unstage_paths_inner(
    path: &str,
    paths: &[String],
    runner: &GitRunner,
) -> Result<(), AppError> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args = vec![
        "restore".to_string(),
        "--staged".to_string(),
        "--".to_string(),
    ];
    args.extend(paths.iter().cloned());
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
    run_checked(runner, path, &args_ref, Duration::from_secs(30)).await?;
    Ok(())
}

pub(crate) async fn commit_inner(
    path: &str,
    message: String,
    amend: bool,
    runner: &GitRunner,
) -> Result<(), AppError> {
    let empty_message = message.trim().is_empty();
    let mut args = vec!["commit".to_string()];
    if amend {
        args.push("--amend".to_string());
        if empty_message {
            args.push("--no-edit".to_string());
        } else {
            args.push("-m".to_string());
            args.push(message);
        }
    } else {
        args.push("-m".to_string());
        args.push(message);
    }
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
    run_checked(runner, path, &args_ref, Duration::from_secs(30)).await?;
    Ok(())
}

pub(crate) async fn push_inner(path: &str, runner: &GitRunner) -> Result<(), AppError> {
    run_checked(runner, path, &["push"], Duration::from_secs(120)).await?;
    Ok(())
}

const LOG_FORMAT: &str = "%H%x09%h%x09%s%x09%an%x09%aI%x09%D";

pub(crate) async fn list_commits_inner(
    path: &str,
    branch: Option<String>,
    limit: u32,
    runner: &GitRunner,
) -> Result<Vec<CommitRow>, AppError> {
    let limit_s = limit.to_string();
    let format_arg = format!("--format={LOG_FORMAT}");
    let mut args = vec![
        "log".to_string(),
        "-n".to_string(),
        limit_s,
        format_arg,
    ];
    match branch.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(name) => args.push(name.to_string()),
        None => args.push("--all".to_string()),
    }
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
    let out = run_checked(runner, path, &args_ref, Duration::from_secs(15)).await?;
    parse_log(&out.stdout)
}

pub(crate) async fn get_commit_diff_inner(
    path: &str,
    hash: &str,
    runner: &GitRunner,
) -> Result<String, AppError> {
    let out = run_checked(runner, path, &["show", hash], Duration::from_secs(15)).await?;
    Ok(out.stdout)
}

const BRANCH_FORMAT: &str = "%(refname)%09%(HEAD)%09%(upstream:short)%09%(upstream:track)";

pub(crate) async fn list_branches_inner(
    path: &str,
    runner: &GitRunner,
) -> Result<Vec<BranchRow>, AppError> {
    let format_arg = format!("--format={BRANCH_FORMAT}");
    let out = run_checked(
        runner,
        path,
        &[
            "for-each-ref",
            &format_arg,
            "refs/heads",
            "refs/remotes",
        ],
        Duration::from_secs(15),
    )
    .await?;
    parse_branches(&out.stdout)
}

pub(crate) async fn checkout_branch_inner(
    path: &str,
    name: &str,
    runner: &GitRunner,
) -> Result<(), AppError> {
    run_checked(runner, path, &["checkout", name], Duration::from_secs(30)).await?;
    Ok(())
}

pub(crate) async fn create_branch_inner(
    path: &str,
    name: &str,
    checkout: bool,
    runner: &GitRunner,
) -> Result<(), AppError> {
    if checkout {
        run_checked(
            runner,
            path,
            &["checkout", "-b", name],
            Duration::from_secs(30),
        )
        .await?;
    } else {
        run_checked(runner, path, &["branch", name], Duration::from_secs(30)).await?;
    }
    Ok(())
}

pub(crate) async fn delete_branch_inner(
    path: &str,
    name: &str,
    force: bool,
    runner: &GitRunner,
) -> Result<(), AppError> {
    let flag = if force { "-D" } else { "-d" };
    run_checked(runner, path, &["branch", flag, name], Duration::from_secs(30)).await?;
    Ok(())
}

#[tauri::command]
pub async fn get_diff(
    path: String,
    file: String,
    staged: bool,
    runner: State<'_, GitRunner>,
) -> Result<String, AppError> {
    log::info!("get_diff enter path={path} file={file} staged={staged}");
    let result = get_file_diff(&path, &file, staged, &runner).await;
    match &result {
        Ok(diff) => log::info!("get_diff exit len={}", diff.len()),
        Err(e) => log::warn!("get_diff exit err={e}"),
    }
    result
}

#[tauri::command]
pub async fn stage_paths(
    path: String,
    paths: Vec<String>,
    runner: State<'_, GitRunner>,
) -> Result<(), AppError> {
    log::info!("stage_paths enter path={path} count={}", paths.len());
    let result = stage_paths_inner(&path, &paths, &runner).await;
    match &result {
        Ok(()) => log::info!("stage_paths exit"),
        Err(e) => log::warn!("stage_paths exit err={e}"),
    }
    result
}

#[tauri::command]
pub async fn unstage_paths(
    path: String,
    paths: Vec<String>,
    runner: State<'_, GitRunner>,
) -> Result<(), AppError> {
    log::info!("unstage_paths enter path={path} count={}", paths.len());
    let result = unstage_paths_inner(&path, &paths, &runner).await;
    match &result {
        Ok(()) => log::info!("unstage_paths exit"),
        Err(e) => log::warn!("unstage_paths exit err={e}"),
    }
    result
}

#[tauri::command]
pub async fn commit(
    path: String,
    message: String,
    amend: bool,
    runner: State<'_, GitRunner>,
) -> Result<(), AppError> {
    log::info!(
        "commit enter path={path} amend={amend} message_len={}",
        message.len()
    );
    let result = commit_inner(&path, message, amend, &runner).await;
    match &result {
        Ok(()) => log::info!("commit exit"),
        Err(e) => log::warn!("commit exit err={e}"),
    }
    result
}

#[tauri::command]
pub async fn push(path: String, runner: State<'_, GitRunner>) -> Result<(), AppError> {
    log::info!("push enter path={path}");
    let result = push_inner(&path, &runner).await;
    match &result {
        Ok(()) => log::info!("push exit"),
        Err(e) => log::warn!("push exit err={e}"),
    }
    result
}

#[tauri::command]
pub async fn list_commits(
    path: String,
    branch: Option<String>,
    limit: u32,
    runner: State<'_, GitRunner>,
) -> Result<Vec<CommitRow>, AppError> {
    log::info!(
        "list_commits enter path={path} branch={:?} limit={limit}",
        branch
    );
    let result = list_commits_inner(&path, branch, limit, &runner).await;
    match &result {
        Ok(rows) => log::info!("list_commits exit count={}", rows.len()),
        Err(e) => log::warn!("list_commits exit err={e}"),
    }
    result
}

#[tauri::command]
pub async fn get_commit_diff(
    path: String,
    hash: String,
    runner: State<'_, GitRunner>,
) -> Result<String, AppError> {
    log::info!("get_commit_diff enter path={path} hash={hash}");
    let result = get_commit_diff_inner(&path, &hash, &runner).await;
    match &result {
        Ok(diff) => log::info!("get_commit_diff exit len={}", diff.len()),
        Err(e) => log::warn!("get_commit_diff exit err={e}"),
    }
    result
}

#[tauri::command]
pub async fn list_branches(
    path: String,
    runner: State<'_, GitRunner>,
) -> Result<Vec<BranchRow>, AppError> {
    log::info!("list_branches enter path={path}");
    let result = list_branches_inner(&path, &runner).await;
    match &result {
        Ok(rows) => log::info!("list_branches exit count={}", rows.len()),
        Err(e) => log::warn!("list_branches exit err={e}"),
    }
    result
}

#[tauri::command]
pub async fn checkout_branch(
    path: String,
    name: String,
    runner: State<'_, GitRunner>,
) -> Result<(), AppError> {
    log::info!("checkout_branch enter path={path} name={name}");
    let result = checkout_branch_inner(&path, &name, &runner).await;
    match &result {
        Ok(()) => log::info!("checkout_branch exit"),
        Err(e) => log::warn!("checkout_branch exit err={e}"),
    }
    result
}

#[tauri::command]
pub async fn create_branch(
    path: String,
    name: String,
    checkout: bool,
    runner: State<'_, GitRunner>,
) -> Result<(), AppError> {
    log::info!("create_branch enter path={path} name={name} checkout={checkout}");
    let result = create_branch_inner(&path, &name, checkout, &runner).await;
    match &result {
        Ok(()) => log::info!("create_branch exit"),
        Err(e) => log::warn!("create_branch exit err={e}"),
    }
    result
}

#[tauri::command]
pub async fn delete_branch(
    path: String,
    name: String,
    force: bool,
    runner: State<'_, GitRunner>,
) -> Result<(), AppError> {
    log::info!("delete_branch enter path={path} name={name} force={force}");
    let result = delete_branch_inner(&path, &name, force, &runner).await;
    match &result {
        Ok(()) => log::info!("delete_branch exit"),
        Err(e) => log::warn!("delete_branch exit err={e}"),
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
        for (key, value) in [
            ("user.email", "test@example.com"),
            ("user.name", "test"),
        ] {
            let status = Command::new("git")
                .args(["config", key, value])
                .current_dir(path)
                .status()
                .unwrap();
            assert!(status.success());
        }
        let status = Command::new("git")
            .args(["commit", "--allow-empty", "-m", "init"])
            .current_dir(path)
            .status()
            .unwrap();
        assert!(status.success());
    }

    fn repo_path(repo: &Path) -> &str {
        repo.to_str().unwrap()
    }

    async fn log_subject(runner: &GitRunner, repo: &Path) -> String {
        let out = runner
            .run(repo, &["log", "-1", "--pretty=%s"], Duration::from_secs(5))
            .await
            .unwrap();
        assert_eq!(out.code, 0);
        out.stdout.trim().to_string()
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

    #[tokio::test]
    async fn commit_after_stage_appears_in_log() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("demo");
        init_git_repo(&repo);
        std::fs::write(repo.join("hello.txt"), "hello\n").unwrap();
        let runner = GitRunner::new();
        let path = repo_path(&repo);

        stage_paths_inner(path, &[String::from("hello.txt")], &runner)
            .await
            .unwrap();
        commit_inner(path, String::from("add hello"), false, &runner)
            .await
            .unwrap();

        assert_eq!(log_subject(&runner, &repo).await, "add hello");
    }

    #[tokio::test]
    async fn amend_with_message_rewrites_subject() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("demo");
        init_git_repo(&repo);
        std::fs::write(repo.join("hello.txt"), "hello\n").unwrap();
        let runner = GitRunner::new();
        let path = repo_path(&repo);
        stage_paths_inner(path, &[String::from("hello.txt")], &runner)
            .await
            .unwrap();
        commit_inner(path, String::from("first"), false, &runner)
            .await
            .unwrap();

        commit_inner(path, String::from("amended"), true, &runner)
            .await
            .unwrap();

        assert_eq!(log_subject(&runner, &repo).await, "amended");
    }

    #[tokio::test]
    async fn amend_with_empty_message_keeps_subject() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("demo");
        init_git_repo(&repo);
        std::fs::write(repo.join("hello.txt"), "hello\n").unwrap();
        let runner = GitRunner::new();
        let path = repo_path(&repo);
        stage_paths_inner(path, &[String::from("hello.txt")], &runner)
            .await
            .unwrap();
        commit_inner(path, String::from("keep me"), false, &runner)
            .await
            .unwrap();

        commit_inner(path, String::new(), true, &runner)
            .await
            .unwrap();

        assert_eq!(log_subject(&runner, &repo).await, "keep me");
    }

    #[tokio::test]
    async fn get_diff_returns_unstaged_and_staged() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("demo");
        init_git_repo(&repo);
        std::fs::write(repo.join("hello.txt"), "v1\n").unwrap();
        let runner = GitRunner::new();
        let path = repo_path(&repo);
        stage_paths_inner(path, &[String::from("hello.txt")], &runner)
            .await
            .unwrap();
        commit_inner(path, String::from("add hello"), false, &runner)
            .await
            .unwrap();
        std::fs::write(repo.join("hello.txt"), "v2\n").unwrap();

        let unstaged = get_file_diff(path, "hello.txt", false, &runner)
            .await
            .unwrap();
        assert!(unstaged.contains("-v1"));
        assert!(unstaged.contains("+v2"));

        stage_paths_inner(path, &[String::from("hello.txt")], &runner)
            .await
            .unwrap();
        let staged = get_file_diff(path, "hello.txt", true, &runner)
            .await
            .unwrap();
        assert!(staged.contains("-v1"));
        assert!(staged.contains("+v2"));
    }

    #[tokio::test]
    async fn unstage_paths_removes_from_index() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("demo");
        init_git_repo(&repo);
        std::fs::write(repo.join("hello.txt"), "hello\n").unwrap();
        let runner = GitRunner::new();
        let path = repo_path(&repo);
        stage_paths_inner(path, &[String::from("hello.txt")], &runner)
            .await
            .unwrap();
        unstage_paths_inner(path, &[String::from("hello.txt")], &runner)
            .await
            .unwrap();

        let status = fetch_repo_status(path, &runner).await.unwrap();
        assert_eq!(status.changes.len(), 1);
        assert_eq!(status.changes[0].path, "hello.txt");
        assert_eq!(status.changes[0].index_status, '?');
        assert_eq!(status.changes[0].worktree_status, '?');
    }

    #[tokio::test]
    async fn push_updates_local_bare_remote() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("demo");
        let bare = dir.path().join("remote.git");
        init_git_repo(&repo);
        let status = Command::new("git")
            .args(["init", "--bare", "-b", "main"])
            .arg(&bare)
            .status()
            .unwrap();
        assert!(status.success());
        let status = Command::new("git")
            .args(["remote", "add", "origin"])
            .arg(&bare)
            .current_dir(&repo)
            .status()
            .unwrap();
        assert!(status.success());
        let status = Command::new("git")
            .args(["push", "-u", "origin", "main"])
            .current_dir(&repo)
            .status()
            .unwrap();
        assert!(status.success());

        std::fs::write(repo.join("hello.txt"), "hello\n").unwrap();
        let runner = GitRunner::new();
        let path = repo_path(&repo);
        stage_paths_inner(path, &[String::from("hello.txt")], &runner)
            .await
            .unwrap();
        commit_inner(path, String::from("add hello"), false, &runner)
            .await
            .unwrap();
        push_inner(path, &runner).await.unwrap();

        let out = Command::new("git")
            .args(["-C"])
            .arg(&bare)
            .args(["log", "-1", "--pretty=%s"])
            .output()
            .unwrap();
        assert!(out.status.success());
        assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "add hello");
    }

    #[tokio::test]
    async fn list_commits_returns_parsed_rows() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("demo");
        init_git_repo(&repo);
        let runner = GitRunner::new();
        let path = repo_path(&repo);

        let rows = list_commits_inner(path, None, 10, &runner).await.unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].subject, "init");
        assert!(!rows[0].hash.is_empty());
        assert!(!rows[0].short_hash.is_empty());
        assert_eq!(rows[0].author, "test");
        assert!(rows[0].refs.contains("HEAD") || rows[0].refs.contains("main"));
    }

    #[tokio::test]
    async fn list_commits_filters_by_branch() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("demo");
        init_git_repo(&repo);
        let status = Command::new("git")
            .args(["checkout", "-b", "feature"])
            .current_dir(&repo)
            .status()
            .unwrap();
        assert!(status.success());
        std::fs::write(repo.join("feat.txt"), "feat\n").unwrap();
        let runner = GitRunner::new();
        let path = repo_path(&repo);
        stage_paths_inner(path, &[String::from("feat.txt")], &runner)
            .await
            .unwrap();
        commit_inner(path, String::from("add feat"), false, &runner)
            .await
            .unwrap();

        let feature = list_commits_inner(path, Some(String::from("feature")), 10, &runner)
            .await
            .unwrap();
        assert_eq!(feature[0].subject, "add feat");
        assert_eq!(feature.len(), 2);

        let main = list_commits_inner(path, Some(String::from("main")), 10, &runner)
            .await
            .unwrap();
        assert_eq!(main.len(), 1);
        assert_eq!(main[0].subject, "init");
    }

    #[tokio::test]
    async fn get_commit_diff_contains_show_output() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("demo");
        init_git_repo(&repo);
        std::fs::write(repo.join("hello.txt"), "hello\n").unwrap();
        let runner = GitRunner::new();
        let path = repo_path(&repo);
        stage_paths_inner(path, &[String::from("hello.txt")], &runner)
            .await
            .unwrap();
        commit_inner(path, String::from("add hello"), false, &runner)
            .await
            .unwrap();

        let rows = list_commits_inner(path, None, 1, &runner).await.unwrap();
        let diff = get_commit_diff_inner(path, &rows[0].hash, &runner)
            .await
            .unwrap();
        assert!(diff.contains("add hello"));
        assert!(diff.contains("hello.txt"));
        assert!(diff.contains("+hello"));
    }

    fn find_branch<'a>(rows: &'a [BranchRow], name: &str) -> &'a BranchRow {
        rows.iter()
            .find(|row| row.name == name)
            .unwrap_or_else(|| panic!("missing branch {name}"))
    }

    #[tokio::test]
    async fn list_branches_marks_current_main() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("demo");
        init_git_repo(&repo);
        let runner = GitRunner::new();
        let rows = list_branches_inner(repo_path(&repo), &runner)
            .await
            .unwrap();
        let main = find_branch(&rows, "main");
        assert!(!main.is_remote);
        assert!(main.is_current);
        assert_eq!(main.ahead, 0);
        assert_eq!(main.behind, 0);
    }

    #[tokio::test]
    async fn create_checkout_and_delete_branch() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("demo");
        init_git_repo(&repo);
        let runner = GitRunner::new();
        let path = repo_path(&repo);

        create_branch_inner(path, "feature", false, &runner)
            .await
            .unwrap();
        let rows = list_branches_inner(path, &runner).await.unwrap();
        assert!(find_branch(&rows, "main").is_current);
        assert!(!find_branch(&rows, "feature").is_current);

        checkout_branch_inner(path, "feature", &runner)
            .await
            .unwrap();
        let rows = list_branches_inner(path, &runner).await.unwrap();
        assert!(find_branch(&rows, "feature").is_current);

        checkout_branch_inner(path, "main", &runner).await.unwrap();
        delete_branch_inner(path, "feature", false, &runner)
            .await
            .unwrap();
        let rows = list_branches_inner(path, &runner).await.unwrap();
        assert!(rows.iter().all(|row| row.name != "feature"));
    }

    #[tokio::test]
    async fn create_branch_with_checkout_and_force_delete_unmerged() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("demo");
        init_git_repo(&repo);
        let runner = GitRunner::new();
        let path = repo_path(&repo);

        create_branch_inner(path, "wip", true, &runner)
            .await
            .unwrap();
        std::fs::write(repo.join("wip.txt"), "wip\n").unwrap();
        stage_paths_inner(path, &[String::from("wip.txt")], &runner)
            .await
            .unwrap();
        commit_inner(path, String::from("wip commit"), false, &runner)
            .await
            .unwrap();
        assert!(
            find_branch(&list_branches_inner(path, &runner).await.unwrap(), "wip").is_current
        );

        checkout_branch_inner(path, "main", &runner).await.unwrap();
        let err = delete_branch_inner(path, "wip", false, &runner)
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::GitFailed { code, .. } if code != 0));

        delete_branch_inner(path, "wip", true, &runner)
            .await
            .unwrap();
        let rows = list_branches_inner(path, &runner).await.unwrap();
        assert!(rows.iter().all(|row| row.name != "wip"));
    }

    #[tokio::test]
    async fn list_branches_includes_remote_and_ahead() {
        let dir = tempdir().unwrap();
        let repo = dir.path().join("demo");
        let bare = dir.path().join("remote.git");
        init_git_repo(&repo);
        let status = Command::new("git")
            .args(["init", "--bare", "-b", "main"])
            .arg(&bare)
            .status()
            .unwrap();
        assert!(status.success());
        let status = Command::new("git")
            .args(["remote", "add", "origin"])
            .arg(&bare)
            .current_dir(&repo)
            .status()
            .unwrap();
        assert!(status.success());
        let status = Command::new("git")
            .args(["push", "-u", "origin", "main"])
            .current_dir(&repo)
            .status()
            .unwrap();
        assert!(status.success());
        std::fs::write(repo.join("hello.txt"), "hello\n").unwrap();
        let runner = GitRunner::new();
        let path = repo_path(&repo);
        stage_paths_inner(path, &[String::from("hello.txt")], &runner)
            .await
            .unwrap();
        commit_inner(path, String::from("ahead"), false, &runner)
            .await
            .unwrap();

        let rows = list_branches_inner(path, &runner).await.unwrap();
        let main = find_branch(&rows, "main");
        assert_eq!(main.upstream.as_deref(), Some("origin/main"));
        assert_eq!(main.ahead, 1);
        assert_eq!(main.behind, 0);
        let remote = find_branch(&rows, "origin/main");
        assert!(remote.is_remote);
        assert!(!remote.is_current);
    }
}

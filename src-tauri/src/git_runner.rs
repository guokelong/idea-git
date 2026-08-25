use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::process::Command;
use tokio::sync::Mutex;

pub struct GitOutput {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
}

pub struct GitRunner {
    locks: Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>,
}

impl GitRunner {
    pub fn new() -> Self {
        Self {
            locks: Mutex::new(HashMap::new()),
        }
    }

    async fn lock_for(&self, repo: &Path) -> Arc<Mutex<()>> {
        let key = repo.to_path_buf();
        let mut map = self.locks.lock().await;
        map.entry(key)
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    pub async fn run(
        &self,
        repo_path: &Path,
        args: &[&str],
        timeout: Duration,
    ) -> Result<GitOutput, crate::error::AppError> {
        let lock = self.lock_for(repo_path).await;
        let _guard = lock.lock().await;
        log::info!("git {:?} in {:?}", args, repo_path);
        let mut cmd = Command::new("git");
        cmd.args(args).current_dir(repo_path);
        let child = cmd.output();
        match tokio::time::timeout(timeout, child).await {
            Err(_) => Err(crate::error::AppError::Timeout),
            Ok(Err(e)) if e.kind() == std::io::ErrorKind::NotFound => {
                Err(crate::error::AppError::GitNotFound)
            }
            Ok(Err(e)) => Err(crate::error::AppError::Io(e.to_string())),
            Ok(Ok(out)) => {
                let code = out.status.code().unwrap_or(-1);
                let stdout = String::from_utf8_lossy(&out.stdout).into_owned();
                let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
                log::info!("git exit {} stderr_len={}", code, stderr.len());
                Ok(GitOutput {
                    stdout,
                    stderr,
                    code,
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tempfile::tempdir;

    #[tokio::test]
    async fn runs_git_version() {
        let runner = GitRunner::new();
        let out = runner
            .run(Path::new("/"), &["--version"], Duration::from_secs(5))
            .await
            .expect("git should run");
        assert_eq!(out.code, 0);
        assert!(out.stdout.contains("git version") || out.stderr.contains("git version"));
    }

    #[tokio::test]
    async fn serializes_same_repo() {
        let dir = tempdir().unwrap();
        std::process::Command::new("git")
            .args(["init"])
            .current_dir(dir.path())
            .status()
            .unwrap();
        let runner = GitRunner::new();
        let p = dir.path().to_path_buf();
        let a = runner.run(&p, &["status", "--porcelain"], Duration::from_secs(5));
        let b = runner.run(&p, &["status", "--porcelain"], Duration::from_secs(5));
        let (ra, rb) = tokio::join!(a, b);
        assert!(ra.is_ok() && rb.is_ok());
    }
}

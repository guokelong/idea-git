use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    pub added_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoListItem {
    pub entry: RepoEntry,
    pub valid: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoStore {
    repos: Vec<RepoEntry>,
}

#[derive(Debug, Clone)]
pub struct RepoRegistry {
    file_path: PathBuf,
}

impl RepoRegistry {
    pub fn open(data_dir: PathBuf) -> Result<Self, AppError> {
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| AppError::Io(format!("创建数据目录失败: {e}")))?;
        Ok(Self {
            file_path: data_dir.join("repos.json"),
        })
    }

    pub fn load(&self) -> Result<Vec<RepoEntry>, AppError> {
        Ok(self.read_store()?.repos)
    }

    pub fn add(&self, path: PathBuf, name: Option<String>) -> Result<RepoEntry, AppError> {
        let canonical = canonicalize_repo_path(&path)?;
        validate_git_repo(&canonical)?;

        let mut store = self.read_store()?;
        let canonical_str = path_to_string(&canonical);
        if store.repos.iter().any(|e| e.path == canonical_str) {
            return Err(AppError::Message("仓库已存在".into()));
        }

        let name = name.unwrap_or_else(|| default_repo_name(&canonical));
        let entry = RepoEntry {
            id: Uuid::new_v4().to_string(),
            name,
            path: canonical_str,
            added_at: Utc::now().to_rfc3339(),
        };
        store.repos.push(entry.clone());
        self.write_store(&store)?;
        Ok(entry)
    }

    pub fn remove(&self, id: &str) -> Result<(), AppError> {
        let mut store = self.read_store()?;
        let len_before = store.repos.len();
        store.repos.retain(|e| e.id != id);
        if store.repos.len() == len_before {
            return Err(AppError::Message("仓库不存在".into()));
        }
        self.write_store(&store)?;
        Ok(())
    }

    pub fn update_path(&self, id: &str, new_path: PathBuf) -> Result<RepoEntry, AppError> {
        let canonical = canonicalize_repo_path(&new_path)?;
        validate_git_repo(&canonical)?;
        let canonical_str = path_to_string(&canonical);

        let mut store = self.read_store()?;
        if store
            .repos
            .iter()
            .any(|e| e.id != id && e.path == canonical_str)
        {
            return Err(AppError::Message("仓库已存在".into()));
        }

        let entry = store
            .repos
            .iter_mut()
            .find(|e| e.id == id)
            .ok_or_else(|| AppError::Message("仓库不存在".into()))?;
        entry.path = canonical_str;
        let updated = entry.clone();
        self.write_store(&store)?;
        Ok(updated)
    }

    pub fn list_with_validity(&self) -> Result<Vec<RepoListItem>, AppError> {
        let repos = self.load()?;
        Ok(repos
            .into_iter()
            .map(|entry| {
                let valid = is_valid_git_repo(Path::new(&entry.path));
                RepoListItem { entry, valid }
            })
            .collect())
    }

    fn read_store(&self) -> Result<RepoStore, AppError> {
        if !self.file_path.exists() {
            return Ok(RepoStore { repos: Vec::new() });
        }
        let content = std::fs::read_to_string(&self.file_path)
            .map_err(|e| AppError::Io(format!("读取仓库列表失败: {e}")))?;
        if content.trim().is_empty() {
            return Ok(RepoStore { repos: Vec::new() });
        }
        serde_json::from_str(&content)
            .map_err(|e| AppError::Io(format!("解析仓库列表失败: {e}")))
    }

    fn write_store(&self, store: &RepoStore) -> Result<(), AppError> {
        let content = serde_json::to_string_pretty(store)
            .map_err(|e| AppError::Io(format!("序列化仓库列表失败: {e}")))?;
        std::fs::write(&self.file_path, content)
            .map_err(|e| AppError::Io(format!("写入仓库列表失败: {e}")))
    }
}

fn canonicalize_repo_path(path: &Path) -> Result<PathBuf, AppError> {
    path.canonicalize()
        .map_err(|e| AppError::Io(format!("解析仓库路径失败: {e}")))
}

fn validate_git_repo(path: &Path) -> Result<(), AppError> {
    if is_valid_git_repo(path) {
        Ok(())
    } else {
        Err(AppError::Message("路径不是有效的 Git 仓库".into()))
    }
}

fn is_valid_git_repo(path: &Path) -> bool {
    path.is_dir() && path.join(".git").exists()
}

fn default_repo_name(path: &Path) -> String {
    path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("repo")
        .to_string()
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn init_git_repo(path: &Path) {
        std::fs::create_dir_all(path).unwrap();
        let status = Command::new("git")
            .args(["init"])
            .current_dir(path)
            .status()
            .unwrap();
        assert!(status.success());
    }

    #[test]
    fn add_list_remove_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let repo = dir.path().join("demo");
        init_git_repo(&repo);
        let reg = RepoRegistry::open(dir.path().join("data")).unwrap();
        let e = reg.add(repo.clone(), None).unwrap();
        assert_eq!(e.name, "demo");
        assert_eq!(reg.load().unwrap().len(), 1);
        reg.remove(&e.id).unwrap();
        assert!(reg.load().unwrap().is_empty());
    }

    #[test]
    fn add_rejects_duplicate_path() {
        let dir = tempfile::tempdir().unwrap();
        let repo = dir.path().join("demo");
        init_git_repo(&repo);
        let reg = RepoRegistry::open(dir.path().join("data")).unwrap();
        reg.add(repo.clone(), None).unwrap();
        let err = reg.add(repo, None).unwrap_err();
        assert!(matches!(err, AppError::Message(msg) if msg == "仓库已存在"));
    }

    #[test]
    fn list_with_validity_marks_missing_repo() {
        let dir = tempfile::tempdir().unwrap();
        let repo = dir.path().join("demo");
        init_git_repo(&repo);
        let reg = RepoRegistry::open(dir.path().join("data")).unwrap();
        let e = reg.add(repo.clone(), None).unwrap();
        std::fs::remove_dir_all(&repo).unwrap();
        let items = reg.list_with_validity().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].entry.id, e.id);
        assert!(!items[0].valid);
    }

    #[test]
    fn update_path_changes_entry() {
        let dir = tempfile::tempdir().unwrap();
        let repo_a = dir.path().join("a");
        let repo_b = dir.path().join("b");
        init_git_repo(&repo_a);
        init_git_repo(&repo_b);
        let reg = RepoRegistry::open(dir.path().join("data")).unwrap();
        let e = reg.add(repo_a, None).unwrap();
        let updated = reg.update_path(&e.id, repo_b.clone()).unwrap();
        assert_eq!(
            updated.path,
            repo_b.canonicalize().unwrap().to_string_lossy()
        );
        assert!(reg.list_with_validity().unwrap()[0].valid);
    }

    #[test]
    fn load_returns_empty_when_file_missing() {
        let dir = tempfile::tempdir().unwrap();
        let reg = RepoRegistry::open(dir.path().join("data")).unwrap();
        assert!(reg.load().unwrap().is_empty());
    }
}

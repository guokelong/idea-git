use std::path::PathBuf;
use std::sync::Mutex;

use tauri::State;

use crate::error::AppError;
use crate::repo_registry::{RepoEntry, RepoListItem, RepoRegistry};

fn lock_registry(registry: &Mutex<RepoRegistry>) -> Result<std::sync::MutexGuard<'_, RepoRegistry>, AppError> {
    registry
        .lock()
        .map_err(|e| AppError::Io(format!("仓库注册表锁失败: {e}")))
}

pub(crate) fn list_repos_inner(registry: &Mutex<RepoRegistry>) -> Result<Vec<RepoListItem>, AppError> {
    lock_registry(registry)?.list_with_validity()
}

pub(crate) fn add_repo_inner(
    registry: &Mutex<RepoRegistry>,
    path: String,
    name: Option<String>,
) -> Result<RepoEntry, AppError> {
    lock_registry(registry)?.add(PathBuf::from(path), name)
}

pub(crate) fn remove_repo_inner(registry: &Mutex<RepoRegistry>, id: &str) -> Result<(), AppError> {
    lock_registry(registry)?.remove(id)
}

pub(crate) fn relocate_repo_inner(
    registry: &Mutex<RepoRegistry>,
    id: &str,
    path: String,
) -> Result<RepoEntry, AppError> {
    lock_registry(registry)?.update_path(id, PathBuf::from(path))
}

#[tauri::command]
pub fn list_repos(registry: State<'_, Mutex<RepoRegistry>>) -> Result<Vec<RepoListItem>, AppError> {
    log::info!("list_repos enter");
    let result = list_repos_inner(&registry);
    match &result {
        Ok(items) => log::info!("list_repos exit count={}", items.len()),
        Err(e) => log::warn!("list_repos exit err={e}"),
    }
    result
}

#[tauri::command]
pub fn add_repo(
    path: String,
    name: Option<String>,
    registry: State<'_, Mutex<RepoRegistry>>,
) -> Result<RepoEntry, AppError> {
    log::info!("add_repo enter path={path} name={name:?}");
    let result = add_repo_inner(&registry, path, name);
    match &result {
        Ok(entry) => log::info!("add_repo exit id={}", entry.id),
        Err(e) => log::warn!("add_repo exit err={e}"),
    }
    result
}

#[tauri::command]
pub fn remove_repo(id: String, registry: State<'_, Mutex<RepoRegistry>>) -> Result<(), AppError> {
    log::info!("remove_repo enter id={id}");
    let result = remove_repo_inner(&registry, &id);
    match &result {
        Ok(()) => log::info!("remove_repo exit"),
        Err(e) => log::warn!("remove_repo exit err={e}"),
    }
    result
}

#[tauri::command]
pub fn relocate_repo(
    id: String,
    path: String,
    registry: State<'_, Mutex<RepoRegistry>>,
) -> Result<RepoEntry, AppError> {
    log::info!("relocate_repo enter id={id} path={path}");
    let result = relocate_repo_inner(&registry, &id, path);
    match &result {
        Ok(entry) => log::info!("relocate_repo exit path={}", entry.path),
        Err(e) => log::warn!("relocate_repo exit err={e}"),
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;
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
    }

    fn open_locked(dir: &Path) -> Mutex<RepoRegistry> {
        Mutex::new(RepoRegistry::open(dir.to_path_buf()).unwrap())
    }

    #[test]
    fn command_helpers_add_list_relocate_remove() {
        let dir = tempdir().unwrap();
        let repo_a = dir.path().join("a");
        let repo_b = dir.path().join("b");
        init_git_repo(&repo_a);
        init_git_repo(&repo_b);
        let registry = open_locked(&dir.path().join("data"));

        let entry = add_repo_inner(&registry, repo_a.to_string_lossy().into_owned(), None).unwrap();
        assert_eq!(entry.name, "a");

        let items = list_repos_inner(&registry).unwrap();
        assert_eq!(items.len(), 1);
        assert!(items[0].valid);

        let relocated =
            relocate_repo_inner(&registry, &entry.id, repo_b.to_string_lossy().into_owned()).unwrap();
        assert!(relocated.path.ends_with("b"));

        remove_repo_inner(&registry, &entry.id).unwrap();
        assert!(list_repos_inner(&registry).unwrap().is_empty());
    }
}

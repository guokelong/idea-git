mod commands;
mod error;
mod git_parse;
mod git_runner;
mod repo_registry;

use std::sync::Mutex;

use tauri::Manager;

use git_runner::GitRunner;
use repo_registry::RepoRegistry;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let registry = RepoRegistry::open(data_dir)?;
            app.manage(Mutex::new(registry));
            app.manage(GitRunner::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::repos::list_repos,
            commands::repos::add_repo,
            commands::repos::remove_repo,
            commands::repos::relocate_repo,
            commands::git::check_git,
            commands::git::get_repo_status,
            commands::git::get_diff,
            commands::git::get_diff_sides,
            commands::git::stage_paths,
            commands::git::unstage_paths,
            commands::git::commit,
            commands::git::push,
            commands::git::list_commits_to_push,
            commands::git::list_commits,
            commands::git::get_commit_diff,
            commands::git::list_commit_files,
            commands::git::get_commit_file_sides,
            commands::git::list_branches,
            commands::git::checkout_branch,
            commands::git::checkout_remote_branch,
            commands::git::create_branch,
            commands::git::create_branch_from,
            commands::git::delete_branch,
            commands::git::add_to_gitignore,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

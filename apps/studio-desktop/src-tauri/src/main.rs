use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn open_project_dialog() -> Result<String, String> {
    Err("Native directory dialog is not wired in v0.1 alpha yet. Paste a project path instead.".to_string())
}

#[tauri::command]
fn run_runtime_command(command: String, args: Vec<String>) -> Result<String, String> {
    run_runtime(&command, &args)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn initialize_project_memory(project_root: String, candidate_json: String) -> Result<String, String> {
    let temp_path = std::env::temp_dir().join(format!("praxis-candidate-{}.json", chrono_like_stamp()));
    fs::write(&temp_path, candidate_json).map_err(|error| error.to_string())?;
    run_runtime(
        "init-memory",
        &[
            "--root".to_string(),
            project_root,
            "--candidate".to_string(),
            temp_path.to_string_lossy().to_string(),
        ],
    )
}

#[tauri::command]
fn generate_task_from_plan(project_root: String, plan_json: String) -> Result<String, String> {
    let temp_path = std::env::temp_dir().join(format!("praxis-plan-{}.json", chrono_like_stamp()));
    fs::write(&temp_path, plan_json).map_err(|error| error.to_string())?;
    run_runtime(
        "generate-task",
        &[
            "--project-root".to_string(),
            project_root,
            "--plan".to_string(),
            temp_path.to_string_lossy().to_string(),
        ],
    )
}

fn run_runtime(command: &str, args: &[String]) -> Result<String, String> {
    let repo_root = find_repo_root().ok_or("Could not locate Praxis Studio repository root")?;
    let cli_path = repo_root.join("apps").join("runtime-cli").join("dist").join("index.js");
    if !cli_path.exists() {
        return Err(format!(
            "runtime-cli is not built at {}. Run npm run build -w @praxis/runtime-cli first.",
            cli_path.display()
        ));
    }
    let output = Command::new("node")
        .arg(cli_path)
        .arg(command)
        .args(args)
        .current_dir(repo_root)
        .output()
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        String::from_utf8(output.stdout).map_err(|error| error.to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn find_repo_root() -> Option<PathBuf> {
    let mut current = std::env::current_dir().ok()?;
    loop {
        if current.join("package.json").exists() && current.join("apps").join("runtime-cli").exists() {
            return Some(current);
        }
        if !current.pop() {
            return None;
        }
    }
}

fn chrono_like_stamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            app_version,
            open_project_dialog,
            run_runtime_command,
            read_file,
            write_file,
            initialize_project_memory,
            generate_task_from_plan
        ])
        .run(tauri::generate_context!())
        .expect("error while running Praxis Studio");
}

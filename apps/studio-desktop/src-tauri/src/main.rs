use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
async fn open_project_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let folder = app
        .dialog()
        .file()
        .set_title("Open Existing Project")
        .blocking_pick_folder();
    folder
        .map(|path| {
            path.into_path()
                .map(|path| path.to_string_lossy().to_string())
                .map_err(|error| error.to_string())
        })
        .transpose()
}

#[tauri::command]
fn run_runtime_command(app: tauri::AppHandle, command: String, args: Vec<String>) -> Result<String, String> {
    run_runtime(&app, &command, &args)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    let allowed_path = ensure_distinction_path(&path)?;
    fs::read_to_string(allowed_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    let allowed_path = ensure_distinction_path(&path)?;
    if let Some(parent) = allowed_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(allowed_path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn initialize_project_memory(app: tauri::AppHandle, project_root: String, candidate_json: String) -> Result<String, String> {
    let temp_path = std::env::temp_dir().join(format!("praxis-candidate-{}.json", chrono_like_stamp()));
    fs::write(&temp_path, candidate_json).map_err(|error| error.to_string())?;
    run_runtime(
        &app,
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
fn generate_task_from_plan(app: tauri::AppHandle, project_root: String, plan_json: String) -> Result<String, String> {
    let temp_path = std::env::temp_dir().join(format!("praxis-plan-{}.json", chrono_like_stamp()));
    fs::write(&temp_path, plan_json).map_err(|error| error.to_string())?;
    run_runtime(
        &app,
        "generate-task",
        &[
            "--project-root".to_string(),
            project_root,
            "--plan".to_string(),
            temp_path.to_string_lossy().to_string(),
        ],
    )
}

fn run_runtime(app: &tauri::AppHandle, command: &str, args: &[String]) -> Result<String, String> {
    let (cli_path, runtime_cwd) = locate_runtime_cli(app)?;
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
        .current_dir(runtime_cwd)
        .output()
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        String::from_utf8(output.stdout).map_err(|error| error.to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn locate_runtime_cli(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf), String> {
    if let Some(repo_root) = find_repo_root() {
        let cli_path = repo_root.join("apps").join("runtime-cli").join("dist").join("index.js");
        if cli_path.exists() {
            return Ok((cli_path, repo_root));
        }
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Could not locate app resource directory: {}", error))?;
    let candidates = [
        resource_dir.join("runtime-cli").join("dist").join("index.js"),
        resource_dir.join("dist").join("index.js"),
        resource_dir.join("index.js"),
    ];
    for candidate in candidates {
        if candidate.exists() {
            let cwd = candidate
                .parent()
                .map(|parent| parent.to_path_buf())
                .unwrap_or_else(|| resource_dir.clone());
            return Ok((candidate, cwd));
        }
    }

    Err(format!(
        "Could not locate runtime-cli. Checked repository root and resources under {}.",
        resource_dir.display()
    ))
}

fn ensure_distinction_path(input: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(input);
    let resolved = if path.exists() {
        fs::canonicalize(&path).map_err(|error| error.to_string())?
    } else {
        let parent = path
            .parent()
            .ok_or_else(|| "File path must have a parent directory.".to_string())?;
        let file_name = path
            .file_name()
            .ok_or_else(|| "File path must include a file name.".to_string())?;
        fs::canonicalize(parent)
            .map_err(|error| error.to_string())?
            .join(file_name)
    };
    let inside_distinction = resolved
        .components()
        .any(|component| component.as_os_str().to_string_lossy() == ".distinction");
    if inside_distinction {
        Ok(resolved)
    } else {
        Err("v0.1 file access is limited to the active project's .distinction directory.".to_string())
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
        .plugin(tauri_plugin_dialog::init())
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

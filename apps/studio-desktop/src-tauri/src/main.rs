use std::fs;
use std::path::{Component, Path, PathBuf};
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
fn read_file(project_root: String, relative_path: String) -> Result<String, String> {
    let allowed_path = ensure_distinction_path(&project_root, &relative_path)?;
    fs::read_to_string(allowed_path).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_file(project_root: String, relative_path: String, content: String) -> Result<(), String> {
    let allowed_path = ensure_distinction_path(&project_root, &relative_path)?;
    if let Some(parent) = allowed_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(allowed_path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn initialize_project_memory(app: tauri::AppHandle, project_root: String, candidate_json: String) -> Result<String, String> {
    let temp_path = std::env::temp_dir().join(format!("praxis-candidate-{}.json", chrono_like_stamp()));
    fs::write(&temp_path, candidate_json).map_err(|error| error.to_string())?;
    let result = run_runtime(
        &app,
        "init-memory",
        &[
            "--root".to_string(),
            project_root.clone(),
            "--candidate".to_string(),
            temp_path.to_string_lossy().to_string(),
        ],
    );
    if result.is_ok() {
        let _ = record_recent_project(&project_root);
    }
    result
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

#[tauri::command]
fn apply_plan_actions(app: tauri::AppHandle, project_root: String, plan_json: String, action_ids: Vec<String>) -> Result<String, String> {
    let temp_path = std::env::temp_dir().join(format!("praxis-apply-plan-{}.json", chrono_like_stamp()));
    fs::write(&temp_path, plan_json).map_err(|error| error.to_string())?;
    let mut args = vec![
        "--project-root".to_string(),
        project_root,
        "--plan".to_string(),
        temp_path.to_string_lossy().to_string(),
    ];
    if !action_ids.is_empty() {
        args.push("--actions".to_string());
        args.push(action_ids.join(","));
    }
    run_runtime(&app, "apply-plan", &args)
}

#[tauri::command]
fn import_task_result(app: tauri::AppHandle, project_root: String, result_json: String) -> Result<String, String> {
    let temp_path = std::env::temp_dir().join(format!("praxis-task-result-{}.json", chrono_like_stamp()));
    fs::write(&temp_path, result_json).map_err(|error| error.to_string())?;
    run_runtime(
        &app,
        "import-task-result",
        &[
            "--project-root".to_string(),
            project_root,
            "--result".to_string(),
            temp_path.to_string_lossy().to_string(),
        ],
    )
}

#[tauri::command]
fn create_project_from_plan(app: tauri::AppHandle, project_root: String, plan_json: String) -> Result<String, String> {
    let temp_path = std::env::temp_dir().join(format!("praxis-new-project-plan-{}.json", chrono_like_stamp()));
    fs::write(&temp_path, plan_json).map_err(|error| error.to_string())?;
    let result = run_runtime(
        &app,
        "create-project",
        &[
            "--root".to_string(),
            project_root.clone(),
            "--plan".to_string(),
            temp_path.to_string_lossy().to_string(),
        ],
    );
    if result.is_ok() {
        let _ = record_recent_project(&project_root);
    }
    result
}

#[tauri::command]
fn read_recent_projects() -> Result<String, String> {
    let path = recent_projects_path()?;
    if !path.exists() {
        return Ok("[]".to_string());
    }
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_recent_project(project_root: String) -> Result<String, String> {
    record_recent_project(&project_root)?;
    read_recent_projects()
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

fn ensure_distinction_path(project_root: &str, relative_path: &str) -> Result<PathBuf, String> {
    let relative = PathBuf::from(relative_path);
    if relative.is_absolute() {
        return Err("File access requires a project-relative path.".to_string());
    }
    if relative
        .components()
        .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_) | Component::RootDir))
    {
        return Err("File access path cannot escape the project root.".to_string());
    }
    let mut components = relative.components();
    let first = components
        .next()
        .ok_or_else(|| "File access path cannot be empty.".to_string())?;
    if first.as_os_str().to_string_lossy() != ".distinction" {
        return Err("v0.1 file access is limited to projectRoot/.distinction/**.".to_string());
    }

    let root = fs::canonicalize(project_root).map_err(|error| error.to_string())?;
    let distinction_root = root.join(".distinction");
    let path = root.join(relative);
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
    if resolved.starts_with(&distinction_root) {
        Ok(resolved)
    } else {
        Err("v0.1 file access is limited to projectRoot/.distinction/**.".to_string())
    }
}

fn record_recent_project(project_root: &str) -> Result<(), String> {
    let root = fs::canonicalize(project_root).unwrap_or_else(|_| PathBuf::from(project_root));
    let path = recent_projects_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let existing = if path.exists() {
        fs::read_to_string(&path).unwrap_or_else(|_| "[]".to_string())
    } else {
        "[]".to_string()
    };
    let mut projects: Vec<serde_json::Value> = serde_json::from_str(&existing).unwrap_or_default();
    let root_string = root.to_string_lossy().to_string();
    projects.retain(|project| project.get("root").and_then(|value| value.as_str()) != Some(root_string.as_str()));
    projects.insert(
        0,
        serde_json::json!({
            "root": root_string,
            "name": root.file_name().and_then(|value| value.to_str()).unwrap_or("Project"),
            "lastOpenedAt": iso_timestamp()
        }),
    );
    projects.truncate(12);
    fs::write(&path, serde_json::to_string_pretty(&projects).map_err(|error| error.to_string())?).map_err(|error| error.to_string())
}

fn recent_projects_path() -> Result<PathBuf, String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "Could not locate user home directory.".to_string())?;
    Ok(Path::new(&home).join(".praxis-studio").join("recent-projects.json"))
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

fn iso_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let seconds = duration.as_secs() as i64;
    let millis = duration.subsec_millis();
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{millis:03}Z")
}

fn civil_from_days(days_since_epoch: i64) -> (i64, u32, u32) {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let mut year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    if month <= 2 {
        year += 1;
    }
    (year, month as u32, day as u32)
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
            generate_task_from_plan,
            apply_plan_actions,
            import_task_result,
            create_project_from_plan,
            read_recent_projects,
            write_recent_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running Praxis Studio");
}

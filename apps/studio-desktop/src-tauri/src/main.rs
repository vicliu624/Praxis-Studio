#[tauri::command]
fn app_version() -> String { env!("CARGO_PKG_VERSION").to_string() }
#[tauri::command]
fn initialize_project_memory(project_root: String) -> Result<String, String> { Ok(format!("Initialized project memory at {}/.distinction", project_root)) }
fn main() { tauri::Builder::default().invoke_handler(tauri::generate_handler![app_version, initialize_project_memory]).run(tauri::generate_context!()).expect("error while running Praxis Studio"); }

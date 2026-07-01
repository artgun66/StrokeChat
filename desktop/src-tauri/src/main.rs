// Prevent a console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod supervisor;

use std::sync::Mutex;
use tauri::{Manager, RunEvent};
use supervisor::Supervisor;

fn main() {
    tauri::Builder::default()
        .manage(Mutex::new(Supervisor::new()))
        .setup(|app| {
            let handle = app.handle().clone();
            // Boot the sidecars off the UI thread; the window shows splash/index.html until ready.
            std::thread::spawn(move || {
                let resource_dir = handle
                    .path()
                    .resource_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("."));
                let data_dir = handle
                    .path()
                    .app_data_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("."))
                    .join("data");

                // Clone the supervisor handle out of state, then release the lock before booting.
                let sup = {
                    let guard = handle.state::<Mutex<Supervisor>>();
                    let s = guard.lock().unwrap();
                    s.clone()
                };

                match sup.start(&resource_dir, data_dir) {
                    Ok(port) => {
                        if let Some(win) = handle.get_webview_window("main") {
                            let url = format!("http://127.0.0.1:{port}/");
                            if let Ok(u) = url.parse() {
                                let _ = win.navigate(u);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[supervisor] FATAL: {e}");
                        if let Some(win) = handle.get_webview_window("main") {
                            let safe = e.replace('`', "'").replace('\\', "/");
                            let _ = win.eval(&format!(
                                "document.body.innerHTML = \
                                 '<div style=\"font:14px system-ui;color:#e6edf3;background:#0d1520;\
                                 height:100vh;display:flex;align-items:center;justify-content:center;\
                                 padding:2rem;text-align:center\">Local LLM failed to start:<br><br>{safe}</div>'"
                            ));
                        }
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building Local LLM")
        .run(|handle, event| {
            // Orderly sidecar shutdown on quit (kills llama-server grandchildren too).
            if let RunEvent::ExitRequested { .. } = event {
                if let Some(state) = handle.try_state::<Mutex<Supervisor>>() {
                    if let Ok(sup) = state.lock() {
                        sup.shutdown();
                    }
                }
            }
        });
}

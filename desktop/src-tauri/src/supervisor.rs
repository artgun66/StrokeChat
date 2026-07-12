//! Process supervisor for the desktop app.
//!
//! Behavioral spec mirrors `scripts/dev.sh` (do not require users to run it): on launch,
//! ensure the data dir, run migrations + seed the catalog, then start the Django backend,
//! the task worker, the BiomedParse sidecar, and the Next.js standalone server — each on
//! 127.0.0.1. Backend/BiomedParse use fixed ports (8000/8001) with conflict detection
//! because the backend port is baked into the frontend bundle; the frontend gets a free
//! port. On quit, every child (including the `llama-server` grandchildren the backend
//! spawns) is terminated.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub const BACKEND_PORT: u16 = 8000;
pub const BIOMED_PORT: u16 = 8001;
pub const VESSEL_PORT: u16 = 8002;

/// Filesystem locations, resolved for dev (running from the repo) or bundled (staged under
/// the app's resource dir). Mirrors `scripts/stage-resources.sh`.
struct Paths {
    backend_dir: PathBuf,
    backend_python: PathBuf,
    biomed_dir: PathBuf,
    biomed_python: PathBuf,
    /// Directory containing the Next standalone `server.js`.
    frontend_server_dir: PathBuf,
    node_bin: PathBuf,
    llama_binary: PathBuf,
    bundled_models_dir: PathBuf,
    data_dir: PathBuf,
    vessel_dir: PathBuf,
    vessel_python: PathBuf,
}

fn os_dir() -> &'static str {
    if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") { "darwin-arm64" } else { "darwin-x64" }
    } else if cfg!(target_os = "windows") {
        "win-x64"
    } else {
        "linux-x64"
    }
}

fn exe(name: &str) -> String {
    if cfg!(target_os = "windows") { format!("{name}.exe") } else { name.to_string() }
}

impl Paths {
    /// `resource_dir` is the app's bundled resources dir; `data_dir` is the per-user dir.
    fn resolve(resource_dir: &Path, data_dir: PathBuf) -> Paths {
        let staged = resource_dir.join("staged");
        let bundled_backend_py = staged.join("python-backend").join("bin").join(exe("python3"));

        if bundled_backend_py.exists() {
            // Packaged layout.
            Paths {
                backend_dir: staged.join("backend"),
                backend_python: bundled_backend_py,
                biomed_dir: staged.join("biomedparse_service"),
                biomed_python: staged.join("python-biomedparse").join("bin").join(exe("python3")),
                vessel_dir: staged.join("vessel_service"),
                vessel_python: staged.join("python-vessel").join("bin").join(exe("python3")),
                frontend_server_dir: staged.join("frontend").join("apps").join("product"),
                node_bin: staged.join("bin").join(os_dir()).join(exe("node")),
                llama_binary: staged.join("bin").join(os_dir()).join(exe("llama-server")),
                bundled_models_dir: staged.join("models"),
                data_dir,
            }
        } else {
            // Dev layout: resolve against the repo root (src-tauri/../..).
            let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent().unwrap().parent().unwrap().to_path_buf();
            Paths {
                backend_dir: repo.join("backend"),
                backend_python: repo.join("backend").join(".venv").join("bin").join("python"),
                biomed_dir: repo.join("biomedparse_service"),
                biomed_python: repo.join("biomedparse_service").join(".venv").join("bin").join("python"),
                vessel_dir: repo.join("vessel_service"),
                vessel_python: repo.join("vessel_service").join(".venv").join("bin").join("python"),
                frontend_server_dir: repo.join("frontend").join("apps").join("product")
                    .join(".next").join("standalone").join("apps").join("product"),
                node_bin: PathBuf::from("node"), // dev: from PATH
                llama_binary: PathBuf::from("llama-server"), // dev: brew on PATH
                bundled_models_dir: repo.join("desktop").join("resources").join("models"),
                data_dir,
            }
        }
    }

    fn backend_env(&self) -> Vec<(String, String)> {
        let db = self.data_dir.join("local.sqlite3");
        let gpu_layers = std::env::var("LLAMACPP_N_GPU_LAYERS")
            .unwrap_or_else(|_| if cfg!(target_os = "macos") { "999".into() } else { "0".into() });
        vec![
            ("DJANGO_SETTINGS_MODULE".into(), "config.settings.desktop".into()),
            ("DATA_DIR".into(), self.data_dir.to_string_lossy().into()),
            ("DATABASE_URL".into(), format!("sqlite:///{}", db.to_string_lossy())),
            ("BUNDLED_MODELS_DIR".into(), self.bundled_models_dir.to_string_lossy().into()),
            ("LLAMA_SERVER_BINARY".into(), self.llama_binary.to_string_lossy().into()),
            ("LLAMACPP_N_GPU_LAYERS".into(), gpu_layers),
            ("BIOMEDPARSE_SERVICE_URL".into(), format!("http://127.0.0.1:{BIOMED_PORT}")),
            ("VESSEL_SERVICE_URL".into(), format!("http://127.0.0.1:{VESSEL_PORT}")),
            ("PYTHONUNBUFFERED".into(), "1".into()),
        ]
    }
}

#[derive(Clone)]
pub struct Supervisor {
    children: Arc<Mutex<Vec<Child>>>,
}

impl Supervisor {
    pub fn new() -> Supervisor {
        Supervisor { children: Arc::new(Mutex::new(Vec::new())) }
    }

    /// Run the full boot sequence. Returns the frontend port to navigate the webview to.
    pub fn start(&self, resource_dir: &Path, data_dir: PathBuf) -> Result<u16, String> {
        std::fs::create_dir_all(&data_dir).map_err(|e| format!("create data dir: {e}"))?;
        let paths = Paths::resolve(resource_dir, data_dir);

        if !paths.backend_python.exists() {
            return Err(format!("backend python not found at {}", paths.backend_python.display()));
        }
        // 1. Fixed-port conflict detection (the frontend bundle targets BACKEND_PORT).
        ensure_port_free(BACKEND_PORT)?;
        ensure_port_free(BIOMED_PORT)?;
        ensure_port_free(VESSEL_PORT)?;
        let frontend_port = pick_free_port()?;

        // 2. Embedded DB → migrations → seed catalog → register bundled models (blocks).
        run_to_completion(
            Command::new(&paths.backend_python)
                .args(["manage.py", "seed_desktop"])
                .current_dir(&paths.backend_dir)
                .envs(paths.backend_env()),
            "seed_desktop",
        )?;

        // 3. Backend (ASGI).
        self.spawn(
            Command::new(&paths.backend_python)
                .args(["-m", "uvicorn", "config.asgi:application", "--host", "127.0.0.1",
                       "--port", &BACKEND_PORT.to_string()])
                .current_dir(&paths.backend_dir)
                .envs(paths.backend_env()),
        )?;

        // 4. Worker (separate process; SQLite WAL + optimistic claim make this safe).
        self.spawn(
            Command::new(&paths.backend_python)
                .args(["manage.py", "run_worker"])
                .current_dir(&paths.backend_dir)
                .envs(paths.backend_env()),
        )?;

        // 5. BiomedParse sidecar (optional — skip if its runtime isn't present).
        if paths.biomed_python.exists() {
            self.spawn(
                Command::new(&paths.biomed_python)
                    .args(["-m", "uvicorn", "app:app", "--host", "127.0.0.1",
                           "--port", &BIOMED_PORT.to_string(),
                           "--app-dir", &paths.biomed_dir.to_string_lossy()])
                    .current_dir(&paths.biomed_dir)
                    .env("PYTHONUNBUFFERED", "1"),
            )?;
        } else {
            eprintln!("[supervisor] BiomedParse runtime missing — segmentation disabled");
        }

        // 5b. Vessel segmentation sidecar (optional — skip if runtime or weights absent).
        let vessel_weights = std::env::var("VESSEL_WEIGHTS_DIR")
            .unwrap_or_else(|_| paths.data_dir.join("vessel_weights").to_string_lossy().into());
        if paths.vessel_python.exists() {
            self.spawn(
                Command::new(&paths.vessel_python)
                    .args(["-m", "uvicorn", "app:app", "--host", "127.0.0.1",
                           "--port", &VESSEL_PORT.to_string(),
                           "--app-dir", &paths.vessel_dir.to_string_lossy()])
                    .current_dir(&paths.vessel_dir)
                    .env("PYTHONUNBUFFERED", "1")
                    .env("VESSEL_WEIGHTS_DIR", &vessel_weights),
            )?;
        } else {
            eprintln!("[supervisor] Vessel segmentation runtime missing — vessel analysis disabled");
        }

        // 6. Next.js standalone server (free port).
        self.spawn(
            Command::new(&paths.node_bin)
                .arg("server.js")
                .current_dir(&paths.frontend_server_dir)
                .env("PORT", frontend_port.to_string())
                .env("HOSTNAME", "127.0.0.1")
                .env("NODE_ENV", "production"),
        )?;

        // 7. Gate on health before the webview navigates.
        wait_http_ok("127.0.0.1", BACKEND_PORT, "/healthz", Duration::from_secs(120))
            .map_err(|e| format!("backend: {e}"))?;
        wait_http_ok("127.0.0.1", frontend_port, "/", Duration::from_secs(60))
            .map_err(|e| format!("frontend: {e}"))?;

        Ok(frontend_port)
    }

    fn spawn(&self, cmd: &mut Command) -> Result<(), String> {
        let child = configure_group(cmd)
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| format!("spawn failed: {e}"))?;
        self.children.lock().unwrap().push(child);
        Ok(())
    }

    /// Terminate every child and its process group (catches llama-server grandchildren).
    pub fn shutdown(&self) {
        let mut children = self.children.lock().unwrap();
        for child in children.iter_mut() {
            kill_tree(child);
        }
        children.clear();
    }
}

// ---- helpers ----------------------------------------------------------------

fn run_to_completion(cmd: &mut Command, name: &str) -> Result<(), String> {
    let status = cmd
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|e| format!("{name} failed to run: {e}"))?;
    if !status.success() {
        return Err(format!("{name} exited with {status}"));
    }
    Ok(())
}

fn ensure_port_free(port: u16) -> Result<(), String> {
    match TcpListener::bind(("127.0.0.1", port)) {
        Ok(l) => { drop(l); Ok(()) }
        Err(_) => Err(format!(
            "port {port} is already in use. Close the other app using it and relaunch."
        )),
    }
}

fn pick_free_port() -> Result<u16, String> {
    let l = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| format!("pick port: {e}"))?;
    let port = l.local_addr().map_err(|e| e.to_string())?.port();
    drop(l);
    Ok(port)
}

/// Poll an HTTP endpoint until it returns "200", or time out.
fn wait_http_ok(host: &str, port: u16, path: &str, timeout: Duration) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    loop {
        if http_ok(host, port, path) {
            return Ok(());
        }
        if Instant::now() > deadline {
            return Err(format!("timed out waiting for http://{host}:{port}{path}"));
        }
        std::thread::sleep(Duration::from_millis(500));
    }
}

fn http_ok(host: &str, port: u16, path: &str) -> bool {
    let Ok(mut stream) = TcpStream::connect((host, port)) else { return false };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let req = format!("GET {path} HTTP/1.0\r\nHost: {host}\r\nConnection: close\r\n\r\n");
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0u8; 64];
    let Ok(n) = stream.read(&mut buf) else { return false };
    let head = String::from_utf8_lossy(&buf[..n]);
    head.contains(" 200")
}

// ---- platform process-group handling ----------------------------------------

#[cfg(unix)]
fn configure_group(cmd: &mut Command) -> &mut Command {
    use std::os::unix::process::CommandExt;
    // New session/process group so the child leads its own group; grandchildren (e.g.
    // llama-server spawned by the backend) inherit it and die when we kill the group.
    unsafe {
        cmd.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }
    cmd
}

#[cfg(not(unix))]
fn configure_group(cmd: &mut Command) -> &mut Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    cmd.creation_flags(CREATE_NEW_PROCESS_GROUP);
    cmd
}

#[cfg(unix)]
fn kill_tree(child: &mut Child) {
    // killpg on the child's pid (== its pgid after setsid) reaps the whole tree.
    let pid = child.id() as i32;
    unsafe {
        libc::killpg(pid, libc::SIGTERM);
    }
    // Give it a moment, then SIGKILL the group as a backstop.
    std::thread::sleep(Duration::from_millis(300));
    unsafe {
        libc::killpg(pid, libc::SIGKILL);
    }
    let _ = child.wait();
}

#[cfg(not(unix))]
fn kill_tree(child: &mut Child) {
    // taskkill /T terminates the whole tree; fall back to Child::kill.
    let _ = Command::new("taskkill")
        .args(["/PID", &child.id().to_string(), "/T", "/F"])
        .status();
    let _ = child.kill();
    let _ = child.wait();
}

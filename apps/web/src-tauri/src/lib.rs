use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_positioner::{Position, WindowExt};

#[tauri::command]
fn update_tray_title(app: AppHandle, title: String) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_title(Some(&title));
    }
    Ok(())
}

#[tauri::command]
fn clear_tray_title(app: AppHandle) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_title(None::<&str>);
    }
    Ok(())
}

#[tauri::command]
fn hide_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    Ok(())
}

#[tauri::command]
fn set_pinned(state: tauri::State<'_, Arc<AtomicBool>>, pinned: bool) -> Result<(), String> {
    state.store(pinned, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
}

#[tauri::command]
async fn clickup_request(
    client: tauri::State<'_, reqwest::Client>,
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
) -> Result<String, String> {
    let mut req = match method.to_uppercase().as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        other => return Err(format!("Unsupported method: {}", other)),
    };

    for (k, v) in headers {
        req = req.header(k, v);
    }

    if let Some(b) = body {
        req = req.body(b);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("ClickUp API Error ({}): {}", status, text));
    }

    Ok(text)
}

fn extract_code_from_request(req: &str) -> Option<String> {
    let first_line = req.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;
    let query = path.split('?').nth(1)?;
    for param in query.split('&') {
        if let Some((key, val)) = param.split_once('=') {
            if key == "code" {
                return Some(val.to_string());
            }
        }
    }
    None
}

fn handle_stream(mut stream: std::net::TcpStream, app_handle: &AppHandle) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));

    let mut buffer = [0; 4096];
    let bytes_read = match stream.read(&mut buffer) {
        Ok(n) => n,
        Err(_) => return,
    };
    if bytes_read == 0 {
        return;
    }

    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let first_line = request.lines().next().unwrap_or("");

    // Ignore favicon requests
    if first_line.contains("/favicon.ico") {
        let not_found = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        let _ = stream.write_all(not_found.as_bytes());
        return;
    }

    if let Some(code) = extract_code_from_request(&request) {
        let html = r#"<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Connected to ClickUp</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #1e293b; border: 1px solid #334155; padding: 36px 32px; border-radius: 16px; text-align: center; max-width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .badge { width: 48px; height: 48px; background: #10b981; border-radius: 12px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; }
    h2 { margin: 0 0 10px 0; font-size: 20px; }
    p { color: #94a3b8; font-size: 14px; margin: 0; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✓</div>
    <h2>Connected to ClickUp!</h2>
    <p>Authorization successful. You can close this tab and return to ClickUp Lite.</p>
  </div>
  <script>setTimeout(() => window.close(), 1200);</script>
</body>
</html>"#;
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            html.len(),
            html
        );
        let _ = stream.write_all(response.as_bytes());
        let _ = stream.flush();

        // Emit both event names and both payload formats for complete client compatibility
        let _ = app_handle.emit("oauth-code", code.clone());
        let _ = app_handle.emit("oauth-code-received", serde_json::json!({ "code": code }));

        if let Some(window) = app_handle.get_webview_window("main") {
            let _ = window.move_window(Position::TrayCenter);
            let _ = window.show();
            let _ = window.set_focus();
        }
    } else {
        let html = r#"<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>ClickUp Lite</title></head>
<body style="font-family: sans-serif; background: #0f172a; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
  <div style="background: #1e293b; padding: 24px; border-radius: 12px; text-align: center; max-width: 360px;">
    <h3 style="margin-top: 0;">Authorization Callback</h3>
    <p style="color: #94a3b8; font-size: 14px;">No authorization code detected in URL.</p>
  </div>
</body>
</html>"#;
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            html.len(),
            html
        );
        let _ = stream.write_all(response.as_bytes());
        let _ = stream.flush();
    }
}

fn start_oauth_listener(app_handle: AppHandle) {
    // 1. Listen on IPv4 (127.0.0.1:3456)
    let app_ipv4 = app_handle.clone();
    thread::spawn(move || {
        match TcpListener::bind("127.0.0.1:3456") {
            Ok(listener) => {
                for stream in listener.incoming() {
                    if let Ok(stream) = stream {
                        let app = app_ipv4.clone();
                        thread::spawn(move || {
                            handle_stream(stream, &app);
                        });
                    }
                }
            }
            Err(e) => {
                eprintln!("Failed to bind IPv4 OAuth listener on 127.0.0.1:3456: {}", e);
            }
        }
    });

    // 2. Listen on IPv6 ([::1]:3456) for modern macOS browsers resolving localhost to IPv6
    let app_ipv6 = app_handle.clone();
    thread::spawn(move || {
        if let Ok(listener) = TcpListener::bind("[::1]:3456") {
            for stream in listener.incoming() {
                if let Ok(stream) = stream {
                    let app = app_ipv6.clone();
                    thread::spawn(move || {
                        handle_stream(stream, &app);
                    });
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let http_client = reqwest::Client::builder()
        .user_agent("ClickUpLite/1.0 (Macintosh; Intel Mac OS X)")
        .tcp_keepalive(Some(Duration::from_secs(60)))
        .pool_idle_timeout(Some(Duration::from_secs(90)))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let is_pinned = Arc::new(AtomicBool::new(false));

    tauri::Builder::default()
        .manage(http_client)
        .manage(is_pinned.clone())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[cfg(target_os = "macos")]
            {
                // Set macOS accessory policy: hides app from Dock and Cmd+Tab
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            // Start loopback server for ClickUp OAuth callback on localhost:3456
            start_oauth_listener(app.handle().clone());

            // Build Right-Click Context Menu for the Tray
            let show_i = MenuItem::with_id(app, "toggle_window", "Open / Close Panel", true, None::<&str>)?;
            let sync_i = MenuItem::with_id(app, "sync_clickup", "Sync with ClickUp", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit_app", "Quit ClickUp Lite", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_i, &sync_i, &quit_i])?;

            // Create menubar tray icon
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-icon.png")).expect("missing tray icon");
            let _tray = tauri::tray::TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .icon_as_template(true)
                .tooltip("ClickUp Lite")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "toggle_window" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let is_visible = window.is_visible().unwrap_or(false);
                                if is_visible {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.move_window(Position::TrayCenter);
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                        "sync_clickup" => {
                            let _ = app.emit("tray-sync-requested", ());
                        }
                        "quit_app" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.move_window(Position::TrayCenter);
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Hide window on blur (clicking outside the popup) ONLY IF NOT PINNED
            if let Some(window) = app.get_webview_window("main") {
                let win_clone = window.clone();
                let pinned_state = is_pinned.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        if !pinned_state.load(Ordering::SeqCst) {
                            let _ = win_clone.hide();
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            update_tray_title,
            clear_tray_title,
            hide_window,
            set_pinned,
            open_external_url,
            clickup_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

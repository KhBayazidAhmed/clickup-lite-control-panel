use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;
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

fn extract_code_from_request(req: &str) -> Option<String> {
    let first_line = req.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;
    let query = path.split('?').nth(1)?;
    for param in query.split('&') {
        let mut parts = param.split('=');
        if let (Some(key), Some(val)) = (parts.next(), parts.next()) {
            if key == "code" {
                return Some(val.to_string());
            }
        }
    }
    None
}

fn start_oauth_listener(app_handle: AppHandle) {
    thread::spawn(move || {
        let listener = match TcpListener::bind("127.0.0.1:3456") {
            Ok(l) => l,
            Err(e) => {
                log::warn!("Failed to bind OAuth listener on 127.0.0.1:3456: {}", e);
                return;
            }
        };

        for stream in listener.incoming() {
            if let Ok(mut stream) = stream {
                let mut buffer = [0; 2048];
                if let Ok(bytes_read) = stream.read(&mut buffer) {
                    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
                    if let Some(code) = extract_code_from_request(&request) {
                        let response_body = r#"<!DOCTYPE html>
<html>
<head><title>Connected to ClickUp</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #0f172a; color: #ffffff;">
  <div style="background: #1e293b; padding: 32px; border-radius: 16px; text-align: center; max-width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #334155;">
    <div style="width: 48px; height: 48px; background: #3b82f6; border-radius: 12px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px;">✓</div>
    <h2 style="color: #f8fafc; margin: 0 0 8px 0;">Connected to ClickUp!</h2>
    <p style="color: #94a3b8; font-size: 14px; line-height: 1.5; margin: 0 0 16px 0;">Authentication complete. You can close this tab and return to the ClickUp Lite Control Panel.</p>
  </div>
  <script>setTimeout(() => window.close(), 1200);</script>
</body>
</html>"#;
                        let response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            response_body.len(),
                            response_body
                        );
                        let _ = stream.write_all(response.as_bytes());
                        let _ = stream.flush();

                        // Notify frontend
                        let _ = app_handle.emit("oauth-code", code);

                        // Bring window to front
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
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

            // Create menubar tray icon
            let icon = app.default_window_icon().cloned().expect("missing default window icon");
            let _tray = tauri::tray::TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .icon_as_template(true)
                .tooltip("ClickUp Lite")
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

            // Hide window on blur (clicking outside the popup)
            if let Some(window) = app.get_webview_window("main") {
                let win_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        let _ = win_clone.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            update_tray_title,
            clear_tray_title,
            hide_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

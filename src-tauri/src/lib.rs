use std::str::FromStr;
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(
      tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
          if event.state() == ShortcutState::Pressed {
            let f11 = Shortcut::from_str("F11").unwrap();
            if shortcut == &f11 {
              if let Some(window) = app.get_webview_window("main") {
                let is_fs = window.is_fullscreen().unwrap_or(false);
                let _ = window.set_fullscreen(!is_fs);
              }
            }
          }
        })
        .build(),
    )
    .setup(|app| {
      if let Ok(f11) = Shortcut::from_str("F11") {
        let _ = app.global_shortcut().register(f11);
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

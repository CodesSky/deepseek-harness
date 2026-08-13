//! macOS App Bundle entry: thin Tauri host around the embedded `dsh web` install.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  deepseek_harness_shell_lib::run()
}

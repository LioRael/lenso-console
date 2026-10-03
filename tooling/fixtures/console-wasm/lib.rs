//! Compile the complete production Plugin; no authentication or route features are removed.
pub use lenso_console_plugin::{ConsolePlugin, ConsolePluginConfig};

#[cfg(target_arch = "wasm32")]
mod activation;

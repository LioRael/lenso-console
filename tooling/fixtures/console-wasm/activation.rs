//! Execute production lifecycle in Wasm with the portable conformance Driver.
//! No fake filesystem, HTTP adapter, authentication, or generated Host is supplied.
use lenso::ConfiguredPluginFactory;
use lenso_app_plan::{AppComposition, CapabilityEndpointPlan, PluginInstancePlan};
use lenso_capability_http_endpoint::{self as http, EndpointProvider};
use lenso_capability_http_stream_endpoint as stream;
use lenso_console_plugin::{ConsoleConfig, ConsolePlugin, ConsolePluginConfig};
use lenso_kernel::{CancellationToken, DeterministicDriver, InvocationContext, Kernel};
use lenso_native_adapter::NativePluginRegistry;

std::thread_local! {
    static FAILURE: RefCell<String> = const { RefCell::new(String::new()) };
}

#[unsafe(no_mangle)]
pub extern "C" fn console_wasm_failure_byte(index: u32) -> u32 {
    FAILURE.with(|value| {
        value
            .borrow()
            .as_bytes()
            .get(index as usize)
            .map_or(0, |byte| u32::from(*byte))
    })
}
use std::{
    cell::RefCell,
    future::Future,
    path::Path,
    rc::Rc,
    task::{Context, Poll, Waker},
};

fn complete<F: Future>(future: F) -> Option<F::Output> {
    let mut future = std::pin::pin!(future);
    match future
        .as_mut()
        .poll(&mut Context::from_waker(Waker::noop()))
    {
        Poll::Ready(value) => Some(value),
        Poll::Pending => None,
    }
}

// This ABI belongs only to the acceptance consumer, never to the product Plugin.
#[unsafe(no_mangle)]
pub extern "C" fn console_std_root_is_absolute() -> u32 {
    u32::from(Path::new("/").is_absolute())
}

#[unsafe(no_mangle)]
pub extern "C" fn console_wasm_activate(case: u32) -> u32 {
    let mut config = ConsolePluginConfig::defaults();
    config.web_root = "embedded:".into();
    if case == 1 {
        config.agent_home = "/relay/agent".into();
        config.managed_app_root = "/relay/apps".into();
        config.agent_configuration_store = "/relay/config.sqlite3".into();
    }
    let Ok(projected) = ConsoleConfig::from_plugin(&config) else {
        return 1;
    };
    if case == 1
        && (projected.agent_home != Path::new("/relay/agent")
            || projected.managed_app_root != Path::new("/relay/apps")
            || projected.agent_configuration_store != Path::new("/relay/config.sqlite3"))
    {
        return 2;
    }
    for field in 0..3 {
        let mut invalid = projected.clone();
        match field {
            0 => invalid.agent_home = "relative".into(),
            1 => invalid.managed_app_root = "relative".into(),
            _ => invalid.agent_configuration_store = "relative".into(),
        }
        if invalid.validate().is_ok() {
            return 3 + field;
        }
    }
    let instance = PluginInstancePlan::new("lenso.console.web/default", "lenso.console.web")
        .with_configuration(serde_json::to_string(&config).unwrap())
        .with_capability(CapabilityEndpointPlan::new(
            http::CAPABILITY_ID,
            http::DESCRIPTOR_VERSION,
            [http::DESCRIBE_OPERATION, http::HANDLE_OPERATION],
        ))
        .with_capability(
            CapabilityEndpointPlan::new(
                stream::CAPABILITY_ID,
                stream::DESCRIPTOR_VERSION,
                [stream::DESCRIBE_OPERATION, stream::HANDLE_OPERATION],
            )
            .with_stream_operation(stream::HANDLE_OPERATION),
        );
    let Ok(plan) = AppComposition::new(vec![instance], vec![]).resolve() else {
        return 6;
    };
    let retained = Rc::new(RefCell::new(None));
    let capture = retained.clone();
    let registry = NativePluginRegistry::new().with_factory(ConfiguredPluginFactory::new(
        move |plugin: &mut ConsolePlugin| {
            capture.borrow_mut().replace(plugin.clone());
            Ok(())
        },
    ));
    let driver = DeterministicDriver::new();
    let _app = match driver.run(Kernel::start_native(plan, driver.clone(), registry)) {
        Ok(app) => app,
        Err(error) => {
            FAILURE.with(|value| *value.borrow_mut() = format!("{error:?}"));
            return 7;
        }
    };
    let plugin = retained.borrow().clone().unwrap();
    let response = complete(plugin.handle(
        InvocationContext::new(1, None, CancellationToken::new()),
        http::HandleRequest {
            route_id: "console.health.live".into(),
            request_id: "wasm-activate".into(),
            method: "GET".into(),
            path: "/health/live".into(),
            path_parameters: vec![],
            query: None,
            headers: vec![],
            credential: None,
            body: vec![].into(),
        },
    ));
    match response {
        Some(Ok(Ok(response))) if response.status == 200 => 0,
        _ => 8,
    }
}

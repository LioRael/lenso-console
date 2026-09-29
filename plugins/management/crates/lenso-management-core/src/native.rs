//! Native Host assembly for an explicitly selected Management Plugin Instance.
use crate::{Error, Management, ServiceProvider};
use lenso_capability_management as contract;
use lenso_kernel::{InvocationContext, NativeRequestFuture, RuntimeFailure};
use lenso_native_adapter::{NativePluginFactory, NativePluginFactoryContext, NativePluginInstance};
use std::{cell::RefCell, collections::BTreeMap, rc::Rc};

/// One deployment and one generation. The Host installs the service after typed ports bind.
#[derive(Clone, Debug)]
pub struct ProviderSlot {
    deployment: String,
    service: Rc<RefCell<Option<Rc<Management>>>>,
}
impl ProviderSlot {
    pub fn new(deployment: String) -> Result<Self, Error> {
        if deployment.is_empty() || deployment.len() > 128 {
            return Err(Error::InvalidInput);
        }
        Ok(Self {
            deployment,
            service: Rc::new(RefCell::new(None)),
        })
    }
    pub fn install(&self, service: Rc<Management>) -> Result<(), Error> {
        if service.deployment != self.deployment || self.service.borrow().is_some() {
            return Err(Error::Conflict);
        }
        *self.service.borrow_mut() = Some(service);
        Ok(())
    }
    fn provider(&self) -> Option<ServiceProvider> {
        self.service.borrow().as_ref().cloned().map(ServiceProvider)
    }
}
impl contract::ManagementProvider for ProviderSlot {
    fn catalog(
        &self,
        context: InvocationContext,
        request: contract::CatalogRequest,
    ) -> NativeRequestFuture<contract::ManagementCatalog> {
        self.provider().map_or_else(
            || {
                Box::pin(std::future::ready(Ok(Err(
                    contract::CatalogError::Unavailable,
                )))) as NativeRequestFuture<contract::ManagementCatalog>
            },
            |provider| provider.catalog(context, request),
        )
    }
    fn invoke(
        &self,
        context: InvocationContext,
        request: contract::InvokeRequest,
    ) -> NativeRequestFuture<contract::ManagementInvoke> {
        self.provider().map_or_else(
            || {
                Box::pin(std::future::ready(Ok(Err(
                    contract::InvokeError::Unavailable,
                )))) as NativeRequestFuture<contract::ManagementInvoke>
            },
            |provider| provider.invoke(context, request),
        )
    }
    fn status(
        &self,
        context: InvocationContext,
        request: contract::StatusRequest,
    ) -> NativeRequestFuture<contract::ManagementStatus> {
        self.provider().map_or_else(
            || {
                Box::pin(std::future::ready(Ok(Err(
                    contract::StatusError::Unavailable,
                )))) as NativeRequestFuture<contract::ManagementStatus>
            },
            |provider| provider.status(context, request),
        )
    }
}

/// Register this factory only in a Host that explicitly selects Management.
/// Package discovery and capability bindings still use the ordinary resolved App Plan.
#[derive(Clone, Debug)]
pub struct NativeManagementFactory {
    slots: BTreeMap<String, ProviderSlot>,
}
impl NativeManagementFactory {
    pub fn new(slots: BTreeMap<String, ProviderSlot>) -> Self {
        Self { slots }
    }
}
impl NativePluginFactory for NativeManagementFactory {
    fn package_id(&self) -> &'static str {
        "lenso.management"
    }
    fn package_version(&self) -> &'static str {
        env!("CARGO_PKG_VERSION")
    }
    fn instantiate(
        &self,
        context: NativePluginFactoryContext<'_>,
    ) -> Result<NativePluginInstance, RuntimeFailure> {
        let slot = self.slots.get(context.instance_key()).cloned().ok_or(
            RuntimeFailure::ProtocolViolation {
                capability: contract::CAPABILITY_ID,
            },
        )?;
        Ok(NativePluginInstance::new(vec![Rc::new(
            contract::ManagementEndpoint::new(slot),
        )]))
    }
}

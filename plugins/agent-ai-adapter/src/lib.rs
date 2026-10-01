//! Bounded admission core for the optional AI adapter.
//! No ingress, credentials, Session writer or automatic grants are installed.
//! Production wiring must supply verified Host caller identity, a trusted token
//! upper bound and a durable budget ledger; this in-memory ledger is a testable
//! single-process slice, not restart-safe account billing.

use std::{
    collections::BTreeSet,
    sync::{Arc, Mutex},
};

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct HostCaller {
    pub consumer: String,
    pub user: String,
    pub project: String,
}

#[derive(Clone, Debug)]
pub struct Price {
    pub version: String,
    /// Integer budget units per token; zero is allowed only when explicitly known.
    pub input: u64,
    pub output: u64,
}

#[derive(Clone, Debug)]
pub struct PurposeProfile {
    pub callers: BTreeSet<HostCaller>,
    pub model: String,
    pub price: Option<Price>,
    pub budget: u64,
    pub max_output: u64,
    pub concurrency: usize,
}

#[derive(Debug, PartialEq)]
pub enum Rejection {
    Unauthorized,
    Model,
    UnknownPrice,
    UnmeteredInput,
    Limit,
    Budget,
    Concurrency,
    Provider,
    Evidence,
    Ledger,
}

pub struct CompletionRequest {
    pub model: String,
    pub prompt: String,
    pub max_output: u64,
}

pub struct ProviderReply {
    pub actual_model: String,
    pub price_version: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub text: String,
}

/// A trusted Host adapter, never a token estimate supplied by a consuming Plugin.
pub trait CompletionProvider {
    fn input_upper_bound(&self, prompt: &str) -> Option<u64>;
    fn complete(&self, request: &CompletionRequest) -> Result<ProviderReply, Rejection>;
}

pub struct RunEvidence {
    pub caller: HostCaller,
    pub admitted_model: String,
    pub actual_model: String,
    pub price_version: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub charged: u64,
}

#[derive(Default)]
struct Ledger {
    committed: u64,
    active: usize,
}

pub struct CompletionAdmission {
    profile: PurposeProfile,
    ledger: Arc<Mutex<Ledger>>,
}

struct Reservation {
    ledger: Arc<Mutex<Ledger>>,
    amount: u64,
}

impl Drop for Reservation {
    fn drop(&mut self) {
        if let Ok(mut ledger) = self.ledger.lock() {
            ledger.active -= 1;
        }
        // Unknown usage or provider failure keeps the entire reservation charged.
    }
}

impl CompletionAdmission {
    pub fn new(profile: PurposeProfile) -> Self {
        Self {
            profile,
            ledger: Arc::new(Mutex::new(Ledger::default())),
        }
    }

    /// Host must verify realm/audience and derive `caller` before this method.
    /// No Session identity or writer is accepted by this completion-only path.
    pub fn complete(
        &self,
        caller: &HostCaller,
        request: &CompletionRequest,
        provider: &impl CompletionProvider,
    ) -> Result<(String, RunEvidence), Rejection> {
        if !self.profile.callers.contains(caller) {
            return Err(Rejection::Unauthorized);
        }
        if request.model != self.profile.model {
            return Err(Rejection::Model);
        }
        if request.max_output == 0 || request.max_output > self.profile.max_output {
            return Err(Rejection::Limit);
        }
        let price = self
            .profile
            .price
            .as_ref()
            .filter(|p| !p.version.is_empty())
            .ok_or(Rejection::UnknownPrice)?;
        let input = provider
            .input_upper_bound(&request.prompt)
            .ok_or(Rejection::UnmeteredInput)?;
        let amount = cost(price, input, request.max_output)?;
        let reservation = self.reserve(amount)?;
        let reply = provider.complete(request)?;
        if reply.actual_model != request.model
            || reply.price_version != price.version
            || reply.input_tokens > input
            || reply.output_tokens > request.max_output
        {
            return Err(Rejection::Evidence);
        }
        let charged = cost(price, reply.input_tokens, reply.output_tokens)?;
        {
            let mut ledger = self.ledger.lock().map_err(|_| Rejection::Ledger)?;
            ledger.committed -= reservation.amount - charged;
        }
        Ok((
            reply.text,
            RunEvidence {
                caller: caller.clone(),
                admitted_model: request.model.clone(),
                actual_model: reply.actual_model,
                price_version: reply.price_version,
                input_tokens: reply.input_tokens,
                output_tokens: reply.output_tokens,
                charged,
            },
        ))
    }

    fn reserve(&self, amount: u64) -> Result<Reservation, Rejection> {
        let mut ledger = self.ledger.lock().map_err(|_| Rejection::Ledger)?;
        if ledger.active >= self.profile.concurrency {
            return Err(Rejection::Concurrency);
        }
        let total = ledger
            .committed
            .checked_add(amount)
            .ok_or(Rejection::Budget)?;
        if total > self.profile.budget {
            return Err(Rejection::Budget);
        }
        ledger.committed = total;
        ledger.active += 1;
        Ok(Reservation {
            ledger: Arc::clone(&self.ledger),
            amount,
        })
    }
}

fn cost(price: &Price, input: u64, output: u64) -> Result<u64, Rejection> {
    input
        .checked_mul(price.input)
        .and_then(|a| {
            output
                .checked_mul(price.output)
                .and_then(|b| a.checked_add(b))
        })
        .ok_or(Rejection::Budget)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    struct Synthetic {
        calls: Cell<usize>,
        measured: bool,
        actual: &'static str,
    }
    impl CompletionProvider for Synthetic {
        fn input_upper_bound(&self, _: &str) -> Option<u64> {
            self.measured.then_some(4)
        }
        fn complete(&self, _: &CompletionRequest) -> Result<ProviderReply, Rejection> {
            self.calls.set(self.calls.get() + 1);
            Ok(ProviderReply {
                actual_model: self.actual.into(),
                price_version: "v1".into(),
                input_tokens: 3,
                output_tokens: 2,
                text: "answer".into(),
            })
        }
    }
    fn caller() -> HostCaller {
        HostCaller {
            consumer: "plugin-a".into(),
            user: "alice".into(),
            project: "one".into(),
        }
    }
    fn profile() -> PurposeProfile {
        PurposeProfile {
            callers: [caller()].into(),
            model: "synthetic".into(),
            price: Some(Price {
                version: "v1".into(),
                input: 2,
                output: 3,
            }),
            budget: 100,
            max_output: 10,
            concurrency: 1,
        }
    }
    fn request() -> CompletionRequest {
        CompletionRequest {
            model: "synthetic".into(),
            prompt: "hello".into(),
            max_output: 10,
        }
    }
    fn provider() -> Synthetic {
        Synthetic {
            calls: Cell::new(0),
            measured: true,
            actual: "synthetic",
        }
    }

    #[test]
    fn completion_records_exact_model_price_and_run_only_evidence() {
        let adapter = CompletionAdmission::new(profile());
        let provider = provider();
        let (text, evidence) = adapter.complete(&caller(), &request(), &provider).unwrap();
        assert_eq!(text, "answer");
        assert_eq!(evidence.charged, 12);
        assert_eq!(evidence.actual_model, "synthetic");
        assert_eq!(evidence.price_version, "v1");
        assert_eq!(evidence.caller.project, "one");
        assert_eq!(provider.calls.get(), 1);
    }
    #[test]
    fn caller_model_price_meter_and_budget_fail_before_invocation() {
        let provider = provider();
        for altered in [
            HostCaller {
                consumer: "plugin-b".into(),
                ..caller()
            },
            HostCaller {
                user: "bob".into(),
                ..caller()
            },
            HostCaller {
                project: "two".into(),
                ..caller()
            },
        ] {
            assert!(matches!(
                CompletionAdmission::new(profile()).complete(&altered, &request(), &provider),
                Err(Rejection::Unauthorized)
            ));
        }
        let mut req = request();
        req.model = "fallback".into();
        assert!(matches!(
            CompletionAdmission::new(profile()).complete(&caller(), &req, &provider),
            Err(Rejection::Model)
        ));
        let mut p = profile();
        p.price = None;
        assert!(matches!(
            CompletionAdmission::new(p).complete(&caller(), &request(), &provider),
            Err(Rejection::UnknownPrice)
        ));
        let mut p = profile();
        p.budget = 37;
        assert!(matches!(
            CompletionAdmission::new(p).complete(&caller(), &request(), &provider),
            Err(Rejection::Budget)
        ));
        assert_eq!(provider.calls.get(), 0);
        let unmetered = Synthetic {
            measured: false,
            ..provider
        };
        assert!(matches!(
            CompletionAdmission::new(profile()).complete(&caller(), &request(), &unmetered),
            Err(Rejection::UnmeteredInput)
        ));
        assert_eq!(unmetered.calls.get(), 0);
    }
    #[test]
    fn failed_evidence_keeps_reservation_and_releases_concurrency() {
        let adapter = CompletionAdmission::new(profile());
        let wrong = Synthetic {
            actual: "fallback",
            ..provider()
        };
        assert!(matches!(
            adapter.complete(&caller(), &request(), &wrong),
            Err(Rejection::Evidence)
        ));
        assert_eq!(adapter.ledger.lock().unwrap().committed, 38);
        let reservation = adapter.reserve(38).unwrap();
        assert!(matches!(adapter.reserve(1), Err(Rejection::Concurrency)));
        drop(reservation);
        assert!(matches!(adapter.reserve(25), Err(Rejection::Budget)));
        assert!(adapter.reserve(1).is_ok());
    }
    #[test]
    fn arithmetic_overflow_is_never_free() {
        assert_eq!(
            cost(
                &Price {
                    version: "v".into(),
                    input: u64::MAX,
                    output: 1
                },
                2,
                1
            ),
            Err(Rejection::Budget)
        );
    }
}

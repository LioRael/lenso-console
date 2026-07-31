create schema if not exists console;

create table if not exists console.managed_services (
    service_id text primary key,
    service_principal text not null unique,
    base_url text not null,
    enrollment_receipt_digest text not null,
    enrollment_grant_revision bigint not null check (enrollment_grant_revision > 0),
    authorization_epoch bigint not null check (authorization_epoch >= 0),
    enrollment_expires_at_unix_ms bigint not null check (enrollment_expires_at_unix_ms > 0),
    enrollment_state text not null check (enrollment_state in ('active', 'revoked')),
    core_document jsonb,
    core_observed_at timestamptz,
    connection_state text not null default 'never_observed'
        check (connection_state in ('never_observed', 'ready', 'unavailable', 'incompatible')),
    last_error_code text,
    version bigint not null default 1 check (version > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (
        (core_document is null and core_observed_at is null)
        or (core_document is not null and core_observed_at is not null)
    )
);

create index if not exists managed_services_connection_idx
    on console.managed_services (enrollment_state, connection_state, service_id);

create table if not exists console.system_registry_audit (
    id bigserial primary key,
    service_id text,
    event_type text not null,
    actor_user_id text not null,
    evidence jsonb not null,
    occurred_at timestamptz not null default now()
);

create index if not exists system_registry_audit_service_idx
    on console.system_registry_audit (service_id, id);

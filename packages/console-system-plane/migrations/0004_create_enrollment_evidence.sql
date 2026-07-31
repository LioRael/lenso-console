create schema if not exists console;

create table if not exists console.enrollment_offers (
    offer_digest text primary key check (offer_digest ~ '^sha256:[0-9a-f]{64}$'),
    nonce text not null unique,
    offer jsonb not null,
    expires_at_unix_ms bigint not null check (expires_at_unix_ms > 0),
    created_by text not null,
    accepted_service_id text unique,
    accepted_at timestamptz,
    created_at timestamptz not null default now(),
    check (
        (accepted_service_id is null and accepted_at is null)
        or (accepted_service_id is not null and accepted_at is not null)
    )
);

create index if not exists enrollment_offers_expiry_idx
    on console.enrollment_offers (expires_at_unix_ms, offer_digest);

create table if not exists console.enrollment_records (
    service_id text primary key references console.managed_services(service_id),
    system_id text not null,
    managed_service_revision text not null,
    offer_digest text not null unique references console.enrollment_offers(offer_digest),
    offer jsonb not null,
    receipt jsonb not null,
    service_verifying_key_id text not null,
    service_verifying_key_base64url text not null,
    granted_capabilities jsonb not null,
    granted_policy jsonb not null,
    created_at timestamptz not null default now()
);

create table if not exists console.managed_service_enrollment_exchanges (
    managed_service_id text primary key
        references console.managed_services(service_id) on delete restrict,
    system_id text not null,
    offer_digest text not null unique,
    receipt_digest text not null unique,
    nonce text not null unique,
    offer jsonb not null,
    receipt jsonb not null,
    created_at timestamptz not null default now()
);

create index if not exists managed_service_enrollment_system_idx
    on console.managed_service_enrollment_exchanges (system_id, managed_service_id);

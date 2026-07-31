create schema if not exists console;

create table if not exists console.runtime_observation_projections (
    service_id text primary key,
    service_revision text not null,
    contract_id text not null,
    schema_digest text not null,
    snapshot_revision text not null,
    cursor text not null,
    observed_at timestamptz not null,
    collected_at timestamptz not null,
    freshness_state text not null check (freshness_state in ('current', 'stale', 'expired')),
    collection_state text not null check (collection_state in ('ready', 'gap', 'unavailable')),
    snapshot jsonb not null,
    last_evidence_gap jsonb,
    last_failure_code text,
    version bigint not null default 1 check (version > 0),
    updated_at timestamptz not null default now()
);

create index if not exists runtime_observation_projection_collection_idx
    on console.runtime_observation_projections (collection_state, freshness_state, service_id);

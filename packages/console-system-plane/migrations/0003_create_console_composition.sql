create schema if not exists console;

create table if not exists console.service_composition (
    singleton boolean primary key default true check (singleton),
    revision bigint not null check (revision > 0),
    composition_digest text not null check (composition_digest ~ '^sha256:[0-9a-f]{64}$'),
    document jsonb not null,
    updated_at timestamptz not null default now()
);

create table if not exists console.composition_history (
    revision bigint primary key check (revision > 0),
    plan_digest text not null unique check (plan_digest ~ '^sha256:[0-9a-f]{64}$'),
    composition_digest text not null check (composition_digest ~ '^sha256:[0-9a-f]{64}$'),
    document jsonb not null,
    applied_at timestamptz not null default now()
);

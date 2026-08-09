create schema if not exists console;

create table if not exists console.console_administrators (
    user_id text primary key,
    role text not null check (role in ('superadmin', 'administrator')),
    source text not null check (source in ('local_recovery', 'administrative')),
    created_by text not null,
    created_at timestamptz not null
);

create unique index if not exists console_one_superadmin
    on console.console_administrators (role)
    where role = 'superadmin';

create table if not exists console.managed_service_access_grants (
    id text primary key,
    subject_type text not null check (subject_type in ('user', 'organization')),
    subject_id text not null,
    service_id text not null check (service_id <> 'lenso-console'),
    capabilities jsonb not null check (
        jsonb_typeof(capabilities) = 'array'
        and jsonb_array_length(capabilities) > 0
    ),
    created_by text not null,
    created_at timestamptz not null,
    revoked_at timestamptz,
    revision bigint not null default 1 check (revision > 0)
);

create unique index if not exists managed_service_access_grants_active_key
    on console.managed_service_access_grants (subject_type, subject_id, service_id)
    where revoked_at is null;

create index if not exists managed_service_access_grants_user_lookup
    on console.managed_service_access_grants (subject_id, service_id)
    where subject_type = 'user' and revoked_at is null;

create index if not exists managed_service_access_grants_organization_lookup
    on console.managed_service_access_grants (subject_id, service_id)
    where subject_type = 'organization' and revoked_at is null;

create table if not exists console.managed_service_access_grant_audit (
    id text primary key,
    grant_id text not null,
    action text not null check (action in ('created', 'revoked')),
    actor_user_id text not null,
    occurred_at timestamptz not null,
    details jsonb not null default '{}'::jsonb
);

create index if not exists managed_service_access_grant_audit_grant_idx
    on console.managed_service_access_grant_audit (grant_id, occurred_at);

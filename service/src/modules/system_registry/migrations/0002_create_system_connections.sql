create table if not exists console.system_connections (
    system_id text primary key,
    topology_digest text not null,
    topology jsonb not null,
    management_binding jsonb not null,
    version bigint not null default 1 check (version > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists system_connections_updated_idx
    on console.system_connections (updated_at desc, system_id);

create table if not exists console.workload_control_operations (
    system_id text not null references console.system_connections(system_id) on delete cascade,
    service_id text not null,
    workload_id text not null,
    operation_id text not null,
    adapter_id text not null,
    topology_digest text not null,
    adapter_target_fingerprint text not null,
    operation_record jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (system_id, service_id, workload_id, operation_id),
    unique (system_id, adapter_id, operation_id)
);

create index if not exists workload_control_operations_created_idx
    on console.workload_control_operations (created_at desc);

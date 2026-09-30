const VERSION = 1;
const done = () => ({ kind: "done" });
const failure = (error = "unavailable") => ({ error });
const label = (value, length = 128) =>
  typeof value === "string" && value.length > 0 && value.length <= length;
const json = (value) => JSON.stringify(value);
const mutation = (result) => {
  if (
    result?.success !== true ||
    !Number.isSafeInteger(result.meta?.changes) ||
    result.meta.changes < 0 ||
    result.meta.changes > 1
  ) {
    throw new Error("uncertain_d1_mutation_receipt");
  }
  return result.meta.changes;
};
const mutations = (results, count) => {
  if (!Array.isArray(results) || results.length !== count) {
    throw new Error("uncertain_d1_batch_receipt");
  }
  results.forEach(mutation);
};

const rowRecord = (row) => {
  if (!row) {
    return failure("not_found");
  }
  const record = JSON.parse(row.record_json);
  record.execution_until_ms = row.execution_until_ms;
  return { kind: "record", value: record };
};

// Operator-only setup. This function is never called by create() or a runtime request.
export async function setup(database) {
  mutations(
    await database.batch([
      database.prepare(
        `CREATE TABLE management_storage_version(singleton INTEGER PRIMARY KEY CHECK(singleton=1),version INTEGER NOT NULL)`
      ),
      database.prepare(
        `INSERT INTO management_storage_version VALUES(1,${VERSION})`
      ),
      database.prepare(`CREATE TABLE management_journal(deployment TEXT NOT NULL,operation_id TEXT NOT NULL,
      subject TEXT NOT NULL,entry_id TEXT NOT NULL,idempotency_key TEXT NOT NULL,record_json TEXT NOT NULL,
      execution_until_ms INTEGER,transition_token TEXT,PRIMARY KEY(deployment,operation_id),
      UNIQUE(deployment,subject,entry_id,idempotency_key))`),
      database.prepare(`CREATE TABLE management_outbox(sequence INTEGER PRIMARY KEY AUTOINCREMENT,deployment TEXT NOT NULL,
      operation_id TEXT NOT NULL,phase TEXT NOT NULL,event_json TEXT NOT NULL,sent INTEGER NOT NULL DEFAULT 0,
      UNIQUE(deployment,operation_id,phase),
      FOREIGN KEY(deployment,operation_id) REFERENCES management_journal(deployment,operation_id))`),
      database.prepare(`CREATE TABLE qualified_operators(deployment TEXT NOT NULL,subject TEXT NOT NULL,
      PRIMARY KEY(deployment,subject))`),
    ]),
    5
  );
}

// Only the explicit private operator receives this function, never a public route.
export async function grant(database, deployment, subject) {
  if (!label(deployment) || !label(subject, 256)) {
    throw new Error("invalid_qualification");
  }
  const session = database.withSession("first-primary");
  const version = await session
    .prepare("SELECT version FROM management_storage_version WHERE singleton=1")
    .first();
  if (version?.version !== VERSION) {
    throw new Error("setup_required");
  }
  mutation(
    await session
      .prepare("INSERT OR IGNORE INTO qualified_operators VALUES(?,?)")
      .bind(deployment, subject)
      .run()
  );
}
export async function revoke(database, deployment, subject) {
  if (!label(deployment) || !label(subject, 256)) {
    throw new Error("invalid_qualification");
  }
  mutation(
    await database
      .withSession("first-primary")
      .prepare(
        "DELETE FROM qualified_operators WHERE deployment=? AND subject=?"
      )
      .bind(deployment, subject)
      .run()
  );
}

export function create(database, scope, configuration) {
  if (
    configuration?.profile !== "workers-d1" ||
    Object.keys(configuration).some((key) => key !== "profile") ||
    typeof database?.withSession !== "function" ||
    typeof scope?.run !== "function"
  ) {
    throw new Error("invalid_management_storage_facility");
  }
  // A new causal session belongs to this one event. No journal fact is held in memory.
  const session = database.withSession("first-primary");
  const statement = (sql, ...values) => session.prepare(sql).bind(...values);
  const select = (deployment, operation) =>
    statement(
      "SELECT record_json,execution_until_ms FROM management_journal WHERE deployment=? AND operation_id=?",
      deployment,
      operation
    ).first();
  const pending = (deployment, operation) =>
    statement(
      `UPDATE management_journal SET record_json=
    json_set(record_json,'$.response.audit_pending',json(CASE WHEN EXISTS(
      SELECT 1 FROM management_outbox WHERE deployment=? AND operation_id=? AND sent=0)
      THEN 'true' ELSE 'false' END)) WHERE deployment=? AND operation_id=?`,
      deployment,
      operation,
      deployment,
      operation
    );
  const insertEvent = (deployment, event, token) =>
    statement(
      `INSERT OR IGNORE INTO management_outbox(deployment,operation_id,phase,event_json)
    SELECT deployment,operation_id,?,? FROM management_journal WHERE deployment=? AND operation_id=?
      ${token === undefined ? "" : "AND transition_token=?"}`,
      event.phase,
      json(event),
      deployment,
      event.intent.operation_id,
      ...(token === undefined ? [] : [token])
    );
  const execute = (work) =>
    scope.run(async () => {
      try {
        return await work();
      } catch {
        return failure();
      }
    });
  return Object.freeze({
    call(request) {
      return execute(async () => {
        if (request?.action === "inspect") {
          const row = await session
            .prepare(
              "SELECT version FROM management_storage_version WHERE singleton=1"
            )
            .first();
          return row?.version === VERSION ? { kind: "ready" } : failure();
        }
        if (!label(request?.deployment)) {
          return failure("invalid_input");
        }
        const { deployment } = request;
        if (request.action === "reserve") {
          const { record } = request;
          const operation = record?.response?.operation_id;
          if (
            !label(operation, 256) ||
            !label(request.key) ||
            !label(record.subject, 256) ||
            !label(record.entry_id) ||
            !["ready", "pending_approval"].includes(record.response.state)
          ) {
            return failure("invalid_input");
          }
          mutation(
            await statement(
              `INSERT OR IGNORE INTO management_journal(deployment,operation_id,subject,entry_id,idempotency_key,record_json)
            VALUES(?,?,?,?,?,?)`,
              deployment,
              operation,
              record.subject,
              record.entry_id,
              request.key,
              json(record)
            ).run()
          );
          return rowRecord(
            await statement(
              `SELECT record_json,execution_until_ms FROM management_journal
            WHERE deployment=? AND subject=? AND entry_id=? AND idempotency_key=?`,
              deployment,
              record.subject,
              record.entry_id,
              request.key
            ).first()
          );
        }
        if (request.action === "enqueue") {
          const { event } = request,
            operation = event?.intent?.operation_id;
          if (
            event?.intent?.deployment !== deployment ||
            !label(operation, 256) ||
            !label(event.phase, 256)
          ) {
            return failure("invalid_input");
          }
          mutations(
            await session.batch([
              insertEvent(deployment, event),
              pending(deployment, operation),
            ]),
            2
          );
          return done();
        }
        const operation = request.operation_id;
        if (!label(operation, 256)) {
          return failure("invalid_input");
        }
        switch (request.action) {
          case "load": {
            return rowRecord(await select(deployment, operation));
          }
          case "claim": {
            const now = Date.now();
            if (
              request.response?.state !== "executing" ||
              request.response.operation_id !== operation ||
              !Number.isSafeInteger(request.execution_until_ms) ||
              request.execution_until_ms <= now ||
              request.execution_until_ms > now + 30_000
            ) {
              return failure("unavailable");
            }
            const result = await statement(
              `UPDATE management_journal SET record_json=json_set(record_json,'$.response',json(?)),
              execution_until_ms=?,transition_token=NULL WHERE deployment=? AND operation_id=?
              AND json_extract(record_json,'$.response.state') IN ('ready','pending_approval')`,
              json(request.response),
              request.execution_until_ms,
              deployment,
              operation
            ).run();
            return { kind: "claimed", value: mutation(result) === 1 };
          }
          case "complete": {
            const { event } = request,
              response = { ...request.response, audit_pending: true };
            if (
              event?.intent?.operation_id !== operation ||
              event.intent.deployment !== deployment ||
              response.operation_id !== operation ||
              event.state !== response.state ||
              !["completed", "reconciled"].includes(event.phase)
            ) {
              return failure("invalid_input");
            }
            const token = json(event);
            const predecessor =
              event.phase === "completed" ? "executing" : "unknown";
            // Insert only the event belonging to the successful CAS. A late completion
            // cannot replace a confirmed receipt or a recovery transition.
            mutations(
              await session.batch([
                statement(
                  `UPDATE management_journal SET record_json=json_set(record_json,'$.response',json(?)),
                execution_until_ms=NULL,transition_token=? WHERE deployment=? AND operation_id=?
                AND json_extract(record_json,'$.response.state')=?`,
                  json(response),
                  token,
                  deployment,
                  operation,
                  predecessor
                ),
                insertEvent(deployment, event, token),
                pending(deployment, operation),
              ]),
              3
            );
            return done();
          }
          case "recover": {
            const { event } = request,
              until = request.execution_until_ms;
            if (
              !Number.isSafeInteger(until) ||
              until > Date.now() ||
              event?.intent?.operation_id !== operation ||
              event.intent.deployment !== deployment ||
              event.phase !== "interrupted" ||
              event.state !== "unknown"
            ) {
              return failure("invalid_input");
            }
            const token = json(event);
            mutations(
              await session.batch([
                statement(
                  `UPDATE management_journal SET record_json=json_set(record_json,'$.response.state','unknown',
                '$.response.audit_pending',json('true')),execution_until_ms=NULL,transition_token=?
                WHERE deployment=? AND operation_id=? AND execution_until_ms=?
                AND json_extract(record_json,'$.response.state')='executing'`,
                  token,
                  deployment,
                  operation,
                  until
                ),
                insertEvent(deployment, event, token),
                pending(deployment, operation),
              ]),
              3
            );
            return rowRecord(await select(deployment, operation));
          }
          case "pending_events": {
            const rows = await statement(
              "SELECT event_json FROM management_outbox WHERE deployment=? AND operation_id=? AND sent=0 ORDER BY sequence",
              deployment,
              operation
            ).all();
            return {
              kind: "events",
              value: rows.results.map((row) => JSON.parse(row.event_json)),
            };
          }
          case "acknowledge": {
            if (!label(request.phase, 256)) {
              return failure("invalid_input");
            }
            mutation(
              await statement(
                "UPDATE management_outbox SET sent=1 WHERE deployment=? AND operation_id=? AND phase=?",
                deployment,
                operation,
                request.phase
              ).run()
            );
            return done();
          }
          case "refresh_audit": {
            mutation(await pending(deployment, operation).run());
            return done();
          }
          default: {
            return failure("invalid_input");
          }
        }
      });
    },
    profile: "workers-d1",
    qualifies(deployment, subject) {
      if (!label(deployment) || !label(subject, 256)) {
        return Promise.resolve(failure("invalid_input"));
      }
      return execute(async () => {
        const row = await statement(
          "SELECT 1 AS qualified FROM qualified_operators WHERE deployment=? AND subject=?",
          deployment,
          subject
        ).first();
        return { qualified: row?.qualified === 1 };
      });
    },
  });
}

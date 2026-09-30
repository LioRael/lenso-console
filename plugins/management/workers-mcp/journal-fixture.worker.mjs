import {
  create,
  setup,
  grant,
  revoke,
} from "../crates/lenso-management-core/src/workers/journal.mjs";
// Test-only receipt corruption follows the real committed D1 mutation.
function receiptFault(database, fault) {
  const corrupt = (result) =>
    fault === "missing"
      ? { ...result, meta: {} }
      : fault === "failed"
        ? { ...result, success: false }
        : { ...result, meta: { ...result.meta, changes: 2 } };
  return {
    withSession(mode) {
      const session = database.withSession(mode);
      const wrap = (statement) =>
        new Proxy(statement, {
          get(target, key) {
            if (key === "bind") {
              return (...args) => wrap(target.bind(...args));
            }
            if (key === "run") {
              return async () => corrupt(await target.run());
            }
            const value = target[key];
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      return {
        batch: async (statements) => {
          const replies = await session.batch(statements);
          return replies.map(corrupt);
        },
        prepare: (sql) => wrap(session.prepare(sql)),
      };
    },
  };
}
export default {
  async fetch(request, env) {
    const input = await request.json();
    if (input.operator === "setup") {
      await setup(env.DB);
      return Response.json({ setup: true });
    }
    if (input.operator === "grant") {
      await grant(env.DB, input.deployment, input.subject);
      return Response.json({ granted: true });
    }
    if (input.operator === "revoke") {
      await revoke(env.DB, input.deployment, input.subject);
      return Response.json({ revoked: true });
    }
    // Test-only finite adapter scope; normal qualification uses the actual Host event scope.
    const database = input.receipt_fault
      ? receiptFault(env.DB, input.receipt_fault)
      : env.DB;
    delete input.receipt_fault;
    const adapter = create(
      database,
      { run: (work) => work() },
      { profile: "workers-d1" }
    );
    return Response.json(
      input.action === "qualifies"
        ? await adapter.qualifies(input.deployment, input.subject)
        : await adapter.call(input)
    );
  },
};

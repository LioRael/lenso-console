# Projects connection acceptance — 2026-09-10

This local acceptance used the default SQLite Plugin configuration authority,
the actual Console launcher, both native Agent surfaces, and a PostgreSQL-backed
business App composed from real Auth, Organization, ACL and Projects Plugins.
It did not deploy or mutate a production App.

## Sources

- Console PR #332: Add Projects App, configuration publication and browser consent UI.
- Agent PR #219 head `11d6204cb20cc5f26ff41a7dfff5b6888a27e5b2`: Plugin-owned consent completion.
- The fixture in Agent PR #218 pins Auth `397fa2f3cec6d66bab563a667b7f9ce8e6b11cbe`
  and Projects `569e58f5a8a7ea9beaad11004e13fb28c6f71e1c`, with published
  Organization PostgreSQL 0.5.0 and ACL PostgreSQL 0.2.0.

## Browser observations

1. Add Projects App created one Instance using the existing proposal, source
   digest, publish and operation-receipt flow. No file-authority override was set.
2. The connection survived a full launcher restart. Its grant did not: the UI
   correctly required reconnecting. Global Tool access remained empty after creation.
3. Only five fixture-delegated Projects Tools were subsequently allowed.
4. Sign-in was started, Connections was left, and consent was approved in the
   business App. Returning to Connections displayed connected state without any
   UI poll having fetched the grant.
5. An actual model read `issue-public`, updated its title while preserving other
   fields, and read it back. Agent session:
   `f86b2122-e305-43f6-8294-0f2112db1de8`.

The final title was `SQLite browser authorization verified`, revision `2`.
Independent PostgreSQL inspection confirmed description remained null, priority
`medium`, workflow `started-public`, Project `project-public`, and Team `public`.
The activity ledger recorded `create_issue` at revision 1 and `update_issue` at
revision 2 for the same Alice subject, `usr_Po-XP63mEC3yqjx-mn5E4_cC`.

Full access affected only local Agent Tool approval in this disposable instance.
Business identity, operation audiences and final authorization remained enforced.
The earlier source acceptance and the automated 16-case protocol verifier cover
private-Team denial, nonmember Organizations, stale revisions, idempotent replay,
operation narrowing and parent-session revocation.

This receipt describes local source binaries. Released archive verification,
platform packaging and npm publication require their separate release receipts.

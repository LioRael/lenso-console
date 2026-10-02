# Generic Plugin Detail visual follow-up

Recorded 2026-10-02 on `feat/pencil-console-pages`, applied after `1cf8008e9eb3f8f070b437eac66819e638d32a4a`. The parent actually viewed Pencil `TcZvX` (1470×994) and the initial Auth screenshot (1470×1100), rejected visual conformity, and specified these bounded fixes. This Mac task has not viewed the original; the parent owns the follow-up pixel acceptance.

## Changes

- Reuse the actual `ConsoleShell`, its toolbar/navigation and existing root providers in the screenshot fixture. No screenshot-only Shell was authored.
- Replace the full-width underline tabs with the installed LensoUI `Tabs.ListContainer`, primary segmented tabs and white selected Indicator, left aligned at natural width.
- Use white default Surfaces, public `--radius-3xl` and `--surface-shadow`, and compact left/right fact rows. The two top cards follow their own content height.
- Render authorized Edit configuration through the existing primary Button with scoped neutral accent tokens. Its installed pill/hover/focus/disabled behavior remains owned by LensoUI; read-only View configuration remains secondary.
- Give Resource access and Change impact distinct white panels. Health remains Unknown; unavailable resource mappings, purposes, contribution details, provider bindings and disable preview remain explicit. No D1/KV values, payment or new write action was added.

The identity and revision remain generic and use the real selection phase. Existing workbench permission purge/recovery, detail draft purge and contribution mount cancellation source are unchanged. Observe, Host, runtime, support and CI files are unchanged.

## Evidence

The new screenshot is `apps/shell/src/features/plugins/__screenshots__/plugin-detail-auth-shell-overview.png`: PNG, **1470×994**, 96,940 bytes. SHA-256 `c91d29257306b51013b33b64889f878e42df527bbcfbcb784b0ce6ff632dfd45`. It was opened and inspected locally. It uses the actual production Shell/provider composition with isolated public HTTP response fixtures, including a local session fixture; it is not Native Host or production Actor authorization evidence. The original Library screenshot identity will be retained as a new version so the parent can review this one image.

| Check | Result / receipt |
| --- | --- |
| Focused API Plugin Detail browser | 6 passed, exit 0; `/tmp/console-plugin-detail-visual-browser.log` |
| Behavior included in the same run | Identity/phase, generic Observe detail, read-only/missing declarations, cached permission denial/recovery, real Shell geometry, both themes at 1440 and 390px, long capabilities, hover/focus, keyboard tabs and existing configuration/dependency navigation |
| Typecheck, changed-file oxlint/oxfmt, diff check | Passed |
| Shell bundle | Client/server plus one prerendered page passed, exit 0; `/tmp/console-plugin-detail-visual-bundle.log` |
| Internal independent read-only review | `/root/review_console_slice` found no blocker; checked installed UI APIs, unchanged permissions/lifecycle/phase facts, honest empty states and real Shell reuse. It did not run tests; this is not Delta review. |

Browser log start `19:54:25` CST is `11:54:25` UTC on 2026-10-02. Screenshot mtime `19:54:27` CST is `11:54:27` UTC. No exact test ending time is claimed. Passing browser output still reports the existing `close timed out after 10000ms` cleanup warning. One earlier authored screenshot test failed on unsupported Vitest `page.getByLabel`; it now uses the accessible banner role. Sandboxed browser and prerender attempts were blocked on loopback `listen EPERM`; the focused reruns with the approved local listener completed. No contract or production fallback was relaxed.

| Source / receipt | SHA-256 |
| --- | --- |
| Detail route | `7bbe3a131ca4ad567aa3066829d5b6235433db9a2f0966323464f0bb882ef7fe` |
| Inspector | `a29cc554678a2461014a54288d8e18399535827628bbe661422003f9754755e0` |
| Overview | `2f499287177b517e0c95b9b21fd9b7961bcd54d049ab3e6895849ddb5d826cd6` |
| Browser proof | `7cc3e83bc152eb58883cc187bf50bacb5cf475ccbced22f80ecd381ef94da36a` |
| Browser receipt | `c4c0ce69e9a247c368d6ba4c8b01f8f1db72a39ab34c120bf880f8999251296d` |
| Bundle receipt | `8d3f16d0c41e10f0ccc688711090fc6e762d869e57abaededc0a222cecc7d9e1` |

The parent pixel review, real Native fixtures/Observe OTLP qualification, external Delta review, exact-candidate remote gate, landing and publication remain separate unresolved facts. See [remaining acceptance](2026-10-02-console-slice-remaining-acceptance.md) for the owner-coordinated fa6 kit plan. This commit does not touch main, push, keys, payment or deployment.

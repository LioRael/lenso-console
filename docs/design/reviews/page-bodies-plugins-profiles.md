# Plugins and Profiles body review

Follow-up: Plugins now uses Lenso Table with Plugin, Package, Instance and Status columns on desktop. Narrow screens retain Plugin/Status and combine package/instance below the name. There is no outer Surface or custom row-hover background. Rows open details on ordinary click or Enter; names remain native links. The existing scenario verifies column adaptation, status-cell click and row Enter, and desktop/narrow light/dark rendering was checked. The list decision below records the preceding iteration.

## Scope and direction

- User feedback: `/plugins` at 1512×777; remove header padding, prevent clipped search focus, and redesign confusing page bodies using Lenso UI.
- Complete body changes: `/plugins` and `/settings/profiles`.
- Shared correction: `ConsolePageHeader` is layout-only, accepts whole-header `xstyle`, and bounds its action area. Settings, Assistant Settings and Agent Settings explicitly retain their existing 16px inner text anchor; Management and Profile Editor use their content edge.
- Existing Lenso palette, typography, navigation and control shapes retained. No new assets or motion. Energy 1 / rhythm 2 / motion 1: quiet page chrome, distinct header/tool/list spacing, interaction feedback supplied by the components.
- Permissions, request/mutation contracts, App scope, profile activation and dirty-navigation ownership remain in their existing feature owners.

## Component decisions and anchors

| Role | Reused owner | Reason |
| --- | --- | --- |
| Page title/context | ConsolePageHeader, existing target/Agent Select | One heading and a clearly associated management context |
| Search | SearchField | Built-in icon, controlled value, clear action and focus restoration |
| Category/state values | Select | Value selection rather than custom tabs or action menus |
| Inventory/profile grouping | Surface and native list | These are navigation lists, not table-selection or sorting workflows |
| Whole plugin row/profile identity | Lenso Link rendered as the existing router anchor | Preserve normal links and component-owned focus without nested actions |
| Runtime/current state | Existing PluginStatus Chip and profile Chip | Factual state, not decorative badges |
| Empty/unavailable body | EmptyState | Keep existing recovery actions and status semantics |
| Row operations | Menu and icon-only Button | Separate operations from navigation and preserve Escape/focus behavior |

- Plugins heading, row text and controls share the content-column edge; list hover surfaces extend into the gutter without shifting text.
- Profiles heading, search, active-context copy and row text use the same edge; name/metadata and description occupy distinct lines.
- Preferences title/section/row glyph starts measured at 346, 346 and 347px at desktop: within the 1px allowance.
- Plugins has one main landmark and uses the Console main scroller; its page body no longer adds another scrolling/clipping container. Profiles follows the same rule.
- Each list item owns one separator. Surface rounding does not require clipping its focus rings.

## Rendered checks

Actual Chromium, Vite development server. Plugins used existing mock inventory. Profiles used responses matching the existing browser fixture. Locale responses were isolated to English. These are not live backend acceptance.

| Check | Result | Evidence |
| --- | --- | --- |
| Desktop, 1512×777 | Pass | Plugins and Profiles rendered in both themes |
| Narrow, 375×800 | Pass | Search, filters, context selector and row operations remain reachable without horizontal scrolling |
| 320px and long values | Pass | Long App label and long profile model identifier are bounded; existing browser scenarios now cover these failures |
| Hover and keyboard focus | Pass | Plugin row geometry stays fixed; search and whole-row focus retain the component indicator and clearance within real Console clipping ancestors |
| Titles and content hierarchy | Pass | Plugins has one h1; profile descriptions remain below identity instead of concatenating on one line |
| Filtering and empty results | Pass | Search clear returns focus; filter clear resets category/query/state; changing App restores each App's independent values |
| Unavailable state | Pass | Console extension management-unavailable state rendered with its existing explanation |
| Menu/selector dismissal | Pass | Escape restores menu/selector-trigger focus in both themes |
| Profile navigation/activation | Pass | Existing dirty-navigation and activation scenario passes; New Profile is an actual accessible router anchor |
| Settings reference | Pass | Both themes and desktop/narrow reviewed; explicit inner-header inset preserves existing row alignment |
| Other header consumers | Limited | Source alignment reviewed; not every Agent Settings/Management/Profile Editor state was rendered |
| Complete loading/error/permission matrix | Limited | Existing policies preserved; not every backend outcome was independently rendered |

## Defects found and corrected

1. Plugins' search was flush against an overflow-auto ancestor. Removed the unnecessary ancestor, not the focus ring.
2. Header copy had a private 16px inset while actions/content did not. Moved inset ownership to explicit page composition.
3. A long App label produced a 361px scroll width inside a 320px main region. Made the grid-item header and its actions shrinkable.
4. Profiles' layout was placed on the rendered router child, allowing Lenso Link defaults to win. Applied layout through the public Link `xstyle`.
5. Long unbroken model identifiers overflowed the profile row. Bounded its grid track and allowed metadata wrapping.
6. The old clipping proof could pass without a ring or a real clipping ancestor. It now compares idle/focused styles, requires a visible changed indicator, and uses ConsoleFrame.

## Checks and limits

- Existing two Chromium scenarios updated, not a new fixture matrix: Plugins scope/filter/link/focus geometry and Profiles navigation/activation/menu/row geometry.
- Typecheck, focused format/lint, and production build passed.
- React Doctor's final scan reported no diagnostics after separating inventory rendering from the App workbench. Its `main → origin/main` comparison is limited evidence, not a strict working-tree score baseline.
- Independent source/API review found no route, permission, mutation, dirty-guard or native-link regression. Review findings on clipping proof and cross-App filtering coverage were addressed.
- Browser tests retain their successful-assertions teardown timeout; build retains its large-chunk warning.
- Scoped lint exception: New Profile's Lenso Button requires `role="link"` because it renders a router anchor but defaults to button semantics. Remove the local suppression when the lint rule understands the public `render` API or the Button owner changes that default. The browser scenario verifies the actual anchor/role.
- No claim that all Console pages have been redesigned, no real backend authorization/install validation, and no landing/publication.

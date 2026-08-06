---
status: accepted
---

# Allow executable Console Compositions in Theme Bundles

A Theme Bundle may combine its declarative Theme Package with a Console
Composition containing arbitrary React and JavaScript implementations. The
Composition may replace presentation components and reorganize, group, or
collapse navigation. Authors are advised to keep every Console capability
reachable, but the Host does not validate navigation completeness.

The Console administrator controls which Theme Bundles are installed. Each
Operator may freely choose among them; the selected bundle determines both Host
Theme and Console composition for that Operator. Selection is a presentation
preference and is intentionally not recorded as an audited operation.

The preference is stored in browser local storage as a Theme Bundle ID rather
than in the Console Service or as a pinned artifact digest, alongside a selected
Theme Variant or system preference. Operators sharing a browser profile therefore
share the preference, and installing a new artifact under the selected ID changes
the code and presentation used on the next load.

## Considered Options

- Restricting composition to Host-provided declarative recipes was rejected in
  favor of substantially greater customization.
- Selecting one instance-wide composition was rejected so Operators can choose
  their own complete Console presentation.
- Treating navigation organization as Module routing was rejected because a
  Composition may rearrange existing capabilities but cannot contribute new
  business behavior.

## Consequences

Console Composition code is trusted same-realm frontend code rather than a
sandboxed theme definition. Theme Bundle compatibility, loading, failure
recovery, and presentation guidance are handled independently of token-schema
validation. Composition code consumes a versioned
`@lenso/console-composition-api` rather than Console-private imports.

A Theme Bundle is materialized as a `console_theme_bundle` artifact with a
verified manifest, ordered assets, digests, and `consoleUi` compatibility range.
Console administrators install and remove these artifacts; ordinary Operators
select from the installed inventory. Switching bundles performs a full Console
reload. Loading or rendering failure falls back to the built-in official default
Theme Bundle through an isolated error boundary; preference changes remain
unaudited. Official themes and the default Console Composition use the same
contract as third-party bundles, while the fallback bundle remains embedded so
recovery does not depend on external storage or networking.

Bundle IDs are publisher-namespaced stable identifiers. Installation atomically
changes the digest associated with an ID, and the new artifact takes effect on
the next load rather than through hot replacement. If a selected bundle is
removed, the Host clears the browser preference and falls back to the embedded
default. Installing, updating, and removing the instance-wide bundle inventory
produce Console administration audit evidence even though personal selection
does not.

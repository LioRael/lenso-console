# @lenso/console-composition-api

Versioned contract for an optional Console UI Composition carried by a Theme
Bundle. A Composition may replace presentation slots or arrange existing Host
navigation; it does not add business capabilities or change Module ownership.

```tsx
import {
  defineConsoleUiComposition,
  CONSOLE_UI_COMPOSITION_PROTOCOL,
} from "@lenso/console-composition-api";

export default defineConsoleUiComposition({
  protocol: CONSOLE_UI_COMPOSITION_PROTOCOL,
  consoleUi: "^1.0.0",
  arrangeNavigation(model) {
    return { ...model, items: [...model.items].toSorted(compareItems) };
  },
});
```

Theme Bundle Composition code runs in the trusted same realm. It should use the
public composition contract and `@lenso/console-tokens`; sandboxing is outside
this package's scope.

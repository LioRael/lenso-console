import type { PageProps } from "@lenso/console-sdk";
import { useState } from "react";

export default function Orders({ navigation }: PageProps) {
  const [count, setCount] = useState(0);
  return (
    <section aria-label="Orders">
      <h1>Orders</h1>
      <p>This Console belongs to your App. No Agent is running.</p>
      <button type="button" onClick={() => setCount(count + 1)}>
        Count: {count}
      </button>
      <a href={navigation.href(["orders", "42"])}>Open order 42</a>
    </section>
  );
}

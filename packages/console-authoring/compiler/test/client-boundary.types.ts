import {
  createClient,
  type DeclaredOperation,
  type DeclaredStreamOperation,
  type WorkspaceServices,
} from "../../src/client";

declare const transport: WorkspaceServices;
type Definitions = {
  orders: {
    capabilityId: "orders";
    version: "1";
    operations: {
      read: DeclaredOperation<{ id: string }, { total: number }>;
      watch: DeclaredStreamOperation<{ id: string }, { total: number }>;
    };
  };
};
const client = createClient<Definitions>(transport);
const unary: Promise<{ total: number }> = client.orders.read({ id: "one" });
const stream: AsyncIterable<{ total: number }> = client.orders.watch.subscribe({
  id: "one",
});
void unary;
void stream;
// @ts-expect-error Request DTOs remain checked without importing server bindings.
client.orders.read({ id: 1 });
// @ts-expect-error Streams do not expose a unary call.
client.orders.watch({ id: "one" });
// @ts-expect-error Unary operations do not expose subscribe.
client.orders.read.subscribe({ id: "one" });

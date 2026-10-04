import { useWorkspaceRead, type PageProps } from "@lenso/console-sdk";
import { bindServices } from "@lenso/console-sdk/services";

export default function Order({ params, navigation, services }: PageProps) {
  const order = useWorkspaceRead({
    key: "orders.read",
    params: { id: typeof params.id === "string" ? params.id : "" },
    read: ({ params: input, signal }) =>
      bindServices(services).orders.read(input, { signal }),
  });
  return (
    <section>
      <h1>
        {order.blocking
          ? "Loading order"
          : (order.error?.message ?? order.data?.title ?? "Order unavailable")}
      </h1>
      {order.refreshing ? <output>Refreshing order</output> : null}
      <a href={navigation.href([])}>Back to orders</a>
    </section>
  );
}

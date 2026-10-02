import type { PageProps } from "@lenso/console-sdk";

export default function Order({ params, navigation }: PageProps) {
  return (
    <section aria-label="Order">
      <h1>Order {String(params.id ?? "")}</h1>
      <p>
        This page demonstrates scoped navigation without a backend provider.
      </p>
      <a href={navigation.href([])}>Back to orders</a>
    </section>
  );
}

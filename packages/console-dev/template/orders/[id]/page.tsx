import type { PageProps } from "@lenso/console-sdk";

export default function Order({ params, navigation }: PageProps) {
  return (
    <section>
      <h1>Order {params.id}</h1>
      <a href={navigation.href([])}>Back to orders</a>
    </section>
  );
}

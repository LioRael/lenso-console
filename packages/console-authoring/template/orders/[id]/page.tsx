import type { PageProps } from "@lenso/console-sdk";
import { bindServices } from "@lenso/console-sdk/services";
import { useEffect, useState } from "react";

export default function Order({
  params,
  navigation,
  services,
  signal,
}: PageProps) {
  const [title, setTitle] = useState("Loading order");
  useEffect(() => {
    const { id } = params;
    if (typeof id !== "string") {
      return;
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      controller.abort();
    }
    const client = bindServices(services);
    const load = async () => {
      try {
        const order = await client.orders.read(
          { id },
          { signal: controller.signal }
        );
        if (!controller.signal.aborted) {
          setTitle(order.title);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setTitle(
            error instanceof Error ? error.message : "Order unavailable"
          );
        }
      }
    };
    void load();
    return () => {
      signal.removeEventListener("abort", abort);
      controller.abort();
    };
  }, [params, services, signal]);
  return (
    <section>
      <h1>{title}</h1>
      <a href={navigation.href([])}>Back to orders</a>
    </section>
  );
}

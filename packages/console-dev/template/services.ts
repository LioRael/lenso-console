import { defineServices, operation } from "@lenso/console-sdk/server";

export default defineServices({
  orders: {
    capabilityId: "example.orders.query@1",
    version: "1.0.0",
    operations: {
      read: operation({
        parse(value: unknown) {
          if (
            typeof value !== "object" ||
            value === null ||
            !("id" in value) ||
            typeof value.id !== "string"
          ) {
            throw new Error("An order ID is required");
          }
          return { id: value.id };
        },
        // Example business rule. Production authorization belongs here or in
        // the domain provider this adapter invokes, never in page navigation.
        authorize(_context, input) {
          return input.id === "42";
        },
        handle(input) {
          return { id: input.id, title: "Example order" };
        },
      }),
    },
  },
});

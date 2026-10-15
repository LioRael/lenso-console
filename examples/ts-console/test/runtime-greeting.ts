import { writeFile } from "node:fs/promises";

import { RuntimeHost, type Contract } from "@lenso/runtime-sdk";

/** A synthetic, side-effect-free owner used only by the local Runtime proof. */
export const greetingContract: Contract = {
  version: "1",
  methods: {
    greet: {
      mode: "unary",
      input: {
        type: "object",
        properties: { name: { type: "string", minLength: 1, maxLength: 80 } },
        required: ["name"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          message: { type: "string", minLength: 1, maxLength: 512 },
        },
        required: ["message"],
        additionalProperties: false,
      },
      error: { type: "null" },
    },
  },
};

export function startGreetingFixture(
  port: number,
  beforeReply: () => void | Promise<void> = () => undefined
) {
  return RuntimeHost.connect({
    namespace: "console-demo",
    service: "greeting",
    instance: "synthetic-one",
    port,
    contract: greetingContract,
    handlers: {
      async greet(input) {
        await beforeReply();
        return { message: `Hello, ${(input as { name: string }).name}!` };
      },
    },
  });
}

export async function writeGreetingManifest(file: string) {
  await writeFile(
    file,
    JSON.stringify({
      format: "lenso-runtime-build-manifest/1",
      services: [
        {
          namespace: "console-demo",
          service: "greeting",
          contract: greetingContract,
        },
        {
          // A build declaration intentionally has no connected implementation.
          namespace: "console-demo",
          service: "planned-greeting",
          contract: greetingContract,
        },
      ],
    })
  );
}

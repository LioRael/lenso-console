import { defineWorkspace } from "@lenso/console-sdk";

export default defineWorkspace({
  id: "agent",
  title: "Agent connections",
  path: "/agent-connections/",
  access: "member",
  services: ["administration"],
});

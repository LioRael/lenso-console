import { defineWorkspace } from "@lenso/console-sdk";

export default defineWorkspace({
  id: "identity",
  title: "Identity",
  path: "/identity/",
  access: "member",
  services: ["administration"],
});

import { defineWorkspace } from "@lenso/console-sdk";

export default defineWorkspace({
  id: "access",
  title: "Console access",
  path: "/access/",
  access: "member",
  services: ["administration"],
});

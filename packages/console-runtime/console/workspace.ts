import { defineWorkspace } from "@lenso/console-sdk";

export default defineWorkspace({
  id: "runtime",
  title: "Runtime",
  path: "/runtime/",
  access: "administrator",
  services: ["runtime"],
});

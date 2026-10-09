import { defineWorkspace } from "@lenso/console-sdk";

export default defineWorkspace({
  id: "authorization",
  title: "Authorization",
  path: "/authorization/",
  access: "administrator",
  services: ["authorization"],
});

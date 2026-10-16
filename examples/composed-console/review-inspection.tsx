import RuntimePage from "../../packages/console-runtime/console/page";
import AuthorizationPage from "../ts-console/console/authorization/page";
import { workspacePage } from "./review-workspace";

export const Authorization = workspacePage(
  "authorization",
  "/authorization",
  () => [],
  (_props, workspace) => <AuthorizationPage {...workspace} />
);
export const Runtime = workspacePage(
  "runtime",
  "/runtime",
  () => [],
  (_props, workspace) => <RuntimePage {...workspace} />
);

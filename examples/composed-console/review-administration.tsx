import {
  AccessPage,
  AgentPage,
  IdentityPage,
} from "@lenso/auth-console/administration/react";

import { workspacePage } from "./review-workspace";

export const Identity = workspacePage(
  "identity",
  "/identity",
  () => [],
  (props) => (
    <IdentityPage
      client={props.services.administration}
      identityHref={(id) => `/identity/users/${encodeURIComponent(id)}`}
    />
  )
);
export const User = workspacePage(
  "identity",
  "/identity",
  (props) => ["users", props.params.subjectId!],
  (props) => (
    <IdentityPage
      client={props.services.administration}
      subjectId={props.params.subjectId!}
      returnHref="/identity"
      onNavigate={(href) => props.services.navigate(href)}
    />
  )
);
export const Access = workspacePage(
  "access",
  "/access",
  () => [],
  (props) => <AccessPage client={props.services.administration} tabs="host" />
);
export const Roles = workspacePage(
  "access",
  "/access",
  () => ["roles"],
  (props) => <AccessPage client={props.services.administration} tabs="host" />
);
export const Agent = workspacePage(
  "agent",
  "/agent-connections",
  () => [],
  (props) => <AgentPage client={props.services.administration} tabs="host" />
);
export const Events = workspacePage(
  "agent",
  "/agent-connections",
  () => ["events"],
  (props) => <AgentPage client={props.services.administration} tabs="host" />
);

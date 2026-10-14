import { IdentityPage } from "@lenso/auth-console/administration/react";
import { definePage } from "@lenso/console-sdk";

import "@lenso/auth-console/styles.css";
import { useMemo } from "react";

import { administrationClient } from "../../../administration-client";

export default definePage((props) => {
  const { services, credentials, signal } = props;
  const client = useMemo(
    () => administrationClient(services, credentials, signal),
    [services, credentials, signal]
  );
  const { subjectId } = props.params;
  if (typeof subjectId !== "string") {
    return <p role="alert">User identity is missing.</p>;
  }
  return (
    <IdentityPage
      client={client}
      subjectId={subjectId}
      identityHref={(id) => props.navigation.href(["users", id])}
      returnHref={props.navigation.href([])}
    />
  );
});

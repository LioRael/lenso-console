import { IdentityPage } from "@lenso/auth-console/administration/react";
import { definePage } from "@lenso/console-sdk";

import "@lenso/auth-console/styles.css";
import { useMemo } from "react";

import { administrationClient } from "../administration-client";

export default definePage((props) => {
  const { services, credentials, signal } = props;
  const client = useMemo(
    () => administrationClient(services, credentials, signal),
    [services, credentials, signal]
  );
  return (
    <IdentityPage
      client={client}
      identityHref={(id) => props.navigation.href(["users", id])}
    />
  );
});

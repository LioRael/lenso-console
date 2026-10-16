import {
  OAuthApplicationsPage,
  OAuthConsentPage,
} from "@lenso/auth-console/oauth/react";
import {
  ConsolePageScope,
  type ConsoleLocalPageProps,
} from "@lenso/console-react";
import * as stylex from "@stylexjs/stylex";

import type { ReviewServices } from "./review-pages";

type Props = ConsoleLocalPageProps<ReviewServices>;

export function Applications(props: Props) {
  return (
    <section {...stylex.props(styles.page)}>
      <ConsolePageScope
        scopeKey={props.activation.key}
        value={{ context: { kind: "object", label: "Connected apps" } }}
      />
      <OAuthApplicationsPage
        client={props.services.oauth}
        signal={props.signal}
        scopeKey={props.activation.key}
      />
    </section>
  );
}
export function Consent(props: Props) {
  return (
    <section {...stylex.props(styles.page)}>
      <ConsolePageScope
        scopeKey={props.activation.key}
        value={{ context: { kind: "object", label: "Application consent" } }}
      />
      <OAuthConsentPage
        client={props.services.oauth}
        requestId={props.params.requestId!}
        signal={props.signal}
        onComplete={(href) => props.services.navigate(href)}
      />
    </section>
  );
}

const styles = stylex.create({
  page: {
    maxWidth: 1120,
    marginInline: "auto",
    paddingInline: 16,
    paddingBlockStart: 8,
    paddingBlockEnd: 112,
    color: "var(--foreground)",
  },
});

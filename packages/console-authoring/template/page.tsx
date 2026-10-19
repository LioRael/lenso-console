import { ConsolePageScope } from "@lenso/console-react";
import type { PageProps } from "@lenso/console-sdk";
import { Button } from "@lenso/ui/button";
import { Description } from "@lenso/ui/description";
import { FieldError } from "@lenso/ui/field-error";
import { Form } from "@lenso/ui/form";
import { Input } from "@lenso/ui/input";
import { Label } from "@lenso/ui/label";
import { TextField } from "@lenso/ui/textfield";
import * as stylex from "@stylexjs/stylex";
import { useState } from "react";

const styles = stylex.create({
  page: {
    width: "100%",
    maxWidth: 720,
    marginInline: "auto",
    paddingInline: 24,
    paddingBlockStart: 96,
    paddingBlockEnd: 120,
    color: "var(--foreground)",
  },
  heading: { margin: 0, fontSize: 28, fontWeight: 600, lineHeight: 1.3 },
  description: {
    marginBlockStart: 12,
    marginBlockEnd: 32,
    color: "var(--muted)",
    fontSize: 14,
    lineHeight: 1.6,
  },
  form: { display: "grid", gap: 20, justifyItems: "start" },
  field: { display: "grid", gap: 8, width: "100%", maxWidth: 420 },
});

export default function Orders(props: PageProps) {
  const [reference, setReference] = useState("");
  return (
    <section aria-label="Orders" {...stylex.props(styles.page)}>
      <ConsolePageScope
        scopeKey={props.activation?.key ?? props.mount.id}
        value={{ context: { kind: "object", label: "Orders" } }}
      />
      <h1 {...stylex.props(styles.heading)}>Find an order</h1>
      <p {...stylex.props(styles.description)}>
        Open an order by reference. This starter workspace has no connected
        order data yet.
      </p>
      <Form
        xstyle={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (
            reference.trim() &&
            !props.signal.aborted &&
            (!props.activation || props.activation.isCurrent())
          ) {
            props.navigation.go(["orders", reference.trim()]);
          }
        }}
      >
        <TextField name="orderReference" xstyle={styles.field}>
          <Label>Order reference</Label>
          <Input
            required
            maxLength={128}
            placeholder="For example, 42"
            value={reference}
            onValueChange={setReference}
          />
          <Description>
            Enter the reference for the order you want to view.
          </Description>
          <FieldError />
        </TextField>
        <Button variant="primary" type="submit" disabled={!reference.trim()}>
          Open order
        </Button>
      </Form>
    </section>
  );
}

import { useConsoleActivation } from "@lenso/console-react";
import {
  runtimeGreetingInputSchema,
  runtimeGreetingResultSchema,
  runtimeInspectionLimits,
  type RuntimeCatalogue,
  type RuntimeGreetingInput,
  type RuntimeGreetingResult,
} from "@lenso/console-runtime/client";
import type { PageProps, ReadSnapshot } from "@lenso/console-sdk";
import { Button } from "@lenso/ui/button";
import { Description } from "@lenso/ui/description";
import { FieldError } from "@lenso/ui/field-error";
import { Form } from "@lenso/ui/form";
import { Input } from "@lenso/ui/input";
import { Label } from "@lenso/ui/label";
import { TextField } from "@lenso/ui/textfield";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";

import { styles } from "./page.styles";

type EnabledTrial = Extract<
  ReadSnapshot<RuntimeCatalogue>["greetingTrial"],
  { enabled: true }
>;

export function GreetingTrial({
  trial,
  services,
  signal,
  parentActivation,
}: {
  trial: EnabledTrial;
  services: PageProps["services"];
  signal: AbortSignal;
  parentActivation: NonNullable<PageProps["activation"]>;
}) {
  // The form may retire on a catalogue change while its page remains active.
  const lifetime = useConsoleActivation(JSON.stringify(trial), signal);
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string>();
  const [error, setError] = useState<string>();
  const pending = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      pending.current?.abort();
      pending.current = null;
    },
    []
  );

  function isCurrent() {
    return (
      !lifetime.signal.aborted &&
      lifetime.activation.isCurrent() &&
      parentActivation.isCurrent()
    );
  }

  function changeName(value: string) {
    if (pending.current || !isCurrent()) {
      return;
    }
    setName(value);
    setErrors({});
    setError(undefined);
    setResult(undefined);
  }

  async function runGreeting() {
    if (pending.current || !isCurrent()) {
      return;
    }
    const parsed = runtimeGreetingInputSchema.safeParse({ name });
    if (!parsed.success) {
      setErrors({
        name: `Enter a name from 1 to ${runtimeInspectionLimits.greetingName} characters.`,
      });
      return;
    }
    const request = new AbortController();
    const requestSignal = AbortSignal.any([lifetime.signal, request.signal]);
    const current = () =>
      pending.current === request && !requestSignal.aborted && isCurrent();
    pending.current = request;
    setRunning(true);
    setErrors({});
    setError(undefined);
    setResult(undefined);
    try {
      const response = runtimeGreetingResultSchema.parse(
        await services.invoke<RuntimeGreetingInput, RuntimeGreetingResult>(
          "runtime",
          "greet",
          parsed.data,
          { signal: requestSignal }
        )
      );
      if (current()) {
        setResult(response.message);
      }
    } catch {
      if (current()) {
        setError(
          "The greeting trial did not complete. The service may be unavailable or access may have changed. Your name is retained; you can try again."
        );
      }
    } finally {
      if (pending.current === request) {
        pending.current = null;
        if (isCurrent()) {
          setRunning(false);
        }
      }
    }
  }

  return (
    <section aria-label="Greeting trial" {...stylex.props(styles.trial)}>
      <h3 {...stylex.props(styles.trialTitle)}>Greeting trial</h3>
      <p {...stylex.props(styles.description)}>
        The host has enabled this side-effect-free greeting only. It calls{" "}
        <strong>
          {trial.target.namespace}/{trial.target.service}.{trial.method}
        </strong>{" "}
        with contract {trial.target.contractVersion} and a{" "}
        {trial.timeoutMs / 1000}-second timeout. Live availability is checked
        when you run it.
      </p>
      <Form
        errors={errors}
        onFormSubmit={() => void runGreeting()}
        aria-busy={running}
        xstyle={styles.form}
      >
        <TextField
          name="name"
          disabled={running}
          validate={(value) =>
            runtimeGreetingInputSchema.safeParse({ name: value }).success
              ? null
              : `Enter a name from 1 to ${runtimeInspectionLimits.greetingName} characters.`
          }
          xstyle={styles.field}
        >
          <Label required>Name</Label>
          <Input
            required
            value={name}
            onChange={(event) => changeName(event.target.value)}
            maxLength={runtimeInspectionLimits.greetingName}
            autoComplete="off"
            variant="secondary"
          />
          <Description>
            Up to {runtimeInspectionLimits.greetingName} characters. Sent only
            when you run the trial.
          </Description>
          <FieldError />
        </TextField>
        <Button
          type="submit"
          variant="primary"
          disabled={running}
          xstyle={styles.trialButton}
        >
          Run greeting
        </Button>
        {running ? <output>Running greeting…</output> : null}
        {error ? (
          <p role="alert" {...stylex.props(styles.message)}>
            {error}
          </p>
        ) : null}
        {result ? (
          <output
            aria-label="Greeting response"
            {...stylex.props(styles.trialOutput)}
          >
            {result}
          </output>
        ) : null}
      </Form>
    </section>
  );
}

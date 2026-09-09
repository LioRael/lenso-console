import { Button } from "@lenso/ui/button";
import { Dialog } from "@lenso/ui/dialog";
import { TextField } from "@lenso/ui/text-field";
import * as stylex from "@stylexjs/stylex";
import { useRef, useState } from "react";

import { useConsoleTranslation } from "../../app/console-i18n";
import { absentPluginConfigurationDigest } from "../plugins/plugin-configuration-source";
import { readPluginConfigurationProposal } from "../plugins/plugin-control-client";
import {
  usePluginMutation,
  type PluginWorkbenchData,
} from "../plugins/use-plugin-workbench";
import { settingsPageStyles as page } from "../settings/settings-page.stylex";
import { agentSettingsStyles as styles } from "./agent-settings-page.stylex";
import {
  BUSINESS_PACKAGE,
  businessConfiguration,
} from "./business-connection-model";

export function AddBusinessAppConnection({
  agentId,
  data,
  disabled = false,
  onAdded,
}: {
  agentId: string;
  data: PluginWorkbenchData;
  disabled?: boolean;
  onAdded: () => void;
}) {
  const t = useConsoleTranslation();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const instance = useRef("");
  const mutation = usePluginMutation(agentId, data.inventory.streamId);
  const available = data.management.plugins.find(
    (item) => item.packageId === BUSINESS_PACKAGE
  );
  // Projects Tool names are shared; configure the existing instance instead of
  // creating another provider with conflicting names.
  if (!available || available.instances.length > 0) {
    return null;
  }
  const add = async () => {
    setPending(true);
    setErrorMessage("");
    try {
      const request = {
        expectedRevision: data.management.revision,
        expectedStreamId: data.inventory.streamId,
        expectedSourceDigest: await absentPluginConfigurationDigest(
          BUSINESS_PACKAGE,
          instance.current
        ),
        instanceKey: instance.current,
        packageId: BUSINESS_PACKAGE,
        toml: businessConfiguration(label, address),
      };
      const proposal = await readPluginConfigurationProposal(
        request,
        undefined,
        agentId
      );
      if (proposal.status !== "ready" || proposal.application === "blocked") {
        throw new Error(
          proposal.diagnostics.map((item) => item.detail).join("\n") ||
            "The Agent could not validate this connection."
        );
      }
      await mutation.mutateAsync({
        ...request,
        type: "configure",
        proposalDigest: proposal.proposalDigest,
      });
      setOpen(false);
      onAdded();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The connection could not be added."
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          setOpen(next);
        }
      }}
    >
      <Button
        size="compact"
        disabled={open || disabled}
        onClick={() => {
          instance.current = `business_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
          setErrorMessage("");
          setOpen(true);
        }}
      >
        {t("Add Projects App")}
      </Button>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Viewport>
          <Dialog.Popup xstyle={local.popup}>
            <form
              {...stylex.props(page.group, local.form)}
              onSubmit={(event) => {
                event.preventDefault();
                void add();
              }}
            >
              <Dialog.Title>{t("Add Projects App")}</Dialog.Title>
              <Dialog.Description {...stylex.props(styles.description)}>
                {t(
                  "Connect a Projects App, then sign in through its browser consent page."
                )}
              </Dialog.Description>
              <label {...stylex.props(styles.rowCopy, local.field)}>
                {t("App name")}
                <TextField.Root xstyle={local.input}>
                  <TextField.Control
                    aria-label={t("App name")}
                    required
                    maxLength={100}
                    disabled={pending}
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                  />
                </TextField.Root>
              </label>
              <label {...stylex.props(styles.rowCopy, local.field)}>
                {t("App URL")}
                <TextField.Root xstyle={local.input}>
                  <TextField.Control
                    aria-label={t("App URL")}
                    required
                    type="url"
                    placeholder="https://projects.example.com"
                    disabled={pending}
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                  />
                </TextField.Root>
              </label>
              <p {...stylex.props(styles.description)}>
                {t(
                  "Start local Apps before connecting. Adding an App does not grant access to its data."
                )}
              </p>
              {errorMessage ? (
                <p role="alert" {...stylex.props(styles.error)}>
                  {t(errorMessage)}
                </p>
              ) : null}
              <div {...stylex.props(page.headerActions)}>
                <Button
                  type="submit"
                  size="compact"
                  disabled={pending || disabled}
                >
                  {pending ? t("Adding…") : t("Add connection")}
                </Button>
                <Button
                  type="button"
                  size="compact"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                >
                  {t("Cancel")}
                </Button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
const local = stylex.create({
  input: { width: "100%", maxWidth: "none" },
  popup: {
    width: "min(440px, calc(100vw - 32px))",
    maxHeight: "calc(100dvh - 48px)",
    overflowY: "auto",
    padding: 0,
  },
  field: { fontSize: 13, lineHeight: "20px", gap: 6 },
  form: { display: "grid", gap: 16, padding: 20, marginBlockStart: 0 },
});

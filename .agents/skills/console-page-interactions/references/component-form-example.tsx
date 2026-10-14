import { useEffect, useRef, useState } from "react";
import { Form } from "@lenso/ui/form";
import { TextField } from "@lenso/ui/textfield";
import { Label } from "@lenso/ui/label";
import { Input } from "@lenso/ui/input";
import { Description } from "@lenso/ui/description";
import { FieldError } from "@lenso/ui/field-error";
import { Select } from "@lenso/ui/select";
import { Accordion } from "@lenso/ui/accordion";
import { Button } from "@lenso/ui/button";

type Draft = { connectionId: string; publicModel: string };
type PreviewResult = { errors?: Partial<Record<keyof Draft, string>>; message: string };

/** Local component recipe: the caller owns preview/CAS/auth, never a real write. */
export function ComponentFormExample({
  preview,
  signal,
}: {
  preview(draft: Draft, signal: AbortSignal): Promise<PreviewResult>;
  /** Existing Console activation signal; the adapter maps unknown issues to message. */
  signal: AbortSignal;
}) {
  const [draft, setDraft] = useState<Draft>({ connectionId: "", publicModel: "" });
  const [errors, setErrors] = useState<PreviewResult["errors"]>({});
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    setMessage("");
    setErrors({});
    setRunning(false);
    return () => {
      pending.current?.abort();
      pending.current = null;
    };
  }, [signal]);
  function edit<K extends keyof Draft>(name: K, value: Draft[K]) {
    setDraft(previous => ({ ...previous, [name]: value }));
    setMessage("");
    setErrors(previous => ({ ...previous, [name]: undefined }));
  }
  async function submit() {
    if (pending.current || signal.aborted) return;
    const request = new AbortController();
    const lifetime = AbortSignal.any([signal, request.signal]);
    const current = () => pending.current === request && !lifetime.aborted;
    pending.current = request;
    setRunning(true);
    setErrors({});
    setMessage("");
    try {
      const result = await preview({ ...draft }, lifetime);
      if (!current()) return;
      setErrors(result.errors ?? {});
      setMessage(result.message);
    } catch {
      if (current()) setMessage("预览未完成，请重试。草稿仍保留。");
    } finally {
      if (pending.current === request) {
        pending.current = null;
        if (!lifetime.aborted) setRunning(false);
      }
    }
  }
  const choices = [{ value: "local", label: "本地示例连接" }];
  return (
    <Form errors={errors} onFormSubmit={() => void submit()} aria-busy={running}>
      <TextField name="connectionId" disabled={running}>
        <Select.Root<string>
          name="connectionId"
          items={choices}
          required
          value={draft.connectionId || null}
          onValueChange={value => edit("connectionId", value ?? "")}
        >
          <Select.Label>上游连接</Select.Label>
          <Select.Trigger><Select.Value placeholder="请选择连接" /><Select.Indicator /></Select.Trigger>
          <Select.Portal><Select.Positioner alignItemWithTrigger={false}>
            <Select.Popover><Select.List>{choices.map(choice => (
              <Select.Item key={choice.value} value={choice.value}>
                <Select.ItemText>{choice.label}</Select.ItemText><Select.ItemIndicator />
              </Select.Item>
            ))}</Select.List></Select.Popover>
          </Select.Positioner></Select.Portal>
        </Select.Root>
        <FieldError />
      </TextField>
      <TextField name="publicModel" disabled={running}
        validate={value => typeof value === "string" && !value.trim() ? "请输入模型名称。" : null}>
        <Label required>公开模型名称</Label>
        <Input required value={draft.publicModel} onChange={event => edit("publicModel", event.target.value)} />
        <Description>客户请求使用的公开名称；本示例不修改任何业务配置。</Description>
        <FieldError />
      </TextField>
      <Accordion><Accordion.Item value="directory">
        <Accordion.Heading><Accordion.Trigger>目录资料说明<Accordion.Indicator /></Accordion.Trigger></Accordion.Heading>
        <Accordion.Panel><Accordion.Body>目录参考价不是采购成本或对客售价；加载属于显式操作。</Accordion.Body></Accordion.Panel>
      </Accordion.Item></Accordion>
      <Button type="submit" variant="primary" disabled={running} focusableWhenDisabled>
        {running ? "正在预览…" : "预览变更"}
      </Button>
      {message && <p role="status">{message}</p>}
    </Form>
  );
}

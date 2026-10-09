import {
  useWorkspaceRead,
  type PageProps,
  type ReadSnapshot,
  type WorkspaceReadResult,
} from "@lenso/console-sdk";
import { Button } from "@lenso/ui/button";
import { useEffect, useRef, useState, type ReactNode } from "react";

import "./styles.css";

export function ManagementFrame({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="management-page">
      <header className="management-header">
        <div className="management-copy">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions ? <div className="management-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function hasOperation(
  props: PageProps,
  service: string,
  operation: string
): boolean {
  return (
    props.mount.requirements?.some(
      (requirement) =>
        requirement.service_id === service &&
        requirement.available &&
        requirement.operations.includes(operation)
    ) === true
  );
}

export function useManagementRead<Params, Data>(
  props: PageProps,
  service: string,
  operation: string,
  params: Params,
  schema: { parse(input: unknown): Data },
  key: string
) {
  return useWorkspaceRead({
    key,
    params,
    async read({ params: input, signal }) {
      const value = await props.services.invoke(service, operation, input, {
        signal,
      });
      signal.throwIfAborted();
      return schema.parse(value);
    },
  });
}

export function managementErrorMessage(
  error: unknown,
  locale: "en" | "zh-CN"
): string {
  const code = error instanceof Error ? Reflect.get(error, "code") : undefined;
  const zh = locale === "zh-CN";
  if (code === "FORBIDDEN" || code === "UNAUTHORIZED") {
    return zh
      ? "当前身份没有此操作权限。"
      : "Your current identity cannot perform this operation.";
  }
  if (code === "CONFLICT") {
    return zh
      ? "记录已变化。请刷新并重新确认，原草稿已保留。"
      : "The record changed. Refresh and review again; your draft is preserved.";
  }
  if (code === "PRECONDITION_FAILED") {
    return zh
      ? "身份或权限已变化。请重新加载页面。"
      : "Your identity or permissions changed. Reload this page.";
  }
  if (code === "TOO_MANY_REQUESTS") {
    return zh
      ? "操作受到限流，请稍后再试。"
      : "This operation is rate limited. Try again later.";
  }
  return zh
    ? "操作未能确认完成。请检查当前状态，不要重复提交未知结果的写操作。"
    : "Completion could not be confirmed. Check the current state before resubmitting a write.";
}

export async function refreshManagementRead(result: {
  refetch(): Promise<void>;
}): Promise<void> {
  try {
    await result.refetch();
  } catch {
    // Scoped reads retain the error for ReadState; an event handler must not create an unhandled rejection.
  }
}

export function ReadState<Data>({
  result,
  locale,
  empty,
  isEmpty,
}: {
  result: WorkspaceReadResult<Data>;
  locale: "en" | "zh-CN";
  empty?: ReactNode;
  isEmpty?: boolean | ((data: ReadSnapshot<Data>) => boolean);
}) {
  if (result.error) {
    return (
      <div className="management-notice" role="alert">
        <p>{managementErrorMessage(result.error, locale)}</p>
        <Button
          variant="secondary"
          onClick={() => void refreshManagementRead(result)}
        >
          {locale === "zh-CN" ? "刷新" : "Refresh"}
        </Button>
      </div>
    );
  }
  if (result.blocking) {
    return (
      <output className="management-muted">
        {locale === "zh-CN" ? "正在读取记录…" : "Loading records…"}
      </output>
    );
  }
  const emptyState =
    typeof isEmpty === "function"
      ? result.data !== undefined && isEmpty(result.data)
      : isEmpty;
  if (emptyState) {
    return <output className="management-muted">{empty}</output>;
  }
  return result.refreshing ? (
    <output className="management-muted">
      {locale === "zh-CN" ? "正在刷新…" : "Refreshing…"}
    </output>
  ) : null;
}

export function useManagementMutation(props: PageProps) {
  const busy = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [mutationError, setMutationError] = useState<Error | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  async function run<Value>(
    work: (signal: AbortSignal) => Promise<Value>
  ): Promise<Value> {
    if (busy.current) {
      throw new Error("An operation is already pending");
    }
    if (!lifetime.current) {
      throw new Error("Management is not mounted");
    }
    const signal = AbortSignal.any([props.signal, lifetime.current.signal]);
    signal.throwIfAborted();
    busy.current = true;
    setPending(true);
    setMutationError(null);
    try {
      const value = await work(signal);
      signal.throwIfAborted();
      return value;
    } catch (error) {
      signal.throwIfAborted();
      const code =
        error instanceof Error ? Reflect.get(error, "code") : undefined;
      const safe = Object.assign(new Error("Management operation failed"), {
        code: typeof code === "string" ? code : "SERVICE_UNAVAILABLE",
      });
      setMutationError(safe);
      throw safe;
    } finally {
      busy.current = false;
      if (!signal.aborted) {
        setPending(false);
      }
    }
  }
  return { run, pending, error: mutationError };
}

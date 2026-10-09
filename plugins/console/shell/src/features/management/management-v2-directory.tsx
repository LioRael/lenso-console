import { createConsoleClient } from "@lenso/console-sdk/transport";
import { Button } from "@lenso/ui/button";
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";

import { useConsoleLocale } from "../../app/console-locale";
import { ConsolePageHeader } from "../../components/runtime/console-page-header";
import { sessionFetch } from "../../lib/session-fetch";
import { usePageCatalog } from "../extensions/page-contribution-catalog";
import { workspacePageHref } from "../extensions/workspace-paths";
import { settingsPageStyles as page } from "../settings/settings-page.stylex";

const styles = stylex.create({
  list: { display: "grid", gap: 12, marginTop: 24 },
  operation: {
    display: "grid",
    gap: 6,
    padding: 16,
    border: "1px solid var(--separator)",
    borderRadius: 10,
    minWidth: 0,
  },
  heading: { margin: 0, fontSize: 15, overflowWrap: "anywhere" },
  detail: {
    margin: 0,
    color: "var(--muted)",
    fontSize: 13,
    lineHeight: "20px",
    overflowWrap: "anywhere",
  },
  link: { width: "fit-content", marginTop: 4 },
});

export function ManagementV2Directory({ subject }: { subject: string }) {
  const { locale } = useConsoleLocale();
  const zh = locale === "zh-CN";
  const copy = (en: string, cn: string) => (zh ? cn : en);
  const { data: pages = [] } = usePageCatalog();
  const query = useQuery({
    queryKey: ["management-v2-directory", subject],
    queryFn: async ({ signal }) => {
      const client = createConsoleClient({
        headers: { "X-Lenso-Expected-Subject": subject },
        fetch: (input, init) => sessionFetch(input, init),
      });
      const [catalog, targets] = await Promise.all([
        client.catalog({}),
        client.targets(),
      ]);
      signal.throwIfAborted();
      return {
        operations: catalog.operations,
        targets: new Map(
          targets.targets.map((target) => [target.id, target.label])
        ),
      };
    },
    retry: false,
  });

  const targetHref = (targetId: string, pluginId: string) => {
    const mount = pages.find(
      (candidate) => candidate.owner.instance === pluginId
    );
    return mount && workspacePageHref(mount, []);
  };

  return (
    <section {...stylex.props(page.page)}>
      <div {...stylex.props(page.column)}>
        <ConsolePageHeader
          title={copy("Management", "管理")}
          description={copy(
            "Read-only directory of operations available to your account. Perform actions on the installed service page.",
            "只读展示当前账号可用的操作。请前往已安装服务页面执行操作。"
          )}
          actions={
            <Button
              variant="ghost"
              disabled={query.isFetching}
              onClick={async () => {
                await query.refetch();
              }}
            >
              {copy("Refresh", "刷新")}
            </Button>
          }
        />
        {query.isPending && (
          <output>{copy("Loading operations…", "正在加载操作…")}</output>
        )}
        {query.isError && (
          <p role="alert">
            {query.error instanceof Error &&
            "status" in query.error &&
            (query.error.status === 401 || query.error.status === 403)
              ? copy(
                  "Access denied for this account.",
                  "当前账号无权查看操作目录。"
                )
              : copy(
                  "The operation directory could not be loaded. Refresh to try again.",
                  "无法加载操作目录，请刷新重试。"
                )}
          </p>
        )}
        {query.data && !query.isError && (
          <div
            {...stylex.props(styles.list)}
            aria-label={copy("Available operations", "可用操作")}
          >
            {query.data.operations.length === 0 ? (
              <p>
                {copy(
                  "No operations are available for this account.",
                  "当前账号没有可用操作。"
                )}
              </p>
            ) : (
              query.data.operations.map((operation) => {
                const href = targetHref(operation.targetId, operation.pluginId);
                return (
                  <article
                    key={operation.key}
                    {...stylex.props(styles.operation)}
                  >
                    <h2 {...stylex.props(styles.heading)}>
                      {operation.description}
                    </h2>
                    <p {...stylex.props(styles.detail)}>
                      {copy("Plugin", "插件")}: {operation.pluginId} ·{" "}
                      {copy("Method", "方法")}: {operation.method}
                    </p>
                    <p {...stylex.props(styles.detail)}>
                      {copy("Target", "目标")}:{" "}
                      {query.data.targets.get(operation.targetId) ??
                        operation.targetId}{" "}
                      · {copy("Effect", "影响")}: {operation.effect}
                    </p>
                    <p {...stylex.props(styles.detail)}>
                      {copy("Availability", "可用性")}:{" "}
                      {operation.available
                        ? copy("Available", "可用")
                        : (operation.unavailableReason ??
                          copy("Unavailable", "不可用"))}
                      {" · "}
                      {copy("Confirmation", "确认")}:{" "}
                      {operation.confirmation
                        ? copy("Required", "需要")
                        : copy("Not required", "不需要")}
                      {" · "}
                      {copy("Approval", "审批")}:{" "}
                      {operation.approval
                        ? copy("Required", "需要")
                        : copy("Not required", "不需要")}
                    </p>
                    {href && (
                      <a {...stylex.props(styles.link)} href={href}>
                        {copy("Open installed service", "打开已安装服务")}
                      </a>
                    )}
                  </article>
                );
              })
            )}
          </div>
        )}
        <p {...stylex.props(page.description)}>
          {copy(
            "Actions are performed on the installed authorized service pages. This directory does not execute operations or manage approvals.",
            "操作需在已安装且获授权的服务页面中执行。本目录不执行操作或管理审批。"
          )}
        </p>
      </div>
    </section>
  );
}

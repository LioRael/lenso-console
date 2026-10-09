import type { PageProps } from "@lenso/console-sdk";
import { Button } from "@lenso/ui/button";

import {
  ManagementFrame,
  ReadState,
  refreshManagementRead,
  useManagementRead,
} from "../shared";
import { authorizationInspectionSchema } from "./schema";

import "../styles.css";

export { authorizationInspectionSchema } from "./schema";

export default function AuthorizationPage(props: PageProps) {
  const zh = props.environment.locale === "zh-CN";
  const t = (en: string, cn: string) => (zh ? cn : en);
  const result = useManagementRead(
    props,
    "authorization",
    "inspect",
    {},
    authorizationInspectionSchema,
    "authorization.inspect"
  );
  const data = result.error ? undefined : result.data;
  return (
    <ManagementFrame
      title={t("Authorization", "授权")}
      description={t(
        "Inspect roles and bindings in the host-authorized scope. This page is read-only; role and binding changes are not exposed.",
        "查看主机授权范围内的角色和绑定。本页为只读，不提供角色或绑定修改。"
      )}
      actions={
        <Button
          variant="secondary"
          disabled={result.refreshing}
          onClick={() => void refreshManagementRead(result)}
        >
          {t("Refresh", "刷新")}
        </Button>
      }
    >
      <ReadState result={result} locale={props.environment.locale} />
      {data && (
        <>
          <p className="management-muted">
            {t("Revision", "版本")}: <code>{data.revision}</code>
          </p>
          <section>
            <h2>{t("Roles", "角色")}</h2>
            {data.graph.roles.length === 0 && (
              <p>
                {t(
                  "No roles in this authorized scope.",
                  "此授权范围内没有角色。"
                )}
              </p>
            )}
            {data.graph.roles.map((role) => (
              <article
                className="management-detail"
                key={`${role.scope.type}:${role.scope.id}:${role.id}`}
              >
                <h3>{role.id}</h3>
                <p>
                  {t("Scope", "范围")}: {role.scope.type} / {role.scope.id}
                </p>
                {!!role.inherits?.length && (
                  <p>
                    {t("Inherits", "继承")}: {role.inherits.join(", ")}
                  </p>
                )}
                {role.permissions.length === 0 ? (
                  <p>{t("No direct permissions.", "无直接权限。")}</p>
                ) : (
                  <ul>
                    {role.permissions.map((permission, index) => (
                      <li key={index}>
                        <code>{permission.action}</code> ·{" "}
                        {permission.resourceType}
                        {permission.resourceId
                          ? ` / ${permission.resourceId}`
                          : ` (${t("all resources of this type", "此类型的所有资源")})`}
                        {" · "}
                        {permission.scope.type} / {permission.scope.id}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </section>
          <section>
            <h2>{t("Bindings", "绑定")}</h2>
            {data.graph.bindings.length === 0 && (
              <p>
                {t(
                  "No bindings in this authorized scope.",
                  "此授权范围内没有绑定。"
                )}
              </p>
            )}
            {data.graph.bindings.map((binding) => (
              <article className="management-detail" key={binding.id}>
                <h3>{binding.roleId}</h3>
                <dl className="management-meta">
                  <dt>{t("Binding", "绑定")}</dt>
                  <dd>{binding.id}</dd>
                  <dt>{t("Principal", "主体")}</dt>
                  <dd>
                    {binding.principal.realmId} / {binding.principal.kind} /{" "}
                    {binding.principal.subjectId}
                  </dd>
                  <dt>{t("Scope", "范围")}</dt>
                  <dd>
                    {binding.scope.type} / {binding.scope.id}
                  </dd>
                  <dt>{t("Expiry", "到期时间")}</dt>
                  <dd>
                    {binding.expiresAt === undefined
                      ? t("No expiry", "无到期时间")
                      : new Date(binding.expiresAt).toLocaleString(
                          props.environment.locale
                        )}
                    {binding.expiresAt !== undefined &&
                      binding.expiresAt <= Date.now() &&
                      ` (${t("Expired", "已到期")})`}
                  </dd>
                </dl>
              </article>
            ))}
          </section>
        </>
      )}
    </ManagementFrame>
  );
}

import { Button } from "@lenso/ui/button";
import { Link as LensoLink } from "@lenso/ui/link";
import * as stylex from "@stylexjs/stylex";
import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, House, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import { routeStateStyles as styles } from "./route-states.stylex";

export const RoutePending = () => (
  <RouteState
    description="正在准备工作台内容。"
    icon={<LoaderCircle aria-hidden="true" size={18} />}
    title="正在加载 Console"
  />
);

export const RouteNotFound = () => (
  <RouteState
    action={
      <LensoLink render={<Link to="/" />}>
        <House aria-hidden="true" size={14} />
        返回工作台
      </LensoLink>
    }
    description="此页面已移除或不存在。请返回新的工作台。"
    icon={<House aria-hidden="true" size={18} />}
    title="页面不存在"
  />
);

export const RouteError = () => {
  const router = useRouter();
  return (
    <RouteState
      action={
        <Button onClick={() => void router.invalidate()} variant="primary">
          重新加载
        </Button>
      }
      description="工作台未能加载。请重新加载；若问题仍在，请检查本地开发日志。"
      icon={<AlertTriangle aria-hidden="true" size={18} />}
      title="工作台加载失败"
    />
  );
};

function RouteState({
  action,
  description,
  icon,
  title,
}: {
  action?: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <main {...stylex.props(styles.root)}>
      <span {...stylex.props(styles.icon)}>{icon}</span>
      <h1 {...stylex.props(styles.title)}>{title}</h1>
      <p {...stylex.props(styles.description)}>{description}</p>
      {action}
    </main>
  );
}

import type { ConsoleLocale } from "@lenso/console-package-api";

const copy = {
  en: {
    nav: {
      home: "Home",
      system: "System",
      modules: "Modules",
      changes: "Changes",
      runtime: "Runtime",
      stories: "Stories",
      delivery: "Delivery",
      settings: "Settings",
    },
    production: "Production",
    search: "Search or run command",
    updated: "Updated 12s ago",
    workspace: "Workspace",
    operator: "Operator",
  },
  "zh-CN": {
    nav: {
      home: "首页",
      system: "系统",
      modules: "模块",
      changes: "变更",
      runtime: "运行时",
      stories: "业务故事",
      delivery: "交付",
      settings: "设置",
    },
    production: "生产环境",
    search: "搜索或运行命令",
    updated: "12 秒前更新",
    workspace: "工作区",
    operator: "操作员",
  },
} as const;

export function consoleCopy(locale: ConsoleLocale) {
  return copy[locale];
}

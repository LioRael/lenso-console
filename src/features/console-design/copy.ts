import type { ConsoleLocale } from "@lenso/console-ui";

const product = {
  en: {
    settings: {
      title: "Settings",
      description: "Workspace identity and personal Console preferences.",
      timeZone: "Timezone",
      languageDescription:
        "Controls Console navigation and text supplied by extensions.",
      consoleLanguage: "Console language",
      followSystem: "System",
      unsaved: "Unsaved changes",
      saved: "Saved",
      noChanges: "No changes",
    },
  },
  "zh-CN": {
    settings: {
      title: "设置",
      description: "管理工作区身份与个人 Console 偏好。",
      timeZone: "时区",
      languageDescription: "应用于 Console 导航以及扩展提供的文本。",
      consoleLanguage: "Console 语言",
      followSystem: "跟随系统",
      unsaved: "有未保存更改",
      saved: "已保存",
      noChanges: "没有更改",
    },
  },
} as const;

export function consoleProductCopy(locale: ConsoleLocale) {
  return product[locale];
}

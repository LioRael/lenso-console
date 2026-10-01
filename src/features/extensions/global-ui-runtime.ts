import * as reactQuery from "@tanstack/react-query";
import * as reactRouter from "@tanstack/react-router";
import * as reactDom from "react-dom";
import * as reactDomClient from "react-dom/client";

import { useConsoleLocale } from "../../app/console-locale";
import { useConsoleSession } from "../../app/console-session";
import * as http from "../../lib/http-client";
import * as sessionHttp from "../../lib/session-fetch";
import { useAgentIdentity } from "../agent/agent-identity-context";
import { useAgentQuickPanel } from "../agent/agent-quick-panel-context";
import * as drafts from "../agent/use-agent-draft";

// Public singleton adapters. These contain UI state and same-origin HTTP only;
// neither installation nor this browser module grants backend capability access.
export const globalUiModules = {
  "react-dom": reactDom,
  "react-dom/client": reactDomClient,
  "@tanstack/react-query": reactQuery,
  "@tanstack/react-router": reactRouter,
  "@lenso/console-sdk/session": { useConsoleSession },
  "@lenso/console-sdk/locale": { useConsoleLocale },
  "@lenso/console-sdk/agent-target": { useAgentIdentity },
  "@lenso/console-sdk/assistant": { useAgentQuickPanel },
  "@lenso/console-sdk/drafts": drafts,
  "@lenso/console-sdk/http": http,
  "@lenso/console-sdk/session-http": sessionHttp,
} as const;

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

// Workspace aliases can hide missing exports or declarations. Consume the
// backend, SDK and required framework patches as real archives in an empty app.
test(
  "packed TS Console resolves public declarations and invokes the installed plugin",
  { timeout: 180_000 },
  () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "console-ts-consumer-"));
    const root = path.resolve(".");
    try {
      const emptyConfig = path.join(temp, "npmrc");
      fs.writeFileSync(emptyConfig, "");
      const env = {
        ...process.env,
        NPM_CONFIG_GLOBALCONFIG: path.join(temp, "global-npmrc"),
        NPM_CONFIG_REGISTRY: "https://registry.npmjs.org",
        NPM_CONFIG_USERCONFIG: emptyConfig,
      };
      fs.writeFileSync(env.NPM_CONFIG_GLOBALCONFIG, "");
      const pack = (directory) => {
        const [archive] = Object.values(
          JSON.parse(
            execFileSync(
              "npm",
              [
                "pack",
                directory,
                "--ignore-scripts",
                "--json",
                "--pack-destination",
                temp,
              ],
              { encoding: "utf-8", env }
            )
          )
        );
        return `file:${path.join(temp, archive.filename)}`;
      };
      const sdk = pack(path.join(root, "packages/console-authoring"));
      const backend = pack(path.join(root, "packages/console"));
      const frameworkSource = JSON.parse(
        fs.readFileSync(
          path.join(root, ".artifacts/framework/source.json"),
          "utf-8"
        )
      );
      const pin = JSON.parse(
        fs.readFileSync(
          path.join(root, "tooling/distribution/framework-source.json"),
          "utf-8"
        )
      );
      assert.equal(frameworkSource.source, pin.revision);
      for (const archive of frameworkSource.artifacts) {
        const content = fs.readFileSync(
          path.join(root, ".artifacts/framework", archive.filename)
        );
        assert.equal(
          createHash("sha256").update(content).digest("hex"),
          archive.sha256
        );
      }
      const frameworkArtifacts = Object.fromEntries(
        frameworkSource.artifacts.map(({ package: name, filename }) => [
          name,
          `file:${path.join(root, ".artifacts/framework", filename)}`,
        ])
      );
      fs.writeFileSync(
        path.join(temp, "package.json"),
        JSON.stringify({
          dependencies: {
            "@lenso/console": backend,
            "@lenso/console-sdk": sdk,
            ...frameworkArtifacts,
            "drizzle-orm": "0.45.3",
            react: "19.2.8",
            typescript: "7.0.2",
            zod: "4.6.5",
          },
          overrides: {
            "@lenso/console-sdk": sdk,
            ...frameworkArtifacts,
          },
          private: true,
          type: "module",
        })
      );
      execFileSync(
        "npm",
        ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
        { cwd: temp, env, stdio: "pipe" }
      );
      fs.writeFileSync(
        path.join(temp, "client.ts"),
        `
import {createConsoleClient} from "@lenso/console-sdk/transport";
import type {PageProps} from "@lenso/console-sdk";
export const client = createConsoleClient({origin:"https://console.test"});
export const read = (page:PageProps) => page.services.invoke("notes", "read", {});
`
      );
      fs.writeFileSync(
        path.join(temp, "check.ts"),
        `
import {createConsolePlugin, consoleConfiguration} from "@lenso/console";
import {createConsoleAuthentication} from "@lenso/console/auth";
import {createConsoleAuditIntegration} from "@lenso/console/audit";
import {createConsoleApiKeyManage, createConsoleApiKeyCredentials} from "@lenso/console/api-keys";
import {createConsoleAuthorizationPolicy} from "@lenso/console/authorization";
import {createConsoleTasksIntegration} from "@lenso/console/tasks";
import {createConsoleSchedulerIntegration} from "@lenso/console/scheduler";
import {createConsoleLimitsBinding} from "@lenso/console/limits";
import type {ConsoleOptions} from "@lenso/console";
const factory: (options:ConsoleOptions)=>ReturnType<typeof createConsolePlugin> = createConsolePlugin;
void [factory, createConsoleAuthentication, consoleConfiguration,
  createConsoleAuditIntegration, createConsoleApiKeyManage, createConsoleApiKeyCredentials,
  createConsoleAuthorizationPolicy, createConsoleTasksIntegration,
  createConsoleSchedulerIntegration, createConsoleLimitsBinding];
`
      );
      execFileSync(
        "node",
        [
          "node_modules/typescript/bin/tsc",
          "--ignoreConfig",
          "--noEmit",
          "--strict",
          "--target",
          "ES2022",
          "--module",
          "ESNext",
          "--moduleResolution",
          "Bundler",
          "--skipLibCheck",
          "check.ts",
          "client.ts",
        ],
        { cwd: temp, env, stdio: "pipe" }
      );
      fs.writeFileSync(
        path.join(temp, "probe.ts"),
        `
import {audience, createAuth, defineSource, realm} from "@lenso/auth";
import {definePlugin, startApp} from "@lenso/core";
import {defineOperation} from "@lenso/engine/operations";
import {defineManage} from "@lenso/manage";
import {createConsolePlugin, type ConsoleIdentity, type ConsoleResource} from "@lenso/console";
import {createConsoleAuthentication} from "@lenso/console/auth";
import {createConsoleClient, createConsoleWorkspaceServices} from "@lenso/console-sdk/transport";
import {z} from "zod";
const authentication = definePlugin({id:"auth", setup(ctx) {
  const auth=createAuth(realm("consumer",defineSource({async verify(token:string|null) {
    return token==="fixture" ? {status:"verified",subjectId:"reader"} : {status:"rejected"};
  }})));
  ctx.onCleanup(()=>auth.close());
  return createConsoleAuthentication({
    access:auth.for(audience("console")).memberships(async (_actor,resource:{tenantId:string})=>
      resource.tenantId==="test" ? {active:true} : null),
    policy:({membership})=>membership.active,
    requestPolicy:{origin:"https://console.test",credentialMode:"bearer"},
    evidence:req=>req.headers.get("authorization")?.slice(7)??null,
    permissionRevision:()=> "1", session:()=>({administrator:false,workspace_ids:[]}),
  });
}});
const plugin=definePlugin({id:"notes",requires:[authentication],setup(ctx) {
  const auth=ctx.get(authentication);
  return {async read(input:{message:string},context:{identity:ConsoleIdentity;resource:ConsoleResource}) {
    await auth.enforce(context.identity,context.resource);
    return {message:input.message,subject:context.identity.actor.subjectId};
  }, async *watch(input:{message:string},context:{identity:ConsoleIdentity;resource:ConsoleResource}) {
    await auth.enforce(context.identity,context.resource);
    yield {message:input.message,privatePayload:"not-public"};
  }};
}});
const operation=defineOperation({plugin,method:"read",context:true,effect:"read",
  description:"Read a selected service",input:z.object({message:z.string()})});
const watch=defineOperation({plugin,method:"watch",context:true,effect:"read",
  description:"Watch a selected service",input:z.object({message:z.string()})});
const manage=defineManage({plugin,operations:[operation]});
const digest="a".repeat(64);
const mount={
  descriptor:{apiMajor:1 as const,id:"notes-page",title:"Notes",subject:{kind:"console" as const},
    owner:{instance:"notes",source:"application" as const,trusted:true as const},revision:"1",implementationId:digest,
    basePath:"/notes",module:"/api/console/v1/pages/notes-page/assets/"+digest+"/page.mjs",styles:[],
    navigation:{label:"Notes",items:[]},requirements:[{service_id:"notes",capability_id:"notes",descriptor_version:"1",
      operations:["read","watch"],available:true,required:true,source:"owner" as const}]},
  services:{notes:{manage,operations:[operation],streams:[{operation:watch,output:z.object({message:z.string()})}]}},
  asset:async()=>undefined,
};
const consolePlugin=createConsolePlugin({
  authentication,management:true,
  targets:[{id:"app",label:"App",tenantId:"test",plugins:[plugin],manage:[manage],mounts:[mount]}],
  binding:(_op,_input,_req,identity,resource)=>({context:{identity,resource}}),
});
const app=await startApp({plugins:[authentication,plugin,consolePlugin]});
try {
  for (const entry of ["audit","api-keys","authorization","tasks","scheduler","limits"]) {
    await import("@lenso/console/"+entry);
  }
  const service=app.get(consolePlugin);
  const client=createConsoleClient({origin:"https://console.test",headers:{authorization:"Bearer fixture"},
    fetch:async (url,init)=>await service.fetch(new Request(url,init))??new Response(null,{status:404})});
  const catalog=await client.catalog({});
  const result=await client.invoke({targetId:"app",key:catalog.operations[0]!.key,input:{message:"你好 🌍"}});
  if(JSON.stringify(result)!==JSON.stringify({message:"你好 🌍",subject:"reader"})) throw new Error("Wrong bound result");
  const headers={authorization:"Bearer fixture","x-lenso-page-owner":"notes","x-lenso-page-revision":"1",
    "x-lenso-page-implementation":digest,"x-lenso-expected-subject":"reader"};
  const pages=await service.fetch(new Request("https://console.test/api/console/v1/pages",{headers}));
  const admitted=await pages!.json();
  const workspace=createConsoleWorkspaceServices({origin:"https://console.test",headers,mount:admitted.mounts[0],
    fetch:async(url,init)=>await service.fetch(new Request(url,init))??new Response(null,{status:404})});
  const items=[];
  for await(const item of workspace.subscribe("notes","watch",{message:"你好 🌍"})) items.push(item);
  if(JSON.stringify(items)!==JSON.stringify([{message:"你好 🌍"}])) throw new Error("Wrong streamed DTO");
} finally {await app.stop();}
const bundle=await Bun.build({entrypoints:["client.ts"],target:"browser"});
if(!bundle.success) throw new Error("Browser bundle failed");
const text=await bundle.outputs[0]!.text();
if(/@lenso\\/(core|auth|engine)|node:|bun:sqlite/.test(text)) throw new Error("Server dependency entered the browser");
console.log("packed Console invocation and browser boundary passed");
`
      );
      for (const conditions of [[], ["--conditions=lenso-source"]]) {
        const output = execFileSync("bun", [...conditions, "probe.ts"], {
          cwd: temp,
          encoding: "utf-8",
          env,
        });
        assert.match(
          output,
          /packed Console invocation and browser boundary passed/u
        );
      }
    } finally {
      fs.rmSync(temp, { force: true, recursive: true });
    }
  }
);

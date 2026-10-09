import { test } from "bun:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Workspace aliases can hide missing exports or declarations. This consumer
// installs candidate archives with normal published framework dependencies.
test("candidate SDK authors a typed page and service admitted by the packed Console", () => {
  const temp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "console-ts-consumer-"))
  );
  try {
    const userConfig = path.join(temp, "npmrc");
    const globalConfig = path.join(temp, "global-npmrc");
    fs.writeFileSync(userConfig, "");
    fs.writeFileSync(globalConfig, "");
    const env = {
      ...process.env,
      NPM_CONFIG_GLOBALCONFIG: globalConfig,
      NPM_CONFIG_REGISTRY: "https://registry.npmjs.org",
      NPM_CONFIG_USERCONFIG: userConfig,
    };
    const run = (command, args) =>
      execFileSync(command, args, {
        cwd: temp,
        encoding: "utf-8",
        env,
        stdio: "pipe",
      });
    const consumeArchive = (directory, supplied) => {
      const filename =
        supplied === undefined
          ? (() => {
              const packagePath = path.resolve(directory);
              const manifest = JSON.parse(
                fs.readFileSync(path.join(packagePath, "package.json"), "utf-8")
              );
              const archivePath = path.join(
                temp,
                `${manifest.name.replace("/", "-").replace("@", "")}-${manifest.version}.tgz`
              );
              execFileSync(
                "bun",
                [
                  "pm",
                  "pack",
                  "--ignore-scripts",
                  "--quiet",
                  "--filename",
                  archivePath,
                ],
                { cwd: packagePath }
              );
              return archivePath;
            })()
          : fs.realpathSync(supplied);
      return {
        integrity: `sha512-${createHash("sha512").update(fs.readFileSync(filename)).digest("base64")}`,
        spec: `file:${filename}`,
      };
    };
    const sdk = consumeArchive(
      "packages/console-authoring",
      process.env.LENSO_AUTHOR_ARCHIVE
    );
    const backend = consumeArchive(
      "packages/console",
      process.env.LENSO_CONSOLE_ARCHIVE
    );
    fs.writeFileSync(
      path.join(temp, "package.json"),
      JSON.stringify({
        dependencies: {
          "@lenso/api-keys": "0.1.4",
          "@lenso/audit": "0.3.1",
          "@lenso/auth": "0.3.1",
          "@lenso/authorization": "0.3.1",
          "@lenso/console": backend.spec,
          "@lenso/console-sdk": sdk.spec,
          "@lenso/core": "0.3.1",
          "@lenso/limits": "0.2.1",
          "@lenso/scheduler": "0.3.1",
          "@lenso/tasks": "0.4.0",
          "@types/node": "26.1.2",
          "drizzle-orm": "0.45.3",
          react: "19.2.8",
          typescript: "7.0.2",
        },
        private: true,
        type: "module",
      })
    );
    run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"]);
    const installed = JSON.parse(
      fs.readFileSync(path.join(temp, "package-lock.json"), "utf-8")
    );
    for (const [name, archive] of [
      ["@lenso/console", backend],
      ["@lenso/console-sdk", sdk],
    ]) {
      assert.equal(
        installed.packages[`node_modules/${name}`].integrity,
        archive.integrity,
        `Consumer must install the exact candidate ${name} archive`
      );
    }

    const entry = path.join(temp, "console");
    const output = path.join(temp, ".lenso/console");
    const cli = path.join(temp, "node_modules/@lenso/console-sdk/author.mjs");
    run("bun", [cli, "init", entry]);
    run("bun", [cli, "build", "--entry", entry, "--out", output]);
    fs.writeFileSync(
      path.join(entry, "workspace.ts"),
      `import {defineWorkspace} from "@lenso/console-sdk";
export default defineWorkspace({id:"notes",title:"Notes",path:"/notes/",services:["orders"]});`
    );
    fs.writeFileSync(
      path.join(entry, "services.ts"),
      `import {defineServices,operation,streamOperation} from "@lenso/console-sdk/server";
let executions=0;
const parse=(value:unknown)=>{
  if(typeof value!=="object"||value===null||!("id" in value)||typeof value.id!=="string") {
    throw new Error("SERVER_ONLY_ORDER_VALIDATION");
  }
  return {id:value.id};
};
export default defineServices({orders:{
  capabilityId:"fixture.orders@1",version:"1.0.0",
  operations:{
    read:operation({effect:"read",parse,authorize:(_context,input)=>input.id==="42",
      handle(input){return {id:input.id,title:"你好 🌍",executions:++executions};}}),
    watch:streamOperation({effect:"read",parse,authorize:(_context,input)=>input.id==="42",
      async *handle(input){yield {id:input.id,title:"你好 🌍"};}}),
  },
}});`
    );
    const page = `import type {PageProps} from "@lenso/console-sdk";
import {bindServices} from "@lenso/console-sdk/services";
export default function Page(props:PageProps) {
  const client=bindServices(props.services);
  void client.orders.read({id:"42"}).then(order=>order.title.toUpperCase());
  return <h1>Authored notes</h1>;
}`;
    fs.writeFileSync(path.join(entry, "page.tsx"), page);
    const authorArgs = [
      "--entry",
      entry,
      "--out",
      output,
      "--plugin-id",
      "notes.owner",
    ];
    run("bun", [cli, "build", ...authorArgs]);
    const descriptor = JSON.parse(
      fs.readFileSync(path.join(output, "descriptor.json"), "utf-8")
    );
    const browser = descriptor.assets
      .map((asset) =>
        Buffer.from(asset.content_base64, "base64").toString("utf-8")
      )
      .join("\n");
    assert.ok(browser.includes("Authored notes"));
    assert.doesNotMatch(
      browser,
      /@lenso\/(core|auth|engine|manage)|node:|bun:sqlite|SERVER_ONLY_ORDER_VALIDATION/u
    );

    // Existing declaration imports cannot prove inferred business input/results.
    // Build the valid page first, then require both typed mistakes to fail.
    fs.writeFileSync(
      path.join(entry, "page.tsx"),
      page
        .replace('{id:"42"}', "{id:42}")
        .replace("order.title.toUpperCase()", "order.missing")
    );
    const rejected = spawnSync("bun", [cli, "check", ...authorArgs], {
      cwd: temp,
      encoding: "utf-8",
      env,
    });
    assert.equal(rejected.error, undefined);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stdout + rejected.stderr, /number/u);
    assert.match(rejected.stdout + rejected.stderr, /missing/u);
    fs.writeFileSync(path.join(entry, "page.tsx"), page);

    fs.writeFileSync(
      path.join(temp, "check.ts"),
      `import {createConsolePlugin,consoleConfiguration} from "@lenso/console";
import {createConsoleAuthentication} from "@lenso/console/auth";
import {createConsoleAuditIntegration} from "@lenso/console/audit";
import {createConsoleApiKeyManage,createConsoleApiKeyCredentials} from "@lenso/console/api-keys";
import {createConsoleAuthorizationPolicy} from "@lenso/console/authorization";
import {createConsoleTasksIntegration} from "@lenso/console/tasks";
import {createConsoleSchedulerIntegration} from "@lenso/console/scheduler";
import {createConsoleLimitsBinding} from "@lenso/console/limits";
void [createConsolePlugin,consoleConfiguration,createConsoleAuthentication,
  createConsoleAuditIntegration,createConsoleApiKeyManage,createConsoleApiKeyCredentials,
  createConsoleAuthorizationPolicy,createConsoleTasksIntegration,
  createConsoleSchedulerIntegration,createConsoleLimitsBinding];`
    );
    fs.writeFileSync(
      path.join(temp, "probe.ts"),
      `import assert from "node:assert/strict";
import {audience,createAuth,defineSource,realm} from "@lenso/auth";
import {definePlugin,startApp} from "@lenso/core";
import {createConsolePlugin} from "@lenso/console";
import {createConsoleAuthentication} from "@lenso/console/auth";
import {createConsoleWorkspaceServices} from "@lenso/console-sdk/transport";
import plugin,{manage,createMount} from "./.lenso/console/plugin.ts";
const authentication=definePlugin({id:"auth",setup(ctx) {
  const auth=createAuth(realm("consumer",defineSource({async verify(token:string|null) {
    return token==="fixture"?{status:"verified",subjectId:"reader"}:{status:"rejected"};
  }})));
  ctx.onCleanup(()=>auth.close());
  return createConsoleAuthentication({
    access:auth.for(audience("console")).memberships(async (_actor,resource:{tenantId:string})=>
      resource.tenantId==="test"?{active:true}:null),
    policy:({membership})=>membership.active,
    requestPolicy:{origin:"https://console.test",credentialMode:"bearer"},
    evidence:req=>req.headers.get("authorization")?.slice(7)??null,
    permissionRevision:()=>"1",session:()=>({administrator:false,workspace_ids:[]}),
  });
}});
const mount=createMount({id:"notes",subject:{kind:"console"},basePath:"/notes/",targetId:"self"});
const consolePlugin=createConsolePlugin({authentication,management:true,
  targets:[{id:"self",label:"App",tenantId:"test",plugins:[plugin],manage:[manage],mounts:[mount]}],
  binding:(_op,_input,request)=>({context:{
    subject:mount.descriptor.subject,owner:mount.descriptor.owner,
    mountId:mount.descriptor.id,revision:mount.descriptor.revision,signal:request.signal,
  }}),
});
const app=await startApp({plugins:[authentication,plugin,consolePlugin]});
try {
  const service=app.get(consolePlugin);
  for(const entry of ["audit","api-keys","authorization","tasks","scheduler","limits"]) {
    await import("@lenso/console/"+entry);
  }
  const headers={authorization:"Bearer fixture","x-lenso-page-owner":mount.descriptor.owner.instance,
    "x-lenso-page-revision":mount.descriptor.revision,
    "x-lenso-page-implementation":mount.descriptor.implementationId,"x-lenso-expected-subject":"reader"};
  const fetch=async(url:RequestInfo|URL,init?:RequestInit)=>
    await service.fetch(new Request(url,init))??new Response(null,{status:404});
  const pages=await fetch("https://console.test/api/console/v1/pages",{headers});
  assert.equal(pages.status,200);
  const admitted=await pages.json();
  assert.equal(admitted.mounts.length,1);
  const workspace=createConsoleWorkspaceServices({origin:"https://console.test",headers,
    mount:admitted.mounts[0],fetch});
  assert.deepEqual(await workspace.invoke("orders","read",{id:"42"}),{id:"42",title:"你好 🌍",executions:1});
  await assert.rejects(()=>workspace.invoke("orders","read",{id:"99"}),{code:"FORBIDDEN",status:403});
  assert.deepEqual(await workspace.invoke("orders","read",{id:"42"}),{id:"42",title:"你好 🌍",executions:2});
  const items=[];
  for await(const item of workspace.subscribe("orders","watch",{id:"42"})) items.push(item);
  assert.deepEqual(items,[{id:"42",title:"你好 🌍"}]);
  const denied=await fetch("https://console.test/api/console/v1/pages");
  assert.equal(denied.status,401);
  const asset=await fetch("https://console.test"+mount.descriptor.module,{headers});
  assert.equal(asset.status,200);
} finally {await app.stop();}
console.log("candidate authoring, invocation, authorization and browser boundary passed");`
    );
    run("bun", [
      "node_modules/typescript/bin/tsc",
      "--ignoreConfig",
      "--noEmit",
      "--strict",
      "--types",
      "node",
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--allowImportingTsExtensions",
      "--skipLibCheck",
      "check.ts",
      "probe.ts",
    ]);
    assert.match(
      run("bun", ["probe.ts"]),
      /candidate authoring, invocation, authorization and browser boundary passed/u
    );
  } finally {
    fs.rmSync(temp, { force: true, recursive: true });
  }
}, 240_000);

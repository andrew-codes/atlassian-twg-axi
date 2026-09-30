import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLISH_SCRIPT = path.resolve(__dirname, "../../scripts/release/publish.mjs");
const PACKAGE = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"),
) as { name: string; version: string };

let server: Server | undefined;
afterEach(() => server?.close());

// A fake registry that serves the package document without the version until it has been
// asked `liveOnRequest` times (1 = live from the first request, Infinity = never live).
async function startRegistry(liveOnRequest: number) {
  const requests: string[] = [];
  server = createServer((req, res) => {
    requests.push(req.url ?? "");
    res.setHeader("content-type", "application/json");
    const live = requests.length >= liveOnRequest;
    res.end(
      JSON.stringify({
        name: PACKAGE.name,
        versions: live ? { [PACKAGE.version]: { version: PACKAGE.version } } : { "0.0.1": {} },
      }),
    );
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return { requests, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

// Runs publish.mjs against the fake registry with a fake `yarn` (publish) on PATH that prints
// `yarnOutput` and exits with `yarnStatus`. The poll delays are shrunk to milliseconds.
async function runPublish(opts: {
  registryUrl: string;
  yarnStatus: number;
  yarnOutput?: string;
  waitMs?: number;
}) {
  const dir = mkdtempSync(path.join(tmpdir(), "release-publish-"));
  const calls = path.join(dir, "calls");
  const yarn = path.join(dir, "yarn");
  writeFileSync(
    yarn,
    `#!/bin/sh\necho "$@" >> "${calls}"\nprintf '%s\\n' '${opts.yarnOutput ?? ""}' >&2\nexit ${opts.yarnStatus}\n`,
  );
  chmodSync(yarn, 0o755);
  const child = spawn(process.execPath, [PUBLISH_SCRIPT], {
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      RELEASE_REGISTRY_URL: opts.registryUrl,
      RELEASE_LIVE_WAIT_MS: String(opts.waitMs ?? 5000),
      RELEASE_LIVE_POLL_INITIAL_MS: "1",
      RELEASE_LIVE_POLL_MAX_MS: "5",
    },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const status = await new Promise<number | null>((resolve) => child.on("close", resolve));
  let publishCalls = "";
  try {
    publishCalls = readFileSync(calls, "utf8");
  } catch {
    // yarn never ran
  }
  return { status, stdout, stderr, publishCalls };
}

describe("release publish step", () => {
  it("skips the publish when the version is already live", async () => {
    const registry = await startRegistry(1);
    const result = await runPublish({ registryUrl: registry.url, yarnStatus: 1 });

    expect(result.status).toBe(0);
    expect(result.publishCalls).toBe("");
    expect(result.stdout).toContain("already live");
  });

  it("succeeds when the publish is accepted and the version is live right away", async () => {
    const registry = await startRegistry(2);
    const result = await runPublish({ registryUrl: registry.url, yarnStatus: 0 });

    expect(result.status).toBe(0);
    expect(result.publishCalls).toContain("npm publish --access public --provenance");
    expect(result.stdout).toContain("is live on npm");
  });

  it("keeps polling while npm is still validating and succeeds once the version appears", async () => {
    // Request 1 is the "already live?" check; the version appears on the 8th request.
    const registry = await startRegistry(8);
    const result = await runPublish({ registryUrl: registry.url, yarnStatus: 0 });

    expect(result.status).toBe(0);
    expect(registry.requests).toHaveLength(8);
    expect(result.stdout).toContain("is not live yet");
    expect(result.stdout).toContain("is live on npm");
  });

  it("busts the registry cache on every poll", async () => {
    const registry = await startRegistry(5);
    await runPublish({ registryUrl: registry.url, yarnStatus: 0 });

    expect(new Set(registry.requests).size).toBe(registry.requests.length);
    for (const url of registry.requests) expect(url).toMatch(/\?cachebust=/);
  });

  it("fails without tagging when the version never appears within the wait window", async () => {
    const registry = await startRegistry(Infinity);
    const result = await runPublish({ registryUrl: registry.url, yarnStatus: 0, waitMs: 100 });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("::error title=Publish to npm::");
    expect(result.stderr).toContain("was still not live after");
    expect(result.stderr).toContain("npm may still be validating");
    expect(result.stderr).toContain("re-run this job once the version");
    expect(result.stdout).not.toContain("is live on npm");
  });

  it("explains a leftover staged version instead of failing confusingly", async () => {
    const registry = await startRegistry(Infinity);
    const result = await runPublish({
      registryUrl: registry.url,
      yarnStatus: 1,
      yarnOutput: 'YN0035: Cannot publish over previously staged version "0.2.0".',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("still waiting for approval");
    expect(result.stderr).toContain("npm stage reject");
  });

  it("propagates unrelated publish failures", async () => {
    const registry = await startRegistry(Infinity);
    const result = await runPublish({
      registryUrl: registry.url,
      yarnStatus: 7,
      yarnOutput: "YN0033: No authentication configured",
    });

    expect(result.status).toBe(7);
    expect(result.stderr).toContain("No authentication configured");
  });
});

import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLISH_SCRIPT = path.resolve(__dirname, "../../scripts/release/publish.mjs");

// Runs publish.mjs with fake `npm` (registry lookup) and `yarn` (publish) on PATH.
// `npm view` succeeds only when `live` says so; `yarn npm publish` prints `yarnOutput`,
// exits with `yarnStatus`, and makes the version live afterwards when `liveAfterPublish`.
function runPublish(opts: {
  live?: boolean;
  yarnStatus: number;
  yarnOutput?: string;
  liveAfterPublish?: boolean;
}) {
  const dir = mkdtempSync(path.join(tmpdir(), "release-publish-"));
  const marker = path.join(dir, "live");
  const calls = path.join(dir, "calls");
  const bin = (name: string, body: string) => {
    const file = path.join(dir, name);
    writeFileSync(file, `#!/bin/sh\n${body}\n`);
    chmodSync(file, 0o755);
  };
  if (opts.live) writeFileSync(marker, "");
  bin("npm", `[ -e "${marker}" ] && echo '"0.0.0"'`);
  bin(
    "yarn",
    [
      `echo "$@" >> "${calls}"`,
      `printf '%s\\n' '${opts.yarnOutput ?? ""}' >&2`,
      opts.liveAfterPublish ? `touch "${marker}"` : "",
      `exit ${opts.yarnStatus}`,
    ].join("\n"),
  );
  const result = spawnSync(process.execPath, [PUBLISH_SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      RELEASE_LIVE_CHECK_ATTEMPTS: "2",
      RELEASE_LIVE_CHECK_DELAY_MS: "1",
    },
  });
  const published = spawnSync("sh", ["-c", `[ -e "${calls}" ] && cat "${calls}"`], {
    encoding: "utf8",
  }).stdout;
  return { ...result, publishCalls: published };
}

describe("release publish step", () => {
  it("skips the publish when the version is already live", () => {
    const result = runPublish({ live: true, yarnStatus: 1 });

    expect(result.status).toBe(0);
    expect(result.publishCalls).toBe("");
    expect(result.stdout).toContain("already live");
  });

  it("succeeds when the publish is accepted and the version goes live", () => {
    const result = runPublish({ yarnStatus: 0, liveAfterPublish: true });

    expect(result.status).toBe(0);
    expect(result.publishCalls).toContain("npm publish --access public --provenance");
  });

  it("fails without tagging when the upload is accepted but the version never goes live", () => {
    const result = runPublish({ yarnStatus: 0 });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("::error title=Publish to npm::");
    expect(result.stderr).toContain("not live");
  });

  it("explains a leftover staged version instead of failing confusingly", () => {
    const result = runPublish({
      yarnStatus: 1,
      yarnOutput: 'YN0035: Cannot publish over previously staged version "0.2.0".',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("still waiting for approval");
    expect(result.stderr).toContain("npm stage reject");
  });

  it("propagates unrelated publish failures", () => {
    const result = runPublish({ yarnStatus: 7, yarnOutput: "YN0033: No authentication configured" });

    expect(result.status).toBe(7);
    expect(result.stderr).toContain("No authentication configured");
  });
});

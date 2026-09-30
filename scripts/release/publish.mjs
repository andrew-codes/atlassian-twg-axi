import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { isLive } from "./npm-registry.mjs";
import { waitUntilLive } from "./wait-until-live.mjs";

// Publishes the package and only exits 0 once the version is live on npm, so the tag and
// GitHub release steps that follow never run for a version nobody can install.
//
// npm accepts an upload before it serves it: it validates the version first and then makes it
// live on its own, which can take longer than the publish itself. So after an accepted publish
// this polls the registry, with backoff, for up to RELEASE_LIVE_WAIT_MS (15 minutes).
//
// If the version is already live (a rerun of a run that published), the publish is skipped.
// If npm answers 409 "Cannot publish over previously staged version", an earlier upload of
// this version is still waiting for approval on npmjs.com and has to be approved or rejected
// there before this step can succeed.

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const { name, version } = pkg;

const envMs = (key, fallback) => Number(process.env[key] ?? fallback);
const waitOptions = {
  timeoutMs: envMs("RELEASE_LIVE_WAIT_MS", 15 * 60 * 1000),
  initialDelayMs: envMs("RELEASE_LIVE_POLL_INITIAL_MS", 5000),
  maxDelayMs: envMs("RELEASE_LIVE_POLL_MAX_MS", 60_000),
  onWait: ({ elapsedMs, waitMs }) =>
    console.log(
      `${name}@${version} is not live yet (${Math.round(elapsedMs / 1000)}s elapsed); checking again in ${Math.round(waitMs / 1000)}s.`,
    ),
};

function fail(message) {
  console.error(`::error title=Publish to npm::${message.replaceAll("\n", "%0A")}`);
  console.error(message);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Release blocked\n\n${message}\n`);
  }
  process.exit(1);
}

if (await isLive(name, version)) {
  console.log(`v${version} is already live on npm; skipping publish.`);
  process.exit(0);
}

const publish = spawnSync("yarn", ["npm", "publish", "--access", "public", "--provenance"], {
  encoding: "utf8",
});
process.stdout.write(publish.stdout ?? "");
process.stderr.write(publish.stderr ?? "");

if (publish.status !== 0) {
  if (/previously staged/i.test(`${publish.stdout}${publish.stderr}`)) {
    fail(
      [
        `${name}@${version} was staged by an earlier upload and is still waiting for approval, so it cannot be published again.`,
        `Approve it on npmjs.com (${name} -> Staged Packages -> Approve), or reject it with`,
        "`npm stage list` and `npm stage reject <stage-id>`, then re-run this job.",
      ].join("\n"),
    );
  }
  process.exit(publish.status ?? 1);
}

const { live, waitedMs } = await waitUntilLive(() => isLive(name, version), waitOptions);
if (!live) {
  fail(
    [
      `${name}@${version} was accepted by npm but was still not live after ${Math.round(waitedMs / 1000)}s.`,
      "npm may still be validating it, in which case it goes live on its own; re-run this job once the version",
      `appears at https://www.npmjs.com/package/${name}?activeTab=versions. If it never appears, check whether`,
      "npm is holding it as a staged version (npm stage list) and approve or reject it.",
    ].join("\n"),
  );
}
console.log(`v${version} is live on npm.`);

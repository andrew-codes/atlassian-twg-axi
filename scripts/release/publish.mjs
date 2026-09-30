import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { isPublished } from "./npm-registry.mjs";

// Publishes the package and only exits 0 once the version is live on npm, so the tag and
// GitHub release steps that follow never run for a version nobody can install.
//
// If the version is already live (a rerun of a run that published), the publish is skipped.
// If npm answers 409 "Cannot publish over previously staged version", an earlier upload of
// this version is still waiting for approval on npmjs.com and has to be approved or rejected
// there before this step can succeed.

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const { name, version } = pkg;

const attempts = Number(process.env.RELEASE_LIVE_CHECK_ATTEMPTS ?? 6);
const delayMs = Number(process.env.RELEASE_LIVE_CHECK_DELAY_MS ?? 5000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntilLive() {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (isPublished(name, version)) return true;
    if (attempt < attempts) await sleep(delayMs);
  }
  return false;
}

function fail(message) {
  console.error(`::error title=Publish to npm::${message.replaceAll("\n", "%0A")}`);
  console.error(message);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Release blocked\n\n${message}\n`);
  }
  process.exit(1);
}

if (isPublished(name, version)) {
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

if (!(await waitUntilLive())) {
  fail(`${name}@${version} was accepted by npm but is not live. If npm is holding it as a staged version, approve it on npmjs.com and re-run this job.`);
}
console.log(`v${version} is live on npm.`);

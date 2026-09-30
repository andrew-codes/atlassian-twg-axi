import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { isPublished } from "./npm-registry.mjs";

// Publishes the package and only exits 0 once the version is live on npm.
//
// npm can accept a publish from the trusted publisher as a *staged* publish: the registry
// answers 2xx (yarn prints "Package archive published") but the version stays hidden until
// a maintainer approves it with 2FA. Publishing that version again is rejected with
// 409 "Cannot publish over previously staged version". Neither is a failure of this job's
// own work, but the commit, tag and GitHub release steps that follow must not run until the
// version is live, so a staged version stops the job here with instructions instead.

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

function stopAwaitingApproval(reason) {
  const message = [
    `${name}@${version} is not live on npm: ${reason}`,
    "",
    "npm holds trusted-publisher uploads as staged versions until a maintainer approves them with 2FA.",
    `Approve it on npmjs.com (${name} -> Staged Packages -> Approve), or run`,
    `\`npm stage list ${name}\` and \`npm stage approve <stage-id>\`. Then re-run this job:`,
    "it will find the version live, skip the publish, and finish the version bump commit, tag and GitHub release.",
    `To discard the staged version instead, run \`npm stage reject <stage-id>\` and re-run this job to stage it again.`,
  ].join("\n");
  console.error(`::error title=Awaiting npm approval::${message.replaceAll("\n", "%0A")}`);
  console.error(message);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Release blocked: awaiting npm approval\n\n${message}\n`);
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

if (publish.status === 0) {
  if (await waitUntilLive()) {
    console.log(`v${version} is live on npm.`);
    process.exit(0);
  }
  stopAwaitingApproval("the registry accepted the upload but did not list the version, so it is staged.");
}

const output = `${publish.stdout ?? ""}${publish.stderr ?? ""}`;
if (/previously staged/i.test(output)) {
  // An earlier run already submitted this version. It may have been approved since.
  if (isPublished(name, version)) {
    console.log(`v${version} was staged earlier and is now live on npm.`);
    process.exit(0);
  }
  stopAwaitingApproval("an earlier run already staged this version and it has not been approved yet.");
}

// Any other failure: a concurrent run may still have published it, otherwise surface the error.
if (isPublished(name, version)) {
  console.log(`Publish failed but v${version} is live on npm; continuing.`);
  process.exit(0);
}
process.exit(publish.status ?? 1);

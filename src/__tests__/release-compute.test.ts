import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPUTE_SCRIPT = path.resolve(__dirname, "../../scripts/release/compute-release.mjs");

// A fake `npm view` backed by env vars: FAKE_NPM_VERSIONS lists the live versions and
// FAKE_NPM_GITHEAD is the gitHead every live version reports.
const FAKE_NPM = `#!/usr/bin/env node
const [cmd, spec, field] = process.argv.slice(2);
const versions = JSON.parse(process.env.FAKE_NPM_VERSIONS ?? "[]");
const at = spec.lastIndexOf("@");
const version = at > 0 ? spec.slice(at + 1) : null;
if (cmd !== "view" || (version ? !versions.includes(version) : versions.length === 0)) process.exit(1);
if (field === "versions") console.log(JSON.stringify(versions));
else if (field === "version") console.log(JSON.stringify(version));
else if (field === "gitHead") console.log(JSON.stringify(process.env.FAKE_NPM_GITHEAD ?? ""));
`;

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function makeRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), "release-compute-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "user.email", "t@t");
  git(dir, "config", "commit.gpgsign", "false");
  git(dir, "config", "tag.gpgsign", "false");
  const npm = path.join(dir, "bin", "npm");
  execFileSync("mkdir", ["-p", path.dirname(npm)]);
  writeFileSync(npm, FAKE_NPM);
  chmodSync(npm, 0o755);
  return {
    dir,
    commit: (message: string) => {
      git(dir, "commit", "-q", "--allow-empty", "-m", message);
      return git(dir, "rev-parse", "HEAD");
    },
    tag: (name: string) => git(dir, "tag", "-a", name, "-m", name),
    compute: (env: { versions: string[]; gitHead?: string }) => {
      const result = spawnSync(process.execPath, [COMPUTE_SCRIPT], {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_OUTPUT: "",
          PATH: `${path.dirname(npm)}:${process.env.PATH}`,
          FAKE_NPM_VERSIONS: JSON.stringify(env.versions),
          FAKE_NPM_GITHEAD: env.gitHead ?? "",
        },
      });
      expect(result.status, result.stderr).toBe(0);
      const [singleLine, notes = ""] = result.stdout.split(/^notes<<\S+\n/m);
      return {
        ...Object.fromEntries(
          singleLine
            .split("\n")
            .filter((line) => /^[\w-]+=/.test(line))
            .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
        ),
        notes,
      };
    },
  };
}

describe("release version computation", () => {
  it("bumps from the latest version on npm when no tags exist", () => {
    const repo = makeRepo();
    repo.commit("feat: something new");

    expect(repo.compute({ versions: ["0.1.0"], gitHead: "elsewhere" }).version).toBe("0.2.0");
  });

  it("does not depend on the version in package.json", () => {
    const repo = makeRepo();
    repo.commit("fix: a bug");
    repo.tag("v1.4.0");

    // The placeholder in package.json is ignored; npm and tags decide.
    expect(repo.compute({ versions: ["1.4.0"], gitHead: "elsewhere" }).version).toBe("1.4.1");
  });

  it("takes the highest of npm and the tags", () => {
    const repo = makeRepo();
    repo.commit("fix: one");
    repo.tag("v0.2.0");
    repo.commit("fix: two");

    // npm is ahead of the tags: a run published 0.3.0 but never tagged it.
    expect(repo.compute({ versions: ["0.2.0", "0.3.0"], gitHead: "elsewhere" }).version).toBe(
      "0.3.1",
    );
    // A tag is ahead of npm: that version is staged or otherwise not live.
    expect(repo.compute({ versions: ["0.1.0"], gitHead: "elsewhere" }).version).toBe("0.2.1");
  });

  it("reuses the version a rerun of the same commit already published", () => {
    const repo = makeRepo();
    repo.commit("feat: something new");
    const head = repo.commit("fix: last change");

    const first = repo.compute({ versions: ["0.1.0"], gitHead: "elsewhere" });
    expect(first.version).toBe("0.2.0");

    // The run published 0.2.0 from this commit and then failed before tagging.
    const rerun = repo.compute({ versions: ["0.1.0", "0.2.0"], gitHead: head });
    expect(rerun.version).toBe("0.2.0");

    // It also holds after the tag exists but the GitHub release is still missing.
    repo.tag("v0.2.0");
    const afterTag = repo.compute({ versions: ["0.1.0", "0.2.0"], gitHead: head });
    expect(afterTag.version).toBe("0.2.0");
    expect(afterTag.notes).toContain("something new");
  });
});

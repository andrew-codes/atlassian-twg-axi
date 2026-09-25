import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { CommitParser } from "conventional-commits-parser";
import semver from "semver";

const HEADER_PATTERN = /^(\w*)(?:\((.*)\))?(!)?: (.*)$/;
const HEADER_CORRESPONDENCE = ["type", "scope", "breaking", "subject"];

const TYPE_LABELS = {
  feat: "Features",
  fix: "Bug Fixes",
};

function git(args, options = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...options }).trim();
}

function lastVersionTag() {
  try {
    return git(["describe", "--tags", "--abbrev=0", "--match=v[0-9]*.[0-9]*.[0-9]*"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

const RECORD_SEP = "";
const FIELD_SEP = "";

function commitsSince(tag) {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const log = git(["log", range, `--format=%H${FIELD_SEP}%B${RECORD_SEP}`]);
  if (!log) return [];
  return log
    .split(RECORD_SEP)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash, ...rest] = entry.split(FIELD_SEP);
      return { hash, message: rest.join(FIELD_SEP).trim() };
    });
}

function parseCommits(commits) {
  const parser = new CommitParser({
    headerPattern: HEADER_PATTERN,
    headerCorrespondence: HEADER_CORRESPONDENCE,
    noteKeywords: ["BREAKING CHANGE", "BREAKING-CHANGE"],
    revertPattern: /^(?:Revert|revert:)\s"?([\s\S]+?)"?\s*This reverts commit (\w*)\./i,
    revertCorrespondence: ["header", "hash"],
  });
  return commits.map(({ hash, message }) => ({
    hash,
    ...parser.parse(message),
  }));
}

function bumpTypeFor(parsedCommits) {
  let hasFeature = false;
  let hasFix = false;
  for (const commit of parsedCommits) {
    const isBreaking = commit.breaking === "!" || commit.notes.length > 0;
    if (isBreaking) return "major";
    if (commit.type === "feat") hasFeature = true;
    if (commit.type === "fix") hasFix = true;
  }
  if (hasFeature) return "minor";
  if (hasFix) return "patch";
  return "patch";
}

function releaseNotes(parsedCommits, { version, previousTag }) {
  const breaking = [];
  const features = [];
  const fixes = [];
  const other = [];

  for (const commit of parsedCommits) {
    const subject = commit.subject ?? commit.header;
    const scope = commit.scope ? `**${commit.scope}**: ` : "";
    const line = `- ${scope}${subject} (${commit.hash.slice(0, 7)})`;

    if (commit.breaking === "!" || commit.notes.length > 0) {
      breaking.push(line);
      for (const note of commit.notes) {
        breaking.push(`  ${note.text.split("\n")[0]}`);
      }
      continue;
    }
    if (commit.type === "feat") {
      features.push(line);
    } else if (commit.type === "fix") {
      fixes.push(line);
    } else {
      other.push(line);
    }
  }

  const sections = [];
  if (breaking.length) sections.push(["Breaking Changes", breaking]);
  if (features.length) sections.push([TYPE_LABELS.feat, features]);
  if (fixes.length) sections.push([TYPE_LABELS.fix, fixes]);
  if (other.length) sections.push(["Other Changes", other]);

  const header = `## v${version}${previousTag ? ` (since ${previousTag})` : ""}`;
  if (sections.length === 0) {
    return `${header}\n\nNo notable changes.`;
  }
  const body = sections
    .map(([title, lines]) => `### ${title}\n\n${lines.join("\n")}`)
    .join("\n\n");
  return `${header}\n\n${body}`;
}

function currentVersion() {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  return pkg.version;
}

async function writeGithubOutput(entries) {
  const outputFile = process.env.GITHUB_OUTPUT;
  const lines = [];
  for (const [key, value] of Object.entries(entries)) {
    if (value.includes("\n")) {
      const delimiter = `EOF_${key}_${Date.now()}`;
      lines.push(`${key}<<${delimiter}`, value, delimiter);
    } else {
      lines.push(`${key}=${value}`);
    }
  }
  if (outputFile) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(outputFile, lines.join("\n") + "\n");
  } else {
    process.stdout.write(lines.join("\n") + "\n");
  }
}

const previousTag = lastVersionTag();
const commits = commitsSince(previousTag);
const parsedCommits = parseCommits(commits);
const bump = bumpTypeFor(parsedCommits);
const nextVersion = semver.inc(currentVersion(), bump);
const notes = releaseNotes(parsedCommits, { version: nextVersion, previousTag });

await writeGithubOutput({
  version: nextVersion,
  bump,
  "previous-tag": previousTag ?? "",
  notes,
});

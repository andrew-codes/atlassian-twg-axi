import { execFileSync } from "node:child_process";

export const REGISTRY = "https://registry.npmjs.org";

function view(spec, field) {
  return execFileSync("npm", ["view", spec, field, "--json", "--registry", REGISTRY], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

// `npm view` exits non-zero (E404) when the package or version does not exist.
function viewOrNull(spec, field) {
  try {
    const out = view(spec, field);
    return out ? JSON.parse(out) : null;
  } catch {
    return null;
  }
}

export function isPublished(name, version) {
  return viewOrNull(`${name}@${version}`, "version") !== null;
}

// All versions live on the registry (empty for a package that was never published).
export function publishedVersions(name) {
  const versions = viewOrNull(name, "versions");
  return [versions ?? []].flat();
}

// The commit a version was published from (yarn records `gitHead` in the manifest).
export function publishedGitHead(name, version) {
  return viewOrNull(`${name}@${version}`, "gitHead");
}

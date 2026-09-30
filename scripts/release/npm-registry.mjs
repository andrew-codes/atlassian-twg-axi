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

// All versions live on the registry (empty for a package that was never published).
export function publishedVersions(name) {
  const versions = viewOrNull(name, "versions");
  return [versions ?? []].flat();
}

// The commit a version was published from (yarn records `gitHead` in the manifest).
export function publishedGitHead(name, version) {
  return viewOrNull(`${name}@${version}`, "gitHead");
}

// Where `isLive` looks. Overridable so tests can point it at a local server.
export const registryUrl = () => process.env.RELEASE_REGISTRY_URL ?? REGISTRY;

// True only when the registry currently serves `version` in the package document, which is
// what `npm install` reads. Package documents are served with `cache-control: public,
// max-age=300`, so a plain lookup can keep answering "not there" for five minutes after the
// version went live. A unique query string is a different cache key for the CDN and
// `no-cache` asks for revalidation; both are plain read-only GETs. A 404, a non-2xx
// answer, a network error or a document without the version all mean "not live yet".
export async function isLive(name, version, { fetchImpl = fetch } = {}) {
  const url = `${registryUrl()}/${name.replace("/", "%2F")}?cachebust=${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json", "cache-control": "no-cache" },
    });
    if (!response.ok) return false;
    const document = await response.json();
    return document?.versions?.[version]?.version === version;
  } catch {
    return false;
  }
}

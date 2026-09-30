import { execFileSync } from "node:child_process";

export const REGISTRY = "https://registry.npmjs.org";

// `npm view` exits non-zero (E404) when the version is not live on the registry. A version
// held by npm's staged publishing (awaiting approval) is not live and is not listed here.
export function isPublished(name, version) {
  try {
    execFileSync("npm", ["view", `${name}@${version}`, "version", "--registry", REGISTRY], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

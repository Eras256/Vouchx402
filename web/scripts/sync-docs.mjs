// Copies the real docs/TECHNICAL_SPEC.md (repo root) into web/content/ so
// the Docs page can read it as a committed, in-project file.
//
// Why this exists at all: Vercel's Root Directory setting is a hard
// boundary, not a togglable exception: "Your app will not be able to
// access files outside of that directory. You also cannot use `..` to
// move up a level." (vercel.com/docs/builds/configure-a-build, verified
// directly before writing this, not assumed). With this project's Root
// Directory set to `web`, a runtime read of `../docs/TECHNICAL_SPEC.md`
// would work locally but silently fail to resolve on Vercel. The Docs
// page reads the committed copy this script produces instead; run this
// whenever docs/TECHNICAL_SPEC.md changes, then commit the result.
//
// Guarded to no-op quietly (not error) when the parent repo isn't
// present, e.g. `npm run build` on Vercel itself, where Root Directory
// already cuts off `..` before this script would even get a chance to
// run. Only meant to help keep the local dev copy fresh automatically;
// never required to succeed for a build to proceed.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(scriptDir, "..", "..", "docs", "TECHNICAL_SPEC.md");
const destDir = path.join(scriptDir, "..", "content");
const dest = path.join(destDir, "technical-spec.md");

if (!existsSync(source)) {
  console.log("sync-docs: ../../docs/TECHNICAL_SPEC.md not reachable from here (expected on Vercel), skipping.");
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
writeFileSync(dest, readFileSync(source, "utf8"));
console.log(`sync-docs: copied ${source} -> ${dest}`);

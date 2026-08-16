import fs from "node:fs";
import path from "node:path";
import { extractToc } from "@/lib/toc";
import { DocsContent } from "./docs-content";

// Reads the committed copy at web/content/technical-spec.md, not
// docs/TECHNICAL_SPEC.md at the repo root directly: Vercel's Root
// Directory setting is a hard boundary ("Your app will not be able to
// access files outside of that directory... cannot use `..` to move up
// a level", vercel.com/docs/builds/configure-a-build, checked directly
// before this was written; an earlier version of this file assumed a
// dashboard toggle could relax that, which turned out not to exist).
// scripts/sync-docs.mjs keeps the copy in sync; see that file and
// DECISION_LOG.md for the full reasoning.
function readTechnicalSpec(): string {
  const specPath = path.join(process.cwd(), "content", "technical-spec.md");
  return fs.readFileSync(specPath, "utf-8");
}

export const metadata = {
  title: "Vouch402 Docs",
};

export default function DocsPage() {
  const markdown = readTechnicalSpec();
  const toc = extractToc(markdown);

  return <DocsContent markdown={markdown} toc={toc} />;
}

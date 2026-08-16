import fs from "node:fs";
import path from "node:path";
import { extractToc } from "@/lib/toc";
import { LegalContent } from "./legal-content";

// Currently drafted in Spanish only, for the Mexican legal context
// specifically requested. Still a review draft (see the pending-review
// banner rendered above the content itself) and is not represented as
// final or lawyer-approved anywhere on the page.
function readLegalContent(): string {
  const contentPath = path.join(process.cwd(), "content", "legal-es.md");
  return fs.readFileSync(contentPath, "utf-8");
}

export const metadata = {
  title: "Vouch402 Legal",
};

export default function LegalPage() {
  const markdown = readLegalContent();
  const toc = extractToc(markdown);

  return <LegalContent markdown={markdown} toc={toc} />;
}

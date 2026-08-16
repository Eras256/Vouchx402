import fs from "node:fs";
import path from "node:path";
import { extractToc } from "@/lib/toc";
import { LegalContent } from "./legal-content";

// Drafted for the Mexican legal context specifically requested, in both
// languages: legal-en.md is a literal translation of legal-es.md, not
// separate coverage for another jurisdiction (see the note at the top
// of each file). Still a review draft (see the pending-review banner
// rendered above the content itself) and is not represented as final
// or lawyer-approved anywhere on the page. Both are read server-side
// (fs) and handed to the client component, which picks one based on
// the live locale, same pattern as docs/.
function readLegalContent(locale: "en" | "es"): string {
  const contentPath = path.join(process.cwd(), "content", `legal-${locale}.md`);
  return fs.readFileSync(contentPath, "utf-8");
}

export const metadata = {
  title: "Vouch402 Legal",
};

export default function LegalPage() {
  const markdownEs = readLegalContent("es");
  const markdownEn = readLegalContent("en");

  return (
    <LegalContent
      content={{
        es: { markdown: markdownEs, toc: extractToc(markdownEs) },
        en: { markdown: markdownEn, toc: extractToc(markdownEn) },
      }}
    />
  );
}

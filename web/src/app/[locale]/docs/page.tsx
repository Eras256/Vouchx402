import fs from "node:fs";
import path from "node:path";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import { markdownComponents } from "@/components/docs/markdown-components";
import { TableOfContents } from "@/components/docs/table-of-contents";
import { extractToc } from "@/lib/toc";

// Reads the committed copy at web/content/technical-spec.md, not
// docs/TECHNICAL_SPEC.md at the repo root directly — Vercel's Root
// Directory setting is a hard boundary ("Your app will not be able to
// access files outside of that directory... cannot use `..` to move up
// a level" — vercel.com/docs/builds/configure-a-build, checked directly
// before this was written; an earlier version of this file assumed a
// dashboard toggle could relax that, which turned out not to exist).
// scripts/sync-docs.mjs keeps the copy in sync — see that file and
// DECISION_LOG.md for the full reasoning.
function readTechnicalSpec(): string {
  const specPath = path.join(process.cwd(), "content", "technical-spec.md");
  return fs.readFileSync(specPath, "utf-8");
}

export default function DocsPage() {
  const t = useTranslations("docs");
  const markdown = readTechnicalSpec();
  const toc = extractToc(markdown);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <div className="max-w-2xl">
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="prose-column mt-3 text-sm text-muted-foreground">{t("sourceNote")}</p>
      </div>

      <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_240px]">
        <article className="prose min-w-0 max-w-none prose-code:before:content-none prose-code:after:content-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSlug, rehypeHighlight]}
            components={markdownComponents}
          >
            {markdown}
          </ReactMarkdown>
        </article>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <TableOfContents entries={toc} title={t("tableOfContents")} />
          </div>
        </aside>
      </div>
    </div>
  );
}

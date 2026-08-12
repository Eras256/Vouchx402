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

// docs/TECHNICAL_SPEC.md lives at the repo root — this is a single repo,
// not a separate package, and the frontend has no backend/DB of its own
// to duplicate content into, so it's read directly rather than copied
// into web/ (which would drift out of sync with the real spec the first
// time either one is edited). Deploying with Vercel's Root Directory set
// to /web needs its "Include source files outside of the Root Directory"
// project setting enabled for this parent-relative read to resolve there
// — see DECISION_LOG.md.
function readTechnicalSpec(): string {
  const specPath = path.join(process.cwd(), "..", "docs", "TECHNICAL_SPEC.md");
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
        <article className="prose max-w-none prose-code:before:content-none prose-code:after:content-none">
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

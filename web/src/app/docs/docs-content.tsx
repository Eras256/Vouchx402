"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import { useTranslations } from "next-intl";
import { markdownComponents } from "@/components/docs/markdown-components";
import { TableOfContents } from "@/components/docs/table-of-contents";
import type { TocEntry } from "@/lib/toc";

// The spec content itself stays in English regardless of site language
// (technical reference content, standard developer-documentation
// convention, see the sourceNote copy below) — only this page's chrome
// (title, source note, ToC label) is translated. Reading the file is a
// server-only concern (fs), done once in page.tsx and passed down here.
export function DocsContent({ markdown, toc }: { markdown: string; toc: TocEntry[] }) {
  const t = useTranslations("docs");

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

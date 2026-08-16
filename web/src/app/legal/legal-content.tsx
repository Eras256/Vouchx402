"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import { AlertTriangle } from "lucide-react";
import { markdownComponents } from "@/components/docs/markdown-components";
import { TableOfContents } from "@/components/docs/table-of-contents";
import { useLocalePreference } from "@/components/locale-provider";
import type { TocEntry } from "@/lib/toc";

// Rendered above the article itself, not inside the markdown flow, so
// it's the first thing painted on the page rather than something a
// visitor has to scroll past the title to reach. Kept as blunt as the
// disclaimer text in the document body: this is a draft pending review,
// not a softened "for informational purposes" footer note. Reacts to
// the live locale, same as everything else on this page now.
function PendingReviewBanner({ locale }: { locale: "en" | "es" }) {
  const text =
    locale === "es"
      ? "Este documento es investigación técnico-regulatoria preliminar, no asesoría legal formal. Pendiente de revisión por un abogado mexicano con matrícula antes de considerarse definitivo."
      : "This document is preliminary technical-regulatory research, not formal legal advice. Pending review by a licensed Mexican attorney before it can be considered final.";

  return (
    <div className="border-b border-warning/30 bg-warning/10">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-4 sm:px-6">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <p className="text-sm font-medium text-warning-foreground">{text}</p>
      </div>
    </div>
  );
}

interface LocalizedDoc {
  markdown: string;
  toc: TocEntry[];
}

// legal-en.md is a literal translation of legal-es.md (same Mexico-
// specific analysis, same open questions, same citations), not
// separate coverage for another jurisdiction — each file says so
// explicitly at the top, and the translation itself repeats the point
// again in-page below. Switching between them is instant, reacting to
// the live locale, no navigation.
export function LegalContent({ content }: { content: Record<"en" | "es", LocalizedDoc> }) {
  const { locale } = useLocalePreference();
  const { markdown, toc } = content[locale];
  const tocTitle = locale === "es" ? "Contenido" : "Contents";

  return (
    <>
      <PendingReviewBanner locale={locale} />
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
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
              <TableOfContents entries={toc} title={tocTitle} />
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

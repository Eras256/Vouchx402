import fs from "node:fs";
import path from "node:path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import { AlertTriangle } from "lucide-react";
import { markdownComponents } from "@/components/docs/markdown-components";
import { TableOfContents } from "@/components/docs/table-of-contents";
import { extractToc } from "@/lib/toc";
import { Link } from "@/i18n/navigation";

// Rendered above the article itself, not inside the markdown flow, so
// it's the first thing painted on the page rather than something a
// visitor has to scroll past the title to reach. Kept as blunt as the
// disclaimer text in the document body: this is a draft pending review,
// not a softened "for informational purposes" footer note.
function PendingReviewBanner({ locale }: { locale: string }) {
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

// This page is currently drafted in Spanish only, for the Mexican legal
// context specifically requested. It is still a review draft (see the
// disclaimer at the top of the content itself) and is not represented
// as final or lawyer-approved anywhere on the page.
function readLegalContent(): string {
  const contentPath = path.join(process.cwd(), "content", "legal-es.md");
  return fs.readFileSync(contentPath, "utf-8");
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const title = locale === "es" ? "Aviso de Privacidad y Términos" : "Legal";
  return { title };
}

export default async function LegalPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  if (locale !== "es") {
    return (
      <>
        <PendingReviewBanner locale={locale} />
        <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Legal</h1>
          <p className="prose-column mt-4 text-muted-foreground">
            The privacy notice and terms are currently drafted for the Mexican legal context only, in Spanish, and
            are still a review draft pending lawyer approval. An English version has not been written yet.
          </p>
          <Link href="/legal" locale="es" className="mt-4 inline-block text-primary hover:underline">
            Ver la versión en español
          </Link>
        </div>
      </>
    );
  }

  const markdown = readLegalContent();
  const toc = extractToc(markdown);

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
              <TableOfContents entries={toc} title="Contenido" />
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

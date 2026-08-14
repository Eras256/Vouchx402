import type { TocEntry } from "@/lib/toc";

/**
 * A plain anchor-link list, not a scroll-spy widget: every entry is a
 * real link to a real heading id that rehype-slug attached to the
 * rendered markdown (see toc.ts's doc comment on why the two stay in
 * sync). No client-side JS required for the core "jump to section" job.
 */
export function TableOfContents({ entries, title }: { entries: TocEntry[]; title: string }) {
  return (
    <nav aria-label={title} className="text-sm">
      <p className="font-medium text-foreground">{title}</p>
      <ul className="mt-3 space-y-2 border-l border-border">
        {entries.map((entry) => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              className={
                entry.depth === 3
                  ? "block border-l border-transparent py-0.5 pl-7 text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  : "block border-l border-transparent py-0.5 pl-4 text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              }
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

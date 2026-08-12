import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";

/**
 * Code-block rendering shared between the standalone `CodeBlock` (a single
 * fenced snippet in the API reference) and the full Docs page (an entire
 * rendered markdown file, which contains many fenced snippets inline) —
 * one visual treatment for code either way. `not-prose` on `<pre>` opts
 * the block back out of @tailwindcss/typography's own code styling when
 * this runs inside a `.prose` column (the Docs page); it's a no-op
 * standalone.
 */
export const markdownComponents: Components = {
  pre: ({ children }) => (
    <pre className="not-prose overflow-x-auto rounded-md border border-border bg-card px-4 py-3 text-sm leading-relaxed">
      {children}
    </pre>
  ),
  code: ({ className, children }) => <code className={cn("data", className)}>{children}</code>,
  // GFM tables (the Docs page's Network section) aren't wide today, but
  // the design brief requires wide content to scroll in its own
  // container rather than ever forcing the page body to scroll
  // horizontally — wrapping here holds regardless of table width.
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
};

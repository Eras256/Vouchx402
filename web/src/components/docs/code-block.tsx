import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { markdownComponents } from "./markdown-components";

/**
 * A single fenced code block, syntax-highlighted via rehype-highlight
 * (adds `.hljs-*` token classes, colored in globals.css against this
 * project's own design tokens, not an imported highlight.js theme
 * stylesheet, so it matches both themes without a second palette to
 * maintain). bash/json/typescript are all in rehype-highlight's default
 * "common" language set; no custom language registration needed.
 * Reused as-is by the Docs page (see markdown-components.tsx).
 */
export function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  const fenced = `\`\`\`${language}\n${code}\n\`\`\``;
  return (
    <ReactMarkdown rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
      {fenced}
    </ReactMarkdown>
  );
}

import GithubSlugger from "github-slugger";

export interface TocEntry {
  id: string;
  text: string;
  depth: number;
}

/**
 * Extracts a table of contents (depth 2-3 headings only) from raw
 * markdown, id'd with the exact same algorithm rehype-slug applies when
 * the document is actually rendered (github-slugger). Every heading,
 * any depth, including h1, is run through the slugger in document
 * order first and only then filtered, because slug de-duplication
 * depends on the shared occurrence count staying in sync with what
 * rehype-slug does over the full document; skipping straight to depth
 * 2/3 would desync the counts on a page with any repeated heading text.
 * Lines inside fenced code blocks are ignored, since a `#` there isn't a
 * heading.
 */
export function extractToc(markdown: string): TocEntry[] {
  const slugger = new GithubSlugger();
  const entries: TocEntry[] = [];
  let inFence = false;

  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (!match) continue;

    const depth = match[1].length;
    const raw = match[2].trim();
    // Slug output is unaffected by inline markdown syntax either way:
    // github-slugger's own regex strips backticks/punctuation, but the
    // *display* text should read clean.
    const text = raw.replace(/`/g, "");
    const id = slugger.slug(raw);

    if (depth === 2 || depth === 3) {
      entries.push({ id, text, depth });
    }
  }

  return entries;
}

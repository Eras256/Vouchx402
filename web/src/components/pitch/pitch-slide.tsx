import type { ReactNode } from "react";

// Slide count is fixed and small; tracked in one place rather than
// computed, so an added/removed slide is a one-line change here plus
// renumbering the affected index props, not a hidden invariant.
export const TOTAL_SLIDES = 7;

export function PitchSlide({
  id,
  eyebrow,
  index,
  children,
}: {
  id?: string;
  eyebrow: string;
  index: number;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-10"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-semibold tracking-widest text-primary uppercase">{eyebrow}</span>
        <span className="data text-xs text-muted-foreground">
          {String(index).padStart(2, "0")} / {String(TOTAL_SLIDES).padStart(2, "0")}
        </span>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

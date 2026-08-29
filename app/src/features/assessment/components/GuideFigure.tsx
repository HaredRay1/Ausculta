/**
 * One instructional diagram with its translated caption.
 *
 * The drawings in `public/guides/` carry no text at all — the app is bilingual
 * and its spec forbids baking translatable words into artwork — so a diagram is
 * always this pair: the picture, and a caption that came from i18n. The `alt`
 * text is separate from the caption because a screen-reader user needs to know
 * what the picture SHOWS, while the caption tells everyone what to DO.
 */
export interface GuideFigureProps {
  src: string
  /** What the drawing depicts, for a screen reader. */
  alt: string
  /** The translated instruction shown beneath it. */
  caption: string
  /** A badge above the figure, e.g. "Step 3 of 9". */
  eyebrow?: string
}

export function GuideFigure({ src, alt, caption, eyebrow }: GuideFigureProps) {
  return (
    <figure className="flex flex-col gap-3">
      {eyebrow !== undefined && (
        <span className="text-sm font-semibold text-muted uppercase tracking-wide">{eyebrow}</span>
      )}
      <div className="flex justify-center rounded-card bg-card p-3">
        <img src={src} alt={alt} className="h-auto w-full max-w-xs" />
      </div>
      <figcaption className="text-base leading-relaxed text-on-surface">{caption}</figcaption>
    </figure>
  )
}

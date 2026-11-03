import { Fragment, type ReactNode } from "react";

/**
 * The landing copy's two marks (src/copy/en-CA.ts, wave V): `*words*` is a headline's emphasised phrase, set in the serif italic
 * (<em>); `**words**` is a key phrase in a paragraph, set in medium weight (<b>). Nothing else is parsed, so copy stays plain text.
 */
export function Emph({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((p, i) =>
    p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith("*") ? <em key={i}>{p.slice(1, -1)}</em> : <Fragment key={i}>{p}</Fragment>,
  );
}

/** The same text without its marks (metadata, labels, tests). */
export const plainText = (text: string) => text.replace(/\*\*([^*]+)\*\*|\*([^*]+)\*/g, "$1$2");

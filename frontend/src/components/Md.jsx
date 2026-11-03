import React from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/**
 * Normalises raw AI output so KaTeX and ReactMarkdown can render it reliably.
 *
 * Fixes:
 *  1. Nested delimiters like `$$ $ ... $ $$` or `$$ $ ... $$` that cause KaTeX errors
 *  2. Multi-line environments (`pmatrix`, `bmatrix`, `cases`, `aligned`, `array`, `matrix`)
 *     wrapped in single `$` -> converted to proper display math `$$`
 *  3. Orphaned `\begin{...}...\end{...}` with no delimiters -> wrapped in `$$`
 *  4. `$$` glued to adjacent text -> given its own clean lines
 *  5. Stray `\\` line-breaks in plain prose outside math -> converted to newlines
 *  6. Odd / unclosed `$$` delimiter count -> safely closed
 */
export function fixLatex(text) {
  if (!text) return "";
  let s = String(text);

  // 1. Strip nested/accidental dollar signs inside display blocks:
  //    e.g. `$$ $ \begin{pmatrix}...$ $$` -> `$$\n\begin{pmatrix}...\n$$`
  s = s.replace(/\$\$\s*\$([\s\S]*?)\$\s*\$\$/g, "\n$$\n$1\n$$\n");
  s = s.replace(/\$\$\s*\$([\s\S]*?)\$\$/g, "\n$$\n$1\n$$\n");
  s = s.replace(/\$\$([\s\S]*?)\$\s*\$\$/g, "\n$$\n$1\n$$\n");

  // 2. Convert `$ \begin{env} ... \end{env} $` (inline dollars around block environments)
  //    into clean display math `$$ ... $$`
  s = s.replace(
    /\$\s*(\\begin\{(?:pmatrix|bmatrix|vmatrix|Vmatrix|matrix|cases|aligned|array|gather|equation)\*?\}[\s\S]*?\\end\{(?:pmatrix|bmatrix|vmatrix|Vmatrix|matrix|cases|aligned|array|gather|equation)\*?\})\s*\$/g,
    "\n$$\n$1\n$$\n"
  );

  // 3. Wrap orphaned \begin{env}...\end{env} that has NO math delimiters around it
  s = s.replace(
    /(^|[^\$])(\\begin\{(?:pmatrix|bmatrix|vmatrix|Vmatrix|matrix|cases|aligned|array|gather|equation)\*?\}[\s\S]*?\\end\{(?:pmatrix|bmatrix|vmatrix|Vmatrix|matrix|cases|aligned|array|gather|equation)\*?\})([^\$]|$)/g,
    "$1\n$$\n$2\n$$\n$3"
  );

  // 4. Ensure $$ are placed on their own lines
  s = s.replace(/([^\n])(\$\$)/g, "$1\n$2");
  s = s.replace(/(\$\$)([^\n])/g, "$1\n$2");

  // 5. Clean stray `\\` outside of math blocks
  const parts = s.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/);
  s = parts
    .map((part, idx) => {
      if (idx % 2 !== 0) return part; // inside math - preserve
      return part.replace(/\\\\\s*\n/g, "\n").replace(/\\\\\s*$/gm, "");
    })
    .join("");

  // 6. Fix unmatched $$ count (if odd number of $$, append closing $$)
  const blockMatches = s.match(/\$\$/g);
  if (blockMatches && blockMatches.length % 2 !== 0) {
    s += "\n$$";
  }

  return s;
}

export default function Md({ children }) {
  const content = fixLatex(children || "");

  return (
    <div className="prose-k text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[
          [
            rehypeKatex,
            {
              strict: false,
              trust: true,
              throwOnError: false,
            },
          ],
        ]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/**
 * Normalises raw AI output so KaTeX can render it reliably.
 *
 * Fixes common AI formatting mistakes:
 *  1. $$ delimiters glued to text on same line  → moved onto their own lines
 *  2. Stray \\ line-break in plain prose        → replaced with newline
 *  3. \begin{...}...\end{...} outside any math  → wrapped in $$
 */
function fixLatex(text) {
  if (!text) return "";
  let s = text;

  // 1. Ensure $$ are on their own lines
  s = s.replace(/([^\n])(\$\$)/g, "$1\n$2");
  s = s.replace(/(\$\$)([^\n])/g, "$1\n$2");

  // 2. Outside math spans, remove stray \\ line-breaks that render as raw text
  const parts = s.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/);
  s = parts
    .map((part, idx) => {
      if (idx % 2 !== 0) return part; // inside math – keep as-is
      return part.replace(/\\\\\s*\n/g, "\n").replace(/\\\\\s*$/gm, "");
    })
    .join("");

  // 3. Wrap orphaned LaTeX environments that escaped outside math delimiters
  s = s.replace(
    /(^|\n)(\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\})(\n|$)/g,
    "$1\n$$\n$2\n$$\n$3"
  );

  return s;
}

export default function Md({ children }) {
  return (
    <div className="prose-k text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {fixLatex(children || "")}
      </ReactMarkdown>
    </div>
  );
}

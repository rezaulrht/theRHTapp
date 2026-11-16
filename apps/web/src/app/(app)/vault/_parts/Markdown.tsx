'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Notes and markdown files, as the AI answer looked: headings, lists, tables,
 * code. Raw HTML inside the text is never run or shown as markup. Headings sit
 * one level below the page's own title, so a note's "# Title" is not a second
 * page title.
 */
const components: Components = {
  h1: ({ children }) => <h2 className="mb-4 mt-8 font-display text-3xl leading-tight text-ivory first:mt-0">{children}</h2>,
  h2: ({ children }) => <h3 className="mb-3 mt-8 font-display text-2xl leading-tight text-ivory first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-2 mt-6 font-display text-xl text-ivory first:mt-0">{children}</h4>,
  h4: ({ children }) => <h5 className="mb-2 mt-5 font-medium text-ivory">{children}</h5>,
  h5: ({ children }) => <h6 className="mb-2 mt-4 font-medium text-ivory">{children}</h6>,
  h6: ({ children }) => <h6 className="mb-2 mt-4 text-sage">{children}</h6>,
  p: ({ children }) => <p className="my-3 leading-relaxed text-ivory/90">{children}</p>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-brass underline underline-offset-2 hover:text-ivory">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6 text-ivory/90 marker:text-brass">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6 text-ivory/90 marker:text-brass">{children}</ol>,
  blockquote: ({ children }) => <blockquote className="my-4 border-l-2 border-brass pl-4 text-sage">{children}</blockquote>,
  hr: () => <hr className="my-8 border-hairline" />,
  code: ({ className, children }) =>
    className ? (
      <code className={`${className} font-mono text-sm`}>{children}</code>
    ) : (
      <code className="rounded bg-ivory/[0.07] px-1.5 py-0.5 font-mono text-[0.9em] text-ivory">{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-[var(--radius-control)] border border-hairline bg-black/25 p-4 text-ivory" data-lenis-prevent>
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto" data-lenis-prevent>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-brass/60 px-3 py-2 text-left font-medium text-ivory">{children}</th>,
  td: ({ children }) => <td className="border-b border-hairline px-3 py-2 align-top text-ivory/90">{children}</td>,
  img: ({ src, alt }) => (typeof src === 'string' ? <img src={src} alt={alt ?? ''} className="my-4 max-w-full rounded" /> : null),
};

export function Markdown({ text }: { text: string }) {
  return (
    <div className="min-w-0 break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}

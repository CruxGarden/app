import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        pre({ children }) {
          return (
            <pre className="bg-bg rounded-[var(--radius-sm)] p-3 my-2 overflow-x-auto text-sm font-mono">
              {children}
            </pre>
          );
        },
        code({ children, className }) {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="bg-bg px-1.5 py-0.5 rounded text-sm font-mono text-accent">
                {children}
              </code>
            );
          }
          return <code className={className}>{children}</code>;
        },
        p({ children }) {
          return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
        },
        ul({ children }) {
          return <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>;
        },
        ol({ children }) {
          return (
            <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>
          );
        },
        h1({ children }) {
          return (
            <h1 className="text-lg font-display font-bold mt-4 mb-2">
              {children}
            </h1>
          );
        },
        h2({ children }) {
          return (
            <h2 className="text-base font-display font-bold mt-3 mb-2">
              {children}
            </h2>
          );
        },
        h3({ children }) {
          return (
            <h3 className="text-sm font-display font-bold mt-2 mb-1">
              {children}
            </h3>
          );
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-2"
            >
              {children}
            </a>
          );
        },
        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-accent pl-3 my-2 text-text-muted italic">
              {children}
            </blockquote>
          );
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto my-2">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          );
        },
        th({ children }) {
          return (
            <th className="border border-border px-3 py-1.5 text-left font-display font-medium bg-surface">
              {children}
            </th>
          );
        },
        td({ children }) {
          return (
            <td className="border border-border px-3 py-1.5">{children}</td>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

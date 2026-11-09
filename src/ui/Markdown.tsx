import { Fragment } from 'react';
import { inlineParts, parseMarkdown } from '../domain/markdown';

function Inline({ text }: { text: string }) {
  return <>{inlineParts(text).map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : <Fragment key={i}>{p.text}</Fragment>))}</>;
}

/** Shows a legal text (headings, paragraphs, lists, bold) as plain, readable elements. */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="space-y-3 text-base leading-relaxed text-slate-800">
      {parseMarkdown(source).map((b, i) => {
        switch (b.type) {
          case 'h1':
            return (
              <h2 key={i} className="text-xl font-extrabold text-slate-900">
                <Inline text={b.text} />
              </h2>
            );
          case 'h2':
            return (
              <h3 key={i} className="pt-2 text-lg font-bold text-slate-900">
                <Inline text={b.text} />
              </h3>
            );
          case 'h3':
            return (
              <h4 key={i} className="font-bold text-slate-900">
                <Inline text={b.text} />
              </h4>
            );
          case 'p':
            return (
              <p key={i}>
                <Inline text={b.text} />
              </p>
            );
          case 'ul':
          case 'ol': {
            const List = b.type;
            return (
              <List key={i} className={`space-y-1 pl-5 ${b.type === 'ul' ? 'list-disc' : 'list-decimal'}`}>
                {b.items.map((item, j) => (
                  <li key={j}>
                    <Inline text={item} />
                  </li>
                ))}
              </List>
            );
          }
        }
      })}
    </div>
  );
}

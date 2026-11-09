/**
 * A very small Markdown reader for the legal texts shown in the app (headings, paragraphs,
 * lists and **bold**). It returns plain data, so the screen builds safe elements (never raw HTML).
 */

export type Block = { type: 'h1' | 'h2' | 'h3'; text: string } | { type: 'p'; text: string } | { type: 'ul' | 'ol'; items: string[] };

export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join(' ') });
    paragraph = [];
    if (list) blocks.push(list);
    list = null;
  };

  for (const raw of md.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (!line) {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ type: (['h1', 'h2', 'h3'] as const)[heading[1]!.length - 1]!, text: heading[2]! });
    } else if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      if (paragraph.length || (list && list.type !== type)) flush();
      list ??= { type, items: [] };
      list.items.push((bullet ?? numbered)![1]!);
    } else if (list && /^\s{2,}/.test(raw)) {
      // Continuation of a list item.
      list.items[list.items.length - 1] += ` ${line}`;
    } else {
      if (list) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/** Splits "a **b** c" into [{text:'a '}, {text:'b', bold:true}, {text:' c'}]. */
export function inlineParts(text: string): { text: string; bold: boolean }[] {
  return text
    .split('**')
    .map((part, i) => ({ text: part, bold: i % 2 === 1 }))
    .filter((p) => p.text !== '');
}

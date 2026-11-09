import { describe, expect, it } from 'vitest';
import { inlineParts, parseMarkdown } from './markdown';
import { LEGAL_DOCS } from '../legal/documents';

describe('markdown for the legal texts', () => {
  it('reads headings, paragraphs and lists', () => {
    const md = '# Título\n\nUm parágrafo\nem duas linhas.\n\n## Secção\n\n- um\n- dois\n\n1. primeiro\n2. segundo\n\nFim.';
    expect(parseMarkdown(md)).toEqual([
      { type: 'h1', text: 'Título' },
      { type: 'p', text: 'Um parágrafo em duas linhas.' },
      { type: 'h2', text: 'Secção' },
      { type: 'ul', items: ['um', 'dois'] },
      { type: 'ol', items: ['primeiro', 'segundo'] },
      { type: 'p', text: 'Fim.' },
    ]);
  });

  it('marks bold text without any HTML', () => {
    expect(inlineParts('a **b** c <script>')).toEqual([
      { text: 'a ', bold: false },
      { text: 'b', bold: true },
      { text: ' c <script>', bold: false },
    ]);
  });

  it('every legal document starts with a title and says it is a draft', () => {
    expect(LEGAL_DOCS.map((d) => d.id)).toEqual(['termos', 'privacidade', 'piloto', 'credito']);
    for (const doc of LEGAL_DOCS) {
      const blocks = parseMarkdown(doc.body);
      expect(blocks[0]!.type).toBe('h1');
      expect(doc.body).toContain('Minuta');
    }
    const credit = LEGAL_DOCS.find((d) => d.id === 'credito')!.body;
    expect(credit).toContain('retenção');
    expect(credit).toContain('40% ou mais');
  });
});

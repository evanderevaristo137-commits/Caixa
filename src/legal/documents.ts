// The legal texts live in docs/legal (easy to review with a lawyer) and go inside the app,
// so they can be read without internet.
import termos from '../../docs/legal/termos-de-uso.md?raw';
import privacidade from '../../docs/legal/privacidade.md?raw';
import piloto from '../../docs/legal/condicoes-do-piloto.md?raw';
import credito from '../../docs/legal/condicoes-credito-stock.md?raw';

/** Change it when the Terms of use or the Privacy policy change: the app asks for acceptance again. */
export const TERMS_VERSION = '2026-11-11';

export type LegalDocId = 'termos' | 'privacidade' | 'piloto' | 'credito';

export const LEGAL_DOCS: { id: LegalDocId; body: string }[] = [
  { id: 'termos', body: termos },
  { id: 'privacidade', body: privacidade },
  { id: 'piloto', body: piloto },
  { id: 'credito', body: credito },
];

export const legalDoc = (id: LegalDocId) => LEGAL_DOCS.find((d) => d.id === id)!;

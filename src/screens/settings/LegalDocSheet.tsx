import { legalDoc, type LegalDocId } from '../../legal/documents';
import { t } from '../../i18n/pt-AO';
import { Markdown } from '../../ui/Markdown';
import { Sheet } from '../../ui/kit';

/** One legal text, readable without internet. */
export function LegalDocSheet({ id, onClose }: { id: LegalDocId; onClose: () => void }) {
  return (
    <Sheet title={t.legal.docs[id]!} onClose={onClose}>
      <Markdown source={legalDoc(id).body} />
    </Sheet>
  );
}

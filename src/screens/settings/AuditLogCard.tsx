import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { describeAudit } from '../../domain/audit-describe';
import { t } from '../../i18n/pt-AO';
import { formatDateTime } from '../../lib/dates';
import { Button, Card, Sheet } from '../../ui/kit';
import { ShowMore, usePaged } from '../../ui/paged';
import { useTeam } from '../../app/team';

/** Lines of the activity log drawn at once. */
const LOG_PAGE = 50;

/** "Registo de alterações": what was done and when, in plain words. */
export function AuditLogCard() {
  const [open, setOpen] = useState(false);
  return (
    <Card className="space-y-3">
      <h3 className="text-lg font-bold">{t.auditLog.title}</h3>
      <p className="text-sm text-slate-600">{t.auditLog.hint}</p>
      <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        {t.auditLog.open}
      </Button>
      {open && <AuditLogSheet onClose={() => setOpen(false)} />}
    </Card>
  );
}

function AuditLogSheet({ onClose }: { onClose: () => void }) {
  const { store } = useApp();
  const [all, setAll] = useState(false);
  const lines = useLiveQuery(async () => {
    const [entries, products, customers, suppliers] = await Promise.all([
      store.auditLog.recent(400),
      store.db.products.toArray(),
      store.db.customers.toArray(),
      store.db.suppliers.toArray(),
    ]);
    const productName = new Map(products.map((p) => [p.id, p.name]));
    const customerName = new Map(customers.map((c) => [c.id, c.name]));
    const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
    const names = {
      product: (id: string) => productName.get(id),
      customer: (id: string) => customerName.get(id),
      supplier: (id: string) => supplierName.get(id),
    };
    return entries.flatMap((e) => {
      const line = describeAudit(e, names);
      return line ? [{ id: e.id, at: e.createdAt, by: e.by, ...line }] : [];
    });
  }, [store]);
  const team = useTeam();
  const shown = (lines ?? []).filter((l) => all || l.important);
  const paged = usePaged(shown, LOG_PAGE, all);

  return (
    <Sheet title={t.auditLog.title} onClose={onClose}>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {[false, true].map((value) => (
          <button
            key={String(value)}
            type="button"
            aria-pressed={all === value}
            onClick={() => setAll(value)}
            className={`min-h-11 rounded-full border-2 text-sm font-semibold ${all === value ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'}`}
          >
            {value ? t.auditLog.showAll : t.auditLog.showImportant}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="py-6 text-center text-slate-600">{t.auditLog.empty}</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl bg-white">
          {paged.visible.map((l) => (
            <li key={l.id} className="p-3">
              <p className="text-xs text-slate-600">
                {formatDateTime(l.at)}
                {/* With employees: who did it. */}
                {l.by && team.nameOf(l.by) && ` · ${t.team.by(team.nameOf(l.by)!)}`}
              </p>
              <p className={l.important ? 'font-semibold' : ''}>{l.text}</p>
            </li>
          ))}
        </ul>
      )}
      <ShowMore rest={paged.rest} page={LOG_PAGE} onClick={paged.more} className="mt-2" />
    </Sheet>
  );
}

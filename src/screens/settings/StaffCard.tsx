import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { t } from '../../i18n/pt-AO';
import { Button, Card } from '../../ui/kit';
import { StaffSheet } from './StaffSheet';

/**
 * «Funcionários» (owner only, off by default): who works in the shop, what each may do, a code each.
 * Needs the owner code first: it is what tells the owner apart.
 */
export function StaffCard() {
  const { store } = useApp();
  const data = useLiveQuery(async () => {
    const [members, hasOwnerCode] = await Promise.all([store.staff.active(), store.security.hasPin()]);
    const withPin = await Promise.all(members.map((m) => store.staff.hasPin(m.id)));
    return { members: members.map((m, i) => ({ member: m, hasPin: withPin[i] })), hasOwnerCode };
  }, [store]);
  const [open, setOpen] = useState<string | 'new' | null>(null);
  if (!data) return null;
  const editing = open && open !== 'new' ? data.members.find((r) => r.member.id === open)?.member : undefined;

  return (
    <Card className="space-y-3">
      <h3 className="text-lg font-bold">{t.team.card}</h3>
      <p className="text-sm text-slate-600">{t.team.cardHint}</p>
      {data.members.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {data.members.map(({ member, hasPin }) => (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => setOpen(member.id)}
                className="flex min-h-14 w-full items-center justify-between gap-2 py-2 text-left active:bg-slate-50"
              >
                <span>
                  <span className="block font-semibold">{member.name}</span>
                  <span className="block text-sm text-slate-600">
                    {t.team.roles[member.role]}
                    {member.role === 'seller' && member.canCredit ? ` · ${t.team.credit}` : ''}
                    {!hasPin && <span className="font-semibold text-red-700"> · {t.team.withoutCode}</span>}
                  </span>
                </span>
                <span aria-hidden="true" className="text-xl text-slate-400">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {data.hasOwnerCode ? (
        <Button className="w-full" onClick={() => setOpen('new')}>
          {t.team.add}
        </Button>
      ) : (
        <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{t.team.needOwnerCode}</p>
      )}
      {open === 'new' && <StaffSheet onClose={() => setOpen(null)} />}
      {editing && <StaffSheet member={editing} onClose={() => setOpen(null)} />}
    </Card>
  );
}

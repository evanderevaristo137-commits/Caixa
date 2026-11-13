import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { demoShopStore, useApp } from '../app/context';
import { demoKindOf } from '../data/demo-seed';
import { DEMO_KINDS } from '../data/demo-profiles';
import { InssCard } from './inss/InssCard';
import { normaliseNif } from '../domain/nif';
import type { Settings } from '../domain/types';
import { t } from '../i18n/pt-AO';
import { promptInstall, useCanInstall } from '../lib/install';
import { CreditSettingsCard } from './settings/CreditSettingsCard';
import { CashFloatCard } from './settings/CashFloatCard';
import { CostMethodCard } from './settings/CostMethodCard';
import { PilotCard } from './settings/PilotCard';
import { DigitalMinCard } from './settings/DigitalMinCard';
import { LegalCard } from './settings/LegalCard';
import { InvoicingCard } from './settings/InvoicingCard';
import { ShopTypesCard } from './settings/ShopTypes';
import { OwnerPinCard } from './settings/OwnerPinCard';
import { IntegrityCard } from './settings/IntegrityCard';
import { DataCard } from './settings/DataCard';
import { AuditLogCard } from './settings/AuditLogCard';
import { MoreSection, useOpenSections } from './settings/MoreSection';
import { StaffCard } from './settings/StaffCard';
import { useTeam } from '../app/team';
import { DEFAULT_STORE_NAME } from '../data/repos/shared';
import { Button, Card, Field, Skeleton } from '../ui/kit';
import { ICON } from '../ui/icons';
import { useConfirm } from '../ui/confirm';

export default function SettingsScreen() {
  const { store } = useApp();
  const settings = useLiveQuery(() => store.settings.get(), [store]);
  if (!settings) return <Skeleton />;
  return <Sections key={store.db.name} settings={settings} />;
}

/**
 * «Mais» in four groups that open with a tap: the shop, money and customers, safety and backups,
 * the pilot and help. The demo switch stays always in sight (the founder uses it at every visit).
 */
function Sections({ settings }: { settings: Settings }) {
  const { mode } = useApp();
  const team = useTeam();
  // A real shop still without its name: the shop's section starts open, to fill it in.
  const [open, toggle] = useOpenSections(mode === 'store' && settings.storeName === DEFAULT_STORE_NAME ? ['store'] : []);
  const s = t.moreSections;
  // An employee: the shop's settings are the owner's (the Store checks it too).
  if (!team.can('settings')) {
    return (
      <div className="space-y-3 p-3">
        <InstallCard />
        <Card className="space-y-3">
          <p className="text-slate-700">{t.team.ownerOnly}</p>
          <Button variant="secondary" className="w-full" onClick={team.choose}>
            {t.team.switch}
          </Button>
        </Card>
        <LegalCard />
        <p className="px-2 pb-4 text-center text-sm text-slate-600">{t.settings.about}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3 p-3">
      <InstallCard />
      <MoreSection icon={ICON.store} title={s.store} hint={s.storeHint} open={open.has('store')} onToggle={() => toggle('store')}>
        <StoreForm key={settings.updatedAt} settings={settings} />
        <ShopTypesCard key={`types-${settings.updatedAt}`} settings={settings} />
        <InvoicingCard settings={settings} />
        <CostMethodCard settings={settings} />
      </MoreSection>
      <MoreSection icon={ICON.wallet} title={s.money} hint={s.moneyHint} open={open.has('money')} onToggle={() => toggle('money')}>
        <CreditSettingsCard settings={settings} />
        <CashFloatCard settings={settings} />
        <DigitalMinCard settings={settings} />
        <InssCard />
      </MoreSection>
      <MoreSection icon={ICON.shield} title={s.safety} hint={s.safetyHint} open={open.has('safety')} onToggle={() => toggle('safety')}>
        <OwnerPinCard />
        <StaffCard />
        <DataCard />
        <IntegrityCard />
        <AuditLogCard />
      </MoreSection>
      <MoreSection icon={ICON.help} title={s.help} hint={s.helpHint} open={open.has('help')} onToggle={() => toggle('help')}>
        <PilotCard settings={settings} />
        <LegalCard />
      </MoreSection>
      <DemoCard />
      <p className="px-2 pb-4 text-center text-sm text-slate-600">{t.settings.about}</p>
    </div>
  );
}

function InstallCard() {
  const canInstall = useCanInstall();
  if (!canInstall) return null;
  return (
    <Card className="space-y-2 ring-4 ring-brand-100">
      <h2 className="text-lg font-bold">{t.install.title}</h2>
      <p className="text-sm text-slate-600">{t.install.hint}</p>
      <Button big className="w-full" onClick={() => void promptInstall()}>
        {t.install.button}
      </Button>
    </Card>
  );
}

function StoreForm({ settings }: { settings: Settings }) {
  const { store, showToast } = useApp();
  const [storeName, setStoreName] = useState(settings.storeName);
  const [phone, setPhone] = useState(settings.phone ?? '');
  const [nif, setNif] = useState(settings.nif ?? '');
  const [error, setError] = useState<string | null>(null);
  const [nifError, setNifError] = useState<string | null>(null);
  const save = async () => {
    if (!storeName.trim()) return setError(t.products.nameRequired);
    if (!normaliseNif(nif).ok) return setNifError(t.settings.nifInvalid);
    await store.settings.save({ storeName, phone, nif });
    setError(null);
    setNifError(null);
    showToast(t.settings.saved);
  };
  return (
    <Card className="space-y-3">
      <h3 className="text-lg font-bold">{t.settings.title}</h3>
      <Field label={t.settings.storeName} value={storeName} onChange={(e) => setStoreName(e.target.value)} error={error} />
      <Field label={t.settings.phone} value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" />
      <Field
        label={t.settings.nif}
        value={nif}
        onChange={(e) => setNif(e.target.value)}
        autoCapitalize="characters"
        autoComplete="off"
        hint={t.settings.nifHint}
        error={nifError}
      />
      <Button className="w-full" onClick={() => void save()}>
        {t.common.save}
      </Button>
    </Card>
  );
}

function DemoCard() {
  const { mode, setMode, resetDemo, setDemoKind, showToast } = useApp();
  const kind = useLiveQuery(() => demoKindOf(demoShopStore().db), [mode]);
  const [busy, setBusy] = useState(false);
  const [dialog, ask] = useConfirm();
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className={`space-y-2 ${mode === 'demo' ? 'ring-4 ring-amber-400' : ''}`}>
      <h2 className="text-lg font-bold">{t.settings.demo}</h2>
      <p className="text-sm text-slate-600">{t.settings.demoNote}</p>
      <p className="text-sm font-semibold text-slate-700">{t.demoKinds.title}</p>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label={t.demoKinds.title}>
        {DEMO_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            disabled={busy}
            aria-pressed={mode === 'demo' && kind === k}
            onClick={() =>
              void run(async () => {
                await setDemoKind(k);
                showToast(t.demoKinds.shown(t.demoKinds.names[k]));
              })
            }
            className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 px-1 py-2 text-center text-sm font-semibold ${
              mode === 'demo' && kind === k
                ? 'border-amber-500 bg-amber-50 text-amber-950'
                : 'border-slate-300 bg-white active:bg-slate-100'
            }`}
          >
            <span aria-hidden="true" className="text-xl">
              {t.demoKinds.icons[k]}
            </span>
            {t.demoKinds.names[k]}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-600">{t.demoKinds.hint}</p>
      {mode === 'store' ? (
        <Button className="w-full" disabled={busy} onClick={() => void run(() => setMode('demo'))}>
          {t.settings.demoOn}
        </Button>
      ) : (
        <>
          <Button
            variant="secondary"
            className="w-full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const ok = await ask({
                  title: t.settings.demoResetConfirm,
                  message: t.settings.demoResetConfirmNote,
                  confirmLabel: t.settings.demoResetYes,
                });
                if (!ok) return;
                await resetDemo();
                showToast(t.settings.demoResetOk);
              })
            }
          >
            {t.settings.demoReset}
          </Button>
          <Button className="w-full" disabled={busy} onClick={() => void run(() => setMode('store'))}>
            {t.settings.demoOff}
          </Button>
        </>
      )}
      {dialog}
    </Card>
  );
}

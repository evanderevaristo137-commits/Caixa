import { t } from '../../i18n/pt-AO';

/** How to enrol at the INSS, and the reminder that the app is not the INSS. */
export function InssGuide() {
  return (
    <>
      <details className="rounded-xl bg-white p-3">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">{t.inss.guideTitle}</summary>
        <ol className="mt-1 list-decimal space-y-2 pl-5 text-slate-800">
          {t.inss.guide.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>
      <p className="text-sm text-slate-600">{t.inss.notInss}</p>
    </>
  );
}

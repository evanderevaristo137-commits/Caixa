import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { dailyAlert, type DailyAlert, type DigitalAlertInfo, type DueItem, type InssAlert } from './alerts';

describe('the notification of the day', () => {
  const today = '2026-11-09';
  const due = (...dates: string[]): DueItem[] => dates.map((dueDate) => ({ dueDate }));
  const digital = (p: Partial<DigitalAlertInfo>): DigitalAlertInfo => ({
    on: today,
    alarm: true,
    belowMinimum: true,
    shareBp: 3200,
    minShareBp: 4000,
    ...p,
  });

  const cases: [string, DueItem[], DueItem[], DigitalAlertInfo | null, DailyAlert | null][] = [
    [
      'customers only',
      due('2026-11-07', '2026-11-08', '2026-11-09', '2026-11-11', '2026-11-20'),
      [],
      null,
      {
        title: 'Pagamentos de clientes',
        body: '2 em atraso · 1 vence hoje · 1 vence nos próximos dias. Toque para ver e lembrar os clientes.',
        hash: '#/credit',
      },
    ],
    [
      'suppliers only',
      [],
      due('2026-11-09', '2026-11-09'),
      null,
      { title: 'Pagamentos a fornecedores', body: '2 vencem hoje. Toque para ver.', hash: '#/today' },
    ],
    [
      'digital alarm only',
      [],
      [],
      digital({}),
      { title: 'Pagamentos digitais', body: 'Abaixo do mínimo do contrato: 32% (mínimo 40%). Toque para ver.', hash: '#/today' },
    ],
    [
      'everything at once',
      due('2026-11-09'),
      due('2026-11-01'),
      digital({ on: '2026-11-08', belowMinimum: false, minShareBp: undefined, shareBp: 1500 }),
      {
        title: 'Avisos da loja',
        body: 'Clientes: 1 vence hoje. Fornecedores: 1 em atraso. Pagamentos digitais: desceram muito nos últimos 7 dias: 15% dos recebimentos. Toque para ver.',
        hash: '#/today',
      },
    ],
    // An alarm computed 2 days ago may no longer be true; no alarm, nothing due: nothing to say.
    ['old alarm', [], due('2026-11-30'), digital({ on: '2026-11-07' }), null],
    ['no alarm', [], [], digital({ alarm: false, belowMinimum: false }), null],
  ];

  it.each(cases)('%s', (_, credit, suppliers, d, expected) => {
    expect(dailyAlert(today, credit, suppliers, d)).toEqual(expected);
  });

  // The owner's INSS contribution of October, due on 10 November: reminded from the 8th to the 15th.
  const inss: InssAlert = { label: 'Outubro', dueDate: '2026-11-10', from: '2026-11-08', until: '2026-11-15' };
  const inssCases: [string, string, DueItem[], DailyAlert | null][] = [
    ['too early', '2026-11-07', [], null],
    [
      'two days before',
      '2026-11-08',
      [],
      { title: 'A minha reforma (INSS)', body: 'Pagar a contribuição de Outubro até dia 10. Toque para ver.', hash: '#/today' },
    ],
    [
      'on the day',
      '2026-11-10',
      [],
      { title: 'A minha reforma (INSS)', body: 'A contribuição de Outubro vence hoje. Toque para ver.', hash: '#/today' },
    ],
    [
      'late, with a customer to remind',
      '2026-11-12',
      due('2026-11-12'),
      {
        title: 'Avisos da loja',
        body: 'Clientes: 1 vence hoje. INSS: contribuição de Outubro em atraso. Toque para ver.',
        hash: '#/today',
      },
    ],
    ['it stops insisting after 5 days', '2026-11-16', [], null],
  ];

  it.each(inssCases)('INSS contribution: %s', (_, day, credit, expected) => {
    expect(dailyAlert(day, credit, [], null, inss)).toEqual(expected);
  });

  it('says the same as the background checker of the service worker', () => {
    const sandbox: Record<string, unknown> = { self: { addEventListener: () => undefined } };
    runInNewContext(readFileSync('public/sw-alerts.js', 'utf8'), sandbox);
    const swAlert = sandbox.caixaDailyAlert as typeof dailyAlert;
    // JSON round trips: the worker reads what the app stored as JSON.
    const plain = (x: unknown) => JSON.parse(JSON.stringify(x)) as unknown;
    for (const [, credit, suppliers, d, expected] of cases) expect(plain(swAlert(today, credit, suppliers, d, null))).toEqual(expected);
    for (const [, day, credit, expected] of inssCases) expect(plain(swAlert(day, credit, [], null, inss))).toEqual(expected);
  });
});

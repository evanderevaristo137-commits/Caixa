import { describe, expect, it } from 'vitest';
import { alertNotificationText } from './alerts';

const n = (k: number) => Array.from({ length: k }, () => ({}) as never);

describe('alertNotificationText', () => {
  it('summarises who needs attention', () => {
    expect(alertNotificationText({ overdue: n(2), today: n(1), soon: n(1) })).toEqual({
      title: 'Pagamentos de clientes',
      body: '2 em atraso · 1 vence hoje · 1 vence nos próximos dias. Toque para ver e lembrar os clientes.',
    });
    expect(alertNotificationText({ overdue: n(0), today: n(3), soon: n(0) })!.body).toBe(
      '3 vencem hoje. Toque para ver e lembrar os clientes.',
    );
  });
  it('says nothing when nobody needs attention', () => {
    expect(alertNotificationText({ overdue: [], today: [], soon: [] })).toBeNull();
  });
});

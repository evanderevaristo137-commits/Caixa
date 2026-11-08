import { describe, expect, it } from 'vitest';
import { daySummaryText, receiptText, reminderText, shoppingListText } from './messages';
import { summariseDayView } from './today';
import { toWhatsAppNumber, whatsAppLink } from './whatsapp';
import type { Sale } from './types';

const sale: Sale = {
  id: 's1',
  number: 7,
  items: [
    { productId: 'p1', name: 'Arroz 1 kg', unitPriceCents: 120_000, quantity: 2, lineTotalCents: 240_000 },
    { productId: 'p2', name: 'Óleo 1 L', unitPriceCents: 185_000, quantity: 1, lineTotalCents: 185_000 },
  ],
  totalCents: 425_000,
  currency: 'AOA',
  method: 'cash',
  cashReceivedCents: 500_000,
  createdAt: new Date(2026, 10, 6, 9, 5).toISOString(),
  updatedAt: new Date(2026, 10, 6, 9, 5).toISOString(),
};

describe('receiptText', () => {
  const text = receiptText(sale, { storeName: 'Loja Exemplo', phone: '923 000 000', nif: '5000000000' });
  it('always carries the non-fiscal warning', () => {
    expect(text).toContain('Documento não fiscal — não serve de factura.');
    expect(text.toLowerCase()).not.toContain('factura n');
  });
  it('lists items, total and change', () => {
    expect(text).toContain('2 x Arroz 1 kg — 2.400 Kz');
    expect(text).toContain('*TOTAL: 4.250 Kz*');
    expect(text).toContain('Pagamento: Numerário');
    expect(text).toContain('Troco: 750 Kz');
    expect(text).toContain('NIF: 5000000000');
  });
});

describe('reminderText', () => {
  const base = { customerName: 'Maria Exemplo', storeName: 'Loja Exemplo', now: new Date(2026, 10, 6, 9), amountCents: 1_250_000 };

  it('is polite, with greeting, amount and thanks', () => {
    const msg = reminderText({ ...base, state: 'overdue', dueDate: '2026-11-02' });
    expect(msg.startsWith('Bom dia, Maria! Fala a Loja Exemplo.')).toBe(true);
    expect(msg).toContain('com todo o respeito');
    expect(msg).toContain('o pagamento de 12.500 Kz venceu a 02/11/2026');
    expect(msg.endsWith('Muito obrigado pela confiança!')).toBe(true);
  });

  it('follows the due date', () => {
    expect(reminderText({ ...base, state: 'today', dueDate: '2026-11-06' })).toContain('12.500 Kz vence hoje');
    expect(reminderText({ ...base, state: 'soon', dueDate: '2026-11-08' })).toContain('12.500 Kz vence a 08/11/2026.');
    expect(reminderText({ ...base })).toContain('tem um valor em aberto de 12.500 Kz');
  });

  it('mentions the whole account only when it is more than the amount due', () => {
    expect(reminderText({ ...base, state: 'today', balanceCents: 2_000_000 })).toContain('No total, a sua conta tem 20.000 Kz em aberto.');
    expect(reminderText({ ...base, state: 'today', balanceCents: 1_250_000 })).not.toContain('No total');
  });
});

describe('WhatsApp numbers', () => {
  it('normalises Angolan numbers', () => {
    expect(toWhatsAppNumber('923 456 789')).toBe('244923456789');
    expect(toWhatsAppNumber('+244 923-456-789')).toBe('244923456789');
    expect(toWhatsAppNumber('00244923456789')).toBe('244923456789');
    expect(toWhatsAppNumber('12345')).toBeNull();
    expect(toWhatsAppNumber(undefined)).toBeNull();
  });
  it('builds an encoded wa.me link', () => {
    expect(whatsAppLink('Olá & até já', '923456789')).toBe('https://wa.me/244923456789?text=Ol%C3%A1%20%26%20at%C3%A9%20j%C3%A1');
    expect(whatsAppLink('x')).toBe('https://wa.me/?text=x');
  });
});

describe('fiado receipt', () => {
  it('shows the total owed after the purchase', () => {
    const credit = { ...sale, method: 'credit' as const, cashReceivedCents: undefined };
    const text = receiptText(credit, { storeName: 'Loja Exemplo' }, 'Maria Exemplo', 1_675_000);
    expect(text).toContain('Cliente: Maria Exemplo');
    expect(text).toContain('Total em dívida: 16.750 Kz');
    expect(receiptText({ ...credit, dueDate: '2026-11-21' }, { storeName: 'Loja Exemplo' })).toContain('Pagar até: 21/11/2026');
    expect(text).toContain('Documento não fiscal');
    expect(receiptText(sale, { storeName: 'Loja Exemplo' }, undefined, 5)).not.toContain('dívida');
  });
});

describe('shoppingListText', () => {
  it('lists what to buy and what is left', () => {
    const text = shoppingListText(
      'Loja Exemplo',
      [
        { name: 'Óleo 1 L', stock: 3, suggested: 13 },
        { name: 'Ovos', stock: -1, suggested: 9 },
      ],
      new Date(2026, 10, 6),
    );
    expect(text).toBe('*Lista de compras — Loja Exemplo*\n06/11/2026\n\n• Óleo 1 L: 13 (há 3)\n• Ovos: 9 (há 0)');
  });
});

describe('daySummaryText', () => {
  it('summarises the day for the owner', () => {
    const view = summariseDayView(
      [
        { ...sale, method: 'cash', totalCents: 425_000, createdAt: new Date(2026, 10, 6, 9).toISOString() },
        { ...sale, method: 'kwik', totalCents: 100_000, createdAt: new Date(2026, 10, 6, 10).toISOString() },
        { ...sale, method: 'cash', totalCents: 50_000, voidedAt: 'x', createdAt: new Date(2026, 10, 6, 11).toISOString() },
      ],
      [{ createdAt: new Date(2026, 10, 6, 12).toISOString(), amountCents: 30_000, method: 'cash' }],
      new Date(2026, 10, 6, 18),
      new Date(2026, 10, 6, 18),
    );
    expect(daySummaryText('Loja Exemplo', 'Hoje, 06/11/2026', view)).toBe(
      [
        '*Resumo — Loja Exemplo*',
        'Hoje, 06/11/2026',
        '',
        'Vendido: *5.250 Kz* (2 vendas)',
        'Ontem até esta hora: 0 Kz',
        'Dinheiro na caixa (numerário): 4.550 Kz',
        '',
        '• Numerário: 4.250 Kz',
        '• QR KWiK: 1.000 Kz',
        'Recebido de clientes: 300 Kz',
        'Vendas anuladas: 1 (500 Kz)',
      ].join('\n'),
    );
  });
});

describe('weighed products in messages', () => {
  it('receipt and shopping list show kilos', () => {
    const weighed: Sale = {
      ...sale,
      items: [
        { productId: 'w', name: 'Feijão a granel', unitPriceCents: 140_000, quantity: 750, lineTotalCents: 105_000, soldBy: 'weight' },
      ],
      totalCents: 105_000,
    };
    expect(receiptText(weighed, { storeName: 'Loja' })).toContain('0,75 kg x Feijão a granel — 1.050 Kz');
    expect(
      shoppingListText('Loja', [{ name: 'Feijão a granel', stock: 500, suggested: 9_500, soldBy: 'weight' }], new Date(2026, 10, 6)),
    ).toContain('• Feijão a granel: 9,5 kg (há 0,5 kg)');
  });
});

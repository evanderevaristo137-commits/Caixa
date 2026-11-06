import { describe, expect, it } from 'vitest';
import { receiptText, reminderText } from './messages';
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
  it('is polite and includes amount and date', () => {
    const msg = reminderText('Maria Exemplo', 1_250_000, new Date(2026, 9, 30).toISOString(), 'Loja Exemplo', new Date(2026, 10, 6, 9));
    expect(msg.startsWith('Bom dia, Maria!')).toBe(true);
    expect(msg).toContain('12.500 Kz');
    expect(msg).toContain('desde 30/10/2026');
    expect(msg).toContain('obrigado');
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

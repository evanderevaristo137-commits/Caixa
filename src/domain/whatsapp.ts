/**
 * Normalises an Angolan phone number for wa.me links ("923 456 789" → "244923456789").
 * Returns null when the number does not look valid.
 */
export function toWhatsAppNumber(phone: string | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 9 && digits.startsWith('9')) return '244' + digits;
  if (digits.length === 12 && digits.startsWith('2449')) return digits;
  // Other countries: accept international numbers that already include the country code.
  if (phone.trim().startsWith('+') && digits.length >= 8 && digits.length <= 15) return digits;
  return null;
}

/** Builds a wa.me link. Without a number, WhatsApp lets the user choose the contact. */
export function whatsAppLink(text: string, phone?: string): string {
  const number = toWhatsAppNumber(phone);
  return `https://wa.me/${number ?? ''}?text=${encodeURIComponent(text)}`;
}

export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 19) return 'Boa tarde';
  return 'Boa noite';
}

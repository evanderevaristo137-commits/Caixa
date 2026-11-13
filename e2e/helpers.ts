import { expect, type Page } from '@playwright/test';

/** Today's date in Luanda ("YYYY-MM-DD"): the phone in the tests is there (see playwright.config.ts). */
export const luandaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Luanda' }).format(new Date());

/**
 * The instant the phone's clock starts at in the tests: today, at this time in Luanda.
 * The suite runs in the afternoon, when the demo shop has sold all day: without this, tests that
 * look at "today's" sales failed whenever they ran between midnight and the first sale of the demo.
 */
export const luandaTime = (hhmm: string) => new Date(`${luandaToday()}T${hhmm}:00+01:00`);

/** A date n days from today, as the app shows it ("21/11/2026"). */
export const inDays = (n: number) => {
  const [y, m, d] = luandaToday().split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + n));
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${pad(t.getUTCDate())}/${pad(t.getUTCMonth() + 1)}/${t.getUTCFullYear()}`;
};

/** Switches tab and waits until that screen is the one shown. */
export async function nav(page: Page, tab: 'Vender' | 'Clientes' | 'Hoje' | 'Produtos' | 'Mais') {
  const button = page.getByRole('navigation').getByRole('button', { name: tab });
  await button.click();
  await expect(button).toHaveAttribute('aria-current', 'page');
}

/** First visit: the Terms of use appear; this accepts them and opens the real shop. */
export async function openStore(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Aceitar e começar' }).click();
  await expect(page.getByRole('dialog', { name: 'Bem-vindo à Caixa' })).toHaveCount(0);
  // Then one question, the kind of shop: skipped here (see shop-type.e2e.ts).
  await page.getByRole('dialog', { name: 'Que tipo de loja tem?' }).getByRole('button', { name: 'Saltar' }).click();
  await expect(page.getByRole('dialog', { name: 'Que tipo de loja tem?' })).toHaveCount(0);
}

/** First visit: goes straight to the demo (no terms needed: its data is fictitious). */
export async function openDemo(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Ver só a demonstração' }).click();
  await expect(page.getByText('MODO DEMONSTRAÇÃO')).toBeVisible();
  await expect(page.getByRole('button', { name: /Arroz 1 kg/ })).toBeVisible();
}

/** Reads "12.500 Kz" as cêntimos. */
export const kzToCents = (text: string | null) => {
  const m = /([\d.]+)(?:,(\d{2}))? Kz/.exec(text ?? '');
  if (!m) throw new Error(`No amount in "${text}"`);
  return Number(m[1]!.replace(/\./g, '')) * 100 + Number(m[2] ?? 0);
};

export async function sellInCash(page: Page, products: RegExp[]) {
  await nav(page, 'Vender');
  for (const p of products) await page.getByRole('button', { name: p }).first().click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Numerário' }).click();
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  await expect(page.getByText('Venda registada')).toBeVisible();
}

/** «Hoje» → «Relatórios» → one of the reports. */
export async function openReport(page: Page, name: 'Semana, mês e ficha da loja' | 'Contas da loja' | 'Procurar vendas') {
  await page.getByRole('button', { name: 'Relatórios', exact: true }).click();
  await page.getByRole('dialog', { name: 'Relatórios' }).getByRole('button', { name }).click();
  await expect(page.getByRole('dialog', { name: name === 'Semana, mês e ficha da loja' ? 'Semana e mês' : name })).toBeVisible();
}

/** «Hoje» → «Para tratar hoje»: the line whose text matches (it opens its detail). */
export const toDoLine = (page: Page, text: RegExp) =>
  page.getByRole('list', { name: 'Para tratar hoje' }).getByRole('button', { name: text });

type MoreSection = 'A loja' | 'Dinheiro e clientes' | 'Segurança e cópias' | 'Piloto e ajuda';

/** «Mais» with one of its sections open (it stays open while the app is open). */
export async function openMore(page: Page, section: MoreSection) {
  await nav(page, 'Mais');
  const button = page.getByRole('button', { name: new RegExp(`^${section}`) });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
}

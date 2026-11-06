import { expect, type Page } from '@playwright/test';

/** Switches tab and waits until that screen is the one shown. */
export async function nav(page: Page, tab: 'Vender' | 'Fiado' | 'Hoje' | 'Produtos' | 'Mais') {
  const button = page.getByRole('navigation').getByRole('button', { name: tab });
  await button.click();
  await expect(button).toHaveAttribute('aria-current', 'page');
}

export async function openDemo(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Entrar no modo demonstração' }).click();
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

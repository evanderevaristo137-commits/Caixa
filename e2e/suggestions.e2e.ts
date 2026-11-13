import { expect, test } from './fixtures';
import { luandaTime, nav, openDemo } from './helpers';

test.beforeEach(async ({ context }) => {
  await context.clock.install({ time: luandaTime('15:00') });
});

test('suggestions: the demo sugar sells below its cost; the line opens the product, and «Já vi» hides it for a week', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Hoje');
  await expect(page.getByRole('heading', { name: 'Sugestões para a loja' })).toBeVisible();
  await page.getByRole('button', { name: '1 produto vende abaixo do custo' }).click();
  const sheet = page.getByRole('dialog', { name: '1 produto vende abaixo do custo' });
  await expect(sheet).toContainText('cada venda dá prejuízo');
  await expect(sheet).toContainText(/Açúcar 1 kg\s*vende a 1\.100 Kz, custou 1\.150 Kz/);
  // The product opens, to change its price.
  await sheet.getByRole('button', { name: /Açúcar 1 kg/ }).click();
  await expect(page.getByRole('dialog', { name: 'Editar produto' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Editar produto' }).getByRole('button', { name: 'Fechar', exact: true }).click();

  await sheet.getByRole('button', { name: 'Já vi (esconder durante 7 dias)' }).click();
  await expect(page.getByRole('button', { name: '1 produto vende abaixo do custo' })).toHaveCount(0);
  // Still hidden after closing and opening the app.
  await page.reload();
  await nav(page, 'Hoje');
  await expect(page.getByRole('button', { name: 'Relatórios', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '1 produto vende abaixo do custo' })).toHaveCount(0);
});

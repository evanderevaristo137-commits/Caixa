import { expect, test } from '@playwright/test';
import { luandaTime, nav, openDemo } from './helpers';

test.beforeEach(async ({ context }) => {
  await context.clock.install({ time: luandaTime('15:00') });
});

test('finding sales: by product, by customer on credit, voided ones apart, and each sale opens', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Hoje');
  const todayCount = await page.locator('.bg-brand-700 p.text-lg').textContent();
  await page.getByRole('button', { name: 'Procurar vendas' }).click();
  const sheet = page.getByRole('dialog', { name: 'Procurar vendas' });
  const summary = sheet.getByRole('status');
  await expect(sheet.getByRole('button', { name: '7 dias' })).toHaveAttribute('aria-pressed', 'true');
  await expect(summary).toContainText(/^\d+ vendas · [\d.]+ Kz/);

  // Today's sales are the ones Hoje counts.
  await sheet.getByRole('button', { name: 'Hoje', exact: true }).click();
  await expect(summary).toContainText(`${todayCount} · `);

  // A product, without accents or capitals.
  await sheet.getByRole('button', { name: '30 dias' }).click();
  await sheet.getByLabel('Produto, cliente ou n.º da venda').fill('feijao');
  const rows = sheet.getByRole('listitem');
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) await expect(row).toContainText(/Feijão/);

  // Sales on credit of one customer.
  await sheet.getByLabel('Produto, cliente ou n.º da venda').fill('');
  await sheet.getByRole('group', { name: 'Forma de pagamento' }).getByRole('button', { name: 'Cliente (a crédito)' }).click();
  await sheet.getByLabel('Cliente', { exact: true }).selectOption({ label: 'Joana Mateus' });
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) await expect(row).toContainText('Cliente (a crédito) (Joana Mateus)');

  // A sale opens its detail (to resend the receipt or void it).
  await rows.first().getByRole('button').click();
  await expect(page.getByRole('dialog', { name: /^Venda n\.º \d+$/ })).toBeVisible();
});

test('a voided sale shows among the voided ones and never counts in the total', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Hoje');
  await page.getByRole('button', { name: /Arroz/ }).first().click();
  await page.getByRole('button', { name: 'Anular venda' }).click();
  await page.getByRole('button', { name: 'Engano no registo' }).click();
  await page.getByRole('button', { name: 'Confirmar anulação' }).click();
  await expect(page.getByText(/Anulada em/)).toBeVisible();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();

  await page.getByRole('button', { name: 'Procurar vendas' }).click();
  const sheet = page.getByRole('dialog', { name: 'Procurar vendas' });
  await sheet.getByRole('button', { name: 'Hoje', exact: true }).click();
  await expect(sheet.getByRole('status')).toContainText('E 1 anulada (não conta no total).');
  await sheet.getByRole('group', { name: 'Vendas anuladas' }).getByRole('button', { name: 'Anuladas' }).click();
  await expect(sheet.getByRole('listitem')).toHaveCount(1);
  await expect(sheet.getByRole('listitem').first()).toContainText('Anulada');
});

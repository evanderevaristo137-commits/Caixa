import { expect, test } from '@playwright/test';
import { luandaTime, nav, openDemo } from './helpers';

test.beforeEach(async ({ context }) => {
  await context.clock.install({ time: luandaTime('15:00') });
});

test('customers: the debtors report by age of the debt, and how punctually each one pays', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Clientes');
  await page.getByRole('button', { name: 'Relatório de devedores' }).click();
  const sheet = page.getByRole('dialog', { name: 'Devedores' });
  await expect(sheet).toContainText(/Em dívida\s*[\d.]+ Kz/);
  await expect(sheet).toContainText(/Em atraso\s*[\d.]+ Kz/);
  for (const bucket of ['A vencer', '1 a 7 dias', '8 a 30 dias', 'Mais de 30 dias']) await expect(sheet).toContainText(bucket);
  // All 5 demo customers owe something; the most overdue first.
  await expect(sheet.getByRole('listitem')).toHaveCount(5);
  await expect(sheet.getByRole('listitem').first()).toContainText(/em atraso há \d+ dias/);
  await sheet.getByRole('listitem').first().getByRole('button').click();
  const customer = page.getByRole('dialog').last();
  await expect(customer).toContainText(/a tempo|Ainda poucas compras a crédito/);
});

test('suppliers: purchase prices per product and per supplier, the average term, and the purchase report', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Produtos');
  await page
    .getByRole('button', { name: /Arroz 1 kg/ })
    .first()
    .click();
  const product = page.getByRole('dialog', { name: 'Editar produto' });
  await expect(product.getByRole('heading', { name: 'Preços de compra' })).toBeVisible();
  await expect(product).toContainText(/Armazém Kikolo\s*\d\d\/\d\d\/\d{4}\s*1\.000 Kz/);
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();

  await page.getByRole('tab', { name: 'Fornecedores' }).click();
  await page.getByRole('button', { name: /Armazém Kikolo/ }).click();
  const supplier = page.getByRole('dialog', { name: 'Armazém Kikolo' });
  await expect(supplier).toContainText('Prazo médio para pagar:');
  await expect(supplier.getByRole('heading', { name: 'Preços deste fornecedor' })).toBeVisible();
  await expect(supplier).toContainText(/Arroz 1 kg\s*1\.000 Kz/);
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();

  await page.getByRole('tab', { name: 'Compras' }).click();
  await page.getByRole('button', { name: 'Relatório de compras' }).click();
  const report = page.getByRole('dialog', { name: 'Relatório de compras' });
  await expect(report.getByRole('status')).toContainText(/3 compras · [\d.]+ Kz/);
  await expect(report).toContainText('Por fornecedor');
  await expect(report).toContainText(/Armazém Kikolo/);
  await expect(report).toContainText('Produtos mais comprados');
});

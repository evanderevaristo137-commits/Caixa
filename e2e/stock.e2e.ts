import { expect, test } from '@playwright/test';
import { luandaTime, nav, openDemo, openStore } from './helpers';

test.beforeEach(async ({ context }) => {
  await context.clock.install({ time: luandaTime('15:00') });
});

test('stock analysis: what to buy by the speed of sale, losses, and the pace in the product', async ({ page }) => {
  await openStore(page);
  await page.getByRole('button', { name: '+ Criar o primeiro produto' }).click();
  await page.getByLabel('Nome').fill('Arroz 1 kg');
  await page.getByLabel('Preço (Kz)').fill('1.000');
  await page.getByLabel('Preço de custo (Kz) — opcional').fill('800');
  await page.getByLabel('Stock inicial').fill('12');
  await page.getByRole('button', { name: 'Guardar' }).click();
  // 7 sold today (the new product starts in the cart): a new product is measured over 7 days, so 1 a day.
  const rice = page.getByRole('button', { name: /Arroz 1 kg/ }).first();
  for (let i = 0; i < 6; i++) await rice.click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Numerário' }).click();
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  await page.getByRole('button', { name: 'Nova venda' }).click();

  await nav(page, 'Produtos');
  await page.getByRole('button', { name: 'Análise do stock' }).click();
  const sheet = page.getByRole('dialog', { name: 'Análise do stock' });
  // 5 left at 1 a day: on the list though above its minimum, with two weeks of sales (14 − 5).
  await expect(sheet.getByRole('listitem')).toHaveCount(1);
  await expect(sheet.getByRole('listitem')).toContainText(/Arroz 1 kg\s*há 5 · acaba em ~5 dias\s*Comprar 9/);
  await expect(sheet.getByRole('link', { name: 'Enviar lista de compras' })).toHaveAttribute('href', /Arroz%201%20kg%3A%209/);
  await sheet.getByRole('tab', { name: 'Parados' }).click();
  await expect(sheet).toContainText('Nenhum produto parado');
  await sheet.getByRole('tab', { name: 'Perdas' }).click();
  await expect(sheet).toContainText('Sem perdas neste período.');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();

  // Two broken: an adjustment down is a loss, worth the cost price.
  await page.getByRole('button', { name: /Arroz 1 kg/ }).click();
  const detail = page.getByRole('dialog', { name: 'Editar produto' });
  await expect(detail).toContainText('Vendeu 7 nos últimos 30 dias · vende ~1 por dia · acaba em ~5 dias');
  await detail.getByRole('button', { name: 'Acerto de stock' }).click();
  await detail.getByLabel('Quantidade real contada').fill('3');
  await detail.getByRole('button', { name: 'Partido / estragado' }).click();
  await detail.getByRole('button', { name: 'Confirmar' }).click();
  await expect(detail).toContainText('acaba em ~3 dias');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();

  await page.getByRole('button', { name: 'Análise do stock' }).click();
  await sheet.getByRole('tab', { name: 'Perdas' }).click();
  await expect(sheet.getByRole('status')).toContainText('Perdas: 1.600 Kz');
  await expect(sheet.getByRole('listitem')).toContainText(/Arroz 1 kg\s*2 · 1\.600 Kz\s*Partido \/ estragado: 2/);
});

test('the demo shows products standing still and what to buy', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Produtos');
  await page.getByRole('button', { name: 'Análise do stock' }).click();
  const sheet = page.getByRole('dialog', { name: 'Análise do stock' });
  await expect(sheet.getByRole('link', { name: 'Enviar lista de compras' })).toBeVisible();
  await expect(sheet.getByText(/^Comprar /).first()).toBeVisible();
});

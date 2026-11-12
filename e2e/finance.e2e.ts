import { expect, test } from '@playwright/test';
import { luandaTime, luandaToday, nav, openDemo, openStore } from './helpers';

test.beforeEach(async ({ context }) => {
  await context.clock.install({ time: luandaTime('15:00') });
});

test('Contas da loja: sold next to received, money in and out, and the estimated result of a period', async ({ page }) => {
  await openStore(page);
  await page.getByRole('button', { name: '+ Criar o primeiro produto' }).click();
  await page.getByLabel('Nome').fill('Arroz 1 kg');
  await page.getByLabel('Preço (Kz)').fill('1.000');
  await page.getByLabel('Preço de custo (Kz) — opcional').fill('800');
  await page.getByLabel('Stock inicial').fill('10');
  await page.getByRole('button', { name: 'Guardar' }).click();

  // Two in cash (the first product created goes straight into the cart), one on credit.
  const rice = page.getByRole('button', { name: /Arroz 1 kg/ }).first();
  await rice.click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Numerário' }).click();
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  await page.getByRole('button', { name: 'Nova venda' }).click();
  await rice.click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cliente (a crédito)' }).click();
  await page.getByRole('button', { name: '+ Novo cliente' }).click();
  await page.getByLabel('Nome').fill('Cliente Exemplo');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  await page.getByRole('button', { name: 'Nova venda' }).click();

  // Hoje: sold and received side by side.
  await nav(page, 'Hoje');
  const day = page.locator('div.rounded-2xl.bg-brand-700');
  await expect(day).toContainText('3.000 Kz');
  await expect(day).toContainText('Recebido: 2.000 Kz');
  await expect(day).toContainText('a crédito 1.000 Kz');
  const summary = await page.getByRole('link', { name: 'Enviar resumo do dia' }).getAttribute('href');
  expect(decodeURIComponent(summary!)).toContain('Recebido: 2.000 Kz (a crédito: 1.000 Kz)');

  // The rent, paid another way.
  await page.getByRole('button', { name: 'Registar saída' }).click();
  await page.getByRole('button', { name: 'Renda', exact: true }).click();
  await page.getByLabel('Valor (Kz)').fill('500');
  await page.getByRole('button', { name: 'Guardar saída' }).click();

  await page.getByRole('button', { name: 'Contas da loja' }).click();
  const sheet = page.getByRole('dialog', { name: 'Contas da loja' });
  const periods = sheet.getByRole('group', { name: 'Período' });
  await expect(periods.getByRole('button', { name: 'Hoje' })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet).toContainText(/Vendido\s*3\.000 Kz\s*2 vendas/);
  await expect(sheet).toContainText(/Recebido\s*2\.000 Kz/);
  await expect(sheet).toContainText(/Vendido a crédito \(ainda por receber\)\s*1\.000 Kz/);
  await expect(sheet).toContainText(/Entrou\s*2\.000 Kz\s*Em numerário\s*2\.000 Kz/);
  await expect(sheet).toContainText(/Saiu\s*− 500 Kz\s*Despesas\s*500 Kz/);
  await expect(sheet).toContainText(/Saldo do período\s*1\.500 Kz/);
  await expect(sheet).toContainText(/Vendas\s*3\.000 Kz\s*Custo da mercadoria vendida\s*− 2\.400 Kz/);
  await expect(sheet).toContainText(/Lucro bruto estimado\s*600 Kz\s*Margem de 20%/);
  await expect(sheet).toContainText(/Resultado estimado\s*100 Kz/);
  await expect(sheet).toContainText('não é contabilidade nem serve para impostos');

  // Another period: nothing yesterday.
  await periods.getByRole('button', { name: 'Ontem' }).click();
  await expect(sheet).toContainText('Nada registado neste período.');

  // Chosen dates: the wrong way round is explained; yesterday and today give today's numbers.
  await periods.getByRole('button', { name: 'Escolher datas' }).click();
  const [y, m, d] = luandaToday().split('-').map(Number);
  const yesterday = new Date(Date.UTC(y!, m! - 1, d! - 1)).toISOString().slice(0, 10);
  await sheet.getByLabel('De').fill(luandaToday());
  await sheet.getByLabel('Até').fill(yesterday);
  await expect(sheet.getByRole('alert')).toContainText('a primeira antes da segunda');
  await sheet.getByLabel('De').fill(yesterday);
  await sheet.getByLabel('Até').fill(luandaToday());
  await expect(sheet).toContainText(/Resultado estimado\s*100 Kz/);
});

test('Semana e mês shows sold next to received', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Hoje');
  await page.getByRole('button', { name: 'Semana, mês e ficha da loja' }).click();
  const sheet = page.getByRole('dialog', { name: 'Semana e mês' });
  await expect(sheet.getByRole('heading', { name: 'Vendido e recebido' })).toBeVisible();
  await expect(sheet).toContainText(/Vendido a crédito \(ainda por receber\)\s*[\d.]+ Kz/);
  await expect(sheet).toContainText(/Dívidas pagas por clientes\s*[\d.]+ Kz/);
});

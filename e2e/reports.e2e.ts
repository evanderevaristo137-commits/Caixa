import { readFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { luandaTime, nav, openDemo, openReport } from './helpers';

test.beforeEach(async ({ context, page }) => {
  await context.clock.install({ time: luandaTime('15:00') });
  // window.print would open the phone's print screen: count the calls instead.
  await page.addInitScript(() => {
    const w = window as unknown as { printed: number };
    w.printed = 0;
    window.print = () => {
      w.printed += 1;
    };
  });
});

const printed = (page: Page) => page.evaluate(() => (window as unknown as { printed: number }).printed);

/**
 * «Guardar ou enviar (PDF ou Excel)» in `from`: checks the top of the report (the shop, the title,
 * when it was made, the demo notice), prints it and saves the spreadsheet. Returns the spreadsheet.
 */
async function keepOrSend(page: Page, from: Locator, title: string) {
  const before = await printed(page);
  await from.getByRole('button', { name: 'Guardar ou enviar (PDF ou Excel)' }).click();
  const report = page.getByRole('dialog', { name: 'Relatório para guardar ou enviar' });
  await expect(report.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(report).toContainText('DEMONSTRAÇÃO — dados fictícios');
  await expect(report).toContainText('Mercearia da Dona Teresa');
  await expect(report).toContainText(/Feito em \d{2}\/\d{2}\/\d{4} 15:\d{2}/);
  await expect(report).toContainText('não é um documento fiscal nem contabilístico');

  await report.getByRole('button', { name: 'Imprimir ou guardar em PDF' }).click();
  await expect.poll(() => printed(page)).toBe(before + 1);

  const download = page.waitForEvent('download');
  await report.getByRole('button', { name: 'Enviar para o Excel' }).click();
  const file = await download;
  const csv = await readFile((await file.path())!, 'utf8');
  expect(csv.startsWith('﻿')).toBe(true);
  expect(csv).toContain('DEMONSTRAÇÃO — dados fictícios');
  expect(csv).toContain(`Mercearia da Dona Teresa\r\n${title}\r\n`);
  return { report, csv, filename: file.suggestedFilename() };
}

test('reports to keep or send: PDF and Excel with the shop on top, from each report', async ({ page }) => {
  await openDemo(page);

  // «Contas da loja» (7 days).
  await nav(page, 'Hoje');
  await openReport(page, 'Contas da loja');
  const finance = page.getByRole('dialog', { name: 'Contas da loja' });
  await finance.getByRole('group', { name: 'Período' }).getByRole('button', { name: '7 dias' }).click();
  const accounts = await keepOrSend(page, finance, 'Contas da loja');
  expect(accounts.filename).toMatch(/^contas-da-loja-.*\.csv$/);
  for (const part of ['Vendido e recebido', 'Entradas e saídas de dinheiro', 'Resultado estimado'])
    expect(accounts.csv).toContain(`\r\n${part}\r\n`);
  // Money as numbers Excel adds up (decimal comma, no thousands dot).
  expect(accounts.csv).toMatch(/\r\nRecebido;\d+,\d{2}\r\n/);
  // Android's back button closes the report, not the accounts behind it.
  await page.goBack();
  await expect(accounts.report).toHaveCount(0);
  await expect(finance).toBeVisible();
  await finance.getByRole('button', { name: 'Fechar', exact: true }).click();

  // «Semana e mês»: the sales of the last 7 days.
  await openReport(page, 'Semana, mês e ficha da loja');
  const week = page.getByRole('dialog', { name: 'Semana e mês' });
  const sales = await keepOrSend(page, week, 'Vendas dos últimos 7 dias');
  for (const part of ['Resumo', 'Vendas por dia', 'Como pagaram', 'Mais vendidos', 'Vendido e recebido'])
    expect(sales.csv).toContain(`\r\n${part}\r\n`);
  await sales.report.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(sales.report).toHaveCount(0);
  await week.getByRole('button', { name: 'Fechar', exact: true }).click();

  // «Devedores»: names, never the phone numbers.
  await nav(page, 'Clientes');
  await page.getByRole('button', { name: 'Relatório de devedores' }).click();
  const debtors = await keepOrSend(page, page.getByRole('dialog', { name: 'Devedores' }), 'Devedores');
  expect(debtors.csv).toContain('Cliente;Em dívida;Em atraso;Dias de atraso');
  expect(debtors.csv).toContain('Joana Mateus');
  expect(debtors.csv).not.toContain('955502264');
  await debtors.report.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('dialog', { name: 'Devedores' }).getByRole('button', { name: 'Fechar', exact: true }).click();

  // «Stock da loja», from «Análise do stock».
  await nav(page, 'Produtos');
  await page.getByRole('button', { name: 'Análise do stock' }).click();
  const stock = await keepOrSend(page, page.getByRole('dialog', { name: 'Análise do stock' }), 'Stock da loja');
  await expect(stock.report).toContainText(/Valor do stock ao preço de custo\s*[\d.]+ Kz/);
  expect(stock.csv).toContain(
    '\r\nStock de cada produto\r\nProduto;Categoria;Subcategoria;Stock;Mínimo;Preço de custo;Preço de venda;Valor ao custo\r\n',
  );
  expect(stock.csv).toMatch(/\r\nArroz 1 kg;Alimentação e mercearia;Arroz, massas e fuba;-?\d+;/);
  await stock.report.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('dialog', { name: 'Análise do stock' }).getByRole('button', { name: 'Fechar', exact: true }).click();

  // «Relatório de compras» (90 days).
  await page.getByRole('tablist', { name: 'Produtos' }).getByRole('tab', { name: 'Compras' }).click();
  await page.getByRole('button', { name: 'Relatório de compras' }).click();
  const buying = page.getByRole('dialog', { name: 'Relatório de compras' });
  await buying.getByRole('button', { name: '90 dias' }).click();
  const purchases = await keepOrSend(page, buying, 'Relatório de compras');
  expect(purchases.csv).toContain('\r\nPor fornecedor\r\nFornecedor;N.º de compras;Valor\r\n');
});

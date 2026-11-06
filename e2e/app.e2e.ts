import { expect, test } from '@playwright/test';
import { kzToCents, nav, openDemo, sellInCash } from './helpers';

test('a 3-product sale gives a non-fiscal WhatsApp receipt', async ({ page }) => {
  await openDemo(page);
  await sellInCash(page, [/Arroz 1 kg/, /Óleo vegetal/, /Sardinha/]);
  const href = await page.getByRole('link', { name: 'Enviar talão por WhatsApp' }).getAttribute('href');
  const text = decodeURIComponent(href!.split('text=')[1]!);
  expect(text).toContain('*TOTAL: 3.700 Kz*');
  expect(text).toContain('Documento não fiscal — não serve de factura.');
});

test('Today matches the sales, and a voided sale stops counting', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Hoje');
  const total = page.locator('.bg-brand-700 .text-4xl');
  const before = kzToCents(await total.textContent());
  await sellInCash(page, [/Arroz 5 kg/]);
  await page.getByRole('button', { name: 'Nova venda' }).click();
  await nav(page, 'Hoje');
  await expect.poll(async () => kzToCents(await total.textContent())).toBe(before + 550_000);

  await page
    .getByRole('button', { name: /Arroz 5 kg/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Anular venda' }).click();
  await page.getByRole('button', { name: 'Engano no registo' }).click();
  await page.getByRole('button', { name: 'Confirmar anulação' }).click();
  await expect(page.getByText(/Anulada em/)).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect.poll(async () => kzToCents(await total.textContent())).toBe(before);
  await expect(page.getByText('1 venda anulada (5.500 Kz)')).toBeVisible();
});

test('fiado shows who owes and the reminder opens WhatsApp with a polite message', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Clientes');
  await expect(page.getByText('A receber de clientes')).toBeVisible();
  await page.getByRole('button', { name: /Joana Mateus/ }).click();
  await expect(page.getByText(/há \d+ dias/).first()).toBeVisible();
  const href = await page.getByRole('link', { name: 'Lembrar por WhatsApp' }).getAttribute('href');
  expect(href).toMatch(/^https:\/\/wa\.me\/244955502264\?text=/);
  expect(decodeURIComponent(href!)).toContain('com todo o respeito');
});

test('the Android back button closes the open window and keeps the cart', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: /Arroz 1 kg/ }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await expect(page.getByText('Como vai pagar?')).toBeVisible();
  await page.goBack();
  await expect(page.getByText('Como vai pagar?')).toBeHidden();
  await expect(page.getByText('1 artigo')).toBeVisible();
  await page.reload();
  await expect(page.getByText('1 artigo')).toBeVisible();
});

test('works without internet after the first visit', async ({ page, context }) => {
  await openDemo(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('MODO DEMONSTRAÇÃO')).toBeVisible();
  await sellInCash(page, [/Pão/]);
  await page.getByRole('button', { name: 'Nova venda' }).click();
  await nav(page, 'Produtos');
  await expect(page.getByRole('button', { name: /Arroz 1 kg/ })).toBeVisible();
});

test('the real shop and the demo never share data', async ({ page }) => {
  await page.goto('./');
  await nav(page, 'Produtos');
  await page.getByRole('button', { name: '+ Novo produto' }).first().click();
  await page.getByLabel('Nome').fill('Produto da loja real');
  await page.getByLabel('Preço (Kz)').fill('1.000');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('button', { name: /Produto da loja real/ })).toBeVisible();

  await nav(page, 'Mais');
  await page.getByRole('button', { name: 'Entrar no modo demonstração' }).click();
  await nav(page, 'Produtos');
  await expect(page.getByRole('button', { name: /Arroz 1 kg/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Produto da loja real/ })).toHaveCount(0);

  await nav(page, 'Mais');
  await page.getByRole('button', { name: 'Sair da demonstração (voltar à minha loja)' }).click();
  await nav(page, 'Produtos');
  await expect(page.getByRole('button', { name: /Produto da loja real/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Arroz 1 kg/ })).toHaveCount(0);
});

test('low stock becomes a WhatsApp shopping list', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Hoje');
  const href = await page.getByRole('link', { name: 'Enviar lista de compras' }).getAttribute('href');
  const text = decodeURIComponent(href!.split('text=')[1]!);
  expect(text).toContain('*Lista de compras — Mercearia da Dona Teresa*');
  expect(text).toMatch(/• Ovos \(dúzia\): \d+ \(há \d+\)/);
});

test('a fiado sale receipt shows the total owed, and reminders are remembered', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: /Arroz 1 kg/ }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cliente (a crédito)' }).click();
  await page.getByRole('button', { name: 'Joana Mateus' }).click();
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  const receipt = page.getByRole('link', { name: 'Enviar talão por WhatsApp' });
  await expect(receipt).toHaveAttribute('href', /^https:\/\/wa\.me\/244955502264\?text=/);
  // The total owed is added to the receipt right after the sale is saved.
  await expect.poll(async () => decodeURIComponent((await receipt.getAttribute('href'))!)).toMatch(/Total em dívida: [\d.]+ Kz/);
  await page.getByRole('button', { name: 'Nova venda' }).click();

  await nav(page, 'Clientes');
  await page.getByRole('button', { name: /Joana Mateus/ }).click();
  const popup = page.context().waitForEvent('page');
  await page.getByRole('link', { name: 'Lembrar por WhatsApp' }).click();
  await (await popup).close();
  await expect(page.getByText('Último lembrete: hoje')).toBeVisible();
});

test('first use: create the first product straight from the Sell screen', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '+ Criar o primeiro produto' }).click();
  await page.getByLabel('Nome').fill('Primeiro produto');
  await page.getByLabel('Preço (Kz)').fill('250');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('1 artigo')).toBeVisible();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Numerário' }).click();
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  await expect(page.getByText('Dica: ponha o nome da sua loja')).toBeVisible();
});

test('the day summary can be sent to the owner by WhatsApp', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Hoje');
  const href = await page.getByRole('link', { name: 'Enviar resumo do dia' }).getAttribute('href');
  const text = decodeURIComponent(href!.split('text=')[1]!);
  expect(text).toContain('*Resumo — Mercearia da Dona Teresa*');
  expect(text).toMatch(/Vendido: \*[\d.]+ Kz\* \(\d+ vendas\)/);
  expect(text).toContain('Dinheiro na caixa (numerário)');
});

test('a customer name can be corrected', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Clientes');
  await page.getByRole('button', { name: /Luísa Neto/ }).click();
  await page.getByLabel('Nome').fill('Luísa Neto Exemplo');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect(page.getByRole('button', { name: /Luísa Neto Exemplo/ })).toBeVisible();
});

test('if saving fails (phone full), the user is told and nothing is half-saved', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Hoje');
  const count = page.locator('.bg-brand-700 p.text-lg');
  const before = await count.textContent();
  await nav(page, 'Vender');
  const stockBefore = await page.getByRole('button', { name: /Arroz 5 kg/ }).textContent();
  // From now on, writing a sale fails like a full phone would.
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['add']>) {
      if (this.name === 'sales') throw new DOMException('Disk full', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await page.getByRole('button', { name: /Arroz 5 kg/ }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Numerário' }).click();
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  await expect(page.getByText('Não foi possível guardar. Tente outra vez.')).toBeVisible();
  await expect(page.getByText('Venda registada')).toBeHidden();
  await page.getByRole('button', { name: 'Fechar' }).click();
  await expect(page.getByRole('button', { name: /Arroz 5 kg/ })).toHaveText(stockBefore!.replace(/\d+$/, '') + '1');
  await nav(page, 'Hoje');
  await expect(count).toHaveText(before!);
});

test('a double tap on "Confirmar venda" records one sale', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Hoje');
  const count = page.locator('.bg-brand-700 p.text-lg');
  const before = Number((await count.textContent())!.match(/\d+/)![0]);
  await nav(page, 'Vender');
  await page.getByRole('button', { name: /Pão/ }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Numerário' }).click();
  await page.getByRole('button', { name: 'Confirmar venda' }).dblclick();
  await expect(page.getByText('Venda registada')).toBeVisible();
  await page.getByRole('button', { name: 'Nova venda' }).click();
  await nav(page, 'Hoje');
  await expect(count).toHaveText(`${before + 1} vendas`);
});

import { readFileSync } from 'node:fs';
import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures';
import { inDays, luandaTime, nav, openDemo, openStore } from './helpers';

// «Pronto quando» (CLAUDE.md), one by one, in a real shop that starts from nothing, as the shops of
// the pilot will. The same points in the demo: app.e2e.ts. «Os testes passam»: the CI publishes only
// when every test passes.

test.beforeEach(async ({ context }) => {
  await context.clock.install({ time: luandaTime('15:00') });
});

interface Manifest {
  name: string;
  icons: { src: string; sizes: string; purpose?: string }[];
}

test('«instalo no ecrã inicial»: the phone finds everything it needs to install the app', async ({ page, request }) => {
  await page.goto('./');
  const base = new URL('./', page.url()).pathname;
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const url = new URL(href!, page.url());
  const manifest = (await (await request.get(url.href)).json()) as Manifest;
  expect(manifest).toMatchObject({
    name: 'Caixa',
    short_name: 'Caixa',
    lang: 'pt-AO',
    display: 'standalone',
    start_url: base,
    scope: base,
  });
  // The icons Android asks for, including one that fills the round shape of some phones.
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192' }),
      expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
    ]),
  );
  for (const icon of manifest.icons) expect((await request.get(new URL(icon.src, url).href)).ok(), icon.src).toBe(true);
  // The part of the app that works without internet takes charge of the page.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
});

test('a real shop from nothing: a day without internet, a sale of 3 products in 6 taps, Hoje and the customers add up', async ({
  page,
  context,
}) => {
  await openStore(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await nav(page, 'Produtos');
  for (const [name, price, stock] of [
    ['Arroz 1 kg', '1.200', '20'],
    ['Óleo 1 L', '1.850', '10'],
    ['Sabão azul', '350', '30'],
  ] as const) {
    await page.getByRole('button', { name: '+ Novo produto' }).first().click();
    const form = page.getByRole('dialog', { name: 'Novo produto' });
    await form.getByLabel('Nome').fill(name);
    await form.getByLabel('Preço (Kz)').fill(price);
    await form.getByLabel('Stock inicial').fill(stock);
    await form.getByRole('button', { name: 'Guardar' }).click();
    await expect(form).toHaveCount(0);
  }

  // «uso sem internet»: from here on the app and the shop come from the phone.
  await context.setOffline(true);
  await page.reload();
  await nav(page, 'Vender');

  // «Faço uma venda de 3 produtos em menos de 30 segundos»: 6 taps (the 3 products, «Cobrar», how the
  // customer pays, «Confirmar venda»): about 15 seconds for someone careful, half for someone used to it.
  let taps = 0;
  const tap = async (target: Locator) => {
    taps += 1;
    await target.click();
  };
  const started = Date.now();
  await tap(page.getByRole('button', { name: /Arroz 1 kg/ }).first());
  await tap(page.getByRole('button', { name: /Óleo 1 L/ }).first());
  await tap(page.getByRole('button', { name: /Sabão azul/ }).first());
  await tap(page.getByRole('button', { name: 'Cobrar', exact: true }));
  await tap(page.getByRole('dialog').getByRole('button', { name: 'Numerário' }));
  await tap(page.getByRole('button', { name: 'Confirmar venda' }));
  await expect(page.getByText('Venda registada')).toBeVisible();
  expect(taps).toBe(6);
  expect(Date.now() - started).toBeLessThan(30_000);
  await page.getByRole('button', { name: 'Nova venda' }).click();

  // On credit, to a new customer, with the usual term (15 days).
  await page
    .getByRole('button', { name: /Óleo 1 L/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cliente (a crédito)' }).click();
  await page.getByRole('button', { name: '+ Novo cliente' }).click();
  await page.getByLabel('Nome').fill('Cliente Exemplo');
  await page.getByLabel('Telefone (opcional)').fill('955 502 264');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('button', { name: '15 dias' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  await expect(page.getByText('Venda registada')).toBeVisible();
  await page.getByRole('button', { name: 'Nova venda' }).click();

  // «O ecrã Hoje bate certo com as vendas registadas»: 3.400 + 1.850 sold, 3.400 received.
  await nav(page, 'Hoje');
  await expect(page.getByRole('button', { name: /^Vendas de hoje/ })).toContainText(/5\.250 Kz\s*2 vendas/);
  await expect(page.getByRole('button', { name: /^Dinheiro recebido/ })).toContainText(/3\.400 Kz\s*a crédito 1\.850 Kz/);
  await nav(page, 'Produtos');
  await expect(page.getByRole('button', { name: /Arroz 1 kg.*19 em stock/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Óleo 1 L.*8 em stock/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sabão azul.*29 em stock/ })).toBeVisible();

  // «O fiado mostra quem deve, quanto e há quantos dias, e o lembrete abre o WhatsApp com a
  // mensagem»: 20 days later (the sale was due in 15), still without internet.
  await page.clock.setSystemTime(new Date(luandaTime('15:00').getTime() + 20 * 86_400_000));
  await page.reload();
  await nav(page, 'Clientes');
  const row = page.getByRole('listitem').filter({ hasText: 'Cliente Exemplo' });
  await expect(row).toContainText('1.850 Kz');
  await expect(row).toContainText('Atrasado 5 dias');
  const reminder = await row.getByRole('link', { name: /Lembrar/ }).getAttribute('href');
  expect(reminder).toMatch(/^https:\/\/wa\.me\/244955502264\?text=/);
  expect(decodeURIComponent(reminder!)).toContain(`o pagamento de 1.850 Kz venceu a ${inDays(15)}`);
});

test('«Mais» says which version of the app this is (also sent in the pilot summary)', async ({ page }) => {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  await openDemo(page);
  await nav(page, 'Mais');
  await expect(page.getByText(new RegExp(`^Versão ${version.replace(/\./g, '\\.')} · \\d{2}/\\d{2}/\\d{4}`))).toBeVisible();
});

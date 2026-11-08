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

test('customers show who is late, due today or soon, and reminders follow the due date', async ({ page }) => {
  await openDemo(page);
  // Red number on the tab: 2 late + 1 due today.
  await expect(page.getByRole('navigation').getByRole('button', { name: /Clientes/ })).toContainText('3');
  await nav(page, 'Clientes');
  await expect(page.getByText('A receber de clientes')).toBeVisible();
  const row = (name: string) => page.getByRole('listitem').filter({ hasText: name });
  await expect(row('Joana Mateus')).toContainText(/Atrasado \d+ dias?/);
  await expect(row('António Kiala')).toContainText(/Atrasado \d+ dias?/);
  await expect(row('Esperança Domingos')).toContainText('Vence hoje');
  await expect(row('Manuel Sebastião')).toContainText('Vence em 2 dias');
  await expect(row('Luísa Neto')).toContainText(/Vence a \d\d\/\d\d\/\d{4}/);
  await expect(row('Luísa Neto').getByRole('link')).toHaveCount(0);

  const quick = await row('Esperança Domingos')
    .getByRole('link', { name: /Lembrar/ })
    .getAttribute('href');
  expect(quick).toMatch(/^https:\/\/wa\.me\/244955502264\?text=/);
  expect(decodeURIComponent(quick!)).toContain('vence hoje');

  await page.getByRole('button', { name: /Joana Mateus/ }).click();
  const href = await page.getByRole('link', { name: 'Lembrar por WhatsApp' }).getAttribute('href');
  expect(decodeURIComponent(href!)).toMatch(/com todo o respeito, que o pagamento de [\d.]+ Kz venceu a \d\d\/\d\d\/\d{4}/);
});

const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

test('a credit sale has a payment term: the usual one is pre-selected, another can be chosen', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: /Arroz 1 kg/ }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cliente (a crédito)' }).click();
  await page.getByRole('button', { name: 'Luísa Neto' }).click();
  await expect(page.getByRole('button', { name: '15 dias' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/^Pagar até [a-zçá]+\.,/)).toContainText(inDays(15));
  await page.getByRole('button', { name: '7 dias' }).click();
  await expect(page.getByText(/^Pagar até [a-zçá]+\.,/)).toContainText(inDays(7));
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  await expect(page.getByText('Venda registada')).toBeVisible();
  await expect(page.getByText(/^Pagar até [a-zçá]+\.,/)).toContainText(inDays(7));
  const receipt = page.getByRole('link', { name: 'Enviar talão por WhatsApp' });
  await expect.poll(async () => decodeURIComponent((await receipt.getAttribute('href'))!)).toContain(`Pagar até: ${inDays(7)}`);
});

test('Today lists the customers to remind', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Hoje');
  await expect(page.getByRole('heading', { name: 'Pagamentos de clientes' })).toBeVisible();
  await expect(page.getByText('Em atraso: 2')).toBeVisible();
  await expect(page.getByText('Vencem hoje: 1')).toBeVisible();
  await expect(page.getByText('Nos próximos 2 dias: 1')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Lembrar Esperança Domingos' })).toBeVisible();
});

test('the usual payment term and payment notifications are set in Mais', async ({ page, context }) => {
  await context.grantPermissions(['notifications']);
  await openDemo(page);
  await nav(page, 'Mais');
  const terms = page.getByRole('group', { name: 'Prazo habitual para os clientes pagarem' });
  await expect(terms.getByRole('button', { name: '15 dias' })).toHaveAttribute('aria-pressed', 'true');
  await terms.getByRole('button', { name: '30 dias' }).click();
  await expect(terms.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Avisos activos.')).toBeVisible();
  await page.getByRole('button', { name: 'Testar aviso' }).click();
  await expect
    .poll(() => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => n.title)))
    .toContain('Pagamentos de clientes');

  await nav(page, 'Vender');
  await page.getByRole('button', { name: /Arroz 1 kg/ }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cliente (a crédito)' }).click();
  await page.getByRole('button', { name: 'Luísa Neto' }).click();
  await expect(page.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true');
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

test('with the app closed, Android wakes the background check and the shop gets one notification a day', async ({ page, context }) => {
  await context.grantPermissions(['notifications']);
  await page.goto('./');
  // Real shop: a credit sale due today.
  await page.getByRole('button', { name: '+ Criar o primeiro produto' }).click();
  await page.getByLabel('Nome').fill('Produto de teste');
  await page.getByLabel('Preço (Kz)').fill('1.000');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cliente (a crédito)' }).click();
  await page.getByRole('button', { name: '+ Novo cliente' }).click();
  await page.getByLabel('Nome').fill('Cliente de teste');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('button', { name: 'Outra data' }).click();
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await page.getByLabel('Outra data').fill(today);
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  await expect(page.getByText('Venda registada')).toBeVisible();

  // The app keeps the short list the background checker reads.
  const readMeta = (key: string) =>
    page.evaluate(
      (k) =>
        new Promise<string | undefined>((resolve) => {
          const r = indexedDB.open('caixa-loja');
          r.onsuccess = () => {
            const q = r.result.transaction('meta').objectStore('meta').get(k);
            q.onsuccess = () => resolve(q.result?.value);
          };
        }),
      key,
    );
  await expect.poll(() => readMeta('creditAlertItems')).toContain('Cliente de teste');

  // Android wakes the service worker (Periodic Background Sync).
  const cdp = await context.newCDPSession(page);
  const registrations: string[] = [];
  cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => e.registrations.forEach((r) => registrations.push(r.registrationId)));
  await cdp.send('ServiceWorker.enable');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => registrations.length).toBeGreaterThan(0);
  const origin = new URL(page.url()).origin;
  const wake = () =>
    cdp.send('ServiceWorker.dispatchPeriodicSyncEvent', { origin, registrationId: registrations[0]!, tag: 'caixa-credit-alerts' });
  const notifications = () =>
    page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => `${n.title}: ${n.body}`));

  await wake();
  await expect.poll(notifications).toEqual(['Pagamentos de clientes: 1 vence hoje. Toque para ver e lembrar os clientes.']);
  await expect.poll(() => readMeta('alertsNotifiedOn')).toBe(today);

  // Woken again the same day: no second notification.
  await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).forEach((n) => n.close()));
  await wake();
  await page.waitForTimeout(500);
  expect(await notifications()).toEqual([]);
});

test('the owner code protects voids and price changes, and everything shows in the activity log', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Mais');
  await page.getByRole('button', { name: 'Definir código' }).click();
  await page.getByLabel('Novo código (4 a 6 números)').fill('2580');
  await page.getByLabel('Repita o novo código').fill('2580');
  await page.getByRole('button', { name: 'Guardar' }).last().click();
  await expect(page.getByText('Código activo.')).toBeVisible();

  // Voiding a sale asks for the code.
  await nav(page, 'Hoje');
  await page.getByRole('button', { name: /Arroz/ }).first().click();
  await page.getByRole('button', { name: 'Anular venda' }).click();
  await page.getByRole('button', { name: 'Engano no registo' }).click();
  await page.getByRole('button', { name: 'Confirmar anulação' }).click();
  await expect(page.getByText('Esta acção precisa do código do dono.')).toBeVisible();
  await page.getByLabel('Código', { exact: true }).fill('1111');
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByText('Código errado.')).toBeVisible();
  await page.getByLabel('Código', { exact: true }).fill('2580');
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByText(/Anulada em/)).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).click();

  // A new price asks for the code too.
  await nav(page, 'Produtos');
  await page.getByRole('button', { name: /Sal 1 kg/ }).click();
  await page.getByLabel('Preço (Kz)').fill('350');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByLabel('Código', { exact: true }).fill('2580');
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByRole('button', { name: /Sal 1 kg/ })).toContainText('350 Kz');

  // Activity log, in plain words.
  await nav(page, 'Mais');
  await page.getByRole('button', { name: 'Ver registo' }).click();
  await expect(page.getByText(/Venda n\.º \d+ anulada \([\d.]+ Kz\)\. Motivo: Engano no registo/)).toBeVisible();
  await expect(page.getByText('Sal 1 kg: preço 300 Kz → 350 Kz')).toBeVisible();
  await expect(page.getByText('Código do dono definido')).toBeVisible();
});

test("an electronic payment keeps the reference shown on the customer's phone", async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: /Arroz 1 kg/ }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'PayPay' }).click();
  await page.getByLabel('Referência do pagamento (opcional)').fill('PP-778899');
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  const receipt = page.getByRole('link', { name: 'Enviar talão por WhatsApp' });
  await expect.poll(async () => decodeURIComponent((await receipt.getAttribute('href'))!)).toContain('Ref. do pagamento: PP-778899');
  await page.getByRole('button', { name: 'Nova venda' }).click();
  await nav(page, 'Hoje');
  await page
    .getByRole('button', { name: /Arroz 1 kg/ })
    .first()
    .click();
  await expect(page.getByText('Referência do cliente')).toBeVisible();
  await expect(page.getByText('PP-778899')).toBeVisible();
});

test('"Verificar os dados" confirms that every number adds up', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Mais');
  await page.getByRole('button', { name: 'Verificar agora' }).click();
  await expect(page.getByText(/Tudo certo: \d+ vendas e \d+ produtos verificados\./)).toBeVisible();
});

test('invoicing data (optional): what is missing, and the export for the certified partner', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Mais');
  await page.getByLabel('NIF (opcional)').fill('5000000000');
  await page.getByRole('button', { name: 'Guardar' }).first().click();
  const card = page.locator('details', { hasText: 'Morada da loja' });
  await card.locator('summary').click();
  await expect(card.getByText(/ainda falta: morada da loja, regime de IVA, IVA de alguns produtos vendidos/)).toBeVisible();
  await card.getByLabel('Morada da loja').fill('Rua Exemplo, Cazenga, Luanda');
  await card.getByRole('button', { name: 'Regime geral' }).click();
  await card.getByLabel('IVA habitual (%)').fill('14');
  await card.getByRole('button', { name: 'Guardar' }).click();
  await expect(card.getByText(/ainda falta: IVA de alguns produtos vendidos/)).toBeVisible();

  const download = page.waitForEvent('download');
  await card.getByRole('button', { name: 'Dados de vendas para o parceiro (JSON)' }).click();
  const file = await download;
  const data = JSON.parse(await (await import('node:fs/promises')).readFile((await file.path())!, 'utf8'));
  expect(data.notAnInvoice).toBe(true);
  expect(data.documents.length).toBeGreaterThan(100);
  expect(data.documents[0]).toMatchObject({ kind: 'invoice', currency: 'AOA', seller: { nif: '5000000000', vatRegime: 'general' } });
  expect(JSON.stringify(data)).not.toContain('955502264');
});

test('credit limit: warns, needs explicit confirmation, is logged, and can be switched off', async ({ page }) => {
  await openDemo(page);
  const startCreditSale = async (customer: string, rice5kg: number) => {
    await nav(page, 'Vender');
    for (let i = 0; i < rice5kg; i++) await page.getByRole('button', { name: /Arroz 5 kg/ }).click();
    await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cliente (a crédito)' }).click();
    await page.getByRole('button', { name: customer }).click();
  };

  // A customer with overdue payments is flagged.
  await startCreditSale('Joana Mateus', 1);
  await expect(page.getByText('Este cliente tem pagamentos em atraso.')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).click();
  await page.getByRole('button', { name: /artigo/ }).click();
  await page.getByRole('button', { name: 'Limpar' }).click();

  // 6 × 5.500 Kz = 33.000 Kz: above the demo limit of 30.000 Kz whatever the customer owes.
  await startCreditSale('Luísa Neto', 6);
  await expect(page.getByRole('alert')).toContainText('Esta venda passa o limite em');
  await expect(page.getByRole('button', { name: 'Confirmar venda' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Confirmar acima do limite' }).click();
  await expect(page.getByText('Venda registada')).toBeVisible();
  await page.getByRole('button', { name: 'Nova venda' }).click();

  await nav(page, 'Mais');
  await page.getByRole('button', { name: 'Ver registo' }).click();
  await expect(page.getByText(/Venda n\.º \d+ a crédito acima do limite: 33\.000 Kz/)).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).click();
  await page.getByRole('group', { name: 'Limite de crédito habitual' }).getByRole('button', { name: 'Sem limite' }).click();

  await startCreditSale('Luísa Neto', 6);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirmar venda' })).toBeVisible();
});

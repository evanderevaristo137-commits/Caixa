import { expect, test } from '@playwright/test';
import { inDays, kzToCents, luandaTime, luandaToday, nav, openDemo, openStore, sellInCash } from './helpers';
import { simpleXlsx } from '../src/lib/test-xlsx';

// Mid-afternoon in Luanda: the demo shop has sold all day (e2e/midnight.e2e.ts covers the empty start of the day).
test.beforeEach(async ({ context }) => {
  await context.clock.install({ time: luandaTime('15:00') });
});

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
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
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
  // The test shows what the phone would show today: the demo has customers and suppliers to pay.
  await page.getByRole('button', { name: 'Testar aviso' }).click();
  await expect
    .poll(() =>
      page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => `${n.title}: ${n.body}`)),
    )
    .toEqual([expect.stringMatching(/^Avisos da loja: Clientes: .+\. Fornecedores: .+\. Toque para ver\.$/)]);

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
  await openStore(page);
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
  await openStore(page);
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
  expect(text).toContain('Dinheiro que devia estar na caixa');
});

test('a customer name can be corrected', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Clientes');
  await page.getByRole('button', { name: /Luísa Neto/ }).click();
  await page.getByLabel('Nome').fill('Luísa Neto Exemplo');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
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
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
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
  await expect(count).toHaveText(before + 1 === 1 ? '1 venda' : `${before + 1} vendas`);
});

test('with the app closed, Android wakes the background check and the shop gets one notification a day', async ({ page, context }) => {
  await context.grantPermissions(['notifications']);
  await openStore(page);
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

  // The app keeps the short lists the background checker reads, when the shop leaves the app
  // (screen off or another app): simulated here.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
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

  // The app also keeps what the shop owes its suppliers and the digital payments alarm.
  await expect.poll(() => readMeta('supplierAlertItems')).toBe('[]');
  await expect.poll(() => readMeta('inssAlert')).toBe('null'); // this shop does not follow the INSS
  await expect.poll(() => readMeta('digitalAlert')).toContain(`"on":"${today}"`);
  // Another day with all three: still one notification, which says everything and opens Hoje.
  await page.evaluate(
    (day) =>
      new Promise<void>((resolve) => {
        const r = indexedDB.open('caixa-loja');
        r.onsuccess = () => {
          const tx = r.result.transaction('meta', 'readwrite');
          const meta = tx.objectStore('meta');
          meta.put({ key: 'supplierAlertItems', value: JSON.stringify([{ dueDate: day }]) });
          meta.put({
            key: 'digitalAlert',
            value: JSON.stringify({ on: day, alarm: true, belowMinimum: true, shareBp: 3200, minShareBp: 4000 }),
          });
          meta.delete('alertsNotifiedOn');
          tx.oncomplete = () => resolve();
        };
      }),
    today,
  );
  await wake();
  await expect
    .poll(notifications)
    .toEqual([
      'Avisos da loja: Clientes: 1 vence hoje. Fornecedores: 1 vence hoje. Pagamentos digitais: abaixo do mínimo do contrato: 32% (mínimo 40%). Toque para ver.',
    ]);
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
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();

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
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: /^Carrinho:/ }).click();
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
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('group', { name: 'Limite de crédito habitual' }).getByRole('button', { name: 'Sem limite' }).click();

  await startCreditSale('Luísa Neto', 6);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirmar venda' })).toBeVisible();
});

test('selling by weight: by weight or by amount, change the weight, receipt in kg', async ({ page }) => {
  await openDemo(page);
  // 500 g of beans at 1.400 Kz/kg = 700 Kz
  await page.getByRole('button', { name: /Feijão a granel/ }).click();
  await page.getByRole('button', { name: '500 g', exact: true }).click();
  await expect(page.getByText('Custa 700 Kz')).toBeVisible();
  await page.getByRole('button', { name: 'Pôr no carrinho' }).click();
  // "500 Kz de açúcar" at 1.000 Kz/kg: weigh 0,5 kg, pay exactly 500 Kz
  await page.getByRole('button', { name: /Açúcar a granel/ }).click();
  await page.getByRole('button', { name: 'Valor', exact: true }).click();
  await page.getByRole('button', { name: '500 Kz', exact: true }).click();
  await expect(page.getByText('Pesar 0,5 kg')).toBeVisible();
  await page.getByRole('button', { name: 'Pôr no carrinho' }).click();
  await expect(page.getByText('2 artigos')).toBeVisible();

  // Change the beans to 0,75 kg from the cart.
  await page.getByRole('button', { name: /^Carrinho:/ }).click();
  await expect(page.getByText('0,5 kg × 1.400 Kz/kg = 700 Kz')).toBeVisible();
  await page.getByRole('listitem').filter({ hasText: 'Feijão a granel' }).getByRole('button', { name: 'Mudar peso' }).click();
  await page.getByLabel('Peso (kg ou g)').fill('0,75');
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByText('0,75 kg × 1.400 Kz/kg = 1.050 Kz')).toBeVisible();
  await page
    .getByRole('button', { name: /^Cobrar/ })
    .last()
    .click();
  await expect(page.getByRole('dialog').getByText('1.550 Kz', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Numerário' }).click();
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  const href = await page.getByRole('link', { name: 'Enviar talão por WhatsApp' }).getAttribute('href');
  const text = decodeURIComponent(href!.split('text=')[1]!);
  expect(text).toContain('0,75 kg x Feijão a granel — 1.050 Kz');
  expect(text).toContain('0,5 kg x Açúcar a granel — 500 Kz');
});

test('a real shop creates a product sold by the kilo and its stock goes down in kg', async ({ page }) => {
  await openStore(page);
  await nav(page, 'Produtos');
  await page.getByRole('button', { name: '+ Novo produto' }).first().click();
  await page.getByLabel('Nome').fill('Batata a granel');
  await page.getByRole('button', { name: 'Ao quilo (kg)' }).click();
  await page.getByLabel('Preço por kg (Kz)').fill('700');
  await page.getByLabel('Stock inicial (kg)').fill('10');
  await page.getByLabel('Stock mínimo em kg (avisar quando chegar a)').fill('2,5');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('button', { name: /Batata a granel/ })).toContainText('10 kg em stock');

  await nav(page, 'Vender');
  await page.getByRole('button', { name: /Batata a granel/ }).click();
  await page.getByLabel('Peso (kg ou g)').fill('1,5');
  await expect(page.getByText('Custa 1.050 Kz')).toBeVisible();
  await page.getByRole('button', { name: 'Pôr no carrinho' }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Numerário' }).click();
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  await page.getByRole('button', { name: 'Nova venda' }).click();
  await nav(page, 'Produtos');
  await expect(page.getByRole('button', { name: /Batata a granel/ })).toContainText('8,5 kg em stock');
});

test('the cart button is always there, with the number of articles', async ({ page }) => {
  await openDemo(page);
  const cart = page.getByRole('button', { name: /^Carrinho:/ });
  await expect(cart).toHaveAccessibleName('Carrinho: O carrinho está vazio.');
  await cart.click();
  await expect(page.getByText('Toque num produto para o pôr no carrinho.')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar a vender' }).click();

  await page.getByRole('button', { name: /Arroz 1 kg/ }).click();
  await page.getByRole('button', { name: /Arroz 1 kg/ }).click();
  await page.getByRole('button', { name: /Óleo vegetal/ }).click();
  await expect(cart).toHaveAccessibleName('Carrinho: 3 artigos, 4.250 Kz');
  await expect(cart).toContainText('3');
  await cart.click();
  await expect(page.getByRole('dialog', { name: 'Carrinho' }).getByText('Arroz 1 kg')).toBeVisible();
  // Removing the last article keeps the cart open, now empty.
  await page.getByRole('button', { name: 'Limpar' }).click();
  await expect(cart).toHaveAccessibleName('Carrinho: O carrinho está vazio.');
});

test('cost price gives the day profit; the app makes barcodes and prints labels', async ({ page }) => {
  // window.print would open the phone's print screen: count the calls instead.
  await page.addInitScript(() => {
    const w = window as unknown as { printed: number };
    w.printed = 0;
    window.print = () => {
      w.printed += 1;
    };
  });
  await openStore(page);
  await nav(page, 'Produtos');
  await page.getByRole('button', { name: '+ Novo produto' }).first().click();
  await page.getByLabel('Nome').fill('Bolacha Maria');
  await page.getByLabel('Preço (Kz)').fill('500');
  await page.getByLabel('Preço de custo (Kz) — opcional').fill('350');
  await expect(page.getByText('Ganha 150 Kz em cada unidade (margem de 30%).')).toBeVisible();
  await page.getByRole('button', { name: 'Gerar código' }).click();
  await expect(page.getByLabel('Código de barras (opcional)')).toHaveValue(/^20\d{11}$/);
  await expect(page.getByRole('img', { name: /^Código de barras 20\d{11}$/ })).toBeVisible();
  await expect(page.getByText('Código da loja: só funciona nesta loja.')).toBeVisible();
  await page.getByLabel('Stock inicial').fill('10');
  await page.getByRole('button', { name: 'Guardar' }).click();

  await page.getByRole('button', { name: '+ Novo produto' }).first().click();
  await page.getByLabel('Nome').fill('Pão');
  await page.getByLabel('Preço (Kz)').fill('100');
  await page.getByLabel('Stock inicial').fill('20');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('button', { name: /Pão/ })).toBeVisible();

  await sellInCash(page, [/Bolacha Maria/, /Bolacha Maria/, /Pão/]);
  await page.getByRole('button', { name: 'Nova venda' }).click();
  await nav(page, 'Hoje');
  const card = page.locator('div.rounded-2xl').filter({ has: page.getByRole('heading', { name: 'Lucro estimado das vendas' }) });
  await expect(card.locator('.text-3xl')).toHaveText('300 Kz');
  await expect(card).toContainText('Margem de 30% · os produtos custaram 700 Kz');
  await expect(card).toContainText('1 artigo vendido sem preço de custo não entra nesta conta.');
  const summary = await page.getByRole('link', { name: 'Enviar resumo do dia' }).getAttribute('href');
  expect(decodeURIComponent(summary!)).toContain('Lucro estimado: 300 Kz (margem de 30%) — só dos produtos com preço de custo');

  await nav(page, 'Produtos');
  await page.getByRole('button', { name: 'Imprimir etiquetas' }).click();
  await page.getByRole('button', { name: 'Gerar código para 1 produto sem código' }).click();
  await expect(page.getByText('1 código gerado.')).toBeVisible();
  await page.getByRole('button', { name: 'Mais uma cópia' }).click();
  await page.getByRole('button', { name: 'Imprimir ou guardar em PDF' }).click();
  const sheet = page.getByRole('dialog', { name: 'Etiquetas para imprimir' });
  await expect(sheet).toContainText('4 etiquetas');
  await expect(sheet.getByRole('img', { name: /^Código de barras 20/ })).toHaveCount(4);
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
});

/** 1.250.000 cêntimos → "12.500" (as a person types it). */
const kzTyped = (cents: number) => String(cents / 100).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

test('money out and closing the day: expected cash, short or over, and the log', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Hoje');
  const cashCard = page
    .locator('div.rounded-2xl')
    .filter({ has: page.getByRole('heading', { name: 'Dinheiro que devia estar na caixa' }) });
  const expected = cashCard.locator('.text-3xl');
  await expect(cashCard).toContainText('Fundo de caixa5.000 Kz');
  const before = kzToCents(await expected.textContent());

  await cashCard.getByRole('button', { name: 'Registar saída' }).click();
  await page.getByRole('button', { name: 'Transporte', exact: true }).click();
  await page.getByLabel('Valor (Kz)').fill('1.500');
  await page.getByLabel('Nota (opcional)').fill('Táxi');
  await page.getByRole('button', { name: 'Guardar saída' }).click();
  await expect.poll(async () => kzToCents(await expected.textContent())).toBe(before - 150_000);
  await expect(cashCard.getByRole('button', { name: /Transporte · Táxi Saiu da caixa − 1\.500 Kz/ })).toBeVisible();

  await cashCard.getByRole('button', { name: 'Fechar o dia' }).click();
  const sheet = page.getByRole('dialog', { name: 'Fechar o dia' });
  await expect(sheet.getByLabel('Fundo de caixa (troco com que o dia começou)')).toHaveValue('5.000');
  await sheet.getByLabel('Quanto dinheiro contou na caixa?').fill(kzTyped(before - 150_000 - 20_000));
  await expect(sheet.getByRole('status')).toHaveText('Faltam 200 Kz.');
  await sheet.getByLabel('Quanto dinheiro contou na caixa?').fill(kzTyped(before - 150_000));
  await expect(sheet.getByRole('status')).toHaveText('Bate certo.');
  await sheet.getByLabel('Quanto dinheiro contou na caixa?').fill(kzTyped(before - 150_000 - 20_000));
  await sheet.getByRole('button', { name: 'Confirmar fecho' }).click();
  await expect(cashCard).toContainText(/Dia fechado às \d\d:\d\d: contou [\d.]+ Kz\. Faltam 200 Kz\./);
  await expect(page.getByText('Despesas do dia')).toBeVisible();
  await expect(page.getByText('Resultado do dia (lucro − despesas)')).toBeVisible();

  const summary = await page.getByRole('link', { name: 'Enviar resumo do dia' }).getAttribute('href');
  expect(decodeURIComponent(summary!)).toMatch(/Fecho: contou [\d.]+ Kz — faltam 200 Kz/);

  await nav(page, 'Mais');
  await page.getByRole('button', { name: 'Ver registo' }).click();
  await expect(page.getByText(/fechado: contou [\d.]+ Kz, devia ter [\d.]+ Kz — faltam 200 Kz/).first()).toBeVisible();
  await expect(page.getByText('Saída de dinheiro: Transporte — 1.500 Kz (da caixa) · Táxi')).toBeVisible();
});

test('a purchase on credit raises the stock and the cost; the supplier is paid and gets an order by WhatsApp', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Produtos');
  await page.getByRole('tab', { name: 'Fornecedores' }).click();
  const kikolo = page.getByRole('button', { name: /Armazém Kikolo/ });
  await expect(kikolo).toContainText('Vence em 2 dias');

  await page.getByRole('tab', { name: 'Compras' }).click();
  await page.getByRole('button', { name: '+ Nova compra' }).click();
  const sheet = page.getByRole('dialog', { name: 'Nova compra' });
  await sheet.getByRole('button', { name: 'Armazém Kikolo' }).click();
  await sheet.getByRole('button', { name: '+ Juntar produto' }).click();
  await sheet.getByRole('searchbox', { name: 'Escolha o produto' }).fill('fuba de milho');
  await sheet.getByRole('button', { name: 'Fuba de milho 1 kg' }).click();
  await sheet.getByLabel('Quantidade', { exact: true }).fill('10');
  await sheet.getByLabel('Custo de cada (Kz)').fill('700');
  await expect(sheet.getByText('7.000 Kz').first()).toBeVisible();
  await sheet.getByRole('button', { name: 'A crédito (pagar depois)' }).click();
  await sheet.getByRole('button', { name: '7 dias' }).click();
  await sheet.getByRole('button', { name: 'Registar compra' }).click();
  await expect(page.getByText('Compra registada: o stock subiu e o preço de custo foi actualizado.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Compra n\.º 4 · Armazém Kikolo/ })).toContainText('7.000 Kz');

  await page.getByRole('tab', { name: 'Produtos' }).click();
  await page.getByRole('button', { name: /Fuba de milho 1 kg/ }).click();
  await expect(page.getByLabel('Preço de custo (Kz) — opcional')).toHaveValue('700');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();

  await page.getByRole('tab', { name: 'Fornecedores' }).click();
  await kikolo.click();
  const supplier = page.getByRole('dialog', { name: 'Armazém Kikolo' });
  const owes = kzToCents(await supplier.locator('.text-3xl').textContent());
  await supplier.getByRole('button', { name: 'Registar pagamento' }).click();
  await supplier.getByLabel('Valor pago').fill('7.000');
  await supplier.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => kzToCents(await supplier.locator('.text-3xl').textContent())).toBe(owes - 700_000);
  const order = await supplier.getByRole('link', { name: 'Encomendar por WhatsApp' }).getAttribute('href');
  expect(order).toMatch(/^https:\/\/wa\.me\/244955502264\?text=/);
  expect(decodeURIComponent(order!)).toContain('Queria encomendar:');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();

  await nav(page, 'Hoje');
  await expect(page.getByRole('button', { name: /A pagar a fornecedores/ })).toBeVisible();
});

test('a customer gets the account statement by WhatsApp', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Clientes');
  await page.getByRole('button', { name: /Joana Mateus/ }).click();
  const href = await page.getByRole('link', { name: 'Enviar extracto por WhatsApp' }).getAttribute('href');
  expect(href).toMatch(/^https:\/\/wa\.me\/244955502264\?text=/);
  const text = decodeURIComponent(href!.split('text=')[1]!);
  expect(text).toContain('*Extracto de conta — Mercearia da Dona Teresa*');
  expect(text).toMatch(/• \d\d\/\d\d — Compra n\.º \d+: [\d.]+ Kz \(.+\) · pagar até \d\d\/\d\d\/\d{4}/);
  expect(text).toMatch(/\*Total em dívida: [\d.]+ Kz\*/);
  expect(text).toContain('(em atraso)');
  expect(text).toContain('Documento não fiscal — não serve de factura.');
});

test('week and month reports with a chart, and the store sheet for a bank', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { printed: number };
    w.printed = 0;
    window.print = () => {
      w.printed += 1;
    };
  });
  await openDemo(page);
  await nav(page, 'Hoje');
  await page.getByRole('button', { name: 'Semana, mês e ficha da loja' }).click();
  const sheet = page.getByRole('dialog', { name: 'Semana e mês' });
  await expect(sheet.getByText('Vendido', { exact: true })).toBeVisible();
  await expect(sheet.getByRole('group', { name: 'Vendas por dia' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^[a-zçá]+\., \d\d\/\d\d: [\d.]+ Kz, \d+ vendas?/ })).toHaveCount(7);
  await expect(sheet.getByText(/Pagamentos electrónicos: \d+% das vendas/)).toBeVisible();

  await sheet.getByRole('tab', { name: '12 meses' }).click();
  await expect(sheet.getByRole('group', { name: 'Vendas por mês' })).toBeVisible();
  await sheet.getByRole('button', { name: '+ Ver tabela' }).click();
  await expect(sheet.getByRole('table')).toContainText(/[a-z]{3}\. \d{4}/);

  await sheet.getByRole('button', { name: 'Ficha da loja (para um banco ou parceiro)' }).click();
  const ficha = page.getByRole('dialog', { name: 'Ficha da loja' });
  await expect(ficha).toContainText('DEMONSTRAÇÃO — dados fictícios, não correspondem a uma loja real.');
  await expect(ficha).toContainText('Mercearia da Dona Teresa');
  await expect(ficha).toContainText('Não é um documento fiscal nem contabilístico.');
  const share = await ficha.getByRole('link', { name: 'Enviar por WhatsApp' }).getAttribute('href');
  expect(decodeURIComponent(share!)).toContain('*Ficha da loja — Mercearia da Dona Teresa*');
  expect(decodeURIComponent(share!)).toMatch(/INSS \(registado pela loja\): 1[34] meses pagos, 1[34] seguidos/);
  await ficha.getByRole('button', { name: 'Imprimir ou guardar em PDF' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
});

test('a sale on hold: serve another customer and come back to it without losing anything', async ({ page }) => {
  await openDemo(page);
  const cart = page.getByRole('button', { name: /^Carrinho:/ });
  await page.getByRole('button', { name: /Arroz 1 kg/ }).click();
  await page.getByRole('button', { name: /Arroz 1 kg/ }).click();
  await cart.click();
  await page.getByRole('button', { name: 'Pôr em espera (atender outro cliente)' }).click();
  await expect(page.getByText('Venda posta em espera. Pode atender outro cliente.')).toBeVisible();
  await expect(cart).toHaveAccessibleName('Carrinho: O carrinho está vazio.');
  const held = page.getByRole('group', { name: 'Em espera' });
  await expect(held.getByRole('button')).toHaveCount(1);
  await expect(held.getByRole('button').first()).toHaveAccessibleName(/2 artigos, 2\.400 Kz/);

  // Another customer buys oil; then the first one comes back.
  await page.getByRole('button', { name: /Óleo vegetal/ }).click();
  await held.getByRole('button').first().click();
  await expect(cart).toHaveAccessibleName('Carrinho: 2 artigos, 2.400 Kz');
  await expect(held.getByRole('button').first()).toHaveAccessibleName(/1 artigo, 1\.850 Kz/);

  // It survives the app being closed and opened again.
  await page.reload();
  await expect(page.getByRole('group', { name: 'Em espera' }).getByRole('button')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Carrinho:/ })).toHaveAccessibleName('Carrinho: 2 artigos, 2.400 Kz');
});

test('the pilot summary carries only the shop numbers, never customer names or phones', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Mais');
  await page.getByLabel('WhatsApp de quem acompanha o piloto (opcional)').fill('923 000 000');
  await page.getByRole('button', { name: 'Guardar' }).last().click();
  const link = page.getByRole('link', { name: 'Enviar resumo do piloto por WhatsApp' });
  await expect(link).toHaveAttribute('href', /^https:\/\/wa\.me\/244923000000\?text=/);
  const text = decodeURIComponent((await link.getAttribute('href'))!.split('text=')[1]!);
  expect(text).toContain('*DEMONSTRAÇÃO — dados fictícios, não contar no piloto*');
  expect(text).toContain('*Resumo do piloto — Caixa*');
  expect(text).toMatch(/Últimos 7 dias: \d+ dias? com vendas · \d+ vendas? · [\d.]+ Kz/);
  expect(text).toMatch(/Também usou \(30 dias\): \d+ fechos? do dia/);
  // The owner's INSS: only whether it is used and how many payments were recorded.
  expect(text).toMatch(/Reforma \(INSS\): acompanha na app · 1[34] pagamentos registados/);
  for (const name of ['Joana', 'António', 'Esperança', 'Manuel', 'Luísa', '955']) expect(text).not.toContain(name);
});

test('credit for stock: digital payments against the contract minimum, with an alarm when below', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Hoje');
  // The demo has a 40% minimum and keeps about half of its receipts digital.
  const card = page.locator('div.rounded-2xl').filter({ has: page.getByRole('heading', { name: 'Pagamentos digitais (últimos 7 dias)' }) });
  await expect(card).toContainText('Mínimo do contrato de crédito: 40% · Dentro do mínimo do contrato.');
  await expect(card).toContainText(/Recebido pelo telemóvel: [\d.]+ Kz de [\d.]+ Kz/);

  // A stricter contract (90%): the alarm appears at the top of Today and in the activity log.
  await nav(page, 'Mais');
  await page.getByLabel('Mínimo de pagamentos digitais (%) — vazio = sem contrato').fill('90');
  await page
    .locator('div.rounded-2xl')
    .filter({ has: page.getByRole('heading', { name: 'Pagamentos digitais (crédito para stock)' }) })
    .getByRole('button', { name: 'Guardar' })
    .click();
  await nav(page, 'Hoje');
  const alarm = page.locator('div.rounded-2xl').filter({ has: page.getByRole('heading', { name: 'Alarme: pagamentos digitais' }) });
  await expect(alarm).toContainText(/Abaixo do mínimo do contrato: \d+% \(mínimo 90%\)\./);
  await expect(alarm).toContainText('cobrar em numerário para fugir à retenção é incumprimento');
  await nav(page, 'Mais');
  await page.getByRole('button', { name: 'Ver registo' }).click();
  await expect(page.getByText('Mínimo de pagamentos digitais (crédito para stock): 90%')).toBeVisible();
});

test('the shop accepts the terms before using its own data, and can read them any time offline', async ({ page }) => {
  await page.goto('./');
  const gate = page.getByRole('dialog', { name: 'Bem-vindo à Caixa' });
  await expect(gate).toContainText('Os dados ficam só no seu telemóvel.');
  await gate.getByRole('button', { name: 'Ler os Termos de uso' }).click();
  const doc = page.getByRole('dialog', { name: 'Termos de uso' });
  await expect(doc).toContainText('Não emite facturas nem documentos fiscais.');
  await doc.getByRole('button', { name: 'Fechar', exact: true }).click();
  await gate.getByRole('button', { name: 'Aceitar e começar' }).click();
  await expect(gate).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: '+ Criar o primeiro produto' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Bem-vindo à Caixa' })).toHaveCount(0);

  await nav(page, 'Mais');
  await expect(
    page.getByText(/A loja aceitou os Termos e a Política de privacidade em \d\d\/\d\d\/\d{4} \(versão \d{4}-\d\d-\d\d\)\./),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Condições do crédito para stock' }).click();
  await expect(page.getByRole('dialog', { name: 'Condições do crédito para stock' })).toContainText('Compromisso de pagamentos digitais');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Ver registo' }).click();
  await expect(page.getByText(/Termos de uso e privacidade aceites \(versão \d{4}-\d\d-\d\d\)/)).toBeVisible();
});

test('a product list comes from Excel: first what will change, then everything at once', async ({ page }) => {
  await openStore(page);
  await nav(page, 'Produtos');
  await page.getByRole('button', { name: 'Importar do Excel' }).click();
  const sheet = page.getByRole('dialog', { name: 'Importar do Excel' });
  const xlsx = await simpleXlsx([
    ['Produto', 'Categoria', 'Código de barras', 'Vende-se por', 'Preço (Kz)', 'Preço de custo (Kz)', 'Stock', 'Stock mínimo'],
    ['Bolacha Maria', 'Mercearia', '5601234567893', 'un', 500, 350, 24, 6],
    ['Feijão a granel', 'Granel', '', 'kg', 1400, 1100, 12.5, 2],
    ['Sumo 1 L', '', '', 'caixa', 1200, '', '', ''],
  ]);
  await sheet.locator('input[type=file]').setInputFiles({
    name: 'produtos.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(xlsx),
  });
  await expect(sheet).toContainText('2 produtos novos');
  await expect(sheet).toContainText('Linha 4: «Vende-se por» deve ser un ou kg (está «caixa»)');
  await sheet.getByRole('button', { name: 'Importar 2 produtos' }).click();
  await expect(page.getByText('Importação feita: 2 novos, 0 actualizados.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Bolacha Maria.*24 em stock/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Feijão a granel.*12,5 kg em stock/ })).toBeVisible();

  // A CSV saved by an old Excel (Windows encoding) changes a price; the stock stays as it is.
  await page.getByRole('button', { name: 'Importar do Excel' }).click();
  await sheet.locator('input[type=file]').setInputFiles({
    name: 'precos.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Produto;Preço (Kz);Stock\r\nBolacha Maria;600;99\r\n', 'latin1'),
  });
  await expect(sheet).toContainText('1 a actualizar');
  await expect(sheet).toContainText('preço 500 Kz → 600 Kz');
  await expect(sheet).toContainText('A importação não muda o stock');
  await sheet.getByRole('button', { name: 'Importar 1 produto' }).click();
  await expect(page.getByRole('button', { name: /Bolacha Maria.*600 Kz.*24 em stock/ })).toBeVisible();
});

test('categories: show one category when selling, pick one in the product form, sales by category', async ({ page }) => {
  await openDemo(page);
  const chips = page.getByRole('group', { name: 'Mostrar só uma categoria' });
  await chips.getByRole('button', { name: 'Bebidas' }).click();
  await expect(page.getByRole('button', { name: /Cerveja 330 ml/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Arroz 1 kg/ })).toHaveCount(0);
  // A search looks in every category.
  await page.getByLabel('Pesquisar produto ou código').fill('arroz 1');
  await expect(page.getByRole('button', { name: /Arroz 1 kg/ })).toBeVisible();
  await page.getByLabel('Pesquisar produto ou código').fill('');

  await nav(page, 'Produtos');
  await page.getByRole('button', { name: '+ Novo produto' }).first().click();
  const form = page.getByRole('dialog', { name: 'Novo produto' });
  await form.getByLabel('Nome').fill('Sumo de múcua 1 L');
  await form.getByLabel('Preço (Kz)').fill('1.500');
  await form.getByRole('button', { name: 'Bebidas' }).click();
  await expect(form.getByLabel('Categoria (opcional)')).toHaveValue('Bebidas');
  await form.getByRole('button', { name: 'Guardar' }).click();
  await chips.getByRole('button', { name: 'Bebidas' }).click();
  await expect(page.getByRole('button', { name: /Sumo de múcua 1 L.*Bebidas/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Arroz 1 kg/ })).toHaveCount(0);

  await nav(page, 'Hoje');
  await page.getByRole('button', { name: 'Semana, mês e ficha da loja' }).click();
  const report = page.getByRole('dialog', { name: 'Semana e mês' });
  await expect(report.getByRole('heading', { name: 'Vendas por categoria' })).toBeVisible();
  for (const c of ['Mercearia', 'Bebidas', 'Granel']) await expect(report.getByText(c, { exact: true })).toBeVisible();
});

test('stock count: count the shelves, stop and come back, see the differences in Kz, adjust at once', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Produtos');
  await page.getByRole('button', { name: 'Contar o stock' }).click();
  let sheet = page.getByRole('dialog', { name: 'Contagem de stock' });
  await sheet.getByRole('group', { name: 'Mostrar só uma categoria' }).getByRole('button', { name: 'Bebidas' }).click();
  await sheet.getByLabel('Quantidade contada de Cerveja 330 ml').fill('55');
  await sheet
    .getByRole('listitem')
    .filter({ hasText: 'Água 1,5 L' })
    .getByRole('button', { name: /^Igual à app/ })
    .click();
  await expect(sheet.getByText(/Contados: 2 de \d+ · 1 com diferença/)).toBeVisible();

  // The count stays on the phone if the sheet (or the app) is closed.
  await sheet.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar a contagem (2)' }).click();
  sheet = page.getByRole('dialog', { name: 'Contagem de stock' });
  await expect(sheet.getByLabel('Quantidade contada de Cerveja 330 ml')).toHaveValue('55');
  await sheet.getByRole('button', { name: 'Ver diferenças' }).click();

  const review = page.getByRole('dialog', { name: 'Diferenças da contagem' });
  await expect(review).toContainText('Contou 2 produtos: 1 tem diferença.');
  await expect(review).toContainText('Falta mercadoria no valor de 1.850 Kz (ao preço de custo).');
  await expect(review).toContainText('na app 60 · contado 55');
  await review.getByRole('button', { name: 'Acertar o stock' }).click();
  await expect(page.getByText('Stock acertado em 1 produto.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Cerveja 330 ml.*55 em stock/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Contar o stock' })).toBeVisible();
});

test('retirement (INSS): simulate, start, set money aside, record a payment and undo it', async ({ page }) => {
  await openStore(page);
  await nav(page, 'Hoje');
  await page.getByRole('button', { name: /A minha reforma \(INSS\)/ }).click();
  const sheet = page.getByRole('dialog', { name: 'A minha reforma (INSS)' });
  // A 45-year-old with one minimum wage: 8.000 Kz a month, about 42.900 Kz of pension at 60.
  await sheet.getByLabel('Ano em que nasceu').fill(String(Number(luandaToday().slice(0, 4)) - 45));
  await expect(sheet).toContainText('Paga 8.000 Kz por mês: cerca de 270 Kz por dia.');
  await expect(sheet).toContainText('aos 60 anos recebe cerca de 42.900 Kz por mês');
  await sheet.getByRole('button', { name: '2 salários mínimos' }).click();
  await expect(sheet).toContainText('Paga 16.000 Kz por mês');
  await sheet.getByRole('button', { name: '1 salário mínimo' }).click();
  await sheet.getByRole('button', { name: 'Começar a guardar para o INSS' }).click();
  await expect(page.getByText('Plano guardado. Boa decisão!')).toBeVisible();
  await expect(sheet).toContainText('Faltam 8.000 Kz. Guardando 270 Kz por dia chega lá.');

  // 5.000 Kz set aside from the till.
  await sheet.getByRole('button', { name: 'Guardar para o INSS' }).click();
  const save = page.getByRole('dialog', { name: 'Guardar para o INSS' });
  await save.getByLabel('Quanto vai guardar? (Kz)').fill('5.000');
  await save.getByRole('button', { name: 'Guardar para o INSS' }).click();
  await expect(sheet).toContainText('Faltam 3.000 Kz.');

  // The payment: what was set aside, and the rest straight from the till.
  await sheet.getByRole('button', { name: 'Registar pagamento' }).click();
  const pay = page.getByRole('dialog', { name: 'Pagamento ao INSS' });
  await pay.getByLabel('N.º do comprovativo (opcional)').fill('REF 4471');
  await expect(pay.getByLabel('Usei o que guardei (5.000 Kz)')).toBeChecked();
  await pay.getByLabel('3.000 Kz saíram da caixa agora').check();
  await pay.getByRole('button', { name: 'Guardar registo' }).click();
  await expect(page.getByText('Pagamento registado.')).toBeVisible();
  await expect(sheet).toContainText('1 mês pago');
  await expect(sheet).toContainText('comprovativo REF 4471');
  await expect(sheet).toContainText(/Contribuições em dia\. A seguir: /);
  await expect(sheet).toContainText('Faltam 8.000 Kz.');

  // Undoing the payment gives back what was set aside (and cancels the 3.000 Kz taken from the till).
  await sheet.getByRole('button', { name: /^Anular: / }).click();
  await sheet.getByRole('button', { name: 'Mês errado' }).click();
  await sheet.getByRole('button', { name: 'Confirmar anulação' }).click();
  await expect(page.getByText('Registo anulado.')).toBeVisible();
  await expect(sheet).toContainText('Faltam 3.000 Kz.');
  await sheet.getByRole('button', { name: 'Fechar', exact: true }).click();

  // On Hoje: the card, and the money set aside left the till without being an expense.
  await expect(page.getByRole('button', { name: /A minha reforma \(INSS\).*Guardado: 5\.000 Kz de 8\.000 Kz/ })).toBeVisible();
  await page.getByRole('button', { name: 'Registar saída' }).click();
  await expect(page.getByRole('dialog', { name: 'Saída de dinheiro' }).getByRole('button', { name: 'Guardar para o INSS' })).toBeVisible();
});

test('the demo shop follows its INSS: months in a row on Hoje and money set aside', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Hoje');
  const card = page.getByRole('button', { name: /A minha reforma \(INSS\)/ });
  await expect(card).toContainText(/1[34] meses seguidos/);
  await expect(card).toContainText(/Guardado: [\d.]+ Kz de 8\.000 Kz/);
  await card.click();
  const sheet = page.getByRole('dialog', { name: 'A minha reforma (INSS)' });
  await expect(sheet).toContainText(/1[34] meses pagos/);
  await expect(sheet).toContainText('aos 60 anos recebe cerca de');
  await sheet.getByText('Como me inscrevo no INSS').click();
  await expect(sheet).toContainText('Leve o bilhete de identidade e uma cópia.');
  await expect(sheet).toContainText('A Caixa não é o INSS e não recebe contribuições');
});

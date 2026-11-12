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
  await sheet.getByRole('group', { name: 'Estado' }).getByRole('button', { name: 'Anuladas' }).click();
  await expect(sheet.getByRole('listitem')).toHaveCount(1);
  await expect(sheet.getByRole('listitem').first()).toContainText('Anulada');
});

test('returning part of a cash sale: money from the till, goods back on the shelf, and the sale can no longer be voided', async ({
  page,
}) => {
  await openDemo(page);
  const stockOf = async () =>
    Number(
      (await page
        .getByRole('button', { name: /Arroz 1 kg/ })
        .first()
        .textContent())!.match(/(\d+) em stock/)![1],
    );
  const stockBefore = await stockOf();
  await page
    .getByRole('button', { name: /Arroz 1 kg/ })
    .first()
    .click();
  await page
    .getByRole('button', { name: /Arroz 1 kg/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Numerário' }).click();
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  await page.getByRole('button', { name: 'Nova venda' }).click();
  await expect.poll(stockOf).toBe(stockBefore - 2);

  await nav(page, 'Hoje');
  const cashCard = page
    .locator('div.rounded-2xl')
    .filter({ has: page.getByRole('heading', { name: 'Dinheiro que devia estar na caixa' }) });
  const expected = async () => Number((await cashCard.locator('.text-3xl').textContent())!.replace(/\D/g, ''));
  const cashBefore = await expected();
  await page
    .getByRole('list')
    .getByRole('button', { name: /Arroz 1 kg/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Devolver artigos' }).click();
  const sheet = page.getByRole('dialog', { name: /^Devolver — venda n\.º \d+$/ });
  await expect(sheet).toContainText('pode devolver 2');
  await sheet.getByRole('button', { name: '+ Arroz 1 kg' }).click();
  await sheet.getByRole('button', { name: 'Produto com defeito' }).click();
  await expect(sheet).toContainText(/A devolver ao cliente\s*1\.200 Kz/);
  await sheet.getByRole('button', { name: 'Confirmar devolução' }).click();
  await expect(page.getByText('Devolução registada: 1.200 Kz.')).toBeVisible();

  const detail = page.getByRole('dialog', { name: /^Venda n\.º \d+$/ });
  await expect(detail).toContainText('Devoluções desta venda');
  await expect(detail).toContainText(/Devolução n\.º 1 · .* · 1\.200 Kz · devolvido da caixa/);
  await expect(detail.getByRole('button', { name: 'Anular venda' })).toHaveCount(0);
  await expect(detail).toContainText('Esta venda tem devoluções, por isso não pode ser anulada.');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();

  await expect(page.getByText('1 devolução: −1.200 Kz')).toBeVisible();
  await expect(cashCard).toContainText('Devoluções pagas da caixa− 1.200 Kz');
  expect(await expected()).toBe(cashBefore - 1200);
  await nav(page, 'Vender');
  await expect.poll(stockOf).toBe(stockBefore - 1);
});

test('returning goods bought on credit lowers what the customer owes, and the statement says so', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Clientes');
  const joana = page.getByRole('button', { name: /Joana Mateus/ });
  const owed = async () => Number((await joana.textContent())!.match(/([\d.]+) Kz/)![1]!.replace(/\./g, ''));
  await nav(page, 'Vender');
  await page.getByRole('button', { name: /Óleo vegetal/ }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cliente (a crédito)' }).click();
  await page.getByRole('button', { name: 'Joana Mateus' }).click();
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  await page.getByRole('button', { name: 'Nova venda' }).click();
  await nav(page, 'Clientes');
  const before = await owed();

  await nav(page, 'Hoje');
  await page
    .getByRole('list')
    .getByRole('button', { name: /Óleo vegetal/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Devolver artigos' }).click();
  const sheet = page.getByRole('dialog', { name: /^Devolver — venda n\.º \d+$/ });
  await expect(sheet).toContainText('Venda a crédito: o valor abate na dívida do cliente');
  await sheet.getByRole('button', { name: '+ Óleo vegetal 1 L' }).click();
  await sheet.getByRole('button', { name: 'Cliente desistiu' }).click();
  await expect(sheet).toContainText(/Abate na dívida\s*1\.850 Kz/);
  await sheet.getByRole('button', { name: 'Confirmar devolução' }).click();
  await expect(page.getByText('Devolução registada: 1.850 Kz.')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();

  await nav(page, 'Clientes');
  expect(await owed()).toBe(before - 1850);
  await joana.click();
  await expect(page.getByRole('dialog', { name: 'Joana Mateus' })).toContainText('Devolução');
});

test('an electronic payment to confirm later stays on Hoje until «Já entrou», or is recorded again when the money never comes', async ({
  page,
}) => {
  await openDemo(page);
  await nav(page, 'Hoje');
  const card = page.locator('div.rounded-2xl').filter({ has: page.getByRole('heading', { name: /por confirmar$/ }) });
  // The demo shows one, so a visit can explain it.
  await expect(card.getByRole('heading')).toHaveText('1 pagamento por confirmar');

  // A sale by Multicaixa Express whose money has not arrived yet.
  await nav(page, 'Vender');
  await page.getByRole('button', { name: /Óleo vegetal/ }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Multicaixa Express' }).click();
  await page.getByRole('checkbox', { name: /O dinheiro ainda não entrou/ }).check();
  await expect(page.getByText('Pagamento simulado')).toHaveCount(0); // the payment provider is not asked
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  await expect(page.getByRole('dialog', { name: 'Venda registada' })).toContainText('Multicaixa Express (por confirmar)');
  await page.getByRole('button', { name: 'Nova venda' }).click();

  await nav(page, 'Hoje');
  await expect(card.getByRole('heading')).toHaveText('2 pagamentos por confirmar');
  await expect(page.getByText('por confirmar: 1.850 Kz', { exact: false }).first()).toBeVisible();
  // The demo's money arrived: «Já entrou» right on the card (the oldest is first).
  await card
    .getByRole('button', { name: /^Já entrou: venda n\.º \d+$/ })
    .first()
    .click();
  await expect(page.getByText('Pagamento confirmado.')).toBeVisible();
  await expect(card.getByRole('heading')).toHaveText('1 pagamento por confirmar');

  // Ours never came: the customer pays in cash instead.
  await card.getByRole('button', { name: /Multicaixa Express · 1\.850 Kz/ }).click();
  const detail = page.getByRole('dialog', { name: /^Venda n\.º \d+$/ });
  await expect(detail).toContainText('Pagamento por confirmar desde');
  await expect(detail.getByRole('button', { name: 'Devolver artigos' })).toHaveCount(0);
  await detail.getByRole('button', { name: 'Não entrou' }).click();
  const repay = page.getByRole('dialog', { name: 'O dinheiro não entrou: como paga o cliente?' });
  await expect(repay).toContainText('fica anulada e é registada de novo, com os mesmos artigos e preços');
  await repay.getByRole('button', { name: 'Numerário' }).click();
  await repay.getByRole('button', { name: 'Confirmar venda' }).click();
  await expect(page.getByText(/^Registada de novo como venda n\.º \d+\.$/)).toBeVisible();
  await expect(detail).toContainText(/O pagamento não entrou: registada de novo como venda n\.º \d+\./);
  await expect(detail).toContainText('Motivo: O pagamento não entrou');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(card).toHaveCount(0);

  // Nothing left to confirm, and the search says the same.
  await page.getByRole('button', { name: 'Procurar vendas' }).click();
  const search = page.getByRole('dialog', { name: 'Procurar vendas' });
  await search.getByRole('group', { name: 'Estado' }).getByRole('button', { name: 'Por confirmar' }).click();
  await expect(search).toContainText('Nenhuma venda com estes filtros.');
});

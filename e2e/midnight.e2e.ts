import { expect, test } from './fixtures';
import { luandaTime, nav, openDemo, sellInCash } from './helpers';

// Ten minutes after midnight: nothing was sold today yet. The rest of the suite runs in the afternoon.
test.beforeEach(async ({ context }) => {
  await context.clock.install({ time: luandaTime('00:10') });
});

test('just after midnight the day starts empty, and the first sale shows at once', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Hoje');
  const count = page.getByTestId('sales-count');
  await expect(count).toHaveText('0 vendas');
  await expect(page.getByText('Ainda não há vendas hoje.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Enviar resumo do dia' })).toHaveCount(0);
  // The rest of the screen is there: what customers owe, what the shop owes, low stock, the owner's INSS.
  await expect(page.getByRole('button', { name: /^Contas a receber\s*[\d.]+ Kz/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Contas a pagar\s*[\d.]+ Kz/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Produtos com stock baixo/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /A minha reforma \(INSS\)/ })).toBeVisible();

  await sellInCash(page, [/Arroz 1 kg/]);
  await page.getByRole('button', { name: 'Nova venda' }).click();
  await nav(page, 'Hoje');
  await expect(count).toHaveText('1 venda');
  await expect(page.getByRole('link', { name: 'Enviar resumo do dia' })).toBeVisible();

  // Yesterday, a full day, is one tap away.
  await page.getByRole('button', { name: 'Dia anterior' }).click();
  await expect(count).toHaveText(/^\d\d+ vendas$/);
});

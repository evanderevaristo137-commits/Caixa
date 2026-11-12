import { expect, test } from '@playwright/test';
import { luandaTime, nav, openDemo, sellInCash } from './helpers';

// Ten minutes after midnight: nothing was sold today yet. The rest of the suite runs in the afternoon.
test.beforeEach(async ({ context }) => {
  await context.clock.install({ time: luandaTime('00:10') });
});

test('just after midnight the day starts empty, and the first sale shows at once', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Hoje');
  const count = page.locator('.bg-brand-700 p.text-lg');
  await expect(count).toHaveText('0 vendas');
  await expect(page.getByText('Ainda não há vendas hoje.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Enviar resumo do dia' })).toHaveCount(0);
  // The rest of the screen is there: what customers owe, the owner's INSS, low stock.
  await expect(page.getByText('A receber de clientes')).toBeVisible();
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

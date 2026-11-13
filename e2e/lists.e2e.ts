import { expect, test } from './fixtures';
import { luandaTime, nav, openStore } from './helpers';

test.beforeEach(async ({ context }) => {
  await context.clock.install({ time: luandaTime('15:00') });
});

test('long lists are drawn in parts: 50 products, then «Ver mais»; a search starts again from the top', async ({ page }) => {
  await openStore(page);
  await nav(page, 'Produtos');
  await page.getByRole('button', { name: 'Importar do Excel' }).click();
  const sheet = page.getByRole('dialog', { name: 'Importar do Excel' });
  const rows = Array.from({ length: 55 }, (_, i) => `Produto ${String(i + 1).padStart(2, '0')};100;5`);
  await sheet.locator('input[type=file]').setInputFiles({
    name: 'produtos.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(['Produto;Preço (Kz);Stock', ...rows].join('\r\n'), 'utf8'),
  });
  await sheet.getByRole('button', { name: 'Importar 55 produtos' }).click();
  await expect(page.getByText('Importação feita: 55 novos, 0 actualizados.')).toBeVisible();

  const products = page.getByRole('button', { name: /^Produto \d\d / });
  await expect(products).toHaveCount(50);
  await page.getByRole('button', { name: 'Ver mais 5' }).click();
  await expect(products).toHaveCount(55);
  await expect(page.getByRole('button', { name: /^Ver mais/ })).toHaveCount(0);

  // A search shows what it finds, and clearing it starts again from the first 50.
  await page.getByRole('searchbox', { name: 'Pesquisar' }).fill('Produto 5');
  await expect(products).toHaveCount(6); // Produto 50 to Produto 55
  await page.getByRole('searchbox', { name: 'Pesquisar' }).fill('');
  await expect(products).toHaveCount(50);

  // Vender draws 60 at a time: all 55 here.
  await nav(page, 'Vender');
  await expect(page.getByRole('button', { name: /^Produto \d\d/ })).toHaveCount(55);
});

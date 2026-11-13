import { expect, test } from '@playwright/test';
import { luandaTime, nav, openDemo } from './helpers';

test.beforeEach(async ({ context }) => {
  await context.clock.install({ time: luandaTime('15:00') });
});

test('the demo shows a shop like the one being visited: car parts, phones, or the grocery', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Mais');
  const kinds = page.getByRole('group', { name: 'Loja de exemplo' });
  await expect(kinds.getByRole('button', { name: /Mercearia/ })).toHaveAttribute('aria-pressed', 'true');

  // Car parts: its products, in its categories and subcategories.
  await kinds.getByRole('button', { name: /Peças auto/ }).click();
  await expect(page.getByText('Demonstração: Peças auto')).toBeVisible();
  await expect(kinds.getByRole('button', { name: /Peças auto/ })).toHaveAttribute('aria-pressed', 'true');
  await nav(page, 'Vender');
  await expect(page.getByRole('button', { name: /Óleo de motor 15W-40/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Arroz 1 kg/ })).toHaveCount(0);
  await page.getByRole('group', { name: 'Mostrar só uma categoria' }).getByRole('button', { name: 'Peças e acessórios auto' }).click();
  await page.getByRole('group', { name: 'Mostrar só uma subcategoria' }).getByRole('button', { name: 'Travões' }).click();
  await expect(page.getByRole('button', { name: /Pastilhas de travão \(dianteiras\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Filtro de óleo/ })).toHaveCount(0);
  // Its customers owe, as in the grocery.
  await nav(page, 'Clientes');
  await expect(page.getByText('Mário Kiluanje')).toBeVisible();

  // Phones and accessories.
  await nav(page, 'Mais');
  await kinds.getByRole('button', { name: /Telemóveis/ }).click();
  await expect(page.getByText('Demonstração: Telemóveis')).toBeVisible();
  await nav(page, 'Vender');
  await expect(page.getByRole('button', { name: /Película de vidro/ }).first()).toBeVisible();

  // And back to the grocery.
  await nav(page, 'Mais');
  await kinds.getByRole('button', { name: /Mercearia/ }).click();
  await nav(page, 'Vender');
  await expect(page.getByRole('button', { name: /Arroz 1 kg/ }).first()).toBeVisible();
});

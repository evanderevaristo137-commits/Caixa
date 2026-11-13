import { expect, test } from '@playwright/test';
import { luandaTime, openMore } from './helpers';

test.beforeEach(async ({ context }) => {
  await context.clock.install({ time: luandaTime('15:00') });
});

test('the kind of shop: asked once after the terms, its categories come first, changed in «Mais»', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Aceitar e começar' }).click();
  const ask = page.getByRole('dialog', { name: 'Que tipo de loja tem?' });
  await expect(ask.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  await ask.getByRole('button', { name: /Peças auto e motorizadas/ }).click();
  await ask.getByRole('button', { name: 'Continuar' }).click();
  await expect(ask).toHaveCount(0);
  // Asked once.
  await page.reload();
  await expect(page.getByRole('button', { name: '+ Criar o primeiro produto' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Que tipo de loja tem?' })).toHaveCount(0);

  // Its categories come first when choosing one; the others on request.
  await page.getByRole('button', { name: '+ Criar o primeiro produto' }).click();
  const form = page.getByRole('dialog', { name: 'Novo produto' });
  await form.getByRole('button', { name: 'Escolher categoria' }).click();
  const picker = page.getByRole('dialog', { name: 'Escolher categoria' });
  await expect(picker.getByRole('heading', { name: 'Para a sua loja' })).toBeVisible();
  await expect(picker.getByRole('button', { name: /Peças e acessórios auto/ })).toBeVisible();
  await expect(picker.getByRole('button', { name: /Alimentação e mercearia/ })).toHaveCount(0);
  await picker.getByRole('button', { name: 'Ver todas as categorias' }).click();
  await expect(picker.getByRole('heading', { name: 'Outras categorias' })).toBeVisible();
  await expect(picker.getByRole('button', { name: /Alimentação e mercearia/ })).toBeVisible();
  await picker.getByRole('button', { name: /Peças e acessórios auto/ }).click();
  await picker.getByRole('button', { name: 'Travões' }).click();
  await expect(form.getByRole('button', { name: /Peças e acessórios auto › Travões/ })).toBeVisible();
  await form.getByRole('button', { name: 'Fechar', exact: true }).click();

  // «Mais → A loja» shows it, and changes it.
  await openMore(page, 'A loja');
  const card = page.getByRole('group', { name: 'Tipo de loja' });
  await expect(card.getByRole('button', { name: /Peças auto e motorizadas/ })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('button', { name: /Telemóveis e electrónica/ }).click();
  // The card's own «Guardar» (the one right after the choices).
  await card.locator('xpath=following-sibling::button[1]').click();
  await expect(page.getByText('Guardado.')).toBeVisible();
  await expect(card.getByRole('button', { name: /Telemóveis e electrónica/ })).toHaveAttribute('aria-pressed', 'true');
});

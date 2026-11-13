import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import axe from 'axe-core';
import { luandaTime, nav, openDemo, openMore, openReport } from './helpers';

test.beforeEach(async ({ context }) => {
  await context.clock.install({ time: luandaTime('15:00') });
});

/** Is the keyboard (and screen reader) focus inside this window? */
const hasFocus = (window: Locator) => window.evaluate((el) => el.contains(document.activeElement));

/** Tab and Shift+Tab, many times: the focus never leaves the window. */
async function tabAround(page: Page, window: Locator) {
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press(key);
      expect(await hasFocus(window)).toBe(true);
    }
  }
}

test('a window takes the focus when it opens, keeps it, and gives it back when it closes', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Hoje');
  const opener = page.getByRole('button', { name: 'Registar saída' });
  await opener.click();
  const sheet = page.getByRole('dialog', { name: 'Saída de dinheiro' });
  await expect(sheet).toBeVisible();
  // The focus went into the window: a screen reader reads its title first.
  await expect.poll(() => hasFocus(sheet)).toBe(true);
  await tabAround(page, sheet);
  // Escape closes it (like Android's back button), and the focus is back where it was.
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('a question over a window: the safe choice has the focus, and each Escape goes back one step', async ({ page }) => {
  await openDemo(page);
  await nav(page, 'Produtos');
  const item = page.getByRole('button', { name: /Gasosa 330 ml/ });
  await item.click();
  const product = page.getByRole('dialog', { name: 'Editar produto' });
  await expect.poll(() => hasFocus(product)).toBe(true);

  const archive = product.getByRole('button', { name: 'Arquivar produto' });
  await archive.click();
  const ask = page.getByRole('alertdialog', { name: 'Arquivar este produto?' });
  const cancel = ask.getByRole('button', { name: 'Cancelar' });
  const yes = ask.getByRole('button', { name: 'Arquivar', exact: true });
  await expect(cancel).toBeFocused();
  // Only the question's two buttons, round and round: never the product behind it.
  await page.keyboard.press('Tab');
  await expect(yes).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(yes).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(ask).toHaveCount(0);
  await expect(product).toBeVisible();
  await expect(archive).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(product).toHaveCount(0);
  await expect(item).toBeFocused();
  // Nothing was archived.
  await expect(item).toBeVisible();
});

test('the first screen (the Terms) has the focus, so a screen reader starts there', async ({ page }) => {
  await page.goto('./');
  const gate = page.getByRole('dialog', { name: 'Bem-vindo à Caixa' });
  await expect(gate).toBeVisible();
  await expect.poll(() => hasFocus(gate)).toBe(true);
  await tabAround(page, gate);
});

/** The bar of the Phase 4 review: WCAG 2.1 levels A and AA, and axe's good practices. */
const RULES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

/** axe-core looks at the screen as it is now: no problems allowed. */
async function noProblems(page: Page, where: string) {
  const found = await page.evaluate(async (tags) => {
    const { axe } = window as unknown as { axe: typeof import('axe-core') };
    const result = await axe.run(document, { runOnly: { type: 'tag', values: tags } });
    return result.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  }, RULES);
  expect(found, where).toEqual([]);
}

/** Closes every open window, one Escape at a time (like Android's back button). */
async function closeAll(page: Page) {
  for (let i = 0; i < 5 && (await page.getByRole('dialog').count()) > 0; i++) await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('automatic accessibility check (axe-core) of the newer screens', () => {
  test.beforeEach(async ({ page }) => {
    // Loaded by the test browser only: axe is never part of the app.
    await page.addInitScript({ content: axe.source });
    await page.addInitScript(() => {
      window.print = () => undefined;
    });
  });

  test('demo: a category when selling, choosing a category, suggestions, a report, «Mais»', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('group', { name: 'Mostrar só uma categoria' }).getByRole('button', { name: 'Bebidas' }).click();
    await expect(page.getByRole('group', { name: 'Mostrar só uma subcategoria' })).toBeVisible();
    await noProblems(page, 'Vender, só Bebidas');

    await nav(page, 'Produtos');
    await page.getByRole('button', { name: '+ Novo produto' }).first().click();
    await page.getByRole('dialog', { name: 'Novo produto' }).getByRole('button', { name: 'Escolher categoria' }).click();
    const picker = page.getByRole('dialog', { name: 'Escolher categoria' });
    await expect(picker.getByRole('heading', { name: 'Da sua loja' })).toBeVisible();
    await noProblems(page, 'Escolher categoria');
    await picker
      .getByRole('button', { name: /Bebidas/ })
      .first()
      .click();
    await expect(picker.getByRole('heading', { name: 'Subcategoria de Bebidas' })).toBeVisible();
    await noProblems(page, 'Escolher subcategoria');
    await closeAll(page);

    await nav(page, 'Hoje');
    await expect(page.getByRole('heading', { name: 'Sugestões para a loja' })).toBeVisible();
    await noProblems(page, 'Hoje, com as sugestões');
    await openReport(page, 'Contas da loja');
    await page.getByRole('button', { name: 'Guardar ou enviar (PDF ou Excel)' }).click();
    await expect(page.getByRole('dialog', { name: 'Relatório para guardar ou enviar' })).toBeVisible();
    await noProblems(page, 'Relatório para guardar ou enviar');
    await closeAll(page);

    for (const section of ['A loja', 'Dinheiro e clientes', 'Segurança e cópias', 'Piloto e ajuda'] as const) await openMore(page, section);
    await noProblems(page, 'Mais, com tudo aberto');
    // A window with text only (no buttons inside): the text takes the keyboard focus, to scroll it.
    await page.getByRole('button', { name: 'Termos de uso', exact: true }).click();
    const terms = page.getByRole('dialog', { name: 'Termos de uso' });
    await expect(terms.getByRole('region', { name: 'Termos de uso' })).toHaveAttribute('tabindex', '0');
    await noProblems(page, 'Termos de uso');
  });

  test('real shop: the Terms, the kind of shop, employees and «Quem está a usar a app?»', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('dialog', { name: 'Bem-vindo à Caixa' })).toBeVisible();
    await noProblems(page, 'Termos');
    await page.getByRole('button', { name: 'Aceitar e começar' }).click();
    const kind = page.getByRole('dialog', { name: 'Que tipo de loja tem?' });
    await expect(kind).toBeVisible();
    await noProblems(page, 'Que tipo de loja tem?');
    await kind.getByRole('button', { name: 'Saltar' }).click();
    await expect(kind).toHaveCount(0);

    await openMore(page, 'Segurança e cópias');
    await page.getByRole('button', { name: 'Definir código' }).click();
    await page.getByLabel('Novo código (4 a 6 números)').fill('2580');
    await page.getByLabel('Repita o novo código').fill('2580');
    await page.getByRole('button', { name: 'Guardar' }).last().click();
    await expect(page.getByText('Código guardado.')).toBeVisible();
    await page.getByRole('button', { name: '+ Juntar funcionário' }).click();
    const form = page.getByRole('dialog', { name: 'Novo funcionário' });
    await noProblems(page, 'Novo funcionário');
    await form.getByLabel('Nome').fill('Maria Exemplo');
    await form.getByLabel('Código (4 a 6 números)').fill('1111');
    await form.getByLabel('Repita o código').fill('1111');
    await form.getByRole('button', { name: 'Guardar' }).click();
    const ownerCode = page.getByRole('dialog', { name: 'Código do dono' });
    await ownerCode.getByLabel('Código').fill('2580');
    await ownerCode.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('Funcionário guardado.')).toBeVisible();
    await noProblems(page, 'Mais, com um funcionário');

    await page.getByRole('banner').getByRole('button', { name: 'Trocar' }).click();
    const chooser = page.getByRole('dialog', { name: 'Quem está a usar a app?' });
    await noProblems(page, 'Quem está a usar a app?');
    await chooser.getByRole('button', { name: /^Maria Exemplo/ }).click();
    await expect(page.getByRole('dialog', { name: 'Código de Maria Exemplo' })).toBeVisible();
    await noProblems(page, 'Código de Maria Exemplo');
  });
});

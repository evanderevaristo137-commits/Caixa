import { expect, test } from '@playwright/test';
import { luandaTime, nav, openDemo, openReport, openStore } from './helpers';

test('the published app refuses to send data anywhere, and nothing it does breaks that rule', async ({ page }) => {
  await page.clock.install({ time: luandaTime('15:00') });
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
  });
  await openDemo(page);
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /connect-src 'self'/);
  // A request to another site is refused by the browser itself.
  const outcome = await page.evaluate(() =>
    fetch('https://example.com/recolha', { method: 'POST', body: 'dados' }).then(
      () => 'sent',
      () => 'refused',
    ),
  );
  expect(outcome).toBe('refused');
  // Going through the screens (charts, labels, the scanner button, reports) never trips the rule.
  for (const tab of ['Hoje', 'Clientes', 'Produtos', 'Mais', 'Vender'] as const) await nav(page, tab);
  await nav(page, 'Hoje');
  await openReport(page, 'Semana, mês e ficha da loja');
  await expect(page.getByRole('dialog', { name: 'Semana e mês' }).getByRole('group', { name: 'Vendas por dia' })).toBeVisible();
  expect(violations.filter((v) => !v.includes('example.com'))).toEqual([]);
});

test('a phone clock that went back is reported, and selling still works', async ({ page }) => {
  // The shop recorded things today at 15:00…
  await page.clock.install({ time: luandaTime('15:00') });
  await openStore(page);
  await page.getByRole('button', { name: '+ Criar o primeiro produto' }).click();
  await page.getByLabel('Nome').fill('Produto de teste');
  await page.getByLabel('Preço (Kz)').fill('1.000');
  await page.getByRole('button', { name: 'Guardar' }).click();
  // Saved before the reload below (a reload in the middle of saving loses the product, all or nothing).
  await expect(page.getByRole('button', { name: /Produto de teste/ })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'A data do telemóvel parece errada' })).toHaveCount(0);

  // …then the phone's clock goes back two days (set by hand, or lost with the battery).
  await page.clock.setSystemTime(new Date(luandaTime('15:00').getTime() - 2 * 24 * 3600_000));
  await page.reload();
  const warning = page.getByRole('alert').filter({ hasText: 'A data do telemóvel parece errada' });
  await expect(warning).toContainText(/diz \d\d\/\d\d\/\d{4} \d\d:\d\d, mas a última coisa registada na loja é de \d\d\/\d\d\/\d{4} 15:00/);
  // Selling is never blocked.
  await page.getByRole('button', { name: /Produto de teste/ }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Numerário' }).click();
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  await expect(page.getByText('Venda registada')).toBeVisible();
});

test('app errors are kept on the phone and only their number goes into the pilot summary', async ({ page }) => {
  await page.clock.install({ time: luandaTime('15:00') });
  await openDemo(page);
  // An action that failed and nobody handled (a bug), as it would happen in the shop.
  await page.evaluate(() => {
    void Promise.reject(new Error('Erro de teste'));
  });
  await expect(page.getByText('Algo correu mal', { exact: false })).toBeVisible();
  await nav(page, 'Mais');
  await expect(page.getByText('A app registou 1 erro nos últimos 7 dias.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver os erros' }).click();
  await expect(page.getByText(/Acção · Error: Erro de teste/)).toBeVisible();
  // The pilot summary is prepared when its card comes on the screen.
  await page.getByRole('heading', { name: 'Piloto' }).scrollIntoViewIfNeeded();
  const link = page.getByRole('link', { name: 'Enviar resumo do piloto por WhatsApp' });
  const text = decodeURIComponent((await link.getAttribute('href'))!.split('text=')[1]!);
  expect(text).toContain('Erros da app (7 dias): 1');
  expect(text).not.toContain('Erro de teste');
});

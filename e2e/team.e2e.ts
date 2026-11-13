import { expect, test } from '@playwright/test';
import { luandaTime, nav, openMore, openStore } from './helpers';

test.beforeEach(async ({ context }) => {
  await context.clock.install({ time: luandaTime('15:00') });
});

test('employees: the owner adds a seller, she sells with her own code, and the app says who sold', async ({ page }) => {
  await openStore(page);
  // A product (the first one goes straight into the cart).
  await page.getByRole('button', { name: '+ Criar o primeiro produto' }).click();
  await page.getByLabel('Nome').fill('Arroz 1 kg');
  await page.getByLabel('Preço (Kz)').fill('1.000');
  await page.getByLabel('Stock inicial').fill('10');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('button', { name: /Arroz 1 kg/ }).first()).toBeVisible();

  // Employees need the owner code first.
  await openMore(page, 'Segurança e cópias');
  await expect(page.getByText('Para ter funcionários, defina primeiro o código do dono')).toBeVisible();
  await page.getByRole('button', { name: 'Definir código' }).click();
  await page.getByLabel('Novo código (4 a 6 números)').fill('2580');
  await page.getByLabel('Repita o novo código').fill('2580');
  await page.getByRole('button', { name: 'Guardar' }).last().click();
  await expect(page.getByText('Código guardado.')).toBeVisible();

  await page.getByRole('button', { name: '+ Juntar funcionário' }).click();
  const form = page.getByRole('dialog', { name: 'Novo funcionário' });
  await form.getByLabel('Nome').fill('Maria Exemplo');
  await form.getByLabel('Código (4 a 6 números)').fill('1111');
  await form.getByLabel('Repita o código').fill('1111');
  await form.getByRole('button', { name: 'Guardar' }).click();
  // Managing employees is the owner's: the owner code is asked.
  const ownerCode = page.getByRole('dialog', { name: 'Código do dono' });
  await ownerCode.getByLabel('Código').fill('2580');
  await ownerCode.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Funcionário guardado.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Maria Exemplo\s*Vendedor/ })).toBeVisible();
  // The owner, who added her, keeps using the app: the bar says who.
  await expect(page.getByRole('banner')).toContainText('A usar a app: Dono');

  // Maria takes over with her own code.
  await page.getByRole('banner').getByRole('button', { name: 'Trocar' }).click();
  const chooser = page.getByRole('dialog', { name: 'Quem está a usar a app?' });
  await chooser.getByRole('button', { name: /^Maria Exemplo/ }).click();
  const who = page.getByRole('dialog', { name: 'Código de Maria Exemplo' });
  await who.getByLabel('Código').fill('9999');
  await who.getByRole('button', { name: 'Entrar' }).click();
  await expect(who).toContainText('Código errado.');
  await who.getByLabel('Código').fill('1111');
  await who.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('banner')).toContainText('A usar a app: Maria Exemplo');

  // She sells in cash.
  await nav(page, 'Vender');
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Numerário' }).click();
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  await expect(page.getByText('Venda registada')).toBeVisible();
  await page.getByRole('button', { name: 'Nova venda' }).click();

  // On credit she needs the owner (the owner code, typed on the spot).
  await page
    .getByRole('button', { name: /Arroz 1 kg/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cliente (a crédito)' }).click();
  await page.getByRole('button', { name: '+ Novo cliente' }).click();
  await page.getByLabel('Nome').fill('Cliente Exemplo');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  await expect(page.getByRole('dialog', { name: 'Código do dono' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Código do dono' }).getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByText('Venda registada')).toHaveCount(0);

  // «Hoje»: no profit nor reports for a seller; the day's detail says who sold.
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await nav(page, 'Hoje');
  await expect(page.getByRole('button', { name: /^Lucro bruto estimado/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Relatórios', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Vendas de hoje/ }).click();
  await expect(page.getByRole('dialog', { name: 'Vendas e dinheiro do dia' })).toContainText(
    /Vendas por pessoa\s*Maria Exemplo · 1 venda\s*1\.000 Kz/,
  );
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();

  // Products: read only. Mais: the owner's.
  await nav(page, 'Produtos');
  await expect(page.getByText('Para mudar produtos, preços ou stock, peça ao dono ou a um gerente.')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Novo produto' })).toHaveCount(0);
  await nav(page, 'Mais');
  await expect(page.getByText('As definições da loja são só para o dono.', { exact: false })).toBeVisible();

  // Closing and opening the app does not ask again: still Maria.
  await page.reload();
  await expect(page.getByRole('banner')).toContainText('A usar a app: Maria Exemplo');

  // Back to the owner: the activity log says who did what.
  await page.getByRole('banner').getByRole('button', { name: 'Trocar' }).click();
  await chooser.getByRole('button', { name: /^Dono/ }).click();
  await page.getByRole('dialog', { name: 'Código de Dono' }).getByLabel('Código').fill('2580');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('banner')).toContainText('A usar a app: Dono');
  await openMore(page, 'Segurança e cópias');
  await page.getByRole('button', { name: 'Ver registo' }).click();
  await page.getByRole('button', { name: 'Mostrar tudo' }).click();
  await expect(page.getByText(/· por Maria Exemplo/).first()).toBeVisible();
  await expect(page.getByText('Funcionário juntado: Maria Exemplo (Vendedor)')).toBeVisible();
});

import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { luandaTime, nav, openMore, openStore } from './helpers';

test.beforeEach(async ({ context }) => {
  await context.clock.install({ time: luandaTime('15:00') });
});

/** A real shop with its first product, sold once. */
async function shopWithOneSale(page: Page) {
  await openStore(page);
  await page.getByRole('button', { name: '+ Criar o primeiro produto' }).click();
  await page.getByLabel('Nome').fill('Arroz de teste');
  await page.getByLabel('Preço (Kz)').fill('1.000');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await chargeInCash(page);
}

async function chargeInCash(page: Page) {
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Numerário' }).click();
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  await page.getByRole('button', { name: 'Nova venda' }).click();
}

async function sellOne(page: Page) {
  await nav(page, 'Vender');
  await page.getByRole('button', { name: /Arroz de teste/ }).click();
  await chargeInCash(page);
}

async function salesToday(page: Page) {
  await nav(page, 'Hoje');
  return page.getByTestId('sales-count').textContent();
}

/** Taps the backup button and returns the file the phone saved. */
async function backupFile(page: Page, button: ReturnType<Page['getByRole']>) {
  const download = page.waitForEvent('download');
  await button.click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^caixa-copia-de-seguranca-\d{4}-\d{2}-\d{2}\.txt$/);
  return (await readFile((await file.path())!)).toString('utf8');
}

const chooseFile = (page: Page, text: string, name = 'caixa-copia-de-seguranca.txt') =>
  page.locator('input[type="file"][accept*=".txt"]').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });

test('a backup is compressed; restoring it shows what would be lost first, and can be undone', async ({ page }) => {
  await shopWithOneSale(page);
  await openMore(page, 'Segurança e cópias');
  const text = await backupFile(page, page.getByRole('button', { name: 'Enviar cópia de segurança' }));
  await expect(page.getByText('Cópia guardada na pasta Transferências.')).toBeVisible();
  const file = JSON.parse(text) as { format: number; compression: string; lock?: unknown; payload: string };
  expect(file).toMatchObject({ format: 2, compression: 'gzip' });
  expect(file.lock).toBeUndefined();
  expect(text).not.toContain('Arroz de teste'); // compressed: nothing readable

  // A file that is not a copy is refused, and nothing changes.
  await chooseFile(page, 'Data;Venda n.º;Produto\r\n12/11/2026;1;Arroz', 'vendas.csv');
  await expect(page.getByText('Este ficheiro não é uma cópia de segurança da Caixa.')).toBeVisible();

  // One more sale after the copy: restoring the copy would lose it, and the app says so.
  await sellOne(page);
  expect(await salesToday(page)).toBe('2 vendas');
  await openMore(page, 'Segurança e cópias');
  await chooseFile(page, text);
  const review = page.getByRole('dialog', { name: 'Recuperar uma cópia' });
  await expect(review).toContainText(/Na cópia.*1 venda, a última a/);
  await expect(review).toContainText(/Neste telemóvel agora.*2 vendas, a última a/);
  await expect(review.getByRole('alert')).toContainText(
    /Atenção: este telemóvel tem 1 venda e \d+ outros? registos? que a cópia não tem .* Se recuperar, perdem-se\./,
  );
  await review.getByRole('button', { name: 'Recuperar esta cópia' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Cópia recuperada.' })).toBeVisible();
  await page.getByRole('button', { name: 'Concluir' }).click();
  expect(await salesToday(page)).toBe('1 venda');

  // Undo: the sale made after the copy comes back.
  await openMore(page, 'Segurança e cópias');
  await expect(page.getByText(/Antes da última recuperação \(.+\) ficou guardado o que estava no telemóvel: 2 vendas\./)).toBeVisible();
  await page.getByRole('button', { name: 'Voltar a esses dados' }).click();
  const undo = page.getByRole('dialog', { name: 'Desfazer a última recuperação' });
  await expect(undo).toContainText(/Na cópia.*2 vendas/);
  await undo.getByRole('button', { name: 'Voltar a esses dados' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Recuperação desfeita.' })).toBeVisible();
  await page.getByRole('button', { name: 'Concluir' }).click();
  expect(await salesToday(page)).toBe('2 vendas');

  // Both are in the activity log.
  await openMore(page, 'Segurança e cópias');
  await page.getByRole('button', { name: 'Ver registo' }).click();
  await expect(page.getByText(/^Cópia de segurança de .+ recuperada \(todos os dados substituídos\)$/)).toBeVisible();
  await expect(page.getByText('Recuperação desfeita: voltaram os dados que estavam no telemóvel antes dela')).toBeVisible();
});

test('a backup protected with a password opens only with it', async ({ page }) => {
  await shopWithOneSale(page);
  await openMore(page, 'Segurança e cópias');
  await expect(page.getByText('As cópias não têm palavra-passe: quem receber o ficheiro pode ver os dados da loja.')).toBeVisible();
  await page.getByRole('button', { name: 'Proteger as cópias com palavra-passe' }).click();
  const sheet = page.getByRole('dialog', { name: 'Palavra-passe das cópias' });
  await expect(sheet).toContainText('Se esquecer a palavra-passe, as cópias não se abrem.');
  await sheet.getByLabel('Palavra-passe', { exact: true }).fill('curta');
  await sheet.getByLabel('Repetir a palavra-passe').fill('curta');
  await sheet.getByRole('button', { name: 'Guardar a palavra-passe' }).click();
  await expect(sheet.getByText('Use pelo menos 8 letras ou números.')).toBeVisible();
  await sheet.getByLabel('Palavra-passe', { exact: true }).fill('mercearia do bairro');
  await sheet.getByLabel('Repetir a palavra-passe').fill('mercearia do bairo');
  await sheet.getByRole('button', { name: 'Guardar a palavra-passe' }).click();
  await expect(sheet.getByText('As duas palavras-passe não são iguais.')).toBeVisible();
  await sheet.getByLabel('Repetir a palavra-passe').fill('mercearia do bairro');
  await sheet.getByRole('button', { name: 'Guardar a palavra-passe' }).click();
  await expect(page.getByText('As cópias estão protegidas com palavra-passe.')).toBeVisible();

  const text = await backupFile(page, page.getByRole('button', { name: 'Enviar cópia de segurança' }));
  await expect(page.getByText('Cópia guardada na pasta Transferências, protegida com palavra-passe.')).toBeVisible();
  expect(JSON.parse(text)).toMatchObject({ format: 2, lock: { cipher: 'AES-GCM', kdf: 'PBKDF2-SHA256' } });

  await chooseFile(page, text);
  const restore = page.getByRole('dialog', { name: 'Recuperar uma cópia' });
  await expect(restore).toContainText(/Cópia de \d\d\/\d\d\/\d{4} \d\d:\d\d, protegida com palavra-passe\./);
  await restore.getByLabel('Palavra-passe da cópia').fill('outra coisa qualquer');
  await restore.getByRole('button', { name: 'Abrir a cópia' }).click();
  await expect(restore.getByText('Palavra-passe errada (ou a cópia está danificada).')).toBeVisible();
  await restore.getByLabel('Palavra-passe da cópia').fill('mercearia do bairro');
  await restore.getByRole('button', { name: 'Abrir a cópia' }).click();
  await expect(restore.getByText('Tudo o que está neste telemóvel também está na cópia.')).toBeVisible();
  await restore.getByRole('button', { name: 'Cancelar' }).click();
  await expect(restore).toBeHidden();
});

test('closing the day in the real shop offers the backup of the day', async ({ page }) => {
  await shopWithOneSale(page);
  await nav(page, 'Hoje');
  const closeDay = async () => {
    await page.getByRole('button', { name: 'Fechar o dia' }).click();
    const sheet = page.getByRole('dialog', { name: 'Fechar o dia' });
    await sheet.getByLabel('Quanto dinheiro contou na caixa?').fill('1.000');
    await sheet.getByRole('button', { name: 'Confirmar fecho' }).click();
    return sheet;
  };
  const sheet = await closeDay();
  await expect(sheet.getByRole('status')).toHaveText('Dia fechado.');
  await expect(sheet).toContainText('Envie agora a cópia de segurança do dia');
  await backupFile(page, sheet.getByRole('button', { name: 'Enviar cópia de segurança' }));
  await expect(page.getByText('Cópia guardada na pasta Transferências.')).toBeVisible();
  await expect(sheet).toBeHidden();

  // With today's copy made, closing again does not ask a second time.
  await closeDay();
  await expect(page.getByRole('dialog', { name: 'Fechar o dia' })).toBeHidden();
  await expect(page.getByText('Envie agora a cópia de segurança do dia')).toBeHidden();
});

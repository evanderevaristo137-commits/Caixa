import { expect, test, type Page } from '@playwright/test';
import { luandaTime, nav, openDemo } from './helpers';

test.beforeEach(async ({ context }) => {
  await context.clock.install({ time: luandaTime('15:00') });
});

const CART_KEY = 'caixa.cart.demo';
const savedCart = (page: Page) => page.evaluate((key) => localStorage.getItem(key), CART_KEY);

async function salesToday(page: Page): Promise<number> {
  await nav(page, 'Hoje');
  const text = await page.getByTestId('sales-count').textContent();
  await nav(page, 'Vender');
  return Number(text!.match(/\d+/)![0]);
}

async function chargeInCash(page: Page) {
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Numerário' }).click();
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
}

test('if Android closes the app right after a sale, the cart that comes back is not charged again', async ({ page }) => {
  await openDemo(page);
  const before = await salesToday(page);
  const cart = page.getByRole('button', { name: /^Carrinho:/ });
  await page.getByRole('button', { name: /Arroz 1 kg/ }).click();
  await page.getByRole('button', { name: /Óleo vegetal/ }).click();
  await expect.poll(() => savedCart(page)).toContain('"lines"');
  const remembered = await savedCart(page);

  await chargeInCash(page);
  await expect(page.getByText('Venda registada')).toBeVisible();
  // The phone forgets the cart as soon as the sale is saved, before "Nova venda" is even tapped.
  await expect.poll(() => savedCart(page)).toBeNull();

  // Worst case: Android closed the app in the instant between saving the sale and forgetting the cart.
  await page.evaluate(([key, value]) => localStorage.setItem(key!, value!), [CART_KEY, remembered]);
  await page.reload();
  const notice = page.getByRole('alert');
  await expect(notice).toContainText(/A venda n\.º \d+ \(3\.050 Kz\) já estava registada\. O carrinho foi limpo/);
  await expect(cart).toHaveAccessibleName('Carrinho: O carrinho está vazio.');
  await expect.poll(() => savedCart(page)).toBeNull();
  await notice.getByRole('button', { name: 'Entendi' }).click();
  await expect(notice).toBeHidden();
  expect(await salesToday(page)).toBe(before + 1);

  // The next customer buys exactly the same: that is a new sale.
  await page.getByRole('button', { name: /Arroz 1 kg/ }).click();
  await page.getByRole('button', { name: /Óleo vegetal/ }).click();
  await chargeInCash(page);
  await expect(page.getByText('Venda registada')).toBeVisible();
  await page.getByRole('button', { name: 'Nova venda' }).click();
  expect(await salesToday(page)).toBe(before + 2);
});

test('the same cart open in two windows is recorded once', async ({ page, context }) => {
  await openDemo(page);
  const before = await salesToday(page);
  await page.getByRole('button', { name: /Pão/ }).click();
  await expect.poll(() => savedCart(page)).toContain('"lines"');

  // A second window opens with the same cart (the browser and the installed app, for example).
  const other = await context.newPage();
  await other.goto('./');
  await expect(other.getByRole('button', { name: /^Carrinho:/ })).toHaveAccessibleName(/Carrinho: 1 artigo/);

  await chargeInCash(page);
  await expect(page.getByText('Venda registada')).toBeVisible();
  await page.getByRole('button', { name: 'Nova venda' }).click();

  // The other window still shows the cart and charges it: nothing new is recorded.
  await chargeInCash(other);
  await expect(other.getByRole('alert')).toContainText(/já estava registada/);
  await expect(other.getByText('Venda registada')).toBeHidden();
  await expect(other.getByRole('button', { name: /^Carrinho:/ })).toHaveAccessibleName('Carrinho: O carrinho está vazio.');
  expect(await salesToday(page)).toBe(before + 1);
});

test('a price that changed behind the cart is never charged: the cart comes back up to date', async ({ page }) => {
  await openDemo(page);
  const before = await salesToday(page);
  await page.getByRole('button', { name: /Arroz 1 kg/ }).click();
  await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Numerário' }).click();
  await expect(page.getByRole('dialog').getByText('1.200 Kz').first()).toBeVisible();

  // The price goes up without this screen noticing (written straight into the phone's database).
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('caixa-demo');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const tx = db.transaction('products', 'readwrite');
    const products = tx.objectStore('products');
    const all = await new Promise<{ name: string }[]>((resolve) => {
      const read = products.getAll();
      read.onsuccess = () => resolve(read.result as { name: string }[]);
    });
    products.put({ ...all.find((p) => p.name === 'Arroz 1 kg')!, priceCents: 150_000 });
    await new Promise((resolve) => (tx.oncomplete = resolve));
    db.close();
  });

  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  await expect(page.getByText('Um preço ou um produto mudou. Veja o carrinho e cobre de novo.')).toBeVisible();
  await expect(page.getByText('Venda registada')).toBeHidden();
  // Nothing was recorded at the old price, and the cart shows the price of now.
  const cartSheet = page.getByRole('dialog', { name: 'Carrinho' });
  await expect(cartSheet).toContainText('1.500 Kz');
  await cartSheet.getByRole('button', { name: 'Cobrar', exact: false }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Numerário' }).click();
  await page.getByRole('button', { name: 'Confirmar venda' }).click();
  await expect(page.getByText('Venda registada')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Venda registada' })).toContainText('1.500 Kz');
  await page.getByRole('button', { name: 'Nova venda' }).click();
  expect(await salesToday(page)).toBe(before + 1);
});

test('a cart saved by an older version of the app is still there after the update', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: /Pão/ }).click();
  await page.getByRole('button', { name: /Pão/ }).click();
  await expect.poll(() => savedCart(page)).toContain('"lines"');
  // Older versions kept only the lines, without the id of the sale.
  await page.evaluate((key) => {
    const { lines } = JSON.parse(localStorage.getItem(key)!) as { lines: unknown[] };
    localStorage.setItem(key, JSON.stringify(lines));
  }, CART_KEY);
  await page.reload();
  await expect(page.getByRole('button', { name: /^Carrinho:/ })).toHaveAccessibleName(/Carrinho: 2 artigos/);
  await chargeInCash(page);
  await expect(page.getByText('Venda registada')).toBeVisible();
});

/** How many records a table of the demo database has (read straight from the phone's database). */
const rows = (page: Page, table: string) =>
  page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('caixa-demo');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const count = await new Promise<number>((resolve) => {
      const read = db.transaction(name).objectStore(name).count();
      read.onsuccess = () => resolve(read.result);
    });
    db.close();
    return count;
  }, table);

test('a double tap never records twice: customer payment, stock entry and new product', async ({ page }) => {
  await openDemo(page);

  // A customer pays part of the debt.
  await nav(page, 'Clientes');
  await page.getByRole('button', { name: /Joana Mateus/ }).click();
  const payments = await rows(page, 'creditPayments');
  await page.getByRole('button', { name: 'Registar pagamento' }).click();
  await page.getByLabel('Valor pago').fill('100');
  await page.getByRole('button', { name: 'Confirmar', exact: true }).dblclick();
  await expect(page.getByText('Pagamento registado.')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  expect(await rows(page, 'creditPayments')).toBe(payments + 1);

  // Stock comes in.
  await nav(page, 'Produtos');
  await page.getByRole('button', { name: /Arroz 5 kg/ }).click();
  const dialog = page.getByRole('dialog');
  const stockText = await dialog.getByText(/^\d+ em stock$/).textContent();
  const stock = Number(stockText!.match(/\d+/)![0]);
  await dialog.getByRole('button', { name: '+ Entrada de stock' }).click();
  await dialog.getByLabel('Quantidade que entrou').fill('10');
  await dialog.getByRole('button', { name: 'Confirmar', exact: true }).dblclick();
  await expect(dialog.getByText(`${stock + 10} em stock`)).toBeVisible();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();

  // A new product is created once.
  const products = await rows(page, 'products');
  await page.getByRole('button', { name: '+ Novo produto' }).click();
  await page.getByLabel('Nome').fill('Produto do toque duplo');
  await page.getByLabel('Preço (Kz)').fill('500');
  await page.getByRole('button', { name: 'Guardar' }).dblclick();
  await expect(page.getByRole('button', { name: /Produto do toque duplo/ })).toHaveCount(1);
  expect(await rows(page, 'products')).toBe(products + 1);
});

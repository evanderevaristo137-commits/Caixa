import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeAudit } from '../domain/audit-describe';
import { parseCsv, planImport } from '../domain/import-products';
import { productsCsv } from './backup';
import { CaixaDB } from './db';
import { Store } from './store';

let db: CaixaDB;
let store: Store;
let n = 0;
beforeEach(() => {
  db = new CaixaDB(`test-product-categories-${n++}`);
  store = new Store(db);
});
afterEach(async () => {
  await db.delete();
});

const base = { priceCents: 100_000, minStock: 0 };
const names = { product: () => undefined, customer: () => undefined, supplier: () => undefined, staff: () => undefined };

describe('category and subcategory of a product', () => {
  it("keeps the app's spelling, and the shop's own when it has one", async () => {
    const beer = await store.products.create({ name: 'Cerveja 330 ml', ...base, category: ' bebidas ', subcategory: 'CERVEJA' });
    expect(beer).toMatchObject({ category: 'Bebidas', subcategory: 'Cerveja' });
    const own = await store.products.create({ name: 'Kissangua', ...base, category: 'Bebidas', subcategory: 'Bebidas tradicionais' });
    const again = await store.products.create({ name: 'Maruvo', ...base, category: 'Bebidas', subcategory: 'bebidas TRADICIONAIS' });
    expect(again.subcategory).toBe(own.subcategory);
    // A subcategory needs its category.
    const alone = await store.products.create({ name: 'Sem nada', ...base, subcategory: 'Cerveja' });
    expect(alone.subcategory).toBeUndefined();
  });

  it('a subcategory goes when its category changes or is taken away, and stays otherwise', async () => {
    const p = await store.products.create({
      name: 'Capa A14',
      ...base,
      category: 'Telemóveis e electrónica',
      subcategory: 'Capas e películas',
    });
    // Another field changed: the place stays.
    let after = await store.products.update(p.id, { name: 'Capa A14', ...base, minStock: 2 });
    expect(after).toMatchObject({ category: 'Telemóveis e electrónica', subcategory: 'Capas e películas' });
    // Only the subcategory.
    after = await store.products.update(p.id, { name: 'Capa A14', ...base, subcategory: 'Carregadores e cabos' });
    expect(after).toMatchObject({ category: 'Telemóveis e electrónica', subcategory: 'Carregadores e cabos' });
    // Another category, without a subcategory: the old one does not belong there.
    after = await store.products.update(p.id, { name: 'Capa A14', ...base, category: 'Diversos' });
    expect(after.category).toBe('Diversos');
    expect(after.subcategory).toBeUndefined();
    // No category: nothing left.
    after = await store.products.update(p.id, { name: 'Capa A14', ...base, category: '', subcategory: 'Pilhas e lanternas' });
    expect(after.category).toBeUndefined();
    expect(after.subcategory).toBeUndefined();
  });

  it('the activity log says how the category changed', async () => {
    const p = await store.products.create({ name: 'Pneu 195/65 R15', ...base, category: 'Peças e acessórios auto' });
    await store.products.update(p.id, { name: 'Pneu 195/65 R15', ...base, category: 'Peças e acessórios auto', subcategory: 'Pneus' });
    await store.products.update(p.id, { name: 'Pneu 195/65 R15', ...base, category: 'Diversos' });
    const lines = (await store.auditLog.list())
      .filter((e) => e.entity === 'product' && e.action === 'updated')
      .map((e) => describeAudit(e, names)?.text);
    // Both changes can share the same millisecond: their order in the log is not what is tested.
    expect(lines).toHaveLength(2);
    expect(lines).toEqual(
      expect.arrayContaining([
        'Pneu 195/65 R15: subcategoria — → Pneus',
        'Pneu 195/65 R15: categoria Peças e acessórios auto › Pneus → Diversos',
      ]),
    );
  });

  it('goes out and comes back with the Excel sheet of the products (old sheets without the column too)', async () => {
    await store.products.create({ name: 'Filtro de óleo', ...base, category: 'Peças e acessórios auto', subcategory: 'Filtros' });
    const sheet = await productsCsv(db);
    expect(sheet).toContain('Filtro de óleo;Peças e acessórios auto;Filtros;');
    // Its own export: nothing to change.
    expect(planImport(parseCsv(sheet), await store.products.list()).rows.every((r) => r.action === 'same')).toBe(true);

    // A sheet with the column creates with the subcategory; one without it keeps what the product has.
    const withSub = parseCsv(
      ['Produto;Categoria;Subcategoria;Preço (Kz)', 'Velas de ignição;Peças e acessórios auto;parte eléctrica e baterias;2.500'].join('\n'),
    );
    await store.products.importMany(planImport(withSub, await store.products.list()).rows);
    const candles = (await store.products.list()).find((p) => p.name === 'Velas de ignição');
    expect(candles).toMatchObject({ category: 'Peças e acessórios auto', subcategory: 'Parte eléctrica e baterias' });

    const old = parseCsv(['Produto;Categoria;Preço (Kz)', 'Filtro de óleo;Peças e acessórios auto;1.200'].join('\n'));
    await store.products.importMany(planImport(old, await store.products.list()).rows);
    expect((await store.products.list()).find((p) => p.name === 'Filtro de óleo')).toMatchObject({
      priceCents: 120_000,
      subcategory: 'Filtros',
    });
  });
});

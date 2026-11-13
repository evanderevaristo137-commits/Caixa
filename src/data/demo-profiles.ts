import type { BusinessTypeId } from '../domain/catalog';
import type { PaymentMethod, Purchase } from '../domain/types';

/**
 * The example shops of the demonstration: a grocery (the default), a car parts shop and a phone and
 * accessories shop, so a visit shows the app with goods like the merchant's own. Everything here is
 * made up: names, prices, customers and suppliers. The same generator (demo-seed.ts) makes two weeks
 * of sales for each one.
 */

export type DemoKind = 'grocery' | 'auto' | 'phones';
export const DEMO_KINDS: readonly DemoKind[] = ['grocery', 'auto', 'phones'];
export const isDemoKind = (k: unknown): k is DemoKind => DEMO_KINDS.includes(k as DemoKind);

/** [name, price in Kz, cost price in Kz (both per kg when sold by weight), minimum stock, stock left today, sold by weight] */
export type ProductRow = [string, number, number, number, number, boolean?];
/** [day of the two weeks, supplier, payment, lines: product name and quantity] */
export type PurchaseRow = [number, number, Purchase['payment'], [string, number][]];

export interface DemoProfile {
  storeName: string;
  businessTypes: BusinessTypeId[];
  /** Stock for weighed products is in grams. */
  products: ProductRow[];
  /** Where each product is: category › subcategory › products (every product, a test checks). */
  places: Record<string, Record<string, string[]>>;
  /** Five customers on credit (all with the founder's WhatsApp test number). */
  customers: string[];
  suppliers: string[];
  /** Which supplier usually sells each product (index in `suppliers`). */
  supplierOf: (name: string) => number;
  purchases: PurchaseRow[];
  /** Sales a day: at least `[0]`, plus up to `[1]` more. Lines per sale: 1 to `maxLines`. */
  salesPerDay: [number, number];
  maxLines: number;
  methodWeights: [PaymentMethod, number][];
  /** The supplier raised this product's cost and the shop did not change its price yet (a «Hoje» suggestion). */
  belowCost: { name: string; costCents: number };
  /** Products that follow their expiry dates: [quantity, days until it expires] of the stock on the shelf. */
  dated: [string, [number, number][]][];
  creditLimitCents: number;
}

const GROCERY: DemoProfile = {
  storeName: 'Mercearia da Dona Teresa',
  businessTypes: ['grocery'],
  products: [
    ['Arroz 1 kg', 1_200, 1_000, 10, 34],
    ['Arroz 5 kg', 5_500, 4_700, 4, 9],
    ['Fuba de milho 1 kg', 800, 650, 10, 28],
    ['Fuba de bombó 1 kg', 900, 720, 8, 6],
    ['Feijão manteiga 1 kg', 1_500, 1_200, 8, 19],
    ['Açúcar 1 kg', 1_100, 900, 10, 25],
    ['Óleo vegetal 1 L', 1_850, 1_550, 8, 3],
    ['Óleo de palma 1 L', 2_000, 1_600, 4, 11],
    ['Sal 1 kg', 300, 220, 5, 22],
    ['Massa esparguete 500 g', 600, 470, 10, 31],
    ['Leite em pó 400 g', 3_200, 2_700, 4, 7],
    ['Leite UHT 1 L', 1_200, 980, 6, 14],
    ['Pão (unidade)', 150, 110, 20, 45],
    ['Ovos (dúzia)', 2_500, 2_050, 4, 2],
    ['Sardinha em lata', 650, 500, 10, 26],
    ['Atum em lata', 900, 720, 6, 13],
    ['Salsichas em lata', 800, 630, 6, 15],
    ['Massa de tomate 70 g', 350, 260, 10, 30],
    ['Cebola 1 kg', 800, 600, 5, 12],
    ['Batata 1 kg', 700, 520, 5, 16],
    ['Água 1,5 L', 300, 210, 12, 40],
    ['Gasosa 330 ml', 400, 290, 12, 36],
    ['Sumo 1 L', 1_200, 950, 6, 10],
    ['Cerveja 330 ml', 500, 370, 24, 60],
    ['Sabão em barra', 400, 300, 8, 21],
    ['Detergente em pó 500 g', 1_300, 1_050, 5, 4],
    ['Papel higiénico (4 rolos)', 1_200, 950, 5, 12],
    ['Pasta de dentes', 900, 700, 4, 9],
    ['Fósforos (caixa)', 100, 70, 10, 50],
    ['Carvão (saco)', 1_500, 1_100, 4, 8],
    ['Arroz a granel', 1_100, 900, 10_000, 25_000, true],
    ['Feijão a granel', 1_400, 1_100, 5_000, 3_500, true],
    ['Açúcar a granel', 1_000, 820, 5_000, 12_000, true],
  ],
  places: {
    'Alimentação e mercearia': {
      'Arroz, massas e fuba': [
        'Arroz 1 kg',
        'Arroz 5 kg',
        'Fuba de milho 1 kg',
        'Fuba de bombó 1 kg',
        'Massa esparguete 500 g',
        'Arroz a granel',
      ],
      'Feijão, milho e cereais': ['Feijão manteiga 1 kg', 'Feijão a granel'],
      'Óleo, açúcar e sal': ['Açúcar 1 kg', 'Óleo vegetal 1 L', 'Óleo de palma 1 L', 'Sal 1 kg', 'Açúcar a granel'],
      'Leite e derivados': ['Leite em pó 400 g', 'Leite UHT 1 L'],
      Conservas: ['Sardinha em lata', 'Atum em lata', 'Salsichas em lata'],
      'Temperos e molhos': ['Massa de tomate 70 g'],
      'Pão e bolachas': ['Pão (unidade)'],
    },
    'Frescos e congelados': { 'Legumes e verduras': ['Cebola 1 kg', 'Batata 1 kg'], Ovos: ['Ovos (dúzia)'] },
    Bebidas: { Água: ['Água 1,5 L'], 'Refrigerantes e sumos': ['Gasosa 330 ml', 'Sumo 1 L'], Cerveja: ['Cerveja 330 ml'] },
    'Higiene e limpeza': {
      'Detergentes e lixívia': ['Sabão em barra', 'Detergente em pó 500 g'],
      'Papel higiénico e guardanapos': ['Papel higiénico (4 rolos)'],
      'Higiene pessoal': ['Pasta de dentes'],
    },
    'Casa e cozinha': { 'Gás e carvão': ['Carvão (saco)'] },
    Diversos: { 'Fósforos e isqueiros': ['Fósforos (caixa)'] },
  },
  customers: ['Joana Mateus', 'António Kiala', 'Esperança Domingos', 'Manuel Sebastião', 'Luísa Neto'],
  // Drinks and bread have their own suppliers.
  suppliers: ['Armazém Kikolo', 'Distribuidora Viana', 'Padaria do Bairro'],
  supplierOf: (name) => (/^(Água|Gasosa|Sumo|Cerveja)/.test(name) ? 1 : name.startsWith('Pão') ? 2 : 0),
  purchases: [
    [
      4,
      0,
      'credit',
      [
        ['Arroz 1 kg', 20],
        ['Óleo vegetal 1 L', 12],
        ['Açúcar 1 kg', 20],
      ],
    ],
    [
      9,
      1,
      'cash',
      [
        ['Cerveja 330 ml', 48],
        ['Gasosa 330 ml', 24],
        ['Água 1,5 L', 24],
      ],
    ],
    [12, 2, 'cash', [['Pão (unidade)', 30]]],
  ],
  salesPerDay: [14, 12],
  maxLines: 4,
  methodWeights: [
    ['cash', 0.46],
    ['multicaixa_express', 0.2],
    ['kwik', 0.08],
    ['unitel_money', 0.08],
    ['afrimoney', 0.04],
    ['paypay', 0.04],
    ['credit', 0.1],
  ],
  belowCost: { name: 'Açúcar 1 kg', costCents: 115_000 },
  // The milk: one lot about to expire, one expired, the rest fine.
  dated: [
    [
      'Leite UHT 1 L',
      [
        [4, 5],
        [99, 45],
      ],
    ],
    [
      'Leite em pó 400 g',
      [
        [2, -3],
        [99, 120],
      ],
    ],
  ],
  creditLimitCents: 3_000_000,
};

const AUTO: DemoProfile = {
  storeName: 'Peças Auto do Sr. Domingos',
  businessTypes: ['auto'],
  products: [
    ['Óleo de motor 15W-40 (4 L)', 18_000, 15_000, 6, 9],
    ['Óleo de motor 5W-30 (1 L)', 6_500, 5_200, 6, 14],
    ['Líquido de travões (500 ml)', 3_500, 2_700, 4, 3],
    ['Anticongelante (1 L)', 4_000, 3_100, 4, 7],
    ['Massa lubrificante (500 g)', 2_500, 1_900, 3, 5],
    ['Filtro de óleo', 4_500, 3_400, 8, 5],
    ['Filtro de ar', 6_000, 4_600, 5, 8],
    ['Filtro de combustível', 5_500, 4_200, 4, 6],
    ['Pastilhas de travão (dianteiras)', 15_000, 11_500, 4, 6],
    ['Disco de travão', 22_000, 17_000, 2, 3],
    ['Bateria 12 V 60 Ah', 65_000, 52_000, 2, 1],
    ['Velas de ignição (jogo de 4)', 9_000, 6_800, 4, 7],
    ['Fusíveis (caixa)', 1_500, 1_000, 5, 12],
    ['Lâmpada H4', 2_500, 1_800, 6, 10],
    ['Lâmpada de pisca', 500, 320, 10, 25],
    ['Amortecedor dianteiro', 35_000, 27_000, 2, 4],
    ['Rótula de direcção', 12_000, 9_000, 2, 3],
    ['Correia de distribuição', 18_000, 14_000, 2, 2],
    ['Bomba de água', 28_000, 21_500, 1, 2],
    ['Junta da cabeça', 9_500, 7_200, 2, 4],
    ['Pneu 195/65 R15', 45_000, 36_000, 4, 6],
    ['Escovas limpa-vidros (par)', 5_000, 3_600, 4, 6],
    ['Ambientador', 1_500, 1_000, 10, 18],
    ['Óleo de mota 2T (1 L)', 3_000, 2_300, 6, 11],
    ['Câmara de ar (mota)', 3_500, 2_600, 5, 9],
    ['Corrente de mota', 7_500, 5_600, 3, 5],
    ['Pastilhas de travão (mota)', 4_000, 3_000, 4, 8],
    ['Chave de rodas', 4_500, 3_300, 2, 4],
    ['Macaco hidráulico', 25_000, 19_000, 1, 2],
  ],
  places: {
    'Peças e acessórios auto': {
      'Óleos e lubrificantes': [
        'Óleo de motor 15W-40 (4 L)',
        'Óleo de motor 5W-30 (1 L)',
        'Líquido de travões (500 ml)',
        'Anticongelante (1 L)',
        'Massa lubrificante (500 g)',
      ],
      Filtros: ['Filtro de óleo', 'Filtro de ar', 'Filtro de combustível'],
      Travões: ['Pastilhas de travão (dianteiras)', 'Disco de travão'],
      'Parte eléctrica e baterias': ['Bateria 12 V 60 Ah', 'Velas de ignição (jogo de 4)', 'Fusíveis (caixa)'],
      Iluminação: ['Lâmpada H4', 'Lâmpada de pisca'],
      'Suspensão e direcção': ['Amortecedor dianteiro', 'Rótula de direcção'],
      Motor: ['Correia de distribuição', 'Bomba de água', 'Junta da cabeça'],
      Pneus: ['Pneu 195/65 R15'],
      Acessórios: ['Escovas limpa-vidros (par)', 'Ambientador'],
      'Peças de motorizada': ['Óleo de mota 2T (1 L)', 'Câmara de ar (mota)', 'Corrente de mota', 'Pastilhas de travão (mota)'],
    },
    'Ferragens e construção': { Ferramentas: ['Chave de rodas', 'Macaco hidráulico'] },
  },
  customers: ['Mário Kiluanje', 'Adelino Mbala', 'Rosa Quissanga', 'Jorge Mussungo', 'Isabel Tchissola'],
  // Oils from one distributor, tyres from another, the rest from the parts warehouse.
  suppliers: ['Distribuidora de Óleos Viana', 'Armazém de Peças do Cazenga', 'Importadora de Pneus'],
  supplierOf: (name) => (/^(Óleo|Líquido|Anticongelante|Massa)/.test(name) ? 0 : name.startsWith('Pneu') ? 2 : 1),
  purchases: [
    [
      4,
      1,
      'credit',
      [
        ['Filtro de óleo', 10],
        ['Pastilhas de travão (dianteiras)', 6],
        ['Velas de ignição (jogo de 4)', 6],
      ],
    ],
    [
      9,
      0,
      'cash',
      [
        ['Óleo de motor 15W-40 (4 L)', 6],
        ['Líquido de travões (500 ml)', 6],
      ],
    ],
    [12, 2, 'cash', [['Pneu 195/65 R15', 4]]],
  ],
  salesPerDay: [6, 8],
  maxLines: 2,
  methodWeights: [
    ['cash', 0.45],
    ['multicaixa_express', 0.2],
    ['tpa', 0.05],
    ['transfer', 0.05],
    ['kwik', 0.05],
    ['unitel_money', 0.05],
    ['credit', 0.15],
  ],
  belowCost: { name: 'Óleo de motor 15W-40 (4 L)', costCents: 1_850_000 },
  dated: [],
  creditLimitCents: 15_000_000,
};

const PHONES: DemoProfile = {
  storeName: 'Telemóveis da Neusa',
  businessTypes: ['phones'],
  products: [
    ['Telemóvel básico (teclas)', 12_000, 9_500, 3, 5],
    ['Smartphone 32 GB', 65_000, 54_000, 2, 3],
    ['Smartphone 64 GB', 95_000, 80_000, 2, 2],
    ['Smartphone 128 GB', 140_000, 118_000, 1, 1],
    ['Tablet 10 polegadas', 85_000, 70_000, 1, 2],
    ['Capa de silicone', 2_500, 1_200, 10, 24],
    ['Capa com tampa', 4_000, 2_200, 6, 9],
    ['Película de vidro', 2_000, 800, 15, 35],
    ['Carregador rápido 20 W', 6_500, 4_800, 5, 8],
    ['Carregador simples', 3_000, 1_900, 8, 6],
    ['Cabo USB-C', 2_000, 1_000, 10, 18],
    ['Cabo micro-USB', 1_500, 750, 8, 12],
    ['Power bank 10.000 mAh', 12_000, 8_500, 3, 4],
    ['Auriculares com fio', 2_500, 1_300, 8, 15],
    ['Auriculares sem fio', 9_000, 6_200, 4, 5],
    ['Coluna Bluetooth pequena', 15_000, 10_500, 2, 3],
    ['Cartão de memória 32 GB', 5_000, 3_300, 5, 9],
    ['Cartão de memória 64 GB', 8_000, 5_600, 3, 4],
    ['Pen USB 32 GB', 5_500, 3_700, 3, 6],
    ['Rato sem fio', 5_000, 3_200, 3, 5],
    ['Recarga de saldo 500 Kz', 500, 470, 20, 60],
    ['Recarga de saldo 1.000 Kz', 1_000, 940, 20, 45],
    ['Antena de TV', 7_000, 5_000, 2, 4],
    ['Comando universal', 3_500, 2_200, 4, 7],
    ['Ventoinha de mesa', 18_000, 13_500, 2, 3],
    ['Pilhas AA (pacote de 4)', 1_500, 1_000, 10, 20],
    ['Lanterna recarregável', 6_000, 4_200, 3, 5],
  ],
  places: {
    'Telemóveis e electrónica': {
      Telemóveis: ['Telemóvel básico (teclas)', 'Smartphone 32 GB', 'Smartphone 64 GB', 'Smartphone 128 GB'],
      'Computadores e tablets': ['Tablet 10 polegadas', 'Rato sem fio'],
      'Capas e películas': ['Capa de silicone', 'Capa com tampa', 'Película de vidro'],
      'Carregadores e cabos': ['Carregador rápido 20 W', 'Carregador simples', 'Cabo USB-C', 'Cabo micro-USB', 'Power bank 10.000 mAh'],
      'Auriculares e colunas': ['Auriculares com fio', 'Auriculares sem fio', 'Coluna Bluetooth pequena'],
      'Cartões de memória': ['Cartão de memória 32 GB', 'Cartão de memória 64 GB', 'Pen USB 32 GB'],
      'Saldo e recargas': ['Recarga de saldo 500 Kz', 'Recarga de saldo 1.000 Kz'],
      'Televisores e receptores': ['Antena de TV', 'Comando universal'],
    },
    Electrodomésticos: { 'Ventoinhas e ar condicionado': ['Ventoinha de mesa'] },
    Diversos: { 'Pilhas e lanternas': ['Pilhas AA (pacote de 4)', 'Lanterna recarregável'] },
  },
  customers: ['Neide Cassule', 'Paulo Ngola', 'Celeste Muxima', 'Bruno Kalandula', 'Domingas Lunda'],
  // Phones and tablets from the importer, saldo from the operator's agent, the rest from the wholesaler.
  suppliers: ['Importadora Tech do Kikolo', 'Grossista de Acessórios do Zango', 'Agente de Saldo'],
  supplierOf: (name) => (/^(Telemóvel|Smartphone|Tablet)/.test(name) ? 0 : name.startsWith('Recarga') ? 2 : 1),
  purchases: [
    [
      4,
      1,
      'credit',
      [
        ['Capa de silicone', 20],
        ['Película de vidro', 30],
        ['Cabo USB-C', 20],
      ],
    ],
    [
      9,
      0,
      'cash',
      [
        ['Smartphone 32 GB', 3],
        ['Telemóvel básico (teclas)', 5],
      ],
    ],
    [12, 2, 'cash', [['Recarga de saldo 1.000 Kz', 50]]],
  ],
  salesPerDay: [10, 11],
  maxLines: 3,
  methodWeights: [
    ['cash', 0.45],
    ['multicaixa_express', 0.2],
    ['unitel_money', 0.1],
    ['kwik', 0.05],
    ['afrimoney', 0.05],
    ['paypay', 0.05],
    ['credit', 0.1],
  ],
  belowCost: { name: 'Carregador rápido 20 W', costCents: 680_000 },
  dated: [],
  creditLimitCents: 10_000_000,
};

export const DEMO_PROFILES: Record<DemoKind, DemoProfile> = { grocery: GROCERY, auto: AUTO, phones: PHONES };

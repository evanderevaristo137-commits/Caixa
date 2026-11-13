/**
 * The categories the app knows, for every kind of small shop in Angola: a category and its
 * subcategories (two levels: more would be slow and confusing on a phone). A shop can also write its
 * own, which sit next to these. The names are saved in each product as written here (renaming one
 * later would not rename the products that already have it). `words`: other words people search for
 * ("capa" finds «Capas e películas»; "gasosa" finds «Refrigerantes e sumos»).
 *
 * The business types say which categories a shop sees first; «Ver todas» shows the rest.
 */

export interface CatalogSub {
  name: string;
  words?: readonly string[];
}

export interface CatalogCategory {
  name: string;
  /** A drawing the phone already has (an emoji), to recognise the category without reading. */
  icon: string;
  subs: readonly CatalogSub[];
}

const s = (name: string, ...words: string[]): CatalogSub => (words.length ? { name, words } : { name });

export const CATALOG: readonly CatalogCategory[] = [
  {
    name: 'Alimentação e mercearia',
    icon: '🛒',
    subs: [
      s('Arroz, massas e fuba', 'esparguete', 'macarrão', 'farinha', 'bombó'),
      s('Feijão, milho e cereais', 'feijão', 'milho', 'aveia', 'ginguba', 'amendoim'),
      s('Óleo, açúcar e sal', 'azeite', 'margarina'),
      s('Conservas', 'lata', 'atum', 'sardinha', 'salsichas', 'enlatados'),
      s('Leite e derivados', 'iogurte', 'queijo', 'manteiga', 'natas'),
      s('Pão e bolachas', 'bolacha', 'biscoito', 'pastelaria', 'bolo'),
      s('Doces e snacks', 'chocolate', 'rebuçado', 'chupa', 'batata frita', 'pipocas', 'pastilha'),
      s('Temperos e molhos', 'caldo', 'maionese', 'ketchup', 'vinagre', 'massa de tomate', 'piri-piri', 'jindungo'),
      s('Café, chá e cacau'),
      s('Refeições e petiscos', 'comida', 'sandes', 'prato', 'churrasco', 'bifana'),
    ],
  },
  {
    name: 'Bebidas',
    icon: '🥤',
    subs: [
      s('Água'),
      s('Refrigerantes e sumos', 'gasosa', 'refrigerante', 'sumo', 'néctar'),
      s('Cerveja', 'cerveja', 'birra'),
      s('Vinhos e espirituosas', 'vinho', 'whisky', 'gin', 'vodka', 'licor', 'aguardente', 'caporroto'),
      s('Bebidas energéticas', 'energética'),
      s('Gelo'),
    ],
  },
  {
    name: 'Frescos e congelados',
    icon: '🥬',
    subs: [
      s('Frutas', 'banana', 'laranja', 'manga', 'abacaxi', 'maçã'),
      s('Legumes e verduras', 'batata', 'cebola', 'tomate', 'couve', 'alho', 'cenoura', 'gimboa'),
      s('Carne e frango', 'carne', 'frango', 'coxa', 'chouriço', 'bacon'),
      s('Peixe e marisco', 'peixe', 'carapau', 'camarão', 'lagosta', 'kitaba', 'peixe seco'),
      s('Ovos'),
      s('Congelados', 'gelado'),
    ],
  },
  {
    name: 'Higiene e limpeza',
    icon: '🧼',
    subs: [
      s('Higiene pessoal', 'sabonete', 'pasta de dentes', 'escova', 'desodorizante', 'champô', 'pensos higiénicos'),
      s('Fraldas', 'fralda'),
      s('Papel higiénico e guardanapos', 'papel', 'guardanapo', 'lenços'),
      s('Detergentes e lixívia', 'detergente', 'lixívia', 'sabão', 'amaciador', 'desinfectante'),
      s('Insecticidas', 'insecticida', 'mosquito', 'barata', 'repelente'),
    ],
  },
  {
    name: 'Beleza e cosmética',
    icon: '💄',
    subs: [
      s('Cabelo e extensões', 'cabelo', 'extensão', 'tranças', 'peruca', 'mecha', 'creme de cabelo'),
      s('Pele e corpo', 'creme', 'loção', 'óleo de corpo', 'protector solar'),
      s('Maquilhagem', 'batom', 'base', 'rímel', 'pó'),
      s('Perfumes', 'perfume', 'colónia'),
      s('Unhas', 'verniz', 'unhas postiças'),
      s('Barbearia', 'lâmina', 'máquina de barbear', 'gilete'),
    ],
  },
  {
    name: 'Saúde e farmácia',
    icon: '💊',
    subs: [
      s('Medicamentos sem receita', 'paracetamol', 'analgésico', 'xarope', 'comprimido', 'pomada'),
      s('Medicamentos com receita', 'antibiótico', 'receita'),
      s('Vitaminas e suplementos', 'vitamina', 'suplemento'),
      s('Primeiros socorros', 'penso', 'gaze', 'álcool', 'ligadura', 'adesivo'),
      s('Material médico', 'seringa', 'luvas', 'teste', 'termómetro', 'máscara', 'preservativo'),
    ],
  },
  {
    name: 'Telemóveis e electrónica',
    icon: '📱',
    subs: [
      s('Telemóveis', 'telemóvel', 'smartphone', 'celular'),
      s('Computadores e tablets', 'computador', 'portátil', 'laptop', 'tablet', 'impressora', 'rato', 'teclado'),
      s('Capas e películas', 'capa', 'película', 'vidro temperado'),
      s('Carregadores e cabos', 'carregador', 'cabo', 'power bank', 'adaptador'),
      s('Auriculares e colunas', 'fones', 'auriculares', 'auscultadores', 'coluna', 'bluetooth'),
      s('Cartões de memória', 'cartão de memória', 'pen', 'usb', 'disco'),
      s('Televisores e receptores', 'tv', 'televisão', 'televisor', 'antena', 'receptor', 'descodificador'),
      s('Saldo e recargas', 'saldo', 'recarga', 'unitel', 'africell', 'movicel', 'dados'),
    ],
  },
  {
    name: 'Electrodomésticos',
    icon: '🔌',
    subs: [
      s('Frigoríficos e arcas', 'geleira', 'frigorífico', 'arca', 'congelador'),
      s('Fogões', 'fogão', 'placa', 'forno'),
      s('Máquinas de lavar', 'máquina de lavar'),
      s('Pequenos electrodomésticos', 'ferro', 'liquidificador', 'chaleira', 'micro-ondas', 'torradeira', 'batedeira'),
      s('Ventoinhas e ar condicionado', 'ventoinha', 'ventilador', 'ar condicionado'),
      s('Geradores, solar e baterias', 'gerador', 'painel solar', 'solar', 'inversor', 'estabilizador', 'bateria'),
    ],
  },
  {
    name: 'Peças e acessórios auto',
    icon: '🚗',
    subs: [
      s('Motor', 'correia', 'junta', 'pistão', 'bomba de água', 'embraiagem', 'radiador'),
      s('Travões', 'travão', 'pastilha', 'pastilhas', 'disco de travão', 'calço', 'maxila'),
      s('Suspensão e direcção', 'amortecedor', 'rótula', 'bucha', 'mola', 'direcção'),
      s('Filtros', 'filtro', 'filtro de óleo', 'filtro de ar', 'filtro de combustível'),
      s('Óleos e lubrificantes', 'óleo de motor', 'lubrificante', 'massa', 'líquido de travões', 'anticongelante'),
      s('Parte eléctrica e baterias', 'bateria', 'alternador', 'motor de arranque', 'vela', 'velas', 'fusível'),
      s('Pneus', 'pneu', 'câmara de ar', 'jante'),
      s('Carroçaria e vidros', 'pára-choques', 'espelho', 'retrovisor', 'vidro', 'pára-brisas', 'porta'),
      s('Iluminação', 'lâmpada', 'farol', 'farolim', 'pisca'),
      s('Acessórios', 'tapete', 'capa de banco', 'ambientador', 'limpa-vidros', 'escovas'),
      s('Peças de motorizada', 'mota', 'motorizada', 'kupapata'),
    ],
  },
  {
    name: 'Ferragens e construção',
    icon: '🔨',
    subs: [
      s('Cimento e blocos', 'cimento', 'bloco', 'areia', 'brita', 'cal'),
      s('Ferro e varão', 'ferro', 'varão', 'arame', 'malha'),
      s('Tintas', 'tinta', 'pincel', 'rolo', 'diluente', 'verniz'),
      s('Canalização', 'tubo', 'torneira', 'cano', 'sanita', 'lavatório'),
      s('Material eléctrico', 'fio', 'cabo eléctrico', 'tomada', 'interruptor', 'disjuntor', 'lâmpada', 'extensão'),
      s('Ferramentas', 'martelo', 'chave', 'alicate', 'serra', 'berbequim', 'fita métrica'),
      s('Parafusos e pregos', 'parafuso', 'prego', 'bucha', 'dobradiça', 'fechadura', 'cadeado'),
      s('Chapas e coberturas', 'chapa', 'telha', 'zinco', 'lona'),
    ],
  },
  {
    name: 'Roupa e calçado',
    icon: '👕',
    subs: [
      s('Homem', 'camisa', 'calça', 'fato'),
      s('Mulher', 'vestido', 'saia', 'blusa'),
      s('Criança'),
      s('Calçado', 'sapato', 'sandália', 'chinelo', 'ténis', 'bota'),
      s('Roupa interior', 'cueca', 'soutien', 'meias', 'pijama'),
      s('Panos e tecidos', 'pano', 'tecido', 'samakaka', 'capulana'),
      s('Bolsas e acessórios', 'bolsa', 'mala', 'cinto', 'relógio', 'óculos', 'chapéu', 'bijuteria'),
      s('Fardas escolares', 'farda', 'bata', 'uniforme'),
    ],
  },
  {
    name: 'Casa e cozinha',
    icon: '🍳',
    subs: [
      s('Loiça e utensílios', 'prato', 'panela', 'copo', 'talher', 'chávena', 'tacho'),
      s('Plásticos', 'balde', 'bacia', 'garrafão', 'bidão', 'saco'),
      s('Têxteis do lar', 'lençol', 'toalha', 'cortina', 'colchão', 'almofada', 'manta'),
      s('Gás e carvão', 'gás', 'botija', 'carvão', 'lenha'),
      s('Decoração', 'quadro', 'jarra', 'flores'),
    ],
  },
  {
    name: 'Papelaria e escola',
    icon: '✏️',
    subs: [
      s('Cadernos e livros', 'caderno', 'livro', 'manual'),
      s('Canetas e lápis', 'caneta', 'lápis', 'borracha', 'afia', 'marcador'),
      s('Mochilas', 'mochila', 'pasta'),
      s('Material de escritório', 'papel', 'envelope', 'agrafador', 'cola', 'tesoura', 'resma'),
    ],
  },
  {
    name: 'Bebé e criança',
    icon: '🧸',
    subs: [
      s('Brinquedos', 'brinquedo', 'boneca', 'bola', 'carrinho'),
      s('Roupa de bebé', 'babygrow', 'body'),
      s('Alimentação infantil', 'papa', 'leite de bebé', 'cerelac'),
      s('Biberões e acessórios', 'biberão', 'chupeta', 'toalhitas'),
    ],
  },
  {
    name: 'Agro-pecuária',
    icon: '🌱',
    subs: [
      s('Sementes', 'semente'),
      s('Adubos e pesticidas', 'adubo', 'fertilizante', 'pesticida', 'herbicida'),
      s('Ração', 'ração', 'farelo'),
      s('Ferramentas agrícolas', 'enxada', 'catana', 'pá', 'regador', 'carrinho de mão'),
      s('Veterinária', 'vacina', 'desparasitante'),
    ],
  },
  {
    name: 'Diversos',
    icon: '📦',
    subs: [
      s('Tabaco', 'cigarro', 'cigarros'),
      s('Fósforos e isqueiros', 'fósforo', 'isqueiro'),
      s('Pilhas e lanternas', 'pilha', 'lanterna'),
      s('Velas', 'vela'),
    ],
  },
];

/** The kinds of shop, and the categories each one sees first. */
export const BUSINESS_TYPES = [
  {
    id: 'grocery',
    name: 'Mercearia e minimercado',
    categories: [
      'Alimentação e mercearia',
      'Bebidas',
      'Frescos e congelados',
      'Higiene e limpeza',
      'Casa e cozinha',
      'Bebé e criança',
      'Diversos',
    ],
  },
  { id: 'pharmacy', name: 'Farmácia', categories: ['Saúde e farmácia', 'Higiene e limpeza', 'Beleza e cosmética', 'Bebé e criança'] },
  { id: 'phones', name: 'Telemóveis e electrónica', categories: ['Telemóveis e electrónica', 'Electrodomésticos', 'Diversos'] },
  { id: 'appliances', name: 'Electrodomésticos', categories: ['Electrodomésticos', 'Telemóveis e electrónica', 'Casa e cozinha'] },
  { id: 'auto', name: 'Peças auto e motorizadas', categories: ['Peças e acessórios auto', 'Ferragens e construção'] },
  { id: 'hardware', name: 'Ferragens e construção', categories: ['Ferragens e construção', 'Casa e cozinha', 'Agro-pecuária'] },
  { id: 'clothing', name: 'Roupa e calçado', categories: ['Roupa e calçado', 'Beleza e cosmética', 'Bebé e criança'] },
  { id: 'beauty', name: 'Beleza e cosmética', categories: ['Beleza e cosmética', 'Higiene e limpeza'] },
  { id: 'stationery', name: 'Papelaria', categories: ['Papelaria e escola', 'Telemóveis e electrónica', 'Diversos'] },
  { id: 'bar', name: 'Bar e restaurante', categories: ['Bebidas', 'Alimentação e mercearia', 'Frescos e congelados', 'Diversos'] },
  { id: 'agro', name: 'Agro-pecuária', categories: ['Agro-pecuária', 'Ferragens e construção'] },
  { id: 'general', name: 'Loja de tudo um pouco', categories: CATALOG.map((c) => c.name) },
] as const satisfies readonly { id: string; name: string; categories: readonly string[] }[];

export type BusinessTypeId = (typeof BUSINESS_TYPES)[number]['id'];

export const isBusinessType = (id: unknown): id is BusinessTypeId => BUSINESS_TYPES.some((b) => b.id === id);

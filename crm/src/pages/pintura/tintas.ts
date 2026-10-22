/*
 * Cores de tinta reais para o simulador de pintura (recurso temporário do Meu perfil).
 * Nomes e códigos são os dos fabricantes; o hex é a referência de tela publicada pelo fabricante
 * (Sherwin-Williams) ou por catálogos de cor (Encycolorpedia, Tacolor) para Suvinil e Coral.
 * Na tela a cor é sempre aproximada: confira no leque da loja antes de comprar.
 */

export type Marca = 'Suvinil' | 'Coral' | 'Sherwin-Williams';

export interface Tinta {
  id: string;
  marca: Marca;
  nome: string;
  /** Código do fabricante, quando a fonte informa. */
  codigo?: string;
  hex: string;
  fonte: string;
}

export interface Loja {
  nome: string;
  endereco: string;
  telefone?: string;
  marcas: Marca[];
}

export const TINTAS: Tinta[] = [
  { id: 'sw7005', marca: 'Sherwin-Williams', nome: 'Pure White', codigo: 'SW 7005', hex: '#EDECE6', fonte: 'https://www.sherwin-williams.com/sherwinwilliams/SW7005-pure-white' },
  { id: 'sw9130', marca: 'Sherwin-Williams', nome: 'Evergreen Fog', codigo: 'SW 9130', hex: '#95978A', fonte: 'https://www.sherwin-williams.com/sherwinwilliams/SW9130-evergreen-fog' },
  { id: 'sw9081', marca: 'Sherwin-Williams', nome: 'Redend Point', codigo: 'SW 9081', hex: '#AE8E7E', fonte: 'https://www.sherwin-williams.com/sherwinwilliams/SW9081-redend-point' },
  { id: 'sw7701', marca: 'Sherwin-Williams', nome: 'Cavern Clay', codigo: 'SW 7701', hex: '#AC6B53', fonte: 'https://www.sherwin-williams.com/sherwinwilliams/SW7701-cavern-clay' },
  { id: 'sw7048', marca: 'Sherwin-Williams', nome: 'Urbane Bronze', codigo: 'SW 7048', hex: '#54504A', fonte: 'https://hextoral.com/hex-color/54504a/sherwin-williams/' },
  { id: 'sw7069', marca: 'Sherwin-Williams', nome: 'Iron Ore', codigo: 'SW 7069', hex: '#434341', fonte: 'https://www.sherwin-williams.com/sherwinwilliams/SW7069-iron-ore' },
  { id: 'sw6216', marca: 'Sherwin-Williams', nome: 'Jasper', codigo: 'SW 6216', hex: '#343B36', fonte: 'https://www.sherwin-williams.com/sherwinwilliams/SW6216-jasper' },
  { id: 'sw6244', marca: 'Sherwin-Williams', nome: 'Naval', codigo: 'SW 6244', hex: '#2F3D4C', fonte: 'https://www.sherwin-williams.com/sherwinwilliams/SW6244-naval' },
  { id: 'sw6258', marca: 'Sherwin-Williams', nome: 'Tricorn Black', codigo: 'SW 6258', hex: '#2F2F30', fonte: 'https://www.sherwin-williams.com/sherwinwilliams/SW6258-tricorn-black' },

  { id: 'suv-ourobranco', marca: 'Suvinil', nome: 'Ouro Branco', hex: '#DAD8D0', fonte: 'https://encycolorpedia.com/dad8d0' },
  { id: 'suv-cromio', marca: 'Suvinil', nome: 'Crômio', codigo: 'B161', hex: '#D1D0CA', fonte: 'https://en.tacolor.com/hex/d1d0ca/' },
  { id: 'suv-curry', marca: 'Suvinil', nome: 'Curry', codigo: 'E283', hex: '#D5A952', fonte: 'https://en.tacolor.com/hex/d5a952/' },
  { id: 'suv-tijolo', marca: 'Suvinil', nome: 'Tijolo', hex: '#C16C45', fonte: 'https://encycolorpedia.com/c16c45' },
  { id: 'suv-lenha', marca: 'Suvinil', nome: 'Lenha', hex: '#998377', fonte: 'https://encycolorpedia.com/998377' },
  { id: 'suv-cinzaclassico', marca: 'Suvinil', nome: 'Cinza Clássico', hex: '#878788', fonte: 'https://encycolorpedia.com/878788' },
  { id: 'suv-topodomundo', marca: 'Suvinil', nome: 'Topo do Mundo', hex: '#00818F', fonte: 'https://encycolorpedia.com/00818f' },
  { id: 'suv-pretoabsoluto', marca: 'Suvinil', nome: 'Preto Absoluto', hex: '#28292B', fonte: 'https://encycolorpedia.com/28292b' },

  { id: 'coral-currydourado', marca: 'Coral', nome: 'Curry Dourado (Cor do Ano 2025)', codigo: '40YY 49/546', hex: '#DAA937', fonte: 'https://coralmatiz.com.br/post/curry-dourado-e-a-cor-do-ano-2025-da-coral' },
];

/** Revendas em Porto Alegre encontradas na web (sites das lojas e guias). Confirme estoque por telefone. */
export const LOJAS: Loja[] = [
  { nome: 'Mafesa Tintas (Suvinil Select)', endereco: 'Av. São Pedro, 1341 – São Geraldo', marcas: ['Suvinil'] },
  { nome: 'Ferragem Porão (Suvinil Select)', endereco: 'Av. da Azenha, 1429 – Azenha', marcas: ['Suvinil'] },
  { nome: 'Amauri Tintas', endereco: 'Av. Dr. Carlos Barbosa, 1046 – Medianeira', marcas: ['Suvinil'] },
  { nome: 'Aquarela Tintas (loja Suvinil)', endereco: 'Av. João Wallig, 1800 – estacionamento do Shopping Iguatemi', marcas: ['Suvinil'] },
  { nome: 'Tintas MC', endereco: "Av. João Wallig, 231 – Passo d'Areia", marcas: ['Suvinil', 'Coral', 'Sherwin-Williams'] },
  { nome: 'Sul Cores Sertório', endereco: 'Av. Sertório, 5995 – Sarandi', telefone: '(51) 2122-0077', marcas: ['Coral'] },
  { nome: 'Sul Cores Ipanema', endereco: 'Av. Juca Batista, 701 – Ipanema', telefone: '(51) 3209-2545', marcas: ['Coral'] },
  { nome: 'Sherwin-Williams Cavalhada', endereco: 'Av. Juca Batista, 277 – Cavalhada', telefone: '(51) 3574-6455', marcas: ['Sherwin-Williams'] },
  { nome: 'Sherwin-Williams Vila Jardim', endereco: 'Av. Saturnino de Brito, 327 – Vila Jardim', telefone: '(51) 3574-6371', marcas: ['Sherwin-Williams'] },
];

export const lojasDa = (marca: Marca) => LOJAS.filter((l) => l.marcas.includes(marca));

export const linkMapa = (l: Loja) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.nome}, ${l.endereco}, Porto Alegre - RS`)}`;

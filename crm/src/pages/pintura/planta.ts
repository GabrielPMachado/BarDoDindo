import * as THREE from 'three';
import { criarCotas, m as fm } from './cotas';

/*
 * Plantas à mão do bar (escala 1:35): planta baixa com cotas, elétrica e hidráulica.
 * Tudo aqui está em metros e na linguagem da planta:
 *   d = distância a partir da parede da frente (rua), indo para o fundo (0 a 8,70);
 *   t = distância a partir da parede comprida do balcão (lateral esquerda de quem entra), indo para o salão;
 *   y = altura a partir do chão.
 * Onde o desenho não tem cota, a posição foi tirada proporcionalmente do papel.
 */

export const PLANTA = {
  comprimento: 8.7,
  larguraFrente: 4.46,
  larguraFundo: 4.36,
  /** Porta de 0,90 m na parede da frente, depois de 1,66 m a partir da parede do balcão. */
  porta: { t: 1.66, largura: 0.9 },
  /** Balcão de 4,90 × 1,66 m encostado na parede comprida, começando a 1,36 m da frente (8,70 − 7,34). */
  balcao: { d: 1.3, comprimento: 4.9, profundidade: 1.66, alturaTampo: 1.1, larguraTampo: 0.4 },
  /**
   * Projeto da bancada (doc "Projeto da bancada do bar", opção A — câmara fria):
   * corredor do bartender de 0,92, corpo de 0,60 com bancada de inox a 0,95, mureta de 0,14 até 1,06,
   * tampo de granito de 0,40 a 1,10 avançando 0,25 para o cliente, trave de 10 torneiras, pia na ponta
   * do fundo e caixa na lateral do lado da porta, com portinha de 0,70 colada na parede.
   */
  bancada: {
    corredor: 0.92, corpo: 0.6, mureta: 0.14, alturaBancada: 0.95, alturaMureta: 1.06, balanco: 0.25,
    trave: { inicio: 0.35, comprimento: 1.2, altura: 0.45, torneiras: 10 },
    pia: { comprimento: 0.65, cuba: [0.5, 0.4, 0.25] as const },
    camara: { comprimento: 4.25, altura: 0.91, portas: 5, barris: 10, passoBarril: 0.405, primeiroBarril: 0.3 },
    caixa: { fundura: 0.5, tampoD: 0.75, portinha: 0.7 },
    banquetas: { n: 8, passo: 0.6, primeira: 0.35, assento: 0.78 },
  },
  /** Salão de 6,20 × 2,70 m e área VIP de 2,50 m no fundo, aberta, com uma separação baixa. */
  salao: { comprimento: 6.2, largura: 2.7 },
  fundo: 2.5,
  /** Pé-direito e a canaleta de ferro da iluminação, presa por tirantes 30 cm abaixo do teto. */
  altura: 3.6,
  canaleta: { altura: 3.3, largura: 0.05 },
  separacaoVip: { t0: 0, t1: 2.2, altura: 1.0 },
  /** Piso da área VIP em pallets PBR (1,00 × 1,20 × 0,144): 2 andares, com degrau de 1 pallet na entrada. */
  palco: {
    pallet: { d: 1.0, t: 1.2, altura: 0.144 },
    andares: 2,
    folga: 0.03, // atrás das ripas da separação
    degrau: { t0: 2.35 }, // um pallet deitado na passagem, encostado no palco
  },
  /** Freezers encostados na frente, entre a parede do balcão e 0,92 m, com 0,75 m de fundura. */
  freezers: [{ t: 0, largura: 0.45 }, { t: 0.47, largura: 0.45 }],
  freezerFundura: 0.55,
  freezerAltura: 1.75,
  /** Pilares: canto da frente do lado do salão (0,70 × 0,50) e os dois do fundo (0,17 de saliência). */
  pilares: [
    { d: 0, t: 3.96, cd: 0.7, ct: 0.5 },
    { d: 8.53, t: 0, cd: 0.17, ct: 0.3 },
    { d: 8.53, t: 3.53, cd: 0.17, ct: 0.83 },
  ],
};

/** Todas as tomadas a 25 cm do chão. */
const ALT_10A = 0.25;
const ALT_20A = 0.25;

export type Camada = 'areas' | 'medidas' | 'pessoas' | 'eletrica' | 'iluminacao' | 'hidraulica';
export const CAMADAS: { id: Camada; nome: string }[] = [
  { id: 'areas', nome: 'Áreas e balcão' },
  { id: 'medidas', nome: 'Medidas' },
  { id: 'pessoas', nome: 'Pessoas 1,75 m' },
  { id: 'eletrica', nome: 'Elétrica' },
  { id: 'iluminacao', nome: 'Iluminação' },
  { id: 'hidraulica', nome: 'Hidráulica' },
];

/** Legenda das plantas, com as mesmas cores usadas no 3D. */
export const LEGENDA: Record<Camada, { cor: string; nome: string; forma?: 'linha' | 'ponto' | 'tracejado' | 'area' }[]> = {
  areas: [
    { cor: '#c4572a', nome: 'Balcão 4,90 × 1,66 m', forma: 'area' },
    { cor: '#5f8f6a', nome: 'Salão 6,20 × 2,70 m', forma: 'area' },
    { cor: '#7b6aa8', nome: 'Área VIP 2,50 m', forma: 'area' },
  ],
  eletrica: [
    { cor: '#e2a33b', nome: 'Tomada 20 A', forma: 'ponto' },
    { cor: '#f4f1ea', nome: 'Tomada 10 A', forma: 'ponto' },
    { cor: '#3d6fd6', nome: 'Fio 4 mm', forma: 'linha' },
    { cor: '#2a2a2a', nome: 'Fio 2,5 mm', forma: 'linha' },
    { cor: '#d63d8c', nome: 'Eletroduto 3/4 antichama', forma: 'linha' },
    { cor: '#6b7480', nome: 'Disjuntor trifásico 50 A (entrada 4 × 10 mm²)', forma: 'ponto' },
  ],
  pessoas: [{ cor: '#9aa3ad', nome: 'Bonecos de 1,75 m para sentir a escala (modo Decorado)', forma: 'ponto' }],
  medidas: [{ cor: '#7fd1ff', nome: 'Cotas em metros (as dos móveis aparecem no modo Decorado)', forma: 'linha' }],
  iluminacao: [
    { cor: '#3b3d40', nome: 'Canaleta de ferro no teto', forma: 'linha' },
    { cor: '#ffd36b', nome: 'Fiação da iluminação 2,5 mm (dentro da canaleta)', forma: 'linha' },
  ],
  hidraulica: [
    { cor: '#3aa0e8', nome: 'Ponto de água', forma: 'ponto' },
    { cor: '#8a7a6a', nome: 'Retorno da pia', forma: 'ponto' },
  ],
};

// pontos tirados das plantas (d em metros a partir da frente)
const TOMADAS_PAREDE_BALCAO = [2.09, 3.35, 4.47, 5.51];
const TOMADAS_FRENTE_BALCAO = [2.13, 3.35, 4.33, 5.41];
const TOMADAS_FUNDO = [0.49, 1.97, 3.44]; // t na parede do fundo
const TOMADAS_LATERAL = [2.01, 3.7, 5.33, 7.26]; // d na lateral do salão
const QUADRO = { d: 1.2, y: 1.6 };
const ILUMINACAO = { d0: 1.12, d1: 7.61, t0: 0.53, t1: 3.1 };
const PONTOS_AGUA = [1.7, 3.39, 5.38];
const AGUA_T = 1.51;
const RETORNO_T = 1.24;

/** Constrói os grupos de cada camada. `p` converte (d, t, y) da planta para a cena. */
export function criarCamadas(p: (d: number, t: number, y?: number) => THREE.Vector3) {
  const grupos = {} as Record<Camada, THREE.Group>;
  for (const c of CAMADAS) grupos[c.id] = new THREE.Group();
  const B = PLANTA.balcao;
  const L = PLANTA.comprimento;
  const larguraEm = (d: number) => PLANTA.larguraFrente + (PLANTA.larguraFundo - PLANTA.larguraFrente) * (d / L);

  const mat = (cor: string, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.5, ...extra });

  /** Cano/fio entre pontos, com juntas arredondadas. */
  const linha = (g: THREE.Group, pts: THREE.Vector3[], raio: number, m: THREE.Material) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = a.distanceTo(b);
      if (len < 1e-4) continue;
      const cil = new THREE.Mesh(new THREE.CylinderGeometry(raio, raio, len, 10), m);
      cil.position.copy(a).add(b).multiplyScalar(0.5);
      cil.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.add(cil);
    }
    for (const q of pts.slice(1, -1)) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(raio, 10, 8), m);
      s.position.copy(q);
      g.add(s);
    }
  };

  /** Eletroduto rosa com o fio da cor da bitola por dentro (fica visível pelo tubo translúcido). */
  const eletroduto = mat('#d63d8c', { transparent: true, opacity: 0.35, depthWrite: false });
  const fio4 = mat('#3d6fd6', { emissive: '#1d3f8a', emissiveIntensity: 0.4 });
  const fio25 = mat('#2a2a2a');
  const circuito = (pts: THREE.Vector3[], fio: THREE.Material) => {
    linha(grupos.eletrica, pts, 0.008, fio);
    linha(grupos.eletrica, pts, 0.02, eletroduto);
  };

  /** Etiqueta de texto que sempre olha para a câmera. */
  const etiqueta = (g: THREE.Group, texto: string, pos: THREE.Vector3, escala = 0.22, cor = '#ffffff', fundo = 'rgba(19,17,16,0.82)') => {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    const fonte = '600 44px system-ui, sans-serif';
    ctx.font = fonte;
    const w = Math.ceil(ctx.measureText(texto).width) + 36;
    c.width = w;
    c.height = 68;
    ctx.font = fonte;
    ctx.fillStyle = fundo;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, 68, 20);
    ctx.fill();
    ctx.fillStyle = cor;
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, 18, 36);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.renderOrder = 10;
    s.scale.set((escala * w) / 68, escala, 1);
    s.position.copy(pos);
    g.add(s);
    return s;
  };

  // ---------- Áreas e balcão ----------
  const area = (d0: number, d1: number, t0: number, t1: number, cor: string, texto: string, tTexto = (t0 + t1) / 2) => {
    const w = d1 - d0, h = t1 - t0;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(h, w), new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.22, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(p((d0 + d1) / 2, (t0 + t1) / 2, 0.006));
    grupos.areas.add(m);
    const borda = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: cor }));
    borda.rotation.copy(m.rotation);
    borda.position.copy(m.position);
    grupos.areas.add(borda);
    etiqueta(grupos.areas, texto, p((d0 + d1) / 2, tTexto, 0.05), 0.26, cor);
  };
  area(B.d, B.d + B.comprimento, 0, B.profundidade, '#c4572a', 'Balcão 4,90 × 1,66');
  area(0, PLANTA.salao.comprimento, PLANTA.larguraFrente - PLANTA.salao.largura, PLANTA.larguraFrente, '#5f8f6a', 'Salão 6,20 × 2,70', PLANTA.larguraFrente - 0.6);
  area(L - PLANTA.fundo, L, 0, PLANTA.larguraFundo, '#7b6aa8', 'Área VIP 2,50');
  // porta de 0,90 m
  area(0, 0.3, PLANTA.porta.t, PLANTA.porta.t + PLANTA.porta.largura, '#d9d4cb', 'Porta 0,90');

  // ---------- Medidas da sala ----------
  const cotasSala = criarCotas();
  grupos.medidas.add(cotasSala.grupo);
  {
    const { cota } = cotasSala;
    const y = 0.02;
    cota(p(0, 0.15, y), p(L, 0.15, y), `Parede do balcão ${fm(L)}`, 0.16);
    cota(p(0.15, 0, y + 2.9), p(0.15, PLANTA.larguraFrente, y + 2.9), `Frente ${fm(PLANTA.larguraFrente)}`, 0.16);
    cota(p(L - 0.15, 0, y + 2.9), p(L - 0.15, PLANTA.larguraFundo, y + 2.9), `Fundo ${fm(PLANTA.larguraFundo)}`, 0.16);
    cota(p(0, PLANTA.larguraFrente - 0.15, y), p(PLANTA.salao.comprimento, PLANTA.larguraFrente - 0.15, y), `Salão ${fm(PLANTA.salao.comprimento)}`, 0.14);
    cota(p(L - PLANTA.fundo, 2.6, y), p(L, 2.6, y), `Área VIP ${fm(PLANTA.fundo)}`, 0.14);
    cota(p(L - 0.3, 0, PLANTA.altura - 0.05), p(L - 0.3, 0, 0.0), `Pé-direito ${fm(PLANTA.altura)}`, 0.14);
  }

  // ---------- Elétrica ----------
  const placa = (pos: THREE.Vector3, normal: THREE.Vector3, amp: 10 | 20) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.025), mat(amp === 20 ? '#e2a33b' : '#f4f1ea', { emissive: amp === 20 ? '#7a4a10' : '#3a3a3a', emissiveIntensity: 0.5 }));
    m.position.copy(pos).addScaledVector(normal, 0.013);
    m.lookAt(m.position.clone().add(normal));
    grupos.eletrica.add(m);
    etiqueta(grupos.eletrica, `${amp} A`, pos.clone().addScaledVector(normal, 0.05).add(new THREE.Vector3(0, 0.15, 0)), 0.11, amp === 20 ? '#ffd28a' : '#ffffff');
  };
  const paraSalao = p(0, 1).sub(p(0, 0)).normalize(); // normal da parede do balcão
  const paraFrente = p(0, 0).sub(p(1, 0)).normalize();
  const paraBalcao = paraSalao.clone().negate();

  // quadro com o disjuntor trifásico de 50 A na parede do balcão, perto da frente
  const quadro = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.36), mat('#6b7480', { metalness: 0.6, roughness: 0.4 }));
  quadro.position.copy(p(QUADRO.d, 0.05, QUADRO.y));
  grupos.eletrica.add(quadro);
  etiqueta(grupos.eletrica, 'Disjuntor trifásico 50 A', p(QUADRO.d + 0.4, 0.35, QUADRO.y + 0.42), 0.13);
  // entrada da rede: 4 fios de 10 mm² vindos da rua, pelo alto da parede
  linha(grupos.eletrica, [p(-0.05, 0.06, 2.9), p(QUADRO.d, 0.06, 2.9), p(QUADRO.d, 0.06, QUADRO.y + 0.25)], 0.022, mat('#1f2d6b'));
  etiqueta(grupos.eletrica, 'Entrada trifásica 4 × 10 mm²', p(0.55, 0.15, 3.05), 0.12);

  // 20 A na parede do balcão (fio 4 mm)
  const altParede = ALT_20A;
  circuito([p(QUADRO.d, 0.03, QUADRO.y - 0.25), p(QUADRO.d, 0.03, altParede), p(TOMADAS_PAREDE_BALCAO.at(-1)!, 0.03, altParede)], fio4);
  for (const d of TOMADAS_PAREDE_BALCAO) placa(p(d, 0, altParede), paraSalao, 20);
  // 20 A na frente do balcão, pelo piso até a base do balcão (fio 4 mm)
  const tBase = PLANTA.bancada.corredor; // face do balcão virada para o bartender
  const altBalcao = ALT_20A;
  circuito([p(QUADRO.d + 0.06, 0.03, QUADRO.y - 0.25), p(QUADRO.d + 0.06, 0.03, 0.03), p(B.d, 0.03, 0.03), p(B.d, tBase - 0.03, 0.03), p(TOMADAS_FRENTE_BALCAO.at(-1)!, tBase - 0.03, 0.03)], fio4);
  for (const d of TOMADAS_FRENTE_BALCAO) {
    circuito([p(d, tBase - 0.03, 0.03), p(d, tBase - 0.03, altBalcao)], fio4);
    placa(p(d, tBase, altBalcao), paraBalcao, 20);
  }
  // 20 A dos freezers, na parede da frente ao lado deles, pelo alto da parede
  const tFreezer = 1.2;
  circuito([p(QUADRO.d - 0.06, 0.03, QUADRO.y + 0.25), p(QUADRO.d - 0.06, 0.03, 2.6), p(0.03, 0.03, 2.6), p(0.03, tFreezer, 2.6), p(0.03, tFreezer, ALT_20A)], fio4);
  placa(p(0, tFreezer, ALT_20A), paraFrente.clone().negate(), 20);

  // 10 A no fundo e na lateral do salão, rodando pela parede do balcão e pelo fundo (fio 2,5 mm)
  const dFundo = L - 0.03;
  const tLateral = (d: number) => larguraEm(d) - 0.03;
  circuito([
    p(QUADRO.d - 0.12, 0.03, QUADRO.y - 0.25), p(QUADRO.d - 0.12, 0.03, 0.15), p(dFundo, 0.03, 0.15),
    p(dFundo, tLateral(dFundo), 0.15), p(TOMADAS_LATERAL[0], tLateral(TOMADAS_LATERAL[0]), 0.15),
  ], fio25);
  for (const t of TOMADAS_FUNDO) {
    circuito([p(dFundo, t, 0.15), p(dFundo, t, ALT_10A)], fio25);
    placa(p(L, t, ALT_10A), paraFrente, 10);
  }
  for (const d of TOMADAS_LATERAL) {
    circuito([p(d, tLateral(d), 0.15), p(d, tLateral(d), ALT_10A)], fio25);
    placa(p(d, larguraEm(d), ALT_10A), paraBalcao, 10);
  }

  // ---------- Iluminação: canaleta de ferro presa no teto, por onde passa a fiação das luzes ----------
  // A canaleta faz parte da loja (fica sempre à mostra); a camada só acende a fiação por dentro dela.
  const fixos = new THREE.Group();
  const ferro = mat('#3b3d40', { metalness: 0.75, roughness: 0.45 });
  const yI = PLANTA.canaleta.altura;
  const lado = PLANTA.canaleta.largura;
  const I = ILUMINACAO;
  const anel = [p(I.d0, I.t0, yI), p(I.d1, I.t0, yI), p(I.d1, I.t1, yI), p(I.d0, I.t1, yI), p(I.d0, I.t0, yI)];
  const subida = [p(QUADRO.d, lado / 2 + 0.01, QUADRO.y + 0.25), p(QUADRO.d, lado / 2 + 0.01, yI), p(I.d0, I.t0, yI)];
  /** Perfil quadrado de ferro entre dois pontos, com as pontas sobrepostas nos cantos. */
  const perfil = (a: THREE.Vector3, b: THREE.Vector3) => {
    const len = a.distanceTo(b) + lado;
    const vertical = Math.abs(a.y - b.y) > 1e-3;
    const m = new THREE.Mesh(vertical ? new THREE.BoxGeometry(lado, len, lado) : new THREE.BoxGeometry(lado, lado, len), ferro);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    if (!vertical) m.lookAt(new THREE.Vector3(b.x, m.position.y, b.z));
    fixos.add(m);
  };
  for (const trecho of [anel, subida]) for (let i = 0; i < trecho.length - 1; i++) perfil(trecho[i], trecho[i + 1]);
  // tirantes que prendem a canaleta no teto, a cada 1,20 m mais ou menos
  const tirante = new THREE.CylinderGeometry(0.005, 0.005, PLANTA.altura - yI, 6);
  for (let i = 0; i < anel.length - 1; i++) {
    const a = anel[i], b = anel[i + 1];
    const n = Math.max(1, Math.round(a.distanceTo(b) / 1.2));
    for (let k = 0; k < n; k++) {
      const q = a.clone().lerp(b, (k + 0.5) / n);
      const t = new THREE.Mesh(tirante, ferro);
      t.position.set(q.x, (PLANTA.altura + yI) / 2, q.z);
      fixos.add(t);
    }
  }
  // fiação da iluminação aparecendo na face de baixo da canaleta
  const ilum = mat('#ffd36b', { emissive: '#ffb020', emissiveIntensity: 0.9 });
  const descer = (v: THREE.Vector3) => v.clone().add(new THREE.Vector3(0, -lado / 2 - 0.004, 0));
  linha(grupos.iluminacao, anel.map(descer), 0.008, ilum);
  linha(grupos.iluminacao, [subida[0], subida[1]].map((v) => v.clone().add(paraSalao.clone().multiplyScalar(lado / 2 + 0.004))), 0.008, ilum);
  linha(grupos.iluminacao, [subida[1], subida[2]].map(descer), 0.008, ilum);
  etiqueta(grupos.iluminacao, 'Canaleta de ferro com a fiação 2,5 mm', p(I.d1 - 1.4, I.t1, yI - 0.18), 0.14, '#ffe2a0');

  // ---------- Hidráulica: água entrando pela frente e retorno das pias saindo pela frente ----------
  const agua = mat('#3aa0e8', { roughness: 0.3 });
  const retorno = mat('#8a7a6a');
  linha(grupos.hidraulica, [p(-0.1, AGUA_T, 0.03), p(PONTOS_AGUA.at(-1)!, AGUA_T, 0.03)], 0.016, agua);
  linha(grupos.hidraulica, [p(-0.1, RETORNO_T, 0.04), p(PONTOS_AGUA.at(-1)!, RETORNO_T, 0.04)], 0.025, retorno);
  for (const d of PONTOS_AGUA) {
    linha(grupos.hidraulica, [p(d, AGUA_T, 0.03), p(d, AGUA_T, 0.6)], 0.016, agua);
    const registro = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 8, 20), agua);
    registro.rotation.x = Math.PI / 2;
    registro.position.copy(p(d, AGUA_T, 0.6));
    grupos.hidraulica.add(registro);
    const ralo = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), retorno);
    ralo.position.copy(p(d, RETORNO_T, 0.05));
    grupos.hidraulica.add(ralo);
    etiqueta(grupos.hidraulica, 'Água', p(d, AGUA_T, 0.78), 0.1, '#bfe3ff');
    etiqueta(grupos.hidraulica, 'Retorno', p(d, RETORNO_T, 0.25), 0.1, '#e6dccf');
  }
  // setas do sentido: água vai para o fundo, retorno volta para a frente
  for (const d of [1.0, 2.6, 4.4]) {
    const seta = (t: number, y: number, m: THREE.Material, paraFundo: boolean) => {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 12), m);
      c.position.copy(p(d, t, y + 0.02));
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), paraFundo ? paraFrente.clone().negate() : paraFrente);
      grupos.hidraulica.add(c);
    };
    seta(AGUA_T, 0.03, agua, true);
    seta(RETORNO_T, 0.04, retorno, false);
  }

  return { camadas: grupos, fixos };
}

/** Altura do piso num ponto (d, t) da planta: 0 no salão, 1 pallet no degrau, 2 pallets na área VIP. */
export function alturaPiso(d: number, t: number) {
  const P = PLANTA.palco;
  const inicio = PLANTA.comprimento - PLANTA.fundo + P.folga;
  if (d >= inicio) return P.andares * P.pallet.altura;
  if (d >= inicio - P.pallet.d && t >= P.degrau.t0 && t <= P.degrau.t0 + P.pallet.t) return P.pallet.altura;
  return 0;
}

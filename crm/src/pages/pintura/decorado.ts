import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PLANTA } from './planta';

/*
 * Modo "Decorado": a loja montada como bar, sobre as medidas da planta.
 * Tudo aqui é sugestão de ambientação (móveis, luminárias, garrafas), não vem do papel:
 * banquetas no balcão, cristaleira com garrafas na parede, chopeira, mesas com banco
 * estofado na lateral do salão, sofás e mesa de centro na área VIP, spots na canaleta e pendentes.
 */

type P = (d: number, t: number, y?: number) => THREE.Vector3;

const LUZ_QUENTE = '#ffc98a';

export interface Decorado {
  grupo: THREE.Group;
  /** Liga/desliga o modo e ajusta luz, sombras e reflexos da cena. */
  ligar: (ligado: boolean) => void;
  destruir: () => void;
}

export function criarDecorado(p: P, scene: THREE.Scene, renderer: THREE.WebGLRenderer, luzesBase: THREE.Light[]): Decorado {
  const g = new THREE.Group();
  g.visible = false;
  const L = PLANTA.comprimento;
  const H = PLANTA.altura;
  const B = PLANTA.balcao;
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];

  const m = (cor: string, extra: THREE.MeshPhysicalMaterialParameters = {}) => {
    const x = new THREE.MeshPhysicalMaterial({ color: cor, roughness: 0.6, ...extra });
    mats.push(x);
    return x;
  };
  const malha = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: THREE.Vector3, sombra = true) => {
    geos.push(geo);
    const o = new THREE.Mesh(geo, mat);
    o.position.copy(pos);
    o.castShadow = sombra;
    o.receiveShadow = true;
    g.add(o);
    return o;
  };
  /** Caixa pelos limites da planta: d e t em metros, y de baixo para cima. */
  const caixa = (d0: number, d1: number, t0: number, t1: number, y0: number, y1: number, mat: THREE.Material, sombra = true) => {
    const a = p(d0, t0, y0), b = p(d1, t1, y1);
    return malha(new THREE.BoxGeometry(Math.abs(b.x - a.x), Math.abs(b.y - a.y), Math.abs(b.z - a.z)), mat, a.clone().add(b).multiplyScalar(0.5), sombra);
  };
  const cilindro = (d: number, t: number, y0: number, y1: number, r0: number, mat: THREE.Material, r1 = r0, lados = 20) =>
    malha(new THREE.CylinderGeometry(r1, r0, y1 - y0, lados), mat, p(d, t, (y0 + y1) / 2));

  // ---------- materiais ----------
  const carvalho = m('#7a5236', { roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  const nogueira = m('#4a2f1f', { roughness: 0.5, clearcoat: 0.4 });
  const ferroPreto = m('#1c1d1f', { metalness: 0.8, roughness: 0.35 });
  const latao = m('#c9a25a', { metalness: 1, roughness: 0.25 });
  const inox = m('#c8ccd0', { metalness: 1, roughness: 0.18 });
  const granito = m('#1f1d1c', { roughness: 0.18, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  const couro = m('#5c2a22', { roughness: 0.45, sheen: 0.6, sheenColor: new THREE.Color('#a0574a') });
  const veludo = m('#23443a', { roughness: 0.85, sheen: 1, sheenColor: new THREE.Color('#5f9a84') });
  const tapete = m('#7a3b2a', { roughness: 1 });
  const folha = m('#2f6b3a', { roughness: 0.8 });
  const vaso = m('#b8a48a', { roughness: 0.9 });
  const lampada = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: LUZ_QUENTE, emissiveIntensity: 4 });
  mats.push(lampada);

  // ---------- balcão: frente em ripas de madeira, rodapé de latão e apoio de pés ----------
  const tFrente = B.profundidade; // face do balcão virada para o salão
  for (let d = B.d + 0.04; d < B.d + B.comprimento - 0.03; d += 0.07) caixa(d, d + 0.05, tFrente - 0.01, tFrente + 0.025, 0.08, B.alturaTampo - 0.06, carvalho, false);
  caixa(B.d, B.d + B.comprimento, tFrente, tFrente + 0.03, 0, 0.08, ferroPreto, false);
  // apoio de pés de latão
  const apoio = malha(new THREE.CylinderGeometry(0.018, 0.018, B.comprimento, 12), latao, p(B.d + B.comprimento / 2, tFrente + 0.18, 0.25));
  apoio.rotation.x = Math.PI / 2;
  for (let d = B.d + 0.3; d < B.d + B.comprimento; d += 1.2) caixa(d - 0.01, d + 0.01, tFrente + 0.02, tFrente + 0.18, 0.24, 0.26, latao, false);

  // ---------- chopeira com 4 torneiras no tampo ----------
  const dChope = B.d + 2.2;
  const tChope = B.profundidade - B.larguraTampo / 2;
  cilindro(dChope, tChope, B.alturaTampo, B.alturaTampo + 0.42, 0.045, inox);
  const barra = malha(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 16), inox, p(dChope, tChope, B.alturaTampo + 0.42));
  barra.rotation.x = Math.PI / 2;
  for (const k of [-0.22, -0.075, 0.075, 0.22]) {
    cilindro(dChope + k, tChope - 0.07, B.alturaTampo + 0.28, B.alturaTampo + 0.42, 0.012, inox);
    cilindro(dChope + k, tChope - 0.07, B.alturaTampo + 0.42, B.alturaTampo + 0.56, 0.014, nogueira, 0.01, 8);
  }
  caixa(dChope - 0.32, dChope + 0.32, tChope - 0.16, tChope + 0.02, B.alturaTampo, B.alturaTampo + 0.02, inox, false);
  // copos no tampo
  const vidro = m('#e8f2f5', { roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.35, depthWrite: false });
  for (const [d, t] of [[B.d + 0.8, tFrente - 0.15], [B.d + 3.4, tFrente - 0.12], [B.d + 3.55, tFrente - 0.2], [B.d + 4.3, tFrente - 0.14]]) {
    cilindro(d, t, B.alturaTampo, B.alturaTampo + 0.16, 0.032, vidro, 0.038, 16);
  }

  // ---------- parede do balcão: bancada de trabalho em inox e cristaleira com garrafas ----------
  const dB0 = B.d + 0.4, dB1 = B.d + B.comprimento - 0.3;
  caixa(dB0, dB1, 0, 0.55, 0, 0.88, nogueira);
  caixa(dB0, dB1, 0, 0.58, 0.88, 0.92, inox);
  // painel de madeira atrás das prateleiras
  caixa(dB0, dB1, 0.001, 0.02, 1.2, 2.55, nogueira, false);
  const cores = ['#6b3a12', '#2f5d2a', '#a8661a', '#d9c9a0', '#3d1f12', '#8a1f1f', '#1f3a5a', '#c2a35a'];
  const vidros = cores.map((c) => m(c, { roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }));
  const fitaLed = new THREE.MeshStandardMaterial({ color: '#ffe0b0', emissive: LUZ_QUENTE, emissiveIntensity: 2.5 });
  mats.push(fitaLed);
  let semente = 7;
  const aleatorio = () => ((semente = (semente * 9301 + 49297) % 233280) / 233280);
  for (const y of [1.3, 1.72, 2.14]) {
    caixa(dB0, dB1, 0.02, 0.3, y - 0.035, y, carvalho);
    caixa(dB0, dB1, 0.26, 0.28, y - 0.045, y - 0.035, fitaLed, false); // LED sob a prateleira
    for (let d = dB0 + 0.08; d < dB1 - 0.05; d += 0.085 + aleatorio() * 0.04) {
      const alta = 0.24 + aleatorio() * 0.1;
      const mt = vidros[Math.floor(aleatorio() * vidros.length)];
      const t = 0.1 + aleatorio() * 0.1;
      cilindro(d, t, y, y + alta, 0.034, mt, 0.034, 14);
      cilindro(d, t, y + alta, y + alta + 0.03, 0.034, mt, 0.012, 14);
      cilindro(d, t, y + alta + 0.03, y + alta + 0.09, 0.012, mt, 0.012, 8);
      cilindro(d, t, y + alta + 0.09, y + alta + 0.11, 0.014, ferroPreto, 0.014, 8);
    }
  }
  // letreiro em neon na parede do balcão
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.font = 'italic 700 150px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ff7a3d';
  ctx.shadowBlur = 40;
  ctx.fillStyle = '#ffd2b0';
  for (let i = 0; i < 3; i++) ctx.fillText('Bar do Dindo', 512, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const neonMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
  mats.push(neonMat);
  const neon = malha(new THREE.PlaneGeometry(2.2, 0.55), neonMat, p((dB0 + dB1) / 2, 0.03, 2.95), false);
  neon.rotation.y = Math.PI / 2;
  const brilhoNeon = new THREE.PointLight('#ff8a4a', 1.2, 3, 2);
  brilhoNeon.position.copy(p((dB0 + dB1) / 2, 0.4, 2.95));
  g.add(brilhoNeon);

  // ---------- banquetas no balcão ----------
  for (let d = B.d + 0.35; d < B.d + B.comprimento - 0.2; d += 0.62) {
    const t = tFrente + 0.42;
    cilindro(d, t, 0.74, 0.79, 0.19, couro, 0.2, 28);
    cilindro(d, t, 0.7, 0.74, 0.17, ferroPreto, 0.17, 20);
    cilindro(d, t, 0.05, 0.7, 0.025, ferroPreto, 0.025, 10);
    cilindro(d, t, 0, 0.03, 0.2, ferroPreto, 0.2, 24);
    const anel = malha(new THREE.TorusGeometry(0.15, 0.012, 8, 28), latao, p(d, t, 0.28));
    anel.rotation.x = Math.PI / 2;
  }

  // ---------- salão: banco estofado na parede e mesas para dois ----------
  const tParede = PLANTA.larguraFrente;
  const dS0 = 1.0, dS1 = PLANTA.salao.comprimento - 0.25;
  caixa(dS0, dS1, tParede - 0.5, tParede - 0.02, 0, 0.42, nogueira);
  caixa(dS0, dS1, tParede - 0.5, tParede - 0.04, 0.42, 0.5, veludo);
  caixa(dS0, dS1, tParede - 0.14, tParede - 0.03, 0.5, 1.0, veludo);
  // botões do capitonê no encosto
  for (let d = dS0 + 0.15; d < dS1; d += 0.3) for (const y of [0.65, 0.85]) malha(new THREE.SphereGeometry(0.012, 8, 6), latao, p(d, tParede - 0.15, y), false);
  for (const d of [1.6, 2.85, 4.1, 5.35]) {
    const t = tParede - 0.95;
    caixa(d - 0.33, d + 0.33, t - 0.33, t + 0.33, 0.72, 0.76, carvalho);
    cilindro(d, t, 0.03, 0.72, 0.03, ferroPreto, 0.03, 10);
    caixa(d - 0.22, d + 0.22, t - 0.22, t + 0.22, 0, 0.03, ferroPreto);
    // cadeira do lado do corredor, virada para a parede
    const tc = t - 0.62;
    caixa(d - 0.2, d + 0.2, tc - 0.2, tc + 0.2, 0.44, 0.48, carvalho);
    caixa(d - 0.2, d + 0.2, tc - 0.2, tc - 0.17, 0.48, 0.88, carvalho);
    for (const [a, b] of [[-0.17, -0.17], [-0.17, 0.17], [0.17, -0.17], [0.17, 0.17]]) caixa(d + a - 0.015, d + a + 0.015, tc + b - 0.015, tc + b + 0.015, 0, 0.44, ferroPreto);
    // vela e cardápio na mesa
    cilindro(d + 0.1, t, 0.76, 0.84, 0.025, vidro, 0.03, 12);
    malha(new THREE.SphereGeometry(0.012, 8, 6), lampada, p(d + 0.1, t, 0.8), false);
    caixa(d - 0.2, d - 0.05, t - 0.1, t + 0.1, 0.76, 0.765, couro, false);
  }

  // ---------- área VIP: sofás em L, mesa de centro, tapete e planta ----------
  const dV0 = L - PLANTA.fundo + 0.35, dV1 = L - 0.18;
  const tV0 = 1.6, tV1 = PLANTA.larguraFundo - 0.05;
  caixa(dV0 + 0.2, dV1 - 0.1, tV0 + 0.1, tV1 - 0.95, 0, 0.012, tapete, false);
  // sofá encostado no fundo
  caixa(dV1 - 0.75, dV1, tV0, tV1 - 0.15, 0, 0.42, couro);
  caixa(dV1 - 0.2, dV1, tV0, tV1 - 0.15, 0.42, 0.85, couro);
  // sofá na lateral
  caixa(dV0, dV1 - 0.75, tV1 - 0.8, tV1, 0, 0.42, couro);
  caixa(dV0, dV1, tV1 - 0.2, tV1, 0.42, 0.85, couro);
  for (const t of [tV0 + 0.35, tV0 + 0.95]) caixa(dV1 - 0.32, dV1 - 0.2, t - 0.2, t + 0.2, 0.42, 0.78, veludo); // almofadas
  // mesa de centro com tampo de granito
  caixa(dV0 + 0.45, dV1 - 0.95, tV0 + 0.35, tV1 - 1.15, 0.4, 0.44, granito);
  caixa(dV0 + 0.55, dV1 - 1.05, tV0 + 0.45, tV1 - 1.25, 0, 0.4, ferroPreto);
  // balde de gelo com espumante
  cilindro((dV0 + dV1 - 0.5) / 2, (tV0 + tV1 - 0.8) / 2, 0.44, 0.64, 0.09, inox, 0.11, 24);
  cilindro((dV0 + dV1 - 0.5) / 2, (tV0 + tV1 - 0.8) / 2, 0.6, 0.78, 0.035, vidros[1], 0.035, 14);
  // planta no canto
  cilindro(dV1 - 0.25, 0.3, 0, 0.45, 0.16, vaso, 0.2, 24);
  for (const [dd, tt, yy, r] of [[0, 0, 0.75, 0.28], [0.1, 0.08, 1.0, 0.22], [-0.08, -0.05, 1.15, 0.18]]) {
    malha(new THREE.IcosahedronGeometry(r, 1), folha, p(dV1 - 0.25 + dd, 0.3 + tt, yy));
  }
  // planta perto da porta
  cilindro(0.95, PLANTA.larguraFrente - 0.3, 0, 0.5, 0.14, vaso, 0.17, 24);
  malha(new THREE.IcosahedronGeometry(0.25, 1), folha, p(0.95, PLANTA.larguraFrente - 0.3, 0.8));

  // ---------- luminárias: spots na canaleta e pendentes sobre o balcão ----------
  const canaleta = PLANTA.canaleta.altura;
  const luzes: THREE.Light[] = [];
  const spot = (d: number, t: number, comLuz: boolean, sombra: boolean) => {
    const corpo = malha(new THREE.CylinderGeometry(0.045, 0.05, 0.14, 16), ferroPreto, p(d, t, canaleta - 0.1), false);
    corpo.rotation.z = 0.25;
    malha(new THREE.CircleGeometry(0.04, 16), lampada, p(d, t, canaleta - 0.172), false).rotation.x = Math.PI / 2;
    if (!comLuz) return;
    const s = new THREE.SpotLight(LUZ_QUENTE, 9, 7, 0.55, 0.6, 1.6);
    s.position.copy(p(d, t, canaleta - 0.18));
    s.target.position.copy(p(d, t + 0.15, 0));
    s.castShadow = sombra;
    s.shadow.mapSize.set(1024, 1024);
    s.shadow.bias = -0.0004;
    g.add(s, s.target);
    luzes.push(s);
  };
  const I = { d0: 1.12, d1: 7.61, t0: 0.53, t1: 3.1 };
  [1.7, 3.0, 4.3, 5.6, 6.9].forEach((d, i) => spot(d, I.t1, true, i === 1 || i === 3));
  [1.7, 3.0, 4.3, 5.6, 6.9].forEach((d) => spot(d, I.t0, d > 6, false));
  // pendentes com lâmpada de filamento sobre o balcão
  for (const d of [B.d + 0.9, B.d + 2.45, B.d + 4.0]) {
    const t = B.profundidade - B.larguraTampo / 2;
    cilindro(d, t, 2.05, H, 0.004, ferroPreto, 0.004, 6);
    malha(new THREE.ConeGeometry(0.17, 0.2, 28, 1, true), latao, p(d, t, 1.98), false);
    malha(new THREE.SphereGeometry(0.055, 16, 12), lampada, p(d, t, 1.9), false);
    const l = new THREE.PointLight(LUZ_QUENTE, 2.2, 4, 1.8);
    l.position.copy(p(d, t, 1.85));
    g.add(l);
    luzes.push(l);
  }
  // pendente sobre a mesa de centro da área VIP
  {
    const d = (dV0 + dV1 - 0.5) / 2, t = (tV0 + tV1 - 0.8) / 2;
    cilindro(d, t, 1.75, H, 0.004, ferroPreto, 0.004, 6);
    malha(new THREE.SphereGeometry(0.2, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), latao, p(d, t, 1.72), false).rotation.x = Math.PI;
    malha(new THREE.SphereGeometry(0.05, 12, 8), lampada, p(d, t, 1.62), false);
    const l = new THREE.PointLight(LUZ_QUENTE, 2.5, 4, 1.8);
    l.position.copy(p(d, t, 1.55));
    g.add(l);
  }

  scene.add(g);

  // reflexos: ambiente de estúdio gerado na hora (sem baixar imagens)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const intensidadeBase = luzesBase.map((l) => l.intensity);

  const ligar = (ligado: boolean) => {
    g.visible = ligado;
    // sombras pesam no celular: só no computador
    renderer.shadowMap.enabled = ligado && !window.matchMedia('(pointer: coarse)').matches;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene.environment = ligado ? ambiente : null;
    scene.environmentIntensity = 0.35;
    // clima de bar: luz geral mais baixa, quem ilumina são os spots e pendentes
    luzesBase.forEach((l, i) => (l.intensity = intensidadeBase[i] * (ligado ? 0.45 : 1)));
    renderer.toneMappingExposure = ligado ? 1.15 : 1.05;
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.Material) o.material.needsUpdate = true;
      if (o instanceof THREE.Mesh && !g.children.includes(o)) o.receiveShadow = true;
    });
  };

  return {
    grupo: g,
    ligar,
    destruir: () => {
      geos.forEach((x) => x.dispose());
      mats.forEach((x) => x.dispose());
      tex.dispose();
      ambiente.dispose();
      pmrem.dispose();
    },
  };
}

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLANTA } from './planta';
import { criarCotas, m as fm } from './cotas';

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
  /** Cotas dos móveis, do balcão e das passagens. */
  medidas: THREE.Group;
  /** Bonecos de 1,75 m para dar a escala. */
  pessoas: THREE.Group;
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
  const tapete = m('#7a3b2a', { roughness: 1 });
  const folha = m('#2f6b3a', { roughness: 0.8 });
  const vaso = m('#b8a48a', { roughness: 0.9 });
  const lampada = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: LUZ_QUENTE, emissiveIntensity: 4 });
  mats.push(lampada);
  const vidrosCor = ['#6b3a12', '#2f5d2a', '#a8661a', '#8a1f1f', '#1f3a5a', '#c2a35a'].map((c) => m(c, { roughness: 0.4, clearcoat: 0.6 }));

  // ---------- balcão do projeto (opção A — câmara fria) ----------
  const BC = PLANTA.bancada;
  const d0 = B.d, d1 = B.d + B.comprimento; // ponta da porta → ponta do fundo
  const tC = BC.corredor; // face do bartender
  const tM = tC + BC.corpo; // começo da mureta
  const tF = B.profundidade; // face do cliente (ripado)
  const tT = tF + BC.balanco; // borda do tampo
  const pu = m('#d9dcdf', { metalness: 0.35, roughness: 0.4 }); // painel da câmara
  const borracha = m('#2a2c2e', { roughness: 0.9 });
  const barril = m('#b9bdc1', { metalness: 0.9, roughness: 0.3 });
  const cimenticia = m('#8d8a85', { roughness: 0.95 });
  const ledTampo = new THREE.MeshStandardMaterial({ color: '#ffe0b0', emissive: LUZ_QUENTE, emissiveIntensity: 3 });
  mats.push(ledTampo);

  // câmara fria (4,25) e módulo da pia (0,65), com bancada de inox a 0,95
  const dCam = d0 + BC.camara.comprimento;
  caixa(d0, dCam, tC + 0.01, tM, 0.03, BC.camara.altura, pu);
  caixa(dCam, d1, tC + 0.01, tM, 0.03, BC.camara.altura, inox);
  caixa(d0, d1, tC, tM, BC.camara.altura, BC.alturaBancada, inox);
  caixa(d0, d1, tC + 0.04, tM, 0, 0.1, borracha, false); // rodapé recuado
  // 5 portas da câmara do lado do bartender; a segunda fica aberta mostrando os barris
  const larguraPorta = BC.camara.comprimento / BC.camara.portas;
  for (let k = 0; k < BC.camara.portas; k++) {
    const a = d0 + k * larguraPorta + 0.02, b = a + larguraPorta - 0.04;
    if (k === 1) {
      const porta = caixa(a, b, tC - 0.03, tC, 0.13, 0.85, pu);
      // gira a porta 100° pela dobradiça (lado da porta do bar)
      const dobradica = p(a, tC, 0);
      porta.position.sub(dobradica).applyAxisAngle(new THREE.Vector3(0, 1, 0), (-100 * Math.PI) / 180).add(dobradica);
      porta.rotation.y = (-100 * Math.PI) / 180;
    } else {
      caixa(a, b, tC - 0.02, tC, 0.13, 0.85, pu);
      caixa(b - 0.08, b - 0.05, tC - 0.05, tC - 0.02, 0.4, 0.62, inox, false); // puxador
    }
  }
  // interior escuro da câmara e os 10 barris de 50 L
  caixa(d0 + 0.05, dCam - 0.05, tC + 0.04, tM - 0.05, 0.08, 0.84, m('#3a3f44', { roughness: 0.6 }), false);
  for (let k = 0; k < BC.camara.barris; k++) {
    const d = d0 + BC.camara.primeiroBarril + k * BC.camara.passoBarril;
    const t = (tC + tM) / 2;
    cilindro(d, t, 0.1, 0.69, 0.2, barril, 0.2, 24);
    malha(new THREE.TorusGeometry(0.2, 0.012, 6, 24), barril, p(d, t, 0.2)).rotation.x = Math.PI / 2;
    malha(new THREE.TorusGeometry(0.2, 0.012, 6, 24), barril, p(d, t, 0.59)).rotation.x = Math.PI / 2;
    cilindro(d, t, 0.69, 0.74, 0.04, ferroPreto, 0.04, 12); // válvula extratora
  }
  // pia: cuba de inox embutida na bancada, com torneira
  const dPia = d1 - BC.pia.comprimento / 2, tPia = (tC + tM) / 2;
  caixa(dPia - BC.pia.cuba[0] / 2, dPia + BC.pia.cuba[0] / 2, tPia - BC.pia.cuba[1] / 2, tPia + BC.pia.cuba[1] / 2, BC.alturaBancada - 0.005, BC.alturaBancada + 0.002, m('#5f6469', { metalness: 1, roughness: 0.3 }), false);
  cilindro(dPia, tM - 0.06, BC.alturaBancada, BC.alturaBancada + 0.32, 0.012, inox);
  const bica = malha(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 10), inox, p(dPia, tM - 0.15, BC.alturaBancada + 0.32));
  bica.rotation.x = Math.PI / 2;

  // mureta de 0,14 até 1,06 (chapa cimentícia) com ripado de 4 × 2 cm, vão de 2 cm, na frente
  caixa(d0, d1, tM, tF, 0, BC.alturaMureta, cimenticia);
  for (let d = d0 + 0.01; d < d1 - 0.03; d += 0.06) caixa(d, d + 0.04, tF, tF + 0.02, 0.1, BC.alturaMureta, carvalho, false);
  caixa(d0 + 0.02, d1 - 0.02, tF - 0.03, tF - 0.01, 0, 0.1, ferroPreto, false); // rodapé escuro recuado 0,03

  // tampo de granito de 0,40, a 1,10, avançando 0,25 para o cliente, com LED embaixo da borda
  caixa(d0 - 0.03, d1 + 0.03, tT - B.larguraTampo, tT, BC.alturaMureta, B.alturaTampo, granito);
  caixa(d0, d1, tT - 0.06, tT - 0.04, BC.alturaMureta - 0.012, BC.alturaMureta, ledTampo, false);

  // apoio de pés: tubo de 1 1/4" a 0,25 do piso e 0,08 da mureta, com 5 suportes a cada 1,20
  const tApoio = tF + 0.02 + 0.08;
  const apoio = malha(new THREE.CylinderGeometry(0.016, 0.016, 4.8, 12), latao, p((d0 + d1) / 2, tApoio, 0.25));
  apoio.rotation.x = Math.PI / 2;
  for (let k = 0; k < 5; k++) {
    const d = (d0 + d1) / 2 - 2.4 + k * 1.2;
    caixa(d - 0.01, d + 0.01, tF + 0.02, tApoio, 0.24, 0.26, latao, false);
  }

  // trave de 1,20 com 10 torneiras, de 1,10 a 1,55, começando a 0,35 da ponta da porta
  const tr = BC.trave;
  const dT0 = d0 + tr.inicio, dT1 = dT0 + tr.comprimento;
  const tTrave = tM + 0.04;
  for (const d of [dT0, dT1]) caixa(d - 0.03, d + 0.03, tTrave - 0.03, tTrave + 0.03, B.alturaTampo, B.alturaTampo + tr.altura, inox);
  caixa(dT0 - 0.03, dT1 + 0.03, tTrave - 0.03, tTrave + 0.03, B.alturaTampo + tr.altura - 0.06, B.alturaTampo + tr.altura, inox);
  for (let k = 0; k < tr.torneiras; k++) {
    const d = dT0 + 0.15 + k * 0.1;
    const corpoT = malha(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 10), inox, p(d, tTrave - 0.07, B.alturaTampo + tr.altura - 0.06));
    corpoT.rotation.x = Math.PI / 2;
    cilindro(d, tTrave - 0.11, B.alturaTampo + tr.altura - 0.13, B.alturaTampo + tr.altura - 0.06, 0.01, inox, 0.008, 8);
    // alavanca de madeira com a cor da marca
    cilindro(d, tTrave - 0.11, B.alturaTampo + tr.altura - 0.05, B.alturaTampo + tr.altura + 0.09, 0.012, vidrosCor[k % vidrosCor.length], 0.009, 8);
  }
  // pingadeira de inox com grade, num avanço de 0,15 para o lado do bartender
  caixa(dT0 + 0.03, dT1 - 0.03, tM - 0.15, tM, B.alturaTampo - 0.025, B.alturaTampo - 0.005, inox);
  for (let d = dT0 + 0.06; d < dT1 - 0.04; d += 0.025) caixa(d, d + 0.006, tM - 0.14, tM - 0.01, B.alturaTampo - 0.005, B.alturaTampo, m('#9aa0a6', { metalness: 1, roughness: 0.4 }), false);

  // ---------- ponto de caixa na lateral do lado da porta ----------
  const CX = BC.caixa;
  const dCx0 = d0 - CX.fundura;
  const tCx0 = CX.portinha;
  caixa(dCx0, d0, tCx0, tF, 0, BC.alturaMureta, cimenticia);
  for (let t = tCx0 + 0.01; t < tF - 0.03; t += 0.06) caixa(dCx0 - 0.02, dCx0, t, t + 0.04, 0.1, BC.alturaMureta, carvalho, false);
  caixa(d0 - CX.tampoD, d0, tCx0, tT, BC.alturaMureta, B.alturaTampo, granito);
  caixa(d0 - CX.tampoD + 0.03, d0 - CX.tampoD + 0.05, tCx0 + 0.05, tT - 0.05, BC.alturaMureta - 0.012, BC.alturaMureta, ledTampo, false);
  // portinha vai-e-vem de 0,70 × 0,85 entre o caixa e a parede
  caixa(d0 - 0.25, d0 - 0.22, 0.03, tCx0 - 0.02, 0.15, 1.0, carvalho);
  // monitor, teclado, impressora de comanda e maquininha
  const tela = new THREE.MeshStandardMaterial({ color: '#0d1a26', emissive: '#3a6fa0', emissiveIntensity: 0.5, roughness: 0.2 });
  mats.push(tela);
  caixa(d0 - 0.12, d0 - 0.1, tCx0 + 0.25, tCx0 + 0.75, B.alturaTampo + 0.12, B.alturaTampo + 0.42, tela);
  caixa(d0 - 0.15, d0 - 0.12, tCx0 + 0.25, tCx0 + 0.75, B.alturaTampo + 0.1, B.alturaTampo + 0.44, ferroPreto);
  cilindro(d0 - 0.15, tCx0 + 0.5, B.alturaTampo, B.alturaTampo + 0.12, 0.015, ferroPreto, 0.015, 8);
  caixa(d0 - 0.02, d0 + 0.13, tCx0 + 0.3, tCx0 + 0.72, B.alturaTampo, B.alturaTampo + 0.02, ferroPreto); // teclado
  caixa(d0 - 0.4, d0 - 0.26, tCx0 + 0.82, tCx0 + 1.01, B.alturaTampo, B.alturaTampo + 0.13, m('#e8e6e1', { roughness: 0.5 })); // impressora
  caixa(d0 - CX.tampoD + 0.08, d0 - CX.tampoD + 0.16, tCx0 + 0.95, tCx0 + 1.03, B.alturaTampo, B.alturaTampo + 0.16, ferroPreto); // maquininha
  // cadeira alta do atendente, no corredor ao lado da portinha
  const dCad = d0 + 0.35, tCad = 0.42;
  cilindro(dCad, tCad, 0.72, 0.77, 0.25, couro, 0.25, 28);
  caixa(dCad + 0.18, dCad + 0.22, tCad - 0.2, tCad + 0.2, 0.77, 1.12, couro);
  cilindro(dCad, tCad, 0.05, 0.72, 0.025, ferroPreto, 0.025, 10);
  cilindro(dCad, tCad, 0, 0.03, 0.24, ferroPreto, 0.24, 24);

  // copos no tampo
  const vidro = m('#e8f2f5', { roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.35, depthWrite: false });
  for (const [d, t] of [[d0 + 1.9, tT - 0.15], [d0 + 3.0, tT - 0.12], [d0 + 3.15, tT - 0.22], [d0 + 4.1, tT - 0.14]]) {
    cilindro(d, t, B.alturaTampo, B.alturaTampo + 0.16, 0.032, vidro, 0.038, 16);
  }

  // ---------- parede do balcão: cristaleira com garrafas acima do corredor ----------
  const dB0 = d0 + 0.4, dB1 = d1 - 0.3;
  // painel de madeira atrás das prateleiras
  caixa(dB0, dB1, 0.001, 0.02, 1.2, 2.55, nogueira, false);
  const cores = ['#6b3a12', '#2f5d2a', '#a8661a', '#d9c9a0', '#3d1f12', '#8a1f1f', '#1f3a5a', '#c2a35a'];
  const vidros = cores.map((c) => m(c, { roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }));
  const fitaLed = new THREE.MeshStandardMaterial({ color: '#ffe0b0', emissive: LUZ_QUENTE, emissiveIntensity: 2.5 });
  mats.push(fitaLed);
  let semente = 7;
  const aleatorio = () => ((semente = (semente * 9301 + 49297) % 233280) / 233280);
  for (const y of [1.3, 1.72, 2.14]) {
    caixa(dB0, dB1, 0.02, 0.26, y - 0.035, y, carvalho);
    caixa(dB0, dB1, 0.22, 0.24, y - 0.045, y - 0.035, fitaLed, false); // LED sob a prateleira
    for (let d = dB0 + 0.08; d < dB1 - 0.05; d += 0.085 + aleatorio() * 0.04) {
      const alta = 0.24 + aleatorio() * 0.1;
      const mt = vidros[Math.floor(aleatorio() * vidros.length)];
      const t = 0.08 + aleatorio() * 0.1;
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
  // 8 banquetas com assento de Ø 0,40 a 0,78, a cada 0,60, a primeira a 0,35 da ponta
  for (let k = 0; k < BC.banquetas.n; k++) {
    const d = d0 + BC.banquetas.primeira + k * BC.banquetas.passo;
    const t = tF + 0.45;
    const y = BC.banquetas.assento;
    cilindro(d, t, y - 0.05, y, 0.2, couro, 0.2, 28);
    cilindro(d, t, y - 0.09, y - 0.05, 0.17, ferroPreto, 0.17, 20);
    cilindro(d, t, 0.05, y - 0.09, 0.025, ferroPreto, 0.025, 10);
    cilindro(d, t, 0, 0.03, 0.2, ferroPreto, 0.2, 24);
    const anel = malha(new THREE.TorusGeometry(0.15, 0.012, 8, 28), latao, p(d, t, 0.28));
    anel.rotation.x = Math.PI / 2;
  }

  // ---------- salão: conjuntos do anúncio (mesa 0,80 × 0,80 com 4 cadeiras) ----------
  // mesa encostada na parede da direita, duas cadeiras de cada lado (no sentido do comprimento),
  // assim a passagem entre as banquetas e as mesas fica livre
  const SAL = { mesa: 0.8, alturaMesa: 0.75, tampo: 0.04, assento: 0.46, cadeira: 0.36, encosto: 0.86, afasta: 0.54 };
  const paredeEm = (d: number) => PLANTA.larguraFrente - ((PLANTA.larguraFrente - PLANTA.larguraFundo) * d) / L;
  const mesasD = [1.6, 3.4, 5.2];
  const tMesa = paredeEm(mesasD[mesasD.length - 1] + 0.4) - 0.05 - SAL.mesa / 2;
  const tMesa0 = tMesa - SAL.mesa / 2; // borda da mesa do lado da passagem
  const couroPreto = m('#232325', { roughness: 0.5, sheen: 0.4, sheenColor: new THREE.Color('#55565c') });
  const madeiraPreta = m('#1d1a19', { roughness: 0.55, clearcoat: 0.3 });
  const cadeira = (d: number, t: number, lado: 1 | -1) => {
    const r = SAL.cadeira / 2;
    cilindro(d, t, SAL.assento - 0.05, SAL.assento, r, couroPreto, r, 28);
    cilindro(d, t, SAL.assento - 0.07, SAL.assento - 0.05, r - 0.02, inox, r - 0.02, 20);
    for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) cilindro(d + a * 0.12, t + b * 0.12, 0, SAL.assento - 0.07, 0.011, inox, 0.011, 8);
    // encosto: duas hastes pretas e três réguas de madeira
    const dc = d - lado * (r + 0.01);
    for (const b of [-1, 1]) caixa(dc - 0.012, dc + 0.012, t + b * (r - 0.03) - 0.012, t + b * (r - 0.03) + 0.012, SAL.assento - 0.07, SAL.encosto, ferroPreto);
    for (const y of [0.6, 0.7, 0.8]) caixa(dc - 0.012, dc + 0.012, t - r, t + r, y, y + 0.06, madeiraPreta);
  };
  for (const d of mesasD) {
    const t = tMesa, h = SAL.mesa / 2;
    caixa(d - h, d + h, t - h, t + h, SAL.alturaMesa - SAL.tampo, SAL.alturaMesa, carvalho);
    for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) cilindro(d + a * (h - 0.07), t + b * (h - 0.07), 0, SAL.alturaMesa - SAL.tampo, 0.013, ferroPreto, 0.02, 10);
    for (const lado of [-1, 1] as const) for (const b of [-1, 1]) cadeira(d + lado * SAL.afasta, t + b * 0.2, lado === -1 ? 1 : -1);
    // vela e cardápio na mesa
    cilindro(d + 0.1, t, SAL.alturaMesa, SAL.alturaMesa + 0.08, 0.025, vidro, 0.03, 12);
    malha(new THREE.SphereGeometry(0.012, 8, 6), lampada, p(d + 0.1, t, SAL.alturaMesa + 0.04), false);
    caixa(d - 0.2, d - 0.05, t - 0.1, t + 0.1, SAL.alturaMesa, SAL.alturaMesa + 0.005, couro, false);
  }

  // ---------- palco da área VIP: 2 andares de pallets e degrau de 1 pallet na entrada ----------
  const PC = PLANTA.palco, PL = PC.pallet;
  const hVip = PC.andares * PL.altura;
  const dPalco = L - PLANTA.fundo + PC.folga;
  {
    const pecas: THREE.BufferGeometry[] = [];
    const tabua = (d0: number, d1: number, t0: number, t1: number, y0: number, y1: number) => {
      const a = p(d0, t0, y0), b = p(d1, t1, y1);
      const geo = new THREE.BoxGeometry(Math.abs(b.x - a.x), y1 - y0, Math.abs(b.z - a.z));
      geo.translate((a.x + b.x) / 2, (y0 + y1) / 2, (a.z + b.z) / 2);
      pecas.push(geo);
    };
    // pallet PBR: 3 tábuas de baixo, 9 blocos, 3 travessas e 7 tábuas de cima (as de cima no sentido do comprimento)
    const pallet = (d0: number, t0: number, cd: number, ct: number, y: number) => {
      const e = 0.022, bl = 0.1;
      const ys = [y, y + e, y + PL.altura - 2 * e, y + PL.altura - e, y + PL.altura];
      const linhas = [d0 + bl / 2, d0 + cd / 2, d0 + cd - bl / 2];
      const colunas = [t0 + bl / 2, t0 + ct / 2, t0 + ct - bl / 2];
      for (const c of colunas) tabua(d0, d0 + cd, c - bl / 2, c + bl / 2, ys[0], ys[1]);
      for (const l of linhas) for (const c of colunas) tabua(l - bl / 2, l + bl / 2, c - bl / 2, c + bl / 2, ys[1], ys[2]);
      for (const l of linhas) tabua(l - bl / 2, l + bl / 2, t0, t0 + ct, ys[2], ys[3]);
      const n = Math.max(3, Math.round((ct / PL.t) * 7));
      for (let k = 0; k < n; k++) {
        const c = t0 + bl / 2 + (k * (ct - bl)) / (n - 1);
        tabua(d0, d0 + cd, c - bl / 2 + 0.005, c + bl / 2 - 0.005, ys[3], ys[4]);
      }
    };
    const tFim = PLANTA.larguraFundo;
    for (let andar = 0; andar < PC.andares; andar++) {
      for (let d = dPalco; d < L - 0.01; d += PL.d) {
        for (let t = 0; t < tFim - 0.01; t += PL.t) pallet(d, t, Math.min(PL.d, L - d), Math.min(PL.t, tFim - t), andar * PL.altura);
      }
    }
    pallet(dPalco - PL.d, PC.degrau.t0, PL.d, PL.t, 0); // degrau
    const madeiraPallet = m('#c39a63', { roughness: 0.85 });
    const geo = mergeGeometries(pecas);
    pecas.forEach((x) => x.dispose());
    malha(geo, madeiraPallet, new THREE.Vector3());
  }

  const nVip0 = g.children.length;
  // ---------- área VIP: sofá de 3 lugares de frente para a TV, mesa de centro, tapete ----------
  // medidas do sofá escolhido: 1,80 × 0,81 × 0,78; assento a 0,44 (1,20 × 0,52, espuma 0,13),
  // braços a 0,68, encosto 0,35 de altura e 0,20 de espessura, pés de madeira de 0,10
  const SOFA = { largura: 1.8, fundura: 0.81, altura: 0.78, assento: 0.44, braco: 0.68, larguraAssento: 1.2, funduraAssento: 0.52, espuma: 0.13, encosto: 0.2, pe: 0.1 };
  const dV1 = L - 0.18;
  const tVip = PLANTA.larguraFundo / 2; // alinhado com a TV
  const dV0 = L - PLANTA.fundo + 0.25; // costas do sofá
  const dSf = dV0 + SOFA.fundura; // frente do sofá
  const tS0 = tVip - SOFA.largura / 2, tS1 = tVip + SOFA.largura / 2;
  const bracoL = (SOFA.largura - SOFA.larguraAssento) / 2;
  const tecido = m('#e8e3d9', { roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#ffffff') });
  const teca = m('#a5582b', { roughness: 0.45, clearcoat: 0.3 });
  const MC = { d0: dSf + 0.4, fundura: 0.45, largura: 0.9 }; // mesa de centro
  caixa(dV0 + 0.45, MC.d0 + MC.fundura + 0.35, tVip - 1.0, tVip + 1.0, 0, 0.012, tapete, false);
  for (const [dd, tt] of [[dV0 + 0.06, tS0 + 0.06], [dV0 + 0.06, tS1 - 0.06], [dSf - 0.06, tS0 + 0.06], [dSf - 0.06, tS1 - 0.06]]) cilindro(dd, tt, 0, SOFA.pe, 0.018, teca, 0.026, 10);
  caixa(dV0, dSf, tS0, tS1, SOFA.pe, SOFA.pe + 0.04, teca);
  caixa(dV0 + 0.01, dSf - 0.01, tS0 + 0.01, tS1 - 0.01, SOFA.pe + 0.04, SOFA.assento - SOFA.espuma, tecido);
  for (const [t0, t1] of [[tS0, tS0 + bracoL], [tS1 - bracoL, tS1]]) caixa(dV0, dSf, t0, t1, SOFA.pe + 0.04, SOFA.braco, tecido);
  const dEnc = dSf - SOFA.funduraAssento; // onde começa o assento
  caixa(dV0, dEnc - SOFA.encosto, tS0 + bracoL, tS1 - bracoL, SOFA.pe + 0.04, SOFA.braco, tecido);
  for (const k of [0, 1]) {
    const t0 = tS0 + bracoL + k * (SOFA.larguraAssento / 2) + 0.005, t1 = t0 + SOFA.larguraAssento / 2 - 0.01;
    caixa(dEnc, dSf - 0.005, t0, t1, SOFA.assento - SOFA.espuma, SOFA.assento, tecido); // almofada do assento
    caixa(dEnc - SOFA.encosto, dEnc - 0.01, t0, t1, SOFA.assento, SOFA.altura, tecido); // almofada do encosto
  }
  // mesa de centro com tampo de granito
  caixa(MC.d0, MC.d0 + MC.fundura, tVip - MC.largura / 2, tVip + MC.largura / 2, 0.4, 0.44, granito);
  caixa(MC.d0 + 0.06, MC.d0 + MC.fundura - 0.06, tVip - MC.largura / 2 + 0.06, tVip + MC.largura / 2 - 0.06, 0, 0.4, ferroPreto);
  // balde de gelo com espumante
  const dMc = MC.d0 + MC.fundura / 2;
  cilindro(dMc, tVip + 0.2, 0.44, 0.64, 0.09, inox, 0.11, 24);
  cilindro(dMc, tVip + 0.2, 0.6, 0.78, 0.035, vidros[1], 0.035, 14);
  // planta no canto
  cilindro(dV1 - 0.25, 0.3, 0, 0.45, 0.16, vaso, 0.2, 24);
  for (const [dd, tt, yy, r] of [[0, 0, 0.75, 0.28], [0.1, 0.08, 1.0, 0.22], [-0.08, -0.05, 1.15, 0.18]]) {
    malha(new THREE.IcosahedronGeometry(r, 1), folha, p(dV1 - 0.25 + dd, 0.3 + tt, yy));
  }
  // tudo o que é da área VIP fica em cima do palco
  for (const o of g.children.slice(nVip0)) o.position.y += hVip;

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
  for (const d of [d0 + 1.0, d0 + 2.45, d0 + 3.9]) {
    const t = tT - B.larguraTampo / 2;
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
    const d = dMc, t = tVip;
    cilindro(d, t, 1.75 + hVip, H, 0.004, ferroPreto, 0.004, 6);
    malha(new THREE.SphereGeometry(0.2, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), latao, p(d, t, 1.72 + hVip), false).rotation.x = Math.PI;
    malha(new THREE.SphereGeometry(0.05, 12, 8), lampada, p(d, t, 1.62 + hVip), false);
    const l = new THREE.PointLight(LUZ_QUENTE, 2.5, 4, 1.8);
    l.position.copy(p(d, t, 1.55 + hVip));
    g.add(l);
  }

  // ---------- TV de 1,67 × 0,94 na parede do fundo da área VIP, centralizada, topo a 3,00 ----------
  const TV = { largura: 1.67, altura: 0.94, topo: 3.0, t: PLANTA.larguraFundo / 2 };
  const ct2 = document.createElement('canvas');
  ct2.width = 512;
  ct2.height = 288;
  const cx = ct2.getContext('2d')!;
  // imagem na tela: um campo de futebol visto de cima, com placar
  cx.fillStyle = '#2f7d3a';
  cx.fillRect(0, 0, 512, 288);
  for (let i = 0; i < 8; i++) { cx.fillStyle = i % 2 ? '#2f7d3a' : '#348a40'; cx.fillRect(i * 64, 0, 64, 288); }
  cx.strokeStyle = '#e8f5e9';
  cx.lineWidth = 3;
  cx.strokeRect(24, 24, 464, 240);
  cx.beginPath(); cx.moveTo(256, 24); cx.lineTo(256, 264); cx.stroke();
  cx.beginPath(); cx.arc(256, 144, 40, 0, Math.PI * 2); cx.stroke();
  cx.strokeRect(24, 94, 50, 100); cx.strokeRect(438, 94, 50, 100);
  cx.fillStyle = 'rgba(0,0,0,0.65)'; cx.fillRect(16, 12, 150, 30);
  cx.fillStyle = '#fff'; cx.font = '700 20px system-ui'; cx.fillText('BDD 2 × 1 VIP', 26, 34);
  const texTv = new THREE.CanvasTexture(ct2);
  texTv.colorSpace = THREE.SRGBColorSpace;
  const telaTv = new THREE.MeshBasicMaterial({ map: texTv, toneMapped: false });
  mats.push(telaTv);
  caixa(L - 0.07, L - 0.005, TV.t - TV.largura / 2, TV.t + TV.largura / 2, TV.topo - TV.altura, TV.topo, m('#0b0b0c', { roughness: 0.3, metalness: 0.4 }));
  const telaMesh = malha(new THREE.PlaneGeometry(TV.largura - 0.03, TV.altura - 0.03), telaTv, p(L - 0.072, TV.t, TV.topo - TV.altura / 2), false);
  telaMesh.rotation.y = 0; // a frente do plano já olha para a frente da loja (+z)
  const brilhoTv = new THREE.PointLight('#9fd4ff', 0.8, 3, 2);
  brilhoTv.position.copy(p(L - 0.5, TV.t, TV.topo - TV.altura / 2));
  g.add(brilhoTv);

  // ---------- bonecos de 1,75 m (camada "Pessoas") ----------
  const pessoas = new THREE.Group();
  g.add(pessoas);
  const pele = m('#9aa3ad', { roughness: 0.7 });
  const pessoa = (d: number, t: number, sentada = false, base = 0) => {
    const altura = 1.75;
    const cabeca = 0.23;
    const yTopo = sentada ? base + 0.9 : altura;
    const corpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, (sentada ? 0.45 : yTopo - cabeca - 0.5) , 6, 16), pele);
    geos.push(corpo.geometry);
    const yCorpo = sentada ? base + 0.32 + 0.2 : (yTopo - cabeca) / 2 + 0.12;
    corpo.position.copy(p(d, t, yCorpo));
    corpo.scale.set(1, 1, 0.7);
    corpo.castShadow = true;
    pessoas.add(corpo);
    const c = new THREE.Mesh(new THREE.SphereGeometry(cabeca / 2, 16, 12), pele);
    geos.push(c.geometry);
    c.position.copy(p(d, t, yTopo - cabeca / 2));
    c.castShadow = true;
    pessoas.add(c);
    if (!sentada) {
      for (const lado of [-0.08, 0.08]) {
        const perna = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.85, 10), pele);
        geos.push(perna.geometry);
        perna.position.copy(p(d + lado, t, 0.425));
        perna.castShadow = true;
        pessoas.add(perna);
      }
    }
  };
  pessoa(d0 + 1.6, tC / 2); // bartender no corredor
  pessoa(2.5, (tF + 0.65 + tMesa0) / 2); // cliente na passagem
  pessoa(d0 - 0.3, 0.42, true, 0.75); // atendente do caixa sentado
  pessoa(dEnc + 0.2, tVip - 0.3, true, 0.02 + hVip); // cliente no sofá da área VIP, de frente para a TV
  pessoa(0.6, PLANTA.porta.t + 0.45); // chegando pela porta

  // ---------- medidas (camada "Medidas") ----------
  const cotas = criarCotas();
  cotas.grupo.visible = false;
  g.add(cotas.grupo);
  {
    const { cota, rotulo } = cotas;
    const y = 0.02;
    const dMeio = d0 + 2.6;
    // corredores e balcão, cortando o balcão no meio
    cota(p(dMeio, 0, y), p(dMeio, tC, y), `Corredor do bartender ${fm(BC.corredor)}`);
    cota(p(dMeio + 0.5, tC, BC.alturaBancada + 0.02), p(dMeio + 0.5, tM, BC.alturaBancada + 0.02), `Balcão ${fm(BC.corpo)}`);
    cota(p(dMeio + 0.5, tM, BC.alturaMureta + 0.06), p(dMeio + 0.5, tF, BC.alturaMureta + 0.06), `Mureta ${fm(BC.mureta)}`, 0.1);
    cota(p(dMeio - 0.4, tF, B.alturaTampo + 0.02), p(dMeio - 0.4, tT, B.alturaTampo + 0.02), `Balanço ${fm(BC.balanco)}`, 0.1);
    cota(p(d0, tT + 0.05, B.alturaTampo + 0.03), p(d1, tT + 0.05, B.alturaTampo + 0.03), `Balcão ${fm(B.comprimento)} · tampo ${fm(B.larguraTampo)}`);
    cota(p(d1 + 0.12, tT, 0), p(d1 + 0.12, tT, B.alturaTampo), `Tampo a ${fm(B.alturaTampo)}`);
    cota(p(d1 + 0.12, tC - 0.05, 0), p(d1 + 0.12, tC - 0.05, BC.alturaBancada), `Bancada ${fm(BC.alturaBancada)}`, 0.1);
    cota(p(dT0, tTrave, B.alturaTampo + tr.altura + 0.08), p(dT1, tTrave, B.alturaTampo + tr.altura + 0.08), `Trave ${fm(tr.comprimento)} · 10 torneiras`, 0.1);
    cota(p(dCam, tC - 0.12, 0.05), p(d1, tC - 0.12, 0.05), `Pia ${fm(BC.pia.comprimento)}`, 0.1);
    cota(p(d0, tC - 0.12, 0.05), p(dCam, tC - 0.12, 0.05), `Câmara fria ${fm(BC.camara.comprimento)} · 10 barris`, 0.1);
    // caixa e portinha
    cota(p(dCx0, tF + 0.1, y), p(d0, tF + 0.1, y), `Caixa ${fm(CX.fundura)}`, 0.1);
    cota(p(d0 - 0.4, 0, y), p(d0 - 0.4, tCx0, y), `Portinha ${fm(CX.portinha)}`, 0.1);
    // banquetas
    const dB = d0 + BC.banquetas.primeira, tBq = tF + 0.45;
    cota(p(dB, tBq + 0.28, y), p(dB + BC.banquetas.passo, tBq + 0.28, y), `Banquetas a cada ${fm(BC.banquetas.passo)}`, 0.1);
    rotulo(`Ø 0,40 · assento ${fm(BC.banquetas.assento)}`, p(dB + 4 * BC.banquetas.passo, tBq, BC.banquetas.assento + 0.15), 0.1);
    // passagem entre banquetas e mesas
    const dP = 2.5;
    cota(p(dP, tBq + 0.2, y), p(dP, tMesa0, y), `Passagem ${fm(tMesa0 - tBq - 0.2)}`);
    cota(p(dP + 1.4, tF, y), p(dP + 1.4, tMesa0, y), `Balcão até a mesa ${fm(tMesa0 - tF)}`, 0.1);
    // conjunto: mesa 0,80 × 0,80 e 4 cadeiras
    const dm = mesasD[1], h = SAL.mesa / 2;
    cota(p(dm - h, tMesa0 - 0.03, SAL.alturaMesa + 0.02), p(dm + h, tMesa0 - 0.03, SAL.alturaMesa + 0.02), `Mesa ${fm(SAL.mesa)} × ${fm(SAL.mesa)}`, 0.1);
    cota(p(dm, tMesa0 - 0.03, 0), p(dm, tMesa0 - 0.03, SAL.alturaMesa), `Altura ${fm(SAL.alturaMesa)}`, 0.1);
    rotulo(`Cadeira Ø ${fm(SAL.cadeira)} · assento ${fm(SAL.assento)}`, p(dm - SAL.afasta, tMesa - 0.2, SAL.encosto + 0.12), 0.1);
    const fim = (d: number) => d + SAL.afasta + SAL.cadeira / 2 + 0.02;
    const ini = (d: number) => d - SAL.afasta - SAL.cadeira / 2 - 0.02;
    cota(p(ini(dm), tMesa0 - 0.12, y), p(fim(dm), tMesa0 - 0.12, y), `Conjunto com 4 cadeiras ${fm(fim(dm) - ini(dm))}`, 0.1);
    cota(p(fim(mesasD[0]), tMesa, y), p(ini(mesasD[1]), tMesa, y), `Entre conjuntos ${fm(ini(mesasD[1]) - fim(mesasD[0]))}`, 0.1);
    // freezers e porta
    const F = PLANTA.freezers;
    cota(p(PLANTA.freezerFundura + 0.05, F[0].t + 0.02, PLANTA.freezerAltura + 0.05), p(PLANTA.freezerFundura + 0.05, F[1].t + F[1].largura + 0.02, PLANTA.freezerAltura + 0.05), `Freezers 2 × ${fm(F[0].largura)}`, 0.1);
    cota(p(0, F[1].t + F[1].largura + 0.08, PLANTA.freezerAltura + 0.05), p(PLANTA.freezerFundura + 0.02, F[1].t + F[1].largura + 0.08, PLANTA.freezerAltura + 0.05), `Fundo ${fm(PLANTA.freezerFundura)}`, 0.1);
    cota(p(PLANTA.freezerFundura + 0.1, F[1].t + F[1].largura + 0.02, 0), p(PLANTA.freezerFundura + 0.1, F[1].t + F[1].largura + 0.02, PLANTA.freezerAltura), `Altura ${fm(PLANTA.freezerAltura)}`, 0.1);
    cota(p(0.05, PLANTA.porta.t, y), p(0.05, PLANTA.porta.t + PLANTA.porta.largura, y), `Porta ${fm(PLANTA.porta.largura)}`, 0.1);
    cota(p(0, (tCx0 + tT) / 2, y), p(d0 - CX.tampoD, (tCx0 + tT) / 2, y), `Porta até o caixa ${fm(d0 - CX.tampoD)}`, 0.1);
    // área VIP
    cota(p(dV0 - 0.03, tS0, hVip + SOFA.altura + 0.05), p(dV0 - 0.03, tS1, hVip + SOFA.altura + 0.05), `Sofá ${fm(SOFA.largura)} × ${fm(SOFA.fundura)}`, 0.1);
    cota(p(dSf + 0.03, tS1 + 0.05, hVip), p(dSf + 0.03, tS1 + 0.05, hVip + SOFA.assento), `Assento ${fm(SOFA.assento)}`, 0.1);
    cota(p(dSf, tVip - 0.6, hVip + y), p(L, tVip - 0.6, hVip + y), `Sofá até a TV ${fm(L - dSf)}`, 0.1);
    cota(p(MC.d0, tVip + MC.largura / 2 + 0.05, hVip + 0.47), p(MC.d0 + MC.fundura, tVip + MC.largura / 2 + 0.05, hVip + 0.47), `Mesa de centro ${fm(MC.largura)} × ${fm(MC.fundura)}`, 0.1);
    cota(p(dPalco + 0.05, 2.25, 0), p(dPalco + 0.05, 2.25, hVip), `Palco ${fm(hVip)} · 2 pallets`, 0.1);
    cota(p(dPalco - PL.d - 0.03, PC.degrau.t0 + PL.t, 0), p(dPalco - PL.d - 0.03, PC.degrau.t0 + PL.t, PL.altura), `Degrau ${fm(PL.altura)}`, 0.1);
    cota(p(dPalco - PL.d, PC.degrau.t0 - 0.04, PL.altura + 0.02), p(dPalco, PC.degrau.t0 - 0.04, PL.altura + 0.02), `Pallet ${fm(PL.d)} × ${fm(PL.t)}`, 0.1);
    cota(p(L - 0.1, TV.t - TV.largura / 2, TV.topo + 0.08), p(L - 0.1, TV.t + TV.largura / 2, TV.topo + 0.08), `TV ${fm(TV.largura)} × ${fm(TV.altura)}`, 0.1);
    cota(p(L - 0.1, TV.t + TV.largura / 2 + 0.08, 0), p(L - 0.1, TV.t + TV.largura / 2 + 0.08, TV.topo - TV.altura), `Base da TV a ${fm(TV.topo - TV.altura)}`, 0.1);
    cota(p(d0 + 1.6 + 0.3, tC / 2, 0), p(d0 + 1.6 + 0.3, tC / 2, 1.75), 'Pessoa 1,75', 0.1);
    cota(p(L - PLANTA.fundo - 0.05, 2.25, 0), p(L - PLANTA.fundo - 0.05, 2.25, PLANTA.separacaoVip.altura), `Separação ${fm(PLANTA.separacaoVip.altura)}`, 0.1);
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
    medidas: cotas.grupo,
    pessoas,
    ligar,
    destruir: () => {
      cotas.destruir();
      geos.forEach((x) => x.dispose());
      mats.forEach((x) => x.dispose());
      tex.dispose();
      ambiente.dispose();
      pmrem.dispose();
    },
  };
}

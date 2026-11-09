import * as THREE from 'three';
import { PLANTA, criarCamadas, type Camada } from './planta';
import { criarDecorado } from './decorado';

/*
 * A loja vazia em 3D. As medidas vêm da planta baixa à mão (8,70 m × 4,46 m na frente e 4,36 m no fundo),
 * com as camadas de elétrica, iluminação e hidráulica em planta.ts. O acabamento veio das fotos:
 * pé-direito alto com forro de gesso, parede do fundo de concreto com dois pilares e, na frente,
 * a vitrine com porta de esquadria preta e a janela estreita vertical.
 * Eixos: x = largura, y = altura, z = comprimento (frente em +z, fundo em -z).
 */

export const LARGURA = PLANTA.larguraFrente;
export const COMPRIMENTO = PLANTA.comprimento;
const LARGURA_FUNDO = PLANTA.larguraFundo;
export const ALTURA = PLANTA.altura;
const OLHO = 1.65;
const FOLGA = 0.3;

export type Parede = 'esquerda' | 'direita' | 'fundo' | 'frente';
export const PAREDES: { id: Parede; nome: string }[] = [
  { id: 'esquerda', nome: 'Lateral esquerda' },
  { id: 'direita', nome: 'Lateral direita' },
  { id: 'fundo', nome: 'Fundo' },
  { id: 'frente', nome: 'Frente' },
];
/** Tudo o que pode receber tinta: as quatro paredes, o teto e o chão. */
export type Superficie = Parede | 'teto' | 'chao';
export const SUPERFICIES: { id: Superficie; nome: string }[] = [...PAREDES, { id: 'teto', nome: 'Teto' }, { id: 'chao', nome: 'Chão' }];

/** Textura de ruído para concreto, reboco e forro (gerada no navegador, sem baixar imagens). */
function textura(w: number, h: number, pintar: (ctx: CanvasRenderingContext2D) => void, repetir: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  pintar(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repetir);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function manchas(ctx: CanvasRenderingContext2D, w: number, h: number, base: number, variacao: number, n: number, raio: number) {
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = base + (Math.random() - 0.5) * variacao;
    const r = Math.random() * raio + 2;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(${v},${v},${v - 2},0.35)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.save();
    ctx.translate(Math.random() * w, Math.random() * h);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const d = (Math.random() - 0.5) * variacao * 0.35;
    img.data[i] += d;
    img.data[i + 1] += d;
    img.data[i + 2] += d;
  }
  ctx.putImageData(img, 0, 0);
}

function criarTexturas() {
  const concreto = textura(512, 512, (ctx) => manchas(ctx, 512, 512, 96, 36, 260, 60), [2, 1]);
  const reboco = textura(256, 256, (ctx) => manchas(ctx, 256, 256, 238, 14, 80, 30), [4, 2]);
  const piso = textura(512, 512, (ctx) => manchas(ctx, 512, 512, 112, 30, 300, 50), [2, 4]);
  // forro de gesso: placas com massa branca nas juntas e nos parafusos, como nas fotos
  const forro = textura(512, 512, (ctx) => {
    ctx.fillStyle = '#efece6';
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        ctx.fillStyle = '#c9b89c';
        ctx.fillRect(x * 256 + 22, y * 256 + 20, 212, 200);
        ctx.fillStyle = '#f2efea';
        for (let i = 0; i < 9; i++) {
          ctx.beginPath();
          ctx.ellipse(x * 256 + 40 + (i % 3) * 80, y * 256 + 45 + Math.floor(i / 3) * 70, 9, 6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }, [1.5, 3.5]);
  return { concreto, reboco, piso, forro };
}

/** Parede plana (com recortes opcionais) olhando para dentro da sala. */
function plano(largura: number, altura: number, furos: [number, number, number, number][] = []) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(largura, 0);
  s.lineTo(largura, altura);
  s.lineTo(0, altura);
  s.lineTo(0, 0);
  for (const [x, y, w, h] of furos) {
    const f = new THREE.Path();
    f.moveTo(x, y);
    f.lineTo(x, y + h);
    f.lineTo(x + w, y + h);
    f.lineTo(x + w, y);
    f.lineTo(x, y);
    s.holes.push(f);
  }
  const g = new THREE.ShapeGeometry(s);
  // UV em metros para a textura não esticar
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 4, pos.getY(i) / 4);
  return g;
}

export interface Cena {
  /** 'todas' pinta as quatro paredes; teto e chão só quando escolhidos. */
  pintar: (alvo: Superficie | 'todas', hex: string | null) => void;
  olharPara: (lado: 'fundo' | 'frente') => void;
  /** Movimento contínuo do joystick: x = lateral, y = frente/trás, de -1 a 1. */
  mover: (x: number, y: number) => void;
  /** Modo Decorado: móveis, luminárias, sombras e reflexos. */
  decorar: (ligado: boolean) => void;
  /** Liga ou desliga uma camada da planta. */
  camada: (id: Camada, visivel: boolean) => void;
  /** 'cima' mostra a planta vista de cima (sem forro); 'dentro' volta a andar pela loja. */
  vista: (v: 'cima' | 'dentro') => void;
  destruir: () => void;
}

export function criarCena(container: HTMLElement): Cena {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping; // preserva o tom da tinta melhor que o ACES
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1b1716');
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 60);
  const tx = criarTexturas();

  const W = LARGURA, L = COMPRIMENTO, H = ALTURA;

  // materiais das paredes: concreto original até escolher uma tinta
  const original: Record<Superficie, THREE.Texture> = { esquerda: tx.concreto, direita: tx.concreto, fundo: tx.concreto, frente: tx.concreto, teto: tx.forro, chao: tx.piso };
  const aspereza: Record<Superficie, number> = { esquerda: 0.95, direita: 0.95, fundo: 0.95, frente: 0.95, teto: 1, chao: 0.85 };
  const mat = {} as Record<Superficie, THREE.MeshStandardMaterial>;
  for (const p of SUPERFICIES) mat[p.id] = new THREE.MeshStandardMaterial({ map: original[p.id], roughness: aspereza[p.id] });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], rotY = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.y = rotY;
    scene.add(m);
    return m;
  };

  // piso e forro
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(W, L), mat.chao);
  piso.rotation.x = -Math.PI / 2;
  scene.add(piso);
  const forro = new THREE.Mesh(new THREE.PlaneGeometry(W, L), mat.teto);
  forro.rotation.x = Math.PI / 2;
  forro.position.y = H;
  scene.add(forro);
  // faixa branca de acabamento do forro junto às paredes
  const sanca = new THREE.MeshStandardMaterial({ map: tx.reboco, roughness: 1 });
  add(new THREE.BoxGeometry(0.12, 0.18, L), sanca, [-W / 2 + 0.06, H - 0.09, 0]);
  add(new THREE.BoxGeometry(0.12, 0.18, L), sanca, [W / 2 - 0.06, H - 0.09, 0]);

  // laterais (de quem entra pela frente olhando o fundo: esquerda em -x)
  add(plano(L, H), mat.esquerda, [-W / 2, 0, L / 2], Math.PI / 2);
  // a lateral do salão abre 10 cm: 4,46 m na frente e 4,36 m no fundo
  const recuo = LARGURA - LARGURA_FUNDO;
  add(plano(Math.hypot(L, recuo), H), mat.direita, [W / 2 - recuo, 0, -L / 2], -Math.atan2(L, recuo));

  // fundo de concreto
  add(plano(LARGURA_FUNDO, H), mat.fundo, [-W / 2, 0, -L / 2]);

  /** Converte um ponto da planta (d a partir da frente, t a partir da parede do balcão) para a cena. */
  const p = (d: number, t: number, y = 0) => new THREE.Vector3(-W / 2 + t, y, L / 2 - d);
  // pilares da planta: canto da frente do lado do salão e os dois do fundo
  for (const pl of PLANTA.pilares) {
    const c = p(pl.d + pl.cd / 2, pl.t + pl.ct / 2, H / 2);
    add(new THREE.BoxGeometry(pl.ct, H, pl.cd), pl.d > L / 2 ? mat.fundo : mat.frente, [c.x, c.y, c.z]);
  }
  // freezers verticais encostados na frente, do lado do balcão
  const branco = new THREE.MeshStandardMaterial({ color: '#e9e7e2', roughness: 0.35, metalness: 0.2 });
  const portaFreezer = new THREE.MeshStandardMaterial({ color: '#2a2f33', roughness: 0.15, metalness: 0.5 });
  for (const fz of PLANTA.freezers) {
    const c = p(PLANTA.freezerFundura / 2 + 0.02, fz.t + fz.largura / 2 + 0.02, PLANTA.freezerAltura / 2);
    add(new THREE.BoxGeometry(fz.largura, PLANTA.freezerAltura, PLANTA.freezerFundura), branco, [c.x, c.y, c.z]);
    const v = p(PLANTA.freezerFundura + 0.025, fz.t + fz.largura / 2 + 0.02, PLANTA.freezerAltura / 2 + 0.08);
    add(new THREE.BoxGeometry(fz.largura - 0.08, PLANTA.freezerAltura - 0.4, 0.015), portaFreezer, [v.x, v.y, v.z]);
  }
  // separação baixa da área VIP (aberta), em ripas
  const sv = PLANTA.separacaoVip;
  const ripa = new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 0.75 });
  for (let t = sv.t0 + 0.05; t <= sv.t1; t += 0.12) {
    const c = p(L - PLANTA.fundo, t, sv.altura / 2);
    add(new THREE.BoxGeometry(0.05, sv.altura, 0.04), ripa, [c.x, c.y, c.z]);
  }

  // frente, vista de dentro: u vai da direita (+x) para a esquerda (-x) de quem está olhando para a rua
  const vitrine = { u: 0.5, w: 2.4, h: 2.25, faixa: 0.5 };
  const janela = { u: 3.6, w: 0.36, h: 3.35 };
  const frente = plano(W, H, [
    [vitrine.u, 0, vitrine.w, vitrine.h + vitrine.faixa],
    [janela.u, 0, janela.w, janela.h],
  ]);
  add(frente, mat.frente, [W / 2, 0, L / 2], Math.PI);
  const ux = (u: number) => W / 2 - u; // posição x de um ponto u da frente
  // pilar de concreto entre a vitrine e a janela
  add(new THREE.BoxGeometry(0.4, H, 0.2), mat.frente, [ux(3.32), H / 2, L / 2 - 0.1]);

  const preto = new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.5, metalness: 0.4 });
  const vidro = new THREE.MeshStandardMaterial({ color: '#dfe8ef', emissive: '#cfd8df', emissiveIntensity: 0.9, roughness: 0.1 });
  const zv = L / 2 - 0.02;
  // painel preto acima da vitrine
  add(new THREE.BoxGeometry(vitrine.w, vitrine.faixa, 0.05), preto, [ux(vitrine.u + vitrine.w / 2), vitrine.h + vitrine.faixa / 2, zv]);
  // vidro e esquadrias da vitrine (quadriculado à esquerda, coluna de vidros estreitos e a porta)
  add(new THREE.PlaneGeometry(vitrine.w, vitrine.h), vidro, [ux(vitrine.u + vitrine.w / 2), vitrine.h / 2, zv], Math.PI);
  const barra = (x: number, y: number, w: number, h: number) => add(new THREE.BoxGeometry(w, h, 0.06), preto, [ux(x), y, zv - 0.01]);
  const verticais = [0, 0.43, 0.86, 1.3, 1.62, vitrine.w];
  for (const v of verticais) barra(vitrine.u + v, vitrine.h / 2, 0.05, vitrine.h);
  for (const y of [0.02, 0.45, 0.95, 1.45, 1.9, vitrine.h]) barra(vitrine.u + 0.65, y, 1.3, 0.05);
  for (let y = 0.3; y < vitrine.h; y += 0.28) barra(vitrine.u + 1.46, y, 0.32, 0.04);
  // porta: metade de baixo fechada
  add(new THREE.BoxGeometry(0.78, 1.15, 0.05), preto, [ux(vitrine.u + 2.01), 0.58, zv - 0.01]);
  barra(vitrine.u + 2.01, 1.6, 0.78, 0.05);
  // janela estreita vertical
  add(new THREE.PlaneGeometry(janela.w, janela.h), vidro, [ux(janela.u + janela.w / 2), janela.h / 2, zv], Math.PI);
  barra(janela.u, janela.h / 2, 0.05, janela.h);
  barra(janela.u + janela.w, janela.h / 2, 0.05, janela.h);
  for (let y = 0.02; y <= janela.h; y += 0.42) barra(janela.u + janela.w / 2, y, janela.w, 0.04);

  // tubulação aparente do sprinkler no forro
  const cano = new THREE.MeshStandardMaterial({ color: '#b9bcbf', roughness: 0.35, metalness: 0.8 });
  const doForro: THREE.Object3D[] = [forro];
  const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, W - 0.2, 12), cano);
  tubo.rotation.z = Math.PI / 2;
  for (const z of [-L / 2 + 1.3, L / 2 - 1.2]) {
    const t = tubo.clone();
    t.position.set(0, H - 0.12, z);
    scene.add(t);
    doForro.push(t);
  }
  const longo = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, L - 2.5, 12), cano);
  longo.rotation.x = Math.PI / 2;
  longo.position.set(-W / 2 + 0.35, H - 0.12, 0.05);
  scene.add(longo);
  doForro.push(longo);

  // balcão de 4,90 m: tampo de 0,60 m na borda da área de 1,66 m, de frente para o salão
  const B = PLANTA.balcao;
  const madeira = new THREE.MeshStandardMaterial({ color: '#5a3a26', roughness: 0.7, transparent: true });
  const tampo = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.35, transparent: true });
  const cb = p(B.d + B.comprimento / 2, B.profundidade - B.larguraTampo / 2, 0);
  const corpo = add(new THREE.BoxGeometry(B.larguraTampo - 0.08, B.alturaTampo - 0.05, B.comprimento), madeira, [cb.x, (B.alturaTampo - 0.05) / 2, cb.z]);
  const pedra = add(new THREE.BoxGeometry(B.larguraTampo, 0.05, B.comprimento + 0.04), tampo, [cb.x, B.alturaTampo - 0.025, cb.z]);

  // camadas da planta (começam desligadas, menos áreas e balcão)
  const { camadas, fixos } = criarCamadas(p);
  scene.add(fixos);
  for (const [id, g] of Object.entries(camadas)) {
    g.visible = id === 'areas';
    scene.add(g);
  }
  const ajustarBalcao = () => {
    // com instalações à mostra o balcão fica translúcido para ver os canos e fios por baixo
    const infra = camadas.eletrica.visible || camadas.hidraulica.visible;
    madeira.opacity = tampo.opacity = infra ? 0.35 : 1;
    madeira.depthWrite = tampo.depthWrite = !infra;
    corpo.visible = pedra.visible = camadas.areas.visible || infra || decorando;
    // as cadeiras e sofás atrapalham ver as instalações: somem enquanto elas estão ligadas
    decorado.grupo.visible = decorando && !infra;
  };

  // luz: ambiente suave, claridade da rua entrando pela frente e luminárias no forro
  const hemi = new THREE.HemisphereLight('#ffffff', '#7a7a7a', 2.1);
  scene.add(hemi);
  const luzesBase: THREE.Light[] = [hemi];
  const rua = new THREE.DirectionalLight('#fff3e0', 1.4);
  rua.position.set(-1, 3, L);
  rua.target.position.set(0, 0, -2);
  scene.add(rua, rua.target);
  luzesBase.push(rua);
  for (const z of [-2.8, 0, 2.8]) {
    const l = new THREE.PointLight('#fff6ec', 4, 10, 1.4);
    l.position.set(0, H - 0.9, z);
    scene.add(l);
    luzesBase.push(l);
  }
  const decorado = criarDecorado(p, scene, renderer, luzesBase);
  let decorando = false;

  // câmera em primeira pessoa
  const pos = new THREE.Vector3(0, OLHO, L / 2 - 1.2);
  let yaw = 0; // 0 = olhando o fundo (-z)
  let pitch = 0;
  // vista de cima: câmera alta olhando para baixo, frente à esquerda e balcão no alto, como no papel
  let deCima = false;
  // câmera ortográfica: a vista de cima fica igual a uma planta, sem perspectiva
  const planta = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 40);
  /** Tela em pé (celular): a planta gira para o comprimento ficar na vertical, com a frente no alto. */
  const empe = () => camera.aspect < 1;
  const alvoCima = new THREE.Vector3();
  let zoom = 1;
  const vista = (v: 'cima' | 'dentro') => {
    deCima = v === 'cima';
    for (const o of doForro) o.visible = !deCima;
    sanca.visible = !deCima;
    if (deCima) {
      alvoCima.set(0, 0, 0);
      zoom = 1;
    }
  };
  const olharPara = (lado: 'fundo' | 'frente') => {
    vista('dentro');
    yaw = lado === 'fundo' ? 0 : Math.PI;
    pitch = 0;
    pos.set(0, OLHO, lado === 'fundo' ? L / 2 - 1.2 : -L / 2 + PLANTA.fundo + 0.3);
  };

  const teclas = new Set<string>();
  const joy = { x: 0, y: 0 };
  const onKey = (e: KeyboardEvent) => {
    const alvo = e.target as HTMLElement | null;
    if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      if (e.type === 'keydown') {
        teclas.add(k);
        if (k.startsWith('arrow')) e.preventDefault();
      } else teclas.delete(k);
    }
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  const soltarTudo = () => teclas.clear();
  window.addEventListener('blur', soltarTudo);

  // arrastar com mouse ou dedo gira a visão
  let arrasto: { id: number; x: number; y: number } | null = null;
  const el = renderer.domElement;
  const down = (e: PointerEvent) => {
    if (arrasto) return;
    arrasto = { id: e.pointerId, x: e.clientX, y: e.clientY };
    el.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!arrasto || arrasto.id !== e.pointerId) return;
    if (deCima) {
      // arrastar desliza a planta
      const k = (planta.top - planta.bottom) / Math.max(1, el.clientHeight);
      const dx = (e.clientX - arrasto.x) * k, dy = (e.clientY - arrasto.y) * k;
      if (empe()) {
        alvoCima.x += dx;
        alvoCima.z += dy;
      } else {
        alvoCima.x -= dy;
        alvoCima.z += dx;
      }
      arrasto.x = e.clientX;
      arrasto.y = e.clientY;
      return;
    }
    const s = e.pointerType === 'touch' ? 0.006 : 0.004;
    yaw += (e.clientX - arrasto.x) * s;
    pitch = Math.max(-1.2, Math.min(1.2, pitch + (e.clientY - arrasto.y) * s));
    arrasto.x = e.clientX;
    arrasto.y = e.clientY;
  };
  const up = (e: PointerEvent) => {
    if (arrasto?.id === e.pointerId) arrasto = null;
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  const roda = (e: WheelEvent) => {
    if (!deCima) return;
    e.preventDefault();
    zoom = Math.max(0.35, Math.min(2.5, zoom * (e.deltaY > 0 ? 1.1 : 0.9)));
  };
  el.addEventListener('wheel', roda, { passive: false });

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = w < h ? 80 : 70;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const relogio = new THREE.Clock();
  let quadro = 0;
  const loop = () => {
    quadro = requestAnimationFrame(loop);
    const dt = Math.min(relogio.getDelta(), 0.1);
    let f = joy.y, lat = joy.x;
    if (teclas.has('w') || teclas.has('arrowup')) f += 1;
    if (teclas.has('s') || teclas.has('arrowdown')) f -= 1;
    if (teclas.has('d')) lat += 1;
    if (teclas.has('a')) lat -= 1;
    if (teclas.has('arrowleft')) yaw -= 1.8 * dt;
    if (teclas.has('arrowright')) yaw += 1.8 * dt;
    const v = 1.6 * dt;
    if (deCima) {
      // cabe a planta inteira (8,70 × 4,46 m) na tela, com margem
      const deitada = !empe();
      planta.up.set(deitada ? -1 : 0, 0, deitada ? 0 : 1);
      const [mv, mh] = deitada ? [W / 2 + 0.5, L / 2 + 0.5] : [L / 2 + 0.5, W / 2 + 0.5];
      const meiaAltura = Math.max(mv, mh / camera.aspect) * zoom;
      planta.top = meiaAltura;
      planta.bottom = -meiaAltura;
      planta.left = -meiaAltura * camera.aspect;
      planta.right = meiaAltura * camera.aspect;
      planta.updateProjectionMatrix();
      if (deitada) {
        alvoCima.x -= f * v * 2;
        alvoCima.z -= lat * v * 2;
      } else {
        alvoCima.z += f * v * 2;
        alvoCima.x -= lat * v * 2;
      }
      planta.position.set(alvoCima.x, 20, alvoCima.z);
      planta.lookAt(alvoCima);
      renderer.render(scene, planta);
      return;
    }
    pos.x += (Math.cos(yaw) * lat + Math.sin(yaw) * f) * v;
    pos.z += (Math.sin(yaw) * lat - Math.cos(yaw) * f) * v;
    pos.x = Math.max(-W / 2 + FOLGA, Math.min(W / 2 - FOLGA, pos.x));
    pos.z = Math.max(-L / 2 + FOLGA + 0.16, Math.min(L / 2 - FOLGA - 0.2, pos.z));
    camera.position.copy(pos);
    camera.rotation.set(0, 0, 0, 'YXZ');
    camera.rotation.y = -yaw;
    camera.rotation.x = -pitch;
    renderer.render(scene, camera);
  };
  olharPara('fundo');
  loop();

  const pintar = (alvo: Superficie | 'todas', hex: string | null) => {
    for (const p of SUPERFICIES) {
      if (alvo === 'todas' ? p.id === 'teto' || p.id === 'chao' : alvo !== p.id) continue;
      const m = mat[p.id];
      m.map = hex ? tx.reboco : original[p.id];
      m.color.set(hex ?? '#ffffff');
      // piso pintado (tinta de piso) tem um leve acetinado
      m.roughness = hex ? (p.id === 'chao' ? 0.6 : 0.9) : aspereza[p.id];
      m.needsUpdate = true;
    }
  };

  return {
    pintar,
    olharPara,
    camada: (id, visivel) => {
      camadas[id].visible = visivel;
      ajustarBalcao();
    },
    vista,
    decorar: (ligado) => {
      decorando = ligado;
      decorado.ligar(ligado);
      ajustarBalcao();
    },
    mover: (x, y) => {
      joy.x = x;
      joy.y = y;
    },
    destruir: () => {
      cancelAnimationFrame(quadro);
      ro.disconnect();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', soltarTudo);
      el.removeEventListener('wheel', roda);
      decorado.destruir();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      Object.values(tx).forEach((t) => t.dispose());
      renderer.dispose();
      el.remove();
    },
  };
}

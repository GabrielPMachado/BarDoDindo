/**
 * PS5 em 3D (three.js) para a animação da reserva, nas proporções oficiais do console original da Sony:
 * 390 mm de altura, 104 mm de largura e 260 mm de profundidade, sem a base.
 * Corpo preto brilhante, tampas brancas foscas que abrem em "asa" no alto e a luz azul entre a tampa e o corpo.
 * Carregado só quando a animação abre (o three.js fica num pedaço separado do app).
 */
import {
  ACESFilmicToneMapping, BoxGeometry, BufferGeometry, Color, CylinderGeometry, DirectionalLight, ExtrudeGeometry, Group, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, PerspectiveCamera, PMREMGenerator, PointLight, Scene, Shape, SRGBColorSpace, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// medidas em mm (oficiais da Sony) e proporções das partes, tiradas das fotos do console
const ALTURA = 390, LARGURA = 104, PROFUNDIDADE = 260;
const CORPO = 54; // largura do miolo preto, entre as duas tampas
const TAMPA = 12; // espessura de cada tampa branca
const ABERTURA = (LARGURA / 2) - (CORPO / 2 + TAMPA); // quanto a tampa abre para fora no alto

/** Perfil lateral da tampa (z = profundidade, y = altura): borda da frente côncava e o alto saindo para a frente. */
function perfilDaTampa() {
  const h = ALTURA / 2, p = PROFUNDIDADE / 2;
  const s = new Shape();
  s.moveTo(-p + 18, -h);
  s.lineTo(p - 26, -h);
  s.quadraticCurveTo(p - 50, -h * 0.15, p, h - 6); // frente: recolhida embaixo, avança no alto
  s.quadraticCurveTo(p + 2, h + 4, p - 16, h + 6);
  s.quadraticCurveTo(0, h + 14, -p + 10, h + 4); // topo levemente abaulado
  s.quadraticCurveTo(-p - 4, h - 4, -p + 2, h - 30);
  s.quadraticCurveTo(-p + 34, 0, -p + 18, -h); // traseira: curva suave
  return s;
}

/** Tampa extrudada na largura, com chanfro arredondado, e curvada para fora no alto (a "asa"). */
function tampa(lado: 1 | -1) {
  const g = new ExtrudeGeometry(perfilDaTampa(), { depth: TAMPA, bevelEnabled: true, bevelThickness: 4, bevelSize: 4, bevelSegments: 6, curveSegments: 48 });
  // a extrusão sai no eixo z: gira para a espessura ficar no eixo x (largura) e o perfil no plano lateral
  g.rotateY(Math.PI / 2);
  g.translate(lado > 0 ? CORPO / 2 : -CORPO / 2 - TAMPA, 0, 0);
  const pos = g.attributes.position;
  const face = CORPO / 2 + TAMPA * 0.5; // vértices além daqui são da face de fora
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = (y + ALTURA / 2) / ALTURA; // 0 embaixo, 1 no alto
    let dx = lado * ABERTURA * t * t;
    // edição com leitor de disco: a tampa direita tem o volume do leitor embaixo, na frente
    if (lado > 0 && x > face) {
      const u = Math.max(0, 1 - Math.hypot((y + 110) / 95, (z - 40) / 105));
      dx += 9 * u * u * (3 - 2 * u);
    }
    pos.setX(i, x + dx);
  }
  g.computeVertexNormals();
  return g;
}

export interface CenaPS5 { parar: () => void }

/** `velocidade`: voltas por segundo em radianos (1,6 na tela cheia; menor no cartão da reserva). */
export function montarPS5(canvas: HTMLCanvasElement, { velocidade = 1.6 } = {}): CenaPS5 {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const cena = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  cena.environment = ambiente;

  const camera = new PerspectiveCamera(30, 1, 10, 4000);
  camera.position.set(0, 60, 1000);
  camera.lookAt(0, 0, 0);

  const branco = new MeshPhysicalMaterial({ color: new Color('#f2f3f5'), roughness: 0.48, clearcoat: 0.25, clearcoatRoughness: 0.4, sheen: 0.2 });
  const preto = new MeshPhysicalMaterial({ color: new Color('#0b0c10'), roughness: 0.22, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const grade = new MeshPhysicalMaterial({ color: new Color('#16181f'), roughness: 0.7 });
  const azul = new MeshBasicMaterial({ color: new Color('#4aa8ff') });

  const console5 = new Group();
  // miolo preto, um pouco menor que as tampas, com cantos arredondados
  console5.add(new Mesh(new RoundedBoxGeometry(CORPO, ALTURA - 14, PROFUNDIDADE - 24, 6, 10), preto));
  // grades de ventilação no alto e na frente do miolo
  for (let i = 0; i < 9; i++) {
    const r = new Mesh(new BoxGeometry(CORPO - 14, 2.4, 12), grade);
    r.position.set(0, (ALTURA - 14) / 2 + 0.6, -100 + i * 25);
    console5.add(r);
  }
  // luz azul: as duas faixas entre o miolo e as tampas, na frente
  for (const x of [-CORPO / 2 + 1, CORPO / 2 - 1]) {
    const faixa = new Mesh(new BoxGeometry(1.6, ALTURA - 70, 1.6), azul);
    faixa.position.set(x, 10, PROFUNDIDADE / 2 - 14);
    console5.add(faixa);
  }
  // frente do miolo, embaixo: entradas USB-A e USB-C e os botões de ligar e de ejetar
  const furo = new MeshPhysicalMaterial({ color: new Color('#020203'), roughness: 0.9 });
  const frente = (PROFUNDIDADE - 24) / 2 + 0.5;
  const detalhes: [number, number, number, number][] = [[0, -ALTURA / 2 + 60, 13, 5], [0, -ALTURA / 2 + 78, 9, 3.4], [0, -ALTURA / 2 + 100, 16, 1.2], [0, -ALTURA / 2 + 116, 16, 1.2]];
  for (const [x, y, w, h] of detalhes) {
    const d = new Mesh(new BoxGeometry(w, h, 1.2), furo);
    d.position.set(x, y, frente);
    console5.add(d);
  }
  const brilho = new PointLight('#3d9bff', 4000, 260, 2);
  brilho.position.set(0, 20, PROFUNDIDADE / 2 + 20);
  console5.add(brilho);
  console5.add(new Mesh(tampa(1), branco), new Mesh(tampa(-1), branco));
  // base redonda preta
  const base = new Mesh(new CylinderGeometry(58, 62, 10, 48), preto);
  base.position.y = -ALTURA / 2 - 9;
  console5.add(base);
  console5.rotation.x = 0.12;
  cena.add(console5);

  const chave = new DirectionalLight('#ffffff', 2.2);
  chave.position.set(400, 600, 700);
  const contra = new DirectionalLight('#6fb6ff', 1.6);
  contra.position.set(-600, 200, -500);
  cena.add(chave, contra);

  const ajustar = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // enquadra o console inteiro (com a base) em qualquer proporção
    const alturaVista = 470, larguraVista = 330;
    const dist = Math.max(alturaVista / 2 / Math.tan((camera.fov * Math.PI) / 360), larguraVista / 2 / (Math.tan((camera.fov * Math.PI) / 360) * camera.aspect));
    camera.position.set(0, 50, dist);
    camera.lookAt(0, -6, 0);
    camera.updateProjectionMatrix();
  };
  ajustar();
  const obs = new ResizeObserver(ajustar);
  obs.observe(canvas);

  let quadro = 0;
  const inicio = performance.now();
  const desenhar = (agora: number) => {
    const t = (agora - inicio) / 1000;
    console5.rotation.y = t * velocidade - 0.6; // 1,6 = uma volta a cada ~4 s
    console5.position.y = Math.sin(t * 2) * 6;
    renderer.render(cena, camera);
    quadro = requestAnimationFrame(desenhar);
  };
  quadro = requestAnimationFrame(desenhar);

  return {
    parar: () => {
      cancelAnimationFrame(quadro);
      obs.disconnect();
      cena.traverse((o) => {
        if (o instanceof Mesh) {
          (o.geometry as BufferGeometry).dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      ambiente.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}

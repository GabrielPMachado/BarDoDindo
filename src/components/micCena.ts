/**
 * Microfone de karaokê em 3D (three.js) para o cartão da reserva: microfone de mão com corpo preto fosco,
 * anel cromado e o globo de tela metálica, girando sob luz de palco rosa e azul.
 * Carregado só quando aparece (o three.js fica num pedaço separado do app).
 */
import {
  ACESFilmicToneMapping, BufferGeometry, Color, CylinderGeometry, DirectionalLight, Group, IcosahedronGeometry, LatheGeometry, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, PerspectiveCamera, PMREMGenerator, PointLight, Scene, SphereGeometry, SRGBColorSpace, Vector2,
  WebGLRenderer, WireframeGeometry, LineSegments, LineBasicMaterial,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface CenaMic { parar: () => void }

/** Perfil do cabo (raio por altura, em mm): fino na ponta de baixo, alargando até o anel embaixo do globo. */
function perfilDoCabo() {
  const pts: [number, number][] = [[0, -95], [13, -95], [15, -90], [16, -40], [19, 10], [22, 40], [24, 52], [0, 52]];
  return pts.map(([r, y]) => new Vector2(r, y));
}

/** `velocidade`: giro em radianos por segundo. */
export function montarMic(canvas: HTMLCanvasElement, { velocidade = 1.6 } = {}): CenaMic {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;

  const cena = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  cena.environment = ambiente;
  const camera = new PerspectiveCamera(30, 1, 10, 2000);

  const corpo = new MeshPhysicalMaterial({ color: new Color('#15161b'), roughness: 0.55, metalness: 0.3, clearcoat: 0.3 });
  const cromo = new MeshPhysicalMaterial({ color: new Color('#d9dde4'), roughness: 0.15, metalness: 1 });
  const tela = new MeshPhysicalMaterial({ color: new Color('#9aa0aa'), roughness: 0.35, metalness: 0.9 });

  const mic = new Group();
  mic.add(new Mesh(new LatheGeometry(perfilDoCabo(), 48), corpo));
  const anel = new Mesh(new CylinderGeometry(25, 24, 8, 48), cromo);
  anel.position.y = 56;
  mic.add(anel);
  // globo: miolo escuro com a tela metálica trançada por cima
  const globo = new Group();
  globo.position.y = 84;
  globo.add(new Mesh(new SphereGeometry(28, 40, 24), new MeshPhysicalMaterial({ color: new Color('#22252b'), roughness: 0.8 })));
  const trama = new LineSegments(new WireframeGeometry(new IcosahedronGeometry(29.5, 4)), new LineBasicMaterial({ color: new Color('#c9ced6') }));
  globo.add(trama, new Mesh(new SphereGeometry(30, 40, 24), new MeshPhysicalMaterial({ color: tela.color, roughness: 0.3, metalness: 0.9, transparent: true, opacity: 0.35 })));
  mic.add(globo);
  // luzinha de ligado no cabo
  const led = new Mesh(new SphereGeometry(2.2, 12, 8), new MeshBasicMaterial({ color: new Color('#46e6ff') }));
  led.position.set(0, 0, 18.5);
  mic.add(led);
  mic.rotation.z = 0.32;
  cena.add(mic);

  const chave = new DirectionalLight('#ffffff', 1.6);
  chave.position.set(200, 300, 400);
  const rosa = new PointLight('#ff5fd2', 60000, 600, 2);
  rosa.position.set(-160, 120, 120);
  const azul = new PointLight('#46e6ff', 50000, 600, 2);
  azul.position.set(170, -40, 140);
  cena.add(chave, rosa, azul);

  const ajustar = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const meia = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max(250 / 2 / meia, 170 / 2 / (meia * camera.aspect));
    camera.position.set(0, 20, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  };
  ajustar();
  const obs = new ResizeObserver(ajustar);
  obs.observe(canvas);

  let quadro = 0;
  const inicio = performance.now();
  const desenhar = (agora: number) => {
    const t = (agora - inicio) / 1000;
    mic.rotation.y = t * velocidade;
    mic.position.y = Math.sin(t * 2) * 4;
    // as luzes de palco giram em volta, como refletores
    rosa.position.x = Math.cos(t * 1.3) * 180;
    azul.position.x = -Math.cos(t * 1.1) * 180;
    renderer.render(cena, camera);
    quadro = requestAnimationFrame(desenhar);
  };
  quadro = requestAnimationFrame(desenhar);

  return {
    parar: () => {
      cancelAnimationFrame(quadro);
      obs.disconnect();
      cena.traverse((o) => {
        if (o instanceof Mesh || o instanceof LineSegments) {
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

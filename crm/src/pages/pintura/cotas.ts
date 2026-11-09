import * as THREE from 'three';

/*
 * Cotas no 3D: linha fina com tracinhos nas pontas e a medida escrita no meio,
 * como num desenho técnico. As etiquetas olham sempre para a câmera e ficam por cima de tudo.
 */

const COR = '#7fd1ff';

export function criarCotas() {
  const g = new THREE.Group();
  const linhaMat = new THREE.MeshBasicMaterial({ color: COR, depthTest: false, transparent: true });
  const texturas: THREE.Texture[] = [];

  const traco = (a: THREE.Vector3, b: THREE.Vector3, raio = 0.005) => {
    const len = a.distanceTo(b);
    if (len < 1e-4) return;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(raio, raio, len, 6), linhaMat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.renderOrder = 9;
    g.add(m);
  };

  /** Etiqueta com a medida, sempre virada para a câmera. */
  const rotulo = (texto: string, pos: THREE.Vector3, escala = 0.12) => {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    const fonte = '700 44px system-ui, sans-serif';
    ctx.font = fonte;
    const w = Math.ceil(ctx.measureText(texto).width) + 30;
    c.width = w;
    c.height = 64;
    ctx.font = fonte;
    ctx.fillStyle = 'rgba(8, 24, 36, 0.9)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, 64, 16);
    ctx.fill();
    ctx.strokeStyle = COR;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#e6f6ff';
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, 15, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    texturas.push(tex);
    // tamanho fixo na tela (não cresce quando a câmera chega perto)
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
    s.renderOrder = 11;
    const k = escala * 0.3;
    s.scale.set((k * w) / 64, k, 1);
    s.position.copy(pos);
    g.add(s);
  };

  /** Cota entre dois pontos; o texto fica no meio, levemente acima. */
  const cota = (a: THREE.Vector3, b: THREE.Vector3, texto: string, escala = 0.12) => {
    traco(a, b);
    const dir = b.clone().sub(a).normalize();
    // tracinhos perpendiculares nas pontas (no plano do chão, ou horizontais se a cota for vertical)
    const vertical = Math.abs(dir.y) > 0.9;
    const perp = vertical ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-dir.z, 0, dir.x);
    for (const q of [a, b]) traco(q.clone().addScaledVector(perp, -0.04), q.clone().addScaledVector(perp, 0.04));
    rotulo(texto, a.clone().add(b).multiplyScalar(0.5), escala);
  };

  const destruir = () => {
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
      if (o instanceof THREE.Sprite) o.material.dispose();
    });
    texturas.forEach((t) => t.dispose());
    linhaMat.dispose();
  };

  return { grupo: g, cota, rotulo, destruir };
}

/** 0.92 → "0,92". */
export const m = (v: number) => v.toFixed(2).replace('.', ',');

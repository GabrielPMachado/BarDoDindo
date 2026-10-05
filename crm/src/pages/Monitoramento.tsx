import { useState } from 'react';
import { Grid2x2, Grid3x3, Square, VideoOff } from 'lucide-react';
import { PageHead } from '../components/ui';

const LAYOUTS = [
  { n: 1, icon: Square, label: '1 câmera' },
  { n: 4, icon: Grid2x2, label: '4 câmeras' },
  { n: 9, icon: Grid3x3, label: '9 câmeras' },
] as const;

/**
 * Monitoramento: grade de visualização das câmeras.
 * Ainda não há câmeras conectadas; quando houver, cada posição da grade recebe a imagem ao vivo.
 */
export default function Monitoramento() {
  const [layout, setLayout] = useState<1 | 4 | 9>(4);

  return (
    <div className="page">
      <PageHead
        title="Câmeras"
        description="Visualização ao vivo das câmeras do estabelecimento."
        actions={
          <div className="segmented" role="radiogroup" aria-label="Layout da grade">
            {LAYOUTS.map(({ n, icon: Icon, label }) => (
              <button key={n} role="radio" aria-checked={layout === n} className={layout === n ? 'is-active' : ''} onClick={() => setLayout(n)} title={label}>
                <Icon size={14} className="inline-icon" /> {n}
              </button>
            ))}
          </div>
        }
      />

      <div className="notice">
        <VideoOff size={18} />
        <span>Nenhuma câmera conectada ainda. Quando as câmeras forem integradas, as imagens ao vivo aparecem nesta grade.</span>
      </div>

      <div className={`cams cams--${layout}`}>
        {Array.from({ length: layout }, (_, i) => (
          <div key={i} className="cam">
            <div className="cam__screen">
              <VideoOff size={layout === 9 ? 22 : 30} strokeWidth={1.4} />
              <span>Sem sinal</span>
            </div>
            <div className="cam__label">
              <span className="cam__dot" />
              Câmera {String(i + 1).padStart(2, '0')} · não configurada
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

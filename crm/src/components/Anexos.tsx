import { useState, type DragEvent } from 'react';
import { ExternalLink, FileText, Paperclip, Trash2 } from 'lucide-react';
import { ANEXO_MAX_BYTES, ANEXOS_POR_REGISTRO } from '../../../shared/backend';
import { api } from '../lib/api';
import { num } from '../lib/format';
import { notify } from './ui';

/** PDF já gravado: o registro guarda só estes dados; o arquivo é buscado ao abrir. */
export interface Anexo { id: string; nome: string; tamanho: number; criadoEm?: string }
/** PDF escolhido no formulário, enviado junto com o registro ao salvar. */
export interface AnexoNovo { chave: string; nome: string; tamanho: number; dados: string }

export const anexosDe = (v: unknown): Anexo[] => (Array.isArray(v) ? (v as Anexo[]) : []);

export function tamanhoArquivo(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${num(bytes / 1024)} KB`;
  return `${num(bytes / (1024 * 1024), 1)} MB`;
}

const ehPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const ehImagem = (f: File) => /^image\/(jpeg|png|webp)$/.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name);

/** Lê o PDF como base64 (sem o prefixo "data:"), conferindo tipo e tamanho. */
function lerPdf(arquivo: File): Promise<AnexoNovo> {
  return new Promise((resolve, reject) => {
    if (!ehPdf(arquivo)) return reject(new Error(`"${arquivo.name}" não é um PDF.`));
    if (arquivo.size > ANEXO_MAX_BYTES) return reject(new Error(`"${arquivo.name}" passa de 5 MB.`));
    const leitor = new FileReader();
    leitor.onload = () => {
      const dados = String(leitor.result).split(',')[1] ?? '';
      // todo PDF começa com "%PDF" ("JVBER" em base64)
      if (!dados.startsWith('JVBER')) return reject(new Error(`"${arquivo.name}" não é um PDF válido.`));
      resolve({ chave: `${Date.now()}-${Math.random()}`, nome: arquivo.name, tamanho: arquivo.size, dados });
    };
    leitor.onerror = () => reject(new Error(`Não foi possível ler "${arquivo.name}".`));
    leitor.readAsDataURL(arquivo);
  });
}

/** Foto (de uma nota, um contrato…) vira um PDF de uma página, do tamanho da imagem. */
async function imagemEmPdf(arquivo: File): Promise<AnexoNovo> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`Não foi possível ler a imagem "${arquivo.name}".`));
      i.src = url;
    });
    // até 2000 px no lado maior: legível e bem abaixo do limite de 5 MB
    const escala = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * escala), h = Math.round(img.naturalHeight * escala);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: w > h ? 'landscape' : 'portrait', unit: 'px', format: [w, h], hotfixes: ['px_scaling'] });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, w, h);
    const dados = pdf.output('datauristring').split(',')[1] ?? '';
    const tamanho = Math.floor((dados.length * 3) / 4);
    if (tamanho > ANEXO_MAX_BYTES) throw new Error(`"${arquivo.name}" ficou maior que 5 MB.`);
    return { chave: `${Date.now()}-${Math.random()}`, nome: arquivo.name.replace(/\.[^.]+$/, '') + '.pdf', tamanho, dados };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Aceita PDF ou foto (JPG, PNG, WEBP); a foto é convertida em PDF. */
export function lerArquivo(arquivo: File): Promise<AnexoNovo> {
  if (ehPdf(arquivo)) return lerPdf(arquivo);
  if (ehImagem(arquivo)) return imagemEmPdf(arquivo);
  return Promise.reject(new Error(`"${arquivo.name}" não é PDF nem foto.`));
}

/** O que está sendo arrastado tem arquivo? (texto ou link arrastado é ignorado) */
export const arrastandoArquivo = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

/** Abre o PDF numa aba nova (ou baixa, se o navegador bloquear a aba). */
export async function abrirAnexo(a: Anexo) {
  // a aba é aberta no clique, antes de buscar o arquivo: assim o navegador não a trata como pop-up
  const aba = window.open('', '_blank');
  try {
    const { dados, nome } = await api<{ dados: string; nome: string }>(`/crm/anexos/${encodeURIComponent(a.id)}`);
    const bytes = Uint8Array.from(atob(dados), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    if (aba) aba.location.href = url;
    else {
      const link = document.createElement('a');
      link.href = url;
      link.download = nome;
      link.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    aba?.close();
    notify(e instanceof Error ? e.message : 'Não foi possível abrir o arquivo.', 'error');
  }
}

/** Campo do formulário: lista os PDFs do registro, abre, remove e escolhe novos (gravados ao salvar). */
export function AnexosCampo({ rotulo, salvos, novos, disabled, onChange }: {
  rotulo: string; salvos: Anexo[]; novos: AnexoNovo[]; disabled: boolean;
  onChange: (salvos: Anexo[], novos: AnexoNovo[]) => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const total = salvos.length + novos.length;

  const escolher = async (lista: FileList | null) => {
    const arquivos = Array.from(lista ?? []);
    if (!arquivos.length) return;
    setErro(null);
    if (total + arquivos.length > ANEXOS_POR_REGISTRO) return setErro(`Cada registro aceita até ${ANEXOS_POR_REGISTRO} PDFs.`);
    setLendo(true);
    try {
      const lidos = await Promise.all(arquivos.map(lerArquivo));
      onChange(salvos, [...novos, ...lidos]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.');
    } finally {
      setLendo(false);
    }
  };

  const [sobre, setSobre] = useState(false);
  const soltavel = !disabled && total < ANEXOS_POR_REGISTRO;

  return (
    <div
      className={`form-field form-field--wide anexos ${sobre ? 'is-soltando' : ''}`}
      onDragOver={(e) => { if (!soltavel || !arrastandoArquivo(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setSobre(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(false); }}
      onDrop={(e) => { if (!soltavel || !arrastandoArquivo(e)) return; e.preventDefault(); setSobre(false); void escolher(e.dataTransfer.files); }}
    >
      <label>{rotulo} (PDF)</label>
      {total > 0 ? (
        <ul className="anexos__lista">
          {salvos.map((a) => (
            <li key={a.id} className="anexos__item">
              <FileText size={16} />
              <button type="button" className="anexos__nome" onClick={() => void abrirAnexo(a)} title="Abrir PDF">{a.nome}</button>
              <span className="muted small nowrap">{tamanhoArquivo(a.tamanho)}</span>
              <button type="button" className="icon-btn" onClick={() => void abrirAnexo(a)} aria-label={`Abrir ${a.nome}`} title="Abrir"><ExternalLink size={15} /></button>
              {!disabled && (
                <button type="button" className="icon-btn" onClick={() => onChange(salvos.filter((x) => x.id !== a.id), novos)} aria-label={`Remover ${a.nome}`} title="Remover">
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
          {novos.map((a) => (
            <li key={a.chave} className="anexos__item anexos__item--novo">
              <FileText size={16} />
              <span className="anexos__nome">{a.nome}</span>
              <span className="muted small nowrap">{tamanhoArquivo(a.tamanho)} · enviado ao salvar</span>
              <button type="button" className="icon-btn" onClick={() => onChange(salvos, novos.filter((x) => x.chave !== a.chave))} aria-label={`Remover ${a.nome}`} title="Remover">
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">{disabled ? 'Nenhum PDF anexado.' : 'Nenhum PDF anexado ainda.'}</p>
      )}
      {!disabled && total < ANEXOS_POR_REGISTRO && (
        <div className="anexos__acoes">
          <label className={`btn btn--ghost btn--sm ${lendo ? 'is-disabled' : ''}`}>
            <Paperclip size={14} /> {lendo ? 'Lendo…' : 'Anexar PDF ou foto'}
            <input type="file" accept="application/pdf,.pdf,image/jpeg,image/png,image/webp" multiple hidden disabled={lendo} onChange={(e) => { void escolher(e.target.files); e.target.value = ''; }} />
          </label>
          <span className="muted small">Ou arraste o arquivo para cá. Até 5 MB por arquivo, {ANEXOS_POR_REGISTRO} por registro; foto vira PDF.</span>
        </div>
      )}
      {erro && <p className="error">{erro}</p>}
    </div>
  );
}

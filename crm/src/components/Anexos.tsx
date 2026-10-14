import { useEffect, useId, useRef, useState } from 'react';
import { ExternalLink, FileText, Paperclip, Trash2 } from 'lucide-react';
import { nomeDePdf, type Anexo } from '../../../shared/anexos';
import { anexos, api } from '../lib/api';
import { reload, useResource } from '../lib/data';
import { confirmar } from './pickers';
import { notify } from './ui';

const LIMITE = '5 MB';

function tamanhoLegivel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
const pareceePdf = (arquivo: File) => arquivo.type === 'application/pdf' || (!arquivo.type && /\.pdf$/i.test(arquivo.name));

interface AnexosProps {
  /** Título da seção (ex.: "Currículo e documentos"). */
  titulo: string;
  col: string;
  registroId: string;
  canEdit: boolean;
}

/** Documentos em PDF de um registro: lista, abre em nova guia, anexa e remove (na hora, sem depender de "Salvar"). */
export function Anexos({ titulo, col, registroId, canEdit }: AnexosProps) {
  const caminho = `/crm/anexos/${col}/${registroId}`;
  const { data, loading, error } = useResource<Anexo[]>(caminho);
  const tituloId = useId();
  const entrada = useRef<HTMLInputElement>(null);
  // a janela pode ser fechada no meio de um envio: os arquivos que faltam deixam de subir
  const montado = useRef(true);
  const abrindoAgora = useRef(false);
  const [envio, setEnvio] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const lista = [...(data ?? [])].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const handleEscolha = async (arquivos: File[]) => {
    if (!arquivos.length) return;
    setErro(null);
    const invalidos = arquivos.filter((a) => !pareceePdf(a)).map((a) => `"${a.name}"`);
    if (invalidos.length) return setErro(`Só arquivos PDF podem ser anexados: ${invalidos.join(', ')}.`);
    let enviados = 0;
    try {
      // um de cada vez: cada PDF sobe em partes, e assim uma falha diz exatamente qual arquivo não entrou
      for (const arquivo of arquivos) {
        if (!montado.current) return;
        setEnvio(arquivos.length > 1 ? `Enviando ${enviados + 1} de ${arquivos.length}…` : 'Enviando…');
        await anexos.enviar(col, registroId, arquivo);
        enviados++;
      }
      notify(enviados === 1 ? 'Documento anexado' : `${enviados} documentos anexados`);
    } catch (e) {
      const motivo = e instanceof Error ? e.message : 'Não foi possível anexar o documento.';
      if (montado.current) setErro(enviados ? `${enviados} de ${arquivos.length} anexados. ${motivo}` : motivo);
    } finally {
      if (montado.current) setEnvio(null);
      void reload(caminho);
    }
  };

  const handleAbrir = async (anexo: Anexo) => {
    if (abrindoAgora.current) return;
    abrindoAgora.current = true;
    setErro(null);
    // a guia é aberta já no clique (depois de esperar o arquivo, o navegador bloquearia como pop-up)
    const guia = window.open('', '_blank');
    if (guia) guia.opener = null;
    setAbrindo(anexo.id);
    try {
      const url = URL.createObjectURL(await anexos.baixar(col, anexo.id));
      if (guia) guia.location.href = url;
      else {
        const link = document.createElement('a');
        link.href = url;
        link.download = nomeDePdf(anexo.nome);
        link.click();
      }
      // o endereço temporário é liberado depois que a guia teve tempo de carregar o arquivo
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      guia?.close();
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o documento.');
    } finally {
      abrindoAgora.current = false;
      setAbrindo(null);
    }
  };

  const handleRemover = async (anexo: Anexo) => {
    if (!(await confirmar({ title: `Remover "${anexo.nome}"?`, message: 'O arquivo é apagado na hora e não pode ser recuperado.', confirmLabel: 'Remover', danger: true }))) return;
    setErro(null);
    try {
      await api(`/crm/anexos/${col}/${anexo.id}`, { method: 'DELETE' });
      notify('Documento removido');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível remover o documento.');
    } finally {
      void reload(caminho);
    }
  };

  return (
    <section className="anexos form-field--wide" aria-labelledby={tituloId}>
      <div className="anexos__head">
        <h3 id={tituloId}><Paperclip size={15} aria-hidden="true" /> {titulo}</h3>
        {canEdit && (
          <>
            <button type="button" className="btn btn--ghost btn--sm" aria-disabled={!!envio} onClick={() => !envio && entrada.current?.click()}>
              <Paperclip size={14} aria-hidden="true" /> Anexar PDF
            </button>
            <input ref={entrada} type="file" accept="application/pdf,.pdf" multiple hidden
              onChange={(e) => {
                // a lista do campo é esvaziada junto com ele: os arquivos são copiados antes de limpar
                const escolhidos = Array.from(e.target.files ?? []);
                e.target.value = '';
                void handleEscolha(escolhidos);
              }} />
          </>
        )}
      </div>
      <div role="status" aria-live="polite">
        {envio && <p className="muted small">{envio}</p>}
        {loading && <p className="muted small">Carregando documentos…</p>}
      </div>
      {!loading && (lista.length ? (
        <ul className="anexos__lista">
          {lista.map((a) => (
            <li key={a.id} className="anexo">
              <FileText size={18} className="anexo__icone" aria-hidden="true" />
              <div className="anexo__info">
                <span className="anexo__nome" title={a.nome}>{a.nome}</span>
                <span className="muted small">
                  {tamanhoLegivel(a.tamanho)} · {new Date(a.criadoEm).toLocaleDateString('pt-BR')}{a.criadoPorNome && ` · ${a.criadoPorNome}`}
                </span>
              </div>
              <div className="anexo__acoes">
                <button type="button" className="icon-btn" disabled={abrindo === a.id} onClick={() => void handleAbrir(a)} aria-label={`Abrir ${a.nome}`} title="Abrir em nova guia">
                  <ExternalLink size={16} />
                </button>
                {canEdit && (
                  <button type="button" className="icon-btn" onClick={() => void handleRemover(a)} aria-label={`Remover ${a.nome}`} title="Remover">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">
          Nenhum documento anexado{canEdit ? `. Anexe arquivos em PDF de até ${LIMITE} cada; eles são gravados na hora.` : '.'}
        </p>
      ))}
      {(erro || error) && <p className="error" role="alert">{erro ?? error}</p>}
    </section>
  );
}

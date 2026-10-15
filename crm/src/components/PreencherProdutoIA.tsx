import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { fichaDe } from '../lib/ficha';
import { preencherProdutoComIA } from '../lib/iaProduto';
import { notify } from './ui';

const vazio = (v: unknown) => v === undefined || v === null || v === '' || v === 0;

/**
 * Botão "Preencher com IA" do cadastro do produto: a partir do nome, da categoria e dos insumos da ficha técnica,
 * a IA escreve a descrição curta, a história, os ingredientes e o perfil da bebida.
 * Preenche só o que está vazio; se já estiver tudo preenchido, refaz tudo.
 */
export function PreencherProdutoIA({ data, onPreencher }: { data: Record<string, unknown>; onPreencher: (patch: Record<string, unknown>) => void }) {
  const [gerando, setGerando] = useState(false);

  const gerar = async () => {
    setGerando(true);
    try {
      const insumos = fichaDe(data.ficha).itens.map((i) => String(i.insumo ?? '').trim()).filter(Boolean);
      const r = await preencherProdutoComIA({ nome: String(data.nome ?? ''), categoria: String(data.categoria ?? ''), descricao: String(data.descricao ?? ''), insumos });
      const sugestao: Record<string, unknown> = {
        resumo: r.resumo, descricao: r.historia, ingredientes: r.ingredientes.join(', '),
        teor: r.teor || '', docura: r.docura || '', amargor: r.amargor || '', acidez: r.acidez || '', intensidade: r.intensidade || '',
        notas: r.notas.join(', '),
      };
      const vazios = Object.keys(sugestao).filter((k) => vazio(data[k]));
      const chaves = vazios.length ? vazios : Object.keys(sugestao);
      onPreencher(Object.fromEntries(chaves.map((k) => [k, sugestao[k]])));
      notify(vazios.length
        ? `A IA preencheu ${vazios.length} ${vazios.length === 1 ? 'campo' : 'campos'} que estavam vazios. Confira antes de salvar.`
        : 'A IA reescreveu a descrição, os ingredientes e o perfil. Confira antes de salvar.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Não foi possível usar a IA agora.', 'error');
    } finally {
      setGerando(false);
    }
  };

  return (
    <div className="form-field form-field--wide compra__ia">
      <div>
        <strong><Sparkles size={15} /> Preencher com IA</strong>
        <p className="muted small">
          A partir do nome, da categoria e da ficha técnica, a IA escreve a descrição, a história, os ingredientes e o perfil da bebida.
          Preenche só o que estiver vazio. Você confere antes de salvar.
        </p>
      </div>
      <button type="button" className={`btn btn--primary ${gerando ? 'is-disabled' : ''}`} disabled={gerando} onClick={() => void gerar()}>
        <Sparkles size={16} /> {gerando ? 'Escrevendo…' : 'Preencher com IA'}
      </button>
    </div>
  );
}

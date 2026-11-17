import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, ImageOff, Loader2, RefreshCw, Sparkles, Square, Upload } from 'lucide-react';
import type { Row } from '../lib/data';
import { fotoComPlaquinha, realcarFoto } from '../lib/acabamentoChopp';
import {
  ErroDaChave, MODELOS_CHOPP, abrirGeminiSobreposto, copoDoChopp, estiloDoChopp, gerarFotoGrupo, grupoDoChopp, promptDaFotoGrupo,
  type Copo, type GrupoChopp,
} from '../lib/iaFoto';
import { baixar, copiar } from './GerarFotoIA';
import { Modal, notify } from './ui';

const COPOS: Copo[] = ['Half-pint', 'Pint', 'Jarra'];
type Modo = 'gratis' | 'automatico';
type Membro = { row: Row; estilo: string };
type Grupo = { chave: string; grupo: GrupoChopp; copo: Copo; membros: Membro[] };
type Estado = { st: 'fila' | 'aberto' | 'gerando' | 'acabando' | 'pronta' | 'erro' | 'salva'; novas?: Record<string, string>; erro?: string };

const temFoto = (r: Row) => typeof r.foto === 'string' && !!r.foto;

/** Junta os chopes por grupo de cor e copo: uma foto do Gemini serve para todos do grupo, cada um com a sua plaquinha. */
function agrupar(rows: Row[]): Grupo[] {
  const mapa = new Map<string, Grupo>();
  const ordem = ['escuro', 'acobreado', 'alaranjado', 'claro', 'trigo'];
  for (const row of rows) {
    const nome = String(row.nome ?? ''), tamanho = String(row.tamanho ?? '');
    const estilo = estiloDoChopp(nome, tamanho);
    const grupo = grupoDoChopp(estilo);
    const copo = copoDoChopp(nome, tamanho);
    const chave = `${grupo.id}|${copo}`;
    if (!mapa.has(chave)) mapa.set(chave, { chave, grupo, copo, membros: [] });
    mapa.get(chave)!.membros.push({ row, estilo });
  }
  const pos = (g: Grupo) => { const i = ordem.indexOf(g.grupo.id); return i < 0 ? ordem.length : i; };
  return [...mapa.values()]
    .map((g) => ({ ...g, membros: g.membros.sort((a, b) => a.estilo.localeCompare(b.estilo, 'pt-BR')) }))
    .sort((a, b) => pos(a) - pos(b) || a.grupo.nome.localeCompare(b.grupo.nome, 'pt-BR') || COPOS.indexOf(a.copo) - COPOS.indexOf(b.copo));
}

/**
 * Fotos dos chopes do cardápio por grupo de cor: chopes de cor parecida usam a mesma foto do Gemini (uma por copo). Quando a foto
 * volta (colada com Ctrl+V, enviada ou gerada pela API), o Cérebro realça contraste e nitidez e escreve a plaquinha de cada chopp.
 */
export function GerarFotosChopes({ rows, onSalvar, onFim, onClose }: {
  rows: Row[];
  onSalvar: (id: string, foto: string) => Promise<unknown>;
  onFim: () => Promise<unknown> | void;
  onClose: () => void;
}) {
  const grupos = useMemo(() => agrupar(rows), [rows]);
  const [modo, setModo] = useState<Modo>('gratis');
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(grupos.filter((g) => !g.membros.every((m) => !!m.row.fotoCardapio)).map((g) => g.chave)));
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [rodando, setRodando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const parar = useRef<AbortController | null>(null);
  const ultimoAberto = useRef<string | null>(null);

  const mudar = (chave: string, e: Estado) => setEstados((s) => ({ ...s, [chave]: e }));
  const est = (g: Grupo): Estado => estados[g.chave] ?? { st: 'fila' };
  /** Já trocado: salvo agora ou numa vez anterior (todos os chopes do grupo com `fotoCardapio`), e não reaberto com "Refazer". */
  const trocado = (g: Grupo) => est(g).st === 'salva' || (!estados[g.chave] && g.membros.every((m) => !!m.row.fotoCardapio));
  const itens = grupos.filter((g) => !trocado(g));
  const trocados = grupos.filter(trocado);
  const prontos = itens.filter((g) => est(g).st === 'pronta');
  const fotosProntas = prontos.reduce((t, g) => t + g.membros.length, 0);
  const aFazer = itens.filter((g) => marcados.has(g.chave) && ['fila', 'erro'].includes(est(g).st));
  const proximo = itens.find((g) => marcados.has(g.chave) && est(g).st === 'fila');
  const restantes = itens.filter((g) => marcados.has(g.chave) && est(g).st === 'fila').length;

  /** Realça a foto do grupo e monta a de cada chopp, com a plaquinha dele. */
  const acabar = async (g: Grupo, foto: Blob) => {
    mudar(g.chave, { st: 'acabando' });
    try {
      const base = await realcarFoto(foto, g.copo);
      const novas: Record<string, string> = {};
      for (const m of g.membros) novas[m.row.id] = await fotoComPlaquinha(base, g.copo, m.estilo);
      mudar(g.chave, { st: 'pronta', novas });
    } catch (e) {
      mudar(g.chave, { st: 'erro', erro: e instanceof Error ? e.message : 'Não foi possível preparar a foto.' });
    }
  };

  /** Grátis: copia o pedido do grupo, baixa a foto modelo do copo e abre o Gemini por cima do Cérebro. */
  const abrirNoGemini = (g: Grupo) => {
    const copiou = copiar(promptDaFotoGrupo(g.grupo, g.copo));
    const modelo = MODELOS_CHOPP[g.copo];
    baixar(modelo.url, modelo.arquivo);
    abrirGeminiSobreposto();
    ultimoAberto.current = g.chave;
    mudar(g.chave, { st: 'aberto' });
    void copiou.then((ok) => notify(ok
      ? `Pedido de "${g.grupo.nome} · ${g.copo}" copiado e foto modelo baixada. No Gemini: anexe a foto modelo, cole o pedido e envie. Depois copie a imagem pronta e cole aqui (Ctrl+V).`
      : 'Foto modelo baixada, mas não deu para copiar o pedido: toque em "Copiar de novo" no cartão.', ok ? 'ok' : 'error'));
  };

  // Ctrl+V com a imagem copiada no Gemini vai para o último grupo aberto
  const acabarRef = useRef(acabar);
  acabarRef.current = acabar;
  useEffect(() => {
    const colar = (e: ClipboardEvent) => {
      const arquivo = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
      if (!arquivo) return;
      const g = grupos.find((x) => x.chave === ultimoAberto.current);
      if (!g) { notify('Toque em "Copiar pedido" num grupo antes de colar a foto pronta.', 'error'); return; }
      e.preventDefault();
      void acabarRef.current(g, arquivo).then(() => notify(`Foto colada em "${g.grupo.nome} · ${g.copo}". Confira e toque em "Trocar".`));
    };
    window.addEventListener('paste', colar);
    return () => window.removeEventListener('paste', colar);
  }, [grupos]);

  /** Automático: um grupo por vez pela API (a cota não aguenta muitos juntos); erro de chave para a fila inteira. */
  const gerar = async (lista: Grupo[]) => {
    setErroGeral(null);
    setRodando(true);
    const ctl = new AbortController();
    parar.current = ctl;
    try {
      for (const g of lista) {
        if (ctl.signal.aborted) break;
        mudar(g.chave, { st: 'gerando' });
        try {
          await acabar(g, await gerarFotoGrupo(g.grupo, g.copo, ctl.signal));
        } catch (e) {
          if (ctl.signal.aborted) { mudar(g.chave, { st: 'fila' }); break; }
          const msg = e instanceof Error ? e.message : 'Não foi possível gerar.';
          mudar(g.chave, { st: 'erro', erro: msg });
          if (e instanceof ErroDaChave) { setErroGeral(msg); break; }
        }
      }
    } finally {
      parar.current = null;
      setRodando(false);
    }
  };

  /** Troca as fotos de todos os chopes dos grupos prontos; o grupo trocado vai para "Já trocadas". */
  const salvar = async (lista: Grupo[] = prontos) => {
    setSalvando(true);
    let feitas = 0;
    try {
      for (const g of lista) {
        const e = estados[g.chave];
        try {
          for (const m of g.membros) { await onSalvar(m.row.id, e.novas![m.row.id]); feitas++; }
          mudar(g.chave, { ...e, st: 'salva' });
        } catch (err) {
          mudar(g.chave, { ...e, st: 'erro', erro: err instanceof Error ? err.message : 'Não foi possível salvar.' });
        }
      }
      await onFim();
      notify(feitas === 1 ? '1 foto trocada.' : `${feitas} fotos trocadas.`);
    } finally {
      setSalvando(false);
    }
  };

  const fechar = () => { parar.current?.abort(); onClose(); };
  const marcar = (chave: string, sim: boolean) => setMarcados((m) => { const n = new Set(m); if (sim) n.add(chave); else n.delete(chave); return n; });

  return (
    <Modal
      title="Gerar fotos dos chopes do cardápio"
      onClose={fechar}
      width={1100}
      footer={
        <>
          <button className="btn btn--ghost" onClick={fechar}>Fechar</button>
          {modo === 'gratis'
            ? <button className="btn btn--ghost" disabled={!proximo || salvando} onClick={() => proximo && abrirNoGemini(proximo)}>
                <ExternalLink size={16} /> {proximo ? `Abrir o próximo no Gemini (${restantes})` : 'Todos abertos'}
              </button>
            : rodando
              ? <button className="btn btn--ghost" onClick={() => parar.current?.abort()}><Square size={14} /> Parar</button>
              : <button className="btn btn--ghost" disabled={!aFazer.length || salvando} onClick={() => void gerar(aFazer)}><Sparkles size={16} /> Gerar {aFazer.length} {aFazer.length === 1 ? 'grupo' : 'grupos'}</button>}
          <button className="btn btn--primary" disabled={!prontos.length || rodando || salvando} onClick={() => void salvar()}>
            <Check size={16} /> {salvando ? 'Salvando…' : `Trocar ${fotosProntas} ${fotosProntas === 1 ? 'foto' : 'fotos'}`}
          </button>
        </>
      }
    >
      <div className="refazer-fotos">
        <div className="refazer-fotos__modos" role="tablist">
          <button role="tab" aria-selected={modo === 'gratis'} className={modo === 'gratis' ? 'is-on' : ''} disabled={rodando} onClick={() => setModo('gratis')}>Grátis, pelo app do Gemini</button>
          <button role="tab" aria-selected={modo === 'automatico'} className={modo === 'automatico' ? 'is-on' : ''} disabled={rodando} onClick={() => setModo('automatico')}>Automático (chave com faturamento)</button>
        </div>
        <p className="muted small">
          Chopes de cor parecida usam a mesma foto: {grupos.length} {grupos.length === 1 ? 'foto gera' : 'fotos geram'} os {rows.length} chopes. {modo === 'gratis'
            ? 'Toque em "Copiar pedido" num grupo: o pedido é copiado, a foto modelo do copo é baixada e o Gemini abre por cima do Cérebro. Lá, anexe a foto modelo, cole o pedido e envie; depois copie a imagem pronta e cole aqui (Ctrl+V).'
            : 'Cada grupo marcado vai para o Gemini com a foto modelo do copo. Usa a chave da IA de Configurações → Parâmetros, que precisa do faturamento ativo no Google AI Studio.'}
          {' '}O grupo trocado desce para "Já trocadas", e a lista de cima mostra só o que falta. A foto do Gemini vem com a plaquinha em branco: ao colar aqui, o Cérebro realça contraste, nitidez e o logo e escreve a plaquinha de cada chopp; confira e toque em "Trocar".
        </p>
        <div className="refazer-fotos__filtro">
          <span>{[...marcados].filter((k) => itens.some((g) => g.chave === k)).length} de {itens.length} grupos marcados</span>
          {COPOS.map((c) => (
            <button key={c} className="btn btn--ghost btn--sm" disabled={rodando} onClick={() => setMarcados(new Set(itens.filter((g) => g.copo === c).map((g) => g.chave)))}>Só {c}</button>
          ))}
          <button className="btn btn--ghost btn--sm" disabled={rodando} onClick={() => setMarcados(new Set(itens.map((g) => g.chave)))}>Todos</button>
          <button className="btn btn--ghost btn--sm" disabled={rodando} onClick={() => setMarcados(new Set())}>Nenhum</button>
        </div>
        {erroGeral && <p className="error">{erroGeral}</p>}
        <ul className="refazer-fotos__lista">
          {itens.map((g) => {
            const e = est(g);
            const marcado = marcados.has(g.chave);
            const atual = g.membros.find((m) => temFoto(m.row))?.row.foto as string | undefined;
            const capa = e.novas?.[g.membros[0].row.id];
            return (
              <li key={g.chave} className={`refazer-fotos__item is-${e.st}${marcado ? '' : ' is-fora'}`}>
                <label className="refazer-fotos__nome">
                  <input type="checkbox" checked={marcado} disabled={rodando} onChange={(ev) => marcar(g.chave, ev.target.checked)} />
                  <strong>{g.grupo.nome} · {g.copo}</strong>
                </label>
                <p className="muted small fotos-chopes__membros">{g.membros.map((m) => m.estilo).join(', ')}</p>
                <div className="gerar-foto__comparar">
                  <figure>
                    <figcaption>Atual</figcaption>
                    {atual ? <img src={atual} alt="" loading="lazy" /> : <span className="gerar-foto__vazio"><ImageOff size={20} /> Sem foto</span>}
                  </figure>
                  <figure className={capa ? 'is-nova' : ''}>
                    <figcaption>Nova</figcaption>
                    {capa ? <img src={capa} alt="" />
                      : <span className="gerar-foto__vazio">{['gerando', 'acabando'].includes(e.st) ? <><Loader2 size={20} className="spin" /> {e.st === 'gerando' ? 'Gerando…' : 'Realçando…'}</> : e.st === 'aberto' ? 'Aberto no Gemini' : e.st === 'erro' ? 'Falhou' : marcado ? 'Na fila' : '—'}</span>}
                  </figure>
                </div>
                {e.novas && g.membros.length > 1 && (
                  <div className="fotos-chopes__miniaturas">
                    {g.membros.map((m) => <img key={m.row.id} src={e.novas![m.row.id]} alt={m.estilo} title={m.estilo} />)}
                  </div>
                )}
                {e.st === 'erro' && <p className="error small">{e.erro}</p>}
                <div className="refazer-fotos__acoes">
                  {e.st === 'pronta' && (
                    <span className="refazer-fotos__botoes">
                      <button className="btn btn--primary btn--sm" disabled={rodando || salvando} onClick={() => void salvar([g])}>
                        <Check size={13} /> Trocar {g.membros.length === 1 ? 'esta' : `as ${g.membros.length}`}
                      </button>
                    </span>
                  )}
                  {modo === 'gratis' && (
                    <span className="refazer-fotos__botoes">
                      <button className="btn btn--ghost btn--sm" disabled={salvando} onClick={() => abrirNoGemini(g)} title="Copia o pedido, baixa a foto modelo e abre o Gemini por cima do Cérebro">
                        <Copy size={13} /> {e.st === 'fila' ? 'Copiar pedido' : 'Copiar de novo'}
                      </button>
                      <label className="btn btn--ghost btn--sm">
                        <Upload size={13} /> {e.novas ? 'Outra foto' : 'Enviar foto pronta'}
                        <input type="file" accept="image/*" hidden onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void acabar(g, f); ev.target.value = ''; }} />
                      </label>
                    </span>
                  )}
                  {modo === 'automatico' && ['pronta', 'erro'].includes(e.st) && (
                    <button className="btn btn--ghost btn--sm" disabled={rodando || salvando} onClick={() => void gerar([g])}><RefreshCw size={13} /> Gerar de novo</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {!itens.length && <p className="muted small">Todas as fotos dos chopes já foram trocadas.</p>}
        {trocados.length > 0 && (
          <>
            <h3 className="fotos-chopes__titulo"><Check size={16} /> Já trocadas ({trocados.length})</h3>
            <ul className="fotos-chopes__trocadas">
              {trocados.map((g) => {
                const atual = g.membros.find((m) => temFoto(m.row))?.row.foto as string | undefined;
                return (
                  <li key={g.chave}>
                    {atual ? <img src={atual} alt="" loading="lazy" /> : <span className="gerar-foto__vazio"><ImageOff size={18} /></span>}
                    <div>
                      <strong>{g.grupo.nome} · {g.copo}</strong>
                      <p className="muted small">{g.membros.map((m) => m.estilo).join(', ')}</p>
                    </div>
                    <button className="btn btn--ghost btn--sm" disabled={rodando || salvando} onClick={() => { mudar(g.chave, { st: 'fila' }); marcar(g.chave, true); }} title="Volta este grupo para a lista de cima para gerar a foto de novo">
                      <RefreshCw size={13} /> Refazer
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}

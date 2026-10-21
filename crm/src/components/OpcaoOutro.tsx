import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Check, Plus } from 'lucide-react';
import { api } from '../lib/api';

/**
 * Listas com a opção "Outro": ao escolhê-la, abre um campo para descrever o que é e, depois, pergunta se o texto
 * vira uma opção permanente daquela lista. As opções acrescentadas ficam em `opcoes/<lista>` no Firestore
 * (`lista` = "<cadastro>__<campo>", ex.: "estoque__categoria") e valem para toda a equipe.
 */

/** "Outro", "Outros", "Outra"... */
export const ehOutro = (o: string) => /^outr[oa]s?$/i.test(o.trim());
export const listaDe = (cadastro: string, campo: string) => `${cadastro}__${campo}`.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60);

/* ---------- opções acrescentadas (uma leitura para todas as listas da tela) ---------- */
let extras: Record<string, string[]> = {};
let carregando: Promise<void> | null = null;
let carregado = false;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((l) => l());

function carregar() {
  carregando ??= api<Record<string, string[]>>('/crm/opcoes')
    .then((d) => { extras = d ?? {}; carregado = true; avisar(); })
    .catch(() => undefined)
    .finally(() => { carregando = null; });
  return carregando;
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && carregado && void carregar());

export function useOpcoesExtras(lista?: string): string[] {
  const todas = useSyncExternalStore((l) => { ouvintes.add(l); return () => ouvintes.delete(l); }, () => extras);
  useEffect(() => { if (lista && !carregado) void carregar(); }, [lista]);
  return (lista && todas[lista]) || [];
}

export async function adicionarOpcao(lista: string, valor: string) {
  await api(`/crm/opcoes/${lista}`, { method: 'POST', body: { valor } });
  await carregar();
}
export async function removerOpcao(lista: string, valor: string) {
  await api(`/crm/opcoes/${lista}`, { method: 'DELETE', body: { valor } });
  await carregar();
}

/** Opções da lista com as acrescentadas pela equipe, logo antes do "Outro". */
export function comExtras<T extends string | { value: string; label: string }>(options: T[], acrescentadas: string[]): (T | string)[] {
  const valor = (o: T | string) => (typeof o === 'string' ? o : o.value);
  const novas = acrescentadas.filter((x) => !options.some((o) => valor(o).toLowerCase() === x.toLowerCase()));
  if (!novas.length) return options;
  const i = options.findIndex((o) => ehOutro(valor(o)));
  return i < 0 ? [...options, ...novas] : [...options.slice(0, i), ...novas, ...options.slice(i)];
}

/**
 * Estado do "Outro" de uma lista. `escolher` substitui o onChange do seletor; `painel` vai logo abaixo dele
 * (campo para descrever e, depois, a pergunta se vira opção permanente).
 * `onChange` recebe cada mudança (inclusive o texto digitado); `onEscolha`, só a escolha final.
 */
export function useOutro({ lista, options, onChange, onEscolha, rotulo, disabled }: {
  lista?: string; options: string[]; onChange: (v: string) => void; onEscolha?: (v: string) => void; rotulo?: string; disabled?: boolean;
}) {
  const acrescentadas = useOpcoesExtras(lista);
  const [modo, setModo] = useState<'fechado' | 'descrevendo' | 'perguntando'>('fechado');
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const todas = comExtras(options, acrescentadas) as string[];

  const escolher = (v: string) => {
    setErro(null);
    if (ehOutro(v) && !disabled) {
      setTexto('');
      setModo('descrevendo');
      onChange('');
      return;
    }
    setModo('fechado');
    onChange(v);
    onEscolha?.(v);
  };

  const concluir = () => {
    const t = texto.trim();
    if (!t) return;
    onChange(t);
    const jaExiste = todas.some((o) => o.toLowerCase() === t.toLowerCase());
    if (lista && !jaExiste) setModo('perguntando');
    else { setModo('fechado'); onEscolha?.(t); }
  };

  const responder = async (adicionar: boolean) => {
    const t = texto.trim();
    if (adicionar && lista) {
      setSalvando(true); setErro(null);
      try { await adicionarOpcao(lista, t); } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível adicionar.'); setSalvando(false); return; }
      setSalvando(false);
    }
    setModo('fechado');
    onEscolha?.(t);
  };

  let painel: ReactNode = null;
  if (modo === 'descrevendo') {
    painel = (
      <div className="outro">
        <input
          className="input input--sm"
          autoFocus
          maxLength={60}
          aria-label={`Descreva ${rotulo ? `o que é o "Outro" em ${rotulo.toLowerCase()}` : 'o que é o "Outro"'}`}
          placeholder="Descreva o que é…"
          value={texto}
          onChange={(e) => { setTexto(e.target.value); onChange(e.target.value.trim()); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); concluir(); }
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setModo('fechado'); }
          }}
          onBlur={(e) => { if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node) && texto.trim()) concluir(); }}
        />
        <button type="button" className="btn btn--ghost btn--sm" disabled={!texto.trim()} onClick={concluir} title="Confirmar">
          <Check size={14} /> OK
        </button>
      </div>
    );
  } else if (modo === 'perguntando') {
    painel = (
      <div className="outro outro--pergunta" role="group" aria-label="Adicionar como opção permanente">
        <span className="outro__texto">Adicionar <strong>“{texto.trim()}”</strong> como opção permanente{rotulo ? ` de ${rotulo.toLowerCase()}` : ''}?</span>
        <span className="outro__acoes">
          <button type="button" className="btn btn--primary btn--sm" disabled={salvando} onClick={() => void responder(true)}>
            <Plus size={14} /> {salvando ? 'Adicionando…' : 'Adicionar'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" disabled={salvando} onClick={() => void responder(false)}>Só desta vez</button>
        </span>
        {erro && <span className="error">{erro}</span>}
      </div>
    );
  }

  return { opcoes: todas, acrescentadas, escolher, painel, descrevendo: modo === 'descrevendo' };
}

/** `<select>` simples (tabelas e telas compactas) com o "Outro" que abre o campo de descrição. */
export function SelectComOutro({ lista, options, value, onChange, onEscolha, rotulo, className = 'input', vazio, disabled, ...rest }: {
  lista?: string; options: string[]; value: string; onChange: (v: string) => void; onEscolha?: (v: string) => void;
  rotulo?: string; className?: string; vazio?: string; disabled?: boolean; 'aria-label'?: string; id?: string;
}) {
  const o = useOutro({ lista, options, onChange, onEscolha, rotulo, disabled });
  const outro = o.opcoes.find(ehOutro) ?? 'Outro';
  // valor que não está na lista (ex.: um "Outro" descrito só daquela vez) continua aparecendo
  const itens = value && !o.opcoes.includes(value) ? [...o.opcoes, value] : o.opcoes;
  return (
    <div className="select-outro">
      <select {...rest} className={className} disabled={disabled} value={o.descrevendo ? outro : value} onChange={(e) => o.escolher(e.target.value)}>
        {vazio !== undefined && <option value="">{vazio}</option>}
        {itens.map((x) => <option key={x}>{x}</option>)}
      </select>
      {o.painel}
    </div>
  );
}

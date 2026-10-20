import { useMemo, useState, type ReactNode } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Columns3, ImageOff, LayoutGrid, Table2 } from 'lucide-react';
import { STATUS_KEYS, toneOf, type CollectionDef, type Field } from '../collections';
import type { Row } from '../lib/data';
import { isoToday } from '../lib/format';
import { Badge } from './ui';

/* ---------- formas de ver um cadastro: tabela, cartões com foto, quadro por status e calendário ---------- */
export type Visao = 'tabela' | 'cartoes' | 'quadro' | 'calendario';

/** Campo usado para as colunas do quadro: um status com 3 ou mais etapas (ex.: Planejado → Em andamento → Concluído). */
export function campoDoQuadro(def: CollectionDef): Field | undefined {
  const opcoes = def.fields.filter((f) => f.type === 'select' && STATUS_KEYS.includes(f.key) && (f.options?.length ?? 0) >= 3);
  return opcoes.find((f) => f.key === 'status') ?? opcoes[0];
}
/** Data usada no calendário: a mais importante do cadastro (vencimento, prazo, audiência, validade… e por último a data). */
const DATAS = ['vencimento', 'prazo', 'audiencia', 'validade', 'proximaParcela', 'data', 'inicio', 'abertura', 'emissao', 'entrada', 'admissao', 'aquisicao'];
export function campoDoCalendario(def: CollectionDef): Field | undefined {
  const datas = def.fields.filter((f) => f.type === 'date');
  return DATAS.map((k) => datas.find((f) => f.key === k)).find(Boolean) ?? datas[0];
}
/** Visualizações que fazem sentido neste cadastro. */
export function visoesDe(def: CollectionDef): Visao[] {
  return ['tabela', ...(def.comFoto ? ['cartoes' as const] : []), ...(campoDoQuadro(def) ? ['quadro' as const] : []), ...(campoDoCalendario(def) ? ['calendario' as const] : [])];
}

const ICONES: Record<Visao, { icon: typeof Table2; label: string }> = {
  tabela: { icon: Table2, label: 'Tabela' },
  cartoes: { icon: LayoutGrid, label: 'Cartões' },
  quadro: { icon: Columns3, label: 'Quadro' },
  calendario: { icon: CalendarDays, label: 'Calendário' },
};
export function SeletorVisao({ visoes, valor, onChange }: { visoes: Visao[]; valor: Visao; onChange: (v: Visao) => void }) {
  if (visoes.length < 2) return null;
  return (
    <div className="segmented visao-seletor" role="radiogroup" aria-label="Forma de visualizar">
      {visoes.map((v) => {
        const { icon: Icon, label } = ICONES[v];
        return (
          <button key={v} type="button" role="radio" aria-checked={valor === v} className={valor === v ? 'is-active' : ''} onClick={() => onChange(v)} title={label}>
            <Icon size={15} /> <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A visualização escolhida fica lembrada por tela (neste navegador). */
export function useVisao(def: CollectionDef, chave: string) {
  const visoes = visoesDe(def);
  const k = `dindo-crm:visao:${chave}`;
  const [v, setV] = useState<Visao>(() => {
    try { const s = localStorage.getItem(k) as Visao | null; return s && visoes.includes(s) ? s : 'tabela'; } catch { return 'tabela'; }
  });
  const mudar = (nova: Visao) => { setV(nova); try { localStorage.setItem(k, nova); } catch { /* sem armazenamento: fica só nesta visita */ } };
  return { visoes, visao: visoes.includes(v) ? v : 'tabela', mudar };
}

interface Comum {
  def: CollectionDef;
  rows: Row[];
  onAbrir: (r: Row) => void;
  /** Valor de um campo já formatado (dinheiro, data, status…). */
  fmt: (f: Field, v: unknown) => ReactNode;
  titulo: (r: Row) => string;
}
/** Os campos que aparecem no cartão: os da tabela, menos o título, o status e a foto. */
const camposDoCartao = (def: CollectionDef, sem: string[] = []) =>
  def.fields.filter((f) => !f.formOnly && f.key !== def.fields[0].key && !STATUS_KEYS.includes(f.key) && !sem.includes(f.key) && f.type !== 'url').slice(0, 3);
const statusDe = (def: CollectionDef, r: Row) => {
  const f = def.fields.find((x) => STATUS_KEYS.includes(x.key) && r[x.key]);
  return f ? String(r[f.key]) : '';
};

/* ---------- cartões (galeria com foto) ---------- */
export function VisaoCartoes({ def, rows, onAbrir, fmt, titulo, sel, marcar }: Comum & { sel: Set<string>; marcar: (id: string, on: boolean) => void }) {
  const campos = camposDoCartao(def);
  return (
    <div className="cartoes">
      {rows.map((r) => {
        const st = statusDe(def, r);
        return (
          <article key={r.id} className={`cartao ${sel.has(r.id) ? 'is-selecionado' : ''}`} onClick={() => onAbrir(r)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onAbrir(r)}>
            <div className="cartao__foto">
              {typeof r.foto === 'string' && r.foto ? <img src={r.foto} alt="" loading="lazy" /> : <span className="cartao__sem"><ImageOff size={22} /></span>}
              <input type="checkbox" className="sel-check cartao__sel" checked={sel.has(r.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => marcar(r.id, e.target.checked)} aria-label={`Selecionar ${titulo(r)}`} />
              {st && <span className="cartao__status"><Badge tone={toneOf(st)}>{st}</Badge></span>}
            </div>
            <div className="cartao__corpo">
              <b className="cartao__titulo">{titulo(r)}</b>
              {campos.map((f) => (r[f.key] !== undefined && r[f.key] !== '' && r[f.key] !== null) && (
                <span key={f.key} className="cartao__linha"><span className="muted">{f.label}</span> {fmt(f, r[f.key])}</span>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ---------- quadro por status (arrastar o cartão muda o status) ---------- */
export function VisaoQuadro({ def, rows, onAbrir, fmt, titulo, podeMover, onMover }: Comum & { podeMover: boolean; onMover: (r: Row, valor: string) => void }) {
  const campo = campoDoQuadro(def)!;
  const colunas = [...(campo.options ?? []), ...(rows.some((r) => !r[campo.key] || !campo.options?.includes(String(r[campo.key]))) ? ['—'] : [])];
  const campos = camposDoCartao(def, [campo.key]).slice(0, 2);
  const [sobre, setSobre] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const daColuna = (c: string) => rows.filter((r) => (c === '—' ? !r[campo.key] || !campo.options?.includes(String(r[campo.key])) : r[campo.key] === c));
  return (
    <div className="quadro" role="list">
      {colunas.map((c) => {
        const itens = daColuna(c);
        return (
          <section
            key={c} className={`quadro__coluna ${sobre === c ? 'is-sobre' : ''}`} aria-label={c}
            onDragOver={(e) => { if (!podeMover || !arrastando || c === '—') return; e.preventDefault(); setSobre(c); }}
            onDragLeave={() => setSobre((s) => (s === c ? null : s))}
            onDrop={(e) => {
              e.preventDefault(); setSobre(null);
              const r = rows.find((x) => x.id === arrastando); setArrastando(null);
              if (r && c !== '—' && r[campo.key] !== c) onMover(r, c);
            }}
          >
            <header className="quadro__topo">
              <Badge tone={c === '—' ? 'neutral' : toneOf(c)}>{c === '—' ? 'Sem ' + campo.label.toLowerCase() : c}</Badge>
              <span className="muted small">{itens.length}</span>
            </header>
            <div className="quadro__itens">
              {itens.map((r) => (
                <article
                  key={r.id} className={`quadro__cartao ${arrastando === r.id ? 'is-arrastando' : ''}`} draggable={podeMover}
                  onDragStart={(e) => { setArrastando(r.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.id); }}
                  onDragEnd={() => { setArrastando(null); setSobre(null); }}
                  onClick={() => onAbrir(r)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onAbrir(r)}
                  title={podeMover ? 'Arraste para outra coluna para mudar o ' + campo.label.toLowerCase() : undefined}
                >
                  {typeof r.foto === 'string' && r.foto && <img src={r.foto} alt="" loading="lazy" />}
                  <b>{titulo(r)}</b>
                  {campos.map((f) => (r[f.key] !== undefined && r[f.key] !== '' && r[f.key] !== null) && (
                    <span key={f.key} className="small"><span className="muted">{f.label}:</span> {fmt(f, r[f.key])}</span>
                  ))}
                  {/* celular: sem arrastar, muda pelo seletor */}
                  {podeMover && (
                    <select className="quadro__mover" value={String(r[campo.key] ?? '')} onClick={(e) => e.stopPropagation()} onChange={(e) => onMover(r, e.target.value)} aria-label={`Mudar ${campo.label.toLowerCase()} de ${titulo(r)}`}>
                      {(campo.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
                </article>
              ))}
              {!itens.length && <p className="muted small quadro__vazio">{podeMover && c !== '—' ? 'Arraste um cartão para cá' : 'Nada aqui'}</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ---------- calendário (pela data principal do cadastro) ---------- */
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function VisaoCalendario({ def, rows, onAbrir, titulo }: Comum) {
  const campo = campoDoCalendario(def)!;
  const [base, setBase] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const hoje = isoToday();
  const celulas = useMemo(() => {
    const ini = new Date(base); ini.setDate(1 - base.getDay());
    const fim = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    const semanas = Math.ceil((base.getDay() + fim.getDate()) / 7);
    return Array.from({ length: semanas * 7 }, (_, i) => { const d = new Date(ini); d.setDate(ini.getDate() + i); return d; });
  }, [base]);
  const porDia = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) { const d = String(r[campo.key] ?? '').slice(0, 10); if (d) m.set(d, [...(m.get(d) ?? []), r]); }
    return m;
  }, [rows, campo.key]);
  const mesIso = iso(base).slice(0, 7);
  const noMes = rows.filter((r) => String(r[campo.key] ?? '').slice(0, 7) === mesIso).length;
  const semData = rows.filter((r) => !r[campo.key]).length;
  const mudar = (n: number) => setBase((b) => { const d = new Date(b); d.setMonth(b.getMonth() + n); return d; });
  const titMes = base.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return (
    <div className="vcal">
      <div className="vcal__topo">
        <button className="icon-btn" onClick={() => mudar(-1)} aria-label="Mês anterior"><ChevronLeft size={18} /></button>
        <h3>{titMes.charAt(0).toUpperCase() + titMes.slice(1)}</h3>
        <button className="icon-btn" onClick={() => mudar(1)} aria-label="Próximo mês"><ChevronRight size={18} /></button>
        <button className="btn btn--ghost btn--sm" onClick={() => { const d = new Date(); d.setDate(1); setBase(d); }}>Hoje</button>
        <span className="muted small">Pela data de <b>{campo.label.toLowerCase()}</b> · {noMes} no mês{semData ? ` · ${semData} sem data` : ''}</span>
      </div>
      <div className="vcal__grade">
        {SEMANA.map((s) => <div key={s} className="calendario__semana">{s}</div>)}
        {celulas.map((d) => {
          const k = iso(d);
          const itens = porDia.get(k) ?? [];
          return (
            <div key={k} className={`vcal__dia ${d.getMonth() !== base.getMonth() ? 'is-fora' : ''} ${k === hoje ? 'is-hoje' : ''}`}>
              <span className="calendario__n">{d.getDate()}</span>
              {itens.slice(0, 3).map((r) => {
                const st = statusDe(def, r);
                return (
                  <button key={r.id} type="button" className={`vcal__item tom-${toneOf(st)}`} onClick={() => onAbrir(r)} title={[titulo(r), st].filter(Boolean).join(' · ')}>
                    <i /> {titulo(r)}
                  </button>
                );
              })}
              {itens.length > 3 && <span className="calendario__mais">+{itens.length - 3} mais</span>}
              {itens.length > 0 && <span className="calendario__pontos" aria-hidden="true"><i className="ponto ponto--ev" />{itens.length > 1 && <small>{itens.length}</small>}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { ArrowDownWideNarrow, ChevronDown, ChevronUp, ExternalLink, Lock, Pencil, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { brl } from '../lib/format';
import { CARGOS_SUGERIDOS, GRUPOS_DE_PERMISSAO, MODULOS, NIVEIS, poderDe, acoesDe, acoesNaArea, nivelDe, type Acao, type Modulo } from '../modules';
import { AsyncButton, Badge, EmptyState, ErrorBox, Loading, Modal, NumberInput, PageHead, notify } from '../components/ui';
import { api } from '../lib/api';
import { SelectPicker, confirmar } from '../components/pickers';
import { reload, useCollection, useResource, type Row } from '../lib/data';
import { useSession, type Config, type Funcao, type Questionario, type Usuario } from '../lib/session';

const acoesDaFuncao = (f: Funcao, k: string) => (f.sistema ? acoesDe('edit') : acoesNaArea(f.permissoes as Record<string, unknown>, k));
/** Resumo de um grupo (Diretoria ou departamento): o nível, se for o mesmo em todas as telas; senão, quantas telas a função acessa. */
function resumoGrupo(acoesDe: (k: string) => Acao[], modulos: Modulo[]) {
  const niveis = modulos.map((m) => nivelDe(acoesDe(m.key)) ?? 'editar');
  const com = niveis.filter((n) => n !== 'none').length;
  if (!com) return { texto: '—', classe: 'none' };
  if (niveis.every((n) => n === niveis[0])) return { texto: NIVEIS.find((n) => n.key === niveis[0])!.label, classe: niveis[0] };
  return { texto: com === modulos.length ? 'Personalizado' : `${com} de ${modulos.length} telas`, classe: 'misto' };
}
const nomeGrupo = (label: string) => label.replace(/^Departamento /, '');
/** Funções da que tem mais poderes para a que tem menos (a Presidência, de sistema, sempre primeiro). */
const porPoder = <T extends Funcao>(lista: T[]) => [...lista].sort((a, b) =>
  (b.sistema ? Infinity : poderDe((k) => acoesDaFuncao(b, k))) - (a.sistema ? Infinity : poderDe((k) => acoesDaFuncao(a, k))) || a.nome.localeCompare(b.nome, 'pt-BR'));
/** Na ordem escolhida em Funções e permissões; as que ainda não têm posição vêm depois, pela quantidade de poderes. */
const emOrdem = <T extends Funcao>(lista: T[]) => {
  const temOrdem = (f: T) => typeof f.ordem === 'number' && !f.sistema;
  return [
    ...lista.filter((f) => f.sistema),
    ...lista.filter(temOrdem).sort((a, b) => a.ordem! - b.ordem!),
    ...porPoder(lista.filter((f) => !f.sistema && !temOrdem(f))),
  ];
};

/* ---------------- Usuários ---------------- */
export function Usuarios() {
  const { pode, usuario: eu } = useSession();
  const canCreate = pode('usuarios', 'criar');
  const canEdit = pode('usuarios', 'editar');
  const canDelete = pode('usuarios', 'excluir');
  const users = useResource<Usuario[]>('/crm/usuarios');
  const funcoes = useCollection<Funcao & Row>('funcoes').rows;
  const [editing, setEditing] = useState<Usuario | 'new' | null>(null);
  const nomeFuncao = (id: string) => funcoes.find((f) => f.id === id)?.nome ?? '—';

  return (
    <div className="page">
      <PageHead
        title="Usuários"
        description="Pessoas com acesso ao sistema. O que cada uma pode ver e editar é definido pela função atribuída."
        actions={canCreate && <button className="btn btn--primary" onClick={() => setEditing('new')}><Plus size={16} /> Novo usuário</button>}
      />
      <div className="panel">
        {users.error && <ErrorBox>{users.error}</ErrorBox>}
        {users.loading ? <Loading /> : (
          <div className="table-wrap">
            <table className="table table--cards">
              <thead><tr><th>Nome</th><th>E-mail</th><th>Função</th><th>Status</th><th>Último acesso</th><th className="actions-col" /></tr></thead>
              <tbody>
                {(users.data ?? []).map((u) => (
                  <tr key={u.id}>
                    <td data-label="Nome">{u.nome} {u.id === eu?.id && <span className="muted small">(você)</span>}</td>
                    <td data-label="E-mail">{u.email}</td>
                    <td data-label="Função">{nomeFuncao(u.funcaoId)}</td>
                    <td data-label="Status"><Badge tone={u.status === 'Ativo' ? 'good' : 'neutral'}>{u.status}</Badge></td>
                    <td data-label="Último acesso">{u.ultimoAcesso ? new Date(u.ultimoAcesso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : <span className="muted">Nunca acessou</span>}</td>
                    <td className="actions-col">
                      {canEdit && <button className="icon-btn" onClick={() => setEditing(u)} aria-label="Editar"><Pencil size={16} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && (
        <UsuarioForm
          user={editing === 'new' ? null : editing}
          funcoes={funcoes}
          isSelf={editing !== 'new' && editing.id === eu?.id}
          canDelete={canDelete}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function UsuarioForm({ user, funcoes, isSelf, canDelete, onClose }: {
  user: Usuario | null; funcoes: Funcao[]; isSelf: boolean; canDelete: boolean; onClose: () => void;
}) {
  const [form, setForm] = useState({ nome: user?.nome ?? '', email: user?.email ?? '', funcaoId: user?.funcaoId ?? '', status: user?.status ?? 'Ativo', senha: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const funcao = funcoes.find((f) => f.id === form.funcaoId);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.funcaoId) return setError('Selecione a função do usuário.');
    setBusy(true);
    setError(null);
    try {
      const body = { ...form, senha: form.senha || undefined };
      if (user) await api(`/crm/usuarios/${user.id}`, { method: 'PUT', body });
      else await api('/crm/usuarios', { method: 'POST', body });
      await reload('/crm/usuarios');
      notify(user ? 'Usuário atualizado' : 'Usuário criado. Informe a senha inicial à pessoa.');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={user ? 'Editar usuário' : 'Novo usuário'}
      onClose={onClose}
      footer={
        <>
          {user && !isSelf && canDelete && (
            <AsyncButton className="btn btn--danger" confirm={{ title: `Excluir o usuário ${user.nome}?`, message: 'A pessoa perde o acesso ao sistema imediatamente.', confirmLabel: 'Excluir', danger: true }}
              onClick={async () => { await api(`/crm/usuarios/${user.id}`, { method: 'DELETE' }); await reload('/crm/usuarios'); notify('Usuário excluído'); onClose(); }}>
              <Trash2 size={16} /> Excluir
            </AsyncButton>
          )}
          <span className="spacer" />
          <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" form="user-form" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </>
      }
    >
      <form id="user-form" className="form-grid" onSubmit={save}>
        <div className="form-field form-field--wide">
          <label htmlFor="u-nome">Nome completo *</label>
          <input id="u-nome" className="input" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        </div>
        <div className="form-field">
          <label htmlFor="u-email">E-mail de acesso *</label>
          <input id="u-email" className="input" type="email" required disabled={!!user} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        {/* e-mail e senha pertencem à conta da pessoa: depois de criada, só ela troca a senha (pelo menu ou por e-mail) */}
        {user ? (
          <div className="form-field">
            <label>Senha</label>
            <button type="button" className="btn btn--ghost"
              onClick={() => api(`/crm/usuarios/${user.id}/redefinir-senha`, { method: 'POST' })
                .then(() => notify(`E-mail de redefinição enviado para ${user.email}`))
                .catch((err: Error) => setError(err.message))}>
              Enviar e-mail de redefinição de senha
            </button>
          </div>
        ) : (
          <div className="form-field">
            <label htmlFor="u-senha">Senha inicial *</label>
            <input id="u-senha" className="input" type="password" autoComplete="new-password" minLength={8} required value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} placeholder="Mínimo de 8 caracteres" />
          </div>
        )}
        <div className="form-field">
          <label htmlFor="u-funcao">Função *</label>
          <SelectPicker id="u-funcao" options={emOrdem(funcoes).map((f) => ({ value: f.id, label: f.nome }))} value={form.funcaoId} onChange={(v) => setForm({ ...form, funcaoId: v })} />
        </div>
        <div className="form-field">
          <label htmlFor="u-status">Status</label>
          <SelectPicker id="u-status" options={['Ativo', 'Inativo']} value={form.status} disabled={isSelf} onChange={(v) => setForm({ ...form, status: v as Usuario['status'] })} />
        </div>
        {funcao && (
          <div className="form-field form-field--wide">
            <label>Acessos desta função</label>
            <div className="access-chips">
              {GRUPOS_DE_PERMISSAO.map((g) => {
                const r = resumoGrupo((k) => acoesDaFuncao(funcao, k), g.modulos);
                return r.classe === 'none' ? null : <Badge key={g.label} tone={r.classe === 'ver' ? 'info' : 'good'}>{nomeGrupo(g.label)} · {r.texto}</Badge>;
              })}
            </div>
          </div>
        )}
        {error && <p className="error form-field--wide">{error}</p>}
      </form>
    </Modal>
  );
}

/* ---------------- Funções e permissões ---------------- */
export function Funcoes() {
  const { pode, refresh } = useSession();
  const canCreate = pode('funcoes', 'criar');
  const canEdit = pode('funcoes', 'editar');
  const canDelete = pode('funcoes', 'excluir');
  const col = useCollection<Funcao & Row>('funcoes');
  const [editing, setEditing] = useState<Funcao | 'new' | null>(null);

  // a ordem da lista é a escolhida aqui (setas); "Ordenar por poderes" volta à ordem automática
  const lista = emOrdem(col.rows);
  const [movendo, setMovendo] = useState(false);
  const salvarOrdem = async (nova: Funcao[]) => {
    await api('/crm/funcoes/ordem', { method: 'PUT', body: { ids: nova.filter((f) => !f.sistema).map((f) => f.id) } });
    await col.reload();
  };
  const mover = async (i: number, d: -1 | 1) => {
    const nova = [...lista];
    [nova[i], nova[i + d]] = [nova[i + d], nova[i]];
    setMovendo(true);
    try { await salvarOrdem(nova); } catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível mudar a ordem.', 'error'); } finally { setMovendo(false); }
  };

  /**
   * Cria os cargos prontos que faltam e atualiza os que já existem (pelo nome) para as permissões sugeridas,
   * uma por tela. Atualizar substitui ajustes feitos à mão nesses cargos, por isso pergunta antes.
   */
  const adicionarSugeridos = async () => {
    const porNome = new Map(col.rows.map((f) => [String(f.nome).trim().toLowerCase(), f]));
    const faltam = CARGOS_SUGERIDOS.filter((c) => !porNome.has(c.nome.toLowerCase()));
    const desatualizados = CARGOS_SUGERIDOS.filter((c) => {
      const f = porNome.get(c.nome.toLowerCase());
      return f && !f.sistema && MODULOS.some((m) => JSON.stringify(acoesDaFuncao(f, m.key)) !== JSON.stringify(c.permissoes[m.key] ?? []));
    });
    if (!faltam.length && !desatualizados.length) { notify('Os cargos sugeridos já existem e estão atualizados.'); return; }
    let atualizar = false;
    if (desatualizados.length) {
      atualizar = await confirmar({
        title: `Atualizar ${desatualizados.length} ${desatualizados.length === 1 ? 'cargo' : 'cargos'} que já existe${desatualizados.length === 1 ? '' : 'm'}?`,
        message: `${desatualizados.map((c) => c.nome).join(', ')} passa${desatualizados.length === 1 ? '' : 'm'} a ter as permissões sugeridas, uma por tela. Ajustes feitos à mão nesses cargos são substituídos.${faltam.length ? ` Os ${faltam.length} que faltam são criados de qualquer jeito.` : ''}`,
        confirmLabel: 'Atualizar',
      });
      if (!atualizar && !faltam.length) return;
    }
    for (const c of faltam) await api('/crm/c/funcoes', { method: 'POST', body: c });
    if (atualizar) for (const c of desatualizados) await api(`/crm/c/funcoes/${porNome.get(c.nome.toLowerCase())!.id}`, { method: 'PUT', body: { permissoes: c.permissoes, descricao: c.descricao } });
    await col.reload();
    await refresh();
    notify([
      faltam.length ? `${faltam.length} ${faltam.length === 1 ? 'cargo criado' : 'cargos criados'}` : '',
      atualizar ? `${desatualizados.length} ${desatualizados.length === 1 ? 'atualizado' : 'atualizados'}` : '',
    ].filter(Boolean).join(' e ') + '. Toque no lápis para ajustar cada um.');
  };

  return (
    <div className="page">
      <PageHead
        title="Funções e permissões"
        description="Cada função define, tela por tela, o nível de acesso: sem acesso, ver, editar (ver, cadastrar e alterar) ou total (também excluir). Use as setas para pôr as funções na ordem que preferir."
        actions={canCreate && (
          <>
            {canEdit && lista.length > 2 && <AsyncButton className="btn btn--ghost" onClick={() => salvarOrdem(porPoder(lista)).then(() => notify('Funções ordenadas pela quantidade de poderes.'))}><ArrowDownWideNarrow size={16} /> Ordenar por poderes</AsyncButton>}
            <AsyncButton className="btn btn--ghost" onClick={adicionarSugeridos}><Sparkles size={16} /> Criar / atualizar cargos sugeridos</AsyncButton>
            <button className="btn btn--primary" onClick={() => setEditing('new')}><Plus size={16} /> Nova função</button>
          </>
        )}
      />
      <div className="panel">
        {col.loading ? <Loading /> : (
          <div className="table-wrap">
            <table className="table matrix">
              <thead>
                <tr>
                  <th>Função</th>
                  {GRUPOS_DE_PERMISSAO.map((g) => <th key={g.label} className="center"><span>{nomeGrupo(g.label)}</span></th>)}
                  <th className="actions-col" />
                </tr>
              </thead>
              <tbody>
                {lista.map((f, i) => (
                  <tr key={f.id}>
                    <td className="matrix__role">
                      <div className="matrix__ordem">
                        {canEdit && !f.sistema && (
                          <span className="ordem-btns">
                            <button className="icon-btn" disabled={movendo || i <= 1} onClick={() => void mover(i, -1)} aria-label={`Subir ${f.nome}`} title="Subir"><ChevronUp size={15} /></button>
                            <button className="icon-btn" disabled={movendo || i >= lista.length - 1} onClick={() => void mover(i, 1)} aria-label={`Descer ${f.nome}`} title="Descer"><ChevronDown size={15} /></button>
                          </span>
                        )}
                        <span><strong>{f.nome}</strong>{f.sistema && <Lock size={12} className="muted inline-icon" />}<div className="muted small">{f.descricao}</div></span>
                      </div>
                    </td>
                    {GRUPOS_DE_PERMISSAO.map((g) => {
                      const r = resumoGrupo((k) => acoesDaFuncao(f, k), g.modulos);
                      return (
                        <td key={g.label} className="center">
                          <span className={`access access--${r.classe}`} title={r.classe === 'misto' ? 'Acesso diferente em cada tela: toque no lápis para ver' : undefined}>{r.texto}</span>
                        </td>
                      );
                    })}
                    <td className="actions-col">
                      {canEdit && !f.sistema && <button className="icon-btn" onClick={() => setEditing(f)} aria-label="Editar"><Pencil size={16} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {!col.loading && col.rows.length <= 1 && (
        <EmptyState title="Crie as funções da sua equipe">
          Exemplos: Gerente de operações, Financeiro, Recursos Humanos, Atendimento. Depois atribua cada função aos usuários.
        </EmptyState>
      )}
      {editing && (
        <FuncaoForm
          funcao={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            if (editing === 'new') await col.add(data);
            else await col.update(editing.id, data);
            await refresh();
            notify('Função salva');
            setEditing(null);
          }}
          onDelete={editing !== 'new' && canDelete ? async () => { await col.remove(editing.id); notify('Função excluída'); setEditing(null); } : undefined}
        />
      )}
    </div>
  );
}

function FuncaoForm({ funcao, onClose, onSave, onDelete }: {
  funcao: Funcao | null; onClose: () => void; onSave: (d: Partial<Funcao>) => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const [nome, setNome] = useState(funcao?.nome ?? '');
  const [descricao, setDescricao] = useState(funcao?.descricao ?? '');
  // uma permissão por tela (módulo); funções antigas, gravadas por área, abrem já convertidas
  const [perm, setPerm] = useState<Record<string, Acao[]>>(
    () => Object.fromEntries(MODULOS.map((m) => [m.key, acoesNaArea(funcao?.permissoes as Record<string, unknown> | undefined, m.key)])),
  );
  const definir = (keys: string[], acoes: Acao[]) => setPerm((p) => ({ ...p, ...Object.fromEntries(keys.map((k) => [k, [...acoes]])) }));
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nome.trim().length < 3) return setError('Informe o nome da função.');
    setBusy(true);
    try {
      await onSave({ nome: nome.trim(), descricao: descricao.trim(), permissoes: perm });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={funcao ? 'Editar função' : 'Nova função'}
      onClose={onClose}
      width={760}
      footer={
        <>
          {onDelete && <AsyncButton className="btn btn--danger" onClick={onDelete} confirm={{ title: 'Excluir esta função?', message: 'Só é possível excluir funções sem usuários vinculados.', confirmLabel: 'Excluir', danger: true }}><Trash2 size={16} /> Excluir</AsyncButton>}
          <span className="spacer" />
          <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" form="role-form" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
        </>
      }
    >
      <form id="role-form" className="form-grid" onSubmit={save}>
        <div className="form-field">
          <label htmlFor="r-nome">Nome da função *</label>
          <input id="r-nome" className="input" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Gerente de operações" />
        </div>
        <div className="form-field">
          <label htmlFor="r-desc">Descrição</label>
          <input id="r-desc" className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        <div className="form-field form-field--wide">
          <label>Permissões por tela</label>
          <p className="muted small">Ver: abrir e consultar · Editar: ver, cadastrar e alterar · Total: editar e também excluir (inclui estornos). Use “Todo o grupo” para marcar o departamento inteiro de uma vez.</p>
          <div className="perm-list">
            {GRUPOS_DE_PERMISSAO.map((g) => {
              const keys = g.modulos.map((m) => m.key);
              const r = resumoGrupo((k) => perm[k] ?? [], g.modulos);
              const aberto = !!abertos[g.label];
              return (
                <section key={g.label} className={`perm-grupo ${aberto ? 'is-open' : ''}`}>
                  <div className="perm-grupo__topo">
                    <button type="button" className="perm-grupo__titulo" onClick={() => setAbertos((x) => ({ ...x, [g.label]: !aberto }))} aria-expanded={aberto}>
                      <ChevronDown size={15} className={aberto ? '' : 'is-closed'} />
                      <span>{nomeGrupo(g.label)}</span>
                      <span className={`access access--${r.classe}`}>{r.texto}</span>
                    </button>
                    <div className="segmented segmented--sm" role="radiogroup" aria-label={`Todo o grupo ${nomeGrupo(g.label)}`} title="Todo o grupo">
                      {NIVEIS.map((n) => (
                        <button type="button" key={n.key} role="radio" aria-checked={r.classe === n.key} className={r.classe === n.key ? 'is-active' : ''}
                          title={`${n.dica} (todas as telas do grupo)`} onClick={() => definir(keys, n.acoes)}>
                          {n.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {aberto && g.modulos.map((m) => (
                    <div key={m.key} className="perm">
                      <div className="perm__text">
                        <strong>{m.label}</strong>
                        <span className="muted small">{[m.setor !== m.label ? m.setor : '', m.paginas.length > 1 ? m.paginas.join(', ') : ''].filter(Boolean).join(' · ')}</span>
                      </div>
                      <div className="segmented" role="radiogroup" aria-label={`Acesso em ${m.label}`}>
                        {NIVEIS.map((n) => {
                          const ativo = nivelDe(perm[m.key] ?? []) === n.key;
                          return (
                            <button type="button" key={n.key} role="radio" aria-checked={ativo} title={n.dica}
                              className={ativo ? 'is-active' : ''} onClick={() => definir([m.key], n.acoes)}>
                              {n.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
        </div>
        {error && <p className="error form-field--wide">{error}</p>}
      </form>
    </Modal>
  );
}

/* ---------------- Parâmetros do aplicativo ---------------- */
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Aceita "18", "18h", "18:0", "1830" e converte para "18:00" / "18:30". */
function normalizarHora(h: string) {
  const d = h.replace(/\D/g, '');
  if (d.length <= 2) return `${d.padStart(2, '0')}:00`;
  if (d.length === 3) return `0${d[0]}:${d.slice(1)}`;
  return `${d.slice(0, 2)}:${d.slice(2, 4)}`;
}

export function Parametros() {
  const { pode } = useSession();
  const canEdit = pode('parametros', 'editar');
  const res = useResource<Config>('/crm/config');
  const [cfg, mostrar] = useState<Config | null>(null);
  // a tela recarrega os parâmetros sozinha (a cada minuto e a cada mudança no sistema): com alterações ainda não
  // salvas, a recarga não pode trocar o que a pessoa está editando pelo que está gravado
  const editado = useRef(false);
  const setCfg = (c: Config) => { editado.current = true; mostrar(c); };
  useEffect(() => {
    if (res.data && !editado.current) mostrar(res.data);
  }, [res.data]);
  if (!cfg) return <Loading />;

  const listText = (arr: string[]) => arr.join(', ');
  const parseList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    const horaInvalida = cfg.horarios.find((h) => !HORA.test(h));
    if (horaInvalida) throw new Error(`Horário inválido: "${horaInvalida}". Use o formato HH:MM, por exemplo 18:00.`);
    if (!cfg.horarios.length) throw new Error('Informe ao menos um horário de reserva.');
    if (!cfg.ambientes.length) throw new Error('Informe ao menos um ambiente.');
    const faixas = cfg.faixasInss.map((f) => f.ate);
    if (faixas.some((v, i) => i > 0 && v <= faixas[i - 1])) throw new Error('As faixas do INSS devem estar em ordem crescente.');
    const questionario = cfg.questionario && { ...cfg.questionario, perguntas: cfg.questionario.perguntas.filter((p) => p.texto.trim()) };
    if (questionario?.ativo && !questionario.perguntas.length) throw new Error('Adicione ao menos uma pergunta antes de mostrar o questionário.');
    await api('/crm/config', { method: 'PUT', body: { ...cfg, horarios: [...new Set(cfg.horarios)].sort(), ...(questionario ? { questionario } : {}) } });
    editado.current = false;
    await reload('/crm/config');
    notify('Parâmetros salvos. O aplicativo já usa as novas regras.');
  };

  return (
    <div className="page">
      <PageHead
        title="Parâmetros do aplicativo"
        description="Regras usadas pelo aplicativo dos clientes e pelos cálculos do sistema."
        actions={canEdit && <AsyncButton className="btn btn--primary" onClick={save}><Save size={16} /> Salvar parâmetros</AsyncButton>}
      />
      <fieldset className="grid-2" disabled={!canEdit}>
        <section className="panel pad-lg">
          <h2 className="panel-title">Reservas</h2>
          <label className="field-label">Dias de funcionamento</label>
          <div className="day-toggle">
            {DIAS.map((d, i) => (
              <button type="button" key={d} className={cfg.diasFuncionamento.includes(i) ? 'is-active' : ''}
                onClick={() => setCfg({ ...cfg, diasFuncionamento: cfg.diasFuncionamento.includes(i) ? cfg.diasFuncionamento.filter((x) => x !== i) : [...cfg.diasFuncionamento, i].sort() })}>
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
          <label className="field-label" htmlFor="p-hor">Horários disponíveis (separados por vírgula)</label>
          <input id="p-hor" className="input" maxLength={200} placeholder="18:00, 19:00, 20:00" defaultValue={listText(cfg.horarios)} onBlur={(e) => setCfg({ ...cfg, horarios: parseList(e.target.value).map(normalizarHora) })} />
          <label className="field-label" htmlFor="p-amb">Ambientes (separados por vírgula)</label>
          <input id="p-amb" className="input" maxLength={300} defaultValue={listText(cfg.ambientes)} onBlur={(e) => setCfg({ ...cfg, ambientes: parseList(e.target.value) })} />
          <label className="field-label" htmlFor="p-ant">Antecedência mínima (minutos)</label>
          <NumberInput id="p-ant" spec={{ decimals: 0, min: 0, max: 1440 }} suffix="minutos" value={cfg.antecedenciaMinutos} onChange={(v) => setCfg({ ...cfg, antecedenciaMinutos: Number(v || 0) })} />
        </section>

        <section className="panel pad-lg">
          <h2 className="panel-title">Programa de fidelidade</h2>
          <p className="muted small">Pontos que cada unidade vendida dá ao afilhado, pelo preço do produto. Para mudar um produto específico, marque "Pontuação personalizada" no cadastro dele.</p>
          {cfg.faixasPontos.map((f, i) => (
            <div className="inline-fields" key={i}>
              <NumberInput spec={{ money: true, decimals: 2, min: 0.01, max: 100_000 }} prefix="até R$" value={f.ate} ariaLabel="Preço limite da faixa"
                onChange={(v) => setCfg({ ...cfg, faixasPontos: cfg.faixasPontos.map((x, j) => (j === i ? { ...x, ate: Number(v || 0) } : x)) })} />
              <NumberInput spec={{ decimals: 0, min: 0, max: 100_000 }} suffix="pontos" value={f.pontos} ariaLabel="Pontos da faixa"
                onChange={(v) => setCfg({ ...cfg, faixasPontos: cfg.faixasPontos.map((x, j) => (j === i ? { ...x, pontos: Number(v || 0) } : x)) })} />
              <button type="button" className="icon-btn" aria-label="Remover faixa" title="Remover faixa"
                onClick={() => setCfg({ ...cfg, faixasPontos: cfg.faixasPontos.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>
            </div>
          ))}
          <button type="button" className="btn btn--ghost btn--sm" disabled={cfg.faixasPontos.length >= 20}
            onClick={() => {
              const ultima = cfg.faixasPontos[cfg.faixasPontos.length - 1];
              setCfg({ ...cfg, faixasPontos: [...cfg.faixasPontos, { ate: (ultima?.ate ?? 0) + 10, pontos: (ultima?.pontos ?? 0) + 5 }] });
            }}><Plus size={14} /> Adicionar faixa</button>
          <label className="field-label" htmlFor="p-acima">Acima de {brl(Math.max(0, ...cfg.faixasPontos.map((f) => f.ate)))}</label>
          <NumberInput id="p-acima" spec={{ decimals: 0, min: 0, max: 100_000 }} suffix="pontos" value={cfg.pontosAcima} onChange={(v) => setCfg({ ...cfg, pontosAcima: Number(v || 0) })} />
        </section>

        <Numeracao podeAjustar={canEdit} podeApagar={canEdit && pode('clientes', 'excluir') && pode('consumos', 'excluir')} />
        <section className="panel pad-lg">
          <h2 className="panel-title">Folha de pagamento</h2>
          <p className="muted small">Tabela progressiva de contribuição do empregado ao INSS. Atualize sempre que a portaria anual for publicada.</p>
          {cfg.faixasInss.map((f, i) => (
            <div className="inline-fields" key={i}>
              <NumberInput spec={{ money: true, decimals: 2, min: 0.01, max: 1_000_000 }} prefix="até R$" value={f.ate} ariaLabel="Limite da faixa"
                onChange={(v) => setCfg({ ...cfg, faixasInss: cfg.faixasInss.map((x, j) => (j === i ? { ...x, ate: Number(v || 0) } : x)) })} />
              <NumberInput spec={{ decimals: 2, min: 0, max: 100 }} suffix="%" value={f.aliquota} ariaLabel="Alíquota"
                onChange={(v) => setCfg({ ...cfg, faixasInss: cfg.faixasInss.map((x, j) => (j === i ? { ...x, aliquota: Number(v || 0) } : x)) })} />
            </div>
          ))}
          <label className="field-label" htmlFor="p-fgts">Alíquota do FGTS (%)</label>
          <NumberInput id="p-fgts" spec={{ decimals: 2, min: 0, max: 100 }} suffix="%" value={cfg.aliquotaFgts} onChange={(v) => setCfg({ ...cfg, aliquotaFgts: Number(v || 0) })} />
        </section>
        <QuestionarioEditor q={cfg.questionario ?? { ativo: false, titulo: 'Conte um pouco sobre você', perguntas: [] }} onChange={(questionario) => setCfg({ ...cfg, questionario })} />
      </fieldset>
      {canEdit && <ChaveIA />}
    </div>
  );
}

/**
 * Questionário opcional do afilhado: aparece no início do app como convite (dá para adiar).
 * Pergunta sem opções vira campo de texto; com opções, o afilhado toca em uma.
 */
function QuestionarioEditor({ q, onChange }: { q: Questionario; onChange: (q: Questionario) => void }) {
  const mudar = (i: number, p: Partial<Questionario['perguntas'][number]>) => onChange({ ...q, perguntas: q.perguntas.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return (
    <section className="panel pad-lg questionario-editor">
      <h2 className="panel-title">Questionário opcional do afilhado</h2>
      <p className="muted small">Perguntas rápidas que o afilhado pode responder no aplicativo depois do cadastro. As respostas aparecem em Clientes (afilhados). Deixe as opções em branco para resposta livre.</p>
      <label className="check-row"><input type="checkbox" checked={q.ativo} onChange={(e) => onChange({ ...q, ativo: e.target.checked })} /> Mostrar o questionário no aplicativo</label>
      <label className="field-label" htmlFor="q-titulo">Título</label>
      <input id="q-titulo" className="input" maxLength={80} value={q.titulo} onChange={(e) => onChange({ ...q, titulo: e.target.value })} />
      {q.perguntas.map((p, i) => (
        <div className="qe-pergunta" key={p.id}>
          <input className="input" maxLength={200} placeholder={`Pergunta ${i + 1}`} aria-label={`Pergunta ${i + 1}`} value={p.texto} onChange={(e) => mudar(i, { texto: e.target.value })} />
          <input className="input" maxLength={400} placeholder="Opções separadas por vírgula (opcional)" aria-label={`Opções da pergunta ${i + 1}`} defaultValue={p.opcoes.join(', ')}
            onBlur={(e) => mudar(i, { opcoes: e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10) })} />
          <button type="button" className="icon-btn" aria-label={`Remover pergunta ${i + 1}`} onClick={() => onChange({ ...q, perguntas: q.perguntas.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
        </div>
      ))}
      {q.perguntas.length < 10 && (
        <button type="button" className="btn btn--ghost" style={{ marginTop: 10 }} onClick={() => onChange({ ...q, perguntas: [...q.perguntas, { id: Math.random().toString(36).slice(2, 10), texto: '', opcoes: [] }] })}>
          <Plus size={16} /> Adicionar pergunta
        </button>
      )}
    </section>
  );
}

/** Numeração dos afilhados: mostra o próximo número e, depois de excluir afilhados (ex.: de teste), volta a seguir o maior número em uso. */
function Numeracao({ podeAjustar, podeApagar }: { podeAjustar: boolean; podeApagar: boolean }) {
  const { data } = useResource<{ total: number }>('/public/afilhados');
  const proximo = (data?.total ?? 0) + 1;
  const ajustar = async () => {
    const r = await api<{ proximo: number }>('/crm/clientes/numeracao', { method: 'POST' });
    await reload('/public/afilhados');
    notify(`Pronto. O próximo afilhado será o #${String(r.proximo).padStart(3, '0')}.`);
  };
  const apagarTodos = async () => {
    const r = await api<{ apagados: number }>('/crm/clientes', { method: 'DELETE' });
    await Promise.all([reload('/public/afilhados'), reload('/crm/clientes')]);
    notify(`${r.apagados} afilhado(s) apagado(s). O próximo cadastro será o #001.`);
  };
  return (
    <section className="panel pad-lg">
      <h2 className="panel-title">Numeração dos afilhados</h2>
      <p className="muted small">O próximo cadastro recebe o número <strong>#{String(proximo).padStart(3, '0')}</strong>. Depois de excluir afilhados (por exemplo, cadastros de teste), ajuste para a numeração voltar a seguir o maior número em uso.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      {podeAjustar && (
        <AsyncButton className="btn btn--ghost" onClick={ajustar} confirm={{ title: 'Ajustar a numeração?', message: 'O próximo afilhado receberá o número seguinte ao maior número em uso.', confirmLabel: 'Ajustar' }}>Ajustar numeração</AsyncButton>
      )}
      {podeApagar && (
        <AsyncButton className="btn btn--ghost" onClick={apagarTodos} confirm={{
          title: 'Apagar todos os afilhados?',
          message: 'Apaga os cadastros, saldos de pontos, consumos (com as receitas), vouchers e reservas de todos os afilhados, e a numeração volta para #001. Não dá para desfazer. As contas de login (e-mails) são apagadas automaticamente em até uns 20 minutos; antes disso, quem se cadastrar de novo com o mesmo e-mail usa a senha de antes.',
          confirmLabel: 'Apagar tudo', danger: true,
        }}><Trash2 size={16} /> Apagar todos os afilhados</AsyncButton>
      )}
      </div>
    </section>
  );
}

/** Chave da IA que lê as notas fiscais (Google Gemini, cota gratuita). Fica guardada no banco, fora do código público. */
function ChaveIA() {
  const atual = useResource<{ chave: string; modelo: string }>('/crm/ia/chave');
  const [chave, setChave] = useState('');
  const [modelo, setModelo] = useState('');
  useEffect(() => { if (atual.data) setModelo(atual.data.modelo); }, [atual.data]);
  const configurada = !!atual.data?.chave;
  const salvar = async (remover = false) => {
    await api('/crm/ia/chave', { method: 'PUT', body: { chave: remover ? '' : chave.replace(/\s+/g, '') || atual.data?.chave || '', modelo: modelo.trim() } });
    await reload('/crm/ia/chave');
    setChave('');
    notify(remover ? 'Chave da IA removida.' : 'IA de leitura de notas configurada.');
  };
  return (
    <section className="panel pad-lg ia-chave">
      <h2 className="panel-title"><Sparkles size={16} className="gold" /> Leitura de notas por IA</h2>
      <p className="muted small">
        Em <b>Estrutura → Entrada de notas</b>, a IA (Google Gemini, cota gratuita) lê a foto da nota e preenche os itens.
        A chave fica guardada no banco e só a equipe logada consegue ler.
      </p>
      <p className="small">Situação: {configurada ? <Badge tone="good">Configurada</Badge> : <Badge tone="warn">Sem chave</Badge>}</p>
      <ol className="ia-chave__passos small muted">
        <li>Abra o Google AI Studio e entre com a conta do bar.</li>
        <li>Toque em <b>Criar chave de API</b> e copie a chave.</li>
        <li>Recomendado: nas restrições da chave, permita só o site <b>bardo-c0878.web.app</b>.</li>
        <li>Cole a chave aqui e salve.</li>
      </ol>
      <a className="link small ia-chave__link" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer"><ExternalLink size={13} /> Abrir o Google AI Studio</a>
      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="ia-chave">{configurada ? 'Trocar a chave' : 'Chave da API'}</label>
          <input id="ia-chave" className="input" type="password" autoComplete="off" placeholder={configurada ? '•••••••• (deixe em branco para manter)' : 'Cole a chave aqui'} value={chave} onChange={(e) => setChave(e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="ia-modelo">Modelo (opcional)</label>
          <input id="ia-modelo" className="input" placeholder="automático (deixe em branco)" value={modelo} onChange={(e) => setModelo(e.target.value)} />
        </div>
      </div>
      <div className="profile-actions">
        {configurada && <AsyncButton className="btn btn--ghost" onClick={() => salvar(true)} confirm={{ title: 'Remover a chave da IA?', message: 'A leitura de notas por IA para de funcionar até cadastrar outra chave.', confirmLabel: 'Remover', danger: true }}>Remover chave</AsyncButton>}
        <AsyncButton className="btn btn--primary" onClick={() => { if (!chave.trim() && !configurada) throw new Error('Cole a chave da API.'); return salvar(); }}><Save size={16} /> Salvar</AsyncButton>
      </div>
    </section>
  );
}

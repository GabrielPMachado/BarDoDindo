import { useEffect, useState } from 'react';
import { Lock, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { AREAS_COM_PERMISSAO as AREAS, NIVEIS, acoesDe, acoesNaArea, nivelDe, type Acao, type AreaKey } from '../modules';
import { AsyncButton, Badge, EmptyState, ErrorBox, Loading, Modal, NumberInput, PageHead, notify } from '../components/ui';
import { api } from '../lib/api';
import { SelectPicker } from '../components/pickers';
import { reload, useCollection, useResource, type Row } from '../lib/data';
import { useSession, type Config, type Funcao, type Usuario } from '../lib/session';

/** "Tudo", "Só ver" ou a lista das permissões marcadas. */
const resumoAcoes = (acoes: Acao[]) => NIVEIS.find((n) => n.key === nivelDe(acoes))?.label ?? 'Personalizado';

/* ---------------- Usuários ---------------- */
export function Usuarios() {
  const { pode, usuario: eu } = useSession();
  const canCreate = pode('cfg', 'criar');
  const canEdit = pode('cfg', 'editar');
  const canDelete = pode('cfg', 'excluir');
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
          <SelectPicker id="u-funcao" options={funcoes.map((f) => ({ value: f.id, label: f.nome }))} value={form.funcaoId} onChange={(v) => setForm({ ...form, funcaoId: v })} />
        </div>
        <div className="form-field">
          <label htmlFor="u-status">Status</label>
          <SelectPicker id="u-status" options={['Ativo', 'Inativo']} value={form.status} disabled={isSelf} onChange={(v) => setForm({ ...form, status: v as Usuario['status'] })} />
        </div>
        {funcao && (
          <div className="form-field form-field--wide">
            <label>Acessos desta função</label>
            <div className="access-chips">
              {AREAS.map((a) => {
                const acoes = funcao.sistema ? acoesDe('edit') : acoesNaArea(funcao.permissoes as Record<string, unknown>, a.key);
                return acoes.includes('ver')
                  ? <Badge key={a.key} tone={acoes.length > 1 ? 'good' : 'info'}>{a.label} · {resumoAcoes(acoes)}</Badge>
                  : null;
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
  const canCreate = pode('cfg', 'criar');
  const canEdit = pode('cfg', 'editar');
  const canDelete = pode('cfg', 'excluir');
  const col = useCollection<Funcao & Row>('funcoes');
  const [editing, setEditing] = useState<Funcao | 'new' | null>(null);

  return (
    <div className="page">
      <PageHead
        title="Funções e permissões"
        description="Cada função define, área por área, o nível de acesso: sem acesso, ver, editar (ver, cadastrar e alterar) ou total (também excluir)."
        actions={canCreate && <button className="btn btn--primary" onClick={() => setEditing('new')}><Plus size={16} /> Nova função</button>}
      />
      <div className="panel">
        {col.loading ? <Loading /> : (
          <div className="table-wrap">
            <table className="table matrix">
              <thead>
                <tr>
                  <th>Função</th>
                  {AREAS.map((a) => <th key={a.key} className="center" title={a.label}><a.icon size={16} /><span>{a.label}</span></th>)}
                  <th className="actions-col" />
                </tr>
              </thead>
              <tbody>
                {col.rows.map((f) => (
                  <tr key={f.id}>
                    <td className="matrix__role"><strong>{f.nome}</strong>{f.sistema && <Lock size={12} className="muted inline-icon" />}<div className="muted small">{f.descricao}</div></td>
                    {AREAS.map((a) => {
                      const acoes = f.sistema ? acoesDe('edit') : acoesNaArea(f.permissoes as Record<string, unknown>, a.key);
                      return (
                        <td key={a.key} className="center">
                          {acoes.includes('ver') ? (
                            <span className={`access access--${nivelDe(acoes) ?? 'editar'}`} title={NIVEIS.find((n) => n.key === nivelDe(acoes))?.dica}>{resumoAcoes(acoes)}</span>
                          ) : <span className="access access--none" title="Sem acesso">—</span>}
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
  const [perm, setPerm] = useState<Partial<Record<AreaKey, Acao[]>>>(
    () => Object.fromEntries(AREAS.map((a) => [a.key, acoesNaArea(funcao?.permissoes as Record<string, unknown> | undefined, a.key)])),
  );
  const definir = (area: AreaKey, acoes: Acao[]) => setPerm({ ...perm, [area]: acoes });
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
          <label>Permissões por área</label>
          <p className="muted small">Ver: abrir e consultar · Editar: ver, cadastrar e alterar · Total: editar e também excluir (inclui estornos).</p>
          <div className="perm-list">
            {AREAS.map((a) => (
              <div key={a.key} className="perm">
                <a.icon size={18} className="gold" />
                <div className="perm__text"><strong>{a.label}</strong><span className="muted small">{a.description}</span></div>
                <div className="segmented" role="radiogroup" aria-label={`Acesso em ${a.label}`}>
                  {NIVEIS.map((n) => {
                    const ativo = nivelDe(perm[a.key] ?? []) === n.key;
                    return (
                      <button type="button" key={n.key} role="radio" aria-checked={ativo} title={n.dica}
                        className={ativo ? 'is-active' : ''} onClick={() => definir(a.key, [...n.acoes])}>
                        {n.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
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
  const canEdit = pode('cfg', 'editar');
  const res = useResource<Config>('/crm/config');
  const [cfg, setCfg] = useState<Config | null>(null);
  useEffect(() => {
    if (res.data) setCfg(res.data);
  }, [res.data]);
  if (!cfg) return <Loading />;

  const listText = (arr: string[]) => arr.join(', ');
  const parseList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    const horaInvalida = cfg.horarios.find((h) => !HORA.test(h));
    if (horaInvalida) throw new Error(`Horário inválido: "${horaInvalida}". Use o formato HH:MM, por exemplo 18:00.`);
    if (!cfg.horarios.length) throw new Error('Informe ao menos um horário de reserva.');
    if (!cfg.ambientes.length) throw new Error('Informe ao menos um ambiente.');
    if (cfg.niveis.some((n) => !n.nome.trim())) throw new Error('Todos os níveis precisam de um nome.');
    const faixas = cfg.faixasInss.map((f) => f.ate);
    if (faixas.some((v, i) => i > 0 && v <= faixas[i - 1])) throw new Error('As faixas do INSS devem estar em ordem crescente.');
    await api('/crm/config', { method: 'PUT', body: { ...cfg, horarios: [...new Set(cfg.horarios)].sort() } });
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
          <label className="field-label" htmlFor="p-ppr">Pontos por R$ 1,00 consumido</label>
          <NumberInput id="p-ppr" spec={{ decimals: 2, min: 0, max: 100 }} suffix="pontos" value={cfg.pontosPorReal} onChange={(v) => setCfg({ ...cfg, pontosPorReal: Number(v || 0) })} />
          <label className="field-label">Níveis (por pontos acumulados)</label>
          {cfg.niveis.map((n, i) => (
            <div className="inline-fields" key={i}>
              <input className="input" maxLength={40} value={n.nome} aria-label="Nome do nível"
                onChange={(e) => setCfg({ ...cfg, niveis: cfg.niveis.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)) })} />
              <NumberInput spec={{ decimals: 0, min: 0, max: 10_000_000 }} suffix="pts" value={n.minimo} ariaLabel="Pontos mínimos"
                onChange={(v) => setCfg({ ...cfg, niveis: cfg.niveis.map((x, j) => (j === i ? { ...x, minimo: Number(v || 0) } : x)) })} />
              <button type="button" className="icon-btn" aria-label="Remover nível" disabled={cfg.niveis.length <= 1}
                onClick={() => setCfg({ ...cfg, niveis: cfg.niveis.filter((_, j) => j !== i) })}><X size={16} /></button>
            </div>
          ))}
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setCfg({ ...cfg, niveis: [...cfg.niveis, { nome: '', minimo: 0 }] })}><Plus size={14} /> Adicionar nível</button>
        </section>

        <Numeracao podeAjustar={canEdit} />
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
      </fieldset>
    </div>
  );
}

/** Numeração dos afilhados: mostra o próximo número e, depois de excluir afilhados (ex.: de teste), volta a seguir o maior número em uso. */
function Numeracao({ podeAjustar }: { podeAjustar: boolean }) {
  const { data } = useResource<{ total: number }>('/public/afilhados');
  const proximo = (data?.total ?? 0) + 1;
  const ajustar = async () => {
    const r = await api<{ proximo: number }>('/crm/clientes/numeracao', { method: 'POST' });
    await reload('/public/afilhados');
    notify(`Pronto. O próximo afilhado será o #${String(r.proximo).padStart(3, '0')}.`);
  };
  return (
    <section className="panel pad-lg">
      <h2 className="panel-title">Numeração dos afilhados</h2>
      <p className="muted small">O próximo cadastro recebe o número <strong>#{String(proximo).padStart(3, '0')}</strong>. Depois de excluir afilhados (por exemplo, cadastros de teste), ajuste para a numeração voltar a seguir o maior número em uso.</p>
      {podeAjustar && (
        <AsyncButton className="btn btn--ghost" onClick={ajustar} confirm={{ title: 'Ajustar a numeração?', message: 'O próximo afilhado receberá o número seguinte ao maior número em uso.', confirmLabel: 'Ajustar' }}>Ajustar numeração</AsyncButton>
      )}
    </section>
  );
}

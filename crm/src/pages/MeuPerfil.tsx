import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CalendarClock, KeyRound, Mail, Save, ShieldCheck, UserRound } from 'lucide-react';
import { ErrorBox, PageHead, notify } from '../components/ui';
import { DatePicker } from '../components/pickers';
import { api } from '../lib/api';
import { initials } from '../lib/format';
import { maskPhone } from '../lib/masks';
import { useSession } from '../lib/session';

const dataHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/** Meu perfil → Meus dados: informações da pessoa, edição dos próprios dados e troca de senha. */
export default function MeuPerfil() {
  const { usuario, funcao, refresh } = useSession();
  const { state } = useLocation() as { state?: { foco?: string } | null };
  const senhaRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ nome: '', telefone: '', nascimento: '', sobre: '' });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (usuario) setForm({ nome: usuario.nome ?? '', telefone: usuario.telefone ?? '', nascimento: usuario.nascimento ?? '', sobre: usuario.sobre ?? '' });
  }, [usuario?.id, usuario?.nome, usuario?.telefone, usuario?.nascimento, usuario?.sobre]);

  const [senha, setSenha] = useState({ atual: '', nova: '', confirma: '' });
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [trocando, setTrocando] = useState(false);

  // vindo do menu do usuário ("Alterar senha"), já leva o cursor para a senha
  useEffect(() => {
    if (state?.foco === 'senha') {
      senhaRef.current?.scrollIntoView({ block: 'center' });
      senhaRef.current?.focus();
    }
  }, [state]);

  if (!usuario) return null;
  const mudou = form.nome !== (usuario.nome ?? '') || form.telefone !== (usuario.telefone ?? '')
    || form.nascimento !== (usuario.nascimento ?? '') || form.sobre !== (usuario.sobre ?? '');

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      await api('/crm/me', { method: 'PUT', body: form });
      await refresh();
      notify('Suas informações foram atualizadas.');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const trocarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroSenha(null);
    if (senha.nova !== senha.confirma) return setErroSenha('As senhas não conferem.');
    setTrocando(true);
    try {
      await api('/crm/me/senha', { method: 'PUT', body: { atual: senha.atual, nova: senha.nova } });
      setSenha({ atual: '', nova: '', confirma: '' });
      notify('Senha alterada.');
    } catch (err) {
      setErroSenha(err instanceof Error ? err.message : 'Não foi possível alterar a senha.');
    } finally {
      setTrocando(false);
    }
  };

  return (
    <div className="page">
      <PageHead title="Meus dados" description="Suas informações no sistema. E-mail de acesso, função e status são definidos pelo administrador." />

      <section className="panel profile-card">
        <span className="profile-card__avatar">{initials(usuario.nome)}</span>
        <div className="profile-card__main">
          <h2>{usuario.nome}</h2>
          <span className="profile-card__role"><ShieldCheck size={14} /> {funcao?.nome ?? 'Sem função'}</span>
          {usuario.sobre && <p className="muted">{usuario.sobre}</p>}
        </div>
        <dl className="profile-card__facts">
          <div><dt><Mail size={13} /> E-mail de acesso</dt><dd>{usuario.email}</dd></div>
          <div><dt><UserRound size={13} /> No sistema desde</dt><dd>{dataHora(usuario.criadoEm)}</dd></div>
          <div><dt><CalendarClock size={13} /> Último acesso</dt><dd>{dataHora(usuario.ultimoAcesso)}</dd></div>
        </dl>
      </section>

      <div className="grid-2 grid-2--wide-left">
        <section className="panel pad-lg">
          <h2 className="panel-title"><UserRound size={16} className="gold" /> Minhas informações</h2>
          <form className="form-grid" onSubmit={salvar}>
            <div className="form-field form-field--wide">
              <label htmlFor="p-nome">Nome completo <span className="req">*</span></label>
              <input id="p-nome" className="input" required minLength={3} maxLength={120} autoComplete="name" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div className="form-field">
              <label htmlFor="p-tel">Celular</label>
              <input id="p-tel" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" maxLength={15} value={form.telefone} onChange={(e) => setForm({ ...form, telefone: maskPhone(e.target.value) })} />
            </div>
            <div className="form-field">
              <label htmlFor="p-nasc">Data de nascimento</label>
              <DatePicker id="p-nasc" value={form.nascimento} onChange={(v) => setForm({ ...form, nascimento: v })} />
            </div>
            <div className="form-field form-field--wide">
              <label htmlFor="p-sobre">Sobre mim</label>
              <textarea id="p-sobre" className="input" rows={3} maxLength={500} placeholder="Ex.: cargo, turno em que trabalha, como prefere ser chamado…" value={form.sobre} onChange={(e) => setForm({ ...form, sobre: e.target.value })} />
              <span className="muted small">{form.sobre.length}/500</span>
            </div>
            {erro && <div className="form-field--wide"><ErrorBox>{erro}</ErrorBox></div>}
            <div className="form-field--wide profile-actions">
              <button className="btn btn--primary" disabled={!mudou || salvando}><Save size={16} /> {salvando ? 'Salvando…' : 'Salvar informações'}</button>
            </div>
          </form>
        </section>

        <section className="panel pad-lg">
          <h2 className="panel-title"><KeyRound size={16} className="gold" /> Trocar senha</h2>
          <form className="form-grid form-grid--single" onSubmit={trocarSenha}>
            <div className="form-field">
              <label htmlFor="s-atual">Senha atual</label>
              <input id="s-atual" ref={senhaRef} className="input" type="password" autoComplete="current-password" required value={senha.atual} onChange={(e) => setSenha({ ...senha, atual: e.target.value })} />
            </div>
            <div className="form-field">
              <label htmlFor="s-nova">Nova senha</label>
              <input id="s-nova" className="input" type="password" autoComplete="new-password" minLength={8} required value={senha.nova} onChange={(e) => setSenha({ ...senha, nova: e.target.value })} />
              <span className="muted small">Mínimo de 8 caracteres.</span>
            </div>
            <div className="form-field">
              <label htmlFor="s-conf">Confirme a nova senha</label>
              <input id="s-conf" className="input" type="password" autoComplete="new-password" minLength={8} required value={senha.confirma} onChange={(e) => setSenha({ ...senha, confirma: e.target.value })} />
            </div>
            {erroSenha && <ErrorBox>{erroSenha}</ErrorBox>}
            <div className="profile-actions">
              <button className="btn btn--primary" disabled={trocando}><KeyRound size={16} /> {trocando ? 'Alterando…' : 'Alterar senha'}</button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

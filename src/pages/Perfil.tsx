import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, Gift, LogOut, ReceiptText, Save } from 'lucide-react';
import { confirmar, PageHeader, Toast } from '../components/ui';
import { memberNumber, useMe, useStore } from '../store';
import { Avatar } from './Home';
import { maskPhone, phoneOk } from '../masks';

export default function Perfil() {
  const me = useMe();
  const { atualizarPerfil, logout } = useStore();
  const [form, setForm] = useState({ nome: me.cliente.nome, telefone: maskPhone(me.cliente.telefone) });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'error' } | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneOk(form.telefone)) {
      setToast({ msg: 'Informe o celular completo, com DDD.', tone: 'error' });
      return;
    }
    setBusy(true);
    try {
      await atualizarPerfil({ nome: form.nome.trim(), telefone: form.telefone.trim() });
      setToast({ msg: 'Dados atualizados com sucesso', tone: 'ok' });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : 'Não foi possível salvar.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="Meu Perfil" />

      <div className="profile-card">
        <Avatar editable />
        <h2>{me.cliente.nome}</h2>
        <p className="profile__member">{me.nivel.atual.nome} #{memberNumber(me.cliente.numero)}</p>
        <div className="stats">
          <div className="stat"><small>Pontos</small><strong className="gold">{me.pontos.toLocaleString('pt-BR')}</strong></div>
          <div className="stat"><small>Visitas</small><strong>{me.visitas}</strong></div>
          <div className="stat"><small>Reservas</small><strong>{me.reservas.length}</strong></div>
        </div>
      </div>

      <form className="card form" onSubmit={save}>
        <label className="label" htmlFor="name">Nome completo</label>
        <input id="name" className="input" required minLength={3} maxLength={120} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        <label className="label" htmlFor="phone">Celular</label>
        <input id="phone" className="input" type="tel" inputMode="tel" maxLength={15} placeholder="(00) 00000-0000" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: maskPhone(e.target.value) })} />
        <label className="label" htmlFor="email">E-mail</label>
        <input id="email" className="input" type="email" value={me.cliente.email} disabled />
        <button className="btn btn--primary" disabled={busy}><Save size={18} /> Salvar alterações</button>
      </form>

      <div className="card list">
        <Link to="/reservas" className="link-row"><CalendarDays size={20} /> Minhas reservas <ChevronRight size={18} /></Link>
        <Link to="/historico" className="link-row"><ReceiptText size={20} /> Meu histórico <ChevronRight size={18} /></Link>
        <Link to="/recompensas" className="link-row"><Gift size={20} /> Minhas recompensas <ChevronRight size={18} /></Link>
        <button className="link-row" onClick={async () => (await confirmar({ title: 'Sair da conta?', message: 'Você poderá entrar novamente com seu e-mail e senha.', confirmLabel: 'Sair' })) && logout()}>
          <LogOut size={20} /> Sair da conta <ChevronRight size={18} />
        </button>
      </div>

      <p className="muted small center">
        Afilhado desde {new Date(me.cliente.desde).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
      </p>
      <Toast msg={toast?.msg ?? null} tone={toast?.tone} onDone={clearToast} />
    </div>
  );
}

import { useState } from 'react';
import { LogIn, UserPlus } from 'lucide-react';
import { Logo } from '../components/ui';
import { useStore } from '../store';
import { maskPhone, phoneOk } from '../masks';

export default function Entrar() {
  const { login, cadastro, error: connError } = useStore();
  const [mode, setMode] = useState<'login' | 'cadastro'>('login');
  const [form, setForm] = useState({ nome: '', email: '', telefone: '', senha: '', confirma: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'cadastro' && !phoneOk(form.telefone)) {
      setError('Informe o celular completo, com DDD.');
      return;
    }
    if (mode === 'cadastro' && form.senha !== form.confirma) {
      setError('As senhas não conferem.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') await login(form.email, form.senha);
      else await cadastro({ nome: form.nome, email: form.email, telefone: form.telefone, senha: form.senha });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__brand">
        <Logo asLink={false} size={150} />
        <p className="auth__tagline">Aqui a amizade sempre vale mais</p>
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'is-active' : ''} onClick={() => { setMode('login'); setError(null); }}>
          Entrar
        </button>
        <button role="tab" aria-selected={mode === 'cadastro'} className={mode === 'cadastro' ? 'is-active' : ''} onClick={() => { setMode('cadastro'); setError(null); }}>
          Quero ser afilhado
        </button>
      </div>

      <form className="card form" onSubmit={submit}>
        {mode === 'cadastro' && (
          <>
            <label className="label" htmlFor="nome">Nome completo</label>
            <input id="nome" className="input" autoComplete="name" required minLength={3} maxLength={120} value={form.nome} onChange={set('nome')} />
            <label className="label" htmlFor="tel">Celular</label>
            <input id="tel" className="input" type="tel" inputMode="tel" autoComplete="tel" maxLength={15} placeholder="(00) 00000-0000" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: maskPhone(e.target.value) })} />
          </>
        )}
        <label className="label" htmlFor="email">E-mail</label>
        <input id="email" className="input" type="email" autoComplete="email" required maxLength={160} value={form.email} onChange={set('email')} />
        <label className="label" htmlFor="senha">Senha</label>
        <input id="senha" className="input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={6} value={form.senha} onChange={set('senha')} />
        {mode === 'cadastro' && (
          <>
            <label className="label" htmlFor="confirma">Confirme a senha</label>
            <input id="confirma" className="input" type="password" autoComplete="new-password" required minLength={6} value={form.confirma} onChange={set('confirma')} />
          </>
        )}

        {(error || connError) && <p className="error">{error ?? connError}</p>}
        <button className="btn btn--primary" disabled={busy}>
          {mode === 'login' ? <><LogIn size={18} /> Entrar</> : <><UserPlus size={18} /> Criar minha conta</>}
        </button>
        {mode === 'cadastro' && (
          <p className="muted small center">Ao se cadastrar você passa a acumular pontos a cada consumo no bar.</p>
        )}
      </form>
    </div>
  );
}

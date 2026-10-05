import { useState } from 'react';
import { LogIn, ShieldCheck } from 'lucide-react';
import { Brand } from '../components/Layout';
import { ErrorBox } from '../components/ui';
import { useSession } from '../lib/session';

export default function Login() {
  const { setupPendente, login, setup, serverError } = useSession();
  const [form, setForm] = useState({ nome: '', email: '', senha: '', confirma: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (setupPendente && form.senha !== form.confirma) return setError('As senhas não conferem.');
    setBusy(true);
    try {
      if (setupPendente) await setup(form.nome, form.email, form.senha);
      else await login(form.email, form.senha);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login__art">
        <Brand large />
        <p>Sistema de gestão integrado ao aplicativo dos afilhados.</p>
      </div>
      <form className="login__card" onSubmit={submit}>
        {setupPendente ? (
          <>
            <h1><ShieldCheck size={22} /> Primeiro acesso</h1>
            <p className="muted">Crie o usuário administrador. Ele poderá cadastrar os demais usuários e definir as funções de cada um.</p>
            <label htmlFor="nome">Nome completo</label>
            <input id="nome" className="input" autoComplete="name" required value={form.nome} onChange={set('nome')} />
          </>
        ) : (
          <h1>Login</h1>
        )}
        <label htmlFor="email">E-mail</label>
        <input id="email" className="input" type="email" autoComplete="username" required value={form.email} onChange={set('email')} />
        <label htmlFor="senha">Senha</label>
        <input id="senha" className="input" type="password" autoComplete={setupPendente ? 'new-password' : 'current-password'} required minLength={setupPendente ? 8 : undefined} value={form.senha} onChange={set('senha')} />
        {setupPendente && (
          <>
            <label htmlFor="confirma">Confirme a senha</label>
            <input id="confirma" className="input" type="password" autoComplete="new-password" required minLength={8} value={form.confirma} onChange={set('confirma')} />
            <p className="muted small">Mínimo de 8 caracteres.</p>
          </>
        )}
        {(error || serverError) && <ErrorBox>{error ?? serverError}</ErrorBox>}
        <button className="btn btn--primary btn--lg" disabled={busy}>
          {setupPendente ? <><ShieldCheck size={18} /> Criar administrador</> : <><LogIn size={18} /> Login</>}
        </button>
      </form>
    </div>
  );
}

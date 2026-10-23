import { useState } from 'react';
import { KeyRound, LogIn, UserPlus } from 'lucide-react';
import { Marca } from '../components/ui';
import { useStore } from '../store';
import { api } from '../api';
import { maskCpf, maskPhone, nascimentoMaximo, phoneOk } from '../masks';
import { cpfValido, idadeEm } from '../../shared/backend';

export default function Entrar() {
  const { login, cadastro, error: connError } = useStore();
  // quem chega pelo QR Code do bar (?via=qr) já cai no cadastro, e o cadastro registra a origem
  const [viaQr] = useState(() => new URLSearchParams(location.search).get('via') === 'qr');
  const [mode, setMode] = useState<'login' | 'cadastro'>(viaQr ? 'cadastro' : 'login');
  const [form, setForm] = useState({ nome: '', email: '', telefone: '', senha: '', confirma: '', cpf: '', nascimento: '' });
  const [aceite, setAceite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAviso(null);
    if (mode === 'cadastro' && (!phoneOk(form.telefone) || !form.telefone)) {
      setError('Informe o celular completo, com DDD.');
      return;
    }
    if (mode === 'cadastro' && !cpfValido(form.cpf)) {
      setError('Informe um CPF válido.');
      return;
    }
    if (mode === 'cadastro') {
      const idade = idadeEm(form.nascimento);
      if (idade === null) { setError('Informe sua data de nascimento.'); return; }
      if (idade < 18) { setError('O programa de afilhados é exclusivo para maiores de 18 anos.'); return; }
    }
    if (mode === 'cadastro' && !aceite) {
      setError('Para participar, marque que concorda com o uso dos dados.');
      return;
    }
    if (mode === 'cadastro' && form.senha !== form.confirma) {
      setError('As senhas não conferem.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') await login(form.email, form.senha);
      else await cadastro({ nome: form.nome, email: form.email, telefone: form.telefone, senha: form.senha, cpf: form.cpf, nascimento: form.nascimento, aceite, ...(viaQr ? { via: 'qr' } : {}) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  };
  // o e-mail pode ter conta de um cadastro apagado: o link cria uma nova senha
  const esqueci = async () => {
    setError(null);
    setAviso(null);
    setBusy(true);
    try {
      await api('/app/redefinir-senha', { method: 'POST', body: { email: form.email } });
      setAviso(`Se ${form.email.trim()} tiver uma conta, você receberá um e-mail com o link para criar uma nova senha. Confira também o spam.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o e-mail.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__art">
        <Marca size={150} />
      </div>

      <div className="auth__card">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'is-active' : ''} onClick={() => { setMode('login'); setError(null); setAviso(null); }}>
          Entrar
        </button>
        <button role="tab" aria-selected={mode === 'cadastro'} className={mode === 'cadastro' ? 'is-active' : ''} onClick={() => { setMode('cadastro'); setError(null); setAviso(null); }}>
          Quero ser afilhado
        </button>
      </div>

      <h1 className="auth__title">
        {mode === 'login' ? <><LogIn size={24} /> Entrar</> : <><UserPlus size={24} /> Quero ser afilhado</>}
      </h1>
      <p className="muted">
        {mode === 'login' ? 'Entre com o e-mail e a senha do seu cadastro.' : 'Crie sua conta e ganhe pontos a cada visita ao Dindo.'}
      </p>
      <form className="form auth__form" onSubmit={submit}>
        {mode === 'cadastro' && (
          <>
            <label className="label" htmlFor="nome">Nome completo</label>
            <input id="nome" className="input" autoComplete="name" required minLength={3} maxLength={120} value={form.nome} onChange={set('nome')} />
            <label className="label" htmlFor="tel">Celular</label>
            <input id="tel" className="input" type="tel" inputMode="tel" autoComplete="tel" maxLength={15} placeholder="(00) 00000-0000" required value={form.telefone} onChange={(e) => setForm({ ...form, telefone: maskPhone(e.target.value) })} />
            <div className="form__dupla">
              <span>
                <label className="label" htmlFor="cpf">CPF</label>
                <input id="cpf" className="input" inputMode="numeric" autoComplete="off" maxLength={14} placeholder="000.000.000-00" required value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })} />
              </span>
              <span>
                <label className="label" htmlFor="nasc">Data de nascimento</label>
                <input id="nasc" className="input" type="date" required max={nascimentoMaximo()} min="1900-01-01" value={form.nascimento} onChange={set('nascimento')} />
              </span>
            </div>
            <p className="aviso18">Programa exclusivo para maiores de 18 anos.</p>
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
            <label className="check">
              <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
              <span>Tenho 18 anos ou mais e concordo que o Bar do Dindo use meus dados para o programa de afilhados.</span>
            </label>
          </>
        )}

        {(error || connError) && <p className="error">{error ?? connError}</p>}
        {aviso && <p className="muted small center" role="status">{aviso}</p>}
        <button className="btn btn--primary" disabled={busy}>
          {mode === 'login' ? <><LogIn size={18} /> Entrar</> : <><UserPlus size={18} /> Criar minha conta</>}
        </button>
        {(mode === 'login' || error?.includes('Esqueci minha senha')) && (
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={esqueci}><KeyRound size={18} /> Esqueci minha senha</button>
        )}
        {mode === 'cadastro' && (
          <p className="muted small center">Ao se cadastrar você passa a acumular pontos a cada consumo no bar.</p>
        )}
      </form>
      </div>
    </div>
  );
}

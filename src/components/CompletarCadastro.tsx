import { useState } from 'react';
import { BadgeCheck, LogOut } from 'lucide-react';
import { Marca } from './ui';
import { memberNumber, useStore } from '../store';
import { maskCpf, nascimentoMaximo } from '../masks';
import { cpfValido, idadeEm } from '../../shared/backend';

/**
 * Cadastros feitos antes do lançamento não têm CPF nem data de nascimento.
 * O programa agora exige os dois (maiores de 18 anos): a pessoa completa uma vez e segue para o app.
 */
export default function CompletarCadastro() {
  const { me, atualizarPerfil, logout } = useStore();
  const [cpf, setCpf] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!cpfValido(cpf)) return setErro('Informe um CPF válido.');
    const idade = idadeEm(nascimento);
    if (idade === null) return setErro('Informe sua data de nascimento.');
    if (idade < 18) return setErro('O programa de afilhados é exclusivo para maiores de 18 anos.');
    setBusy(true);
    try {
      await atualizarPerfil({ cpf, nascimento });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__art"><Marca size={120} /></div>
      <div className="auth__card">
        <h1 className="auth__title"><BadgeCheck size={24} /> Complete seu cadastro</h1>
        <p className="muted">
          Olá, {me?.cliente.nome.split(' ')[0]}! O programa de afilhados agora pede o CPF e a data de nascimento.
          Seu número <b>#{me ? memberNumber(me.cliente.numero) : ''}</b> e seus pontos continuam garantidos.
        </p>
        <form className="form auth__form" onSubmit={salvar}>
          <label className="label" htmlFor="c-cpf">CPF</label>
          <input id="c-cpf" className="input" inputMode="numeric" maxLength={14} placeholder="000.000.000-00" required value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))} />
          <label className="label" htmlFor="c-nasc">Data de nascimento</label>
          <input id="c-nasc" className="input" type="date" required max={nascimentoMaximo()} min="1900-01-01" value={nascimento} onChange={(e) => setNascimento(e.target.value)} />
          <p className="aviso18">Programa exclusivo para maiores de 18 anos. O CPF fica só com o Bar do Dindo.</p>
          {erro && <p className="error">{erro}</p>}
          <button className="btn btn--primary" disabled={busy}><BadgeCheck size={18} /> {busy ? 'Salvando…' : 'Concluir'}</button>
          <button type="button" className="btn btn--ghost" onClick={() => void logout()}><LogOut size={18} /> Sair</button>
        </form>
      </div>
    </div>
  );
}

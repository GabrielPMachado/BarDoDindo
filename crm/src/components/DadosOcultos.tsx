/**
 * Dados pessoais dos afilhados (e-mail, celular, CPF, nascimento) aparecem ocultos no Cérebro.
 * Quem pode editar Clientes revela com o botão de olho; os demais só veem a versão oculta.
 */
import { Eye, EyeOff } from 'lucide-react';

const PONTOS = '•••';
/** "santiago@teste.local" → "sa•••@teste.local" */
export const ocultarEmail = (e: string) => {
  const [u, d] = e.split('@');
  return d === undefined ? PONTOS : `${u.slice(0, 2)}${PONTOS}@${d}`;
};
/** "(51) 99876-5432" → "(51) •••••-5432" */
export const ocultarTelefone = (t: string) => {
  const d = t.replace(/\D/g, '');
  return d.length < 10 ? PONTOS : `(${d.slice(0, 2)}) •••••-${d.slice(-4)}`;
};
/** "529.982.247-25" (ou o mascarado do servidor) → "•••.•••.•••-25" */
export const ocultarCpf = (c: string) => {
  const d = c.replace(/[^\d]/g, '');
  return d.length >= 2 ? `•••.•••.•••-${d.slice(-2)}` : '•••.•••.•••-••';
};
export const DATA_OCULTA = '••/••/••••';

/** Botão de olho para mostrar ou esconder os dados pessoais. */
export function BotaoRevelar({ visivel, onClick, rotulo = 'dados pessoais', compacto }: { visivel: boolean; onClick: () => void; rotulo?: string; compacto?: boolean }) {
  const texto = `${visivel ? 'Ocultar' : 'Mostrar'} ${rotulo}`;
  return (
    <button type="button" className={compacto ? 'icon-btn revelar' : 'btn btn--ghost btn--sm revelar'} onClick={onClick} aria-pressed={visivel} title={texto} aria-label={texto}>
      {visivel ? <EyeOff size={compacto ? 14 : 15} /> : <Eye size={compacto ? 14 : 15} />}
      {!compacto && <span>{visivel ? 'Ocultar dados' : 'Mostrar dados'}</span>}
    </button>
  );
}

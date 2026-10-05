import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Camera, ChevronRight, Gift, ReceiptText, Star, Utensils } from 'lucide-react';
import { ConsumoSheet, CrownIcon, Empty, HistoryRow, ReservationCard, SectionHeader } from '../components/ui';
import { memberNumber, upcoming, useMe, useStore, type Consumption } from '../store';

const ACTIONS = [
  { to: '/reservas', label: 'Fazer Reserva', icon: CalendarDays, primary: true },
  { to: '/historico', label: 'Meu Histórico', icon: ReceiptText },
  { to: '/cardapio', label: 'Cardápio', icon: Utensils },
  { to: '/recompensas', label: 'Minhas Recompensas', icon: Gift },
];

export function Avatar({ editable = false, size = 'lg' }: { editable?: boolean; size?: 'lg' | 'md' }) {
  const { cliente } = useMe();
  const { atualizarPerfil } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const initials = cliente.nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

  const onFile = (f?: File) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      // reduz a foto antes de enviar ao servidor
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const s = 240;
        c.width = c.height = s;
        const ctx = c.getContext('2d')!;
        const min = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, s, s);
        atualizarPerfil({ foto: c.toDataURL('image/jpeg', 0.82) }).catch((e) => setErro(e.message));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(f);
  };

  return (
    <div className={`avatar avatar--${size}`} title={erro ?? undefined}>
      {cliente.foto ? <img src={cliente.foto} alt={cliente.nome} /> : <span className="avatar__initials">{initials}</span>}
      {editable && (
        <>
          <button className="avatar__cam" onClick={() => input.current?.click()} aria-label="Trocar foto">
            <Camera size={18} />
          </button>
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </>
      )}
    </div>
  );
}

function BeerGlass() {
  return (
    <svg viewBox="0 0 120 170" className="beer" aria-hidden="true">
      <defs>
        <linearGradient id="beer" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6b73c" />
          <stop offset="0.55" stopColor="#d9861c" />
          <stop offset="1" stopColor="#8f4f0d" />
        </linearGradient>
        <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M14 30 L106 30 L96 160 Q60 168 24 160 Z" fill="url(#beer)" />
      <path d="M22 40 L34 40 L36 150 L28 150 Z" fill="url(#shine)" />
      <path d="M10 32 Q12 8 34 12 Q44 0 62 8 Q80 0 92 12 Q112 10 110 32 Q60 42 10 32 Z" fill="#fbf1de" />
      {[[40, 70], [70, 100], [52, 120], [80, 60], [64, 140]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill="#fff6" />
      ))}
      <g transform="translate(60 92)" fill="#3a1d05" textAnchor="middle" fontFamily="Playfair Display, Georgia, serif">
        <path d="M-10 -26 L-8 -36 L-3 -31 L0 -38 L3 -31 L8 -36 L10 -26 Z" />
        <text y="-12" fontSize="9" fontWeight="700">BAR DO</text>
        <text y="8" fontSize="20" fontWeight="800">DINDO</text>
        <path d="M-22 14 Q0 20 22 14" stroke="#3a1d05" strokeWidth="1.6" fill="none" />
      </g>
    </svg>
  );
}

export default function Home() {
  const me = useMe();
  const [detail, setDetail] = useState<Consumption | null>(null);
  const next = upcoming(me.reservas);
  const recent = [...me.consumos].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 3);

  return (
    <div className="page">
      <section className="profile">
        <Avatar editable />
        <div className="profile__info">
          <h1 className="profile__name">{me.cliente.nome}</h1>
          <p className="profile__member">{me.nivel.atual.nome} #{memberNumber(me.cliente.numero)}</p>
          <p className="profile__motto">
            <span className="gold"><CrownIcon size={22} /></span>
            Aqui a amizade<br />sempre vale mais
          </p>
        </div>
        <Link to="/recompensas" className="points-chip" aria-label={`${me.pontos} pontos — ver recompensas`}>
          <span className="points-chip__star"><Star size={20} fill="currentColor" /></span>
          <span>
            <strong>{me.pontos.toLocaleString('pt-BR')}</strong>
            <small>PONTOS</small>
          </span>
          <ChevronRight size={20} />
        </Link>
      </section>

      <section className="banner">
        <div className="banner__text">
          <h2>Bem-vindo,<br /><span>Afilhado!</span></h2>
          <p>Boa cerveja, boas companhias<br />e sempre um assunto melhor.</p>
        </div>
        <BeerGlass />
      </section>

      <section className="actions">
        {ACTIONS.map(({ to, label, icon: Icon, primary }) => (
          <Link key={to} to={to} className={`action ${primary ? 'action--primary' : ''}`}>
            <Icon size={34} strokeWidth={1.6} />
            <span>{label}</span>
          </Link>
        ))}
      </section>

      <SectionHeader title="Minhas próximas reservas" to="/reservas" />
      {next.length ? (
        <ReservationCard r={next[0]} />
      ) : (
        <Empty icon={<CalendarDays />}>
          Nenhuma reserva marcada. <Link to="/reservas" className="gold">Reserve sua mesa</Link>
        </Empty>
      )}

      <SectionHeader title="Meu histórico de consumo" to="/historico" linkLabel="Ver todos" />
      {recent.length ? (
        <div className="card list">
          {recent.map((c) => <HistoryRow key={c.id} c={c} onClick={() => setDetail(c)} />)}
        </div>
      ) : (
        <Empty icon={<ReceiptText />}>
          Seu consumo aparece aqui quando o bar registrar sua comanda. Informe seu número de afilhado
          (#{memberNumber(me.cliente.numero)}) ao fechar a conta.
        </Empty>
      )}
      {detail && <ConsumoSheet c={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

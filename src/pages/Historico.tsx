import { useMemo, useState } from 'react';
import { ReceiptText } from 'lucide-react';
import { brl } from '../data';
import { ConsumoSheet, Empty, HistoryRow, PageHeader } from '../components/ui';
import { dayKey, memberNumber, useMe, type Consumption } from '../store';

const monthKey = (isoStr: string) => dayKey(isoStr).slice(0, 7);
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export default function Historico() {
  const me = useMe();
  const sorted = useMemo(() => [...me.consumos].sort((a, b) => b.data.localeCompare(a.data)), [me.consumos]);
  const months = useMemo(() => [...new Set(sorted.map((c) => monthKey(c.data)))], [sorted]);
  const [filter, setFilter] = useState<string>('all');
  const [detail, setDetail] = useState<Consumption | null>(null);

  const items = filter === 'all' ? sorted : sorted.filter((c) => monthKey(c.data) === filter);
  const total = items.reduce((s, c) => s + c.valor, 0);
  const pts = items.reduce((s, c) => s + c.pontos, 0);
  const visits = new Set(items.map((c) => dayKey(c.data))).size;

  // agrupa por dia para leitura mais fácil
  const groups = items.reduce<Record<string, Consumption[]>>((acc, c) => {
    const raw = new Date(c.data).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const day = raw.charAt(0).toUpperCase() + raw.slice(1);
    (acc[day] ||= []).push(c);
    return acc;
  }, {});

  return (
    <div className="page">
      <PageHeader title="Meu Histórico" subtitle="Tudo o que você consumiu no Dindo" />

      <div className="stats">
        <div className="stat"><small>Total gasto</small><strong>{brl(total)}</strong></div>
        <div className="stat"><small>Pontos</small><strong className="gold">+{pts.toLocaleString('pt-BR')}</strong></div>
        <div className="stat"><small>Visitas</small><strong>{visits}</strong></div>
      </div>

      {months.length > 1 && (
        <div className="chips chips--scroll">
          <button className={`chip ${filter === 'all' ? 'is-active' : ''}`} onClick={() => setFilter('all')}>Todos</button>
          {months.map((m) => (
            <button key={m} className={`chip ${filter === m ? 'is-active' : ''}`} onClick={() => setFilter(m)}>
              {monthLabel(m)}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <Empty icon={<ReceiptText />}>
          Nenhum consumo registrado ainda. Informe seu número de afilhado (#{memberNumber(me.cliente.numero)}) ao fechar a conta
          para acumular pontos.
        </Empty>
      ) : (
        Object.entries(groups).map(([day, list]) => (
          <div key={day}>
            <h3 className="day-title">{day}</h3>
            <div className="card list">{list.map((c) => <HistoryRow key={c.id} c={c} onClick={() => setDetail(c)} />)}</div>
          </div>
        ))
      )}
      {detail && <ConsumoSheet c={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

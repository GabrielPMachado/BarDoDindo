import { useCallback, useState } from 'react';
import { Gift, Star, Ticket } from 'lucide-react';
import { Empty, PageHeader, SectionHeader, Toast } from '../components/ui';
import { ItemIcon } from '../components/ItemIcon';
import { useMe, useStore, type Recompensa, type Redemption } from '../store';

export default function Recompensas() {
  const me = useMe();
  const { recompensas, resgatar } = useStore();
  const [pick, setPick] = useState<Recompensa | null>(null);
  const [voucher, setVoucher] = useState<Redemption | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  const { atual, proximo } = me.nivel;
  const progress = proximo ? Math.min(100, ((me.acumulados - atual.minimo) / (proximo.minimo - atual.minimo)) * 100) : 100;

  const doRedeem = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      const r = await resgatar(pick.id);
      setPick(null);
      setVoucher(r);
    } catch (err) {
      setPick(null);
      setToast(err instanceof Error ? err.message : 'Não foi possível resgatar.');
    } finally {
      setBusy(false);
    }
  };

  const active = me.resgates.filter((r) => r.status === 'Disponível');
  const used = me.resgates.filter((r) => r.status !== 'Disponível');

  return (
    <div className="page">
      <PageHeader title="Minhas Recompensas" subtitle="Troque seus pontos por benefícios exclusivos" />

      <section className="points-hero">
        <div className="points-hero__top">
          <span className="points-chip__star points-chip__star--lg"><Star size={28} fill="currentColor" /></span>
          <div>
            <strong>{me.pontos.toLocaleString('pt-BR')}</strong>
            <small>pontos disponíveis</small>
          </div>
        </div>
        <div className="level">
          <div className="level__row">
            <span>Nível <b className="gold">{atual.nome}</b></span>
            {proximo && (
              <span className="muted small">
                {(proximo.minimo - me.acumulados).toLocaleString('pt-BR')} pts para {proximo.nome}
              </span>
            )}
          </div>
          <div className="bar"><div className="bar__fill" style={{ width: `${progress}%` }} /></div>
        </div>
      </section>

      {active.length > 0 && (
        <>
          <SectionHeader title="Vouchers para usar" />
          <div className="stack">
            {active.map((r) => (
              <button key={r.id} className="card voucher" onClick={() => setVoucher(r)}>
                <ItemIcon categoria="recompensa" />
                <div className="hist-row__main">
                  <strong>{r.recompensa}</strong>
                  <span className="muted small">Apresente o código ao garçom</span>
                </div>
                <span className="code">{r.codigo}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <SectionHeader title="Catálogo de recompensas" />
      {recompensas.length === 0 ? (
        <Empty icon={<Gift />}>O catálogo de recompensas será publicado em breve.</Empty>
      ) : (
        <div className="rewards">
          {recompensas.map((r) => {
            const can = me.pontos >= r.custo;
            return (
              <div key={r.id} className={`card reward ${can ? '' : 'is-locked'}`}>
                <ItemIcon categoria="recompensa" size="lg" />
                <strong>{r.nome}</strong>
                <span className="muted small">{r.descricao}</span>
                <div className="reward__foot">
                  <span className="gold"><Star size={14} fill="currentColor" /> {r.custo.toLocaleString('pt-BR')}</span>
                  <button className="btn btn--primary btn--small" disabled={!can} onClick={() => setPick(r)}>
                    {can ? 'Resgatar' : `Faltam ${(r.custo - me.pontos).toLocaleString('pt-BR')}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {used.length > 0 && (
        <>
          <SectionHeader title="Resgates anteriores" />
          <div className="card list">
            {used.map((r) => (
              <div key={r.id} className="hist-row is-used">
                <ItemIcon categoria="recompensa" />
                <div className="hist-row__main">
                  <strong>{r.recompensa}</strong>
                  <span className="muted small">{new Date(r.data).toLocaleDateString('pt-BR')} · {r.status}</span>
                </div>
                <span className="muted small">{r.status === 'Cancelado' ? 'estornado' : `−${r.custo} pts`}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {pick && (
        <div className="overlay" onClick={() => !busy && setPick(null)}>
          <div className="sheet sheet--center" onClick={(e) => e.stopPropagation()}>
            <div className="success-icon"><Gift size={34} /></div>
            <h3>Resgatar {pick.nome}?</h3>
            <p className="muted">
              Serão debitados <b className="gold">{pick.custo.toLocaleString('pt-BR')} pontos</b>. Saldo após o resgate:{' '}
              {(me.pontos - pick.custo).toLocaleString('pt-BR')}.
            </p>
            <div className="row">
              <button className="btn btn--ghost" disabled={busy} onClick={() => setPick(null)}>Agora não</button>
              <button className="btn btn--primary" disabled={busy} onClick={doRedeem}>Resgatar</button>
            </div>
          </div>
        </div>
      )}

      {voucher && (
        <div className="overlay" onClick={() => setVoucher(null)}>
          <div className="sheet sheet--center" onClick={(e) => e.stopPropagation()}>
            <div className="success-icon"><Ticket size={34} /></div>
            <h3>{voucher.recompensa}</h3>
            <p className="muted">Apresente este código ao garçom para usar sua recompensa.</p>
            <div className="code code--big">{voucher.codigo}</div>
            <button className="btn btn--primary" onClick={() => setVoucher(null)}>Fechar</button>
          </div>
        </div>
      )}
      <Toast msg={toast} tone="error" onDone={clearToast} />
    </div>
  );
}

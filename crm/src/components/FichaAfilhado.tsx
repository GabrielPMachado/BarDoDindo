/**
 * Ficha do afilhado no Cérebro (Afilhados → Clientes): corrige o cadastro e as respostas do questionário,
 * gera o relatório individual em PDF e as mesmas imagens do cartão que o afilhado salva no pré-cadastro
 * (post e Stories do Instagram).
 */
import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Save } from 'lucide-react';
import type { Pergunta } from '../../../shared/backend';
import { imagemCartao } from '../../../shared/cartao';
import { alternar, ehOutro, montarResposta } from '../../../shared/questionario';
import logoUrl from '../../../shared/assets/logo.webp';
import { api } from '../lib/api';
import { reload } from '../lib/data';
import { brl, dateBR, num } from '../lib/format';
import { maskPhone } from '../lib/masks';
import { relatorioAfilhado, type AfilhadoRelatorio, type HistoricoAfilhado } from '../lib/relatorioAfilhado';
import { AsyncButton, Badge, Modal, notify } from './ui';
import { BotaoRevelar, DATA_OCULTA, ocultarCpf, ocultarEmail, ocultarTelefone } from './DadosOcultos';

const numero = (n: number) => `#${n < 0 ? '-' : ''}${String(Math.abs(n)).padStart(3, '0')}`;
const pad = (n: number) => numero(n).slice(1);
const maskCpf = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
};

/** Resposta gravada ("A; Outro: texto") de volta para as opções marcadas; o que não for opção atual fica guardado à parte. */
function lerResposta(p: Pergunta, v: string) {
  if (!p.opcoes.length) return { marcadas: v ? [v] : [], outro: '', extras: [] as string[] };
  const marcadas: string[] = [], extras: string[] = [];
  let outro = '';
  for (const parte of v.split('; ').map((x) => x.trim()).filter(Boolean)) {
    const o = p.opcoes.find((x) => x === parte) ?? p.opcoes.find((x) => ehOutro(x) && parte.startsWith(`${x}: `));
    if (!o) { extras.push(parte); continue; }
    if (!marcadas.includes(o)) marcadas.push(o);
    if (o !== parte) outro = parte.slice(o.length + 2);
  }
  return { marcadas, outro, extras };
}

/** Ícone do Instagram (o lucide não traz mais ícones de marcas). */
const IconeInstagram = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".6" fill="currentColor" />
  </svg>
);

type Estado = Record<string, { marcadas: string[]; outro: string; extras: string[] }>;

function carregarImagem(src: string) {
  return new Promise<HTMLImageElement>((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = src; });
}
const baixar = (blob: Blob, nome: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

export function FichaAfilhado({ cliente: c, perguntas, podeEditar, onClose }: {
  cliente: AfilhadoRelatorio & { cadastroCompleto?: boolean }; perguntas: Pergunta[]; podeEditar: boolean; onClose: () => void;
}) {
  const [nome, setNome] = useState(c.nome);
  const [telefone, setTelefone] = useState(c.telefone ? maskPhone(c.telefone) : '');
  const [cpf, setCpf] = useState(c.cpf ?? '');
  const [nascimento, setNascimento] = useState(c.nascimento ?? '');
  const inicial = useMemo<Estado>(() => Object.fromEntries(perguntas.map((p) => [p.id, lerResposta(p, String(c.respostas?.[p.id] ?? ''))])), [perguntas, c.respostas]);
  const [resp, setResp] = useState<Estado>(inicial);
  const [previa, setPrevia] = useState<string | null>(null);
  // e-mail, celular, CPF e nascimento ficam ocultos; só quem edita Clientes revela (e só então edita esses campos)
  const [mostrar, setMostrar] = useState(false);
  const aberto = podeEditar && mostrar;
  const afilhado = { numero: c.numero, nome, desde: c.desde };

  // prévia do cartão (formato post), refeita quando o nome muda
  useEffect(() => {
    let url = '', vivo = true;
    const t = setTimeout(async () => {
      const blob = await imagemCartao('post', { numero: c.numero, nome: nome.trim() || c.nome, desde: c.desde }, await carregarImagem(logoUrl)).catch(() => null);
      if (!blob || !vivo) return;
      url = URL.createObjectURL(blob);
      setPrevia(url);
    }, 250);
    return () => { vivo = false; clearTimeout(t); if (url) URL.revokeObjectURL(url); };
  }, [c.numero, c.nome, c.desde, nome]);

  const respostas = () => Object.fromEntries(perguntas.map((p) => {
    const e = resp[p.id];
    return [p.id, [montarResposta(p, e.marcadas, e.outro), ...e.extras].filter(Boolean).join('; ')];
  }));
  const docsMudaram = cpf.replace(/\D/g, '') !== (c.cpf ?? '').replace(/\D/g, '') || nascimento !== (c.nascimento ?? '');
  const sujo = nome.trim() !== c.nome || telefone.replace(/\D/g, '') !== (c.telefone ?? '').replace(/\D/g, '') || docsMudaram
    || JSON.stringify(resp) !== JSON.stringify(inicial);

  const salvar = async () => {
    const body: Record<string, unknown> = { nome, telefone, respostas: respostas() };
    if (docsMudaram) Object.assign(body, { cpf, nascimento });
    const r = await api<{ mudou: string[] }>(`/crm/clientes/${c.numero}`, { method: 'PATCH', body });
    await reload('/crm/clientes');
    notify(r.mudou.length ? `Cadastro de ${nome.trim()} atualizado.` : 'Nada mudou.');
    onClose();
  };
  const relatorio = async () => {
    const h = await api<HistoricoAfilhado>(`/crm/clientes/${c.numero}/historico`);
    await relatorioAfilhado({ ...c, nome: nome.trim() || c.nome }, h, perguntas, !aberto);
  };
  const imagem = async (formato: 'post' | 'stories') => {
    const blob = await imagemCartao(formato, afilhado, await carregarImagem(logoUrl));
    const arquivo = `afilhado-${pad(c.numero)}-${formato === 'stories' ? 'stories' : 'bar-do-dindo'}.png`;
    const arq = new File([blob], arquivo, { type: 'image/png' });
    // no celular abre o menu de compartilhar (Instagram, WhatsApp...); no computador, baixa
    if (formato === 'stories' && navigator.canShare?.({ files: [arq] })) await navigator.share({ files: [arq] }).catch(() => undefined);
    else baixar(blob, arquivo);
  };

  const marcar = (p: Pergunta, o: string) => setResp((r) => ({ ...r, [p.id]: { ...r[p.id], marcadas: alternar(p, r[p.id].marcadas, o) } }));
  const muda = (p: Pergunta, campo: 'outro' | 'texto', v: string) =>
    setResp((r) => ({ ...r, [p.id]: campo === 'texto' ? { ...r[p.id], marcadas: v ? [v] : [] } : { ...r[p.id], outro: v } }));
  const removidas = Object.entries(c.respostas ?? {}).filter(([k, v]) => k !== 'respondidoEm' && v && !perguntas.some((p) => p.id === k));

  return (
    <Modal title={`Ficha de ${c.nome}`} onClose={onClose} width={980}
      footer={<>
        <span className="muted small afi__aviso">{podeEditar ? 'As alterações ficam registradas nos logs.' : 'Você pode consultar e gerar o material; para ver os dados pessoais e editar, peça a permissão de editar Clientes.'}</span>
        <button type="button" className="btn btn--ghost" onClick={onClose}>{sujo ? 'Cancelar' : 'Fechar'}</button>
        {podeEditar && <AsyncButton className="btn btn--primary" disabled={!sujo} onClick={salvar}><Save size={15} /> Salvar alterações</AsyncButton>}
      </>}>
      <div className="afi">
        <div className="afi__dados">
          <div className="afi__resumo">
            <span className="afi__num">{numero(c.numero)}</span>
            {c.origem && <Badge tone={c.origem === 'Equipe' ? 'neutral' : 'info'}>{c.origem}</Badge>}
            {c.via && <Badge tone="info">{c.via}</Badge>}
            {!c.cadastroCompleto && <Badge tone="warn">Sem CPF</Badge>}
          </div>
          <dl className="afi__kpis">
            <div><dt>Pontos</dt><dd>{num(c.pontos)}</dd></div>
            <div><dt>Nível</dt><dd>{c.nivel || '—'}</dd></div>
            <div><dt>Visitas</dt><dd>{num(c.visitas)}</dd></div>
            <div><dt>Consumo</dt><dd>{brl(c.totalGasto)}</dd></div>
          </dl>

          <div className="afi__cabecalho">
            <h3 className="afi__titulo">Cadastro</h3>
            {podeEditar && <BotaoRevelar visivel={mostrar} onClick={() => setMostrar((v) => !v)} />}
          </div>
          <div className="form-grid">
            <div className="form-field form-field--wide">
              <label htmlFor="fa-nome">Nome completo</label>
              <input id="fa-nome" className="input" value={nome} maxLength={120} disabled={!podeEditar} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="form-field">
              <label htmlFor="fa-email">E-mail (login)</label>
              <input id="fa-email" className="input" value={aberto ? c.email : ocultarEmail(c.email)} disabled title="O e-mail é o login da conta: só o próprio afilhado troca." />
            </div>
            <div className="form-field">
              <label htmlFor="fa-tel">Celular</label>
              {aberto
                ? <input id="fa-tel" className="input" inputMode="tel" value={telefone} onChange={(e) => setTelefone(maskPhone(e.target.value))} placeholder="(51) 99999-9999" />
                : <input id="fa-tel" className="input" value={c.telefone ? ocultarTelefone(c.telefone) : '—'} disabled />}
            </div>
            <div className="form-field">
              <label htmlFor="fa-cpf">CPF</label>
              {aberto
                ? <input id="fa-cpf" className="input" inputMode="numeric" value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))} placeholder="000.000.000-00" />
                : <input id="fa-cpf" className="input" value={c.cpf ? ocultarCpf(c.cpf) : '—'} disabled />}
            </div>
            <div className="form-field">
              <label htmlFor="fa-nasc">Nascimento</label>
              {aberto
                ? <input id="fa-nasc" className="input" type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} />
                : <input id="fa-nasc" className="input" value={c.cpf || c.nascimento ? DATA_OCULTA : '—'} disabled />}
            </div>
            <div className="form-field">
              <label>Afilhado desde</label>
              <input className="input" value={dateBR(c.desde)} disabled />
            </div>
          </div>
          {docsMudaram && <p className="muted small">CPF e nascimento são salvos juntos: os dois precisam estar preenchidos (só maiores de 18 anos).</p>}

          <h3 className="afi__titulo">Questionário</h3>
          {c.respostas?.respondidoEm ? <p className="muted small">Respondido em {dateBR(c.respostas.respondidoEm)}.</p>
            : <p className="muted small">Ainda não respondeu{podeEditar ? '. Dá para preencher aqui com o que ele(a) contar.' : '.'}</p>}
          <div className="afi__perguntas">
            {perguntas.map((p, i) => {
              const e = resp[p.id];
              return (
                <fieldset key={p.id} className="afi__pergunta" disabled={!podeEditar} aria-labelledby={`afi-p-${p.id}`}>
                  <p id={`afi-p-${p.id}`} className="afi__enunciado">{String(i + 1).padStart(2, '0')}. {p.texto}{p.multipla && <span className="muted small"> (várias)</span>}</p>
                  {!p.opcoes.length ? (
                    <textarea className="input" rows={2} maxLength={2000} value={e.marcadas[0] ?? ''} onChange={(ev) => muda(p, 'texto', ev.target.value)} placeholder="Sem resposta" />
                  ) : (
                    <>
                      <div className="afi__opcoes">
                        {p.opcoes.map((o) => (
                          <button key={o} type="button" className={`chip ${e.marcadas.includes(o) ? 'is-on' : ''}`} aria-pressed={e.marcadas.includes(o)} onClick={() => marcar(p, o)}>{o}</button>
                        ))}
                      </div>
                      {p.opcoes.some((o) => ehOutro(o) && e.marcadas.includes(o)) && (
                        <input className="input" value={e.outro} maxLength={300} onChange={(ev) => muda(p, 'outro', ev.target.value)} placeholder="Qual?" />
                      )}
                      {e.extras.length > 0 && <p className="muted small">Resposta antiga guardada: {e.extras.join('; ')}</p>}
                    </>
                  )}
                </fieldset>
              );
            })}
            {removidas.length > 0 && (
              <dl className="respostas">
                {removidas.map(([k, v]) => <div key={k}><dt>Pergunta removida do questionário</dt><dd>{v}</dd></div>)}
              </dl>
            )}
          </div>
        </div>

        <aside className="afi__material">
          <h3 className="afi__titulo">Material do afilhado</h3>
          <div className="afi__previa">
            {previa ? <img src={previa} alt={`Cartão de afilhado ${numero(c.numero)}`} /> : <span className="muted small">Montando o cartão…</span>}
          </div>
          <AsyncButton className="btn btn--insta" onClick={() => imagem('stories')}><IconeInstagram /> Imagem para os Stories</AsyncButton>
          <AsyncButton className="btn btn--ghost" onClick={() => imagem('post')}><Download size={16} /> Baixar cartão (post)</AsyncButton>
          <AsyncButton className="btn btn--ghost" onClick={relatorio}><FileText size={16} /> Relatório em PDF</AsyncButton>
          <p className="muted small">As mesmas imagens que o afilhado salva ao se cadastrar. O relatório traz o cadastro, os pontos, as respostas, os consumos e os vouchers.</p>
        </aside>
      </div>
    </Modal>
  );
}

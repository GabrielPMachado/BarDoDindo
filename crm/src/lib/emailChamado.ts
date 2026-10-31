/**
 * E-mail de aviso quando um chamado de suporte é aberto. O site não tem servidor, então quem envia é um Google Apps Script
 * publicado na conta Google do bar (scripts/email-chamados.gs): o Cérebro monta o e-mail aqui e manda para o endereço do
 * script, que fica no banco (segredos/email), legível só pela equipe logada. Os destinatários ficam no próprio script.
 */
import { api } from './api';
import { dateBR } from './format';
import { TEMPOS_DE_RESPOSTA } from '../components/TemposResposta';
import { SITE_OFICIAL } from '../../../shared/firebase-config';
import type { Row } from './data';

export const linkDoChamado = (id: string) => `${SITE_OFICIAL}/crm/#/ti/chamados?abrir=${encodeURIComponent(id)}`;

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Cores de cada prioridade (fundo da faixa, texto). */
const CORES: Record<string, [string, string]> = {
  Crítica: ['#e5484d', '#ffffff'],
  Alta: ['#f08a3c', '#1a0f08'],
  Média: ['#f2c14e', '#1a1405'],
  Baixa: ['#4cc27a', '#06140b'],
};

export interface DadosDoEmail {
  chamado: Row;
  /** Quem cadastrou no Cérebro. */
  registradoPor?: string;
  teste?: boolean;
}

/** Assunto, HTML (tabelas e estilos inline, que é o que Gmail e Outlook entendem) e versão em texto. */
export function montarEmailChamado({ chamado: c, registradoPor, teste }: DadosDoEmail) {
  const prioridade = String(c.prioridade || 'Média');
  const tempos = TEMPOS_DE_RESPOSTA.find((t) => t.prioridade === prioridade) ?? TEMPOS_DE_RESPOSTA[2];
  const [cor, corTexto] = CORES[prioridade] ?? CORES.Média;
  const titulo = String(c.titulo || 'Chamado sem título');
  const link = linkDoChamado(String(c.id ?? ''));
  const aberto = dateBR(c.abertura || new Date().toLocaleDateString('sv-SE'));
  const solicitante = String(c.solicitante || '') || registradoPor || '—';
  const descricao = String(c.descricao || '').trim();
  const assunto = `${teste ? '[Teste] ' : ''}[${prioridade}] Chamado: ${titulo}`;

  const linha = (rotulo: string, valor: string) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #282220;color:#a59990;font-size:13px;width:140px;vertical-align:top">${rotulo}</td>
      <td style="padding:10px 0;border-bottom:1px solid #282220;color:#f3ece6;font-size:14px;vertical-align:top">${valor}</td>
    </tr>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>${esc(assunto)}</title></head>
<body style="margin:0;padding:0;background:#0a0909;font-family:Inter,'Segoe UI',Roboto,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(`${prioridade}: ${titulo}. Resposta ${tempos.resposta}, solução ${tempos.solucao}.`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0909">
<tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#131110;border:1px solid #282220;border-radius:14px;overflow:hidden">
    <tr><td style="padding:22px 28px;border-bottom:3px solid #c4572a">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:12px"><img src="${SITE_OFICIAL}/icon.png" width="44" height="44" alt="Bar do Dindo" style="display:block;border-radius:10px"></td>
        <td>
          <div style="font-family:'Roboto Slab',Georgia,serif;font-size:20px;font-weight:700;color:#f3ece6">Bar do Dindo</div>
          <div style="font-size:12px;color:#a59990;letter-spacing:.06em;text-transform:uppercase">Cérebro · Chamados de suporte</div>
        </td>
      </tr></table>
    </td></tr>
    ${teste ? `<tr><td style="padding:10px 28px;background:#231e1c;color:#f2c14e;font-size:13px">Este é um e-mail de teste, enviado pela tela de Configurações. Nenhum chamado foi aberto.</td></tr>` : ''}
    <tr><td style="padding:24px 28px 8px">
      <span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${cor};color:${corTexto};font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">Prioridade ${esc(prioridade)}</span>
      <h1 style="margin:14px 0 4px;font-family:'Roboto Slab',Georgia,serif;font-size:22px;line-height:1.3;color:#f3ece6">${esc(titulo)}</h1>
      <p style="margin:0;color:#a59990;font-size:14px">Novo chamado aberto em ${esc(aberto)}.</p>
    </td></tr>
    <tr><td style="padding:16px 28px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1b1716;border:1px solid #282220;border-left:4px solid ${cor};border-radius:10px">
        <tr>
          <td width="50%" style="padding:14px 16px">
            <div style="font-size:11px;color:#a59990;text-transform:uppercase;letter-spacing:.06em">Primeira resposta</div>
            <div style="font-size:18px;font-weight:700;color:#f3ece6;margin-top:2px">${esc(tempos.resposta)}</div>
          </td>
          <td width="50%" style="padding:14px 16px;border-left:1px solid #282220">
            <div style="font-size:11px;color:#a59990;text-transform:uppercase;letter-spacing:.06em">Solução</div>
            <div style="font-size:18px;font-weight:700;color:#f3ece6;margin-top:2px">${esc(tempos.solucao)}</div>
          </td>
        </tr>
        <tr><td colspan="2" style="padding:0 16px 14px;color:#a59990;font-size:12px">${esc(tempos.quando)}</td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:4px 28px 8px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${linha('Categoria', esc(c.categoria || '—'))}
        ${linha('Aberto por', esc(solicitante))}
        ${registradoPor && registradoPor !== solicitante ? linha('Registrado por', esc(registradoPor)) : ''}
        ${linha('Aberto em', esc(aberto))}
        ${linha('Status', esc(c.status || 'Aberta'))}
      </table>
    </td></tr>
    <tr><td style="padding:16px 28px 4px">
      <div style="font-size:11px;color:#a59990;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Descrição</div>
      <div style="background:#1b1716;border:1px solid #282220;border-radius:10px;padding:14px 16px;color:#f3ece6;font-size:14px;line-height:1.55;white-space:pre-wrap">${descricao ? esc(descricao) : '<span style="color:#a59990">Sem descrição.</span>'}</div>
    </td></tr>
    <tr><td align="center" style="padding:26px 28px 30px">
      <a href="${esc(link)}" style="display:inline-block;padding:13px 26px;background:#c4572a;color:#0d0907;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none">Abrir o chamado no Cérebro</a>
      <div style="margin-top:10px;font-size:12px;color:#a59990">ou copie o link: <a href="${esc(link)}" style="color:#e07a4c">${esc(link)}</a></div>
    </td></tr>
    <tr><td style="padding:16px 28px;background:#0f0d0c;border-top:1px solid #282220;color:#a59990;font-size:12px;text-align:center">
      Aviso automático do Cérebro, o sistema do Bar do Dindo · <a href="${SITE_OFICIAL}" style="color:#a59990">bardodindo.com.br</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const texto = [
    `Novo chamado de suporte (${prioridade})`, '', titulo, '',
    `Primeira resposta: ${tempos.resposta}`, `Solução: ${tempos.solucao}`, '',
    `Categoria: ${c.categoria || '—'}`, `Aberto por: ${solicitante}`, `Aberto em: ${aberto}`, `Status: ${c.status || 'Aberta'}`, '',
    'Descrição:', descricao || 'Sem descrição.', '', `Abrir o chamado: ${link}`,
  ].join('\n');

  return { assunto, html, texto };
}

/** Manda o e-mail pelo script. Sem endereço configurado, não faz nada (devolve false). */
export async function enviarEmailChamado(dados: DadosDoEmail) {
  const { url } = await api<{ url: string }>('/crm/email/chamados');
  if (!url) return false;
  // text/plain evita a consulta prévia (CORS) que o Apps Script não responde
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(montarEmailChamado(dados)) });
  const r = await res.json().catch(() => null) as { ok?: boolean; erro?: string } | null;
  if (!res.ok || !r?.ok) throw new Error(r?.erro || 'O script do e-mail não respondeu. Confira o endereço em Configurações.');
  return true;
}

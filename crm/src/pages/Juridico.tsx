import { BookOpen, ExternalLink } from 'lucide-react';
import { COLLECTIONS } from '../collections';
import { CollectionPage } from '../components/CollectionPage';

/** Textos oficiais (Planalto) das leis que mais pesam no dia a dia da casa. */
const LEIS = {
  cf: { nome: 'Constituição Federal', ref: 'de 1988', url: 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm' },
  cc: { nome: 'Código Civil', ref: 'Lei nº 10.406/2002', url: 'https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm' },
  ctn: { nome: 'Código Tributário Nacional', ref: 'Lei nº 5.172/1966', url: 'https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm' },
  rpem: { nome: 'Registro Público de Empresas Mercantis e Atividades Afins', ref: 'Lei nº 8.934/1994', url: 'https://www.planalto.gov.br/ccivil_03/leis/l8934.htm' },
  clt: { nome: 'Consolidação das Leis do Trabalho (CLT)', ref: 'Decreto-Lei nº 5.452/1943', url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm' },
  simples: { nome: 'Simples Nacional', ref: 'Lei Complementar nº 123/2006', url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm' },
  cdc: { nome: 'Código de Defesa do Consumidor', ref: 'Lei nº 8.078/1990', url: 'https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm' },
};
type Lei = keyof typeof LEIS;

function LeisOficiais({ quais, titulo }: { quais: Lei[]; titulo: string }) {
  return (
    <section className="panel leis">
      <div className="panel__head"><h2><BookOpen size={16} className="inline-icon gold" /> {titulo}</h2><span className="muted small">Texto oficial, sempre atualizado, no site do Planalto</span></div>
      <div className="leis__grade">
        {quais.map((k) => (
          <a key={k} className="leis__item" href={LEIS[k].url} target="_blank" rel="noopener noreferrer">
            <span><b>{LEIS[k].nome}</b><small className="muted">{LEIS[k].ref}</small></span>
            <ExternalLink size={15} />
          </a>
        ))}
      </div>
    </section>
  );
}

/** Advogados de uma área de atuação (Consultoria jurídica, Trabalhista e Tributário, Empresarial). */
export function Advogados({ atuacao }: { atuacao: string }) {
  return (
    <CollectionPage
      key={atuacao}
      def={{ ...COLLECTIONS.advogados, title: `Advogados · ${atuacao}` }}
      filterRows={(r) => r.atuacao === atuacao}
      newDefaults={{ atuacao }}
    />
  );
}

const NORMAS = {
  trabalhista: { titulo: 'Normas da CLT e tributárias', ambitos: ['Trabalhista (CLT)', 'Tributário'], leis: ['clt', 'ctn', 'simples'] as Lei[] },
  empresarial: { titulo: 'Normas da área empresarial', ambitos: ['Empresarial', 'Registro de empresas', 'Civil', 'Consumidor'], leis: ['cc', 'rpem', 'cdc'] as Lei[] },
};
export function Normas({ tipo }: { tipo: keyof typeof NORMAS }) {
  const n = NORMAS[tipo];
  return (
    <CollectionPage
      key={tipo}
      def={{ ...COLLECTIONS.normas, title: n.titulo }}
      filterRows={(r) => n.ambitos.includes(String(r.ambito))}
      newDefaults={{ ambito: n.ambitos[0] }}
      before={() => <LeisOficiais quais={n.leis} titulo="Leis de referência" />}
    />
  );
}

/** Leis e normas: as quatro leis-base da casa e a biblioteca completa de normas cadastradas. */
export function Leis() {
  return (
    <CollectionPage
      def={COLLECTIONS.normas}
      before={() => <LeisOficiais quais={['cf', 'cc', 'ctn', 'rpem', 'clt', 'cdc']} titulo="Legislação" />}
    />
  );
}

// Apaga os canais de prévia do Firebase Hosting (pr<número>-...) de PRs que já foram fechados ou mergeados.
// O plano grátis tem limite de canais; sem isso, a prévia de um PR novo falha com "channel quota reached".
// Nunca toca no canal "live" (o site no ar). Uso: node scripts/limpar-previas.mjs <PRs abertos separados por espaço>
import { execFileSync } from 'node:child_process';

const PROJETO = 'bardo-c0878';
const abertos = new Set(process.argv.slice(2).join(' ').split(/\s+/).filter(Boolean));
const firebase = (...args) => execFileSync('npx', ['-y', 'firebase-tools@15', ...args, '--project', PROJETO], { encoding: 'utf8' });

const lista = JSON.parse(firebase('hosting:channel:list', '--json'));
const canais = (lista.result?.channels ?? lista.result ?? []).map((c) => c.name.split('/').pop());
let apagados = 0;
for (const id of canais) {
  const pr = /^pr(\d+)-/.exec(id)?.[1];
  if (id === 'live' || !pr || abertos.has(pr)) continue;
  console.log(`Apagando a prévia ${id} (PR #${pr} fechado)`);
  firebase('hosting:channel:delete', id, '--force');
  apagados++;
}
console.log(`${canais.length} canais, ${apagados} apagados. PRs abertos: ${[...abertos].join(', ') || 'nenhum'}.`);

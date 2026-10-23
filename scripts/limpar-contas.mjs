// Apaga as contas de login (Firebase Authentication) que ficaram sem cadastro: nem afilhado (`clientes/{uid}`)
// nem usuário do CRM (`usuarios/{uid}`). Acontece depois de "Apagar todos os afilhados", "Zerar o sistema"
// ou da exclusão de um afilhado ou usuário: o site só apaga os dados, porque apagar a conta de login de outra
// pessoa exige credencial de administrador, que não pode ficar no navegador.
// Roda pelo GitHub Actions (.github/workflows/limpar-contas.yml) com a conta de serviço do projeto, que precisa
// dos papéis "Administrador do Firebase Authentication" e "Leitor do Cloud Datastore".
// Uso: GOOGLE_APPLICATION_CREDENTIALS=conta.json node scripts/limpar-contas.mjs [--simular]
// Nos emuladores: FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 PROJETO=<id> node ...
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const PROJETO = process.env.PROJETO || 'bardo-c0878';
// conta criada há menos tempo pode estar no meio do cadastro (a conta nasce antes do registro no banco)
const CARENCIA_MS = Number(process.env.CARENCIA_MIN ?? 10) * 60 * 1000;
const simular = process.argv.includes('--simular');

initializeApp({ projectId: PROJETO });
const auth = getAuth();
const db = getFirestore();

// e-mail mascarado no log (o log do GitHub Actions pode ser público)
const mascarar = (email = '') => email.replace(/^(.{0,2})[^@]*(@.*)?$/, (_, ini, dom = '') => `${ini}***${dom}`);

const contas = [];
let pagina;
do {
  const r = await auth.listUsers(1000, pagina);
  contas.push(...r.users);
  pagina = r.pageToken;
} while (pagina);

const agora = Date.now();
const candidatas = contas.filter((u) => agora - new Date(u.metadata.creationTime).getTime() > CARENCIA_MS);
const sobras = [];
for (let i = 0; i < candidatas.length; i += 100) {
  const parte = candidatas.slice(i, i + 100);
  // getAll falha se a conta de serviço não puder ler o banco: nesse caso nada é apagado.
  // Cada registro pedido custa 1 leitura: primeiro os afilhados (a maioria); a equipe só para quem não é afilhado.
  const clientes = await db.getAll(...parte.map((u) => db.doc(`clientes/${u.uid}`)));
  const semCliente = parte.filter((_, j) => !clientes[j].exists);
  if (!semCliente.length) continue;
  const usuarios = await db.getAll(...semCliente.map((u) => db.doc(`usuarios/${u.uid}`)));
  semCliente.forEach((u, j) => {
    if (!usuarios[j].exists) sobras.push(u);
  });
}

console.log(`${contas.length} conta(s) de login; ${sobras.length} sem cadastro${simular ? ' (simulação: nada apagado)' : ''}.`);
for (const u of sobras) console.log(`- ${mascarar(u.email)}`);
if (simular || !sobras.length) process.exit(0);

let falhas = 0;
for (let i = 0; i < sobras.length; i += 1000) {
  const r = await auth.deleteUsers(sobras.slice(i, i + 1000).map((u) => u.uid));
  falhas += r.failureCount;
  for (const e of r.errors) console.error(`falhou: ${e.error.message}`);
}
console.log(`${sobras.length - falhas} conta(s) apagada(s).`);
if (falhas) process.exit(1);

// Apaga todos os dados cadastrados de um banco, mantendo apenas um administrador e os parâmetros.
// Antes de apagar, salva uma cópia de segurança em server/data/backups/.
// Uso: node scripts/zerar-dados.mjs <arquivo.db> <email-do-admin-a-manter> --confirmar
import { mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const [arquivo, emailAdmin, flag] = process.argv.slice(2);
if (!arquivo || !emailAdmin || flag !== '--confirmar') {
  console.error('Uso: node scripts/zerar-dados.mjs <arquivo.db> <email-do-admin-a-manter> --confirmar');
  process.exit(1);
}
process.env.DINDO_DB = resolve(arquivo);
const { db } = await import('../server/db.mjs');

const admin = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(emailAdmin.toLowerCase());
if (!admin) {
  console.error(`Administrador ${emailAdmin} não encontrado neste banco; nada foi apagado.`);
  process.exit(1);
}

// 1. cópia de segurança completa e consistente
const pasta = join(dirname(resolve(arquivo)), 'backups');
mkdirSync(pasta, { recursive: true });
const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const copia = join(pasta, `${basename(arquivo, '.db')}-antes-de-zerar-${carimbo}.db`);
db.exec(`VACUUM INTO '${copia.replace(/'/g, "''")}'`);

const antes = {
  clientes: db.prepare('SELECT COUNT(*) n FROM clientes').get().n,
  registros: db.prepare("SELECT COUNT(*) n FROM records WHERE NOT (collection = 'funcoes' AND id = ?)").get(admin.funcao_id).n,
  usuarios: db.prepare('SELECT COUNT(*) n FROM usuarios WHERE id <> ?').get(admin.id).n,
};

// 2. apaga tudo, menos o administrador, a função dele e os parâmetros
db.exec('BEGIN');
try {
  db.prepare('DELETE FROM clientes').run();
  db.prepare("DELETE FROM sqlite_sequence WHERE name = 'clientes'").run(); // números de afilhado recomeçam em #001
  db.prepare("DELETE FROM records WHERE NOT (collection = 'funcoes' AND id = ?)").run(admin.funcao_id);
  db.prepare('DELETE FROM usuarios WHERE id <> ?').run(admin.id);
  db.prepare("DELETE FROM sessions WHERE NOT (kind = 'crm' AND subject = ?)").run(admin.id);
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}

console.log(`Banco: ${resolve(arquivo)}`);
console.log(`Cópia de segurança: ${copia}`);
console.log(`Apagados: ${antes.clientes} clientes, ${antes.registros} registros do CRM, ${antes.usuarios} outros usuários.`);
console.log(`Mantidos: administrador ${admin.email} e os parâmetros do aplicativo.`);

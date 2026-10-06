// Cria um usuário administrador diretamente no banco (ex.: primeiro acesso ou recuperação).
// Uso: node scripts/criar-admin.mjs <arquivo.db> "<Nome>" <email> <senha>
import { resolve } from 'node:path';

const [arquivo, nome, email, senha] = process.argv.slice(2);
if (!arquivo || !nome || !email || !senha) {
  console.error('Uso: node scripts/criar-admin.mjs <arquivo.db> "<Nome>" <email> <senha>');
  process.exit(1);
}
process.env.DINDO_DB = resolve(arquivo);
const { db, now, newId, hashPassword } = await import('../server/db.mjs');

const AREAS = ['dir', 'atd', 'vnd', 'mkt', 'rh', 'dp', 'adm', 'fin', 'jur', 'fis', 'mon', 'cfg'];
const t = now();
if (!db.prepare("SELECT 1 FROM records WHERE collection = 'funcoes' AND id = 'admin'").get()) {
  db.prepare('INSERT INTO records (id, collection, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    'admin', 'funcoes',
    JSON.stringify({ nome: 'Administrador', descricao: 'Acesso total ao sistema, inclusive configurações.', permissoes: Object.fromEntries(AREAS.map((a) => [a, 'edit'])), sistema: true }),
    t, t,
  );
}
const existente = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email.toLowerCase());
if (existente) {
  db.prepare("UPDATE usuarios SET funcao_id = 'admin', status = 'Ativo', senha_hash = ? WHERE id = ?").run(hashPassword(senha), existente.id);
  console.log(`Usuário ${email.toLowerCase()} atualizado como administrador.`);
} else {
  db.prepare('INSERT INTO usuarios (id, nome, email, funcao_id, status, senha_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(newId(), nome, email.toLowerCase(), 'admin', 'Ativo', hashPassword(senha), t);
  console.log(`Administrador ${email.toLowerCase()} criado.`);
}

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const file = process.env.DINDO_DB ?? join(here, 'data', 'dindo.db');
mkdirSync(dirname(file), { recursive: true });

export const db = new DatabaseSync(file);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    collection TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS records_collection ON records(collection);

  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    telefone TEXT NOT NULL DEFAULT '',
    foto TEXT,
    senha_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    funcao_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Ativo',
    senha_hash TEXT NOT NULL,
    ultimo_acesso TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    subject TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// colunas acrescentadas depois da criação da tabela de clientes
{
  const cols = db.prepare('PRAGMA table_info(clientes)').all().map((c) => c.name);
  if (!cols.includes('origem')) db.exec("ALTER TABLE clientes ADD COLUMN origem TEXT NOT NULL DEFAULT 'Aplicativo'");
  if (!cols.includes('aceite_em')) db.exec('ALTER TABLE clientes ADD COLUMN aceite_em TEXT');
}

export const now = () => new Date().toISOString();
export const newId = () => randomBytes(9).toString('base64url');

/* ---------- senhas ---------- */
export function hashPassword(senha) {
  const salt = randomBytes(16);
  const hash = scryptSync(senha, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}
export function verifyPassword(senha, stored) {
  const [, saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const hash = scryptSync(senha, Buffer.from(saltHex, 'hex'), 64);
  return timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

/* ---------- sessões ---------- */
export function createSession(kind, subject) {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, kind, subject, created_at) VALUES (?, ?, ?, ?)').run(token, kind, String(subject), now());
  return token;
}
export function readSession(token, kind) {
  if (!token) return null;
  const row = db.prepare('SELECT subject FROM sessions WHERE token = ? AND kind = ?').get(token, kind);
  return row ? row.subject : null;
}
export function dropSession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/* ---------- registros genéricos ---------- */
const parse = (r) => ({ ...JSON.parse(r.data), id: r.id, criadoEm: r.created_at, atualizadoEm: r.updated_at });

export function listRecords(collection) {
  return db.prepare('SELECT * FROM records WHERE collection = ? ORDER BY created_at DESC').all(collection).map(parse);
}
export function listRecordsWhere(collection, field, value) {
  return db
    .prepare(`SELECT * FROM records WHERE collection = ? AND json_extract(data, '$.' || ?) = ? ORDER BY created_at DESC`)
    .all(collection, field, value)
    .map(parse);
}
export function getRecord(collection, id) {
  const r = db.prepare('SELECT * FROM records WHERE collection = ? AND id = ?').get(collection, id);
  return r ? parse(r) : null;
}
const clean = (data) => {
  const { id: _id, criadoEm: _c, atualizadoEm: _u, ...rest } = data ?? {};
  return rest;
};
export function insertRecord(collection, data) {
  const id = newId();
  const t = now();
  db.prepare('INSERT INTO records (id, collection, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, collection, JSON.stringify(clean(data)), t, t);
  return getRecord(collection, id);
}
export function updateRecord(collection, id, patch) {
  const cur = getRecord(collection, id);
  if (!cur) return null;
  const merged = { ...clean(cur), ...clean(patch) };
  db.prepare('UPDATE records SET data = ?, updated_at = ? WHERE collection = ? AND id = ?')
    .run(JSON.stringify(merged), now(), collection, id);
  return getRecord(collection, id);
}
export function deleteRecord(collection, id) {
  return db.prepare('DELETE FROM records WHERE collection = ? AND id = ?').run(collection, id).changes > 0;
}

/* ---------- configuração ---------- */
export const DEFAULT_CONFIG = {
  nomeEstabelecimento: 'Bar do Dindo',
  pontosPorReal: 1,
  horarios: ['18:00', '19:00', '20:00', '21:00', '22:00'],
  ambientes: ['Salão principal'],
  diasFuncionamento: [0, 1, 2, 3, 4, 5, 6], // 0 = domingo
  antecedenciaMinutos: 30,
  niveis: [
    { nome: 'Afilhado', minimo: 0 },
    { nome: 'Compadre', minimo: 2000 },
    { nome: 'Padrinho', minimo: 5000 },
  ],
  // Tabela progressiva de contribuição do empregado ao INSS (editável no CRM em Parâmetros).
  faixasInss: [
    { ate: 1621.0, aliquota: 7.5 },
    { ate: 2902.84, aliquota: 9 },
    { ate: 4354.27, aliquota: 12 },
    { ate: 8475.55, aliquota: 14 },
  ],
  aliquotaFgts: 8,
};
export function getConfig() {
  const rows = db.prepare('SELECT key, value FROM config').all();
  const saved = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
  return { ...DEFAULT_CONFIG, ...saved };
}
export function setConfig(patch) {
  const stmt = db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(patch)) {
    if (k in DEFAULT_CONFIG) stmt.run(k, JSON.stringify(v));
  }
  return getConfig();
}

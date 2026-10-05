// Sobe a API usando o banco de DEMONSTRAÇÃO (server/data/demo.db), na porta 3334.
// O banco real (server/data/dindo.db) não é tocado.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.env.DINDO_DB = join(root, 'server', 'data', 'demo.db');
process.env.PORT = '3334';
await import('../server/index.mjs');

// Junta o CRM compilado (crm/dist) ao build do aplicativo (dist/crm) para publicar tudo num único site.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const origem = join(root, 'crm', 'dist'), destino = join(root, 'dist', 'crm');
if (!existsSync(origem) || !existsSync(join(root, 'dist'))) {
  console.error('Compile antes o aplicativo e o CRM (npm run build:all).');
  process.exit(1);
}
rmSync(destino, { recursive: true, force: true });
cpSync(origem, destino, { recursive: true });
console.log('CRM copiado para dist/crm.');

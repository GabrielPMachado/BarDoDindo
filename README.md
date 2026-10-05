# Bar do Dindo

Três partes que compartilham **um único servidor e um único banco de dados**:

| Parte | Pasta | Para quem | Endereço (desenvolvimento) |
| --- | --- | --- | --- |
| **API + banco** | `server/` | — | http://localhost:3333 |
| **App do afilhado** (celular, PWA / Android / iOS) | raiz (`src/`) | Clientes | http://localhost:5173 |
| **CRM / Gestão** (computador) | `crm/` | Equipe do bar | http://localhost:5174 |

Nenhum dado vem pré-cadastrado: cardápio, recompensas, clientes, equipe e lançamentos começam vazios e são preenchidos pelo uso real.

## Como os dois sistemas se conectam

- **Cardápio**: produtos cadastrados no CRM (*Marketing e Vendas → Produtos e cardápio*), ativos e marcados "No cardápio", aparecem no app.
- **Recompensas**: o catálogo é cadastrado no CRM e aparece no app. O resgate do cliente gera um voucher que a equipe vê em *Resgates* e dá baixa ao entregar.
- **Reservas**: o cliente solicita pelo app. A equipe confirma ou recusa em *Reservas* e o cliente vê o status no app.
- **Consumo e pontos**: em *Lançar consumo* a equipe registra a comanda do afilhado pelo número (#001…). Os pontos aparecem no app e o valor entra automaticamente em *Financeiro → Receita*. Excluir o lançamento estorna pontos e receita.
- **Parâmetros** (*Configurações*): dias e horários de reserva, ambientes, pontos por real, níveis de fidelidade e tabela do INSS.

## Áreas do CRM

**Cérebro** — categoria principal, reúne todas as áreas:

- **Diretoria**: painel executivo, metas e decisões
- **Atendimento**: reservas, lançar consumo, validar vouchers
- **Marketing e Vendas**: produtos e cardápio, clientes (afilhados), recompensas, criação, gestão de mídias
- **Pessoal (RH/DP)**: colaboradores, férias e afastamentos, folha de pagamento (o lançamento como despesa é feito pelo Financeiro)
- **Estrutura**: projetos, estoque, materiais
- **Administrativo**: serviços terceirizados, fornecedores, contratos
- **Financeiro**: receitas, despesas (inclui lançar a folha), resultado (DRE)
- **Jurídico**: trabalhista, consultoria empresarial
- **Fiscalização**: controle de qualidade, não conformidades
- **Monitoramento**: câmeras (grade pronta; conexão das câmeras a ser feita no futuro)
- **Configurações**: usuários, funções e permissões, parâmetros

Campos que se referem a pessoas ou cadastros são vinculados: o colaborador nas férias, o responsável nas metas, o fornecedor no estoque, o afilhado na reserva etc.

Cada **função** define, por área, *Sem acesso*, *Visualizar* ou *Editar*. As permissões são verificadas no servidor, e não só na tela.

## Rodando localmente

```bash
npm install
```

```bash
npm --prefix crm install
```

Em três terminais (versão compilada, estável; para ver mudanças no código, pare e rode de novo):

```bash
npm run server
```

```bash
npm run serve
```

```bash
npm run serve:crm
```

App em http://localhost:5173 e CRM em http://localhost:5174. Esses comandos compilam e servem a versão final por um servidor Node simples (`scripts/static-server.mjs`). Para desenvolvimento com atualização automática existem `npm run dev` e `npm run crm`, mas nesta máquina Windows o Vite já serviu arquivos desatualizados e travou sozinho; para usar o sistema, prefira os comandos acima.

O banco fica em `server/data/dindo.db` (SQLite embutido no Node 22.5+). **Faça backup desse arquivo.**

## Produção (um único servidor)

```bash
npm run build:all
```

```bash
npm start
```

O servidor entrega o app em `/`, o CRM em `/crm` e a API em `/api`. Publique atrás de HTTPS (ex.: VPS com Nginx/Caddy, Railway, Render, Fly.io com volume persistente para `server/data`).

## App Android / iOS (Capacitor)

Defina o endereço público da API antes do build do app:

```bash
set VITE_API_URL=https://seu-dominio.com.br
```

```bash
npm run cap:sync
```

Depois `npx cap add android` / `npx cap open android` (Android Studio) ou `npx cap add ios` / `npx cap open ios` (Xcode, macOS).

## Ambiente de demonstração (simulação ao vivo)

Usa um banco separado (`server/data/demo.db`); o banco real não é tocado. O simulador se recusa a rodar contra a API do banco real (porta 3333).

1. Crie o administrador do banco de demonstração (uma vez):

```bash
node scripts/criar-admin.mjs server/data/demo.db "Administrador" seu@email.com sua-senha
```

2. Compile o CRM:

```bash
npm --prefix crm run build
```

3. Suba a API de demonstração (porta 3334). O CRM fica em http://localhost:3334/crm:

```bash
npm run demo
```

4. Em outro terminal, rode a simulação (cadastros de afilhados, reservas e confirmações, vendas, resgates, baixas de vouchers e despesas):

```bash
npm run simular -- --email seu@email.com --senha sua-senha --vendas 100 --segundos 120
```

O CRM se atualiza sozinho a cada 2 segundos (indicador *Ao vivo* no topo). Para recomeçar do zero, pare a API de demonstração e apague os arquivos `server/data/demo.db*`.

## Segurança

- Senhas guardadas com hash *scrypt*; sessões por token.
- A senha mínima nas telas é de 8 caracteres para usuários do CRM e de 6 para clientes.
- Troque a senha inicial do administrador antes de publicar o sistema na internet (menu do usuário → *Alterar senha*).

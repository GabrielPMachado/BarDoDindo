# Bar do Dindo

Três partes que compartilham **um único projeto Firebase** (Authentication + Firestore), sem servidor próprio:

| Parte | Pasta | Para quem | Endereço publicado |
| --- | --- | --- | --- |
| **App do afilhado** (celular, PWA / Android / iOS) | raiz (`src/`) | Clientes | `/` |
| **CRM / Gestão** (computador) | `crm/` | Equipe do bar | `/crm` |
| **Pré-cadastro** | `precadastro/` | Clientes, antes do lançamento | `/afilhado` |

As telas chamam `api('/app/...')` e `api('/crm/...')` como antes; quem atende essas rotas é `shared/backend.ts`, no próprio navegador, lendo e gravando no Firestore. O que cada pessoa pode ler ou gravar é decidido em `firestore.rules`.

Nenhum dado vem pré-cadastrado: cardápio, recompensas, clientes, equipe e lançamentos começam vazios e são preenchidos pelo uso real.

## Como os dois sistemas se conectam

- **Cardápio**: produtos cadastrados no CRM (*Marketing e Vendas → Produtos e cardápio*), ativos e marcados "No cardápio", aparecem no app.
- **Recompensas**: o catálogo é cadastrado no CRM e aparece no app. O resgate do cliente gera um voucher que a equipe vê em *Resgates* e dá baixa ao entregar.
- **Reservas**: o cliente solicita pelo app. A equipe confirma ou recusa em *Reservas* e o cliente vê o status no app.
- **Consumo e pontos**: em *Lançar consumo* a equipe registra a comanda do afilhado pelo número (#001…). Os pontos aparecem no app e o valor entra automaticamente em *Financeiro → Receita*. Excluir o lançamento estorna pontos e receita.
- **Parâmetros** (*Configurações*): dias e horários de reserva, ambientes, pontos por real, níveis de fidelidade e tabela do INSS.

## Áreas do CRM

**Cérebro** é o nome do sistema de gestão. O menu tem três grandes grupos: **Diretoria**, **Departamentos** (Atendimento, Marketing e Vendas, Pessoal, Estrutura, Administrativo, Financeiro, Jurídico, Fiscalização e Monitoramento) e **Configurações**.

- **Painel de atualizações**: ao abrir o sistema aparece o que a equipe fez (cadastros, alterações, folha lançada, consumos, usuários…), com quem fez, o dia e o horário. O mesmo histórico fica no botão ao lado do perfil, no topo. Cada pessoa vê só as atualizações das áreas que ela acessa (`atividades/{área}/itens` no Firestore).
- **Painel executivo personalizável**: cada usuário escolhe como fica o seu painel. Botão direito sobre um bloco → *Fixar no topo* ou *Ocultar*; o botão *Personalizar* permite arrastar os blocos para mudar a ordem, mostrar de novo os ocultos e restaurar o padrão. Também dá para colocar qualquer página do CRM no painel: botão direito sobre ela no menu → *Adicionar ao painel* (entra como atalho fixado no topo). O botão *Adicionar bloco* abre um catálogo com blocos além dos padrões (vendas de hoje, ticket médio, vouchers a entregar, contas a pagar, equipe ausente, reservas de hoje, mais vendidos, estoque baixo, contratos a vencer e últimas atualizações), cada um disponível só para quem acessa a área dele. As escolhas ficam salvas na conta (`preferencias/{uid}` no Firestore) e valem em qualquer computador.
- **Fixar páginas**: o botão direito sobre uma página do menu abre em nova guia ou janela, copia o link e **fixa** a página no topo. Clicar no fixado abre a página e expande o departamento no menu. Os fixados ficam guardados no navegador, por usuário.

Áreas:

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

## Configuração do Firebase

1. No console do Firebase, ative **Authentication → E-mail/senha** e crie o **Firestore** (modo produção).
2. Registre um app Web no projeto e copie a configuração para `shared/firebase-config.ts`:

```bash
firebase apps:sdkconfig web --project ID-DO-PROJETO
```

3. Aponte a CLI para o projeto:

```bash
firebase use --add ID-DO-PROJETO
```

## Publicar (regras + site)

```bash
npm install
```

```bash
npm --prefix crm install
```

```bash
npm run publicar
```

Esse comando compila o app, o pré-cadastro e o CRM, junta tudo em `dist/` e publica o Hosting e as regras do Firestore. Logo depois de publicar, abra `/crm` e crie o administrador: enquanto isso não for feito, a tela de primeiro acesso fica aberta para quem tiver o endereço.

## Testar localmente (emuladores)

Os emuladores precisam de Java 21 ou mais novo. Nada do que for feito neles vai para o projeto real.

```bash
npm run emuladores
```

Em outro terminal, compile apontando para os emuladores (PowerShell: `$env:VITE_EMULADOR = '1'`) e abra http://127.0.0.1:5000:

```bash
npm run build:all
```

`scripts/testar-regras.mjs` confere que as regras barram o que não pode passar (cliente creditando pontos, criando voucher sem saldo, lendo salários, virando administrador etc.).

## App Android / iOS (Capacitor)

Com `shared/firebase-config.ts` preenchido:

```bash
npm run cap:sync
```

Depois `npx cap open android` (Android Studio) ou `npx cap add ios` / `npx cap open ios` (Xcode, macOS). O app fala direto com o Firebase, sem endereço de servidor para configurar.

## Segurança e limites do modelo sem servidor

- Contas e senhas ficam no Firebase Authentication (mínimo de 6 caracteres; as telas do CRM pedem 8).
- O app e o CRM têm sessões separadas, mesmo abertos no mesmo navegador.
- **Pontos**: quem credita é a equipe (lançamento de consumo). O cliente só consegue debitar o próprio saldo junto com a criação de um voucher, e as regras recusam se o saldo não cobrir o custo.
- **Usuários do CRM**: o administrador cria a conta com uma senha inicial. Depois disso, e-mail e senha pertencem à pessoa: ela troca a senha pelo menu do usuário, ou o administrador envia um e-mail de redefinição. Excluir um usuário tira o acesso ao CRM, mas a conta continua existindo no Firebase Authentication (para apagá-la de vez, use o console do Firebase).
- **Folha**: para calcular os totais, quem tem acesso ao Financeiro consegue ler o cadastro de colaboradores no banco, embora a tela só mostre o detalhe individual para o RH.
- **Produtos**: o cardápio público é uma cópia sem custo nem margem; o Atendimento lê o cadastro completo para lançar consumo.

## Servidor antigo (Node + SQLite)

`server/`, `scripts/demo-server.mjs`, `scripts/simular.mjs`, `scripts/static-server.mjs`, `scripts/criar-admin.mjs` e `scripts/zerar-dados.mjs` são da versão anterior, com API própria e banco SQLite. As telas não usam mais essa API.

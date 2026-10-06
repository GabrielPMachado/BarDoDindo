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

- **Cardápio**: produtos cadastrados no CRM (*Vendas → Produtos e cardápio*), ativos e marcados "No cardápio", aparecem no app.
- **Recompensas**: o catálogo é cadastrado no CRM e aparece no app. O resgate do cliente gera um voucher que a equipe vê em *Resgates* e dá baixa ao entregar.
- **Reservas**: o cliente solicita pelo app. A equipe confirma ou recusa em *Reservas* e o cliente vê o status no app.
- **Consumo e pontos**: em *Lançar consumo* a equipe registra a comanda do afilhado pelo número (#001…). Os pontos aparecem no app e o valor entra automaticamente em *Financeiro → Receita*. Excluir o lançamento estorna pontos e receita.
- **Parâmetros** (*Configurações*): dias e horários de reserva, ambientes, pontos por real, níveis de fidelidade e tabela do INSS.

## Áreas do CRM

**Cérebro** é o nome do sistema de gestão. O menu começa por **Meu perfil** (de todo usuário: *Meus dados*, onde a pessoa vê e edita as próprias informações e troca a senha, e *Meu painel*, um painel próprio montado com os blocos e atalhos que ela quiser; também dá para trocar a foto). Depois vêm três grandes grupos: **Diretoria**, **Departamentos** (Atendimento, Vendas, Marketing, Pessoal, Estrutura, Administrativo, Financeiro, Jurídico e Fiscalização) e **Configurações**.

- **Painel de atualizações**: ao abrir o sistema aparece o que a equipe fez (cadastros, alterações, folha lançada, consumos, usuários…), com quem fez, o dia e o horário. O mesmo histórico fica no botão ao lado do perfil, no topo. Cada pessoa vê só as atualizações das áreas que ela acessa (`atividades/{área}/itens` no Firestore).
- **Painel executivo personalizável**: cada usuário escolhe como fica o seu painel. Botão direito sobre um bloco → *Fixar no topo* ou *Ocultar*; o botão *Personalizar* permite arrastar os blocos para mudar a ordem, escolher o **tamanho** de cada um (¼, ½, ¾ ou a linha inteira — indicadores e painéis podem ficar lado a lado na ordem que a pessoa quiser), levá-los para o início ou o fim, mostrar de novo os ocultos e restaurar o padrão. As mesmas opções de tamanho e lugar aparecem no botão direito sobre o bloco. Também dá para colocar qualquer página do CRM no painel: botão direito sobre ela no menu → *Adicionar ao painel* (entra como atalho fixado no topo). O botão *Adicionar bloco* abre um catálogo com mais de 30 blocos além dos padrões, separados por área (Diretoria, Atendimento, Marketing, Pessoal, Estrutura, Administrativo, Financeiro, Jurídico, Fiscalização, Configurações), cada um disponível só para quem acessa a área dele. O mesmo vale para o *Meu painel* de cada usuário, que é independente do Painel executivo. As escolhas ficam salvas na conta (`preferencias/{uid}` no Firestore) e valem em qualquer computador.
- **Fixar páginas**: o botão direito (ou segurar o dedo) sobre uma página do menu abre em nova guia ou janela, copia o link e **fixa** a página. As fixadas aparecem em *Meu perfil → Fixados*; clicar abre a página e expande o departamento no menu. No topo fica o caminho da página atual (Cérebro / grupo / departamento / página).

Áreas:

- **Diretoria**: painel executivo, metas e decisões
- **Atendimento**: reservas, lançar consumo, validar vouchers
- **Vendas**: produtos e cardápio, clientes (afilhados)
- **Marketing**: recompensas (programa de fidelidade), criação, gestão de mídias
- **Pessoal**: colaboradores, férias e afastamentos, folha de pagamento (o lançamento como despesa é feito pelo Financeiro)
- **Estrutura**: projetos, estoque, materiais
- **Administrativo**: serviços terceirizados, fornecedores, contratos
- **Financeiro**: receitas, despesas (inclui lançar a folha), resultado (DRE)
- **Jurídico**: trabalhista, consultoria empresarial
- **Fiscalização**: controle de qualidade, não conformidades
- **Monitoramento**: câmeras — oculto por enquanto, até as câmeras serem conectadas
- **Configurações**: usuários, funções e permissões (por área: ver, criar, editar e excluir), parâmetros

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

## Ao vivo

O app e o CRM perguntam a cada 1 segundo se algo mudou (o pré-cadastro, a cada 1,5 s) e só então recarregam o que está na tela. A resposta vem dos dados que já chegam em tempo real do Firestore, então isso não gasta leituras extras. A primeira leitura de cada consulta espera a resposta do servidor (até 2,5 s), para nunca mostrar uma cópia local desatualizada.

Versões novas também entram sozinhas: o app (service worker) procura atualização a cada minuto, e o CRM confere se o site mudou e recarrega quando não há janela aberta nem campo em edição.

## Administração

- **Excluir afilhado** (Vendas → Clientes): apaga o cadastro, o saldo, os consumos (com as receitas), os vouchers e as reservas do afilhado. Exige permissão de excluir em Vendas e em Atendimento.
- **Numeração dos afilhados** (Configurações → Parâmetros): mostra o próximo número e, depois de excluir afilhados, ajusta para voltar a seguir o maior número em uso.
- **Zerar o sistema**: só a função Administrador, pela rota `/crm/admin/zerar` com a confirmação `ZERAR TUDO`. Apaga todas as informações (inclusive usuários, funções e parâmetros) e o sistema volta ao primeiro acesso. As contas de login continuam no Firebase Authentication. Logo depois de zerar, faça o primeiro acesso: até lá, quem abrir o CRM pode se cadastrar como administrador.

## Permissões

Cada função escolhe, área por área, um de 4 níveis: **Sem acesso**, **Ver**, **Editar** (ver, cadastrar e alterar) e **Total** (editar e também excluir, inclusive estornos). Por baixo cada nível vira uma lista de permissões (ver, criar, editar, excluir), que as telas, o backend e as regras do Firestore conferem uma a uma. Funções antigas, com um nível por área, continuam valendo: "Editar" equivale às quatro permissões e "Visualizar" a só ver.

## Períodos

Receitas, despesas, consumos e reservas crescem com o tempo, então as telas carregam só um período (12 meses para receitas e despesas, 90 dias para reservas e consumos), com um seletor que vai até "Todo o período". Contas a pagar em aberto aparecem sempre.

## Testes das regras

`npm run testar:regras` sobe os emuladores, cria os dados de teste (`scripts/semear-testes.mjs`) e confere que as regras do Firestore barram o que não pode passar (`scripts/testar-regras.mjs`). O GitHub Actions roda esse teste em cada pull request e antes de cada publicação: se algum falhar, nada é publicado.

## Valores e clientes

Os campos de **valor em R$** aceitam a digitação natural: "150" vira R$ 150,00 e "18,5" vira R$ 18,50 (antes o campo era preenchido como centavos, e "5" virava R$ 0,05).

Na lista de **Clientes (afilhados)**, gasto total, visitas e última visita vêm de totais guardados no saldo de cada afilhado (`saldos/{uid}`: `gasto`, `lancamentos`, `dias`), atualizados a cada consumo lançado ou estornado — a tela não precisa carregar todos os consumos. Saldos antigos, sem esses totais, são calculados uma vez a partir dos consumos e gravados na primeira abertura da lista por alguém do Atendimento.

## Celular e tablet

O CRM se adapta à tela. No tablet e no celular o menu lateral vira uma gaveta (botão ☰), as grades viram uma coluna e, no celular, as tabelas viram cartões e as janelas ocupam a tela inteira. Como no toque não há botão direito, **segurar o dedo** sobre uma página do menu ou um bloco do painel abre o mesmo menu (fixar, adicionar ao painel…), e no modo *Personalizar* as setas ↑↓ mudam os blocos de lugar.

## Fotos e exportação

Produtos, estoque, materiais, recompensas, peças de criação, publicações e colaboradores podem ter **foto** (a imagem é reduzida no navegador antes de salvar; aparece como miniatura na tabela e nos produtos de *Lançar consumo*). Toda lista de cadastro tem **Exportar → PDF** (com a logo, título, data, fotos, status coloridos, totais e páginas numeradas), **Excel (.xlsx)** (faixa de título com a logo e a data, cabeçalho laranja fixo com filtro, linhas zebradas com bordas, status coloridos, valores como números e datas de verdade, linha de totais com fórmula, fotos centralizadas nas células e pronto para imprimir em A4 com número de página) e **CSV**.

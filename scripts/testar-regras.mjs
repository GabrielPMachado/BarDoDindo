// Confere, contra os emuladores locais, que as regras do Firestore barram o que não pode passar.
// Uso: com `npm run emuladores` rodando e os dados de teste criados (`node scripts/semear-testes.mjs`),
// `node scripts/testar-regras.mjs <senhaCliente> <senhaAtendente>` — ou tudo de uma vez: `npm run testar:regras`.
// (cliente2@teste.local e atendente@teste.local são contas que só existem no emulador).
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  addDoc, arrayUnion, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, increment, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';

const [senhaCliente, senhaAtendente, senhaMarketing, senhaAdministrativo, senhaModular, senhaCaixa, senhaParametros, senhaFicha] = process.argv.slice(2);
const app = initializeApp({ apiKey: 'teste', projectId: 'demo-bardodindo' });
const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 8080);

let falhas = 0;
async function espera(esperado, nome, fn) {
  let obtido = 'permitido';
  try {
    await fn();
  } catch (e) {
    obtido = e.code === 'permission-denied' ? 'negado' : `erro (${e.code ?? e.message})`;
  }
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${nome}: ${obtido}${ok ? '' : ` (esperado: ${esperado})`}`);
}
const negado = (nome, fn) => espera('negado', nome, fn);
const permitido = (nome, fn) => espera('permitido', nome, fn);

console.log('— sem login —');
await negado('ler a chave da IA sem login', () => getDoc(doc(db, 'segredos', 'ia')));
await negado('ler o endereço do e-mail dos chamados sem login', () => getDoc(doc(db, 'segredos', 'email')));
await permitido('ler o cardápio público', () => getDocs(collection(db, 'cardapio')));
await permitido('ler recompensas ativas', () => getDocs(query(collection(db, 'recompensas'), where('status', '==', 'Ativa'))));
await negado('listar clientes', () => getDocs(collection(db, 'clientes')));
await negado('listar produtos (com custo)', () => getDocs(collection(db, 'produtos')));
await negado('listar usuários do CRM', () => getDocs(collection(db, 'usuarios')));
await negado('gravar configuração', () => setDoc(doc(db, 'config/geral'), { pontosPorReal: 999 }, { merge: true }));

console.log('— cliente do aplicativo —');
const { user } = await signInWithEmailAndPassword(auth, 'cliente2@teste.local', senhaCliente);
const uid = user.uid;
const recompensa = (await getDocs(query(collection(db, 'recompensas'), where('status', '==', 'Ativa')))).docs.find((d) => d.data().custo <= 100);
await permitido('ler o próprio cadastro', () => getDoc(doc(db, 'clientes', uid)));
await permitido('ler os próprios consumos', () => getDocs(query(collection(db, 'consumos'), where('clienteUid', '==', uid))));
await negado('listar todos os clientes', () => getDocs(collection(db, 'clientes')));
await negado('listar todos os consumos', () => getDocs(collection(db, 'consumos')));
await negado('listar colaboradores (salários)', () => getDocs(collection(db, 'colaboradores')));
await negado('listar produtos (com custo)', () => getDocs(collection(db, 'produtos')));
await negado('trocar o próprio número de afilhado', () => updateDoc(doc(db, 'clientes', uid), { numero: 1 }));
await negado('creditar pontos no próprio saldo', () => updateDoc(doc(db, 'saldos', uid), { acumulados: 100000 }));
await negado('criar voucher sem debitar o saldo', () => addDoc(collection(db, 'resgates'), {
  clienteUid: uid, clienteId: 2, recompensaId: recompensa.id, recompensa: 'x', custo: recompensa.data().custo, codigo: 'DINDO-FRAUDE', status: 'Disponível',
}));
await negado('criar voucher sem ter pontos', async () => {
  const ref = doc(collection(db, 'resgates'));
  const lote = writeBatch(db);
  lote.set(ref, { clienteUid: uid, clienteId: 2, recompensaId: recompensa.id, recompensa: 'x', custo: recompensa.data().custo, codigo: 'DINDO-FRAUDE', status: 'Disponível' });
  lote.update(doc(db, 'saldos', uid), { usados: increment(recompensa.data().custo), ultimoResgate: ref.id });
  await lote.commit();
});
await negado('criar voucher com custo adulterado', async () => {
  const ref = doc(collection(db, 'resgates'));
  const lote = writeBatch(db);
  lote.set(ref, { clienteUid: uid, clienteId: 2, recompensaId: recompensa.id, recompensa: 'x', custo: 0, codigo: 'DINDO-FRAUDE', status: 'Disponível' });
  lote.update(doc(db, 'saldos', uid), { usados: increment(0), ultimoResgate: ref.id });
  await lote.commit();
});
await negado('lançar consumo para si mesmo', () => addDoc(collection(db, 'consumos'), { clienteUid: uid, clienteId: 2, valor: 1000, pontos: 100000 }));
await negado('criar reserva já confirmada', () => addDoc(collection(db, 'reservas'), { clienteUid: uid, status: 'Confirmada', origem: 'Aplicativo' }));
await negado('criar reserva em nome de outro', () => addDoc(collection(db, 'reservas'), { clienteUid: 'outro', status: 'Pendente', origem: 'Aplicativo' }));
await negado('virar usuário do CRM', () => setDoc(doc(db, 'usuarios', uid), { nome: 'x', email: 'x@x.x', funcaoId: 'admin', status: 'Ativo' }));
await negado('gravar preferências do CRM', () => setDoc(doc(db, 'preferencias', uid), { painel: { ordem: [], fixados: [], ocultos: [] } }));
await negado('afilhado lê as opções das listas do CRM', () => getDoc(doc(db, 'opcoes', 'estoque__categoria')));
await negado('afilhado acrescenta opção às listas do CRM', () => setDoc(doc(db, 'opcoes', 'estoque__categoria'), { valores: ['x'], atualizadoEm: 'x' }));
await negado('refazer o primeiro acesso', () => setDoc(doc(db, 'meta/setup'), { feitoEm: 'x' }));
await negado('alterar o contador de afilhados', () => updateDoc(doc(db, 'meta/contadores'), { clientes: increment(1) }));
await negado('gravar no cardápio', () => setDoc(doc(db, 'cardapio/x'), { nome: 'x', preco: 0 }));
await permitido('ver os itens para reservar (PS5, karaokê)', () => getDocs(collection(db, 'reservaveis')));
await negado('gravar nos itens para reservar', () => setDoc(doc(db, 'reservaveis/x'), { nome: 'PS5', descricao: '', foto: '' }));
await negado('ver atualizações da equipe', () => getDocs(collection(db, 'atividades', 'cfg', 'itens')));
await negado('apagar o próprio cadastro de afilhado', () => deleteDoc(doc(db, 'clientes', uid)));
await negado('apagar o registro do primeiro acesso', () => deleteDoc(doc(db, 'meta/setup')));
await negado('zerar o contador de afilhados', () => setDoc(doc(db, 'meta/contadores'), { clientes: 0 }));
// +18 e CPF: cadastro antigo completa os documentos uma única vez, com CPF próprio e maioridade
const completar = (cpf, nascimento) => { const l = writeBatch(db); l.update(doc(db, 'clientes', uid), { cpf, nascimento }); l.set(doc(db, 'cpfs', cpf), { uid }); return l.commit(); };
await negado('completar o cadastro sendo menor de 18 anos', () => completar('11144477735', '2015-05-10'));
await negado('completar com CPF que já é de outro afilhado', () => completar('52998224725', '1990-01-01'));
await negado('completar só o cadastro, sem registrar o CPF', () => updateDoc(doc(db, 'clientes', uid), { cpf: '11144477735', nascimento: '1990-01-01' }));
await negado('registrar um CPF que não é o do próprio cadastro', () => setDoc(doc(db, 'cpfs', '39053344705'), { uid }));
await permitido('completar o cadastro com CPF e maioridade', () => completar('11144477735', '1990-01-01'));
await negado('trocar o CPF depois de completo', () => completar('39053344705', '1990-01-01'));
await negado('consultar se um CPF está cadastrado', () => getDoc(doc(db, 'cpfs', '52998224725')));
await permitido('acompanhar a própria comanda aberta', () => getDocs(query(collection(db, 'comandas'), where('clienteUid', '==', uid), where('status', '==', 'Aberta'))));
await negado('ver a comanda de outro afilhado', () => getDoc(doc(db, 'comandas', 'de-outro')));
await negado('listar todas as comandas', () => getDocs(collection(db, 'comandas')));
await negado('ver o caixa', () => getDoc(doc(db, 'caixas', 'aberto')));
await permitido('responder o questionário opcional', () => updateDoc(doc(db, 'clientes', uid), { respostas: { p1: 'Instagram' } }));
await signOut(auth);

if (senhaAtendente) {
  console.log('— equipe: função só com Atendimento (ver, criar e editar; sem excluir) —');
  const eq = await signInWithEmailAndPassword(auth, 'atendente@teste.local', senhaAtendente);
  await permitido('listar reservas', () => getDocs(collection(db, 'reservas')));
  await permitido('listar clientes', () => getDocs(collection(db, 'clientes')));
  await permitido('listar produtos (para lançar consumo)', () => getDocs(collection(db, 'produtos')));
  await permitido('listar nomes da equipe', () => getDocs(collection(db, 'ref_colaboradores')));
  await negado('listar colaboradores (salários)', () => getDocs(collection(db, 'colaboradores')));
  await negado('listar despesas', () => getDocs(collection(db, 'despesas')));
  const reserva = await addDoc(collection(db, 'reservas'), { clienteNome: 'Teste', data: '2099-01-01', hora: '20:00', pessoas: 2, status: 'Pendente', origem: 'Telefone' })
    .then((r) => { console.log('ok   criar reserva (tem "criar"): permitido'); return r; })
    .catch((e) => { falhas++; console.log(`FALHA criar reserva (tem "criar"): ${e.code}`); return null; });
  if (reserva) {
    await permitido('alterar reserva (tem "editar")', () => updateDoc(reserva, { status: 'Confirmada' }));
    await negado('excluir reserva (não tem "excluir")', () => deleteDoc(reserva));
  }
  // saldo do afilhado: a equipe credita e estorna, mas nunca deixa o saldo negativo
  const saldo = doc(db, 'saldos', uid);
  await permitido('creditar pontos de um consumo', () => setDoc(saldo, { acumulados: increment(50) }, { merge: true }));
  await permitido('debitar pontos de um voucher', () => setDoc(saldo, { usados: increment(40) }, { merge: true }));
  await negado('estornar pontos já usados (saldo ficaria negativo)', () => setDoc(saldo, { acumulados: increment(-25) }, { merge: true }));
  await negado('reativar voucher sem pontos (saldo ficaria negativo)', () => setDoc(saldo, { usados: increment(25) }, { merge: true }));
  await permitido('estornar pontos que ainda estão no saldo', () => setDoc(saldo, { acumulados: increment(-10) }, { merge: true }));
  await permitido('zerar o saldo de teste', () => setDoc(saldo, { acumulados: 0, usados: 0 }, { merge: true }));
  // caixa e comandas (Atendimento): a venda soma no caixa aberto; caixa fechado não muda
  const somar = (id) => updateDoc(doc(db, 'caixas', id), { 'vendas.Pix': increment(10), totalVendas: increment(10), qtdVendas: increment(1) });
  await permitido('somar venda no caixa aberto', () => somar('aberto'));
  await negado('excluir um caixa (não tem "excluir")', () => deleteDoc(doc(db, 'caixas', 'aberto')));
  // sangrias e suprimentos: corrigir ou apagar só com o caixa aberto
  const movs = (id, m) => updateDoc(doc(db, 'caixas', id), { movimentos: m, atualizadoEm: new Date().toISOString() });
  const sangria = { id: 'm1', tipo: 'Sangria', valor: 20, motivo: 'gelo', em: new Date().toISOString(), por: 'Atendente Teste' };
  await permitido('lançar sangria no caixa aberto', () => movs('aberto', [sangria]));
  await permitido('editar sangria no caixa aberto', () => movs('aberto', [{ ...sangria, valor: 25 }]));
  await permitido('excluir sangria no caixa aberto', () => movs('aberto', []));
  await negado('editar sangria de caixa fechado', () => movs('fechado', [sangria]));
  await negado('reabrir caixa fechado', () => updateDoc(doc(db, 'caixas', 'fechado'), { status: 'Aberto' }));
  await permitido('abrir comanda', () => addDoc(collection(db, 'comandas'), { numero: 9, nome: 'Avulsa', mesa: 1, itens: [], total: 0, status: 'Aberta' }));
  await permitido('ver as comandas do salão', () => getDocs(collection(db, 'comandas')));
  // baixa do Estoque pela ficha técnica: quem vende só mexe nas quantidades
  await permitido('ler um item do Estoque para dar baixa na venda', () => getDoc(doc(db, 'estoque', 'gin')));
  await permitido('dar baixa no Estoque pela venda', () => updateDoc(doc(db, 'estoque', 'gin'), { quantidade: 1.96, locais: { Depósito: 1.96 }, atualizadoEm: new Date().toISOString() }));
  await negado('trocar o custo de um item do Estoque ao vender', () => updateDoc(doc(db, 'estoque', 'gin'), { custo: 1 }));
  await negado('renomear um item do Estoque ao vender', () => updateDoc(doc(db, 'estoque', 'gin'), { quantidade: 2, item: 'Outro' }));
  await negado('cadastrar item no Estoque (só baixa)', () => addDoc(collection(db, 'estoque'), { item: 'x', quantidade: 1 }));
  await negado('apagar item do Estoque (só baixa)', () => deleteDoc(doc(db, 'estoque', 'gin')));
  await negado('lançar produção própria no Estoque ao vender (só baixa)', () => updateDoc(doc(db, 'estoque', 'gin'), { quantidade: 5, producoes: [{ id: 'x' }], cheio: 5 }));
  await permitido('lançar a receita de uma comanda avulsa', () => addDoc(collection(db, 'receitas'), { descricao: 'Comanda #009', valor: 10, comandaId: 'x', caixaId: 'aberto' }));
  // consumo sem afilhado (cliente sem cadastro): entra no caixa e na receita, sem pontos nem saldo
  await permitido('lançar consumo sem afilhado', () => addDoc(collection(db, 'consumos'), { clienteId: null, clienteUid: null, clienteNome: 'Cliente sem cadastro', valor: 10, pontos: 0, caixaId: 'aberto' }));
  await permitido('lançar a receita de um consumo sem afilhado', () => addDoc(collection(db, 'receitas'), { descricao: 'Consumo · Cliente sem cadastro', valor: 10, consumoId: 'x', caixaId: 'aberto' }));
  // corrigir uma venda: a venda e a receita dela mudam juntas, só com o caixa da venda aberto
  const corrigir = (id, valorReceita = 15) => {
    const l = writeBatch(db);
    l.update(doc(db, 'consumos', `venda-${id}`), { valor: 15, formaPagamento: 'Dinheiro' });
    l.update(doc(db, 'receitas', `receita-${id}`), { valor: valorReceita, formaPagamento: 'Dinheiro' });
    return l.commit();
  };
  await permitido('corrigir venda do caixa aberto (e a receita dela)', () => corrigir('aberta'));
  await negado('corrigir venda de caixa fechado', () => corrigir('fechada'));
  await negado('corrigir só a venda de caixa fechado', () => updateDoc(doc(db, 'consumos', 'venda-fechada'), { valor: 1 }));
  await negado('receita com valor diferente da venda', () => corrigir('aberta', 99));
  await negado('mudar a descrição da receita de uma venda', () => updateDoc(doc(db, 'receitas', 'receita-aberta'), { descricao: 'outra' }));
  await permitido('cadastrar mesa', () => addDoc(collection(db, 'mesas'), { numero: 1, nome: 'Mesa 1', lugares: 4 }));
  await negado('alterar produto', () => addDoc(collection(db, 'produtos'), { nome: 'x', preco: 1 }));
  await negado('lançar receita avulsa', () => addDoc(collection(db, 'receitas'), { descricao: 'x', valor: 1 }));
  await permitido('editar o próprio perfil', () => updateDoc(doc(db, 'usuarios', eq.user.uid), { telefone: '(11) 91234-5678', sobre: 'Atendente do salão' }));
  await permitido('trocar a própria foto', () => updateDoc(doc(db, 'usuarios', eq.user.uid), { foto: 'data:image/jpeg;base64,AAAA' }));
  await negado('trocar o próprio e-mail pelo perfil', () => updateDoc(doc(db, 'usuarios', eq.user.uid), { email: 'outro@x.x' }));
  await negado('promover a si mesmo a administrador', () => updateDoc(doc(db, 'usuarios', eq.user.uid), { funcaoId: 'admin' }));
  await negado('dar todas as permissões à própria função', async () => {
    const eu = (await getDoc(doc(db, 'usuarios', eq.user.uid))).data();
    await updateDoc(doc(db, 'funcoes', eu.funcaoId), { 'permissoes.cfg': 'edit' });
  });
  await negado('criar outro usuário', () => setDoc(doc(db, 'usuarios/novo'), { nome: 'x', email: 'x@x.x', funcaoId: 'admin', status: 'Ativo' }));
  await negado('alterar configuração', () => setDoc(doc(db, 'config/geral'), { pontosPorReal: 999 }, { merge: true }));
  const eu = (await getDoc(doc(db, 'usuarios', eq.user.uid))).data();
  const atividade = (area, extra = {}) => ({
    area, acao: 'teste', colecao: '', alvo: '', detalhe: '', usuarioId: eq.user.uid, usuarioNome: eu.nome, criadoEm: new Date().toISOString(), ...extra,
  });
  await permitido('ver atualizações do Atendimento', () => getDocs(collection(db, 'atividades', 'atd', 'itens')));
  await negado('ver atualizações do Financeiro', () => getDocs(collection(db, 'atividades', 'fin', 'itens')));
  await permitido('registrar atualização no Atendimento', () => addDoc(collection(db, 'atividades', 'atd', 'itens'), atividade('atd')));
  await negado('registrar atualização em nome de outro', () => addDoc(collection(db, 'atividades', 'atd', 'itens'), atividade('atd', { usuarioNome: 'Outra pessoa' })));
  await negado('registrar atualização no Financeiro', () => addDoc(collection(db, 'atividades', 'fin', 'itens'), atividade('fin')));
  const painel = { ordem: [], fixados: ['k-receita'], ocultos: [], tamanhos: { 'k-receita': 'm' }, layout: { 'k-receita': { x: 0, y: 0, w: 3, h: 4 } } };
  await permitido('salvar as próprias preferências', () => setDoc(doc(db, 'preferencias', eq.user.uid), { painel, atualizadoEm: 'x' }));
  await permitido('ler as próprias preferências', () => getDoc(doc(db, 'preferencias', eq.user.uid)));
  await negado('salvar preferências de outro usuário', () => setDoc(doc(db, 'preferencias', 'outro'), { painel, atualizadoEm: 'x' }));
  await negado('ler preferências de outro usuário', () => getDoc(doc(db, 'preferencias', 'outro')));
  // opções acrescentadas pelo "Outro" das listas
  await permitido('acrescentar opção a uma lista', () => setDoc(doc(db, 'opcoes', 'estoque__categoria'), { valores: arrayUnion('Hortifrúti'), atualizadoEm: 'x' }, { merge: true }));
  await permitido('ler as opções acrescentadas', () => getDoc(doc(db, 'opcoes', 'estoque__categoria')));
  await negado('gravar outro campo nas opções', () => setDoc(doc(db, 'opcoes', 'estoque__categoria'), { valores: ['x'], atualizadoEm: 'x', extra: 1 }));
  await negado('gravar lista de opções com nome inválido', () => setDoc(doc(db, 'opcoes', 'Estoque.Categoria'), { valores: ['x'], atualizadoEm: 'x' }));
  await negado('gravar mais de 100 opções', () => setDoc(doc(db, 'opcoes', 'estoque__tipo'), { valores: Array.from({ length: 101 }, (_, i) => `o${i}`), atualizadoEm: 'x' }));
  await negado('apagar a lista de opções sem ser o Administrador', () => deleteDoc(doc(db, 'opcoes', 'estoque__categoria')));
  // zerar o sistema e mexer na numeração são só do Administrador
  await negado('excluir afilhado (sem permissão em Vendas)', async () => {
    const c = (await getDocs(collection(db, 'clientes'))).docs[0];
    await deleteDoc(c.ref);
  });
  await negado('ajustar a numeração dos afilhados', () => setDoc(doc(db, 'meta/contadores'), { clientes: 0 }));
  await negado('apagar o histórico de atualizações', async () => {
    const it = (await getDocs(collection(db, 'atividades', 'atd', 'itens'))).docs[0];
    await deleteDoc(it.ref);
  });
  await negado('apagar o registro do primeiro acesso', () => deleteDoc(doc(db, 'meta/setup')));
  await negado('excluir a si mesmo', () => deleteDoc(doc(db, 'usuarios', eq.user.uid)));
  await negado('excluir a função Administrador', () => deleteDoc(doc(db, 'funcoes', 'admin')));
  await signOut(auth);
}

if (senhaMarketing) {
  console.log('— equipe: função antiga só com Marketing ("view") — Vendas herda de Marketing —');
  await signInWithEmailAndPassword(auth, 'marketing@teste.local', senhaMarketing);
  await permitido('ver produtos (Vendas herda o "ver" de Marketing)', () => getDocs(collection(db, 'produtos')));
  await permitido('ver recompensas (Marketing)', () => getDocs(collection(db, 'recompensas')));
  await negado('ver o caixa (sem Atendimento)', () => getDoc(doc(db, 'caixas', 'aberto')));
  await negado('somar venda no caixa (sem Atendimento)', () => updateDoc(doc(db, 'caixas', 'aberto'), { totalVendas: increment(1) }));
  await negado('dar baixa no Estoque (sem vender)', () => updateDoc(doc(db, 'estoque', 'gin'), { quantidade: 0 }));
  await negado('ver comandas (sem Atendimento)', () => getDocs(collection(db, 'comandas')));
  await negado('cadastrar produto (só "ver")', () => addDoc(collection(db, 'produtos'), { nome: 'x', preco: 1 }));
  await permitido('ver o Estoque (insumos da ficha técnica)', () => getDocs(collection(db, 'estoque')));
  await negado('alterar o Estoque (só leitura para Vendas)', () => addDoc(collection(db, 'estoque'), { item: 'x', quantidade: 1 }));
  await permitido('ver a Tabela de preços dos fornecedores (ficha técnica)', () => getDocs(collection(db, 'precos')));
  await permitido('ver guarnições e itens fixos (Vendas)', () => getDocs(collection(db, 'guarnicoes')));
  await permitido('ver Materiais (copos e utensílios do preparo)', () => getDocs(collection(db, 'materiais')));
  await negado('alterar Materiais (só leitura para Vendas)', () => addDoc(collection(db, 'materiais'), { material: 'x', tipo: 'Utensílio' }));
  await negado('cadastrar item fixo (só "ver")', () => addDoc(collection(db, 'guarnicoes'), { nome: 'Gelo', custo: 0.3 }));
  await negado('cadastrar preço de fornecedor (só Administrativo)', () => addDoc(collection(db, 'precos'), { insumo: 'x', preco: 1 }));
  await negado('listar despesas', () => getDocs(collection(db, 'despesas')));
  await signOut(auth);
}

if (senhaModular) {
  console.log('— equipe: função por tela (formato novo) —');
  await signInWithEmailAndPassword(auth, 'modular@teste.local', senhaModular);
  await permitido('ver reservas (módulo com "ver")', () => getDocs(collection(db, 'reservas')));
  await negado('ver consumos (módulo sem permissões, mesmo com Atendimento total)', () => getDocs(collection(db, 'consumos')));
  await negado('excluir reserva (o módulo não tem "excluir")', () => deleteDoc(doc(db, 'reservas', 'qualquer')));
  await permitido('ver o calendário (módulo não marcado: vale a área Atendimento)', () => getDocs(collection(db, 'eventos')));
  // páginas novas (Caixa, Comandas, Mapa de mesas) herdam da página mais próxima, não da área
  await permitido('ver o mapa de mesas (página nova: vale a de Reservas)', () => getDocs(collection(db, 'mesas')));
  await permitido('cadastrar mesa (Reservas tem "criar")', () => addDoc(collection(db, 'mesas'), { numero: 1 }));
  await negado('excluir mesa (Reservas não tem "excluir", mesmo com Atendimento total)', () => deleteDoc(doc(db, 'mesas', 'qualquer')));
  await negado('ver comandas (página nova: vale a de Lançar consumo, sem permissões)', () => getDocs(collection(db, 'comandas')));
  await permitido('Entrada de notas lê o Estoque', () => getDocs(collection(db, 'estoque')));
  await permitido('Entrada de notas soma a quantidade no Estoque', () => updateDoc(doc(db, 'estoque', 'gin'), { quantidade: 3 }));
  await permitido('Resultado (DRE) lê as receitas', () => getDocs(collection(db, 'receitas')));
  await negado('Resultado (DRE) não lança receita', () => addDoc(collection(db, 'receitas'), { descricao: 'x', valor: 1, data: '2026-10-01' }));
  await negado('ver colaboradores', () => getDocs(collection(db, 'colaboradores')));
  await permitido('ver o Patrimônio (módulo com "ver")', () => getDocs(collection(db, 'patrimonio')));
  await negado('cadastrar bem no Patrimônio (o módulo não tem "criar")', () => addDoc(collection(db, 'patrimonio'), { nome: 'x', categoria: 'Mobiliário' }));
  await permitido('Patrimônio com "editar" publica o bem da categoria Reserva no app', () => setDoc(doc(db, 'reservaveis/ps5'), { nome: 'PS5', descricao: '', foto: '' }));
  await negado('Reservas não publica item para reservar (é do Patrimônio)', async () => {
    await signOut(auth);
    await signInWithEmailAndPassword(auth, 'atendente@teste.local', senhaAtendente);
    try { return await setDoc(doc(db, 'reservaveis/karaoke'), { nome: 'Karaokê', descricao: '', foto: '' }); }
    finally { await signOut(auth); await signInWithEmailAndPassword(auth, 'modular@teste.local', senhaModular); }
  });
  await permitido('ver os Arquivos da empresa (módulo com "ver")', () => getDocs(collection(db, 'arquivos')));
  await permitido('cadastrar documento nos Arquivos', () => addDoc(collection(db, 'arquivos'), { titulo: 'Contrato social', tipo: 'Contrato social', data: '2026-01-10', status: 'Vigente' }));
  await negado('excluir documento dos Arquivos (o módulo não tem "excluir")', () => deleteDoc(doc(db, 'arquivos', 'qualquer')));
  await negado('ver os contratos onerosos (Financeiro não marcado)', () => getDocs(collection(db, 'docfin')));
  await permitido('Ticket médio (tela não marcada: vale a do Resultado) lê as receitas', () => getDocs(collection(db, 'receitas')));
  await permitido('Despesas fixas (só a tela) lê as despesas', () => getDocs(collection(db, 'despesas')));
  await negado('Despesas fixas (só ver) não lança despesa', () => addDoc(collection(db, 'despesas'), { descricao: 'x', categoria: 'Aluguel', valor: 1, data: '2026-10-01', status: 'A pagar' }));
  await signOut(auth);
}

if (senhaCaixa) {
  console.log('— equipe: Atendimento completo (estorna vendas), sem excluir afilhados —');
  await signInWithEmailAndPassword(auth, 'caixa@teste.local', senhaCaixa);
  const estornar = (id) => {
    const l = writeBatch(db);
    l.delete(doc(db, 'consumos', `venda-${id}`));
    l.delete(doc(db, 'receitas', `receita-${id}`));
    return l.commit();
  };
  await negado('estornar venda de caixa fechado', () => estornar('fechada'));
  await negado('apagar só a receita de venda de caixa fechado', () => deleteDoc(doc(db, 'receitas', 'receita-fechada')));
  await permitido('estornar venda do caixa aberto', () => estornar('aberta'));
  await signOut(auth);
}

if (senhaAdministrativo) {
  console.log('— equipe: função só com Administrativo (ver, criar e editar) — lança despesas dos próprios cadastros —');
  await signInWithEmailAndPassword(auth, 'administrativo@teste.local', senhaAdministrativo);
  const uidAdm = auth.currentUser.uid;
  const despesa = (extra = {}) => ({
    descricao: 'Segurança · Vigia Ltda', categoria: 'Terceirizados', data: '2026-10-01', vencimento: '', valor: 1500, status: 'A pagar', observacoes: '',
    origem: 'Lançamento de Serviços terceirizados', origemColecao: 'terceirizados', origemId: 'seguranca', criadoPor: uidAdm, criadoEm: 'x', atualizadoEm: 'x', ...extra,
  });
  // como o CRM faz: a despesa e a anotação no cadastro de origem vão no mesmo lote
  const lancar = async (extra = {}) => {
    const d = despesa(extra);
    const ref = doc(collection(db, 'despesas'));
    const lote = writeBatch(db);
    lote.set(ref, d);
    lote.update(doc(db, d.origemColecao, d.origemId), { [`lancamentos.${String(d.data).slice(0, 7)}`]: { despesaId: ref.id, valor: d.valor, em: 'x', vezes: 1 } });
    await lote.commit();
    return ref;
  };
  let lancada = null;
  await permitido('lançar a despesa de um serviço terceirizado', async () => { lancada = await lancar(); });
  await permitido('lançar outra competência do mesmo serviço', () => lancar({ data: '2026-11-01' }));
  await negado('listar despesas (Financeiro)', () => getDocs(collection(db, 'despesas')));
  await negado('ler a despesa que acabou de lançar', () => getDoc(lancada));
  await negado('alterar a despesa que acabou de lançar', () => updateDoc(lancada, { valor: 1, status: 'Pago' }));
  await negado('apagar a despesa que acabou de lançar', () => deleteDoc(lancada));
  await negado('lançar despesa sem anotar no cadastro de origem', () => addDoc(collection(db, 'despesas'), despesa()));
  await negado('lançar despesa avulsa, sem origem', () => addDoc(collection(db, 'despesas'), { descricao: 'Avulsa', categoria: 'Outras despesas', data: '2026-10-01', valor: 10, status: 'A pagar' }));
  await negado('lançar despesa em nome de outra pessoa', () => lancar({ criadoPor: 'outro' }));
  await negado('lançar despesa de um serviço que não existe', () => addDoc(collection(db, 'despesas'), despesa({ origemId: 'inexistente' })));
  await negado('lançar despesa com origem apontando para um subcaminho', () => addDoc(collection(db, 'despesas'), despesa({ origemId: 'seguranca/x/y' })));
  await negado('lançar despesa a partir de outra área (Marketing)', () => addDoc(collection(db, 'despesas'), despesa({ origemColecao: 'midias', origemId: 'post' })));
  await negado('lançar despesa a partir de um cadastro que não gera despesa', () => addDoc(collection(db, 'despesas'), despesa({ origemColecao: 'fornecedores', origemId: 'x' })));
  await negado('lançar despesa já marcada como paga', () => lancar({ status: 'Pago' }));
  await negado('lançar despesa com valor zerado', () => lancar({ valor: 0 }));
  await negado('lançar despesa com valor em texto', () => lancar({ valor: '10' }));
  await negado('lançar despesa com valor acima do limite', () => lancar({ valor: 5000000 }));
  await negado('lançar despesa com data impossível', () => lancar({ data: '2026-13-45' }));
  await negado('lançar despesa com vencimento fora do formato', () => lancar({ vencimento: 'amanhã' }));
  await negado('lançar despesa com descrição gigante', () => lancar({ descricao: 'x'.repeat(201) }));
  await negado('lançar despesa com campo extra (ex.: folha)', () => lancar({ competenciaFolha: '2026-10' }));
  await negado('lançar receita', () => addDoc(collection(db, 'receitas'), { descricao: 'x', valor: 1, data: '2026-10-01' }));

  // Tabela de preços: o Administrativo cadastra; escolhe o insumo no Estoque (só leitura)
  await permitido('cadastrar preço de fornecedor', () => addDoc(collection(db, 'precos'), { insumo: 'Aperol', insumoId: 'x', fornecedor: 'Distribuidora', conteudo: 750, unidade: 'ml', preco: 52, status: 'Ativo' }));
  await permitido('ver o Estoque para escolher o insumo', () => getDocs(collection(db, 'estoque')));
  await negado('alterar o Estoque (Administrativo)', () => addDoc(collection(db, 'estoque'), { item: 'x', quantidade: 1 }));

  // PDFs anexados: como o CRM faz, o registro do arquivo e as partes vão no mesmo lote
  const pdf = 'JVBERi0xLjQK';
  const anexar = async (meta = {}, partes = [pdf]) => {
    const ref = doc(collection(db, 'anexos'));
    const lote = writeBatch(db);
    lote.set(ref, { colecao: 'contratos', registroId: 'contrato-1', nome: 'contrato.pdf', tamanho: 9, partes: partes.length, criadoPor: uidAdm, criadoEm: 'x', ...meta });
    partes.forEach((dados, i) => lote.set(doc(db, 'anexos', ref.id, 'partes', String(i)), { dados }));
    await lote.commit();
    return ref;
  };
  let anexo = null;
  await permitido('anexar PDF a um contrato (Administrativo)', async () => { anexo = await anexar(); });
  await permitido('anexar PDF em duas partes', () => anexar({}, [pdf, pdf]));
  await permitido('abrir o PDF anexado', async () => { await getDoc(anexo); await getDoc(doc(db, 'anexos', anexo.id, 'partes', '0')); });
  await negado('anexar PDF a um cadastro de outra área (RH)', () => anexar({ colecao: 'colaboradores' }));
  await negado('anexar PDF a um cadastro que não aceita anexos', () => anexar({ colecao: 'reservas' }));
  await negado('anexar PDF numa publicação da Gestão de mídias (outra área: Marketing)', () => anexar({ colecao: 'midias' }));
  await negado('anexar PDF em nome de outra pessoa', () => anexar({ criadoPor: 'outro' }));
  await negado('anexar PDF acima de 5 MB', () => anexar({ tamanho: 6 * 1024 * 1024 }));
  await negado('anexar PDF com campo extra', () => anexar({ publico: true }));
  await negado('anexar mais partes do que o declarado', async () => {
    const ref = await anexar();
    await setDoc(doc(db, 'anexos', ref.id, 'partes', '1'), { dados: pdf });
  });
  await negado('trocar o conteúdo de um PDF já anexado', () => setDoc(doc(db, 'anexos', anexo.id, 'partes', '0'), { dados: 'JVBERi0xLjUK' }));
  await negado('alterar o registro de um PDF já anexado', () => updateDoc(anexo, { colecao: 'colaboradores' }));
  await permitido('apagar o PDF anexado (partes e registro)', async () => {
    const lote = writeBatch(db);
    lote.delete(doc(db, 'anexos', anexo.id, 'partes', '0'));
    lote.delete(anexo);
    await lote.commit();
  });
  await signOut(auth);

  console.log('— equipe: função só com Atendimento — PDFs de outras áreas —');
  await signInWithEmailAndPassword(auth, 'atendente@teste.local', senhaAtendente);
  await negado('listar os PDFs anexados', () => getDocs(collection(db, 'anexos')));
  await permitido('ver o Estoque (sem Vendas nem Estrutura, mas vende: baixa pela ficha técnica)', () => getDocs(collection(db, 'estoque')));
  await negado('ver a Tabela de preços (sem Vendas nem Administrativo)', () => getDocs(collection(db, 'precos')));
  await negado('ver guarnições e itens fixos (sem Vendas)', () => getDocs(collection(db, 'guarnicoes')));
  await negado('ver Materiais (sem Vendas nem Estrutura)', () => getDocs(collection(db, 'materiais')));
  await negado('ver as notas de compra (Estrutura)', () => getDocs(collection(db, 'compras')));
  await negado('ver o Patrimônio (Estrutura)', () => getDocs(collection(db, 'patrimonio')));
  await negado('ver os Arquivos da empresa (Financeiro)', () => getDocs(collection(db, 'arquivos')));
  await permitido('ler a chave da IA (equipe logada)', () => getDoc(doc(db, 'segredos', 'ia')));
  await negado('trocar a chave da IA (sem Configurações)', () => setDoc(doc(db, 'segredos', 'ia'), { chave: 'x' }));
  await permitido('ler o endereço do e-mail dos chamados (equipe logada)', () => getDoc(doc(db, 'segredos', 'email')));
  await negado('trocar o endereço do e-mail dos chamados (sem Configurações)', () => setDoc(doc(db, 'segredos', 'email'), { url: 'https://exemplo.com' }));
  await negado('anexar PDF a um contrato (Administrativo)', async () => {
    const ref = doc(collection(db, 'anexos'));
    const lote = writeBatch(db);
    lote.set(ref, { colecao: 'contratos', registroId: 'contrato-1', nome: 'contrato.pdf', tamanho: 9, partes: 1, criadoPor: auth.currentUser.uid, criadoEm: 'x' });
    lote.set(doc(db, 'anexos', ref.id, 'partes', '0'), { dados: pdf });
    await lote.commit();
  });
  await signOut(auth);
}

if (senhaCaixa) {
  console.log('— usuários do CRM também são afilhados (mesmo login, sem CPF até abrir o app) —');
  // como o backend faz: número da equipe (negativo, contador à parte), cadastro e saldo zerado no mesmo lote
  const afilhadoSemCpf = async (numeroExtra = 1, campo = 'equipe') => {
    const u = auth.currentUser;
    const proximo = (Number((await getDoc(doc(db, 'meta/contadores'))).data()?.[campo]) || 0) + numeroExtra;
    const numero = campo === 'equipe' ? -proximo : proximo;
    const lote = writeBatch(db);
    lote.set(doc(db, 'meta/contadores'), { [campo]: proximo }, { merge: true });
    lote.set(doc(db, 'clientes', u.uid), { numero, nome: 'Sem CPF', email: u.email, telefone: '', foto: null, criadoEm: 'x', origem: 'Equipe', aceiteEm: null });
    lote.set(doc(db, 'saldos', u.uid), { acumulados: 0, usados: 0, ultimoResgate: '' });
    await lote.commit();
  };
  await createUserWithEmailAndPassword(auth, `sem-equipe-${Date.now()}@teste.local`, 'senha-teste-123');
  await negado('quem não é da equipe criar afilhado sem CPF', () => afilhadoSemCpf());
  await signOut(auth);
  await signInWithEmailAndPassword(auth, 'caixa@teste.local', senhaCaixa);
  await negado('usuário do CRM criar afilhado pulando o número', () => afilhadoSemCpf(2));
  await negado('usuário do CRM criar afilhado com número da contagem dos afilhados', () => afilhadoSemCpf(1, 'clientes'));
  await permitido('usuário do CRM criar o próprio afilhado sem CPF', () => afilhadoSemCpf());
  await permitido('usuário do CRM completar CPF e nascimento no app', async () => {
    const uidCaixa = auth.currentUser.uid;
    const lote = writeBatch(db);
    lote.update(doc(db, 'clientes', uidCaixa), { cpf: '39053344705', nascimento: '1990-01-01' });
    lote.set(doc(db, 'cpfs', '39053344705'), { uid: uidCaixa });
    await lote.commit();
  });
  await negado('usuário do CRM trocar o próprio número de afilhado', () => updateDoc(doc(db, 'clientes', auth.currentUser.uid), { numero: -50 }));
  await signOut(auth);

  if (senhaParametros) {
    console.log('— numeração própria da equipe (Parâmetros > Numeração) —');
    await signInWithEmailAndPassword(auth, 'parametros@teste.local', senhaParametros);
    await permitido('passar afilhado antigo da equipe para número negativo', () => updateDoc(doc(db, 'clientes', 'equipe-antiga'), { numero: -2 }));
    await negado('dar número positivo a afilhado da equipe', () => updateDoc(doc(db, 'clientes', 'equipe-antiga'), { numero: 5 }));
    const comum = (await getDocs(collection(db, 'clientes'))).docs.find((d) => d.data().origem !== 'Equipe');
    await negado('mudar o número de afilhado que não é da equipe', () => updateDoc(comum.ref, { numero: -9 }));
    await negado('mudar outro campo junto com o número', () => updateDoc(doc(db, 'clientes', 'equipe-antiga'), { numero: -3, nome: 'X' }));
    await permitido('ajustar os dois contadores', () => setDoc(doc(db, 'meta/contadores'), { clientes: 2, equipe: 2 }));
    await negado('contador da equipe negativo', () => setDoc(doc(db, 'meta/contadores'), { clientes: 2, equipe: -1 }));
    await signOut(auth);
  }

  console.log('— números reservados (link do Cérebro) —');
  // a reserva é criada pela Presidência; aqui, direto no semear: reservados/codigo-teste → #900, livre
  const cadastroReservado = async (codigoReserva, numero) => {
    const u = auth.currentUser;
    const lote = writeBatch(db);
    lote.set(doc(db, 'clientes', u.uid), { numero, nome: 'Reservado', email: u.email, telefone: '', criadoEm: 'x', cpf: '86288366757', nascimento: '1990-01-01', reserva: codigoReserva });
    lote.set(doc(db, 'cpfs', '86288366757'), { uid: u.uid });
    lote.set(doc(db, 'saldos', u.uid), { acumulados: 0, usados: 0, ultimoResgate: '' });
    lote.update(doc(db, 'reservados', codigoReserva), { uid: u.uid });
    await lote.commit();
  };
  await permitido('ler a reserva pelo link, sem login', () => getDoc(doc(db, 'reservados', 'codigo-teste')));
  await negado('listar as reservas sem login', () => getDocs(collection(db, 'reservados')));
  await createUserWithEmailAndPassword(auth, `reservado-${Date.now()}@teste.local`, 'senha-teste-123');
  await negado('pegar outro número com o link da reserva', () => cadastroReservado('codigo-teste', 901));
  await negado('pegar o número reservado sem o link', async () => {
    const u = auth.currentUser;
    const lote = writeBatch(db);
    lote.set(doc(db, 'clientes', u.uid), { numero: 900, nome: 'X', email: u.email, telefone: '', criadoEm: 'x', cpf: '86288366757', nascimento: '1990-01-01' });
    lote.set(doc(db, 'cpfs', '86288366757'), { uid: u.uid });
    lote.set(doc(db, 'saldos', u.uid), { acumulados: 0, usados: 0, ultimoResgate: '' });
    await lote.commit();
  });
  await permitido('cadastrar com o número reservado pelo link', () => cadastroReservado('codigo-teste', 900));
  await signOut(auth);
  await createUserWithEmailAndPassword(auth, `reservado2-${Date.now()}@teste.local`, 'senha-teste-123');
  await negado('usar de novo um link de reserva já usado', () => cadastroReservado('codigo-teste', 900));
  await negado('criar reserva sem ser da equipe', () => setDoc(doc(db, 'reservados', 'meu'), { numero: 1, nome: 'eu', uid: null }));
  await signOut(auth);
}

console.log('— conversas (chat entre a equipe e o afilhado) —');
{
  // a mensagem e o resumo da conversa vão juntos, como faz o app
  const enviar = async (dono, autor, texto, extra = {}) => {
    const u = auth.currentUser;
    const ref = doc(collection(db, 'conversas', dono, 'mensagens'));
    const lote = writeBatch(db);
    lote.set(ref, { texto, autor, usuarioId: u.uid, usuarioNome: extra.usuarioNome ?? 'Cliente Teste', criadaEm: serverTimestamp() });
    lote.set(doc(db, 'conversas', dono), {
      clienteNome: 'Cliente Teste', clienteNumero: extra.numero ?? 2, ultimaMensagem: texto, ultimaEm: serverTimestamp(), ultimoAutor: autor, ultimaId: ref.id,
      [autor === 'equipe' ? 'naoLidasAfilhado' : 'naoLidasEquipe']: increment(extra.soma ?? 1), [autor === 'equipe' ? 'naoLidasEquipe' : 'naoLidasAfilhado']: 0,
    }, { merge: true });
    await lote.commit();
  };
  const { user: cli } = await signInWithEmailAndPassword(auth, 'cliente2@teste.local', senhaCliente);
  await permitido('afilhado enviar mensagem na própria conversa', () => enviar(cli.uid, 'afilhado', 'Oi, tem mesa hoje?'));
  await permitido('afilhado mandar outra mensagem', () => enviar(cli.uid, 'afilhado', 'Para 4 pessoas'));
  await permitido('afilhado ler as próprias mensagens', () => getDocs(query(collection(db, 'conversas', cli.uid, 'mensagens'), orderBy('criadaEm', 'desc'))));
  await negado('afilhado mandar mensagem como equipe', () => enviar(cli.uid, 'equipe', 'Sou o bar'));
  await negado('afilhado trocar o número no resumo', () => enviar(cli.uid, 'afilhado', 'Oi', { numero: 1 }));
  await negado('afilhado somar mais de uma não lida', () => enviar(cli.uid, 'afilhado', 'Oi', { soma: 5 }));
  await negado('afilhado zerar as não lidas da equipe', () => updateDoc(doc(db, 'conversas', cli.uid), { naoLidasEquipe: 0 }));
  await negado('afilhado gravar mensagem sem o resumo', () => setDoc(doc(collection(db, 'conversas', cli.uid, 'mensagens')), { texto: 'x', autor: 'afilhado', usuarioId: cli.uid, usuarioNome: 'x', criadaEm: serverTimestamp() }));
  await negado('afilhado ler a conversa de outro afilhado', () => getDoc(doc(db, 'conversas', 'outro-afilhado')));
  await negado('afilhado ler as mensagens de outro afilhado', () => getDocs(collection(db, 'conversas', 'outro-afilhado', 'mensagens')));
  await negado('afilhado escrever na conversa de outro afilhado', () => enviar('equipe-antiga', 'afilhado', 'Oi', { numero: 3 }));
  await negado('afilhado listar todas as conversas', () => getDocs(collection(db, 'conversas')));
  await negado('afilhado apagar a própria conversa', () => deleteDoc(doc(db, 'conversas', cli.uid)));
  await signOut(auth);

  if (senhaAtendente) {
    await signInWithEmailAndPassword(auth, 'atendente@teste.local', senhaAtendente);
    await permitido('atendente listar as conversas', () => getDocs(query(collection(db, 'conversas'), orderBy('ultimaEm', 'desc'))));
    await permitido('atendente ver as não lidas', () => getDocs(query(collection(db, 'conversas'), where('naoLidasEquipe', '>', 0))));
    await permitido('atendente ler as mensagens do afilhado', () => getDocs(collection(db, 'conversas', cli.uid, 'mensagens')));
    await permitido('atendente marcar a conversa como lida', () => updateDoc(doc(db, 'conversas', cli.uid), { naoLidasEquipe: 0 }));
    await negado('atendente responder com o nome de outra pessoa', () => enviar(cli.uid, 'equipe', 'Temos sim', { usuarioNome: 'Presidente' }));
    await permitido('atendente responder ao afilhado', () => enviar(cli.uid, 'equipe', 'Temos sim!', { usuarioNome: 'Atendente Teste' }));
    await negado('atendente zerar as não lidas do afilhado', () => updateDoc(doc(db, 'conversas', cli.uid), { naoLidasAfilhado: 0 }));
    await negado('atendente mandar mensagem como afilhado', () => enviar(cli.uid, 'afilhado', 'Quero desconto'));
    await negado('atendente (sem excluir) apagar a conversa', () => deleteDoc(doc(db, 'conversas', cli.uid)));
    await signOut(auth);
    await signInWithEmailAndPassword(auth, 'cliente2@teste.local', senhaCliente);
    await permitido('afilhado marcar a resposta como lida', () => updateDoc(doc(db, 'conversas', cli.uid), { naoLidasAfilhado: 0 }));
    await signOut(auth);
  }
  if (senhaMarketing) {
    await signInWithEmailAndPassword(auth, 'marketing@teste.local', senhaMarketing);
    await negado('Marketing (sem Atendimento) listar as conversas', () => getDocs(collection(db, 'conversas')));
    await negado('Marketing ler as mensagens de um afilhado', () => getDocs(collection(db, 'conversas', cli.uid, 'mensagens')));
    await signOut(auth);
  }
}

if (senhaFicha) {
  console.log('— ficha do afilhado no Cérebro (Clientes: editar) —');
  const ed = doc(db, 'clientes', 'editavel');
  // como o backend faz: o cadastro e o registro do CPF (o novo entra, o antigo sai) no mesmo lote
  const trocarCpf = (novo, antigo, nascimento = '1990-01-01', { registrar = true, apagar = true } = {}) => {
    const l = writeBatch(db);
    l.update(ed, { cpf: novo, nascimento });
    if (registrar) l.set(doc(db, 'cpfs', novo), { uid: 'editavel' });
    if (apagar) l.delete(doc(db, 'cpfs', antigo));
    return l.commit();
  };
  await signInWithEmailAndPassword(auth, 'parametros@teste.local', senhaParametros);
  await negado('corrigir o nome só com Clientes: ver', () => updateDoc(ed, { nome: 'Outro Nome' }));
  await signOut(auth);
  await signInWithEmailAndPassword(auth, 'ficha@teste.local', senhaFicha);
  await permitido('corrigir nome e celular', () => updateDoc(ed, { nome: 'Editável Corrigido', telefone: '(51) 99999-0000' }));
  await permitido('preencher as respostas do questionário', () => updateDoc(ed, { respostas: { p1: 'Instagram', respondidoEm: 'x' } }));
  await negado('nome com menos de 3 letras', () => updateDoc(ed, { nome: 'X' }));
  await negado('trocar o e-mail (login) pela ficha', () => updateDoc(ed, { email: 'outro@teste.local' }));
  await negado('trocar o número pela ficha', () => updateDoc(ed, { numero: 1 }));
  await negado('mexer na foto ou na origem pela ficha', () => updateDoc(ed, { origem: 'Equipe' }));
  await negado('trocar o CPF sem registrar o novo', () => trocarCpf('12345678909', '15350946056', '1990-01-01', { registrar: false }));
  await negado('trocar para um CPF que já é de outro afilhado', () => trocarCpf('52998224725', '15350946056'));
  await negado('nascimento de menor de 18 anos', () => trocarCpf('15350946056', '15350946056', '2015-01-01', { registrar: false, apagar: false }));
  await negado('registrar CPF para afilhado que não o usa', () => setDoc(doc(db, 'cpfs', '98765432100'), { uid: 'editavel' }));
  await negado('apagar o registro do CPF que o afilhado ainda usa', () => deleteDoc(doc(db, 'cpfs', '15350946056')));
  await permitido('corrigir a data de nascimento', () => trocarCpf('15350946056', '15350946056', '1985-06-15', { registrar: false, apagar: false }));
  await permitido('trocar o CPF (o novo entra, o antigo sai)', () => trocarCpf('12345678909', '15350946056'));
  await permitido('ler o histórico (consumos) do afilhado', () => getDocs(query(collection(db, 'consumos'), where('clienteUid', '==', 'editavel'))));
  await signOut(auth);
}

console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nTodas as verificações passaram.');
process.exit(falhas ? 1 : 0);

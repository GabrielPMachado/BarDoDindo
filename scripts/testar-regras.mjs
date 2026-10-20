// Confere, contra os emuladores locais, que as regras do Firestore barram o que não pode passar.
// Uso: com `npm run emuladores` rodando e os dados de teste criados (`node scripts/semear-testes.mjs`),
// `node scripts/testar-regras.mjs <senhaCliente> <senhaAtendente>` — ou tudo de uma vez: `npm run testar:regras`.
// (cliente2@teste.local e atendente@teste.local são contas que só existem no emulador).
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  addDoc, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, increment, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';

const [senhaCliente, senhaAtendente, senhaMarketing, senhaAdministrativo, senhaModular] = process.argv.slice(2);
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
await negado('refazer o primeiro acesso', () => setDoc(doc(db, 'meta/setup'), { feitoEm: 'x' }));
await negado('alterar o contador de afilhados', () => updateDoc(doc(db, 'meta/contadores'), { clientes: increment(1) }));
await negado('gravar no cardápio', () => setDoc(doc(db, 'cardapio/x'), { nome: 'x', preco: 0 }));
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
  await permitido('abrir comanda', () => addDoc(collection(db, 'comandas'), { numero: 9, nome: 'Avulsa', mesa: 1, itens: [], total: 0, status: 'Aberta' }));
  await permitido('ver as comandas do salão', () => getDocs(collection(db, 'comandas')));
  await permitido('lançar a receita de uma comanda avulsa', () => addDoc(collection(db, 'receitas'), { descricao: 'Comanda #009', valor: 10, comandaId: 'x', caixaId: 'aberto' }));
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
  await permitido('Entrada de notas lê o Estoque', () => getDocs(collection(db, 'estoque')));
  await permitido('Entrada de notas soma a quantidade no Estoque', () => updateDoc(doc(db, 'estoque', 'gin'), { quantidade: 3 }));
  await permitido('Resultado (DRE) lê as receitas', () => getDocs(collection(db, 'receitas')));
  await negado('Resultado (DRE) não lança receita', () => addDoc(collection(db, 'receitas'), { descricao: 'x', valor: 1, data: '2026-10-01' }));
  await negado('ver colaboradores', () => getDocs(collection(db, 'colaboradores')));
  await permitido('Ticket médio (tela não marcada: vale a do Resultado) lê as receitas', () => getDocs(collection(db, 'receitas')));
  await permitido('Despesas fixas (só a tela) lê as despesas', () => getDocs(collection(db, 'despesas')));
  await negado('Despesas fixas (só ver) não lança despesa', () => addDoc(collection(db, 'despesas'), { descricao: 'x', categoria: 'Aluguel', valor: 1, data: '2026-10-01', status: 'A pagar' }));
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
  await negado('ver o Estoque (sem Vendas nem Estrutura)', () => getDocs(collection(db, 'estoque')));
  await negado('ver a Tabela de preços (sem Vendas nem Administrativo)', () => getDocs(collection(db, 'precos')));
  await negado('ver guarnições e itens fixos (sem Vendas)', () => getDocs(collection(db, 'guarnicoes')));
  await negado('ver Materiais (sem Vendas nem Estrutura)', () => getDocs(collection(db, 'materiais')));
  await negado('ver as notas de compra (Estrutura)', () => getDocs(collection(db, 'compras')));
  await permitido('ler a chave da IA (equipe logada)', () => getDoc(doc(db, 'segredos', 'ia')));
  await negado('trocar a chave da IA (sem Configurações)', () => setDoc(doc(db, 'segredos', 'ia'), { chave: 'x' }));
  await negado('anexar PDF a um contrato (Administrativo)', async () => {
    const ref = doc(collection(db, 'anexos'));
    const lote = writeBatch(db);
    lote.set(ref, { colecao: 'contratos', registroId: 'contrato-1', nome: 'contrato.pdf', tamanho: 9, partes: 1, criadoPor: auth.currentUser.uid, criadoEm: 'x' });
    lote.set(doc(db, 'anexos', ref.id, 'partes', '0'), { dados: pdf });
    await lote.commit();
  });
  await signOut(auth);
}

console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nTodas as verificações passaram.');
process.exit(falhas ? 1 : 0);

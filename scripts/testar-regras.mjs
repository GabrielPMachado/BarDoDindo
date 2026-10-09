// Confere, contra os emuladores locais, que as regras do Firestore barram o que não pode passar.
// Uso: com `npm run emuladores` rodando e os dados de teste criados (`node scripts/semear-testes.mjs`),
// `node scripts/testar-regras.mjs <senhaCliente> <senhaAtendente>` — ou tudo de uma vez: `npm run testar:regras`.
// (cliente2@teste.local e atendente@teste.local são contas que só existem no emulador).
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  addDoc, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, increment, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';

const [senhaCliente, senhaAtendente, senhaMarketing, senhaAdministrativo] = process.argv.slice(2);
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
  await negado('cadastrar produto (só "ver")', () => addDoc(collection(db, 'produtos'), { nome: 'x', preco: 1 }));
  await negado('listar despesas', () => getDocs(collection(db, 'despesas')));
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
  await signOut(auth);
}

console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nTodas as verificações passaram.');
process.exit(falhas ? 1 : 0);

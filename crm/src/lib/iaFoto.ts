/**
 * Foto do produto no padrão do Bar do Dindo, feita de graça no app do Gemini:
 * o Cérebro monta o pedido (prompt) com o drink e entrega a foto modelo (o Aperol na mesa do bar,
 * com a placa do Dindo); a pessoa gera no Gemini e envia a foto pronta de volta.
 */
import modeloUrl from '../assets/foto-modelo-dindo.jpg';
import modeloEstoqueUrl from '../assets/foto-modelo-estoque.jpg';
import modeloSalaoUrl from '../assets/foto-modelo-salao.jpg';
import modeloChoppUrl from '../assets/foto-modelo-chopp.jpg';
import { fotoNoTamanho } from '../components/Avatar';
import { chaveDaIA } from './iaNota';

export const FOTO_MODELO_URL = modeloUrl;
export const GEMINI_URL = 'https://gemini.google.com/app';

/**
 * Abre o Gemini numa janela sobreposta ao Cérebro (do lado direito da tela), em vez de uma guia nova: o Cérebro continua
 * à vista para enviar a foto pronta. A janela tem nome, então os próximos pedidos reaproveitam a mesma e só a trazem para a frente.
 */
export function abrirGeminiSobreposto() {
  const tela = window.screen;
  const largura = Math.max(480, Math.min(960, Math.round((tela?.availWidth || 1280) * 0.5)));
  const altura = Math.max(560, (tela?.availHeight || 800) - 40);
  const esquerda = Math.max(0, (tela?.availWidth || 1280) - largura);
  const janela = window.open(GEMINI_URL, 'gemini-dindo', `popup,width=${largura},height=${altura},left=${esquerda},top=0`);
  // bloqueador de janelas: cai numa guia comum
  if (!janela) { window.open(GEMINI_URL, '_blank', 'noopener'); return; }
  try { janela.opener = null; } catch { /* outro domínio */ }
  janela.focus();
}

/**
 * Padrões de foto: drinks na mesa do bar; itens do Estoque na bancada do depósito, com a lousa do Dindo ao fundo;
 * bens do Patrimônio no salão (a foto do canto gamer é a planta fixa do salão; cada canto continua a partir dela).
 */
export type PadraoFoto = 'produto' | 'estoque' | 'patrimonio' | 'chopp';
export const MODELOS: Record<PadraoFoto, { url: string; arquivo: string; oQue: string; cenario?: string }> = {
  produto: { url: modeloUrl, arquivo: 'foto-modelo-bar-do-dindo.jpg', oQue: 'drink' },
  estoque: { url: modeloEstoqueUrl, arquivo: 'foto-modelo-estoque-bar-do-dindo.jpg', oQue: 'item', cenario: 'o depósito com a lousa do Dindo' },
  patrimonio: { url: modeloSalaoUrl, arquivo: 'foto-modelo-salao-bar-do-dindo.jpg', oQue: 'bem', cenario: 'o salão do Dindo com o canto gamer' },
  chopp: { url: modeloChoppUrl, arquivo: 'foto-modelo-chopp-bar-do-dindo.jpg', oQue: 'chopp', cenario: 'a Pint APA no balcão do Dindo' },
};

/** Cantos do salão usados como cenário das fotos do Patrimônio; "Automático" escolhe pelo nome e pela categoria do bem. */
export const CENARIOS_PATRIMONIO = ['Automático', 'Canto gamer', 'Palco', 'Atrás do balcão', 'Salão de mesas', 'Cozinha', 'Área externa'] as const;
export type CenarioPatrimonio = Exclude<(typeof CENARIOS_PATRIMONIO)[number], 'Automático'>;

const PLACA = 'a placa redonda de madeira do Bar do Dindo (idêntica à da foto anexada, sem alterar o logo nem as letras "BAR DO DINDO · DRINKS E CHOPP · NOVA OLARIA")';

/**
 * Mapa fixo do salão, a partir da foto modelo (o canto gamer): toda foto é o mesmo salão com a câmera virada para um canto,
 * e cada cena deixa à vista um pedaço do canto vizinho, para as fotos "continuarem" umas nas outras.
 */
const SALAO = `o salão do Bar do Dindo da foto anexada: piso de tábuas de madeira, paredes de tijolos aparentes, luminárias pendentes de cobre com lâmpadas acesas, plantas penduradas e luz quente de fim de tarde. A planta do salão é sempre esta: olhando como na foto anexada, o balcão de madeira com as prateleiras de garrafas fica à esquerda; na parede de tijolos do fundo ficam ${PLACA}, a TV com LED roxo e o rack do canto gamer, com o sofá Chesterfield de couro marrom, a mesinha de centro e o tapete na frente; à direita, a mesma parede de tijolos continua e vira o canto do palco de madeira com cortina de veludo vinho; atrás de quem olha ficam as mesas do salão e a porta para o deck externo; a cozinha fica atrás do balcão`;

/** Para onde a câmera vira em cada canto, o que do canto vizinho aparece na borda e onde o bem fica. */
const CENAS: Record<CenarioPatrimonio, { camera: string; posicao: string }> = {
  'Canto gamer': {
    camera: 'Mantenha o mesmo ângulo e os mesmos objetos da foto anexada (balcão à esquerda, placa, TV, rack, sofá, mesinha e tapete), abrindo só um pouco o enquadramento para a direita: na borda direita aparece o começo do palco de madeira com a cortina vinho, vazio e sem equipamento, um pouco desfocado, para a foto continuar no canto do palco (a versão com os outros itens à vista é a "foto com os outros itens de reserva", feita à parte)',
    posicao: 'O bem fica ligado e pronto para jogar: no lugar do console, em pé sobre o rack embaixo da TV, com a TV mostrando uma tela de jogo colorida e os controles sobre a mesinha de centro',
  },
  Palco: {
    camera: 'Gire a câmera um pouco para a DIREITA da foto anexada: a mesma parede de tijolos continua e mostra o palco de madeira baixo no canto, com cortina de veludo vinho e refletores coloridos no alto. Para a cena continuar o salão, deixe à vista na borda esquerda o fim do rack, vazio e sem console, e um pedaço da TV com LED roxo do canto gamer, um pouco desfocados, com o mesmo piso, tapete e luminárias',
    posicao: 'O bem fica montado em cima do palco, pronto para usar (por exemplo, o karaokê com o pedestal de microfone na frente, as caixas de som dos lados e a tela mostrando a letra de uma música)',
  },
  'Atrás do balcão': {
    camera: 'Gire a câmera para a ESQUERDA da foto anexada, de frente para o balcão de madeira e as prateleiras de garrafas iluminadas, com as plantas penduradas. Para a cena continuar o salão, deixe à vista na borda direita o braço do sofá Chesterfield e um pedaço da parede de tijolos com a placa',
    posicao: 'O bem fica onde ficaria num bar de verdade: os grandes encostados na parede atrás do balcão; os pequenos sobre a bancada',
  },
  'Salão de mesas': {
    camera: 'Vire a câmera para o lado oposto ao da foto anexada, para as mesas e cadeiras de madeira do salão, com as mesmas luminárias pendentes e o mesmo piso. Para a cena continuar o salão, deixe à vista ao fundo, desfocados, o balcão de um lado e o encosto do sofá Chesterfield do outro',
    posicao: 'O bem fica no salão, no lugar natural dele (móveis arrumados no piso; objetos menores sobre uma mesa)',
  },
  Cozinha: {
    camera: 'Mostre a cozinha que fica atrás do balcão: bancadas e paredes de inox, azulejos claros, coifa e utensílios pendurados. Para a cena continuar o salão, deixe à vista, pela porta aberta ao fundo, um pedaço do balcão de madeira e das prateleiras de garrafas com a luz quente do salão',
    posicao: 'O bem fica instalado no lugar dele na cozinha, como em uso no dia a dia',
  },
  'Área externa': {
    camera: 'Mostre o deck de madeira do lado de fora, à noite, com varal de lâmpadas acesas e plantas em vasos. Para a cena continuar o salão, deixe à vista ao fundo, pela porta e pelas janelas, o salão iluminado com os tijolos, as luminárias pendentes e a placa',
    posicao: 'O bem fica na área externa, no lugar natural dele',
  },
};

/** Canto do salão de cada bem, pelo nome e pela categoria (quando o cadastro está em "Automático"). */
export function cenarioDoBem(nome: string, categoria = ''): CenarioPatrimonio {
  const n = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\bps ?\d|playstation|xbox|nintendo|switch|videogame|video game|console|fliperama|arcade/.test(n)) return 'Canto gamer';
  if (/karaok|microfone|caixa de som|mesa de som|amplificador|violao|guitarra|bateria|teclado musical|palco|refletor/.test(n)) return 'Palco';
  if (/fogao|forno|fritadeira|chapa|coifa|liquidificador|processador|panela|exaustor|lava.?lou/.test(n)) return 'Cozinha';
  if (/freezer|geladeira|refrigerador|chopeira|cervejeira|maquina de gelo|cafeteira|maquina de cafe|caixa registradora|pdv|balcao|adega|copo|taca/.test(n)) return 'Atrás do balcão';
  if (/ombrelone|guarda.?sol|deck|toldo|varal de luz/.test(n)) return 'Área externa';
  if (/sinuca|pebolim|dardo|ping.?pong|tenis de mesa/.test(n)) return 'Salão de mesas';
  if (categoria === 'Mobiliário' || categoria === 'Decoração') return 'Salão de mesas';
  if (categoria === 'Reserva' || categoria === 'Eletrônico') return 'Canto gamer';
  return 'Atrás do balcão';
}

/** Pedido para a foto de um bem do Patrimônio, no canto do salão que combina com ele, no estilo do Bar do Dindo. */
export function promptDaFotoPatrimonio(p: { nome: string; categoria?: string; descricao?: string; cenario?: string }) {
  const bem = [p.nome.trim(), p.categoria && p.categoria !== 'Outro' ? `categoria: ${p.categoria}` : '', p.descricao?.trim()].filter(Boolean).join('. ');
  const escolhido = (CENARIOS_PATRIMONIO as readonly string[]).includes(p.cenario ?? '') && p.cenario !== 'Automático'
    ? p.cenario as CenarioPatrimonio : cenarioDoBem(p.nome, p.categoria);
  const cena = CENAS[escolhido];
  return `A foto anexada é ${SALAO}.

Crie uma foto nova DENTRO DESTE MESMO SALÃO, como se fosse tirada pela mesma pessoa, com a mesma câmera, no mesmo dia: mesmos tijolos, piso, luminárias, plantas, cores e luz. ${cena.camera}. Não invente outro bar nem mude a decoração: quem olhar as fotos lado a lado tem que reconhecer o mesmo lugar.

No centro da cena, em destaque, coloque este bem do bar: ${bem}. Mostre o produto real e reconhecível (marca, formato e cores), inteiro e no tamanho real em relação ao ambiente. ${cena.posicao}. Nada de móveis soltos ou improvisados só para apoiar o bem: tudo deve parecer montado de verdade no bar.

Fotografia realista, com foco nítido no bem e fundo levemente desfocado. Não adicione textos (além da placa), pessoas nem mãos. Mantenha o formato horizontal 4:3.`;
}

/** Pedido para a foto de um item do Estoque, no padrão do depósito (a garrafa sobre a bancada, com a lousa do Dindo). */
export function promptDaFotoEstoque(p: { item: string; categoria?: string; unidade?: string; conteudo?: unknown; conteudoUnidade?: string }, comReferencia = false) {
  const conteudo = Number(p.conteudo) > 0 ? `${String(p.conteudo).replace('.', ',')} ${p.conteudoUnidade || ''}`.trim() : '';
  const item = [p.item.trim(), p.categoria ? `categoria: ${p.categoria}` : '', conteudo ? `embalagem de ${conteudo}` : p.unidade ? `vendido por ${p.unidade}` : ''].filter(Boolean).join(', ');
  return `Edite a ${comReferencia ? 'PRIMEIRA imagem anexada (a foto modelo)' : 'imagem anexada'} mantendo EXATAMENTE o mesmo cenário, enquadramento, ângulo de câmera, iluminação e cores: o depósito com as prateleiras laranja cheias de caixas, barris e engradados à esquerda, as luminárias no teto, a parede de blocos com a lousa do Bar do Dindo emoldurada em madeira à direita (idêntica, sem alterar o logo nem as letras "BAR DO DINDO · DRINKS E CHOPP · NOVA OLARIA") e a bancada de concreto/inox em primeiro plano.

Substitua SOMENTE a garrafa do centro por este item do estoque: ${item}. Mostre a embalagem real e reconhecível do produto (garrafa, lata, fardo, caixa, saco ou pacote, conforme o item), com o rótulo nítido e de frente.

O item deve ficar no mesmo lugar: em pé e centralizado sobre a bancada, do mesmo tamanho aproximado da garrafa atual, com a mesma sombra suave e o mesmo reflexo na bancada. Se for hortifrúti ou algo vendido a granel, coloque-o numa caixa ou bandeja limpa sobre a bancada. Fotografia realista de produto.

Não adicione textos, pessoas, mãos nem outros objetos na bancada. Mantenha o formato horizontal 4:3.${comReferencia ? `

A SEGUNDA imagem anexada é a foto antiga deste item, em baixa resolução: use-a só como referência de qual é o produto (embalagem, rótulo e cores). Recrie a cena inteira nítida e em alta resolução, com foco preciso no rótulo, sem borrões nem artefatos de compressão.` : ''}`;
}

/* ---------- chopes do cardápio: a Pint APA no balcão é a foto modelo; muda só o copo, a cor e a plaquinha ---------- */

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Copo = 'Half-pint' | 'Pint' | 'Jarra';
const COPOS: Record<Copo, { oQue: string; tamanho: string }> = {
  'Half-pint': {
    oQue: 'um copo half-pint de vidro (o mesmo formato do copo da foto, só que menor, de uns 300 ml)',
    tamanho: 'Ele é MENOR que o copo atual: cerca de dois terços da altura, com a base exatamente na mesma linha da base do copo atual',
  },
  Pint: {
    oQue: 'um copo pint de vidro (o mesmo copo da foto)',
    tamanho: 'Mesma altura, largura e posição do copo atual, com a base exatamente na mesma linha',
  },
  Jarra: {
    oQue: 'uma caneca-jarra de vidro de 1 litro, com alça grossa do lado direito',
    tamanho: 'Ela é um pouco mais alta e bem mais larga que o copo atual, com a base exatamente na mesma linha da base do copo atual e a alça para a direita, sem encostar na plaquinha',
  },
};

/** Copo do tamanho: pelo nome (Half-pint, Pint, Jarra) ou pelos ml (até 350 ml half-pint; até 700 ml pint; acima, jarra). */
export function copoDoChopp(nome: string, tamanho = ''): Copo {
  const n = semAcento(`${nome} ${tamanho}`);
  if (/half|meio/.test(n)) return 'Half-pint';
  if (/jarra|caneca/.test(n)) return 'Jarra';
  if (/\bpint\b/.test(n)) return 'Pint';
  const m = semAcento(tamanho || nome).match(/(\d+(?:[.,]\d+)?)\s*(ml|l\b|litro)/);
  if (!m) return 'Pint';
  const ml = Number(m[1].replace(',', '.')) * (m[2] === 'ml' ? 1 : 1000);
  return ml <= 350 ? 'Half-pint' : ml <= 700 ? 'Pint' : 'Jarra';
}

/** Estilo da cerveja, sem "Chopp", tamanho e copo (ex.: "Chopp Black IPA 480 ml" → "Black IPA"). */
export function estiloDoChopp(nome: string, tamanho = '') {
  let e = nome;
  if (tamanho.trim()) e = e.replace(tamanho.trim(), '');
  return e
    .replace(/\b(chopp?e?s?|chope)\b/gi, '')
    .replace(/\b(half[- ]?pint|pint|jarra|caneca)\b/gi, '')
    .replace(/\d+(?:[.,]\d+)?\s*(ml|l|litros?)\b/gi, '')
    .replace(/[·\-–]+/g, ' ').replace(/\s+/g, ' ').trim() || nome.trim();
}

/** Cor e colarinho de cada estilo (a ordem importa: "Black IPA" antes de "IPA", "Dry Stout" antes de "Stout"). */
const CORES: [RegExp, string][] = [
  [/black ipa/, 'cerveja preta e opaca, com colarinho bege-claro firme'],
  [/stout/, 'cerveja preta e opaca, com colarinho cremoso e denso cor de caramelo claro'],
  [/porter/, 'cerveja marrom-escura quase preta, com reflexos rubi contra a luz e colarinho bege'],
  [/red|vermelh/, 'cerveja vermelho-acobreada e límpida, com colarinho off-white'],
  [/double|imperial|dipa/, 'cerveja âmbar intensa e levemente turva, com colarinho off-white denso'],
  [/session/, 'cerveja dourado-clara e levemente turva, com colarinho branco'],
  [/ipa/, 'cerveja dourado-alaranjada e levemente turva, com colarinho off-white'],
  [/apa|pale ale/, 'cerveja dourado-âmbar e límpida, com colarinho branco'],
  [/weiss|weizen|trigo|witbier/, 'cerveja amarelo-palha bem turva (de trigo), com colarinho branco alto e fofo'],
  [/pilsen|pilsner|lager|puro malte/, 'cerveja dourado-clara e cristalina, com bolhinhas subindo e colarinho branco'],
  [/vinho|wine/, 'cerveja rosada e límpida, com colarinho rosado claro'],
];
export const corDoChopp = (estilo: string) => CORES.find(([re]) => re.test(semAcento(estilo)))?.[1] ?? 'a cor, a transparência e o colarinho típicos desse estilo de cerveja';

/** Texto da plaquinha de madeira, como nas fotos atuais (ex.: "PINT - APA"). */
export const plaquinhaDoChopp = (copo: Copo, estilo: string) => `${copo} - ${estilo}`.toUpperCase();

/**
 * Pedido para a foto de um chopp do cardápio, no padrão das fotos atuais: a foto modelo é a Pint APA no balcão; muda só o
 * copo (pelo tamanho), a cor da cerveja (pelo estilo) e o texto da plaquinha.
 */
export function promptDaFotoChopp(p: { nome: string; tamanho?: string }) {
  const tamanho = p.tamanho?.trim() ?? '';
  const copo = copoDoChopp(p.nome, tamanho);
  const estilo = estiloDoChopp(p.nome, tamanho);
  const c = COPOS[copo];
  return `Edite a imagem anexada mantendo EXATAMENTE o mesmo cenário, enquadramento, ângulo de câmera, iluminação, cores e desfoque: o balcão de madeira escura em primeiro plano, a luminária pendente de cobre acesa no alto à esquerda, as plantas penduradas e as prateleiras com garrafas desfocadas ao fundo, a parede de tijolos com a placa redonda de madeira do Bar do Dindo à direita (idêntica, sem alterar o logo nem as letras) e a plaquinha de madeira apoiada no balcão à esquerda.

Substitua SOMENTE o copo do centro por ${c.oQue}, cheio de chopp ${estilo}${tamanho ? ` (${tamanho})` : ''}: ${corDoChopp(estilo)}.

${c.tamanho}, centralizado no mesmo ponto do balcão. O vidro tem o logo "BAR DO DINDO" gravado de frente, igual ao do copo atual (mesma fonte, cor e posição). Colarinho cremoso de uns dois dedos, gotículas de condensação no vidro gelado, a mesma sombra suave e o mesmo reflexo na madeira, com a mesma luz quente da luminária. Fotografia realista de bebida.

Na plaquinha de madeira à esquerda, troque o texto por "${plaquinhaDoChopp(copo, estilo)}", nas mesmas letras serifadas, escuras e gravadas na madeira, centralizado; a plaquinha continua do mesmo tamanho e no mesmo lugar.

Não adicione outros textos, pessoas, mãos nem objetos. Mantenha o formato horizontal 4:3.`;
}

export function promptDaFoto(p: { nome: string; resumo?: string; ingredientes?: string }) {
  const drink = [p.nome.trim(), p.resumo?.trim(), p.ingredientes?.trim() ? `ingredientes: ${p.ingredientes.trim()}` : ''].filter(Boolean).join('. ');
  return `Edite a imagem anexada mantendo EXATAMENTE o mesmo cenário, enquadramento, ângulo de câmera, iluminação, cores e desfoque: a luminária pendente acesa no canto superior esquerdo, as plantas, as prateleiras com garrafas à esquerda, a parede de tijolos com a placa redonda do Bar do Dindo à direita (idêntica, sem alterar o logo nem as letras) e a mesa de madeira envernizada em primeiro plano.

Substitua SOMENTE o drink do centro por este drink do cardápio: ${drink}. Use o copo e a apresentação típicos desse drink.

O novo drink deve ficar no mesmo lugar e no mesmo tamanho: centralizado na mesa, ocupando a mesma altura da taça atual, com a mesma sombra suave e o mesmo reflexo na madeira, iluminado pela mesma luz quente da luminária. Gotículas de condensação e reflexos realistas no vidro. Fotografia realista de gastronomia.

Não adicione textos, pessoas, mãos nem outros objetos. Mantenha o formato horizontal 4:3.`;
}

/* ---------- geração direta pela API do Gemini (precisa do faturamento ativo na chave de Configurações) ---------- */

/** Modelos de imagem tentados em ordem: um aposentado (404) ou sobrecarregado dá a vez ao próximo. */
const MODELOS_IMAGEM = ['gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image', 'gemini-3-pro-image-preview'];
const ESPERA_IMAGEM_MS = 120_000;

/** Erro que vale para todos os itens (chave inválida, sem faturamento): a fila para em vez de tentar o próximo. */
export class ErroDaChave extends Error {}

async function base64DaUrl(url: string): Promise<{ mime: string; dados: string }> {
  const blob = await (await fetch(url)).blob();
  const dataUrl = await new Promise<string>((ok, erro) => {
    const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => erro(new Error('Não foi possível ler a imagem.')); r.readAsDataURL(blob);
  });
  return { mime: dataUrl.slice(5, dataUrl.indexOf(';')), dados: dataUrl.split(',')[1] ?? '' };
}

type RespostaImagem = { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }[] } }[] };

async function pedirImagem(chave: string, parts: unknown[], sinal?: AbortSignal): Promise<RespostaImagem> {
  let ultimoErro = 'A IA não conseguiu gerar a foto.';
  for (const m of MODELOS_IMAGEM) {
    // 2K deixa o rótulo nítido; modelos que não aceitam o tamanho recebem o pedido sem ele
    for (const imageConfig of [{ aspectRatio: '4:3', imageSize: '2K' }, { aspectRatio: '4:3' }]) {
      const parar = new AbortController();
      const relogio = setTimeout(() => parar.abort(), ESPERA_IMAGEM_MS);
      const cancelar = () => parar.abort();
      sinal?.addEventListener('abort', cancelar);
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(chave)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: parar.signal,
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig } }),
      }).catch(() => {
        if (sinal?.aborted) throw new DOMException('Cancelado', 'AbortError');
        if (parar.signal.aborted) return null;
        throw new Error('Sem conexão com a IA. Verifique a internet e tente de novo.');
      }).finally(() => { clearTimeout(relogio); sinal?.removeEventListener('abort', cancelar); });
      if (!resp) { ultimoErro = 'A IA do Google está demorando demais agora. Tente de novo em alguns minutos.'; break; }
      const json = await resp.json().catch(() => ({}));
      if (resp.ok) return json as RespostaImagem;
      const msg = String(json?.error?.message ?? '');
      if (resp.status === 400 && /API key/i.test(msg)) throw new ErroDaChave('A chave da IA é inválida. Confira em Configurações → Parâmetros.');
      if (resp.status === 403) throw new ErroDaChave('A chave da IA não permite este endereço. Confira as restrições da chave no Google AI Studio.');
      // o plano gratuito do Google não gera imagens: a cota de imagem vem zerada ou a conta pede faturamento
      if (/billing|free.?tier|limit: ?0|paid/i.test(msg)) {
        throw new ErroDaChave('A geração de fotos precisa do faturamento ativo na chave do Gemini (o plano gratuito do Google não inclui imagens). Ative em aistudio.google.com e tente de novo.');
      }
      if (resp.status === 400 && imageConfig.imageSize) continue;
      ultimoErro = resp.status === 429 ? 'O limite de pedidos da IA acabou por agora. Tente de novo em alguns minutos.'
        : resp.status >= 500 ? 'A IA do Google está sobrecarregada agora. Tente de novo em alguns minutos.'
        : `A IA não conseguiu gerar a foto${msg ? `: ${msg}` : '.'}`;
      break;
    }
  }
  throw new Error(ultimoErro);
}

/** Manda o pedido e as fotos para a IA e devolve a foto nova já no tamanho guardado no cadastro. */
async function fotoDaIA(prompt: string, fotos: { mime: string; dados: string }[], sinal?: AbortSignal): Promise<string> {
  const { chave } = await chaveDaIA().catch((e) => { throw new ErroDaChave(e instanceof Error ? e.message : String(e)); });
  const parts: unknown[] = [{ text: prompt }, ...fotos.map((f) => ({ inline_data: { mime_type: f.mime, data: f.dados } }))];
  const resp = await pedirImagem(chave, parts, sinal);
  const parte = resp.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data || x.inline_data?.data);
  const dados = parte?.inlineData?.data ?? parte?.inline_data?.data;
  const mime = parte?.inlineData?.mimeType ?? parte?.inline_data?.mime_type ?? 'image/png';
  if (!dados) throw new Error('A IA não devolveu uma imagem desta vez. Tente gerar de novo.');
  const blob = await (await fetch(`data:${mime};base64,${dados}`)).blob();
  return fotoNoTamanho(blob);
}

/**
 * Refaz a foto de um item do Estoque no padrão do depósito, direto pela API do Gemini: manda a foto modelo e a foto atual
 * (como referência do produto) e devolve a nova já no tamanho guardado no cadastro.
 */
export async function gerarFotoEstoque(item: Record<string, unknown>, sinal?: AbortSignal): Promise<string> {
  const nome = String(item.item ?? '').trim();
  if (!nome) throw new Error('O item está sem nome.');
  const atual = typeof item.foto === 'string' && item.foto.startsWith('data:image/') ? item.foto : '';
  const prompt = promptDaFotoEstoque({
    item: nome, categoria: String(item.categoria ?? ''), unidade: String(item.unidade ?? ''), conteudo: item.conteudo, conteudoUnidade: String(item.conteudoUnidade ?? ''),
  }, !!atual);
  const fotos = [await base64DaUrl(modeloEstoqueUrl)];
  if (atual) fotos.push({ mime: atual.slice(5, atual.indexOf(';')), dados: atual.split(',')[1] ?? '' });
  return fotoDaIA(prompt, fotos, sinal);
}

/** Gera a foto de um chopp do cardápio (um tamanho) no padrão da Pint APA, direto pela API do Gemini. */
export async function gerarFotoChopp(produto: Record<string, unknown>, sinal?: AbortSignal): Promise<string> {
  const nome = String(produto.nome ?? '').trim();
  if (!nome) throw new Error('O produto está sem nome.');
  const prompt = promptDaFotoChopp({ nome, tamanho: String(produto.tamanho ?? '') });
  return fotoDaIA(prompt, [await base64DaUrl(modeloChoppUrl)], sinal);
}

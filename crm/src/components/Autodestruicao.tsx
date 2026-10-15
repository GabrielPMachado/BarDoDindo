import { useEffect, useRef, useState } from 'react';
import { Bomb, ShieldAlert, Siren, Skull, Volume2, VolumeX, X } from 'lucide-react';
import logoUrl from '../../../shared/assets/logo.webp';

/**
 * "Autodestruição" do Cérebro: uma brincadeira. Pede o código, faz a contagem, finge apagar tudo, explode
 * e termina com "Missão failed: o Cérebro é indestrutível". NADA é apagado nem alterado no banco de dados.
 * Só aparece para um usuário (comparado pelo hash do e-mail, para não deixar o endereço no código público).
 */
const HASH_USUARIOS = [
  '8459a5cb597bcba799ade928a7c036c99a6131dbb1ee16dd2d52d771c9fdc29d', // Yuri
  '27a1c899ece87a30fdcbee994ff18975e78e02919dbc37cf82155c1e7edc1d5a', // Gabriel (para testar)
];
/** Hash do código (nascimento do Santi e do Charlie, 4-4). */
const HASH_CODIGO = 'a2f48973be55a04c232bbcc14541010d7ce03792503d00236728c56ded075a7d';
const TENTATIVAS = 3;
const BLOQUEIO_S = 30;
const CONTAGEM_S = 10;

async function sha256(texto: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** O botão só existe para o usuário certo. */
export function usePodeAutodestruir(email?: string | null) {
  const [pode, setPode] = useState(false);
  useEffect(() => {
    let vivo = true;
    if (!email || !globalThis.crypto?.subtle) return setPode(false);
    void sha256(email.trim().toLowerCase()).then((h) => vivo && setPode(HASH_USUARIOS.includes(h)));
    return () => { vivo = false; };
  }, [email]);
  return pode;
}

/* ---------- sons (gerados na hora, sem arquivos) ---------- */
let audio: AudioContext | null = null;
let mudo = false;
function contexto() {
  audio ??= new AudioContext();
  if (audio.state === 'suspended') void audio.resume();
  return audio;
}
function som(tipo: 'bip' | 'erro' | 'ok' | 'boom' | 'alarme') {
  if (mudo) return;
  try {
    const a = contexto(), t = a.currentTime;
    const g = a.createGain();
    g.connect(a.destination);
    if (tipo === 'boom') {
      // ruído com queda: explosão
      const dur = 2.2, buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.5);
      const src = a.createBufferSource(), f = a.createBiquadFilter();
      src.buffer = buf; f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(60, t + dur);
      g.gain.setValueAtTime(0.9, t);
      src.connect(f); f.connect(g); src.start(t);
      return;
    }
    const o = a.createOscillator();
    o.connect(g);
    const cfg = { bip: [880, 0.08, 'square'], erro: [140, 0.35, 'sawtooth'], ok: [660, 0.25, 'triangle'], alarme: [520, 0.5, 'sawtooth'] } as const;
    const [freq, dur, onda] = cfg[tipo];
    o.type = onda;
    o.frequency.setValueAtTime(freq, t);
    if (tipo === 'alarme') o.frequency.linearRampToValueAtTime(980, t + dur);
    if (tipo === 'ok') o.frequency.setValueAtTime(990, t + 0.12);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur);
  } catch { /* sem som: segue em silêncio */ }
}
/**
 * Alarmão: sirene de bombardeio que sobe e desce sem parar (duas ondas desafinadas + modulação lenta).
 * `acelerar` deixa o uivo mais rápido nos últimos segundos; `parar` desliga com um corte curto.
 */
function iniciarSirene() {
  try {
    const a = contexto();
    const saida = a.createGain();
    saida.gain.setValueAtTime(0, a.currentTime);
    saida.gain.linearRampToValueAtTime(mudo ? 0 : 0.22, a.currentTime + 0.4);
    const filtro = a.createBiquadFilter();
    filtro.type = 'lowpass'; filtro.frequency.value = 2600;
    filtro.connect(saida); saida.connect(a.destination);
    const lfo = a.createOscillator(), profundidade = a.createGain();
    lfo.type = 'sine'; lfo.frequency.value = 0.75; profundidade.gain.value = 380;
    lfo.connect(profundidade);
    const ondas = (['sawtooth', 'square'] as OscillatorType[]).map((tipo, i) => {
      const o = a.createOscillator();
      o.type = tipo; o.frequency.value = 680 + i * 4;
      profundidade.connect(o.frequency);
      const g = a.createGain(); g.gain.value = i ? 0.35 : 1;
      o.connect(g); g.connect(filtro);
      return o;
    });
    [lfo, ...ondas].forEach((o) => o.start());
    return {
      acelerar: () => lfo.frequency.setTargetAtTime(2.6, a.currentTime, 0.3),
      volume: (ligado: boolean) => saida.gain.setTargetAtTime(ligado ? 0.22 : 0, a.currentTime, 0.05),
      parar: () => {
        saida.gain.setTargetAtTime(0, a.currentTime, 0.04);
        setTimeout(() => [lfo, ...ondas].forEach((o) => { try { o.stop(); } catch { /* já parou */ } }), 400);
      },
    };
  } catch {
    return null;
  }
}
const vibrar = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* ignora */ } };

const ALVOS = [
  'Afilhados e pontos', 'Consumos e comandas', 'Receitas e despesas', 'Folha de pagamento', 'Estoque e fichas técnicas',
  'Fornecedores e contratos', 'Usuários e permissões', 'Painel executivo', 'Backups', 'O próprio Cérebro',
];

type Etapa = 'aviso' | 'codigo' | 'contagem' | 'apagando' | 'explosao' | 'falhou';

export function Autodestruicao({ onFechar }: { onFechar: () => void }) {
  const [etapa, setEtapa] = useState<Etapa>('aviso');
  const [codigo, setCodigo] = useState('');
  const [erros, setErros] = useState(0);
  const [bloqueio, setBloqueio] = useState(0);
  const [tremer, setTremer] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [n, setN] = useState(CONTAGEM_S);
  const [abortarTxt, setAbortarTxt] = useState('Abortar');
  const [linhas, setLinhas] = useState(0);
  const [progresso, setProgresso] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const sirene = useRef<ReturnType<typeof iniciarSirene>>(null);
  const [comSom, setComSom] = useState(!mudo);
  const alternarSom = () => { mudo = comSom; setComSom(!comSom); sirene.current?.volume(!mudo); };

  // o alarmão toca da contagem até a explosão
  useEffect(() => {
    if ((etapa === 'contagem' || etapa === 'apagando') && !sirene.current) sirene.current = iniciarSirene();
    if (etapa === 'explosao' || etapa === 'falhou') { sirene.current?.parar(); sirene.current = null; }
  }, [etapa]);
  useEffect(() => { if (etapa === 'contagem' && n <= 3) sirene.current?.acelerar(); }, [etapa, n]);
  useEffect(() => () => { sirene.current?.parar(); sirene.current = null; }, []);

  // Esc fecha só antes de o código ser aceito (depois disso, "não tem volta")
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && (etapa === 'aviso' || etapa === 'codigo' || etapa === 'falhou')) onFechar(); };
    window.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [etapa, onFechar]);

  useEffect(() => { if (etapa === 'codigo') setTimeout(() => inputRef.current?.focus(), 50); }, [etapa]);

  // bloqueio depois de errar o código
  useEffect(() => {
    if (bloqueio <= 0) return;
    const t = setTimeout(() => setBloqueio((b) => b - 1), 1000);
    return () => clearTimeout(t);
  }, [bloqueio]);

  // contagem regressiva
  useEffect(() => {
    if (etapa !== 'contagem') return;
    if (n <= 0) { setEtapa('apagando'); return; }
    som(n <= 3 ? 'alarme' : 'bip');
    vibrar(n <= 3 ? 200 : 60);
    const t = setTimeout(() => setN((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [etapa, n]);

  // "apagando" cada alvo, até travar em 99%
  useEffect(() => {
    if (etapa !== 'apagando') return;
    if (linhas < ALVOS.length) {
      const t = setTimeout(() => { setLinhas((l) => l + 1); setProgresso(Math.min(99, Math.round(((linhas + 1) / ALVOS.length) * 99))); som('bip'); }, 420);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => { setEtapa('explosao'); som('boom'); vibrar([400, 100, 600]); }, 1400);
    return () => clearTimeout(t);
  }, [etapa, linhas]);

  useEffect(() => {
    if (etapa !== 'explosao') return;
    const t = setTimeout(() => { setEtapa('falhou'); som('erro'); }, 1700);
    return () => clearTimeout(t);
  }, [etapa]);

  const conferir = async (digitos: string) => {
    if (digitos.length !== 8 || conferindo || bloqueio) return;
    setConferindo(true);
    const ok = (await sha256(digitos)) === HASH_CODIGO;
    setConferindo(false);
    if (ok) {
      som('ok'); vibrar([80, 60, 80]);
      setEtapa('contagem');
      return;
    }
    som('erro'); vibrar(300);
    setTremer(true); setTimeout(() => setTremer(false), 500);
    setCodigo('');
    const e = erros + 1;
    if (e >= TENTATIVAS) { setErros(0); setBloqueio(BLOQUEIO_S); } else setErros(e);
  };

  const digitar = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 8);
    setCodigo(d);
    if (d.length === 8) void conferir(d);
  };

  const fundo = etapa === 'falhou' ? 'ad--guerra' : etapa === 'explosao' ? 'ad--explosao' : etapa === 'contagem' || etapa === 'apagando' ? 'ad--alarme' : '';

  return (
    <div className={`ad ${fundo}`} role="dialog" aria-modal="true" aria-label="Protocolo de autodestruição">
      {etapa !== 'falhou' && etapa !== 'explosao' && <><div className="ad__faixa ad__faixa--topo" /><div className="ad__faixa ad__faixa--base" /></>}
      {(etapa === 'aviso' || etapa === 'codigo') && (
        <button className="ad__fechar" onClick={onFechar} aria-label="Abortar e fechar"><X size={22} /></button>
      )}
      {etapa !== 'falhou' && (
        <button className="ad__som" onClick={alternarSom} aria-label={comSom ? 'Desligar o som' : 'Ligar o som'} title={comSom ? 'Desligar o som' : 'Ligar o som'}>
          {comSom ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
      )}

      {etapa === 'aviso' && (
        <div className="ad__caixa">
          <div className="ad__icone"><Skull size={56} /></div>
          <p className="ad__kicker">Nível de acesso: comando supremo</p>
          <h1 className="ad__titulo">Protocolo de autodestruição</h1>
          <p className="ad__texto">
            Esta operação apaga <b>todo</b> o banco de dados do Cérebro: afilhados, pontos, consumos, financeiro, equipe, estoque e fichas técnicas.
          </p>
          <p className="ad__texto ad__texto--forte">Não existe backup. Não existe volta. Não existe “desfazer”.</p>
          <div className="ad__acoes">
            <button className="ad__btn ad__btn--ghost" onClick={onFechar}>Abortar missão</button>
            <button className="ad__btn ad__btn--perigo" onClick={() => { som('alarme'); vibrar(120); setEtapa('codigo'); }}>
              <Bomb size={18} /> Armar protocolo
            </button>
          </div>
        </div>
      )}

      {etapa === 'codigo' && (
        <div className={`ad__caixa ${tremer ? 'ad--tremer' : ''}`}>
          <div className="ad__icone ad__icone--pulso"><ShieldAlert size={52} /></div>
          <p className="ad__kicker">Autorização final</p>
          <h1 className="ad__titulo">Digite o código de destruição</h1>
          <p className="ad__texto">Ano de nascimento dos guardiões do Cérebro.</p>
          <label className="ad__codigo" onClick={() => inputRef.current?.focus()}>
            <input
              ref={inputRef} className="ad__input" inputMode="numeric" autoComplete="off" aria-label="Código de 8 dígitos"
              value={codigo} disabled={!!bloqueio} onChange={(e) => digitar(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void conferir(codigo); }}
            />
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} className={`ad__cel ${i < codigo.length ? 'is-cheia' : ''} ${i === codigo.length && !bloqueio ? 'is-atual' : ''}`}>
                {codigo[i] ?? ''}
                {i === 3 && <i className="ad__traco">-</i>}
              </span>
            ))}
          </label>
          {bloqueio > 0 ? (
            <p className="ad__alerta">ACESSO NEGADO · terminal bloqueado por {bloqueio}s</p>
          ) : erros > 0 ? (
            <p className="ad__alerta">CÓDIGO INVÁLIDO · {TENTATIVAS - erros} {TENTATIVAS - erros === 1 ? 'tentativa restante' : 'tentativas restantes'}</p>
          ) : (
            <p className="ad__dica">Formato 0000-0000. Ao confirmar, a contagem começa e <b>não pode ser interrompida</b>.</p>
          )}
        </div>
      )}

      {etapa === 'contagem' && (
        <div className="ad__caixa">
          <p className="ad__kicker"><Siren size={16} /> Código aceito · autodestruição iniciada</p>
          <div className={`ad__relogio ${n <= 3 ? 'is-final' : ''}`}>
            <svg viewBox="0 0 200 200" aria-hidden>
              <circle cx="100" cy="100" r="90" className="ad__anel-fundo" />
              <circle cx="100" cy="100" r="90" className="ad__anel" style={{ strokeDashoffset: 565.5 * (1 - n / CONTAGEM_S) }} />
              {Array.from({ length: 60 }, (_, i) => (
                <line key={i} x1="100" y1="4" x2="100" y2={i % 5 ? 10 : 16} className="ad__marca" transform={`rotate(${i * 6} 100 100)`} />
              ))}
            </svg>
            <div className="ad__contagem" key={n}>{String(n).padStart(2, '0')}</div>
            <span className="ad__seg">segundos</span>
          </div>
          <p className="ad__texto">Evacuem o servidor. Todos os dados serão destruídos.</p>
          <button className="ad__btn ad__btn--ghost" onClick={() => { som('erro'); setAbortarTxt('Abortar desativado pelo protocolo'); }}>{abortarTxt}</button>
        </div>
      )}

      {etapa === 'apagando' && (
        <div className="ad__caixa ad__caixa--terminal">
          <p className="ad__kicker">Destruição em andamento</p>
          <div className="ad__terminal">
            {ALVOS.slice(0, linhas).map((a, i) => (
              <div key={a} className="ad__linha">
                <span>&gt; apagando {a.toLowerCase()}</span>
                <span className="ad__pontos" />
                <b className={i === ALVOS.length - 1 ? 'ad__falha' : ''}>{i === ALVOS.length - 1 ? 'ERRO' : 'OK'}</b>
              </div>
            ))}
            {linhas >= ALVOS.length && <div className="ad__linha ad__falha">&gt; FALHA CRÍTICA NO NÚCLEO · sobrecarga detectada</div>}
          </div>
          <div className="ad__barra"><div style={{ width: `${progresso}%` }} /></div>
          <p className="ad__progresso">{progresso}%</p>
        </div>
      )}

      {etapa === 'explosao' && <div className="ad__flash" aria-hidden />}

      {etapa === 'falhou' && (
        <div className="ad__final">
          <div className="ad__emblema">
            <img src={logoUrl} width={96} height={96} alt="" />
            <span className="ad__estrelas">★ ★ ★</span>
          </div>
          <p className="ad__classificado">Relatório de combate · Classificado</p>
          <div className="ad__carimbo">Missão failed</div>
          <h1 className="ad__indestrutivel">O Cérebro é<br /><span>indestrutível</span></h1>
          <dl className="ad__relatorio">
            <div><dt>Alvo</dt><dd>Banco de dados do Cérebro</dd></div>
            <div><dt>Registros destruídos</dt><dd>0</dd></div>
            <div><dt>Danos</dt><dd>Nenhum</dd></div>
            <div><dt>Status do sistema</dt><dd className="ad__verde">100% operacional</dd></div>
          </dl>
          <button className="ad__btn ad__btn--militar" onClick={onFechar}>Sim, senhor! Voltar ao trabalho</button>
        </div>
      )}
    </div>
  );
}

/**
 * Configuração do projeto Firebase (app web). Estes valores são públicos por natureza:
 * quem protege os dados são as regras em `firestore.rules`.
 * Para obter os valores: `firebase apps:sdkconfig web --project <id-do-projeto>`.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyBpR-KOIa3nSdmt41vxJSvqRgZVBAfq8Z4',
  authDomain: 'bardo-c0878.firebaseapp.com',
  projectId: 'bardo-c0878',
  storageBucket: 'bardo-c0878.firebasestorage.app',
  messagingSenderId: '25992464924',
  appId: '1:25992464924:web:1b2a776384133356212dd9',
};

/** `VITE_EMULADOR=1` no build aponta para os emuladores locais (`npm run emuladores`). */
export const EMULADOR = import.meta.env.VITE_EMULADOR === '1';
export const EMULADOR_AUTH = 'http://127.0.0.1:9099';
export const EMULADOR_FIRESTORE = { host: '127.0.0.1', port: 8080 };

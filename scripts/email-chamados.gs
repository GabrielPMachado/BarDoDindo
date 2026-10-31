/**
 * Bar do Dindo · e-mail dos chamados de suporte (Google Apps Script).
 *
 * O Cérebro não tem servidor: quando alguém abre um chamado, ele manda o e-mail já montado para este script,
 * que envia pelo Gmail da conta onde ele está publicado (até 100 e-mails por dia na conta gratuita).
 *
 * Como publicar (uma vez só):
 *  1. Entre em https://script.google.com com a conta Google que vai enviar os e-mails e crie um "Novo projeto".
 *  2. Apague o que vier escrito, cole este arquivo inteiro e troque os endereços de DESTINOS abaixo.
 *  3. Salve, clique em Implantar → Nova implantação → tipo "App da Web".
 *     Executar como: "Eu". Quem pode acessar: "Qualquer pessoa". Clique em Implantar e autorize o acesso ao Gmail.
 *  4. Copie o "URL do app da Web" (termina em /exec) e cole no Cérebro, em Configurações → E-mail dos chamados.
 *
 * Os destinatários ficam só aqui: quem tem o endereço do script consegue mandar e-mail apenas para eles.
 * Depois de editar este arquivo, publique de novo em Implantar → Gerenciar implantações → editar → Nova versão.
 */
const DESTINOS = ['seu-email@exemplo.com'];
const REMETENTE = 'Cérebro · Bar do Dindo';

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    const assunto = String(d.assunto || 'Novo chamado de suporte').slice(0, 200);
    const html = String(d.html || '');
    if (!html || html.length > 200000) throw new Error('E-mail vazio ou grande demais.');
    MailApp.sendEmail({ to: DESTINOS.join(','), subject: assunto, htmlBody: html, body: String(d.texto || '').slice(0, 20000), name: REMETENTE });
    return responder({ ok: true });
  } catch (erro) {
    return responder({ ok: false, erro: String(erro && erro.message || erro) });
  }
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

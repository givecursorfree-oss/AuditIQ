import tls from 'node:tls';
import { getEnv } from './env.js';
import logger from './logger.js';
import { ingestInboundReply } from './emailReplyIngest.js';
import { normalizeMessageId } from './dataRequestMail.js';

type FetchedMail = {
  uid: number;
  headers: string;
  text: string;
};

function imapEnabled(): boolean {
  const env = getEnv();
  if (env.IMAP_ENABLED === false) return false;
  if (env.IMAP_ENABLED === true) return Boolean(env.SMTP_USER && env.SMTP_PASSWORD);
  // Default on when talking to Gmail SMTP with credentials (same App Password for IMAP).
  const host = (env.SMTP_HOST || '').toLowerCase();
  return host.includes('gmail.com') && Boolean(env.SMTP_USER && env.SMTP_PASSWORD);
}

function imapHostPort(): { host: string; port: number } {
  const env = getEnv();
  if (env.IMAP_HOST) return { host: env.IMAP_HOST, port: env.IMAP_PORT };
  if ((env.SMTP_HOST || '').toLowerCase().includes('gmail.com')) {
    return { host: 'imap.gmail.com', port: 993 };
  }
  return { host: env.IMAP_HOST || 'localhost', port: env.IMAP_PORT };
}

/** ponytail: tiny IMAP client for UNSEEN header+text only; upgrade path: imapflow. */
async function withImapSession<T>(fn: (send: (cmd: string) => Promise<string>) => Promise<T>): Promise<T> {
  const env = getEnv();
  const { host, port } = imapHostPort();
  const socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
    const s = tls.connect({ host, port, servername: host }, () => resolve(s));
    s.setEncoding('utf8');
    s.on('error', reject);
  });

  let buffer = '';
  let tagSeq = 0;
  const waiters: Array<{ tag: string; resolve: (v: string) => void; reject: (e: Error) => void }> = [];

  const flush = () => {
    while (true) {
      const idx = buffer.search(/\r?\n/);
      if (idx < 0) break;
      // Keep accumulating until tagged completion — handled below in onData chunks
      break;
    }
    for (let i = 0; i < waiters.length; i++) {
      const w = waiters[i];
      const re = new RegExp(`(?:^|\\r?\\n)${w.tag} (OK|NO|BAD)[^\\r\\n]*`, 'm');
      const m = buffer.match(re);
      if (!m) continue;
      const end = (m.index ?? 0) + m[0].length;
      const chunk = buffer.slice(0, end);
      buffer = buffer.slice(end);
      waiters.splice(i, 1);
      if (m[1] === 'OK') w.resolve(chunk);
      else w.reject(new Error(chunk.trim()));
      return;
    }
  };

  socket.on('data', (chunk: string) => {
    buffer += chunk;
    flush();
  });

  const readGreeting = () =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('IMAP greeting timeout')), 15_000);
      const check = () => {
        if (/^\* OK/m.test(buffer)) {
          clearTimeout(t);
          resolve();
          return;
        }
        setTimeout(check, 20);
      };
      check();
    });

  const send = (cmd: string) => {
    const tag = `A${++tagSeq}`;
    return new Promise<string>((resolve, reject) => {
      waiters.push({ tag, resolve, reject });
      socket.write(`${tag} ${cmd}\r\n`);
      setTimeout(() => {
        const i = waiters.findIndex((w) => w.tag === tag);
        if (i >= 0) {
          waiters.splice(i, 1);
          reject(new Error(`IMAP timeout: ${cmd.split(' ')[0]}`));
        }
      }, 30_000);
    });
  };

  try {
    await readGreeting();
    if (!env.SMTP_USER || !env.SMTP_PASSWORD) throw new Error('IMAP credentials missing');
    await send(`LOGIN ${quoteImap(env.SMTP_USER)} ${quoteImap(env.SMTP_PASSWORD)}`);
    const result = await fn(send);
    await send('LOGOUT').catch(() => undefined);
    return result;
  } finally {
    socket.destroy();
  }
}

function quoteImap(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function parseHeader(headers: string, name: string): string | null {
  const re = new RegExp(`^${name}:\\s*(.+?)(?=\\r?\\n(?!\\s)|$)`, 'ims');
  const m = headers.match(re);
  if (!m) return null;
  return m[1].replace(/\r?\n[ \t]+/g, ' ').trim();
}

async function fetchUnseen(send: (cmd: string) => Promise<string>): Promise<FetchedMail[]> {
  await send('SELECT INBOX');
  const search = await send('UID SEARCH UNSEEN');
  const uidLine = search.split(/\r?\n/).find((l) => l.startsWith('* SEARCH'));
  if (!uidLine) return [];
  const uids = uidLine
    .replace('* SEARCH', '')
    .trim()
    .split(/\s+/)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
  const out: FetchedMail[] = [];
  for (const uid of uids.slice(0, 25)) {
    // BODY.PEEK avoids marking Seen until we successfully ingest
    const raw = await send(`UID FETCH ${uid} (BODY.PEEK[HEADER] BODY.PEEK[TEXT])`);
    const headerMatch = raw.match(/BODY\[HEADER\]\s*\{(\d+)\}\r?\n/);
    const textMatch = raw.match(/BODY\[TEXT\]\s*\{(\d+)\}\r?\n/);
    let headers = '';
    let text = '';
    if (headerMatch) {
      const start = raw.indexOf(headerMatch[0]) + headerMatch[0].length;
      headers = raw.slice(start, start + Number(headerMatch[1]));
    }
    if (textMatch) {
      const start = raw.indexOf(textMatch[0]) + textMatch[0].length;
      text = raw.slice(start, start + Number(textMatch[1]));
    }
    out.push({ uid, headers, text });
  }
  return out;
}

export async function pollImapInboxForReplies(): Promise<{ scanned: number; stored: number }> {
  if (!imapEnabled()) return { scanned: 0, stored: 0 };

  try {
    return await withImapSession(async (send) => {
      const mails = await fetchUnseen(send);
      let stored = 0;
      for (const mail of mails) {
        const messageId = normalizeMessageId(parseHeader(mail.headers, 'Message-ID'));
        if (!messageId) continue;
        const result = await ingestInboundReply({
          messageId,
          inReplyTo: parseHeader(mail.headers, 'In-Reply-To'),
          references: parseHeader(mail.headers, 'References'),
          subject: parseHeader(mail.headers, 'Subject') || '(no subject)',
          fromAddress: parseHeader(mail.headers, 'From') || '',
          toAddress: parseHeader(mail.headers, 'To') || '',
          ccAddress: parseHeader(mail.headers, 'Cc'),
          bodyText: mail.text,
          imapUid: `inbox:${mail.uid}`,
        });
        if (result.stored || result.duplicate) {
          if (result.stored) stored++;
          await send(`UID STORE ${mail.uid} +FLAGS (\\Seen)`).catch(() => undefined);
        }
      }
      return { scanned: mails.length, stored };
    });
  } catch (err) {
    logger.warn('IMAP reply poll failed', { error: (err as Error).message });
    return { scanned: 0, stored: 0 };
  }
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import nodemailer from 'nodemailer';

const topicPattern = /^[a-zA-Z0-9_-]{1,64}$/;

export function internalNtfy(directory) {
  try {
    const data = JSON.parse(readFileSync(join(directory, 'ntfy-internal.json'), 'utf8'));
    if (data.url === 'http://127.0.0.1:8086' && topicPattern.test(data.topic) && data.username && data.secret) return data;
  } catch { /* Internal ntfy has not been provisioned. */ }
  return null;
}

// Validation et forme publique : implémentation unique dans src/application/notifications.ts (MIG-04).
export { notificationSettings, publicNotifications } from '../src/application/notifications.ts';

const defaultMessage = 'Notification de test envoyée par FabCore.';
export async function sendNotification(channel, config, internal, { fetcher = fetch, transport = nodemailer.createTransport, title = 'FabCore - Test', message = defaultMessage } = {}) {
  if (channel === 'ntfy') {
    const ntfy = config.ntfy?.mode === 'internal' ? internal : config.ntfy?.mode === 'external' ? config.ntfy : null;
    if (!ntfy) return false;
    const headers = { Title: title, 'Content-Type': 'text/plain; charset=utf-8' };
    if (ntfy.auth === 'bearer') headers.Authorization = 'Bearer ' + ntfy.secret;
    else if (ntfy.username) headers.Authorization = 'Basic ' + Buffer.from(ntfy.username + ':' + ntfy.secret).toString('base64');
    const response = await fetcher(ntfy.url + '/' + ntfy.topic, {
      method: 'POST', body: message, headers, redirect: 'error', signal: AbortSignal.timeout(5000)
    });
    await response.body?.cancel();
    return response.ok;
  }
  if (channel !== 'smtp' || !config.smtp?.enabled) return false;
  const smtp = config.smtp;
  const client = transport({
    host: smtp.host, port: smtp.port, secure: smtp.tls === 'tls', requireTLS: smtp.tls === 'starttls',
    dnsTimeout: 3500, connectionTimeout: 3500, greetingTimeout: 3500, socketTimeout: 5000,
    ...(smtp.auth ? { auth: { user: smtp.username, pass: smtp.secret } } : {})
  });
  try {
    const result = await client.sendMail({ from: smtp.from, to: smtp.to, subject: title, text: message });
    return result.accepted?.length === 1;
  } finally {
    client.close();
  }
}

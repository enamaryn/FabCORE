import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import nodemailer from 'nodemailer';

const topicPattern = /^[a-zA-Z0-9_-]{1,64}$/;
const mailAddress = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const text = (input, limit) => typeof input === 'string' && input.length <= limit && !/[\x00-\x1f\x7f]/.test(input) ? input : '';
const invalid = () => { throw new Error('notifications-invalid'); };

export function internalNtfy(directory) {
  try {
    const data = JSON.parse(readFileSync(join(directory, 'ntfy-internal.json'), 'utf8'));
    if (data.url === 'http://127.0.0.1:8086' && topicPattern.test(data.topic) && data.username && data.secret) return data;
  } catch { /* Internal ntfy has not been provisioned. */ }
  return null;
}

export function notificationSettings(input, previous = {}, internal) {
  const config = {};
  const ntfy = input.ntfy ?? {};
  const smtp = input.smtp ?? {};
  if (!['off', 'internal', 'external'].includes(ntfy.mode) || typeof smtp.enabled !== 'boolean') invalid();
  config.ntfy = { mode: ntfy.mode };
  if (ntfy.mode === 'internal' && !internal) throw new Error('ntfy-install-required');
  if (ntfy.mode === 'external') {
    let url;
    try { url = new URL(text(ntfy.url, 256)); } catch { invalid(); }
    const auth = ntfy.auth;
    const username = auth === 'basic' ? text(ntfy.username, 128) : '';
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        !topicPattern.test(ntfy.topic) || typeof ntfy.topic !== 'string' ||
        !['none', 'basic', 'bearer'].includes(auth) || (auth === 'basic' && (!username || username.includes(':')))) invalid();
    const destination = url.href.replace(/\/+$/, '');
    const old = previous.ntfy;
    const keep = old?.mode === 'external' && old.url === destination && old.topic === ntfy.topic && old.auth === auth && old.username === username;
    const secret = text(ntfy.secret, 512) || (ntfy.secret === '' && keep ? old.secret : '');
    if (auth !== 'none' && !secret) invalid();
    config.ntfy = { mode: 'external', url: destination, topic: ntfy.topic, auth, username, secret: auth === 'none' ? '' : secret };
  }
  config.smtp = { enabled: smtp.enabled };
  if (smtp.enabled) {
    const host = text(smtp.host, 253).trim().toLowerCase();
    const port = Number(smtp.port);
    const tls = smtp.tls;
    const from = text(smtp.from, 254);
    const to = text(smtp.to, 254);
    const username = text(smtp.username, 128);
    if (!/^[a-z0-9][a-z0-9.-]*$/i.test(host) || !Number.isInteger(port) || port < 1 || port > 65535 ||
        !['tls', 'starttls'].includes(tls) || !mailAddress.test(from) || !mailAddress.test(to) || typeof smtp.auth !== 'boolean') invalid();
    const old = previous.smtp;
    const keep = old?.host === host && old.port === port && old.tls === tls && old.auth === smtp.auth && old.username === username;
    const secret = text(smtp.secret, 512) || (smtp.secret === '' && keep ? old.secret : '');
    if (smtp.auth && (!username || !secret)) invalid();
    config.smtp = { enabled: true, host, port, tls, from, to, auth: smtp.auth, username: smtp.auth ? username : '', secret: smtp.auth ? secret : '' };
  }
  return config;
}

export function publicNotifications(config = {}, internal) {
  const { secret: _ntfy, ...ntfy } = config.ntfy ?? { mode: 'off' };
  const { secret: _smtp, ...smtp } = config.smtp ?? { enabled: false };
  return { ntfy, smtp, internal: internal ? { url: internal.url, topic: internal.topic } : null };
}

const message = 'Notification de test envoyée par FabCore.';
export async function sendNotification(channel, config, internal, { fetcher = fetch, transport = nodemailer.createTransport } = {}) {
  if (channel === 'ntfy') {
    const ntfy = config.ntfy?.mode === 'internal' ? internal : config.ntfy?.mode === 'external' ? config.ntfy : null;
    if (!ntfy) return false;
    const headers = { Title: 'FabCore - Test', 'Content-Type': 'text/plain; charset=utf-8' };
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
    const result = await client.sendMail({ from: smtp.from, to: smtp.to, subject: 'FabCore - Test', text: message });
    return result.accepted?.length === 1;
  } finally {
    client.close();
  }
}

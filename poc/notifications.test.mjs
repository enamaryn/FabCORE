import assert from 'node:assert/strict';
import { test } from 'node:test';
import { notificationSettings, publicNotifications, sendNotification } from './notifications.mjs';

const input = {
  ntfy: { mode: 'external', url: 'https://ntfy.example.test/', topic: 'fabcore', auth: 'bearer', secret: 'example-token' },
  smtp: { enabled: true, host: 'smtp.example.test', port: 587, tls: 'starttls', from: 'fab@example.test',
    to: 'atelier@example.test', auth: true, username: 'fab', secret: 'example-password' }
};

test('les secrets restent masqués et ne sont conservés que pour la même connexion', () => {
  const saved = notificationSettings(input);
  const display = JSON.stringify(publicNotifications(saved));
  assert.ok(!display.includes('example-token'));
  assert.ok(!display.includes('example-password'));
  const same = structuredClone(input);
  same.ntfy.secret = same.smtp.secret = '';
  assert.deepEqual(notificationSettings(same, saved), saved);
  same.ntfy.topic = 'second';
  assert.throws(() => notificationSettings(same, saved), /notifications-invalid/);
  same.ntfy.url = 'http://ntfy.example.test';
  assert.throws(() => notificationSettings(same, saved), /notifications-invalid/);
  assert.throws(() => notificationSettings({ ...input, ntfy: { mode: 'internal' } }), /ntfy-install-required/);
  assert.equal(notificationSettings({ ...input, ntfy: { mode: 'off' } }).smtp.enabled, true);
});

test('ntfy publie en HTTPS ou sur le serveur local configuré, SMTP exige STARTTLS', async () => {
  const saved = notificationSettings(input);
  let checked = 0;
  const fetcher = async (url, options) => {
    assert.equal(url, 'https://ntfy.example.test/fabcore');
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer example-token');
    checked++;
    return Response.json({ id: 'test' });
  };
  assert.equal(await sendNotification('ntfy', saved, null, { fetcher }), true);
  const internal = { url: 'http://127.0.0.1:8086', topic: 'fabcore', username: 'publisher', secret: 'example' };
  const local = notificationSettings({ ...input, ntfy: { mode: 'internal' } }, {}, internal);
  assert.equal(await sendNotification('ntfy', local, internal, { fetcher: async (url, options) => {
    assert.equal(url, internal.url + '/fabcore');
    assert.equal(options.headers.Authorization, 'Basic ' + Buffer.from('publisher:example').toString('base64'));
    checked++;
    return new Response('', { status: 200 });
  } }), true);
  assert.equal(await sendNotification('smtp', saved, null, { transport: (options) => {
    assert.equal(options.requireTLS, true);
    assert.equal(options.secure, false);
    assert.deepEqual(options.auth, { user: 'fab', pass: 'example-password' });
    return {
      async sendMail(mail) {
        assert.equal(mail.to, 'atelier@example.test');
        checked++;
        return { accepted: [mail.to] };
      },
      close() { checked++; }
    };
  } }), true);
  assert.equal(checked, 4);
});

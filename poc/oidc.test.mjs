import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { createOidc } from './oidc.mjs';

const issuer = 'https://id.example.test';
const origin = 'https://fab.example.test';
const env = {
  FABCORE_OIDC_ISSUER: issuer, FABCORE_OIDC_CLIENT_ID: 'fab-test', FABCORE_OIDC_CLIENT_SECRET: 'test-only',
  FABCORE_OIDC_ADMIN_GROUP: 'fab-admins', FABCORE_OIDC_OBSERVER_GROUP: 'fab-observers'
};

test('OIDC exige HTTPS et des groupes FabCore distincts', () => {
  assert.equal(createOidc(origin, {}), null);
  assert.throws(() => createOidc('http://fab.example.test', env));
  assert.throws(() => createOidc(origin, { ...env, FABCORE_OIDC_OBSERVER_GROUP: 'fab-admins' }));
  assert.throws(() => createOidc(origin, { ...env, FABCORE_OIDC_ADMIN_GROUP: '', FABCORE_OIDC_OBSERVER_GROUP: '' }));
});

test('OIDC valide PKCE, nonce, signature, session navigateur et groupes', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const payload = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  let start;
  let groups = ['fab-observers'];
  let userinfoSubject = 'subject-fab';
  let invalidSignature = false;
  let tokenCalls = 0;
  const oidc = createOidc(origin, env, async (target, options) => {
    const url = new URL(target);
    assert.equal(url.origin, issuer);
    switch (url.pathname) {
      case '/.well-known/openid-configuration':
        return Response.json({
          issuer, authorization_endpoint: issuer + '/authorize', token_endpoint: issuer + '/token',
          userinfo_endpoint: issuer + '/userinfo', jwks_uri: issuer + '/jwks',
          id_token_signing_alg_values_supported: ['RS256']
        });
      case '/token': {
        tokenCalls++;
        const form = new URLSearchParams(options.body);
        const headers = new Headers(options.headers);
        assert.equal(headers.get('authorization'), 'Basic ' + Buffer.from('fab%2Dtest:test%2Donly').toString('base64'));
        assert.equal(form.get('redirect_uri'), origin + '/api/oidc/callback');
        assert.equal(createHash('sha256').update(form.get('code_verifier')).digest('base64url'), start.get('code_challenge'));
        const now = Math.floor(Date.now() / 1000);
        const jwt = payload({ alg: 'RS256', kid: 'test' }) + '.' + payload({
          iss: issuer, aud: 'fab-test', sub: 'subject-fab', nonce: start.get('nonce'), iat: now, exp: now + 60
        });
        const signature = sign('sha256', Buffer.from(jwt), privateKey);
        if (invalidSignature) signature[0] ^= 1;
        return Response.json({ access_token: 'test-access', token_type: 'Bearer', id_token: jwt + '.' + signature.toString('base64url') });
      }
      case '/jwks':
        return Response.json({ keys: [{ ...publicKey.export({ format: 'jwk' }), alg: 'RS256', kid: 'test' }] });
      case '/userinfo':
        assert.equal(new Headers(options.headers).get('authorization'), 'Bearer test-access');
        return Response.json({ sub: userinfoSubject, preferred_username: 'atelier', groups });
      default:
        assert.fail(url.pathname);
    }
  });

  async function begin() {
    const flow = await oidc.begin();
    start = new URL(flow.url).searchParams;
    assert.equal(start.get('code_challenge_method'), 'S256');
    assert.equal(start.get('scope'), 'openid profile groups');
    assert.match(flow.cookie, /Secure; HttpOnly; SameSite=Lax/);
    return { query: new URLSearchParams({ code: 'test-code', state: start.get('state') }), cookie: flow.cookie.split(';')[0] };
  }
  const first = await begin();
  assert.equal(await oidc.complete(first.query, ''), null);
  assert.equal(tokenCalls, 0);
  assert.deepEqual(await oidc.complete(first.query, first.cookie), { username: 'atelier', role: 'observer' });
  assert.equal(await oidc.complete(first.query, first.cookie), null);
  assert.equal(tokenCalls, 1);
  groups = ['fab-admins'];
  const admin = await begin();
  assert.deepEqual(await oidc.complete(admin.query, admin.cookie), { username: 'atelier', role: 'admin' });
  groups = ['ailleurs'];
  const blocked = await begin();
  assert.equal(await oidc.complete(blocked.query, blocked.cookie), null);
  groups = ['fab-admins'];
  userinfoSubject = 'autre-compte';
  const wrongSubject = await begin();
  await assert.rejects(oidc.complete(wrongSubject.query, wrongSubject.cookie));
  userinfoSubject = 'subject-fab';
  invalidSignature = true;
  const wrongSignature = await begin();
  await assert.rejects(oidc.complete(wrongSignature.query, wrongSignature.cookie));
});

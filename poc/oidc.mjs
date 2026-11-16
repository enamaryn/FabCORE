import * as openid from 'openid-client';

const maxAge = 300;
const callbackPath = '/api/oidc/callback';
const flowCookie = '__Host-fabcore_oidc';
const cookie = (value, age) => `${flowCookie}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Lax`;

function groupRole(groups, adminGroup, observerGroup) {
  if (!Array.isArray(groups)) return null;
  if (adminGroup && groups.includes(adminGroup)) return 'admin';
  if (observerGroup && groups.includes(observerGroup)) return 'observer';
  return null;
}

export function createOidc(origin, env = process.env, fetcher) {
  const issuer = env.FABCORE_OIDC_ISSUER;
  if (!issuer) return null;
  const provider = new URL(issuer);
  const redirect = new URL(callbackPath, origin);
  const id = env.FABCORE_OIDC_CLIENT_ID;
  const secret = env.FABCORE_OIDC_CLIENT_SECRET;
  const adminGroup = env.FABCORE_OIDC_ADMIN_GROUP;
  const observerGroup = env.FABCORE_OIDC_OBSERVER_GROUP;
  if (provider.protocol !== 'https:' || provider.username || provider.password || provider.search || provider.hash ||
      redirect.protocol !== 'https:' || !id || !secret || !(adminGroup || observerGroup) || adminGroup === observerGroup) {
    throw new Error('Configuration OIDC FabCore invalide.');
  }

  let client;
  const flows = new Map();
  function configuration() {
    client ??= openid.discovery(provider, id, { client_secret: secret }, openid.ClientSecretBasic(secret), {
      timeout: 5,
      execute: [openid.enableNonRepudiationChecks],
      ...(fetcher ? { [openid.customFetch]: fetcher } : {})
    }).catch((error) => {
      client = undefined;
      throw error;
    });
    return client;
  }

  return {
    async begin() {
      const config = await configuration();
      const state = openid.randomState();
      const nonce = openid.randomNonce();
      const verifier = openid.randomPKCECodeVerifier();
      const url = openid.buildAuthorizationUrl(config, {
        scope: 'openid profile groups',
        redirect_uri: redirect.href,
        code_challenge: await openid.calculatePKCECodeChallenge(verifier),
        code_challenge_method: 'S256',
        state,
        nonce
      });
      const now = Date.now();
      for (const [key, flow] of flows) if (flow.expires <= now) flows.delete(key);
      if (flows.size >= 64) throw new Error('OIDC flow limit');
      flows.set(state, { nonce, verifier, expires: now + maxAge * 1000 });
      return { url: url.href, cookie: cookie(state, maxAge) };
    },

    clearCookie: cookie('', 0),

    async complete(query, cookies = '') {
      const state = cookies.match(/(?:^|;\s*)__Host-fabcore_oidc=([\w-]{43})(?:;|$)/)?.[1];
      const flow = flows.get(state);
      if (!flow || flow.expires <= Date.now() || query.getAll('state').length !== 1 || query.get('state') !== state) return null;
      flows.delete(state);
      const config = await configuration();
      const callback = new URL(redirect);
      callback.search = query.toString();
      const tokens = await openid.authorizationCodeGrant(config, callback, {
        pkceCodeVerifier: flow.verifier, expectedState: state, expectedNonce: flow.nonce, idTokenExpected: true
      });
      const claims = tokens.claims();
      const profile = await openid.fetchUserInfo(config, tokens.access_token, claims.sub);
      const role = groupRole(profile.groups, adminGroup, observerGroup);
      if (!role) return null;
      const name = [profile.preferred_username, profile.name, claims.sub].find((value) => typeof value === 'string' && value.trim());
      return { username: name.trim().slice(0, 40), role };
    }
  };
}

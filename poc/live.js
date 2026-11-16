const pendingPrintCommands = new Set();
const live = { phase: 'loading', page: 'home', username: '', pending: false, error: '', refreshError: false };
state.machines = [];
state.events = [];
state.users = [];

const problem = (code) => ({
  'oidc-failed': t('Connexion Pocket ID indisponible ou accès refusé. Vous pouvez utiliser un compte local.',
    'Pocket ID sign-in is unavailable or access was denied. You can use a local account.'),
  'notifications-invalid': t('Vérifiez les informations de connexion et les secrets.', 'Check connection settings and secrets.'),
  'ntfy-install-required': t('Installez d’abord le serveur ntfy interne.', 'Install the internal ntfy server first.'),
  'notifications-failed': t('Le serveur a refusé la notification ou ne répond pas.', 'The server rejected the notification or is unreachable.'),
  token: t('Jeton incorrect.', 'Invalid activation token.'),
  expired: t('Jeton expiré. Redémarrez FabCore pour en obtenir un nouveau.', 'Token expired. Restart FabCore for a new one.'),
  credentials: t('Vérifiez vos identifiants. À l’installation, le mot de passe doit contenir au moins 12 caractères.', 'Check your credentials. Setup requires a password of at least 12 characters.'),
  rate: t('Trop de tentatives. Réessayez dans une minute.', 'Too many attempts. Try again in a minute.'),
  installed: t('FabCore est déjà activé. Connectez-vous.', 'FabCore is already activated. Sign in.'),
  'machine-changed': t('La fiche a changé pendant le test. Rouvrez-la et réessayez.', 'The record changed during the test. Reopen it and try again.'),
  'discovery-network': t('Ce réseau local est indisponible.', 'This local network is unavailable.'),
  'discovery-busy': t('Un scan est déjà en cours.', 'A scan is already running.'),
  forbidden: t('Cette action est réservée à l’administrateur.', 'Only an administrator can perform this action.'),
  'command-busy': t('Une commande est déjà en cours sur cette imprimante.', 'A command is already in progress for this printer.'),
  'command-state': t('L’état actuel de l’imprimante ne permet pas cette commande.', 'The current printer state does not allow this command.'),
  'command-rejected': t('Moonraker a refusé la commande.', 'Moonraker rejected the command.'),
  'command-unconfirmed': t('État non confirmé. Vérifiez l’imprimante avant de réessayer.', 'State not confirmed. Check the printer before retrying.'),
  'observer-duplicate': t('Cet identifiant est déjà utilisé.', 'This username is already in use.'),
  'observer-limit': t('La limite de 16 observateurs est atteinte.', 'The limit of 16 observers has been reached.'),
  'probe-busy': t('Un test est déjà en cours. Réessayez dans quelques secondes.', 'A test is already running. Try again in a few seconds.'),
  'machine-invalid': t('Vérifiez le nom, l’adresse IPv4 privée et les identifiants de la machine.', 'Check the machine name, private IPv4 address and credentials.'),
  'machine-duplicate': t('Cette machine est déjà enregistrée.', 'This machine is already registered.'),
  'machine-limit': t('Le POC accepte jusqu’à huit machines.', 'This POC supports up to eight machines.'),
  'sign-in': t('Session expirée. Connectez-vous.', 'Your session expired. Sign in.')
})[code] || t('La requête a échoué. Réessayez.', 'The request failed. Try again.');

function liveIssue(issue) {
  return ({
    'cc1-discovery': t('CC1 introuvable par découverte locale. Vérifiez l’IP ou renseignez le MainboardID.', 'CC1 discovery failed. Check the IP or enter the MainboardID.'),
    'cc1-connection': t('FabCore ne peut pas joindre la CC1 sur le port 3030.', 'FabCore cannot reach the CC1 on port 3030.'),
    'cc1-report': t('Aucun état SDCP ne correspond à cette CC1. Vérifiez le MainboardID.', 'No SDCP status matches this CC1. Check the MainboardID.'),
    'elegoo-access': t('Accès CC2 refusé. Vérifiez le code LAN.', 'CC2 access denied. Check the LAN access code.'),
    'elegoo-info': t('Identité CC2 indisponible. Vérifiez l’adresse et le mode LAN uniquement.', 'CC2 identity unavailable. Check the address and LAN Only mode.'),
    'elegoo-identity': t('Cette adresse appartient à une autre imprimante.', 'This address belongs to another printer.'),
    'elegoo-register': t('La CC2 a refusé la session MQTT.', 'The CC2 rejected the MQTT session.'),
    'elegoo-report': t('Aucun état CC2 exploitable n’a été reçu.', 'No usable CC2 status was received.'),
    'elegoo-print': t('La CC2 signale une erreur de fabrication.', 'The CC2 reports a print error.'),
    'elegoo-connection': t('FabCore ne peut pas joindre la CC2. Vérifiez les ports locaux 80 et 1883 et le mode LAN uniquement.', 'FabCore cannot reach the CC2. Check local ports 80 and 1883 and LAN Only mode.'),
    'bambu-access': t('Accès MQTT refusé. Vérifiez le code d’accès LAN.', 'MQTT access denied. Check the LAN access code.'),
    'bambu-tls': t('Le certificat de la P2S ne correspond pas au numéro de série ou à l’autorité attendue.', 'The P2S certificate does not match the serial number or expected authority.'),
    'bambu-report': t('La P2S est connectée, mais aucun état exploitable n’a été reçu. Vérifiez le numéro de série et les réglages LAN.', 'The P2S connected but sent no usable status. Check its serial number and LAN settings.'),
    'bambu-print': t('La P2S signale une erreur de fabrication.', 'The P2S reports a print error.'),
    'bambu-connection': t('FabCore ne parvient pas à joindre la P2S sur le port MQTT 8883.', 'FabCore cannot reach the P2S on MQTT port 8883.'),
    access: t('Accès Moonraker refusé. Vérifiez la clé API ou l’autorisation réseau.', 'Moonraker access denied. Check the API key or network authorization.'),
    moonraker: t('Moonraker a renvoyé une erreur.', 'Moonraker returned an error.'),
    klippy: t('Klippy est indisponible ou en cours de démarrage.', 'Klippy is unavailable or starting.'),
    print_stats: t('Les informations de fabrication sont indisponibles.', 'Print information is unavailable.'),
    print: t('Klipper signale une erreur de fabrication.', 'Klipper reports a print error.'),
    connection: t('FabCore ne parvient pas à joindre Moonraker.', 'FabCore cannot reach Moonraker.')
  })[issue] || '';
}

async function api(path, data, cancel) {
  const timeout = AbortSignal.timeout(path === 'discovery' || path.startsWith('machines') || path.startsWith('notifications') ? 18000 : 5000);
  const signal = cancel ? AbortSignal.any([timeout, cancel]) : timeout;
  const response = await fetch('/api/' + path, data === undefined ? { signal } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal
  });
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(payload.error), { code: payload.error });
  return payload;
}

function liveNavigation() {
  return [
    ['home', t('Vue d’ensemble', 'Overview'), 'grid'],
    ['machines', t('Machines', 'Machines'), 'machine'],
    ['history', t('Activité récente', 'Recent activity'), 'activity']
  ].map(([id, title, glyph]) => btn('nav:' + id, title, glyph, '', live.page === id ? 'aria-current="page"' : '')).join('');
}

function credentialsPage() {
  if (live.phase === 'loading') return title(t('Connexion au serveur…', 'Connecting to server…'));
  if (live.phase === 'failed') return title(t('FabCore indisponible', 'FabCore unavailable')) +
    btn('retry', t('Réessayer', 'Try again'), 'activity', 'primary');
  const setup = live.phase === 'setup';
  return `<section class="setup">${title(setup?t('Première installation','First setup'):t('Connexion à FabCore','Sign in to FabCore'))}
    <form id="credentials" class="panel stack">
      ${setup?`<p>${t('Récupère le jeton dans le terminal de FabCore pour créer l’administrateur local.','Retrieve the token from the FabCore terminal to create the local administrator.')}</p>`:''}
      <div class="fields">
        ${setup?`<label>${t('Jeton d’activation','Activation token')}<input type="password" name="token" autocomplete="off" required maxlength="128"></label>`:''}
        <label>${t('Identifiant','Username')}<input name="username" maxlength="40" ${setup?'minlength="3"':''} autocomplete="username" required></label>
        <label>${t('Mot de passe','Password')}<input type="password" name="password" maxlength="128" ${setup?'minlength="12" autocomplete="new-password"':'autocomplete="current-password"'} required></label>
        ${setup?`<label>${t('Confirmer le mot de passe','Confirm password')}<input type="password" name="confirm" maxlength="128" autocomplete="new-password" required></label>`:''}
      </div>
      <p class="error" role="alert">${live.error?esc(problem(live.error)):''}</p>
      <div><button class="primary" type="submit">${setup?t('Activer FabCore','Activate FabCore'):t('Se connecter','Sign in')}</button></div>
    </form>
    ${!setup && live.oidcEnabled ? `<p><a href="/api/oidc/start">${t('Se connecter avec Pocket ID','Sign in with Pocket ID')}</a></p>` : ''}
    </section>`;
}

function liveFleet() {
  const list = state.machines;
  return title(t('Machines','Machines'), t('Parc de machines.','Machine fleet.'), state.role === 'viewer' ? '' : btn('add',t('Ajouter une machine','Add machine'),'plus','primary')) +
    (list.length ? `<div class="cards">${list.map(card).join('')}</div>` :
      `<p class="notice">${t('Ajoute une adresse Moonraker pour commencer.','Add a Moonraker address to get started.')}</p>`);
}

function liveTelemetry(m) {
  const translatableTime = m.checkedAt ? new Date(m.checkedAt).toLocaleTimeString(state.lang) : '—';
  const canManage = state.role === 'admin';
  const action = m.kind === 'klipper' && (m.status === 'printing' ? 'pause' : m.status === 'paused' ? 'resume' : null);
  const controls = canManage && action ? btn('print-command:' + action,
    action === 'pause' ? t('Mettre en pause','Pause print') : t('Reprendre','Resume print'),
    '', 'primary', pendingPrintCommands.has(m.id) ? 'disabled' : '') : '';
  return `<section class="panel stack">
      <div class="row between wrap"><h2>${t('Fabrication','Print job')}</h2><div class="row wrap">${badge(m.status)}${controls}${canManage ? btn('edit',t('Modifier la machine','Edit machine')) : ''}</div></div>
      ${m.issue?`<p class="notice">${liveIssue(m.issue)}</p>`:''}
      <div class="row between"><span>${esc(m.file)||t('Aucun fichier en cours','No active file')}</span><strong>${m.progress} %</strong></div>
      <progress value="${m.progress}" max="100" aria-label="${t('Progression','Progress')}"></progress>
      <small>${t('Dernière vérification','Last check')} · <span id="last-check">${esc(translatableTime)}</span></small>
    </section><section class="panel stack">
      <h2>${t('Télémétrie','Telemetry')}</h2>
      <div class="row between"><span>${t('Buse','Nozzle')}</span><strong>${m.nozzle===null?'—':m.nozzle+' °C'}</strong></div>
      <div class="row between"><span>${t('Plateau','Bed')}</span><strong>${m.bed===null?'—':m.bed+' °C'}</strong></div>
    </section>`;
}

function liveDetail() {
  const m = machine(state.machine);
  if (!m) return liveFleet();
  const camera = ['bambu', 'elegoo', 'elegoo-cc1'].includes(m.kind)
    ? `<section class="panel stack" style="margin-top:1rem" data-camera-panel>
      <style>[data-camera-panel] [hidden]{display:none!important}</style>
      <h2>${t('Caméra en direct','Live camera')}</h2>
      <div data-live-camera></div>
      <p data-camera-status role="status" hidden></p>
      <div class="row wrap">${btn('camera-start',t('Ouvrir le flux','Open stream'))}
      ${btn('camera-stop',t('Fermer le flux','Close stream'),'','','hidden')}</div>
    </section>` : '';
  return title(esc(m.name), esc(m.model + ' · ' + m.origin), btn('nav:machines',t('Retour au parc','Back to fleet'),'grid','ghost')) +
    `<div class="main-grid" data-live-telemetry>${liveTelemetry(m)}</div>${camera}`;
}

function showCamera(open, failed = false) {
  const camera = app.querySelector('[data-live-camera]');
  const m = machine(state.machine);
  if (!camera || !m) return;
  const status = app.querySelector('[data-camera-status]');
  const start = app.querySelector('[data-action="camera-start"]');
  const stop = app.querySelector('[data-action="camera-stop"]');
  camera.querySelector('img')?.removeAttribute('src');
  camera.replaceChildren();
  status.textContent = failed
    ? t('Flux indisponible. Vérifiez la caméra de cette imprimante, puis réessayez.',
        'Stream unavailable. Check this printer’s camera, then retry.') : '';
  status.hidden = !failed;
  start.hidden = open;
  stop.hidden = !open;
  if (!open) {
    start.focus();
    return;
  }
  const image = document.createElement('img');
  image.alt = t('Vue en direct de ', 'Live view of ') + m.name;
  image.style.cssText = 'display:block;width:100%;max-width:850px;border-radius:12px';
  image.addEventListener('error', () => {
    if (image.isConnected) showCamera(false, true);
  }, { once: true });
  camera.append(image);
  image.src = '/api/machines/' + encodeURIComponent(m.id) + '/camera';
  stop.focus();
}

function notificationPage() {
  const settings = live.notifications;
  if (!settings) return title(t('Notifications', 'Notifications')) +
    `<p role="status">${esc(live.notificationError || t('Chargement…', 'Loading…'))}</p>`;
  const { ntfy, smtp, internal } = settings;
  const opt = (value, label, selected) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`;
  const input = (name, label, value = '', type = 'text') => `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${type === 'password' ? 'autocomplete="new-password"' : ''}></label>`;
  return title(t('Notifications','Notifications'), t('Configurez les canaux, enregistrez puis envoyez un test.', 'Configure the channels, save, then send a test.')) +
    `<style>#notifications-settings [hidden]{display:none!important}</style><form id="notifications-settings" class="stack" novalidate>
      <section class="panel stack"><h2>ntfy</h2>
        <label>${t('Serveur ntfy','ntfy server')}<select name="ntfyMode">
          ${opt('off',t('Configurer plus tard','Configure later'),ntfy.mode)}
          ${opt('internal',t('Serveur interne (sur cet hôte)','Internal server (this host)'),ntfy.mode)}
          ${opt('external',t('Serveur existant','Existing server'),ntfy.mode)}
        </select></label>
        <div data-ntfy-internal ${ntfy.mode !== 'internal' ? 'hidden' : ''}>
          ${internal ? `<p>${t('Sujet','Topic')} · ${esc(internal.topic)}</p>` :
            `<p class="notice">${t('Depuis le serveur FabCore, lancez','On the FabCore host, run')} <code>sudo bash scripts/install-ntfy.sh</code> ${t('puis rouvrez cette page.', 'then reopen this page.')}</p>`}
        </div>
        <fieldset class="fields" data-ntfy-external ${ntfy.mode !== 'external' ? 'hidden' : ''}>
          ${input('ntfyUrl',t('URL HTTPS du serveur','Server HTTPS URL'),ntfy.url,'url')}
          ${input('ntfyTopic',t('Sujet','Topic'),ntfy.topic)}
          <label>${t('Authentification','Authentication')}<select name="ntfyAuth">
            ${opt('none',t('Aucune','None'),ntfy.auth ?? 'none')}
            ${opt('bearer',t('Jeton d’accès','Access token'),ntfy.auth)}
            ${opt('basic',t('Identifiant et mot de passe','Username and password'),ntfy.auth)}
          </select></label>
          ${input('ntfyUsername',t('Identifiant (mode mot de passe)','Username (password mode)'),ntfy.username)}
          ${input('ntfySecret',t('Jeton ou mot de passe','Token or password'),'','password')}
        </fieldset>
        <div>${btn('notify-test:ntfy', t('Envoyer un test ntfy','Send ntfy test'), '', '', ntfy.mode === 'off' ? 'disabled' : '')}</div>
      </section>
      <section class="panel stack"><h2>SMTP</h2>
        <label class="check"><input type="checkbox" name="smtpEnabled" ${smtp.enabled ? 'checked' : ''}> ${t('Activer les e-mails','Enable email')}</label>
        <fieldset class="fields" data-smtp-config ${!smtp.enabled ? 'hidden' : ''}>
          ${input('smtpHost',t('Serveur SMTP','SMTP server'),smtp.host)}
          ${input('smtpPort',t('Port','Port'),smtp.port ?? '587','number')}
          <label>${t('Chiffrement','Encryption')}<select name="smtpTls">${opt('starttls','STARTTLS',smtp.tls ?? 'starttls')}${opt('tls','TLS',smtp.tls)}</select></label>
          ${input('smtpFrom',t('Adresse d’expédition','Sender address'),smtp.from,'email')}
          ${input('smtpTo',t('Adresse de réception','Recipient address'),smtp.to,'email')}
          <label class="check"><input type="checkbox" name="smtpAuth" ${smtp.auth ? 'checked' : ''}> ${t('Authentification SMTP','SMTP authentication')}</label>
          ${input('smtpUsername',t('Identifiant','Username'),smtp.username)}
          ${input('smtpSecret',t('Mot de passe','Password'),'','password')}
        </fieldset>
        <div>${btn('notify-test:smtp', t('Envoyer un e-mail de test','Send test email'), '', '', smtp.enabled ? '' : 'disabled')}</div>
      </section>
      <small>${t('Laissez un secret vide pour le conserver lorsque les paramètres de connexion restent identiques.', 'Leave a secret blank to keep it when connection settings stay the same.')}</small>
      <p class="error" role="alert"></p>
      <div class="row wrap"><button type="submit" class="primary">${t('Enregistrer','Save')}</button>
      ${btn('nav:home',t('Retour à la vue d’ensemble','Back to overview'))}</div>
    </form>`;
}

async function openNotifications() {
  if (state.role !== 'admin') return;
  live.page = 'notifications';
  live.notifications = null;
  live.notificationError = '';
  renderLive();
  try { live.notifications = await api('notifications'); }
  catch (error) { live.notificationError = problem(error.code); }
  if (live.page === 'notifications') renderLive();
}

function renderLive() {
  app.querySelector('[data-live-camera] img')?.removeAttribute('src');
  document.documentElement.lang = state.lang;
  document.documentElement.dataset.theme = state.theme === 'system' ? (media.matches ? 'light' : 'dark') : state.theme;
  const signedIn = live.phase === 'workshop';
  const screens = { notifications: notificationPage, home: dashboard, machines: liveFleet, detail: liveDetail, history: () =>
    title(t('Activité récente','Recent activity')) + `<section class="panel">${listEvents()}</section>` };
  app.innerHTML = `<a class="skip" href="#content">${t('Aller au contenu','Skip to content')}</a><div class="${signedIn?'layout':''}">
    ${signedIn?`<aside class="sidebar">${brand()}<nav aria-label="${t('Navigation principale','Main navigation')}">${liveNavigation()}</nav><div class="sidefoot"><small class="signal">POC${state.role === 'viewer' ? ' · ' + t('Observateur','Observer') : ''}</small></div></aside>`:''}
    <div><header class="top"><div class="crumb">${signedIn?`<span>${esc(live.username)}</span>`:brand()}</div><div class="row wrap">
      ${btn('lang',state.lang==='fr'?'EN':'FR','','ghost',`aria-label="${state.lang==='fr'?'Switch to English':'Passer en français'}"`)}
      ${btn('theme','','sun','ghost',`aria-label="${t('Basculer le thème','Toggle theme')}"`)}
      ${signedIn && state.role === 'admin' ? btn('notifications',t('Notifications','Notifications')) : ''}
      ${signedIn && state.role === 'admin' ? btn('observer',t('Ajouter un observateur','Add observer')) : ''}
      ${signedIn?btn('logout',t('Déconnexion','Sign out'),'','ghost'):''}
    </div></header><main id="content" class="area" tabindex="-1">
      ${live.refreshError?`<p class="notice" role="status">${t('Actualisation indisponible. Les données affichées datent de la dernière réponse.','Refresh unavailable. Showing the last response.')}</p>`:''}
      ${signedIn?screens[live.page]():credentialsPage()}
    </main></div></div>
    ${signedIn?`<nav class="mobile" style="grid-template-columns:repeat(3,1fr)" aria-label="${t('Navigation mobile','Mobile navigation')}">${liveNavigation()}</nav>`:''}`;
}

const statusLabels = {
  ready: ['Disponible','Ready'], printing: ['En fabrication','Printing'], paused: ['En pause','Paused'],
  done: ['Terminée','Completed'], error: ['Erreur','Error'], offline: ['Hors ligne','Offline'],
  connecting: ['Connexion…','Connecting…']
};
let telemetryTimer;
async function refresh() {
  if (live.pending || live.phase !== 'workshop') return;
  live.pending = true;
  try {
    const { machines } = await api('machines');
    if (live.phase !== 'workshop') return;
    const hadRefreshError = live.refreshError;
    live.refreshError = false;
    const previous = new Map(state.machines.map(machine => [machine.id, machine]));
    for (const m of machines) {
      const before = previous.get(m.id);
      if (!m.checkedAt || before?.status === m.status) continue;
      state.events.unshift({
        id: m.id, kind: ['error','offline'].includes(m.status)?'error':'info',
        fr: statusLabels[m.status][0], en: statusLabels[m.status][1],
        time: new Date(m.checkedAt).toLocaleTimeString(state.lang)
      });
    }
    state.events = state.events.slice(0, 30);
    const compare = (items) => JSON.stringify(items.map(({ checkedAt, cameraOpen, ...m }) => m));
    const changed = compare(machines) !== compare(state.machines);
    state.machines = machines;
    const timestamp = live.page === 'detail' && app.querySelector('#last-check');
    const current = machine(state.machine);
    const cameraImage = app.querySelector('[data-live-camera] img');
    if (cameraImage && current?.cameraOpen) cameraImage.dataset.streamOpened = 'true';
    if (cameraImage?.dataset.streamOpened && !current?.cameraOpen) showCamera(false, true);
    const checkedAt = current?.checkedAt;
    if (timestamp && checkedAt) timestamp.textContent = new Date(checkedAt).toLocaleTimeString(state.lang);
    if ((changed || hadRefreshError) && !dialog.open && live.page !== 'notifications') {
      const action = document.activeElement?.dataset.action;
      const telemetry = app.querySelector('[data-live-telemetry]');
      if (!hadRefreshError && telemetry && current && (cameraImage || app.querySelector('[data-camera-status]:not([hidden])'))) {
        telemetry.innerHTML = liveTelemetry(current);
      } else renderLive();
      if (action) [...app.querySelectorAll('[data-action]')].find(button => button.dataset.action === action && button.getClientRects().length)?.focus();
    }
  } catch (error) {
    if (live.phase !== 'workshop') return;
    if (error.code === 'sign-in') {
      if (dialog.open) dialog.close();
      clearInterval(telemetryTimer);
      live.phase = 'login';
      live.error = 'sign-in';
      renderLive();
    } else if (!live.refreshError) {
      live.refreshError = true;
      if (!dialog.open && live.page !== 'notifications') renderLive();
    }
  } finally {
    live.pending = false;
  }
}

function openWorkshop(username, role) {
  state.role = role === 'admin' ? 'admin' : 'viewer';
  live.username = username;
  live.phase = 'workshop';
  live.page = 'home';
  live.error = '';
  state.events = [];
  state.machines = [];
  renderLive();
  clearInterval(telemetryTimer);
  refresh();
  telemetryTimer = setInterval(refresh, 2000);
}

async function loadSession() {
  try {
    const session = await api('session');
    if (session.authenticated) return openWorkshop(session.username, session.role);
    live.phase = session.installed ? 'login' : 'setup';
    live.oidcEnabled = session.oidcEnabled;
    if (new URLSearchParams(location.search).get('auth') === 'oidc-failed') {
      live.error = 'oidc-failed';
      history.replaceState(null, '', '/');
    }
  } catch {
    live.phase = 'failed';
  }
  renderLive();
}

function openMachineForm(kind = 'klipper', name = '', existing = null, detected = null) {
  const isBambu = kind === 'bambu';
  const isElegoo = kind === 'elegoo';
  const isCC1 = kind === 'elegoo-cc1';
  dialog.innerHTML = `<form id="add-machine" class="stack" autocomplete="off">
    <h2>${existing ? t('Modifier une machine','Edit a machine') : t('Ajouter une machine','Add a machine')}</h2>
    ${existing ? `<input type="hidden" name="id" value="${esc(existing.id)}"><input type="hidden" name="kind" value="${kind}">` : ''}
    ${existing ? '' : btn('discover',t('Détecter sur le réseau','Discover on network'))}
    <div class="fields">
      ${existing ? '' : `<label>${t('Type de machine','Machine type')}<select name="kind"><option value="klipper" ${kind === 'klipper' ? 'selected' : ''}>Klipper · Moonraker</option><option value="bambu" ${isBambu ? 'selected' : ''}>Bambu Lab · P2S</option><option value="elegoo" ${isElegoo ? 'selected' : ''}>Elegoo · Centauri Carbon 2</option><option value="elegoo-cc1" ${isCC1 ? 'selected' : ''}>Elegoo · Centauri Carbon</option></select></label>`}
      <label>${t('Nom de la machine','Machine name')}<input name="name" required maxlength="80" value="${esc(name)}"></label>
      ${isBambu || isElegoo || isCC1 ? `
      <label>${t('Adresse IPv4 locale','Local IPv4 address')}<input name="host" placeholder="192.168.1.50" required maxlength="15" value="${existing ? esc(new URL(existing.origin).hostname) : esc(detected?.host ?? '')}"></label>
      ${isBambu ? `<label>${t('Numéro de série','Serial number')}<input name="serial" required maxlength="32" value="${esc(existing?.serial ?? detected?.serial ?? '')}"></label>` : ''}
      ${isCC1 && !existing ? `<label>${t('MainboardID (facultatif)', 'MainboardID (optional)')}<input name="serial" maxlength="64" value="${esc(detected?.serial ?? '')}"></label>` : ''}
      ${isCC1 ? '' : `<label>${t('Code d’accès LAN','LAN access code')}<input name="accessCode" type="password" ${existing ? '' : 'required'} minlength="${isBambu ? 8 : 1}" maxlength="${isBambu ? 8 : 64}" autocomplete="new-password"></label>`}
      ` : `
      <label>${t('Adresse Moonraker','Moonraker address')}<input name="origin" type="url" placeholder="http://192.168.1.50:7125" required maxlength="200" value="${esc(existing?.origin ?? detected?.origin ?? '')}"></label>
      <label>${t('Clé API Moonraker (facultative)','Moonraker API key (optional)')}<input name="apiKey" type="password" maxlength="256" autocomplete="new-password"></label>
      `}
    </div>
    ${existing && !isCC1 ? `<small>${t('Laissez le secret vide pour conserver la valeur enregistrée.', 'Leave the secret blank to keep the saved value.')}</small>` : ''}
    <p class="error" role="alert"></p>
    <p role="status" hidden></p>
    <div class="row wrap">${btn('close',t('Annuler','Cancel'))}<button type="submit" value="test">${t('Tester la connexion','Test connection')}</button><button class="primary" type="submit" value="save">${existing ? t('Enregistrer','Save') : t('Ajouter','Add')}</button></div>
  </form>`;
  if (!dialog.open) dialog.showModal();
}

let discoveryCancel;
let discoveredDevices = [];

async function openDiscovery() {
  discoveryCancel?.abort();
  discoveryCancel = new AbortController();
  const { signal } = discoveryCancel;
  discoveredDevices = [];
  dialog.innerHTML = `<form id="discover-machines" class="stack">
    <h2>${t('Détecter des machines','Discover machines')}</h2>
    <label>${t('Réseau local du serveur','Server local network')}<select name="network" required disabled></select></label>
    <div class="row wrap">${btn('add',t('Saisie manuelle','Enter manually'))}<button class="primary" type="submit" disabled>${t('Lancer le scan','Start scan')}</button></div>
    <p role="status">${t('Chargement des réseaux…','Loading networks…')}</p>
    <div class="stack" data-discovery-results></div>
  </form>`;
  const form = dialog.querySelector('form');
  const status = form.querySelector('[role="status"]');
  try {
    const { networks } = await api('discovery', undefined, signal);
    if (signal.aborted) return;
    form.elements.network.innerHTML = networks.map((network) => `<option>${esc(network)}</option>`).join('');
    form.elements.network.disabled = !networks.length;
    form.querySelector('button[type="submit"]').disabled = !networks.length;
    status.textContent = networks.length ? '' : t('Aucun réseau local disponible.', 'No local network available.');
  } catch (error) {
    if (!signal.aborted) status.textContent = problem(error.code);
  }
}

async function scanFromForm(form) {
  const { signal } = discoveryCancel;
  const status = form.querySelector('[role="status"]');
  const results = form.querySelector('[data-discovery-results]');
  const submit = form.querySelector('button[type="submit"]');
  const network = form.elements.network.value;
  submit.disabled = form.elements.network.disabled = true;
  results.replaceChildren();
  status.textContent = t('Recherche en cours…','Scanning…');
  try {
    const { devices } = await api('discovery', { network }, signal);
    if (signal.aborted) return;
    discoveredDevices = devices;
    status.textContent = devices.length ? t('Choisissez une machine à ajouter.', 'Choose a machine to add.')
      : t('Aucune machine identifiée. L’ajout manuel reste disponible.', 'No printer identified. You can still add it manually.');
    const models = { klipper: 'Klipper · Moonraker', bambu: 'Bambu Lab · P2S', elegoo: 'Elegoo · Centauri Carbon 2', 'elegoo-cc1': 'Elegoo · Centauri Carbon' };
    results.innerHTML = devices.map((device, index) => `<div class="row between wrap"><span>${esc(models[device.kind])} · ${esc(device.host)}</span>
      ${device.registered ? `<small>${t('Déjà ajoutée','Already added')}</small>`
        : btn('detected:' + index, t('Configurer','Configure'))}</div>`).join('');
  } catch (error) {
    if (!signal.aborted) status.textContent = problem(error.code);
  } finally {
    submit.disabled = form.elements.network.disabled = false;
  }
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action], a.brand');
  if (!target) return;
  if (target.matches('a.brand')) {
    event.preventDefault();
    if (live.phase === 'workshop') {
      live.page = 'home';
      renderLive();
    }
    return;
  }
  const [action, value] = target.dataset.action.split(':');
  if (action === 'close') dialog.close();
  if (action === 'retry') loadSession();
  if (action === 'lang') {
    state.lang = state.lang === 'fr' ? 'en' : 'fr';
    save('fabcore-lang', state.lang);
    renderLive();
  }
  if (action === 'theme') {
    state.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    save('fabcore-theme', state.theme);
    renderLive();
  }
  if (live.phase !== 'workshop') return;
  if (action === 'nav') {
    live.page = value;
    renderLive();
    app.querySelector('h1')?.focus();
  }
  if (action === 'machine') {
    live.page = 'detail';
    state.machine = value;
    renderLive();
    app.querySelector('h1')?.focus();
  }
  if (action === 'notifications') openNotifications();
  if (action === 'notify-test' && state.role === 'admin') {
    target.disabled = true;
    try {
      await api('notifications/test', { channel: value });
      toast(t('Notification de test acceptée par le serveur.', 'Test notification accepted by the server.'));
    } catch (error) { toast(problem(error.code)); }
    finally { target.disabled = false; }
  }
  if (action === 'observer' && state.role === 'admin') {
    dialog.innerHTML = `<form id="add-observer" class="stack">
      <h2>${t('Ajouter un observateur','Add observer')}</h2>
      <label>${t('Identifiant','Username')}<input name="username" minlength="3" maxlength="40" required autocomplete="off"></label>
      <label>${t('Mot de passe','Password')}<input name="password" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></label>
      <p class="error" role="alert"></p>
      <div class="row wrap">${btn('close',t('Annuler','Cancel'))}<button class="primary" type="submit">${t('Créer le compte','Create account')}</button></div>
    </form>`;
    dialog.showModal();
  }
  if (action === 'print-command' && state.role === 'admin') {
    const current = machine(state.machine);
    if (!current || pendingPrintCommands.has(current.id)) return;
    if (value === 'resume' && !window.confirm(t('Reprendre l’impression sur ', 'Resume the print on ') + current.name + ' ?')) return;
    pendingPrintCommands.add(current.id);
    target.disabled = true;
    try {
      const result = await api('machines/' + current.id + '/command', { action: value });
      toast(result.status === 'paused' ? t('Impression en pause.','Print paused.') : t('Impression reprise.','Print resumed.'));
    } catch (error) {
      toast(problem(error.code ?? 'command-unconfirmed'));
    } finally {
      pendingPrintCommands.delete(current.id);
      target.disabled = false;
      await refresh();
      if (live.page === 'detail' && state.machine === current.id) {
        const commandButton = app.querySelector('[data-action^="print-command:"]');
        if (commandButton) commandButton.disabled = false;
      }
    }
  }
  if (action === 'add' && state.role === 'admin') {
    discoveryCancel?.abort();
    openMachineForm();
  }
  if (action === 'discover') openDiscovery();
  if (action === 'camera-start') showCamera(true);
  if (action === 'camera-stop') showCamera(false);
  if (action === 'detected') {
    const detected = discoveredDevices[Number(value)];
    if (detected && !detected.registered) openMachineForm(detected.kind, '', null, detected);
  }
  if (action === 'edit') {
    const current = machine(state.machine);
    if (current) openMachineForm(current.kind, current.name, current);
  }
  if (action === 'logout') {
    try {
      await api('logout', {});
      clearInterval(telemetryTimer);
      live.phase = 'login';
      live.refreshError = false;
      state.machines = [];
      state.events = [];
      await loadSession();
    } catch (error) {
      toast(problem(error.code));
    }
  }
});

dialog.addEventListener('input', (event) => {
  const status = event.target.form?.querySelector('[role="status"]');
  if (status) status.hidden = true;
});

dialog.addEventListener('change', (event) => {
  if (!event.target.matches('#add-machine select[name="kind"]')) return;
  openMachineForm(event.target.value, event.target.form.elements.name.value);
  dialog.querySelector('select[name="kind"]').focus();
});

document.addEventListener('input', (event) => {
  const form = event.target.form;
  if (form?.id !== 'notifications-settings') return;
  const { ntfyMode, smtpEnabled } = form.elements;
  form.querySelector('[data-ntfy-internal]').hidden = ntfyMode.value !== 'internal';
  form.querySelector('[data-ntfy-external]').hidden = ntfyMode.value !== 'external';
  form.querySelector('[data-smtp-config]').hidden = !smtpEnabled.checked;
  for (const button of form.querySelectorAll('[data-action^="notify-test:"]')) button.disabled = true;
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (form.id === 'notifications-settings') {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const submit = form.querySelector('button[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      live.notifications = await api('notifications', {
        ntfy: { mode: data.ntfyMode, url: data.ntfyUrl, topic: data.ntfyTopic, auth: data.ntfyAuth,
          username: data.ntfyUsername, secret: data.ntfySecret },
        smtp: { enabled: Boolean(data.smtpEnabled), host: data.smtpHost, port: data.smtpPort, tls: data.smtpTls,
          from: data.smtpFrom, to: data.smtpTo, auth: Boolean(data.smtpAuth), username: data.smtpUsername, secret: data.smtpSecret }
      });
      if (live.page === 'notifications') renderLive();
      toast(t('Réglages enregistrés.', 'Settings saved.'));
    } catch (error) { form.querySelector('.error').textContent = problem(error.code); }
    finally { submit.disabled = false; }
    return;
  }
  if (form.id === 'discover-machines') {
    event.preventDefault();
    if (!form.querySelector('button[type="submit"]').disabled) await scanFromForm(form);
    return;
  }
  if (!['credentials','add-machine','add-observer'].includes(form.id)) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const errorText = form.querySelector('.error');
  if (live.phase === 'setup' && data.password !== data.confirm) {
    errorText.textContent = t('Les mots de passe diffèrent.','Passwords do not match.');
    return;
  }
  delete data.confirm;
  const controls = [...form.elements].filter((element) => !element.disabled);
  controls.forEach((element) => { element.disabled = true; });
  errorText.textContent = '';
  try {
    if (form.id === 'add-observer') {
      await api('observers', data);
      dialog.close();
      toast(t('Compte observateur créé.','Observer account created.'));
    } else if (form.id === 'add-machine') {
      if (event.submitter?.value === 'test') {
        const status = form.querySelector('[role="status"]');
        status.hidden = false;
        status.textContent = t('Test en cours…', 'Testing connection…');
        const result = await api('machines/test', data);
        status.hidden = !result.ok;
        status.textContent = result.ok ? t('Connexion réussie. Télémétrie reçue.', 'Connection successful. Telemetry received.') : '';
        if (!result.ok) errorText.textContent = liveIssue(result.issue) || problem(result.issue);
        return;
      }
      const { id } = await api(data.id ? 'machines/edit' : 'machines', data);
      dialog.close();
      live.page = 'machines';
      renderLive();
      await refresh();
      if (machine(id)) {
        state.machine = id;
        live.page = 'detail';
        renderLive();
      }
      toast(t('Machine enregistrée.','Machine registered.'));
    } else {
      const setup = live.phase === 'setup';
      const result = await api(setup ? 'setup' : 'login', data);
      openWorkshop(result.username, result.role);
      if (setup) await openNotifications();
    }
  } catch (error) {
    if (error.code === 'installed') {
      live.phase = 'login';
      live.error = 'installed';
      renderLive();
    } else {
      const status = form.querySelector('[role="status"]');
      if (status) status.hidden = true;
      errorText.textContent = liveIssue(error.code) || problem(error.code);
    }
  } finally {
    controls.forEach((element) => { element.disabled = false; });
  }
});

dialog.addEventListener('close', () => {
  discoveryCancel?.abort();
  dialog.innerHTML = '';
  if (live.phase === 'workshop') renderLive();
});
renderLive();
loadSession();

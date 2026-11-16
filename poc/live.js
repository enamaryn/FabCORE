const live = { phase: 'loading', page: 'home', username: '', pending: false, error: '', refreshError: false };
state.machines = [];
state.events = [];
state.users = [];

const problem = (code) => ({
  token: t('Jeton incorrect.', 'Invalid activation token.'),
  expired: t('Jeton expiré. Redémarrez FabCore pour en obtenir un nouveau.', 'Token expired. Restart FabCore for a new one.'),
  credentials: t('Vérifiez vos identifiants. À l’installation, le mot de passe doit contenir au moins 12 caractères.', 'Check your credentials. Setup requires a password of at least 12 characters.'),
  rate: t('Trop de tentatives. Réessayez dans une minute.', 'Too many attempts. Try again in a minute.'),
  installed: t('FabCore est déjà activé. Connectez-vous.', 'FabCore is already activated. Sign in.'),
  'machine-invalid': t('Indiquez un nom, une URL Moonraker sur une IPv4 privée et une clé API valide si nécessaire.', 'Enter a name, a Moonraker URL on a private IPv4 address, and a valid API key if required.'),
  'machine-duplicate': t('Cette adresse Moonraker est déjà enregistrée.', 'This Moonraker address is already registered.'),
  'machine-limit': t('Le POC accepte jusqu’à huit machines.', 'This POC supports up to eight machines.'),
  'sign-in': t('Session expirée. Connectez-vous.', 'Your session expired. Sign in.')
})[code] || t('La requête a échoué. Réessayez.', 'The request failed. Try again.');

function liveIssue(issue) {
  return ({
    access: t('Accès Moonraker refusé. Vérifiez la clé API ou l’autorisation réseau.', 'Moonraker access denied. Check the API key or network authorization.'),
    moonraker: t('Moonraker a renvoyé une erreur.', 'Moonraker returned an error.'),
    klippy: t('Klippy est indisponible ou en cours de démarrage.', 'Klippy is unavailable or starting.'),
    print_stats: t('Les informations de fabrication sont indisponibles.', 'Print information is unavailable.'),
    print: t('Klipper signale une erreur de fabrication.', 'Klipper reports a print error.'),
    connection: t('FabCore ne parvient pas à joindre Moonraker.', 'FabCore cannot reach Moonraker.')
  })[issue] || '';
}

async function api(path, data) {
  const response = await fetch('/api/' + path, data === undefined ? { signal: AbortSignal.timeout(5000) } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(5000)
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
    </form></section>`;
}

function liveFleet() {
  const list = state.machines;
  return title(t('Machines','Machines'), t('Parc Klipper en lecture seule.','Read-only Klipper fleet.'), btn('add',t('Ajouter une machine','Add machine'),'plus','primary')) +
    (list.length ? `<div class="cards">${list.map(card).join('')}</div>` :
      `<p class="notice">${t('Ajoute une adresse Moonraker pour commencer.','Add a Moonraker address to get started.')}</p>`);
}

function liveDetail() {
  const m = machine(state.machine);
  if (!m) return liveFleet();
  const translatableTime = m.checkedAt ? new Date(m.checkedAt).toLocaleTimeString(state.lang) : '—';
  return title(esc(m.name), esc(m.model + ' · ' + m.origin), btn('nav:machines',t('Retour au parc','Back to fleet'),'grid','ghost')) +
    `<div class="main-grid"><section class="panel stack">
      <div class="row between wrap"><h2>${t('Fabrication','Print job')}</h2>${badge(m.status)}</div>
      ${m.issue?`<p class="notice">${liveIssue(m.issue)}</p>`:''}
      <div class="row between"><span>${esc(m.file)||t('Aucun fichier en cours','No active file')}</span><strong>${m.progress} %</strong></div>
      <progress value="${m.progress}" max="100" aria-label="${t('Progression','Progress')}"></progress>
      <small>${t('Dernière vérification','Last check')} · <span id="last-check">${esc(translatableTime)}</span></small>
    </section><section class="panel stack">
      <h2>${t('Télémétrie','Telemetry')}</h2>
      <div class="row between"><span>${t('Buse','Nozzle')}</span><strong>${m.nozzle===null?'—':m.nozzle+' °C'}</strong></div>
      <div class="row between"><span>${t('Plateau','Bed')}</span><strong>${m.bed===null?'—':m.bed+' °C'}</strong></div>
    </section></div>`;
}

function renderLive() {
  document.documentElement.lang = state.lang;
  document.documentElement.dataset.theme = state.theme === 'system' ? (media.matches ? 'light' : 'dark') : state.theme;
  const signedIn = live.phase === 'workshop';
  const screens = { home: dashboard, machines: liveFleet, detail: liveDetail, history: () =>
    title(t('Activité récente','Recent activity')) + `<section class="panel">${listEvents()}</section>` };
  app.innerHTML = `<a class="skip" href="#content">${t('Aller au contenu','Skip to content')}</a><div class="${signedIn?'layout':''}">
    ${signedIn?`<aside class="sidebar">${brand()}<nav aria-label="${t('Navigation principale','Main navigation')}">${liveNavigation()}</nav><div class="sidefoot"><small class="signal">POC · ${t('Lecture seule','Read only')}</small></div></aside>`:''}
    <div><header class="top"><div class="crumb">${signedIn?`<span>${esc(live.username)}</span>`:brand()}</div><div class="row wrap">
      ${btn('lang',state.lang==='fr'?'EN':'FR','','ghost',`aria-label="${state.lang==='fr'?'Switch to English':'Passer en français'}"`)}
      ${btn('theme','','sun','ghost',`aria-label="${t('Basculer le thème','Toggle theme')}"`)}
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
    const compare = (items) => JSON.stringify(items.map(({ checkedAt, ...m }) => m));
    const changed = compare(machines) !== compare(state.machines);
    state.machines = machines;
    const timestamp = live.page === 'detail' && app.querySelector('#last-check');
    const checkedAt = machine(state.machine)?.checkedAt;
    if (timestamp && checkedAt) timestamp.textContent = new Date(checkedAt).toLocaleTimeString(state.lang);
    if ((changed || hadRefreshError) && !dialog.open) {
      const action = document.activeElement?.dataset.action;
      renderLive();
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
      if (!dialog.open) renderLive();
    }
  } finally {
    live.pending = false;
  }
}

function openWorkshop(username) {
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
    if (session.authenticated) return openWorkshop(session.username);
    live.phase = session.installed ? 'login' : 'setup';
  } catch {
    live.phase = 'failed';
  }
  renderLive();
}

function openMachineForm() {
  dialog.innerHTML = `<form id="add-klipper" class="stack" autocomplete="off">
    <h2>${t('Ajouter une machine Klipper','Add a Klipper machine')}</h2>
    <div class="fields">
      <label>${t('Nom de la machine','Machine name')}<input name="name" required maxlength="80"></label>
      <label>${t('Adresse Moonraker','Moonraker address')}<input name="origin" type="url" placeholder="http://192.168.1.50:7125" required maxlength="200"></label>
      <label>${t('Clé API Moonraker (facultative)','Moonraker API key (optional)')}<input name="apiKey" type="password" maxlength="256" autocomplete="new-password"></label>
    </div>
    <p class="error" role="alert"></p>
    <div class="row wrap">${btn('close',t('Annuler','Cancel'))}<button class="primary" type="submit">${t('Ajouter','Add')}</button></div>
  </form>`;
  dialog.showModal();
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
  if (action === 'add') openMachineForm();
  if (action === 'logout') {
    try {
      await api('logout', {});
      clearInterval(telemetryTimer);
      live.phase = 'login';
      live.refreshError = false;
      state.machines = [];
      state.events = [];
      renderLive();
    } catch (error) {
      toast(problem(error.code));
    }
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!['credentials','add-klipper'].includes(form.id)) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const errorText = form.querySelector('.error');
  if (live.phase === 'setup' && data.password !== data.confirm) {
    errorText.textContent = t('Les mots de passe diffèrent.','Passwords do not match.');
    return;
  }
  delete data.confirm;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    if (form.id === 'add-klipper') {
      const { id } = await api('machines', data);
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
      const result = await api(live.phase === 'setup' ? 'setup' : 'login', data);
      openWorkshop(result.username);
    }
  } catch (error) {
    if (error.code === 'installed') {
      live.phase = 'login';
      live.error = 'installed';
      renderLive();
    } else errorText.textContent = problem(error.code);
  } finally {
    submit.disabled = false;
  }
});

dialog.addEventListener('close', () => {
  dialog.innerHTML = '';
  if (live.phase === 'workshop') renderLive();
});
renderLive();
loadSession();

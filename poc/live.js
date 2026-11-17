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
    'prusalink-access': t('Accès refusé. Vérifiez la clé API PrusaLink.', 'Access denied. Check the PrusaLink API key.'),
    'prusalink-response': t('PrusaLink ne renvoie pas un état exploitable.', 'PrusaLink did not return usable status.'),
    'prusalink-connection': t('FabCore ne parvient pas à joindre PrusaLink.', 'FabCore cannot reach PrusaLink.'),
    'prusalink-printer-error': t('PrusaLink signale une erreur de l’imprimante.', 'PrusaLink reports a printer error.'),
    'octoprint-access': t('Accès refusé. Vérifiez la clé API OctoPrint et ses permissions.', 'Access denied. Check the OctoPrint API key and its permissions.'),
    'octoprint-response': t('L’API OctoPrint ne renvoie pas un état exploitable.', 'The OctoPrint API did not return usable status.'),
    'octoprint-connection': t('FabCore ne parvient pas à joindre OctoPrint.', 'FabCore cannot reach OctoPrint.'),
    'octoprint-disconnected': t('OctoPrint répond, mais l’imprimante est déconnectée.', 'OctoPrint is reachable, but the printer is disconnected.'),
    'octoprint-printer-error': t('OctoPrint signale une erreur de l’imprimante.', 'OctoPrint reports a printer error.'),
    'xtool-connection': t('FabCore ne peut pas joindre la M2 sur le port 28900.', 'FabCore cannot reach the M2 on port 28900.'),
    'xtool-protocol': t('La M2 n’a pas renvoyé un état compatible WS-V2.', 'The M2 did not return a compatible WS-V2 status.'),
    'xtool-identity': t('Le certificat ou le numéro de série de la M2 a changé.', 'The M2 certificate or serial number changed.'),
    'xtool-device': t('La M2 signale une erreur.', 'The M2 reports an error.'),
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

function diagnosticMessage(code) {
  return liveIssue(code) || ({
    started: t('FabCore a démarré.', 'FabCore started.'),
    'request-failed': t('Échec interne d’une requête.', 'An internal request failed.'),
    'connecting-mqtt': t('Tentative de connexion MQTT.', 'Attempting an MQTT connection.'),
    connected: t('Connexion au serveur MQTT établie.', 'Connected to the MQTT broker.'),
    registered: t('Session MQTT acceptée par l’imprimante.', 'MQTT session accepted by the printer.'),
    retry: t('Liaison MQTT fermée. Reconnexion prévue.', 'MQTT connection closed. A retry is scheduled.'),
    opening: t('Ouverture du flux.', 'Opening the stream.'),
    streaming: t('Première image reçue.', 'First image received.'),
    'no-stream': t('Aucune image reçue au démarrage du flux.', 'No image received when starting the stream.'),
    identity: t('L’identité de la machine n’a pas été confirmée.', 'The machine identity could not be confirmed.'),
    'invalid-stream': t('La caméra a renvoyé une réponse incompatible.', 'The camera returned an incompatible response.'),
    interrupted: t('Le flux a été interrompu.', 'The stream was interrupted.'),
    closed: t('Flux fermé.', 'Stream closed.')
  })[code] || t(...(statusLabels[code] ?? [code, code]));
}

function diagnosticsPage() {
  const data = live.diagnostics;
  const scope = live.diagnosticScope ?? '';
  const date = (at) => at ? new Date(at).toLocaleString(state.lang) : '—';
  const labels = {
    server: 'FabCore', mqtt: 'MQTT', camera: t('Caméra', 'Camera'), status: t('État', 'Status')
  };
  const header = title(t('Diagnostics', 'Diagnostics'), '', btn('diagnostics', t('Actualiser', 'Refresh'), 'activity'));
  if (!data) return header + '<p role="status">' +
    (live.diagnosticsError ? t('Journal indisponible.', 'The log is unavailable.') : t('Chargement…', 'Loading…')) + '</p>';
  const names = new Map(data.fleet.map(({ id, name }) => [id, name]));
  const selected = data.machines[scope];
  const events = data.events.filter(({ id }) => !scope || (scope === 'server' ? id === null : id === scope));
  return header + `<section class="panel stack">
    <small>${t('Jusqu’à 300 événements depuis le dernier démarrage.', 'Up to 300 events since the last startup.')}</small>
    <label>${t('Afficher les événements de', 'Show events for')}<select id="diagnostic-scope">
      <option value="">${t('Tout le parc et FabCore', 'All machines and FabCore')}</option>
      <option value="server" ${scope === 'server' ? 'selected' : ''}>FabCore</option>
      ${data.fleet.map(({ id, name }) => `<option value="${esc(id)}" ${id === scope ? 'selected' : ''}>${esc(name)}</option>`).join('')}
    </select></label>
    ${names.has(scope) ? `<div class="row wrap">
      <small>${t('Dernier rapport MQTT', 'Last MQTT report')} · ${esc(date(selected?.reportAt))}</small>
      <small>${t('Dernière image reçue', 'Last image received')} · ${esc(date(selected?.frameAt))}</small>
    </div>` : ''}
    ${events.map(({ at, area, code, id }) => `<div class="activity">
      <small>${esc(date(at))} · ${esc(names.get(id) ?? 'FabCore')} · ${esc(labels[area])}</small>
      <p>${esc(diagnosticMessage(code))}</p>
    </div>`).join('') || `<p>${t('Aucun événement.', 'No events.')}</p>`}
  </section>`;
}

async function openDiagnostics() {
  if (state.role !== 'admin' || live.diagnosticsPending) return;
  live.page = 'diagnostics';
  live.diagnosticsPending = true;
  live.diagnosticsError = false;
  renderLive();
  try {
    live.diagnostics = await api('diagnostics');
    if (live.diagnosticScope !== 'server' && !live.diagnostics.fleet.some(({ id }) => id === live.diagnosticScope)) {
      live.diagnosticScope = '';
    }
  } catch {
    live.diagnostics = null;
    live.diagnosticsError = true;
  } finally {
    live.diagnosticsPending = false;
    if (live.page === 'diagnostics') renderLive();
  }
}

app.addEventListener('change', (event) => {
  if (event.target.id !== 'diagnostic-scope') return;
  live.diagnosticScope = event.target.value;
  renderLive();
  app.querySelector('#diagnostic-scope')?.focus();
});

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

function liveFabrication(m) {
  const translatableTime = m.checkedAt ? new Date(m.checkedAt).toLocaleTimeString(state.lang) : '—';
  const canManage = state.role === 'admin';
  const action = machineConnectors[m.kind]?.commands && (m.status === 'printing' ? 'pause' : m.status === 'paused' ? 'resume' : null);
  const controls = canManage && action ? btn('print-command:' + action,
    action === 'pause' ? t('Mettre en pause','Pause print') : t('Reprendre','Resume print'),
    '', 'primary', pendingPrintCommands.has(m.id) ? 'disabled' : '') : '';
  return `<section class="panel stack">
      <div class="row between wrap"><h2>${t('Fabrication','Print job')}</h2><div class="row wrap">${badge(m.status)}${controls}</div></div>
      ${m.issue?`<p class="notice">${liveIssue(m.issue)}</p>`:''}
      ${machineConnectors[m.kind]?.printJob === false ? '' : `<div class="row between"><span>${esc(m.file)||t('Aucun fichier en cours','No active file')}</span><strong>${m.progress} %</strong></div>
      <progress value="${m.progress}" max="100" aria-label="${t('Progression','Progress')}"></progress>`}
      <small>${t('Dernière vérification','Last check')} · <span id="last-check">${esc(translatableTime)}</span></small>
    </section>`;
}

const temperatureHistory = new Map();
const temperatureWindow = 30 * 60_000;
const temperatureInterval = 10_000;

function recordTemperatures(machines) {
  for (const { id, checkedAt, nozzle, bed, status } of machines) {
    const at = Date.parse(checkedAt);
    if (!Number.isFinite(at) || ['offline', 'connecting'].includes(status) ||
        !(Number.isFinite(nozzle) || Number.isFinite(bed))) continue;
    const previous = temperatureHistory.get(id) ?? [];
    if (previous.length && at - previous.at(-1).at < temperatureInterval) continue;
    const samples = previous.filter(point => at - point.at <= temperatureWindow);
    samples.push({ at, nozzle, bed });
    temperatureHistory.set(id, samples);
  }
}

function temperaturePlot(machine) {
  const samples = temperatureHistory.get(machine.id) ?? [];
  if (!samples.length) return `<p>${t('En attente de températures.', 'Waiting for temperature readings.')}</p>`;
  const now = samples.at(-1).at;
  const start = Math.min(samples[0].at, now - temperatureInterval);
  const values = samples.flatMap(({ nozzle, bed }) => [nozzle, bed].filter(Number.isFinite));
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const step = [10, 20, 25, 50, 100].find(size => max - min <= size * 6)
    ?? Math.ceil((max - min) / 600) * 100;
  const low = Math.floor(min / step) * step;
  const high = Math.max(low + 3 * step, Math.ceil(max / step) * step);
  const x = at => 38 + (at - start) / (now - start) * 388;
  const y = degrees => 122 - (degrees - low) / (high - low) * 108;
  const point = (sample, key) => `${x(sample.at).toFixed(2)},${y(sample[key]).toFixed(2)}`;
  const time = at => new Date(at).toLocaleTimeString(state.lang, { hour: '2-digit', minute: '2-digit' });
  const series = [['nozzle', '#ea8a42'], ['bed', '#4aa9d6']];
  let hasGaps = false;
  const lines = series.map(([key, color]) => {
    let previous = null;
    let path = '';
    let gaps = '';
    for (const sample of samples) {
      if (!Number.isFinite(sample[key])) continue;
      if (previous && sample.at - previous.at > 25_000) {
        hasGaps = true;
        gaps += `M${point(previous, key)}L${point(sample, key)}`;
        path += `M${point(sample, key)}`;
      } else {
        path += (previous ? 'L' : 'M') + point(sample, key);
      }
      previous = sample;
    }
    const latest = samples.at(-1);
    return `<path d="${gaps}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="3 4" opacity=".55"/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${Number.isFinite(latest[key]) ? `<circle cx="${x(latest.at)}" cy="${y(latest[key])}" r="3" fill="${color}"/>` : ''}`;
  }).join('');
  return `<svg viewBox="0 0 438 146" width="100%" role="img" aria-label="${t('Historique des températures de la buse et du plateau en degrés Celsius', 'Nozzle and bed temperatures over time in degrees Celsius')}">
    ${Array.from({ length: Math.floor((high - low) / step) + 1 }, (_, index) => {
      const value = low + index * step;
      return `<line x1="38" x2="426" y1="${y(value)}" y2="${y(value)}" stroke="currentColor" opacity=".14"/>
      <text x="30" y="${y(value) + 3}" text-anchor="end" fill="currentColor" font-size="10">${Math.round(value)}°</text>`;
    }).join('')}
    ${lines}
    <text x="38" y="141" fill="currentColor" font-size="10">${esc(time(start))}</text>
    <text x="426" y="141" text-anchor="end" fill="currentColor" font-size="10">${esc(time(now))}</text>
  </svg>${hasGaps ? `<small class="muted">${t('Pointillés · relevés espacés', 'Dashed · gaps between readings')}</small>` : ''}`;
}

function temperatureReadings(machine) {
  return [['nozzle', '#ea8a42', t('Buse', 'Nozzle')], ['bed', '#4aa9d6', t('Plateau', 'Bed')]].map(([key, color, label]) =>
    `<div><span style="color:${color}" aria-hidden="true">●</span> ${label}
      <strong>${Number.isFinite(machine[key]) ? machine[key] + ' °C' : '—'}</strong></div>`
  ).join('');
}

function liveTemperatures(machine) {
  if (machineConnectors[machine.kind]?.temperatures === false) return '';
  return `<section class="panel stack machine-temperature">
    <h2>${t('Télémétrie','Telemetry')}</h2>
    <div class="machine-readings" data-temperature-readings>${temperatureReadings(machine)}</div>
    <div class="stack" data-temperature-plot>${temperaturePlot(machine)}</div>
  </section>`;
}

function liveFilaments(machine) {
  const system = machineConnectors[machine.kind]?.filaments;
  if (!system || machine.filaments?.length === 0) return '';
  const missing = t('Données des emplacements indisponibles.', 'Slot information is unavailable.');
  const units = machine.filaments?.map(({ id, variant, slots }) => {
    const unit = variant === 'ht' ? 'AMS HT ' + (id - 3) : system + ' ' + (id + 1);
    return `<div class="filament-module">
      ${machine.filaments.length > 1 ? `<h3>${unit}</h3>` : ''}
      <ul class="filament-rack" style="--slots:${slots.length}">
        ${slots.map((slot) => {
          const position = system === 'AMS' && !variant ? String.fromCharCode(65 + id) + (slot.id + 1) : String(slot.id + 1);
          const occupation = slot.occupied === null ? t('Inconnu', 'Unknown')
            : slot.occupied ? t('Chargé', 'Loaded') : t('Vide', 'Empty');
          const shade = /^#[A-Fa-f0-9]{6}$/.test(slot.color) ? slot.color : 'var(--dim)';
          const label = slot.name || slot.material || occupation;
          return `<li class="filament-slot" data-occupied="${slot.occupied}" data-active="${slot.active}" style="--filament:${esc(shade)}">
            <span class="filament-spool" aria-hidden="true"><i></i></span>
            <span class="filament-position" aria-label="${t('Emplacement', 'Slot')} ${position}">${position}</span>
            <small class="filament-material">${esc(label)}</small>
            ${slot.active ? `<small class="filament-active">${t('Actif', 'Active')}</small>` : ''}
          </li>`;
        }).join('')}
      </ul>
    </div>`;
  }).join('');
  return `<section class="panel stack">
    <style>
      .filament-module{display:grid;gap:.65rem}
      .filament-rack{display:grid;grid-template-columns:repeat(var(--slots),minmax(0,1fr));gap:.35rem;
        width:calc(var(--slots) * 3.2rem + .8rem);max-width:100%;margin:0;padding:.65rem;list-style:none;
        border:1px solid var(--line);border-radius:1rem;background:var(--bg)}
      .filament-slot{position:relative;min-width:0;display:grid;grid-template-rows:auto auto auto auto;
        align-items:center;justify-items:center;gap:.3rem;text-align:center}
      .filament-material,.filament-name{overflow-wrap:anywhere;line-height:1.1}
      .filament-material{font-size:clamp(.65rem,2vw,.9rem)}
      .filament-spool{position:relative;width:min(100%, 1.9rem);height:2.85rem;display:block}
      .filament-spool i{position:absolute;inset:7% 13%;border-radius:29% 22% 22% 29%;
        background:repeating-linear-gradient(90deg,transparent 0 2px,#0001 3px 4px),var(--filament);
        box-shadow:inset 0 5px 7px #fff2,inset 0 -6px 8px #0004}
      .filament-spool:before,.filament-spool:after{content:'';position:absolute;top:0;bottom:0;width:25%;border-radius:50%;background:#77838b}
      .filament-spool:before{left:4%;z-index:0}
      .filament-spool:after{right:4%;z-index:1;background:radial-gradient(ellipse at center,#243038 0 22%,#52616b 25% 35%,#a8b4bc 38% 72%,#65747e 76%)}
      .filament-slot[data-occupied=false] .filament-spool,.filament-slot[data-occupied=null] .filament-spool{border:1px dashed var(--line);border-radius:.65rem}
      .filament-slot:not([data-occupied=true]) .filament-spool i,
      .filament-slot:not([data-occupied=true]) .filament-spool:before,
      .filament-slot:not([data-occupied=true]) .filament-spool:after{display:none}
      .filament-position{font-weight:700;font-size:.77rem;padding:.1rem .35rem;border-radius:.35rem;background:var(--card)}
      .filament-slot[data-active=true] .filament-position{outline:2px solid var(--accent)}
      .filament-active{color:var(--accent);font-weight:700}
      .filament-slot[data-active=true]:after{content:'';position:absolute;height:.65rem;top:100%;border-left:2px solid var(--accent)}
    </style>
    <h2>${system}</h2>${units || `<p>${missing}</p>`}
  </section>`;
}

function liveDetail() {
  const m = machine(state.machine);
  if (!m) return liveFleet();
  const camera = machineConnectors[m.kind]?.camera
    ? `<section class="panel stack machine-camera" data-camera-panel>
      <style>[data-camera-panel] [hidden]{display:none!important}</style>
      <h2>${t('Caméra en direct','Live camera')}</h2>
      <div data-live-camera></div>
      <div class="machine-camera-idle" data-camera-placeholder>${icon('camera')}<p>${t('Flux fermé','Stream closed')}</p></div>
      <p data-camera-status role="status" hidden></p>
      <div class="row wrap">${btn('camera-start',t('Ouvrir le flux','Open stream'))}
      ${btn('camera-stop',t('Fermer le flux','Close stream'),'','','hidden')}</div>
    </section>` : '';
  const edit = state.role === 'admin' ? btn('edit',t('Modifier la machine','Edit machine')) : '';
  return title(esc(m.name), esc(m.model + ' · ' + m.origin), `<div class="row wrap">${btn('nav:machines',t('Retour au parc','Back to fleet'),'grid','ghost')}${edit}</div>`) +
    `<style>
      .machine-detail{display:grid;gap:1rem}
      .machine-detail-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}
      .machine-detail-row > *{min-width:0}
      .machine-detail-row > :only-child,.machine-detail-row > :first-child:has(+ :empty){grid-column:1/-1}
      .machine-detail-row > div:empty,.machine-detail-row:empty{display:none}
      .machine-detail-row > div > .panel{height:100%}
      .machine-temperature,.machine-camera{align-content:start}
      .machine-readings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem}
      .machine-readings strong{display:block;font-size:1.35rem;margin-top:.2rem}
      .machine-temperature [data-temperature-plot] svg{display:block;max-height:12rem}
      .machine-camera-idle{min-height:7rem;display:grid;justify-items:center;align-content:center;gap:.45rem;color:var(--dim)}
      .machine-camera-idle svg{width:2rem;height:2rem}
      @media(max-width:700px){.machine-detail-row{grid-template-columns:minmax(0,1fr)}}
    </style>
    <div class="machine-detail">
      <div class="machine-detail-row">${camera}${liveTemperatures(m)}</div>
      <div class="machine-detail-row"><div data-live-telemetry>${liveFabrication(m)}</div><div data-live-filaments>${liveFilaments(m)}</div></div>
    </div>`;
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
  app.querySelector('[data-camera-placeholder]').hidden = open || failed;
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
  const screens = { diagnostics: diagnosticsPage, notifications: notificationPage, home: dashboard, machines: liveFleet, detail: liveDetail, history: () =>
    title(t('Activité récente','Recent activity')) + `<section class="panel">${listEvents()}</section>` };
  app.innerHTML = `<a class="skip" href="#content">${t('Aller au contenu','Skip to content')}</a><div class="${signedIn?'layout':''}">
    ${signedIn?`<aside class="sidebar">${brand()}<nav aria-label="${t('Navigation principale','Main navigation')}">${liveNavigation()}</nav><div class="sidefoot"><small class="signal">POC${state.role === 'viewer' ? ' · ' + t('Observateur','Observer') : ''}</small></div></aside>`:''}
    <div><header class="top"><div class="crumb">${signedIn?`<span>${esc(live.username)}</span>`:brand()}</div><div class="row wrap">
      ${btn('lang',state.lang==='fr'?'EN':'FR','','ghost',`aria-label="${state.lang==='fr'?'Switch to English':'Passer en français'}"`)}
      ${btn('theme','','sun','ghost',`aria-label="${t('Basculer le thème','Toggle theme')}"`)}
      ${signedIn && state.role === 'admin' ? btn('diagnostics',t('Diagnostics','Diagnostics'),'activity') : ''}
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
let fleetRevision = 0;
async function refresh() {
  if (live.pending || live.phase !== 'workshop') return;
  live.pending = true;
  try {
    const revision = fleetRevision;
    const { machines } = await api('machines');
    if (live.phase !== 'workshop' || revision !== fleetRevision) return;
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
    recordTemperatures(machines);
    const timestamp = live.page === 'detail' && app.querySelector('#last-check');
    const current = machine(state.machine);
    const cameraImage = app.querySelector('[data-live-camera] img');
    if (cameraImage && current?.cameraOpen) cameraImage.dataset.streamOpened = 'true';
    if (cameraImage?.dataset.streamOpened && !current?.cameraOpen) showCamera(false, true);
    const plot = app.querySelector('[data-temperature-plot]');
    const newestSample = String(temperatureHistory.get(current?.id)?.at(-1)?.at ?? '');
    if (plot && current && plot.dataset.sample !== newestSample) {
      plot.innerHTML = temperaturePlot(current);
      plot.dataset.sample = newestSample;
    }
    const checkedAt = current?.checkedAt;
    if (timestamp && checkedAt) timestamp.textContent = new Date(checkedAt).toLocaleTimeString(state.lang);
    if ((changed || hadRefreshError) && !dialog.open && !['notifications', 'diagnostics'].includes(live.page)) {
      const action = document.activeElement?.dataset.action;
      const telemetry = app.querySelector('[data-live-telemetry]');
      if (!hadRefreshError && telemetry && current) {
        telemetry.innerHTML = liveFabrication(current);
        const readings = app.querySelector('[data-temperature-readings]');
        if (readings) readings.innerHTML = temperatureReadings(current);
        const filaments = app.querySelector('[data-live-filaments]');
        if (filaments) filaments.innerHTML = liveFilaments(current);
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
  temperatureHistory.clear();
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
  const connector = machineConnectors[kind] ?? machineConnectors.klipper;
  const { form, port, required } = connector;
  const isBambu = form === 'bambu';
  const isCC1 = form === 'elegoo-cc1';
  const isM2 = form === 'xtool-m2';
  const addressLabel = kind === 'klipper' ? 'Moonraker' : connector.model;
  dialog.innerHTML = `<form id="add-machine" class="stack" autocomplete="off">
    <h2>${existing ? t('Modifier une machine','Edit a machine') : t('Ajouter une machine','Add a machine')}</h2>
    ${existing ? `<input type="hidden" name="id" value="${esc(existing.id)}"><input type="hidden" name="kind" value="${kind}">` : ''}
    ${existing ? '' : btn('discover',t('Détecter sur le réseau','Discover on network'))}
    <div class="fields">
      ${existing ? '' : `<label>${t('Type de machine','Machine type')}<select name="kind">${Object.entries(machineConnectors).map(([id, entry]) =>
        `<option value="${esc(id)}" ${id === kind ? 'selected' : ''}>${esc(entry.model)}</option>`).join('')}</select></label>`}
      <label>${t('Nom de la machine','Machine name')}<input name="name" required maxlength="80" value="${esc(name)}"></label>
      ${form !== 'http' ? `
      <label>${t('Adresse IPv4 locale','Local IPv4 address')}<input name="host" placeholder="192.168.1.50" required maxlength="15" value="${existing ? esc(new URL(existing.origin).hostname) : esc(detected?.host ?? '')}"></label>
      ${isBambu ? `<label>${t('Numéro de série','Serial number')}<input name="serial" required maxlength="32" value="${esc(existing?.serial ?? detected?.serial ?? '')}"></label>` : ''}
      ${isCC1 && !existing ? `<label>${t('MainboardID (facultatif)', 'MainboardID (optional)')}<input name="serial" maxlength="64" value="${esc(detected?.serial ?? '')}"></label>` : ''}
      ${isCC1 || isM2 ? '' : `<label>${t('Code d’accès LAN','LAN access code')}<input name="accessCode" type="password" ${existing ? '' : 'required'} minlength="${isBambu ? 8 : 1}" maxlength="${isBambu ? 8 : 64}" autocomplete="new-password"></label>`}
      ` : `
      <label>${t('Adresse ', 'Address for ')}${esc(addressLabel)}<input name="origin" type="url" placeholder="http://192.168.1.50${port === 80 ? '' : ':' + port}" required maxlength="200" value="${esc(existing?.origin ?? detected?.origin ?? '')}"></label>
      <label>${t('Clé API', 'API key')}${required ? '' : ' ' + t('(facultative)', '(optional)')}<input name="apiKey" type="password" ${required && !existing ? 'required' : ''} maxlength="256" autocomplete="new-password"></label>
      `}
    </div>
    ${existing && !isCC1 && !isM2 ? `<small>${t('Laissez le secret vide pour conserver la valeur enregistrée.', 'Leave the secret blank to keep the saved value.')}</small>` : ''}
    <p class="error" role="alert"></p>
    <p role="status" hidden></p>
    <div class="row wrap">${existing ? `<button class="danger" type="button" data-action="delete-machine:${esc(existing.id)}">${t('Supprimer la machine', 'Delete machine')}</button>` : ''}${btn('close',t('Annuler','Cancel'))}<button type="submit" value="test">${t('Tester la connexion','Test connection')}</button><button class="primary" type="submit" value="save">${existing ? t('Enregistrer','Save') : t('Ajouter','Add')}</button></div>
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
    status.textContent = devices.some(device => !device.registered) ? t('Choisissez une machine à ajouter.', 'Choose a machine to add.')
      : devices.length ? '' : t('Aucune machine identifiée. L’ajout manuel reste disponible.', 'No printer identified. You can still add it manually.');
    results.innerHTML = devices.map((device, index) => `<div class="row between wrap"><span>${esc(device.name ?? machineConnectors[device.kind]?.model ?? device.kind)} · ${esc(device.host)}</span>
      ${device.registered ? `<small>${t('Déjà ajoutée','Already added')}${device.detected === false ? ' · ' + t('Non détectée par ce scan', 'Not detected in this scan') : ''}</small>`
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
  if (action === 'diagnostics') openDiagnostics();
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
  if (action === 'delete-machine' && state.role === 'admin') {
    const current = machine(value);
    if (!current || !window.confirm(t('Retirer cette machine de FabCore ?', 'Remove this machine from FabCore?') + '\n' + current.name)) return;
    const form = target.form;
    const controls = [...form.elements].filter(element => !element.disabled);
    controls.forEach(element => { element.disabled = true; });
    try {
      await api('machines/delete', { id: current.id });
      fleetRevision++;
      state.machines = state.machines.filter(({ id }) => id !== current.id);
      state.events = state.events.filter(({ id }) => id !== current.id);
      temperatureHistory.delete(current.id);
      state.machine = null;
      live.page = 'machines';
      dialog.close();
      renderLive();
      app.querySelector('h1')?.focus();
      toast(t('Machine supprimée.', 'Machine deleted.'));
    } catch (error) {
      form.querySelector('[role="alert"]').textContent = problem(error.code);
    } finally {
      controls.forEach(element => { element.disabled = false; });
    }
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
        status.textContent = result.ok ? liveIssue(result.issue) || t('Connexion réussie. Télémétrie reçue.', 'Connection successful. Telemetry received.') : '';
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

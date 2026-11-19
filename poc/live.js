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
  'files-unavailable': t('La machine ne donne pas accès à ses fichiers. Vérifiez la connexion et la clé API.', 'The machine does not give access to its files. Check the connection and API key.'),
  'upload-rejected': t('La machine a refusé le fichier.', 'The machine rejected the file.'),
  'upload-failed': t('Envoi interrompu. Vérifiez la liste avant de recommencer.', 'Upload interrupted. Check the list before trying again.'),
  'upload-busy': t('Un envoi est déjà en cours vers cette machine.', 'An upload to this machine is already in progress.'),
  'project-multiple-plates': t('Projet multi-plateaux : exportez un seul plateau avant de l’envoyer ou de le lancer.', 'Multi-plate project: export a single plate before uploading or starting it.'),
  'project-no-gcode': t('Ce 3MF ne contient pas de G-code tranché.', 'This 3MF does not contain sliced G-code.'),
  'project-format': t('Archive 3MF non prise en charge ou endommagée.', 'Unsupported or damaged 3MF archive.'),
  'file-exists': t('Un fichier porte déjà ce nom. Renommez-le avant de l’envoyer.', 'A file already uses this name. Rename it before uploading.'),
  'file-quota': t('Limite de stockage FabCore atteinte pour cette machine (2 Go ou 300 fichiers).', 'FabCore storage limit reached for this machine (2 GB or 300 files).'),
  'command-unsupported': t('Cette commande n’est pas prise en charge par ce connecteur.', 'This connector does not support this command.'),
  'filament-confirm': t('Confirmez l’utilisation de la bobine externe.', 'Confirm the use of the external spool.'),
  'file-too-large': t('Fichier vide ou trop volumineux (512 Mo au maximum).', 'File empty or too large (512 MB maximum).'),
  missing: t('Élément introuvable.', 'Item not found.'),
  'terminal-offline': t('La machine est hors ligne. Commande non envoyée.', 'The machine is offline. Command not sent.'),
  'terminal-confirm': t('Confirmation requise pendant une impression. Commande non envoyée.', 'Confirmation required during a print. Command not sent.'),
  invalid: t('Commande invalide : une seule ligne ASCII de 256 caractères au maximum.', 'Invalid command: a single ASCII line of up to 256 characters.'),
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
    'xtool-authorization': t('La M2 demande une autorisation. Utilisez « Appairer la M2 ».', 'The M2 requires authorization. Use “Pair M2”.'),
    'xtool-pairing-timeout': t('Délai écoulé. Relancez l’appairage et confirmez sur la M2.', 'Pairing timed out. Try again and confirm on the M2.'),
    'xtool-pairing-busy': t('Appairage indisponible. Fermez xTool Studio si la machine y est connectée, puis réessayez.', 'Pairing is unavailable. Close xTool Studio if it is connected, then try again.'),
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
  const timeout = AbortSignal.timeout(path.endsWith('/gcode') ? 65_000 : path === 'machines/pair' ? 50_000
    : path === 'discovery' || path.startsWith('machines') || path.startsWith('notifications') ? 18000 : 5000);
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
    closed: t('Flux fermé.', 'Stream closed.'),
    uploaded: t('Fichier envoyé sur la machine.', 'File uploaded to the machine.'),
    'print-started': t('Impression lancée depuis FabCore.', 'Print started from FabCore.'),
    executed: t('Commande G-code exécutée.', 'G-code command executed.'),
    accepted: t('Commande G-code acceptée.', 'G-code command accepted.'),
    rejected: t('Commande G-code refusée.', 'G-code command rejected.'),
    unconfirmed: t('Commande G-code non confirmée.', 'G-code command not confirmed.')
  })[code] || t(...(statusLabels[code] ?? [code, code]));
}

function diagnosticsPage() {
  const data = live.diagnostics;
  const scope = live.diagnosticScope ?? '';
  const date = (at) => at ? new Date(at).toLocaleString(state.lang) : '—';
  const labels = {
    server: 'FabCore', mqtt: 'MQTT', camera: t('Caméra', 'Camera'), status: t('État', 'Status'), files: t('Fichiers', 'Files'), terminal: t('Terminal', 'Terminal')
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
  const available = machineConnectors[m.kind]?.commandActions ?? [];
  const actions = m.status === 'printing' ? ['pause', 'stop'] : m.status === 'paused' ? ['resume', 'stop'] : ['ready', 'done'].includes(m.status) ? ['start'] : [];
  const labels = { pause: t('Pause','Pause'), resume: t('Reprendre','Resume'), stop: t('Stop','Stop'), start: t('Lancer le projet préparé','Start prepared project') };
  const controls = canManage ? actions.filter(action => available.includes(action)).map(action => btn('print-command:' + action, labels[action], '', action === 'stop' ? 'danger' : 'primary', pendingPrintCommands.has(m.id) ? 'disabled' : '')).join('') + (machineConnectors[m.kind]?.files && canStart(m) ? btn('files-focus', t('Lancer…','Start…'), '', 'primary') : '') : '';
  return `<section class="panel stack">
      <div class="row between wrap"><h2>${t('Fabrication','Print job')}</h2><div class="row wrap">${badge(m.status)}${controls}</div></div>
      ${m.kind === 'xtool-m2' ? `<p class="muted">${t('Lancer concerne le projet déjà préparé dans la M2. Les confirmations physiques restent nécessaires.', 'Start uses the project already prepared on the M2. Physical confirmations remain required.')}</p>` : ''}
      ${m.kind === 'elegoo' && m.status === 'paused' ? `<p class="notice">${t('Reprise CC2 : utilisez l’écran de la machine ; le SDK ne documente pas encore une reprise exploitable.', 'CC2 resume: use the machine screen; the SDK does not yet document a usable resume command.')}</p>` : ''}
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
      ${m.kind === 'xtool-m2' ? `<label>${t('Vue', 'View')}<select data-camera-view>
        <option value="side">${t('Caméra d’angle', 'Corner camera')}</option>
        <option value="far">${t('Caméra centrale', 'Central camera')}</option>
        <option value="near">${t('Caméra de l’outil', 'Tool camera')}</option>
      </select></label>` : ''}
      <div data-live-camera></div>
      <div class="machine-camera-idle" data-camera-placeholder>${icon('camera')}<p>${t('Flux fermé','Stream closed')}</p></div>
      <p data-camera-status role="status" hidden></p>
      <div class="row wrap">${btn('camera-start',t('Voir la caméra','View camera'))}
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
      ${filesPanel(m)}
      ${terminalPanel(m)}
    </div>`;
}

function showPreview() {
  const camera = app.querySelector('[data-live-camera]');
  const m = machine(state.machine);
  if (!camera || !m) return;
  camera.querySelector('img')?.removeAttribute('src');
  camera.replaceChildren();
  const view = app.querySelector('[data-camera-view]')?.value;
  const image = document.createElement('img');
  image.alt = t('Aperçu de ', 'Preview of ') + m.name;
  image.style.cssText = 'display:block;width:100%;max-width:850px;border-radius:12px';
  image.addEventListener('load', () => {
    if (image.isConnected) app.querySelector('[data-camera-placeholder]').hidden = true;
  }, { once: true });
  image.addEventListener('error', () => {
    if (!image.isConnected) return;
    image.remove();
    app.querySelector('[data-camera-placeholder]').hidden = false;
    app.querySelector('[data-camera-placeholder] p').textContent = t('Aperçu indisponible', 'Preview unavailable');
  }, { once: true });
  camera.append(image);
  image.src = '/api/machines/' + encodeURIComponent(m.id) + '/camera/preview' + (view ? '/' + view : '');
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
    if (!failed) showPreview();
    start.focus();
    return;
  }
  const image = document.createElement('img');
  image.dataset.cameraLive = 'true';
  image.alt = t('Vue en direct de ', 'Live view of ') + m.name;
  image.style.cssText = 'display:block;width:100%;max-width:850px;border-radius:12px';
  image.addEventListener('error', () => {
    if (image.isConnected) showCamera(false, true);
  }, { once: true });
  camera.append(image);
  const view = app.querySelector('[data-camera-view]')?.value;
  image.src = '/api/machines/' + encodeURIComponent(m.id) + '/camera' + (view ? '/' + view : '');
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
  const screens = { diagnostics: diagnosticsPage, notifications: notificationPage, home: dashboard, machines: liveFleet, detail: liveDetail, viewer: viewerPage, history: () =>
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
  if (signedIn && live.page === 'detail') showPreview();
  if (signedIn && live.page === 'viewer') mountGcode();
  if (signedIn && live.page === 'detail' && state.machine && machineConnectors[machine(state.machine)?.kind]?.files && filesState(state.machine).files === null) loadFiles(state.machine);
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
    const cameraImage = app.querySelector('[data-camera-live]');
    if (cameraImage && current?.cameraOpen) cameraImage.dataset.streamOpened = 'true';
    if (cameraImage?.dataset.streamOpened && !current?.cameraOpen) showCamera(false, true);
    updateViewer();
    const plot = app.querySelector('[data-temperature-plot]');
    const newestSample = String(temperatureHistory.get(current?.id)?.at(-1)?.at ?? '');
    if (plot && current && plot.dataset.sample !== newestSample) {
      plot.innerHTML = temperaturePlot(current);
      plot.dataset.sample = newestSample;
    }
    const checkedAt = current?.checkedAt;
    if (timestamp && checkedAt) timestamp.textContent = new Date(checkedAt).toLocaleTimeString(state.lang);
    if ((changed || hadRefreshError) && !dialog.open && !['notifications', 'diagnostics', 'viewer'].includes(live.page)) {
      const action = document.activeElement?.dataset.action;
      const telemetry = app.querySelector('[data-live-telemetry]');
      if (!hadRefreshError && telemetry && current) {
        telemetry.innerHTML = liveFabrication(current);
        const target = app.querySelector('[data-terminal-target]');
        if (target) target.innerHTML = terminalTarget(current);
        const readings = app.querySelector('[data-temperature-readings]');
        if (readings) readings.innerHTML = temperatureReadings(current);
        const filaments = app.querySelector('[data-live-filaments]');
        if (filaments) filaments.innerHTML = liveFilaments(current);
        if (Boolean(app.querySelector('[data-files] [data-action="viewer-live"]')) !== Boolean(liveFile(current)) ||
          Boolean(app.querySelector('[data-files] [data-action^="files-print"]')) !== canStart(current)) renderFiles(current.id);
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
  Object.assign(gcode, { machine: null, path: '', size: 0, result: null, layer: 0, loading: null, error: '', view: null });
  machineFiles.clear();
  terminalLogs.clear();
  terminalDrafts.clear();
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
  const serial = existing?.serial ?? detected?.serial ?? '';
  const manualSerial = isBambu || (isCC1 && !existing && !serial);
  const serialField = manualSerial
    ? `name="serial" ${isBambu ? 'required maxlength="32"' : 'maxlength="64"'}`
    : `readonly class="muted" data-machine-serial ${isCC1 ? 'name="serial"' : ''} placeholder="${t('Non communiqué', 'Not reported')}"`;
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
      ${isCC1 || isM2 ? '' : `<label>${t('Code d’accès LAN','LAN access code')}<input name="accessCode" type="password" ${existing ? '' : 'required'} minlength="${isBambu ? 8 : 1}" maxlength="${isBambu ? 8 : 64}" autocomplete="new-password"></label>`}
      ` : `
      <label>${t('Adresse ', 'Address for ')}${esc(addressLabel)}<input name="origin" type="url" placeholder="http://192.168.1.50${port === 80 ? '' : ':' + port}" required maxlength="200" value="${esc(existing?.origin ?? detected?.origin ?? '')}"></label>
      <label>${t('Clé API', 'API key')}${required ? '' : ' ' + t('(facultative)', '(optional)')}<input name="apiKey" type="password" ${required && !existing ? 'required' : ''} maxlength="256" autocomplete="new-password"></label>
      `}
      <label>${isCC1 ? t('MainboardID (facultatif)', 'MainboardID (optional)') : t('Numéro de série', 'Serial number')}<input ${serialField} value="${esc(serial)}"></label>
    </div>
    ${existing && !isCC1 && !isM2 ? `<small>${t('Laissez le secret vide pour conserver la valeur enregistrée.', 'Leave the secret blank to keep the saved value.')}</small>` : ''}
    <p class="error" role="alert"></p>
    <p role="status" hidden></p>
    <div class="row wrap">${existing ? `<button class="danger" type="button" data-action="delete-machine:${esc(existing.id)}">${t('Supprimer la machine', 'Delete machine')}</button>` : ''}${btn('close',t('Annuler','Cancel'))}<button type="submit" value="test">${t('Tester la connexion','Test connection')}</button>${isM2 ? `<button type="submit" value="pair">${t('Appairer la M2', 'Pair M2')}</button>` : ''}<button class="primary" type="submit" value="save">${existing ? t('Enregistrer','Save') : t('Ajouter','Add')}</button></div>
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
    <div class="row wrap">${btn('add-manual',t('Saisie manuelle','Enter manually'))}<button class="primary" type="submit" disabled>${t('Lancer le scan','Start scan')}</button></div>
    <p role="status">${t('Chargement des réseaux…','Loading networks…')}</p>
    <div class="stack" data-discovery-results></div>
  </form>`;
  if (!dialog.open) dialog.showModal();
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
      ${device.registered ? `<small>${t('Déjà ajoutée','Already added')}${device.detected === false ? ' · ' + t('Aucune réponse reconnue', 'No recognized response') : device.candidate ? ' · ' + t('Identité à confirmer', 'Identity unconfirmed') : ''}</small>`
        : btn('detected:' + index, device.candidate ? t('Vérifier et configurer','Verify and configure') : t('Configurer','Configure'))}</div>`).join('');
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
  if (action === 'files-focus') {
    const panel = app.querySelector('[data-files]');
    panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    panel?.querySelector('input,button')?.focus({ preventScroll: true });
  }
  if (action === 'print-command' && state.role === 'admin') {
    const current = machine(state.machine);
    if (!current || pendingPrintCommands.has(current.id)) return;
    const confirmation = value === 'stop' ? t('Arrêter et annuler la fabrication sur ', 'Stop and cancel the job on ') : value === 'start' ? t('Lancer le projet déjà préparé sur ', 'Start the already prepared project on ') : t('Reprendre la fabrication sur ', 'Resume the job on ');
    if (value !== 'pause' && !window.confirm(confirmation + current.name + ' ?')) return;
    pendingPrintCommands.add(current.id);
    target.disabled = true;
    try {
      const result = await api('machines/' + current.id + '/command', { action: value, confirm: true });
      toast(value === 'stop' ? t('Fabrication arrêtée.','Job stopped.') : result.status === 'paused' ? t('Fabrication en pause.','Job paused.') : t('Fabrication en cours.','Job running.'));
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
  if ((action === 'add' || action === 'discover') && state.role === 'admin') openDiscovery();
  if (action === 'add-manual' && state.role === 'admin') {
    discoveryCancel?.abort();
    openMachineForm();
  }
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

app.addEventListener('change', event => {
  if (!event.target.matches('[data-camera-view]')) return;
  if (app.querySelector('[data-camera-live]')) showCamera(true);
  else showPreview();
  event.target.focus();
});

dialog.addEventListener('change', (event) => {
  if (!event.target.matches('#add-machine select[name="kind"]')) return;
  openMachineForm(event.target.value, event.target.form.elements.name.value);
  dialog.querySelector('select[name="kind"]').focus();
});

document.addEventListener('input', (event) => {
  const form = event.target.form;
  if (form?.id === 'add-machine' && ['host', 'origin'].includes(event.target.name)) {
    const serialField = form.querySelector('[data-machine-serial]:not([name])');
    if (serialField) serialField.value = '';
  }
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
  const pairing = form.id === 'add-machine' && event.submitter?.value === 'pair';
  const pairingAbort = pairing ? new AbortController() : null;
  const cancelPairing = () => pairingAbort.abort();
  if (pairing) dialog.addEventListener('close', cancelPairing, { once: true });
  const controls = [...form.elements].filter(element => !element.disabled && (!pairing || element.dataset.action !== 'close'));
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
        const serialField = form.querySelector('[data-machine-serial]');
        if (serialField && result.serial) serialField.value = result.serial;
        status.hidden = !result.ok;
        status.textContent = result.ok ? liveIssue(result.issue) || t('Connexion réussie. Télémétrie reçue.', 'Connection successful. Telemetry received.') : '';
        if (!result.ok) errorText.textContent = liveIssue(result.issue) || problem(result.issue);
        return;
      }
      if (pairing) {
        const status = form.querySelector('[role="status"]');
        status.hidden = false;
        status.textContent = t('Confirmez l’appairage sur la M2 quand elle le demande. FabCore dispose de 45 secondes.', 'Confirm pairing on the M2 when prompted. FabCore waits up to 45 seconds.');
      }
      const { id } = await api(pairing ? 'machines/pair' : data.id ? 'machines/edit' : 'machines', data, pairingAbort?.signal);
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
    if (pairing) dialog.removeEventListener('close', cancelPairing);
    controls.forEach((element) => { element.disabled = false; });
  }
});

// Fichiers de la machine et visualiseur G-code en direct.
// Le fichier est lu depuis la machine via FabCore ; la position d’impression vient de la télémétrie.
const gcodeLimit = 512 * 1024 * 1024;
const gcode = { machine: null, path: '', size: 0, result: null, layer: 0, read: 0, loading: null, error: '', travel: true, previous: true, follow: true, view: null };
const machineFiles = new Map();
const fileName = (path) => path.split('/').at(-1);

function filesState(id) {
  if (!machineFiles.has(id)) machineFiles.set(id, { files: null, loading: false, error: '', upload: null });
  return machineFiles.get(id);
}

function liveFile(m) {
  return (m.status === 'printing' || m.status === 'paused') && typeof m.filePath === 'string' && Number.isFinite(m.filePosition) ? m.filePath : null;
}

function canStart(m) {
  return state.role === 'admin' && (m.status === 'ready' || m.status === 'done');
}

function filesPanel(m) {
  if (!machineConnectors[m.kind]?.files) return `<section class="panel stack"><h2>${t('Visualiseur G-code','G-code viewer')}</h2><label>${t('Ouvrir un fichier local pour visualiser ses trajectoires','Open a local file to view its toolpaths')}<input type="file" accept=".gcode,.gco,.g" data-gcode-local></label><p class="muted">${t('Le transfert des projets natifs de cette machine n’est pas encore pris en charge. Cet aperçu local n’envoie aucune commande.', 'Native project transfer for this machine is not supported yet. This local preview sends no commands.')}</p></section>`;
  const entry = filesState(m.id);
  const current = liveFile(m);
  const size = (bytes) => bytes === null ? '—' : bytes >= 1048576 ? (bytes / 1048576).toLocaleString(state.lang, { maximumFractionDigits: 1 }) + ' Mo' : Math.ceil(bytes / 1024).toLocaleString(state.lang) + ' ko';
  const date = (at) => at ? new Date(at).toLocaleString(state.lang, { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const upload = entry.upload;
  return `<section class="panel stack" data-files>
      <div class="row between wrap"><h2>${t('Fichiers de la machine','Machine files')}</h2>${btn('files-refresh', t('Actualiser','Refresh'), '', 'ghost', entry.loading ? 'disabled' : '')}</div>
      ${machineConnectors[m.kind]?.retainedOnly ? `<p class="notice">${t('Fichiers envoyés via FabCore uniquement : le protocole ne fournit pas ici la liste complète du stockage de la machine.', 'Only files uploaded through FabCore: the protocol does not provide a complete storage listing here.')}</p>` : ''}
      <label>${t('Visualiser un G-code local sans l’envoyer','Preview a local G-code without uploading it')}<input type="file" accept=".gcode,.gco,.g" data-gcode-local></label>
      ${current ? `<div class="notice row between wrap"><span>${t('Impression en cours','Print in progress')} · <strong>${esc(fileName(current))}</strong></span>${btn('viewer-live', t('Suivre en direct','Follow live'), 'activity', 'primary')}</div>` : ''}
      ${state.role === 'admin' ? `<label class="stack"><span>${t('Envoyer un fichier G-code sur la machine','Upload a G-code file to the machine')}</span>
        <input type="file" accept=".gcode,.gco,.g${machineConnectors[m.kind]?.projects ? ",.3mf" : ""}" data-files-upload ${upload ? 'disabled' : ''}></label>
        ${upload ? `<p role="status">${t('Envoi de','Uploading')} ${esc(upload.name)}… <span data-upload-percent>${upload.percent}</span> %</p><progress value="${upload.percent}" max="100" data-upload-bar></progress>` : ''}` : ''}
      ${entry.error ? `<p class="error" role="alert">${esc(entry.error)}</p>` : ''}
      ${entry.files === null ? `<p role="status">${t('Chargement de la liste…','Loading the list…')}</p>` : entry.files.length ? `<div class="table"><table>
        <thead><tr><th>${t('Fichier','File')}</th><th>${t('Taille','Size')}</th><th>${t('Modifié','Modified')}</th><th><span class="hide-mobile">${t('Actions','Actions')}</span></th></tr></thead>
        <tbody>${entry.files.map((file, index) => `<tr><td>${esc(file.path)}</td><td>${size(file.size)}</td><td>${date(file.modified)}</td>
          <td><div class="row wrap">${btn('viewer-open:' + index, t('Visualiser','View'))}${canStart(m) ? btn('files-print:' + index, t('Lancer','Start')) : ''}</div></td></tr>`).join('')}</tbody>
      </table></div>` : `<p class="muted">${t('Aucun fichier G-code sur la machine.','No G-code file on the machine.')}</p>`}
    </section>`;
}

function renderFiles(id) {
  const m = machine(id);
  const panel = app.querySelector('[data-files]');
  if (!m || !panel || state.machine !== id || live.page !== 'detail') return;
  panel.outerHTML = filesPanel(m);
}

async function loadFiles(id) {
  const entry = filesState(id);
  if (entry.loading) return;
  entry.loading = true;
  entry.error = '';
  renderFiles(id);
  try {
    entry.files = (await api('machines/' + id + '/files')).files;
  } catch (error) {
    entry.files ??= [];
    entry.error = problem(error.code);
  } finally {
    entry.loading = false;
    renderFiles(id);
  }
}

function uploadFile(id, file) {
  const entry = filesState(id);
  entry.error = '';
  if (!/^[\x20-\x7E]{1,200}$/.test(file.name) || file.name.includes('/') || !(machineConnectors[machine(id)?.kind]?.projects ? /\.(gcode|gco|g|3mf)$/i : /\.(gcode|gco|g)$/i).test(file.name)) {
    entry.error = t('Nom invalide : caractères ASCII et extension prise en charge par la machine.', 'Invalid name: ASCII characters and an extension supported by the machine.');
    return renderFiles(id);
  }
  if (file.size > gcodeLimit || file.size < 1) {
    entry.error = problem('file-too-large');
    return renderFiles(id);
  }
  entry.upload = { name: file.name, percent: 0 };
  renderFiles(id);
  const request = new XMLHttpRequest();
  request.open('POST', '/api/machines/' + id + '/files?name=' + encodeURIComponent(file.name));
  request.setRequestHeader('Content-Type', 'application/octet-stream');
  request.upload.onprogress = (event) => {
    if (!event.lengthComputable) return;
    entry.upload.percent = Math.floor(event.loaded / event.total * 100);
    const label = app.querySelector('[data-upload-percent]');
    const bar = app.querySelector('[data-upload-bar]');
    if (label) label.textContent = entry.upload.percent;
    if (bar) bar.value = entry.upload.percent;
  };
  request.onloadend = () => {
    let code = '';
    try { code = JSON.parse(request.responseText).error ?? ''; } catch { /* réponse vide */ }
    entry.upload = null;
    if (request.status === 201) {
      toast(t('Fichier envoyé sur la machine.', 'File uploaded to the machine.'));
      loadFiles(id);
    } else {
      entry.error = request.status === 0 ? t('Envoi interrompu. Vérifiez la liste avant de recommencer.', 'Upload interrupted. Check the list before trying again.') : problem(code);
      renderFiles(id);
    }
  };
  request.send(file);
}

async function startPrint(id, path) {
  const m = machine(id);
  const filament = machineConnectors[m?.kind]?.externalFilament ? '\n\n' + t('Bobine externe uniquement : aucun choix automatique AMS/CANVAS. Le fichier doit être préparé pour cette machine et ce filament.', 'External spool only: no automatic AMS/CANVAS mapping. The file must be prepared for this machine and filament.') : '';
  if (!m || !path || !window.confirm(t('Lancer l’impression sur','Start printing on') + ' ' + m.name + ' ?\n\n' + path + filament)) return;
  try {
    await api('machines/' + id + '/print', { path, confirm: true, ...(filament ? { filamentMode: 'external' } : {}) });
    toast(t('Impression lancée.', 'Print started.'));
  } catch (error) {
    toast(problem(error.code));
  }
  refresh();
}

function openViewer(id, path, follow) {
  const wasLocal = gcode.local;
  gcode.local = false;
  if (wasLocal || gcode.machine !== id || gcode.path !== path) {
    Object.assign(gcode, { machine: id, path, size: 0, result: null, layer: 0, read: 0, error: '', view: null });
    loadGcode(id, path);
  }
  gcode.follow = follow;
  live.page = 'viewer';
  renderLive();
  app.querySelector('h1')?.focus();
}

function viewerLive() {
  const m = machine(gcode.machine);
  if (gcode.local || !m || !gcode.result || liveFile(m) !== gcode.path) return null;
  return { printed: printedSegments(gcode.result, m.filePosition), status: m.status, progress: m.progress };
}

function viewerStatus() {
  const now = viewerLive();
  if (!now) return t('Aperçu du fichier · pas d’impression en cours de ce fichier.', 'File preview · this file is not being printed.');
  const layer = layerOfSegment(gcode.result, Math.max(0, now.printed - 1));
  return `${now.status === 'paused' ? t('En pause','Paused') : t('En direct','Live')} · ${t('couche','layer')} ${layer + 1} / ${gcode.result.layers.length} · ${now.progress} %`;
}

function viewerPage() {
  const m = machine(gcode.machine);
  if (!m) return liveFleet();
  const result = gcode.result;
  const percent = gcode.loading && gcode.size ? Math.floor(gcode.read / gcode.size * 100) : 0;
  const unsupported = result?.unsupported.length ? `<p class="notice" role="status">${t('Trajectoires non prises en charge, ignorées dans l’aperçu :','Unsupported moves, skipped in the preview:')}
    ${result.unsupported.map(({ command, count, line }) => `<code>${esc(command)}</code> × ${count} (${t('première ligne','first line')} ${line})`).join(', ')}</p>` : '';
  const actions = `<div class="row wrap">${btn('machine:' + m.id, t('Retour à la machine','Back to machine'), 'machine', 'ghost')}${!gcode.local && canStart(m) && result ? btn('viewer-print', t('Lancer l’impression','Start print'), '', 'primary') : ''}</div>`;
  return title(esc(fileName(gcode.path)), esc(m.name + ' · ' + gcode.path), actions) +
    `<style>
      .gcode-canvas{position:relative;height:min(68vh,640px);min-height:320px;border:1px solid var(--line);border-radius:10px;background:var(--raised);overflow:hidden;touch-action:none;cursor:grab}
      .gcode-canvas canvas{display:block;width:100%;height:100%}
      .gcode-canvas.dragging{cursor:grabbing}
      .gcode-layer{flex:1 1 220px;min-width:0}
      .gcode-layer input{width:100%;min-height:0;padding:0}
      .gcode-legend{display:inline-flex;align-items:center;gap:6px}
      .gcode-legend::before{content:"";width:16px;height:3px;border-radius:2px;background:currentColor}
    </style>
    <div class="stack">
      ${gcode.loading ? `<section class="panel stack"><p role="status" data-gcode-progress>${t('Lecture du fichier depuis la machine…','Reading the file from the machine…')} ${percent} %</p><progress value="${percent}" max="100"></progress></section>` : ''}
      ${gcode.error ? `<p class="error" role="alert">${esc(gcode.error)}</p>` : ''}
      ${result && !gcode.loading ? `<p class="muted">${result.lines.toLocaleString(state.lang)} ${t('lignes','lines')} · ${result.layers.length} ${t('couches','layers')} · ${result.types.length.toLocaleString(state.lang)} ${t('segments','segments')}</p>${unsupported}` : ''}
      ${result && !gcode.loading ? (result.layers.length ? `<section class="panel stack">
        <div class="row wrap between"><strong data-viewer-status>${viewerStatus()}</strong>
          <label class="row"><input type="checkbox" data-gcode-option="follow" ${gcode.follow ? 'checked' : ''}> ${t('Suivre la couche en cours','Follow the current layer')}</label></div>
        <div class="row wrap">
          ${btn('gcode-layer:-1', t('Couche précédente','Previous layer'))}
          <label class="gcode-layer stack"><span data-gcode-label>${gcodeLayerLabel()}</span>
            <input type="range" min="1" max="${result.layers.length}" value="${gcode.layer + 1}" data-gcode-layer></label>
          ${btn('gcode-layer:1', t('Couche suivante','Next layer'))}
        </div>
        <div class="row wrap between">
          <div class="row wrap">
            <label class="row"><input type="checkbox" data-gcode-option="travel" ${gcode.travel ? 'checked' : ''}> ${t('Déplacements à vide','Travel moves')}</label>
            <label class="row"><input type="checkbox" data-gcode-option="previous" ${gcode.previous ? 'checked' : ''}> ${t('Couche précédente en fond','Previous layer underneath')}</label>
          </div>
          <div class="row wrap">
            ${btn('gcode-zoom:out', '−', '', '', `aria-label="${t('Dézoomer','Zoom out')}"`)}
            ${btn('gcode-zoom:in', '+', '', '', `aria-label="${t('Zoomer','Zoom in')}"`)}
            ${btn('gcode-fit', t('Ajuster','Fit'))}
          </div>
        </div>
        <div class="gcode-canvas" data-gcode-canvas><canvas role="img" aria-label="${t('Trajectoires de la couche','Layer toolpaths')}"></canvas></div>
        <div class="row wrap"><small class="gcode-legend good">${m.kind === 'xtool-m2' ? t('Réalisé','Completed') : t('Imprimé','Printed')}</small><small class="gcode-legend neutral">${m.kind === 'xtool-m2' ? t('Trajectoire de travail','Work path') : t('À imprimer','To print')}</small><small class="gcode-legend info">${t('Déplacement à vide','Travel move')}</small><small class="gcode-legend warn">${m.kind === 'xtool-m2' ? t('Outil','Tool') : t('Buse','Nozzle')}</small>
          <small>${t('Molette ou boutons pour zoomer, glisser pour déplacer.','Wheel or buttons to zoom, drag to pan.')}</small></div>
      </section>` : `<p class="notice">${m.kind === 'xtool-m2' ? t('Aucune trajectoire laser active trouvée dans ce fichier.', 'No active laser toolpath found in this file.') : t('Aucune extrusion trouvée dans ce fichier.','No extrusion found in this file.')}</p>`) : ''}
    </div>`;
}

function gcodeLayerLabel() {
  const layer = gcode.result?.layers[gcode.layer];
  if (!layer) return '';
  return `${t('Couche','Layer')} ${gcode.layer + 1} / ${gcode.result.layers.length} · Z ${layer.z.toLocaleString(state.lang)} mm`;
}

let printedSegments;
let layerOfSegment;
async function loadGcode(id, path, localFile) {
  const token = {};
  gcode.loading = token;
  try {
    const parserModule = await import('/gcode.mjs');
    ({ printedSegments, layerOfSegment } = parserModule);
    const response = localFile ? new Response(localFile) : await fetch('/api/machines/' + id + '/file?path=' + encodeURIComponent(path));
    if (!response.ok) {
      let code = '';
      try { code = (await response.json()).error; } catch { /* corps vide */ }
      throw Object.assign(new Error(code), { code });
    }
    gcode.size = Number(response.headers.get('content-length')) || 0;
    const parser = parserModule.createGcodeParser({ laser: machine(id)?.kind === 'xtool-m2' });
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let shown = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (gcode.loading !== token) return reader.cancel();
      if (done) break;
      parser.write(value);
      gcode.read += value.length;
      if (Date.now() - shown > 150) {
        shown = Date.now();
        const percent = gcode.size ? Math.min(100, Math.floor(gcode.read / gcode.size * 100)) : 0;
        const status = app.querySelector('[data-gcode-progress]');
        if (status) {
          status.textContent = `${t('Lecture du fichier depuis la machine…','Reading the file from the machine…')} ${percent} %`;
          status.nextElementSibling.value = percent;
        }
        await new Promise(resolve => setTimeout(resolve));
      }
    }
    gcode.result = parser.finish();
    const now = viewerLive();
    if (now && gcode.follow) gcode.layer = layerOfSegment(gcode.result, Math.max(0, now.printed - 1));
  } catch (error) {
    if (gcode.loading !== token) return;
    gcode.error = error.code ? problem(error.code) : t('Lecture du fichier impossible.', 'Could not read the file.');
  }
  gcode.loading = null;
  if (live.page === 'viewer') renderLive();
}

// Appelé à chaque actualisation de la télémétrie pendant que le visualiseur est ouvert.
function updateViewer() {
  if (live.page !== 'viewer' || !gcode.result) return;
  const status = app.querySelector('[data-viewer-status]');
  if (status) status.textContent = viewerStatus();
  const now = viewerLive();
  if (now && gcode.follow) {
    const layer = layerOfSegment(gcode.result, Math.max(0, now.printed - 1));
    if (layer !== gcode.layer) return setGcodeLayer(layer);
  }
  drawGcode();
}

function gcodeFit(canvas) {
  const bounds = gcode.result?.bounds;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!bounds) return { scale: 1, x: width / 2, y: height / 2 };
  const margin = 24;
  const scale = Math.min((width - margin * 2) / Math.max(bounds.maxX - bounds.minX, 1), (height - margin * 2) / Math.max(bounds.maxY - bounds.minY, 1));
  return {
    scale,
    x: width / 2 - (bounds.minX + bounds.maxX) / 2 * scale,
    y: height / 2 + (bounds.minY + bounds.maxY) / 2 * scale
  };
}

function drawGcode() {
  const canvas = app.querySelector('[data-gcode-canvas] canvas');
  const result = gcode.result;
  if (!canvas || !result?.layers.length) return;
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  gcode.view ??= gcodeFit(canvas);
  const { scale, x: offsetX, y: offsetY } = gcode.view;
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const colors = getComputedStyle(document.documentElement);
  const color = (name) => colors.getPropertyValue(name).trim();
  const { segments, types } = result;
  const stroke = (from, to, type, style, lineWidth, alpha) => {
    if (from >= to) return;
    context.beginPath();
    for (let index = from; index < to; index++) {
      if (types[index] !== type) continue;
      const at = index * 4;
      context.moveTo(offsetX + segments[at] * scale, offsetY - segments[at + 1] * scale);
      context.lineTo(offsetX + segments[at + 2] * scale, offsetY - segments[at + 3] * scale);
    }
    context.globalAlpha = alpha;
    context.strokeStyle = style;
    context.lineWidth = lineWidth;
    context.stroke();
  };
  const current = result.layers[gcode.layer];
  const below = result.layers[gcode.layer - 1];
  const now = viewerLive();
  const printed = now ? Math.min(Math.max(now.printed, current.start), current.end) : current.end;
  if (gcode.previous && below) stroke(below.start, below.end, 1, color('--dim'), 1.5, 0.3);
  stroke(printed, current.end, 1, color('--dim'), 1.6, 0.55);
  stroke(current.start, printed, 1, color('--accent'), 1.8, 1);
  if (gcode.travel) stroke(current.start, printed, 0, color('--blue'), 1, 0.7);
  if (now && now.printed > current.start && now.printed <= current.end) {
    const at = (now.printed - 1) * 4;
    context.globalAlpha = 1;
    context.fillStyle = color('--amber');
    context.beginPath();
    context.arc(offsetX + segments[at + 2] * scale, offsetY - segments[at + 3] * scale, 5, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function zoomGcode(factor, x, y) {
  const canvas = app.querySelector('[data-gcode-canvas] canvas');
  if (!canvas || !gcode.view) return;
  const view = gcode.view;
  const scale = Math.min(Math.max(view.scale * factor, 0.05), 2000);
  const centerX = x ?? canvas.clientWidth / 2;
  const centerY = y ?? canvas.clientHeight / 2;
  view.x = centerX - (centerX - view.x) * scale / view.scale;
  view.y = centerY - (centerY - view.y) * scale / view.scale;
  view.scale = scale;
  drawGcode();
}

function setGcodeLayer(index) {
  const layers = gcode.result?.layers;
  if (!layers?.length) return;
  gcode.layer = Math.min(Math.max(index, 0), layers.length - 1);
  const slider = app.querySelector('[data-gcode-layer]');
  if (slider) slider.value = gcode.layer + 1;
  const label = app.querySelector('[data-gcode-label]');
  if (label) label.textContent = gcodeLayerLabel();
  drawGcode();
}

// Un choix manuel de couche suspend le suivi automatique.
function chooseGcodeLayer(index) {
  if (gcode.follow) {
    gcode.follow = false;
    const follow = app.querySelector('[data-gcode-option="follow"]');
    if (follow) follow.checked = false;
  }
  setGcodeLayer(index);
}

function mountGcode() {
  const area = app.querySelector('[data-gcode-canvas]');
  if (!area) return;
  const canvas = area.querySelector('canvas');
  let drag = null;
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const box = canvas.getBoundingClientRect();
    zoomGcode(event.deltaY < 0 ? 1.2 : 1 / 1.2, event.clientX - box.left, event.clientY - box.top);
  }, { passive: false });
  canvas.addEventListener('pointerdown', (event) => {
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    area.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (event) => {
    if (drag?.id !== event.pointerId || !gcode.view) return;
    gcode.view.x += event.clientX - drag.x;
    gcode.view.y += event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drawGcode();
  });
  const release = () => {
    drag = null;
    area.classList.remove('dragging');
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  drawGcode();
}

app.addEventListener('change', (event) => {
  if (event.target.matches('[data-gcode-local]') && event.target.files[0] && state.machine) {
    const file = event.target.files[0];
    if (!/\.(gcode|gco|g)$/i.test(file.name) || file.size > gcodeLimit) return toast(problem('file-too-large'));
    Object.assign(gcode, { machine: state.machine, path: file.name, local: true, follow: false, size: file.size, result: null, layer: 0, read: 0, error: '', view: null });
    live.page = 'viewer';
    loadGcode(state.machine, file.name, file);
    renderLive();
  }
  if (event.target.matches('[data-files-upload]') && event.target.files[0] && state.machine) uploadFile(state.machine, event.target.files[0]);
  if (event.target.matches('[data-gcode-option]')) {
    const option = event.target.dataset.gcodeOption;
    gcode[option] = event.target.checked;
    if (option === 'follow') return updateViewer();
    drawGcode();
  }
});

app.addEventListener('input', (event) => {
  if (event.target.matches('[data-gcode-layer]')) chooseGcodeLayer(Number(event.target.value) - 1);
});

app.addEventListener('click', (event) => {
  const [action, value] = (event.target.closest('[data-action]')?.dataset.action ?? '').split(':');
  const m = machine(state.machine);
  const listed = m && machineFiles.get(m.id)?.files?.[Number(value)];
  if (action === 'gcode-layer') chooseGcodeLayer(gcode.layer + Number(value));
  if (action === 'gcode-zoom') zoomGcode(value === 'in' ? 1.5 : 1 / 1.5);
  if (action === 'gcode-fit') {
    gcode.view = null;
    drawGcode();
  }
  if (action === 'files-refresh' && m) loadFiles(m.id);
  if (action === 'viewer-open' && listed) openViewer(m.id, listed.path, liveFile(m) === listed.path);
  if (action === 'viewer-live' && m && liveFile(m)) openViewer(m.id, liveFile(m), true);
  if (action === 'files-print' && listed) startPrint(m.id, listed.path);
  if (action === 'viewer-print') startPrint(gcode.machine, gcode.path);
});

window.addEventListener('resize', () => {
  if (live.page === 'viewer') drawGcode();
});

// Terminal G-code : envoi manuel, une commande à la fois, jamais renvoyée automatiquement.
const terminalLogs = new Map();
const terminalDrafts = new Map();
const terminalPending = new Set();
const harmlessTerminal = new Set(['M105', 'M114', 'M115', 'M119', 'M27', 'M31', 'M503', 'STATUS', 'HELP', 'GET_POSITION', 'QUERY_ENDSTOPS', 'QUERY_PROBE']);

function terminalTarget(m) {
  return `${t('Cible','Target')} : <strong>${esc(m.name)}</strong> · ${esc(m.model)} ${badge(m.status)}`;
}

function terminalEntry({ command, outcome, responses, message, at }) {
  const labels = {
    pending: [t('Envoi en cours…','Sending…'), 'info'],
    executed: [t('Exécutée par la machine','Executed by the machine'), 'good'],
    accepted: [t('Acceptée par OctoPrint · exécution et réponse non visibles ici','Accepted by OctoPrint · execution and reply not visible here'), 'info'],
    rejected: [t('Refusée','Rejected'), 'bad'],
    unconfirmed: [t('Résultat inconnu · vérifiez la machine avant de renvoyer','Unknown outcome · check the machine before resending'), 'warn'],
    failed: [t('Non envoyée','Not sent'), 'bad']
  };
  const [label, tone] = labels[outcome];
  const detail = message === 'octoprint-disconnected' ? t('OctoPrint n’est pas connecté à l’imprimante.','OctoPrint is not connected to the printer.') : message;
  const replies = responses === null && outcome === 'executed' ? `<small class="muted">${t('Réponses de la machine indisponibles.','Machine replies unavailable.')}</small>` :
    (responses ?? []).map(line => `<code>${esc(line)}</code>`).join('');
  return `<div class="terminal-entry"><div class="row wrap between"><code>&gt; ${esc(command)}</code><small>${esc(at)}</small></div>
    <small class="${tone}">${label}${detail ? ' · ' + esc(detail) : ''}</small>${replies}</div>`;
}

function terminalPanel(m) {
  if (state.role !== 'admin' || !machineConnectors[m.kind]?.terminal) return '';
  const log = terminalLogs.get(m.id) ?? [];
  const pending = terminalPending.has(m.id);
  return `<style>
      .terminal-log{max-height:18rem;overflow:auto;display:grid;gap:.6rem;align-content:start;padding:.7rem;border:1px solid var(--line);border-radius:10px;background:var(--raised)}
      .terminal-entry{display:grid;gap:.2rem}
      .terminal-entry code{white-space:pre-wrap}
      .terminal-form input{flex:1 1 14rem;min-width:0;font-family:ui-monospace,monospace}
    </style>
    <section class="panel stack" data-terminal>
      <h2>${t('Terminal G-code','G-code terminal')}</h2>
      <p data-terminal-target>${terminalTarget(m)}</p>
      <div class="terminal-log" role="log" aria-live="polite" aria-label="${t('Journal du terminal','Terminal log')}">
        ${log.length ? log.map(terminalEntry).join('') : `<small class="muted">${t('Aucune commande envoyée depuis l’ouverture de la page.','No command sent since this page was opened.')}</small>`}
      </div>
      <form id="gcode-terminal" class="row wrap terminal-form">
        <input name="command" maxlength="256" autocomplete="off" autocapitalize="characters" spellcheck="false" required
          aria-label="${t('Commande G-code','G-code command')}" placeholder="M105" value="${esc(terminalDrafts.get(m.id) ?? '')}" ${pending ? 'disabled' : ''}>
        <button class="primary" type="submit" ${pending ? 'disabled' : ''}>${t('Envoyer','Send')}</button>
      </form>
      <small class="muted">${t('Une commande par envoi. Pendant une impression, toute commande autre qu’une lecture d’état demande une confirmation. Une commande au résultat inconnu n’est jamais renvoyée automatiquement.','One command per send. During a print, any command other than a status query asks for confirmation. A command with an unknown outcome is never resent automatically.')}</small>
    </section>`;
}

function renderTerminal(m) {
  const panel = app.querySelector('[data-terminal]');
  if (!panel) return;
  const focused = document.activeElement?.name === 'command';
  panel.outerHTML = terminalPanel(m).replace(/^\s*<style>[\s\S]*?<\/style>\s*/, '');
  const log = app.querySelector('.terminal-log');
  if (log) log.scrollTop = log.scrollHeight;
  if (focused) app.querySelector('#gcode-terminal input')?.focus();
}

app.addEventListener('input', (event) => {
  if (event.target.form?.id === 'gcode-terminal' && state.machine) terminalDrafts.set(state.machine, event.target.value);
});

app.addEventListener('submit', async (event) => {
  if (event.target.id !== 'gcode-terminal') return;
  event.preventDefault();
  const m = machine(state.machine);
  const command = event.target.elements.command.value.trim();
  if (!m || !command || terminalPending.has(m.id) || state.role !== 'admin') return;
  const ask = () => window.confirm(t('Une impression est en cours sur','A print is in progress on') + ' ' + m.name + '.\n' +
    t('Envoyer quand même cette commande ?','Send this command anyway?') + '\n\n' + command);
  const printing = m.status === 'printing' || m.status === 'paused';
  let confirm = printing && !harmlessTerminal.has(command.split(/\s+/)[0].toUpperCase());
  if (confirm && !ask()) return;
  const log = terminalLogs.get(m.id) ?? [];
  const entry = { command, outcome: 'pending', responses: [], message: '', at: new Date().toLocaleTimeString(state.lang) };
  log.push(entry);
  terminalLogs.set(m.id, log.slice(-50));
  terminalDrafts.delete(m.id);
  terminalPending.add(m.id);
  renderTerminal(m);
  try {
    try {
      Object.assign(entry, await api('machines/' + m.id + '/gcode', { command, confirm }));
    } catch (error) {
      // Le serveur a vu une impression que la page n’affichait pas encore : la commande n’a pas été envoyée.
      if (error.code !== 'terminal-confirm' || confirm || !ask()) throw error;
      confirm = true;
      await new Promise(resolve => setTimeout(resolve, 500));
      Object.assign(entry, await api('machines/' + m.id + '/gcode', { command, confirm }));
    }
  } catch (error) {
    const unknown = error.code === 'command-unconfirmed' || error.name === 'TimeoutError' || !error.code;
    entry.outcome = unknown ? 'unconfirmed' : 'failed';
    entry.message = unknown ? '' : problem(error.code);
  } finally {
    terminalPending.delete(m.id);
    const current = machine(m.id);
    if (live.page === 'detail' && state.machine === m.id && current) renderTerminal(current);
  }
});

dialog.addEventListener('close', () => {
  discoveryCancel?.abort();
  dialog.innerHTML = '';
  if (live.phase === 'workshop') renderLive();
});
renderLive();
loadSession();

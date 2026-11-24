const pendingPrintCommands = new Set();
const live = { phase: 'loading', page: 'home', username: '', pending: false, error: '', refreshError: false };
state.machines = [];
state.events = [];
state.users = [];

const problem = (code) => ({
  'bambu-authorization': t('Bambu refuse la vérification de la commande. Sur la P2S : Paramètres → LAN uniquement → Mode développeur. Le LAN seul ne suffit pas au contrôle tiers. Aucun nouvel envoi automatique.', 'Bambu rejected command verification. On P2S: Settings → LAN Only → Developer Mode. LAN alone does not authorize third-party control. No automatic retry.'),
  'laser-confirm': t('Confirmez votre présence et la préparation de la zone laser.', 'Confirm operator presence and laser work area readiness.'),
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
  'command-rejected': t('La machine a refusé la commande.', 'The machine rejected the command.'),
  'command-unconfirmed': t('État non confirmé. Vérifiez l’imprimante avant de réessayer.', 'State not confirmed. Check the printer before retrying.'),
  'heater-unconfirmed': t('La machine a accusé réception, mais n’a pas confirmé la consigne de chauffe. Vérifiez la consigne sur son écran.', 'The machine acknowledged the request but did not confirm the heating setpoint. Check the setpoint on its screen.'),
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
  'control-invalid': t('Réglage invalide, équipement absent, axes non référencés ou déplacement hors limites.', 'Invalid setting, missing equipment, unhomed axes or out-of-bounds move.'),
  'control-confirm': t('Confirmez la modification pendant la fabrication.', 'Confirm changing a setting during the print.'),
  'controls-unavailable': t('Lecture des contrôles indisponible.', 'Controls are unavailable.'),
  'filament-confirm': t('Confirmez l’utilisation de la bobine externe.', 'Confirm the use of the external spool.'),
  'upload-proxy-limit': t('Le serveur ou proxy refuse la taille du fichier. Vérifiez sa limite d’envoi (512 Mo dans FabCore).', 'The server or proxy rejected the file size. Check its upload limit (512 MB in FabCore).'),
  'spool-invalid': t('Vérifiez la matière, le nom et la couleur de la bobine.', 'Check spool material, name and color.'),
  'spool-unsupported': t('La bobine manuelle est réservée aux imprimantes à filament.', 'Manual spools are only available for filament printers.'),
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
    'ray5-address': t('Adresse Ray5 invalide. Utilisez une IPv4 privée et des ports valides.', 'Invalid Ray5 address. Use a private IPv4 address and valid ports.'),
    'ray5-connection': t('Ray5 injoignable ou connexion interrompue. Vérifiez son adresse, son Wi-Fi et le mode TCP/ESP3D.', 'Ray5 unreachable or disconnected. Check its address, Wi-Fi and TCP/ESP3D mode.'),
    'ray5-report': t('Aucun état GRBL exploitable reçu. Un port ouvert ou une réponse HTTP ne suffit pas ; vérifiez le mode et les ports du firmware.', 'No usable GRBL status received. An open port or HTTP response is insufficient; check the firmware mode and ports.'),
    'ray5-stale': t('La Ray5 ne transmet plus d’état récent. Dernières mesures écartées.', 'Ray5 stopped reporting fresh status. Previous readings discarded.'),
    'ray5-response': t('Réponse Ray5 invalide ou trop volumineuse.', 'Invalid or oversized Ray5 response.'),
    'ray5-access': t('Accès ESP3D refusé. Ce pilote ne gère pas encore son authentification.', 'ESP3D access denied. This pilot does not support its authentication yet.'),
    'ray5-alarm': t('Alarme GRBL signalée par la Ray5. Aucun déverrouillage automatique.', 'Ray5 reports a GRBL alarm. No automatic unlock.'),
    'ray5-door': t('Interverrouillage/capot signalé par le contrôleur.', 'The controller reports a door/interlock condition.'),
    'ray5-sleep': t('Le contrôleur GRBL est en veille.', 'The GRBL controller is sleeping.'),
    'ray5-busy': t('Le contrôleur signale un déplacement, une origine ou un mode de vérification.', 'The controller reports jogging, homing or check mode.'),
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
  const timeout = AbortSignal.timeout(path.startsWith('cloud-accounts') ? 45000 : path.endsWith('/controls') ? 30000 : path.endsWith('/transfer') ? 900_000 : path.endsWith('/gcode') ? 65_000 : path === 'machines/pair' ? 50_000
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
    transferred: t('Fichier transféré depuis une autre machine.', 'File transferred from another machine.'),
    'print-started': t('Impression lancée depuis FabCore.', 'Print started from FabCore.'),
    executed: t('Commande G-code exécutée.', 'G-code command executed.'),
    accepted: t('Commande G-code acceptée.', 'G-code command accepted.'),
    confirmed: t('Consigne de chauffe confirmée par la machine.', 'Heating setpoint confirmed by the machine.'),
    'heater-unconfirmed': t('Consigne de chauffe non confirmée malgré l’accusé de réception.', 'Heating setpoint not confirmed despite acknowledgement.'),
    rejected: t('Commande refusée par la machine.', 'Command rejected by the machine.'),
    unconfirmed: t('Commande G-code non confirmée.', 'G-code command not confirmed.')
  })[code] || t(...(statusLabels[code] ?? [code, code]));
}

function diagnosticsPage() {
  const data = live.diagnostics;
  const scope = live.diagnosticScope ?? '';
  const date = (at) => at ? new Date(at).toLocaleString(state.lang) : '—';
  const labels = {
    server: 'FabCore', mqtt: 'MQTT', camera: t('Caméra', 'Camera'), status: t('État', 'Status'), files: t('Fichiers', 'Files'), controls: t('Contrôles', 'Controls'), terminal: t('Terminal', 'Terminal')
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
    (list.length ? `<div class="fleet-grid-scope"><div class="cards machine-grid">${list.map(card).join('')}</div></div>` :
      `<p class="notice">${t('Ajoute une adresse Moonraker pour commencer.','Add a Moonraker address to get started.')}</p>`);
}

function liveFabrication(m) {
  const translatableTime = m.checkedAt ? new Date(m.checkedAt).toLocaleTimeString(state.lang) : '—';
  const canManage = state.role === 'admin';
  const available = m.kind === 'longer-ray5' && m.transport === 'esp3d' ? [] : machineConnectors[m.kind]?.commandActions ?? [];
  const actions = m.status === 'printing' ? ['pause', 'stop'] : m.status === 'paused' ? ['resume', 'stop'] : ['ready', 'done'].includes(m.status) ? ['start'] : [];
  const labels = { pause: t('Pause','Pause'), resume: t('Reprendre','Resume'), stop: t('Stop','Stop'), start: t('Lancer le projet préparé','Start prepared project') };
  const controls = canManage ? actions.filter(action => available.includes(action)).map(action => btn('print-command:' + action, labels[action], '', action === 'stop' ? 'danger' : 'primary', pendingPrintCommands.has(m.id) ? 'disabled' : '')).join('') + (machineConnectors[m.kind]?.files && canStart(m) ? btn('files-focus', t('Choisir un fichier','Choose a file'), '', 'primary') : '') : '';
  return `<section class="panel stack">
      <div class="row between wrap"><h2>${t('Fabrication','Print job')}</h2><div class="row wrap">${badge(m.status)}${controls}</div></div>
      ${m.kind === 'xtool-m2' ? `<p class="muted">${t('Lancer concerne le projet déjà préparé dans la M2. Les confirmations physiques restent nécessaires.', 'Start uses the project already prepared on the M2. Physical confirmations remain required.')}</p>` : ''}
      ${m.kind === 'elegoo' && m.status === 'paused' ? `<p class="notice">${t('Reprise CC2 : utilisez l’écran de la machine ; le SDK ne documente pas encore une reprise exploitable.', 'CC2 resume: use the machine screen; the SDK does not yet document a usable resume command.')}</p>` : ''}
      ${m.controlIssue === 'bambu-authorization' ? `<p class="notice">${problem(m.controlIssue)}</p>` : ''}
      ${m.issue?`<p class="notice">${liveIssue(m.issue)}</p>`:''}
      ${m.kind === 'longer-ray5' ? `<p class="notice">${t('Ray5 · pilotage expérimental selon le transport ; confirmer les commandes sur la machine.', 'Ray5 · experimental transport-dependent controls; verify commands on the machine.')}</p><small>GRBL · ${esc(m.nativeState || '—')}${m.firmware ? ' · ' + esc(m.firmware) : ''}</small>
      <p>${t('Position machine (unités du contrôleur)','Machine position (controller units)')} : ${['x','y','z'].map(axis => axis.toUpperCase() + ' ' + (Number.isFinite(m.machinePosition?.[axis]) ? m.machinePosition[axis] : '—')).join(' · ')}</p>
      <p>${t('Position de travail','Work position')} : ${['x','y'].map(axis => axis.toUpperCase() + ' ' + (Number.isFinite(m.workPosition?.[axis]) ? m.workPosition[axis] : '—')).join(' · ')}</p>
      <small>${t('Vitesse reçue','Reported feed')} : ${Number.isFinite(m.feedRate) ? m.feedRate : '—'} · ${t('Consigne laser S (pas une mesure en watts)','Laser S setpoint (not a watts measurement)')} : ${Number.isFinite(m.spindle) ? m.spindle : '—'}</small>` : ''}
      ${machineConnectors[m.kind]?.printJob === false ? '' : m.progressKnown === false ? `<p>${esc(m.file || '')}</p><small>${t('Progression non communiquée par la machine.', 'Progress not reported by the machine.')}</small>` : `<div class="row between"><span>${esc(m.file)||t('Aucun fichier en cours','No active file')}</span><strong>${m.progress} %</strong></div>
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
  if (machineConnectors[machine.kind]?.temperatures === false) return unavailablePanel(t('Températures','Temperatures'), t('Non applicable à cette machine.', 'Not applicable to this machine.'), 'machine-temperature');
  return `<section class="panel stack machine-temperature">
    <h2>${t('Températures','Temperatures')}</h2>
    <div class="machine-readings" data-temperature-readings>${temperatureReadings(machine)}</div>
    <div class="stack" data-temperature-plot>${temperaturePlot(machine)}</div>
    ${unavailableContent(t('Réglage de chauffe non pris en charge par cette connexion.', 'Heating controls not supported by this connection.'))}
  </section>`;
}

// Compact fleet summary, based only on reported slots. No fabricated spool colors.
function fleetFilamentDots(machine) {
  if (!['klipper', 'octoprint', 'prusalink', 'elegoo', 'elegoo-cc1', 'bambu', 'bambu-cloud'].includes(machine.kind)) return '';
  const system = machineConnectors[machine.kind]?.filaments;
  const units = Array.isArray(machine.filaments) ? machine.filaments : null;
  const stale = machine.status === 'offline' ? ' · ' + t('Dernières données, hors ligne','Last readings, offline') : '';
  const dot = (slot, position, unit) => {
    const shade = slot.occupied !== false && /^#[a-f0-9]{6}$/i.test(slot.color) ? slot.color : null;
    let ink = 'var(--text)';
    if (shade) {
      const rgb = [1, 3, 5].map(at => parseInt(shade.slice(at, at + 2), 16) / 255).map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
      ink = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179 ? '#111111' : '#FFFFFF';
    }
    const label = [unit, position ? t('Emplacement','Slot') + ' ' + position : t('Bobine simple','Single spool'),
      slot.occupied === false ? t('Vide','Empty') : [slot.material, slot.name, shade || t('Couleur inconnue','Unknown color')].filter(Boolean).join(' · '),
      slot.active && slot.occupied !== false ? t('Actif','Active') : '', stale].filter(Boolean).join(' · ');
    return `<span class="fleet-filament-dot" role="img" aria-label="${esc(label)}" title="${esc(label)}" data-empty="${slot.occupied === false}" data-active="${slot.active === true && slot.occupied !== false}" data-unknown="${!shade && slot.occupied !== false}" style="--spool:${shade || 'var(--raised)'};--ink:${ink}">${position || ''}</span>`;
  };
  const shown = units?.find(unit => unit.slots.some(slot => slot.active && slot.occupied !== false)) ?? units?.[0];
  const label = shown ? (shown.variant === 'ht' ? 'AMS HT' : system) + ' ' + (shown.variant === 'ht' ? shown.id - 3 : shown.id + 1) : '';
  const count = units?.length > 1 ? `<small>${units.length} ${esc(system)}</small>` : '';
  const manual = !shown && machine.manualSpool;
  const content = system && shown
    ? `<span class="fleet-filament-unit" role="group" aria-label="${esc(label)}">${count}<span class="fleet-filament-dots">${shown.slots.map(slot => dot(slot, slot.id + 1, label)).join('')}</span></span>`
    : `<span class="fleet-filament-unit">${dot(manual ? { ...manual, occupied: true } : { occupied: null }, '', manual ? t('Saisie manuelle · informatif','Manual entry · informational') : system && units === null ? t('Équipement non communiqué','Equipment not reported') : '')}</span>`;
  return `<style>
    .machine:has(.fleet-filaments){position:relative;padding-top:26px}
    .cards:has(.fleet-filaments){padding-top:16px;row-gap:28px}
    .card-indicators{display:flex;align-items:flex-start;flex:none;max-width:55%}
    .fleet-filaments{position:absolute;right:12px;top:-18px;max-width:calc(100% - 24px);z-index:1}
    .fleet-filament-unit{display:flex;align-items:center;gap:8px;border:1px solid var(--line);background:var(--raised);padding:5px 7px;border-radius:20px}
    .fleet-filament-unit small{font-size:9px;font-weight:700;letter-spacing:.03em;white-space:nowrap}
    .fleet-filament-dots{display:flex;isolation:isolate}.fleet-filament-dots .fleet-filament-dot+.fleet-filament-dot{margin-left:-3px}.fleet-filament-dot{display:inline-grid;place-items:center;flex:none;width:23px;height:23px;position:relative;box-shadow:0 0 0 1px var(--card);border:1px solid #80808070;border-radius:50%;background:var(--spool);color:var(--ink);font-size:11px;font-weight:750;line-height:1}
    .fleet-filament-dot[data-active=true]{outline:2px solid var(--accent);outline-offset:1px;z-index:2}
    .fleet-filament-dot[data-empty=true]{border:1px dashed var(--dim);color:var(--dim);background:var(--card)}
    .fleet-filament-dot[data-unknown=true]{background:repeating-linear-gradient(135deg,transparent 0 3px,var(--line) 3px 4px),var(--raised)}
    @media(max-width:440px){.card-indicators{max-width:60%}.fleet-filament-dot{width:21px;height:21px}}
  </style><div class="fleet-filaments" aria-label="${t('Filaments','Filaments')}">${content}</div>`;
}

function liveFilaments(machine) {
  const system = machineConnectors[machine.kind]?.filaments;
  if (!system || machine.filaments?.length === 0) return '';
  const missing = t('Données des emplacements indisponibles.', 'Slot information is unavailable.');
  const units = machine.filaments?.map(({ id, variant, slots, humidity }) => {
    const unit = variant === 'ht' ? 'AMS HT ' + (id - 3) : system + ' ' + (id + 1);
    const moisture = Number.isFinite(humidity) && humidity >= 0 && humidity <= 100
      ? `<span class="filament-humidity" role="img" aria-label="${t('Humidité','Humidity')} ${humidity} %" title="${t('Humidité','Humidity')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-12Z"/></svg><span aria-hidden="true">${humidity} %</span></span>` : '';
    return `<div class="filament-module">
      <div class="filament-module-heading"><h3>${unit}</h3>${moisture}</div>
      <ul class="filament-rack" style="--slots:${slots.length}">
        ${slots.map((slot) => {
          const position = system === 'AMS' && !variant ? String.fromCharCode(65 + id) + (slot.id + 1) : String(slot.id + 1);
          const occupation = slot.occupied === null ? t('Inconnu', 'Unknown')
            : slot.occupied ? t('Chargé', 'Loaded') : t('Vide', 'Empty');
          const shade = /^#[A-Fa-f0-9]{6}$/.test(slot.color) ? slot.color : 'var(--dim)';
          const label = slot.name || slot.material || occupation;
          return `<li class="filament-slot" data-occupied="${slot.occupied}" data-active="${slot.active}" title="${esc([unit, position, occupation, slot.material, slot.name, slot.color].filter(Boolean).join(' · '))}" style="--filament:${esc(shade)}">
            <span class="filament-spool" aria-hidden="true"><i></i></span>
            <span class="filament-position" aria-label="${t('Emplacement', 'Slot')} ${position}">${position}</span>
            <small class="filament-material">${esc(label)}</small>
            ${slot.active ? `<small class="filament-active">${t('Actif', 'Active')}</small>` : ''}
          </li>`;
        }).join('')}
      </ul>
    </div>`;
  }).join('');
  return `<section class="panel stack machine-filaments" data-modules="${machine.filaments?.length ?? 0}">
    <style>
      .filament-module{display:grid;gap:.65rem}
      .filament-module-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.filament-module-heading h3{margin:0}.filament-humidity{display:inline-flex;align-items:center;gap:3px;font-size:12px;color:var(--dim);white-space:nowrap}.filament-humidity svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.7}
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
    <h2>${t('Filaments','Filaments')} · ${system}${machine.filaments?.length > 1 ? ' × ' + machine.filaments.length : ''}</h2><div class="filament-modules">${units || `<p>${missing}</p>`}</div>
  </section>`;
}

// Keep a shared layout without suggesting an unavailable command can be used.
function unavailableContent(message, camera = false) {
  return `<div class="unavailable-control${camera ? ' camera-stage' : ''}"><div class="unavailable-skeleton" aria-hidden="true" inert>
    ${camera ? icon('camera') : `<input type="text" value="—" disabled tabindex="-1"><button type="button" disabled tabindex="-1">−</button><button type="button" disabled tabindex="-1">+</button>`}
  </div><p class="unavailable-message">${esc(message)}</p></div>`;
}
function unavailablePanel(title, message, extraClass = '') {
  return `<section class="panel stack machine-unavailable ${extraClass}"><h2>${title}</h2>${unavailableContent(message, extraClass === 'machine-camera')}</section>`;
}
function liveMaterials(m) {
  const reported = liveFilaments(m);
  if (reported && m.filaments?.length) return reported;
  const fdm = ['klipper', 'octoprint', 'prusalink', 'elegoo', 'elegoo-cc1', 'bambu', 'bambu-cloud'].includes(m.kind);
  if (!fdm) return unavailablePanel(t('Matières / accessoires', 'Materials / accessories'), t('Non applicable à cette machine.', 'Not applicable to this machine.'), 'machine-filaments');
  const spool = m.manualSpool;
  const color = /^#[a-f0-9]{6}$/i.test(spool?.color) ? spool.color : 'var(--raised)';
  const content = spool ? `<div class="row wrap"><span style="display:inline-block;width:26px;height:26px;border:1px solid var(--line);border-radius:50%;background:${color}" role="img" aria-label="${esc(spool.color || t('Couleur inconnue','Unknown color'))}"></span><strong>${esc(spool.material)}</strong><span>${esc(spool.name || '')}</span></div><small>${t('Saisie manuelle · information uniquement, non vérifiée par la machine.', 'Manual entry · information only, not verified by the machine.')}</small>`
    : unavailableContent(m.status === 'offline' ? t('Informations temporairement inaccessibles : machine hors ligne.', 'Information temporarily unavailable: machine offline.') : machineConnectors[m.kind]?.filaments && m.filaments?.length === 0 ? t('Aucun module multibobine signalé. Bobine simple : informations non communiquées.', 'No multi-spool module reported. Single spool: information not reported.') : t('Informations sur la bobine non communiquées.', 'Spool information not reported.'));
  return `<section class="panel stack machine-filaments"><div class="row between wrap"><h2>${t('Filaments','Filaments')}</h2>${state.role === 'admin' ? btn('spool-edit', spool ? t('Modifier la bobine','Edit spool') : t('Renseigner une bobine','Set spool'), '', 'ghost') : ''}</div>${content}</section>`;
}
function openManualSpool() {
  const m = machine(state.machine);
  if (state.role !== 'admin' || !m || m.filaments?.length || !['klipper', 'octoprint', 'prusalink', 'elegoo', 'elegoo-cc1', 'bambu', 'bambu-cloud'].includes(m.kind)) return;
  const spool = m.manualSpool;
  dialog.innerHTML = `<form id="manual-spool" class="stack" data-machine-id="${esc(m.id)}"><h2>${t('Bobine simple','Single spool')}</h2>
    <p class="notice">${t('Information enregistrée dans FabCore uniquement. Aucune commande ni sélection de filament n’est envoyée à la machine.', 'Information saved in FabCore only. No command or filament selection is sent to the machine.')}</p>
    <label>${t('Matière','Material')}<input name="material" maxlength="40" required placeholder="PLA, PETG, ABS…" value="${esc(spool?.material || '')}"></label>
    <label>${t('Nom / marque (facultatif)','Name / brand (optional)')}<input name="name" maxlength="80" value="${esc(spool?.name || '')}"></label>
    <label class="row"><input type="checkbox" name="knownColor" ${spool?.color ? 'checked' : ''}>${t('Couleur renseignée','Color specified')}<input type="color" name="color" aria-label="${t('Couleur de la bobine','Spool color')}" value="${spool?.color || '#808080'}"></label>
    <p class="error" role="alert"></p><div class="row wrap">${btn('close', t('Annuler','Cancel'))}<button type="submit" class="primary">${t('Enregistrer','Save')}</button>${spool ? '<button type="submit" name="remove" value="true" formnovalidate class="danger">' + t('Retirer l’information','Remove information') + '</button>' : ''}</div></form>`;
  dialog.showModal();
}

const machineTabs = new Map();
function machineTab(id = state.machine) {
  const tab = machineTabs.get(id) ?? 'overview';
  if (tab === 'logs' && state.role !== 'admin') return 'overview';
  return tab === 'console' && !machineConnectors[machine(id)?.kind]?.terminal ? 'overview' : tab;
}
// Console G-code toujours visible ; grisée avec la raison quand la connexion ne permet pas d'envoyer du G-code.
function consoleUnavailable(kind) {
  return ({
    elegoo: t('La Centauri Carbon 2 n’accepte pas de G-code dans son API LAN d’origine (aucune méthode prévue par le SDK Elegoo).', 'The Centauri Carbon 2 accepts no G-code through its stock LAN API (no method in the Elegoo SDK).'),
    'elegoo-cc1': t('La Centauri Carbon n’accepte pas de G-code par son protocole LAN SDCP.', 'The Centauri Carbon accepts no G-code through its SDCP LAN protocol.'),
    prusalink: t('L’API PrusaLink ne propose pas d’envoi de G-code.', 'The PrusaLink API offers no G-code command.'),
    'bambu-cloud': t('Connexion cloud en lecture seule : aucune commande envoyée.', 'Read-only cloud connection: no command is sent.')
  })[kind] || t('Terminal G-code non pris en charge par cette connexion.', 'G-code terminal not supported by this connection.');
}
function selectMachineTab(tab) {
  if (!['overview', 'files', 'console', 'logs'].includes(tab)) return;
  if (tab === 'logs' && state.role !== 'admin') return;
  if (tab === 'console' && !machineConnectors[machine(state.machine)?.kind]?.terminal) return;
  machineTabs.set(state.machine, tab);
  renderLive();
  app.querySelector('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
}
function liveDetail() {
  const m = machine(state.machine);
  if (!m) return liveFleet();
  const tab = machineTab();
  const camera = (m.kind === 'bambu-cloud' ? m.capabilities?.camera : machineConnectors[m.kind]?.camera)
    ? `<section class="panel stack machine-camera" data-camera-panel>
      <style>[data-camera-panel] [hidden]{display:none!important}</style>
      <div class="row between wrap"><h2>${t('Caméra','Camera')}</h2>${m.kind === 'bambu-cloud' ? `<small>${t('Télémétrie Cloud · caméra LAN RTSPS · expérimental','Cloud telemetry · LAN RTSPS camera · experimental')}</small>` : ''}${m.kind === 'xtool-m2' ? `<label>${t('Vue', 'View')}<select data-camera-view aria-label="${t('Vue caméra','Camera view')}">
        <option value="side">${t('Angle', 'Corner')}</option><option value="far">${t('Centrale', 'Central')}</option><option value="near">${t('Outil', 'Tool')}</option>
      </select></label>` : `<small>${t('Aperçu à l’ouverture','Preview on opening')}</small>`}</div>
      <div class="camera-stage"><div data-live-camera></div><div class="machine-camera-idle" data-camera-placeholder>${icon('camera')}<p>${t('Aperçu indisponible','Preview unavailable')}</p></div></div>
      <p data-camera-status role="status" hidden></p>
      <div class="row wrap camera-toolbar">${btn('camera-start',t('Voir la caméra','View camera'),'camera')}${btn('camera-stop',t('Fermer le flux','Close stream'),'','','hidden')}</div>
    </section>` : unavailablePanel(t('Caméra','Camera'), t('Caméra non prise en charge par cette connexion.', 'Camera not supported by this connection.'), 'machine-camera');
  const tabs = [['overview', t('Vue machine','Machine view')], ['files', t('Fichiers','Files')], ...(state.role === 'admin' ? [['logs', t('Logs','Logs')]] : []), ['console', t('Console','Console'), machineConnectors[m.kind]?.terminal ? null : consoleUnavailable(m.kind)]];
  return `<div class="machine-cockpit">
    <style>
      .machine-workspace .top{min-height:48px;padding:6px 20px}.machine-workspace .area{max-width:1600px;padding:16px 20px 24px}
      .machine-account{position:relative}.machine-account summary{cursor:pointer;list-style:none;border:1px solid var(--line);border-radius:8px;padding:6px 10px}.machine-account summary::-webkit-details-marker{display:none}.machine-account>div{position:absolute;right:0;top:calc(100% + 8px);z-index:10;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;box-shadow:0 6px 24px var(--shadow);width:240px}.machine-account>div button{width:100%;justify-content:flex-start}
      .machine-cockpit{display:grid;gap:12px}.cockpit-header h1{font-size:26px;letter-spacing:-.04em}.cockpit-header small{font-size:12px}.cockpit-header{gap:12px}.cockpit-header .row:first-child{min-width:0}.cockpit-header h1{overflow-wrap:anywhere}.machine-tabs{display:flex;gap:4px;border-bottom:1px solid var(--line)}.machine-tabs button{border:0;border-radius:6px 6px 0 0;background:transparent;border-bottom:3px solid transparent;min-height:38px;padding:7px 14px}.machine-tabs [aria-selected=true]{color:var(--accent);border-bottom-color:var(--accent);background:var(--soft)}
      .cockpit-grid{display:grid;grid-template-columns:minmax(0,1.03fr) minmax(0,1fr);gap:14px;align-items:start}.cockpit-column{display:grid;gap:12px;min-width:0;align-content:start}.machine-cockpit .panel{padding:12px;box-shadow:0 2px 8px var(--shadow)}.machine-cockpit .stack{gap:8px}.machine-cockpit h2{font-size:17px}.machine-cockpit h3{font-size:13px}.machine-cockpit button,.machine-cockpit input,.machine-cockpit select{min-height:34px;padding:5px 9px}.machine-cockpit input[type=checkbox]{min-height:0}.machine-cockpit small{line-height:1.35}
      .camera-stage{position:relative;aspect-ratio:16/9;max-height:clamp(150px,calc(100dvh - 560px),390px);min-height:150px;background:var(--raised);overflow:hidden;border-radius:8px}.camera-stage [data-live-camera]{height:100%;display:grid;place-items:center}.camera-stage img{width:100%;height:100%;max-width:none!important;object-fit:contain;border-radius:8px!important}.machine-camera-idle{position:absolute;inset:0;display:grid;align-content:center;justify-items:center;gap:6px;color:var(--dim)}.machine-camera-idle svg{width:28px;height:28px}.camera-toolbar{justify-content:flex-end}.machine-camera [role=status]{font-size:12px}
      .machine-temperature [data-temperature-plot] svg{display:block;max-height:125px;width:100%}.machine-readings{display:flex;justify-content:space-between}.control-heater{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:7px 0;border-bottom:1px solid var(--line)}.control-heater>p{flex:1;min-width:120px;font-size:13px}.control-heater form{gap:5px}.control-heater input{width:65px}.control-heater label{font-size:11px}.control-heater button{font-size:11px}.quick-control{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px;font-size:12px}.quick-control form{gap:5px}.quick-control input{width:62px}.quick-control form label{font-size:11px}.control-switch[aria-pressed=true]{color:var(--accent);background:var(--soft)}
      .filament-modules{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.filament-modules>.filament-module:only-child{grid-column:1/-1;justify-self:start}.machine-cockpit .filament-module{gap:5px;padding:8px;background:var(--raised);border:1px solid var(--line);border-radius:8px;min-width:0}.machine-cockpit .filament-rack{width:auto;max-width:100%;padding:2px 0;gap:5px;background:transparent;border:0;grid-template-columns:repeat(var(--slots),minmax(28px,42px))}.machine-cockpit .filament-spool{width:19px;height:31px}.machine-cockpit .filament-slot{gap:3px;grid-template-rows:auto auto auto}.machine-cockpit .filament-position{font-size:10px;padding:1px 4px}.machine-cockpit .filament-material{font-size:10px;max-width:46px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.machine-cockpit .filament-active{display:none}.machine-cockpit .filament-slot[data-active=true]:after{display:none}.machine-cockpit .filament-slot[data-active=true]{outline:1px solid var(--accent);outline-offset:2px;border-radius:4px}
      .jog-layout{display:flex;gap:16px;align-items:center;justify-content:center}.jog-pad{display:grid;grid-template:repeat(3,32px)/repeat(3,38px);gap:3px}.jog-pad button{padding:3px;min-height:32px}.jog-pad span{display:grid;place-items:center;color:var(--dim);font-size:11px}.jog-z{display:grid;gap:5px;border-left:1px solid var(--line);padding-left:16px}.jog-options{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.jog-options label{font-size:12px}.jog-note{font-size:11px;color:var(--dim)}
      .machine-cockpit .machine-filaments{width:100%;min-width:0}.unavailable-control{position:relative;min-height:66px;display:grid;place-items:center;border-radius:8px;background:var(--raised);overflow:hidden}.unavailable-skeleton{display:flex;gap:8px;justify-content:center;align-items:center;padding:12px;filter:blur(2px);opacity:.25;pointer-events:none;user-select:none}.unavailable-skeleton input{width:70px}.unavailable-message{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:10px;color:var(--dim);font-size:12px;line-height:1.4;background:color-mix(in srgb,var(--card) 65%,transparent)}.machine-camera.machine-unavailable .unavailable-control{min-height:150px}.machine-cockpit .machine-unavailable{min-width:0}
      .machine-tabs .tab-unavailable{opacity:.45;cursor:not-allowed}.cockpit-bottom{display:grid;gap:12px;min-width:0}.cockpit-bottom>.panel{min-width:0}
      @media(min-width:1100px) and (max-height:900px){.cockpit-bottom{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.machine-temperature [data-temperature-plot] svg{max-height:85px}.jog-layout{gap:8px}.jog-z{padding-left:8px}.jog-options{gap:5px}.machine-cockpit [data-live-telemetry] .panel{gap:6px}}
      @media(max-width:1000px){.cockpit-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.control-heater form{width:100%}.machine-workspace .area{padding:12px}}
      @media(max-width:760px){.machine-workspace{display:block}.machine-workspace .sidebar{display:none}.cockpit-grid{grid-template-columns:1fr}.machine-workspace .area{padding-bottom:80px}.camera-stage{max-height:none}.cockpit-header{align-items:flex-start}.machine-tabs{overflow:auto}.machine-tabs button{white-space:nowrap}.machine-account summary{max-width:120px;overflow:hidden;text-overflow:ellipsis}.machine-workspace .top{padding:6px 12px}}
      @media(max-width:380px){.filament-modules{grid-template-columns:1fr}}
    </style>
    <header class="cockpit-header row between"><div class="row">${btn('nav:machines', '←', '', 'ghost', `aria-label="${t('Retour au parc','Back to fleet')}"`)}<div><h1>${esc(m.name)}</h1><small>${esc(m.model)}</small></div><span data-machine-status>${badge(m.status)}</span></div>${state.role === 'admin' ? btn(m.kind === 'bambu-cloud' ? 'cloud-open' : 'edit', '', 'control', 'ghost', `aria-label="${t('Modifier la machine','Edit machine')}"`) : ''}</header>
    <div class="machine-tabs" role="tablist" aria-label="${t('Fiche machine','Machine details')}">${tabs.map(([key, label, reason]) => `<button type="button" id="machine-tab-${key}" role="tab" aria-selected="${tab === key}" aria-controls="machine-tab-panel" tabindex="${tab === key ? 0 : -1}" data-action="machine-tab:${key}"${reason ? ` aria-disabled="true" title="${esc(reason)}" class="tab-unavailable"` : ''}>${label}</button>`).join('')}</div>
    <div role="tabpanel" id="machine-tab-panel" aria-labelledby="machine-tab-${tab}">
      ${tab === 'logs' ? machineLogPanel(m) : tab === 'files' ? filesPanel(m) : tab === 'console' ? terminalPanel(m) : `<div class="cockpit-grid"><div class="cockpit-column">${camera}<div data-live-filaments>${liveMaterials(m)}</div></div><div class="cockpit-column"><div data-live-telemetry>${liveFabrication(m)}</div>${machineConnectors[m.kind]?.controls ? manualControlsPanel(m, 'heat') : liveTemperatures(m)}<div class="cockpit-bottom">${manualControlsPanel(m, 'quick')}${manualControlsPanel(m, 'motion')}</div></div></div>`}
    </div>
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

// Identifiant réel du formulaire : un champ nommé « id » (machine modifiée) masquerait la propriété id du formulaire.
const formId = form => form?.getAttribute?.('id') ?? '';
function renderLive() {
  // Page de connexion unique : l'interface React (/app) gère connexion, installation et retour Pocket ID.
  if (live.phase === 'login' || live.phase === 'setup') {
    location.replace('/app' + (live.error === 'oidc-failed' ? '#oidc-failed' : ''));
    return;
  }
  pauseGcode();
  app.querySelector('[data-live-camera] img')?.removeAttribute('src');
  document.documentElement.lang = state.lang;
  document.documentElement.dataset.theme = state.theme === 'system' ? (media.matches ? 'light' : 'dark') : state.theme;
  const signedIn = live.phase === 'workshop';
  const screens = { cloud: cloudPage, diagnostics: diagnosticsPage, notifications: notificationPage, home: dashboard, machines: liveFleet, detail: liveDetail, viewer: viewerPage, history: () =>
    title(t('Activité récente','Recent activity')) + `<section class="panel">${listEvents()}</section>` };
  const compact = signedIn && live.page === 'detail';
  const fleet = signedIn && ['home', 'machines'].includes(live.page);
  const accountActions = `
      ${signedIn ? `<a class="button ghost" href="/app">${t('Vue atelier','Workshop view')}</a>` : ''}      ${btn('lang',state.lang==='fr'?'EN':'FR','','ghost',`aria-label="${state.lang==='fr'?'Switch to English':'Passer en français'}"`)}
      ${btn('theme','','sun','ghost',`aria-label="${t('Basculer le thème','Toggle theme')}"`)}
      ${signedIn && state.role === 'admin' ? btn('diagnostics',t('Diagnostics','Diagnostics'),'activity') : ''}
      ${signedIn && state.role === 'admin' ? btn('notifications',t('Notifications','Notifications')) : ''}
      ${signedIn && state.role === 'admin' ? btn('cloud-open',t('Comptes cloud','Cloud accounts')) : ''}
      ${signedIn && state.role === 'admin' ? btn('observer',t('Ajouter un observateur','Add observer')) : ''}
      ${signedIn?btn('logout',t('Déconnexion','Sign out'),'','ghost'):''}
`;
  app.innerHTML = `<a class="skip" href="#content">${t('Aller au contenu','Skip to content')}</a><div class="${signedIn ? 'layout' + (compact ? ' machine-workspace' : fleet ? ' fleet-workspace' : '') : ''}">
    ${signedIn?`<aside class="sidebar">${brand()}<nav aria-label="${t('Navigation principale','Main navigation')}">${liveNavigation()}</nav><div class="sidefoot"><small class="signal">POC${state.role === 'viewer' ? ' · ' + t('Observateur','Observer') : ''}</small></div></aside>`:''}
    <div><header class="top"><div class="crumb">${compact ? `<span>${t('Machines','Machines')} / <strong>${esc(machine(state.machine)?.name ?? '')}</strong></span>` : signedIn ? `<span>${esc(live.username)}</span>` : brand()}</div>
    ${compact ? `<details class="machine-account"><summary aria-label="${t('Compte et paramètres','Account and settings')}">${esc(live.username)} ▾</summary><div class="stack">${accountActions}</div></details>` : `<div class="row wrap">${accountActions}</div>`}
    </header><main id="content" class="area" tabindex="-1">
      ${live.refreshError?`<p class="notice" role="status">${t('Actualisation indisponible. Les données affichées datent de la dernière réponse.','Refresh unavailable. Showing the last response.')}</p>`:''}
      ${signedIn?screens[live.page]():credentialsPage()}
    </main></div></div>
    ${signedIn?`<nav class="mobile" style="grid-template-columns:repeat(3,1fr)" aria-label="${t('Navigation mobile','Mobile navigation')}">${liveNavigation()}</nav>`:''}`;
  if (compact) app.querySelectorAll('.sidebar nav button').forEach(button => { button.title = button.textContent.trim(); });
  if (signedIn && live.page === 'detail' && machineTab() === 'overview') { showPreview(); loadManualControls(state.machine); }
  if (signedIn && live.page === 'viewer') mountGcode();
  if (signedIn && live.page === 'detail' && machineTab() === 'logs' && machineLogState(state.machine).data === null) loadMachineLogs(state.machine);
  if (signedIn && live.page === 'detail' && machineTab() === 'files' && state.machine && machineConnectors[machine(state.machine)?.kind]?.files && filesState(state.machine).files === null) loadFiles(state.machine);
}

const statusLabels = {
  ready: ['Disponible','Ready'], printing: ['En fabrication','Printing'], paused: ['En pause','Paused'],
  done: ['Terminée','Completed'], error: ['Erreur','Error'], offline: ['Hors ligne','Offline'],
  connecting: ['Connexion…','Connecting…']
};
let telemetryTimer;
let fleetRevision = 0;
// Mobile : aucune actualisation pendant un geste tactile ni son élan (iOS interrompt le défilement) ; la page du
// parc reconstruite garde sa position de défilement.
let touchActive = false, touchTimer = null, deferredRender = false;
function redrawKeepingScroll() {
  const x = scrollX, y = scrollY;
  renderLive();
  scrollTo(x, y);
}
addEventListener('touchstart', () => { touchActive = true; clearTimeout(touchTimer); }, { passive: true });
for (const type of ['touchend', 'touchcancel']) addEventListener(type, () => {
  clearTimeout(touchTimer);
  touchTimer = setTimeout(() => {
    touchActive = false;
    const pending = deferredRender;
    deferredRender = false;
    if (pending) refresh();
  }, 800);
}, { passive: true });
let workshopEpoch = 0;
// Temps réel (MIG-05) : le flux SSE signale les changements, le parc est relu par REST (ADR 0004).
// Actualisation regroupée (une lecture par seconde au plus), relecture de sécurité toutes les 30 s, et retour
// au rafraîchissement périodique de 2 s tant que le flux est indisponible.
const liveEvents = { source: null, timer: null, safety: null, last: 0, fallback: false };
function scheduleRefresh() {
  if (liveEvents.timer) return;
  liveEvents.timer = setTimeout(() => { liveEvents.timer = null; liveEvents.last = Date.now(); refresh(); }, Math.max(0, 1000 - (Date.now() - liveEvents.last)));
}
function pollWhileDisconnected(active) {
  if (active === liveEvents.fallback) return;
  liveEvents.fallback = active;
  clearInterval(telemetryTimer);
  telemetryTimer = active ? setInterval(refresh, 2000) : null;
}
function stopLiveUpdates() {
  liveEvents.source?.close();
  clearTimeout(liveEvents.timer); clearInterval(liveEvents.safety); clearInterval(telemetryTimer);
  Object.assign(liveEvents, { source: null, timer: null, safety: null, fallback: false });
}
function startLiveUpdates() {
  stopLiveUpdates();
  if (typeof EventSource !== 'function') return pollWhileDisconnected(true);
  const source = new EventSource('/api/events');
  liveEvents.source = source;
  for (const type of ['machine.telemetry', 'fleet.changed']) source.addEventListener(type, scheduleRefresh);
  source.addEventListener('resync', () => refresh());
  source.onopen = () => { if (liveEvents.fallback) { pollWhileDisconnected(false); refresh(); } };
  // Reconnexion automatique du navigateur ; en attendant, rafraîchissement périodique. Flux refusé (session
  // expirée) : la lecture REST détecte la déconnexion et ramène à l'écran de connexion.
  source.onerror = () => {
    if (liveEvents.source !== source) return;
    pollWhileDisconnected(true);
    if (source.readyState === EventSource.CLOSED) { liveEvents.source = null; refresh(); setTimeout(() => { if (live.phase === 'workshop' && !liveEvents.source) startLiveUpdates(); }, 5000); }
  };
  liveEvents.safety = setInterval(() => { if (!liveEvents.fallback) refresh(); }, 30_000);
}
async function refresh() {
  if (live.pending || live.phase !== 'workshop') return;
  // Geste tactile en cours : aucune modification de la page avant la fin du geste et de son élan.
  if (touchActive) { deferredRender = true; return; }
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
    if (live.page === 'detail' && state.machine) loadManualControls(state.machine);
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
    const headerStatus = app.querySelector('[data-machine-status]');
    if (headerStatus && current) headerStatus.innerHTML = badge(current.status);
    if (current) for (const key of ['nozzle', 'bed']) {
      const reading = app.querySelector('[data-control-current="' + key + '"]');
      if (reading) reading.textContent = Number.isFinite(current[key]) ? current[key].toLocaleString(state.lang, { maximumFractionDigits: 1 }) + ' °C' : '—';
    }
    const checkedAt = current?.checkedAt;
    if (timestamp && checkedAt) timestamp.textContent = new Date(checkedAt).toLocaleTimeString(state.lang);
    if ((changed || hadRefreshError) && !dialog.open && !['notifications', 'diagnostics', 'viewer', 'cloud'].includes(live.page)) {
      const action = document.activeElement?.dataset.action;
      const telemetry = app.querySelector('[data-live-telemetry]');
      if (!hadRefreshError && telemetry && current) {
        telemetry.innerHTML = liveFabrication(current);
        const target = app.querySelector('[data-terminal-target]');
        if (target) target.innerHTML = terminalTarget(current);
        const readings = app.querySelector('[data-temperature-readings]');
        if (readings) readings.innerHTML = temperatureReadings(current);
        const filaments = app.querySelector('[data-live-filaments]');
        if (filaments) filaments.innerHTML = liveMaterials(current);
        if (Boolean(app.querySelector('[data-files] [data-action="viewer-live"]')) !== Boolean(liveFile(current)) ||
          app.querySelector('[data-files]')?.dataset.fileStart !== String(canStart(current))) renderFiles(current.id);
      } else if (live.page === 'detail' && !hadRefreshError) {
        if (current && app.querySelector('[data-files]')?.dataset.fileStart !== String(canStart(current))) renderFiles(current.id);
        const target = app.querySelector('[data-terminal-target]');
        if (target && current) target.innerHTML = terminalTarget(current);
      } else redrawKeepingScroll();
      if (action) [...app.querySelectorAll('[data-action]')].find(button => button.dataset.action === action && button.getClientRects().length)?.focus({ preventScroll: true });
    }
  } catch (error) {
    if (live.phase !== 'workshop') return;
    if (error.code === 'sign-in') {
      if (dialog.open) dialog.close();
      stopLiveUpdates();
      live.phase = 'login';
      cloudUI.data = null;
      live.error = 'sign-in';
      renderLive();
    } else if (!live.refreshError) {
      live.refreshError = true;
      if (!dialog.open && live.page !== 'notifications' && live.page !== 'cloud') renderLive();
    }
  } finally {
    live.pending = false;
  }
}

function openWorkshop(username, role) {
  const epoch = ++workshopEpoch;
  state.role = role === 'admin' ? 'admin' : 'viewer';
  live.username = username;
  cloudUI.data = null; cloudUI.error = '';
  temperatureHistory.clear();
  Object.assign(gcode, { machine: null, path: '', size: 0, result: null, layer: 0, loading: null, error: '', view: null });
  machineFiles.clear();
  machineLogStates.clear();
  terminalLogs.clear();
  terminalDrafts.clear();
  live.phase = 'workshop';
  live.page = 'home';
  live.error = '';
  state.events = [];
  state.machines = [];
  renderLive();
  refresh().then(() => {
    if (live.phase !== 'workshop' || workshopEpoch !== epoch) return;
    const params = new URLSearchParams(location.search);
    const id = params.get('machine');
    const screen = params.get('screen');
    if (id && state.machines.some(m => m.id === id)) {
      const tab = params.get('tab');
      if (['files', 'logs', 'console'].includes(tab)) machineTabs.set(id, tab);
      state.machine = id; live.page = 'detail';
      const view = params.get('view');
      if (view) openViewer(id, view, params.get('follow') === '1' && liveFile(machine(id)) === view);
      else {
        renderLive();
        if (tab === 'settings' && state.role === 'admin') document.querySelector('[data-action="' + (machine(id).kind === 'bambu-cloud' ? 'cloud-open' : 'edit') + '"]')?.click();
      }
    }
    else if (state.role === 'admin' && screen) {
      if (screen === 'cloud') openCloudAccounts();
      if (screen === 'diagnostics') openDiagnostics();
      if (screen === 'notifications') openNotifications();
      if (screen === 'add') openDiscovery();
      if (screen === 'observer') document.querySelector('[data-action="observer"]')?.click();
    }
    // Keep the explicit legacy tool URL: reload must not reopen the old fleet.
  });
  startLiveUpdates();
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
  const isRay5 = form === 'longer-ray5';
  const ray5Transport = existing?.transport ?? detected?.transport ?? 'tcp';
  const serial = existing?.serial ?? detected?.serial ?? '';
  const manualSerial = isBambu || (isCC1 && !existing && !serial);
  const serialField = manualSerial
    ? `name="serial" ${isBambu ? 'required maxlength="32"' : 'maxlength="64"'}`
    : `readonly class="muted" data-machine-serial ${isCC1 ? 'name="serial"' : ''} placeholder="${t('Non communiqué', 'Not reported')}"`;
  const addressLabel = kind === 'klipper' ? 'Moonraker' : connector.model;
  dialog.innerHTML = `<form id="add-machine" class="stack" autocomplete="off">
    <h2>${existing ? t('Modifier une machine','Edit a machine') : t('Ajouter une machine','Add a machine')}</h2>
    ${existing ? `<input type="hidden" name="id" value="${esc(existing.id)}"><input type="hidden" name="kind" value="${kind}">` : ''}
    ${existing && state.role === 'admin' ? `<div class="stack" data-rediscover><div class="row wrap">${btn('rediscover', t('Détecter à nouveau', 'Detect again'))}<small>${t('Retrouve cette machine sur le réseau si son adresse a changé.', 'Finds this machine on the network if its address changed.')}</small></div><p role="status" data-rediscover-status></p><div class="stack" data-rediscover-results></div></div>` : ''}
    ${existing ? '' : btn('discover',t('Détecter sur le réseau','Discover on network'))}
    <div class="fields">
      ${existing ? '' : `<label>${t('Type de machine','Machine type')}<select name="kind">${Object.entries(machineConnectors).filter(([, entry]) => entry.form !== 'cloud').map(([id, entry]) =>
        `<option value="${esc(id)}" ${id === kind ? 'selected' : ''}>${esc(entry.model)}</option>`).join('')}</select></label>`}
      <label>${t('Nom de la machine','Machine name')}<input name="name" required maxlength="80" value="${esc(name)}"></label>
      ${form !== 'http' ? `
      <label>${t('Adresse IPv4 locale','Local IPv4 address')}<input name="host" placeholder="192.168.1.50" required maxlength="15" value="${existing ? esc(new URL(existing.origin).hostname) : esc(detected?.host ?? '')}"></label>
      ${isRay5 ? `<label>${t('Interface Wi-Fi du firmware','Firmware Wi-Fi interface')}<select name="transport"><option value="tcp" ${ray5Transport === 'tcp' ? 'selected' : ''}>GRBL TCP · 8080</option><option value="esp3d" ${ray5Transport === 'esp3d' ? 'selected' : ''}>ESP3D · HTTP 8848 / WebSocket 8849</option></select></label>
      <label>${t('Port TCP ou HTTP','TCP or HTTP port')}<input name="port" type="number" min="1" max="65535" required value="${existing?.origin || detected?.origin ? Number(new URL(existing?.origin ?? detected.origin).port || 80) : 8080}"></label>
      <label data-ray5-ws ${ray5Transport === 'esp3d' ? '' : 'hidden'}>${t('Port WebSocket ESP3D','ESP3D WebSocket port')}<input name="wsPort" type="number" min="1" max="65535" value="${existing?.wsPort ?? detected?.wsPort ?? 8849}"></label>
      <label>${t('Port HTTP de la carte SD','SD card HTTP port')}<input name="httpPort" type="number" min="1" max="65535" required value="${existing?.httpPort ?? detected?.httpPort ?? (ray5Transport === 'tcp' ? 80 : 8848)}"></label>
      <small>${t('Pilotage expérimental en TCP ; ESP3D : supervision et SD. Aucun réglage Wi-Fi ou firmware modifié.', 'Experimental TCP controls; ESP3D: monitoring and SD. Wi-Fi and firmware settings are unchanged.')}</small>` : ''}
      ${isCC1 || isM2 || isRay5 ? '' : `<label>${t('Code d’accès LAN','LAN access code')}<input name="accessCode" type="password" ${existing ? '' : 'required'} minlength="${isBambu ? 8 : 1}" maxlength="${isBambu ? 8 : 64}" autocomplete="new-password"></label>`}
      ` : `
      <label>${t('Adresse ', 'Address for ')}${esc(addressLabel)}<input name="origin" type="url" placeholder="http://192.168.1.50${port === 80 ? '' : ':' + port}" required maxlength="200" value="${esc(existing?.origin ?? detected?.origin ?? '')}"></label>
      <label>${t('Clé API', 'API key')}${required ? '' : ' ' + t('(facultative)', '(optional)')}<input name="apiKey" type="password" ${required && !existing ? 'required' : ''} maxlength="256" autocomplete="new-password"></label>
      `}
      <label>${isCC1 ? t('MainboardID (facultatif)', 'MainboardID (optional)') : t('Numéro de série', 'Serial number')}<input ${serialField} value="${esc(serial)}"></label>
    </div>
    ${existing && !isCC1 && !isM2 && !isRay5 ? `<small>${t('Laissez le secret vide pour conserver la valeur enregistrée.', 'Leave the secret blank to keep the saved value.')}</small>` : ''}
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
    results.innerHTML = devices.map((device, index) => `<div class="row between wrap"><span>${esc(device.name ?? machineConnectors[device.kind]?.model ?? device.kind)} · ${esc(device.kind === 'klipper' && device.origin ? new URL(device.origin).host : device.host)}</span>
      ${device.registered ? `<small>${t('Déjà ajoutée','Already added')}${device.detected === false ? ' · ' + t('Aucune réponse reconnue', 'No recognized response') : device.candidate ? ' · ' + t('Identité à confirmer', 'Identity unconfirmed') : ''}</small>`
        : btn('detected:' + index, device.candidate ? t('Vérifier et configurer','Verify and configure') : t('Configurer','Configure'))}</div>`).join('');
  } catch (error) {
    if (!signal.aborted) status.textContent = problem(error.code);
  } finally {
    submit.disabled = form.elements.network.disabled = false;
  }
}

// « Détecter à nouveau » (modification d'une machine) : scanne le réseau de la machine, propose les appareils du même
// type non rattachés à une autre machine ; l'adresse choisie remplit le formulaire, enregistrée seulement sur « Enregistrer ».
let rediscovered = [];
const ipv4Number = address => address.split('.').reduce((total, part) => total * 256 + Number(part), 0);
function networkFor(host, networks) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host ?? '')) return networks[0];
  return networks.find(cidr => {
    const [base, bits] = cidr.split('/');
    const size = 2 ** (32 - Number(bits));
    return Math.floor(ipv4Number(host) / size) === Math.floor(ipv4Number(base) / size);
  }) ?? networks[0];
}
function machineHost(current) {
  try { return new URL(current.origin).hostname; } catch { return ''; }
}
async function rediscoverMachine(form) {
  const current = machine(form.elements.id?.value);
  const status = form.querySelector('[data-rediscover-status]');
  const results = form.querySelector('[data-rediscover-results]');
  const button = form.querySelector('[data-action="rediscover"]');
  if (!current || !status || button.disabled) return;
  discoveryCancel?.abort();
  discoveryCancel = new AbortController();
  const { signal } = discoveryCancel;
  button.disabled = true; rediscovered = []; results.replaceChildren();
  status.textContent = t('Recherche en cours… (jusqu’à une minute)', 'Scanning… (up to a minute)');
  try {
    const { networks } = await api('discovery', undefined, signal);
    const network = networkFor(machineHost(current), networks);
    if (!network) { status.textContent = t('Aucun réseau local disponible.', 'No local network available.'); return; }
    const { devices } = await api('discovery', { network }, signal);
    if (signal.aborted) return;
    const kind = current.kind ?? 'klipper', host = machineHost(current);
    const sameKind = devices.filter(device => device.kind === kind && device.detected !== false &&
      (!device.serial || !current.serial || device.serial.toUpperCase() === current.serial.toUpperCase()));
    // Toujours à la même adresse : rien à changer.
    if (sameKind.some(device => device.registered && device.name === current.name && device.host === host)) {
      status.textContent = t(`La machine répond toujours à ${host}. Aucun changement d’adresse nécessaire.`, `The machine still answers at ${host}. No address change needed.`);
      return;
    }
    rediscovered = sameKind.filter(device => !device.registered);
    status.textContent = rediscovered.length
      ? t('Choisissez la nouvelle adresse, puis cliquez sur Enregistrer.', 'Choose the new address, then click Save.')
      : t(`Aucune autre machine de ce type trouvée sur ${network}. Vérifiez qu’elle est allumée et connectée au Wi-Fi.`, `No other machine of this type found on ${network}. Check that it is on and connected to Wi-Fi.`);
    results.innerHTML = rediscovered.map((device, index) => `<div class="row between wrap"><span>${esc(device.host)}${device.transport ? ' · ' + (device.transport === 'tcp' ? 'GRBL TCP' : 'ESP3D') : ''}${device.serial ? ' · ' + esc(device.serial) : ''}</span>${btn('use-rediscovered:' + index, t('Utiliser cette adresse', 'Use this address'), '', 'primary')}</div>`).join('');
  } catch (error) {
    if (!signal.aborted) status.textContent = problem(error.code);
  } finally {
    button.disabled = false;
  }
}
function useRediscovered(form, device) {
  const elements = form.elements;
  if (elements.host) elements.host.value = device.host;
  if (elements.origin) elements.origin.value = device.origin ?? `http://${device.host}`;
  if (elements.transport && device.transport) {
    elements.transport.value = device.transport;
    elements.transport.dispatchEvent(new Event('change', { bubbles: true }));
    const origin = URL.parse(device.origin ?? '');
    if (origin?.port) elements.port.value = origin.port;
    if (device.httpPort) elements.httpPort.value = device.httpPort;
    if (device.wsPort && elements.wsPort) elements.wsPort.value = device.wsPort;
  }
  form.querySelector('[data-rediscover-results]').replaceChildren();
  form.querySelector('[data-rediscover-status]').textContent = t(`Adresse ${device.host} reprise dans le formulaire. Cliquez sur Enregistrer pour la valider.`, `Address ${device.host} filled in. Click Save to confirm it.`);
  form.querySelector('button[value="save"]')?.focus();
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
  if (action === 'nav' && ['home', 'machines', 'history'].includes(value)) { location.assign('/app#' + value); return; }
  if (action === 'nav') {
    live.page = value;
    renderLive();
    app.querySelector('h1')?.focus();
  }
  if (action === 'machine') { location.assign('/app#machine/' + encodeURIComponent(value)); return; }
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
  if (action === 'spool-edit') openManualSpool();
  if (action === 'machine-tab') selectMachineTab(value);
  if (action === 'files-focus') {
    selectMachineTab('files');
    const panel = app.querySelector('[data-files]');
    panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    panel?.querySelector('[data-files-search]')?.focus({ preventScroll: true });
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
  if (action === 'rediscover' && state.role === 'admin') { const form = target.closest('form'); if (form) await rediscoverMachine(form); }
  if (action === 'use-rediscovered') { const device = rediscovered[Number(value)], form = target.closest('form'); if (device && form) useRediscovered(form, device); }
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
      stopLiveUpdates();
      live.phase = 'login';
      cloudUI.data = null;
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
  if (formId(event.target.form) === 'manual-spool' && event.target.name === 'color') event.target.form.elements.knownColor.checked = true;
  if (!event.target.matches('#add-machine select[name="kind"]')) return;
  openMachineForm(event.target.value, event.target.form.elements.name.value);
  dialog.querySelector('select[name="kind"]').focus();
});

dialog.addEventListener('change', (event) => {
  if (formId(event.target.form) === 'add-machine' && event.target.name === 'transport') {
    const form = event.target.form;
    form.elements.port.value = event.target.value === 'tcp' ? '8080' : '8848';
    form.elements.httpPort.value = event.target.value === 'tcp' ? '80' : '8848';
    form.querySelector('[data-ray5-ws]').hidden = event.target.value !== 'esp3d';
    return;
  }
});

document.addEventListener('input', (event) => {
  const form = event.target.form;
  if (formId(form) === 'add-machine' && ['host', 'origin'].includes(event.target.name)) {
    const serialField = form.querySelector('[data-machine-serial]:not([name])');
    if (serialField) serialField.value = '';
  }
  if (formId(form) !== 'notifications-settings') return;
  const { ntfyMode, smtpEnabled } = form.elements;
  form.querySelector('[data-ntfy-internal]').hidden = ntfyMode.value !== 'internal';
  form.querySelector('[data-ntfy-external]').hidden = ntfyMode.value !== 'external';
  form.querySelector('[data-smtp-config]').hidden = !smtpEnabled.checked;
  for (const button of form.querySelectorAll('[data-action^="notify-test:"]')) button.disabled = true;
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (formId(form) === 'manual-spool') {
    event.preventDefault();
    const submit = event.submitter;
    if (state.role !== 'admin' || submit?.disabled) return;
    const data = Object.fromEntries(new FormData(form));
    const controls = [...form.querySelectorAll('button')];
    controls.forEach(button => { button.disabled = true; });
    try {
      await api('machines/' + form.dataset.machineId + '/spool', { spool: submit?.name === 'remove' ? null : { material: data.material, name: data.name, color: data.knownColor ? data.color : null } });
      dialog.close();
      await refresh();
      renderLive();
      toast(t('Information de bobine enregistrée.', 'Spool information saved.'));
    } catch (error) { form.querySelector('.error').textContent = problem(error.code); }
    finally { controls.forEach(button => { button.disabled = false; }); }
    return;
  }
  if (formId(form) === 'notifications-settings') {
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
  if (formId(form) === 'discover-machines') {
    event.preventDefault();
    if (!form.querySelector('button[type="submit"]').disabled) await scanFromForm(form);
    return;
  }
  if (!['credentials','add-machine','add-observer'].includes(formId(form))) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const errorText = form.querySelector('.error');
  if (live.phase === 'setup' && data.password !== data.confirm) {
    errorText.textContent = t('Les mots de passe diffèrent.','Passwords do not match.');
    return;
  }
  delete data.confirm;
  const pairing = formId(form) === 'add-machine' && event.submitter?.value === 'pair';
  const pairingAbort = pairing ? new AbortController() : null;
  const cancelPairing = () => pairingAbort.abort();
  if (pairing) dialog.addEventListener('close', cancelPairing, { once: true });
  const controls = [...form.elements].filter(element => !element.disabled && (!pairing || element.dataset.action !== 'close'));
  controls.forEach((element) => { element.disabled = true; });
  errorText.textContent = '';
  try {
    if (formId(form) === 'add-observer') {
      await api('observers', data);
      dialog.close();
      toast(t('Compte observateur créé.','Observer account created.'));
    } else if (formId(form) === 'add-machine') {
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
const gcode = { machine: null, path: '', size: 0, result: null, layer: 0, read: 0, loading: null, error: '', travel: true, previous: true, follow: true, view: null, mode: '2d', yaw: -0.6, pitch: 0.65, playing: false, cursor: null, speed: 10, frame: null };
const manualStates = new Map();
function manualState(id) {
  if (!manualStates.has(id)) manualStates.set(id, { data: null, at: 0, loading: false, busy: false, error: '', result: '' });
  return manualStates.get(id);
}
function ray5ControlsPanel(m, part) {
  const entry = manualState(m.id), laser = entry.data?.laser;
  if (part === 'heat') return unavailablePanel(t('Températures','Temperatures'), t('Non applicable à ce laser.', 'Not applicable to this laser.'));
  const admin = state.role === 'admin', busy = entry.busy || !laser?.writable;
  const idle = !busy && laser?.nativeState === 'Idle';
  const action = (key,label,enabled = true) => admin ? btn('ray5-control:'+key,label,'',key === 'reset' ? 'danger' : '',busy || !enabled ? 'disabled' : '') : '';
  const error = entry.error ? `<p class="error" role="alert">${esc(entry.error)}</p>` : '';
  const result = entry.result ? `<p role="status">${esc(entry.result)}</p>` : '';
  const content = !admin ? unavailableContent(t('Lecture seule : commandes réservées à un administrateur.','Read only: controls are restricted to an administrator.')) : part === 'motion' ? `<div class="jog-layout"><div class="jog-pad">${[['Y',1,'↑','1/2'],['X',-1,'←','2/1'],['X',1,'→','2/3'],['Y',-1,'↓','3/2']].map(([axis,sign,label,grid]) => btn('manual-jog:'+axis+':'+sign,label,'','',`${idle ? '' : 'disabled'} aria-label="${axis} ${sign > 0 ? '+' : '−'}" style="grid-area:${grid}"`)).join('')}<span style="grid-area:2/2">XY</span></div></div>
    <div class="jog-options"><label>${t('Pas','Step')} <select data-jog-step ${idle ? '' : 'disabled'}><option value="0.1">0,1 mm</option><option value="1" selected>1 mm</option><option value="10">10 mm</option></select></label>${action('zero',t('Définir zéro XY · G54','Set XY zero · G54'),idle)}${entry.data?.motion?.home ? action('home',t('Prise d’origine','Home'),idle) : ''}${action('jog-cancel',t('Annuler déplacement','Cancel jog'),laser?.nativeState === 'Jog')}</div><small>${t('M5 avant chaque mouvement · avance 600 mm/min · limites à vérifier physiquement. Axe Z motorisé non déclaré.','M5 before each move · feed 600 mm/min · physically verify travel limits. No motorized Z axis declared.')}</small>`
    : `<div class="row wrap">${action('laser-off',t('Couper laser · M5','Laser off · M5'))}${action('reset',t('Arrêt / Reset GRBL','Stop / GRBL reset'))}${action('unlock',t('Déverrouiller alarme','Unlock alarm'),laser?.nativeState === 'Alarm')}</div>
      <p class="notice">${t('Reset abandonne le travail et peut invalider la position. Aucun déverrouillage automatique. Ce bouton dépend du réseau et ne remplace pas l’arrêt matériel.','Reset abandons the job and may invalidate position. No automatic unlock. This network-dependent button does not replace the hardware stop.')}</p>
      ${laser?.mode && laser.max > 0 ? `<form class="row wrap" data-ray5-pulse><label>${t('Test laser (%)','Laser test (%)')}<input name="value" type="number" min="1" max="5" value="1" required ${idle ? '' : 'disabled'}></label><label>${t('Durée','Duration')}<select name="duration" ${idle ? '' : 'disabled'}><option value="100">100 ms</option><option value="250">250 ms</option><option value="500">500 ms</option></select></label><button type="submit" ${idle ? '' : 'disabled'}>${t('Impulsion','Pulse')}</button></form><small>${t('Consigne calculée depuis $30 ; ce pourcentage n’est pas une mesure de puissance optique.','Setpoint calculated from $30; this percentage is not an optical power measurement.')}</small>` : `<small>${t('Test laser désactivé tant que $30 et le mode laser $32 ne sont pas lus.','Laser test disabled until $30 and laser mode $32 are read.')}</small>`}
      ${!laser ? `<p>${t('Contrôles TCP indisponibles : attendre un rapport récent et les réponses GRBL. Le mode ESP3D reste en supervision.','TCP controls unavailable: wait for fresh status and GRBL responses. ESP3D remains monitoring only.')}</p>` : ''}`;
  return `<section class="panel stack" data-manual-controls="${part}"><div class="row between"><h2>${part === 'motion' ? t('Déplacements XY','XY movement') : t('Laser / contrôleur','Laser / controller')}</h2>${part === 'quick' ? btn('manual-refresh',t('Actualiser','Refresh')) : ''}</div>${content}${error}${result}</section>`;
}

const speedModes = () => [t('Silencieux','Silent'), t('Équilibré','Balanced'), t('Sport','Sport'), t('Ludicrous','Ludicrous')];
function manualControlsPanel(m, part = 'all') {
  if (m.kind === 'longer-ray5') return ray5ControlsPanel(m,part);
  if (!machineConnectors[m.kind]?.controls) {
    const title = part === 'heat' ? t('Températures','Temperatures') : part === 'quick' ? t('Actions rapides','Quick actions') : part === 'motion' ? t('Déplacements','Movement') : t('Contrôles','Controls');
    const message = t('Commandes non prises en charge par cette connexion.', 'Controls not supported by this connection.');
    if (part === 'quick') return `<section class="panel stack machine-unavailable"><h2>${title}</h2><h3>${t('Éclairage','Lighting')}</h3>${unavailableContent(message)}<h3>${t('Ventilateurs','Fans')}</h3>${unavailableContent(message)}</section>`;
    return unavailablePanel(title, message);
  }
  const entry = manualState(m.id), data = entry.data;
  const admin = state.role === 'admin';
  const online = data && !entry.error && ['ready', 'done', 'printing', 'paused'].includes(m.status) && ['ready', 'done', 'printing', 'paused'].includes(data.status);
  const disabled = entry.busy || !online ? 'disabled' : '';
  const value = (n, suffix = '') => Number.isFinite(n) ? n.toLocaleString(state.lang, { maximumFractionDigits: 1 }) + suffix : '—';
  const labels = { chamber_light: t('Caisson','Chamber'), main: t('Caisson','Chamber'), fan: t('Pièce','Part'), part: t('Pièce','Part'), aux: t('Auxiliaire','Auxiliary'), chamber: t('Caisson','Chamber'), aux_fan: t('Auxiliaire','Auxiliary'), box_fan: t('Caisson','Chamber'), heater_fan: t('Tête','Hotend'), controller_fan: t('Électronique','Controller'), nozzle: t('Buse','Nozzle'), bed: t('Plateau','Bed') };
  const label = id => labels[id] || id;
  const setting = (item, action, index) => admin && item.writable ? `<form class="row wrap" data-manual-form="${action}" data-control-id="${esc(item.id)}">
    <label>${action === 'heat' ? t('Cible','Target') : '%'} <input name="value" aria-label="${esc(label(item.id))} ${action === 'heat' ? '°C' : '%'}" type="number" min="0" max="${action === 'heat' ? item.max : 100}" step="1" required placeholder="${Number.isFinite(action === 'heat' ? item.target : item.percent) ? (action === 'heat' ? item.target : item.percent) : '—'}" ${disabled}></label>
    <button type="submit" ${disabled}>${t('Appliquer','Apply')}</button>${action === 'heat' ? btn('manual-off:' + index, t('Couper','Off'), '', '', disabled) : ''}</form>` : '';
  const heaters = data?.heaters ?? [{ id: 'nozzle', current: m.nozzle, target: null }, { id: 'bed', current: m.bed, target: null }];
  const heat = `<div class="stack">${heaters.map((item, index) => `<div class="control-heater"><p><strong>${label(item.id)}</strong> <span data-control-current="${item.id}">${value(item.current, ' °C')}</span> <small>→ ${value(item.target, ' °C')}</small></p>${setting(item, 'heat', index)}</div>`).join('')}</div>`;
  const missingEquipment = entry.error || (m.status === 'offline' ? t('Machine hors ligne.', 'Machine offline.') : !data ? t('Lecture des équipements…', 'Reading equipment…') : t('Équipement absent ou non communiqué.', 'Equipment absent or not reported.'));
  const quick = `<div class="stack"><div class="stack"><h3>${t('Éclairage','Lighting')}</h3>${data?.lights.map((item, index) => `<div class="quick-control"><span>${esc(label(item.id))}</span>${admin && item.writable ? btn('manual-light:' + index + ':' + (item.value === true ? 'off' : 'on'), item.value === true ? t('Allumé','On') : item.value === false ? t('Éteint','Off') : t('Allumer','Turn on'), 'sun', 'control-switch', `${disabled} aria-pressed="${item.value === true}" aria-label="${t('Basculer l’éclairage','Toggle lighting')} ${esc(label(item.id))}"`) : `<span>${item.value === true ? t('Allumé','On') : item.value === false ? t('Éteint','Off') : '—'}</span>`}</div>`).join('') || unavailableContent(missingEquipment)}</div>
    <div class="stack"><h3>${t('Ventilateurs','Fans')}</h3>${data?.fans.map(item => `<div class="quick-control"><span>${esc(label(item.id))} · ${value(item.percent, ' %')}${Number.isFinite(item.rpm) ? ' · ' + value(item.rpm, ' tr/min') : ''}</span>${setting(item, 'fan')}</div>`).join('') || unavailableContent(missingEquipment)}</div>
    ${data?.speed ? `<div class="stack"><h3>${t('Mode de vitesse','Speed mode')}</h3><div class="quick-control"><span>${speedModes()[data.speed.mode]}</span>${admin && data.speed.writable ? `<form class="row wrap" data-manual-form="speed"><select name="value" aria-label="${t('Mode de vitesse','Speed mode')}" ${disabled}>${speedModes().map((name, mode) => `<option value="${mode}" ${mode === data.speed.mode ? 'selected' : ''}>${name}</option>`).join('')}</select><button type="submit" ${disabled}>${t('Appliquer','Apply')}</button></form>` : `<small>${t('Modifiable pendant une impression.','Can be changed during a print.')}</small>`}</div></div>` : ''}
    ${m.kind === 'elegoo' ? `<small>${t('CC2 : ventilateurs tête et électronique en lecture seule ; deux secondes minimum entre deux commandes.', 'CC2: hotend and controller fans are read-only; at least two seconds between commands.')}</small>` : ''}</div>`;
  const canMove = data?.motion && online && ['ready', 'done'].includes(data.status) && ['ready', 'done'].includes(m.status) && !entry.busy;
  const canJog = canMove && (data.motion.homed === null ? (!data.motion.axes || data.motion.axes.length > 0) : ['x','y','z'].every(a => data.motion.homed.includes(a)));
  const jog = (axis, sign, text, grid) => data?.motion ? btn('manual-jog:' + axis + ':' + sign, text, '', '', `${canJog ? '' : 'disabled'} aria-label="${axis} ${sign > 0 ? '+' : '−'}" ${grid ? `style="grid-area:${grid}"` : ''}`) : `<button type="button" disabled aria-label="${axis} ${sign > 0 ? '+' : '−'}" ${grid ? `style="grid-area:${grid}"` : ''}>${text}</button>`;
  const motion = admin ? `<div class="stack"><div class="jog-layout"><div class="jog-pad">${jog('Y', 1, '↑', '1/2')}${jog('X', -1, '←', '2/1')}<span style="grid-area:2/2">XY</span>${jog('X', 1, '→', '2/3')}${jog('Y', -1, '↓', '3/2')}</div><div class="jog-z"><small>${m.kind === 'bambu' ? t('Plateau (Z)','Bed (Z)') : t('Axe Z','Z axis')}</small>${jog('Z', 1, 'Z +')}${jog('Z', -1, 'Z −')}</div></div>
    <div class="jog-options"><label>${t('Pas','Step')} <select data-jog-step ${canMove ? '' : 'disabled'}><option value="0.1">0,1 mm</option><option value="1" selected>1 mm</option><option value="10">10 mm</option></select></label>${data?.motion ? btn('manual-home', t('Origine XYZ','Home XYZ'), '', '', canMove ? '' : 'disabled') : `<button type="button" disabled>${t('Origine XYZ','Home XYZ')}</button>`}</div>
    <p class="jog-note">${!data?.motion ? t('Déplacements non disponibles sur ce connecteur.','Movement unavailable on this connector.') : data.motion.fabcoreHoming ? (data.motion.axes.length ? t('Origine faite depuis FabCore ; limites vérifiées par le firmware.','Homed from FabCore; limits checked by firmware.') : t('Mettre à l’origine depuis FabCore avant tout déplacement.','Home from FabCore before any movement.')) : data.motion.homed === null ? t('Origine et limites vérifiées par le firmware.','Homing and limits checked by firmware.') : t('Axes référencés','Homed axes') + ' : ' + (esc(data.motion.homed) || '—')}${data?.motion ? ' · ' + t('Bloqué pendant impression/pause.','Blocked during printing/pause.') : ''}</p></div>` : unavailableContent(t('Lecture seule : commandes réservées à un administrateur.', 'Read only: controls are restricted to an administrator.'));

  const title = part === 'heat' ? t('Températures','Temperatures') : part === 'quick' ? t('Actions rapides','Quick actions') : part === 'motion' ? t('Déplacements','Movement') : t('Contrôles','Controls');
  return `<section class="panel stack ${part === 'heat' ? 'machine-temperature' : ''}" data-manual-controls="${part}"><div class="row between"><h2>${title}</h2>${part === 'quick' ? btn('manual-refresh', t('Actualiser','Refresh'), '', 'ghost', entry.loading ? 'disabled' : '') : ''}</div>
    ${part === 'heat' ? heat + `<div data-temperature-plot>${temperaturePlot(m)}</div>` : part === 'quick' ? quick : part === 'motion' ? (!data?.motion && admin ? unavailableContent(t('Déplacements non disponibles sur ce connecteur.', 'Movement unavailable on this connector.')) : motion) : heat + quick + motion}
    ${part === 'quick' || part === 'all' ? `${entry.error ? `<p class="error" role="alert">${esc(entry.error)}</p>` : ''}${entry.result ? `<p role="status">${esc(entry.result)}</p>` : ''}` : ''}
  </section>`;
}
function renderManualControls(id, force = false) {
  if (state.machine !== id || live.page !== 'detail') return;
  for (const panel of app.querySelectorAll('[data-manual-controls]')) {
    if (force || !panel.contains(document.activeElement)) panel.outerHTML = manualControlsPanel(machine(id), panel.dataset.manualControls || 'all');
  }
}
async function loadManualControls(id, force = false) {
  if (!machineConnectors[machine(id)?.kind]?.controls || live.page !== 'detail' || machineTab(id) !== 'overview' || state.machine !== id) return;
  const entry = manualState(id);
  if (entry.loading || entry.busy || (!force && Date.now() - entry.at < 10000)) return;
  entry.loading = true;
  try { entry.data = await api('machines/' + id + '/controls'); entry.error = ''; }
  catch (error) { entry.error = problem(error.code); }
  finally {
    entry.loading = false; entry.at = Date.now();
    renderManualControls(id, force);
  }
}
async function sendManualControl(id, command) {
  if (state.role !== 'admin') return;
  const entry = manualState(id);
  if (entry.busy) return;
  const printing = ['printing', 'paused'].includes(entry.data?.status);
  if (machine(id)?.kind === 'longer-ray5' && ['zero','unlock','reset','laser-pulse'].includes(command.action) && !window.confirm(t('Confirmer cette action sur la Ray5 ? Pour une impulsion, soyez présent avec les protections laser et la zone dégagée.','Confirm this Ray5 action? For a pulse, be present with laser protection and a clear work area.'))) return;
  if (command.action === 'home' && !window.confirm(t('Effectuer la prise d’origine XYZ ? Vérifiez que les axes sont dégagés.', 'Home XYZ? Check that the axes are clear.'))) return;
  if (printing && ['heat', 'fan', 'speed'].includes(command.action) && !window.confirm(t('Modifier ce réglage pendant la fabrication ou sa pause ?', 'Change this setting during the print or its pause?'))) return;
  entry.busy = true; entry.error = ''; entry.result = '';
  app.querySelectorAll('[data-manual-controls] button,[data-manual-controls] input,[data-manual-controls] select').forEach(node => { node.disabled = true; });
  try {
    const result = await api('machines/' + id + '/controls', { ...command, confirm: true, duringPrint: printing });
    entry.result = machine(id)?.kind === 'longer-ray5' && result.outcome === 'confirmed' ? t('État d’arrêt confirmé par un nouveau rapport GRBL.','Stopped state confirmed by a new GRBL report.') : result.outcome === 'confirmed' ? t('Consigne confirmée par la machine.','Setpoint confirmed by the machine.') : result.outcome === 'executed' ? t('Commande exécutée.','Command executed.') : t('Commande acceptée ; vérifiez le retour machine.','Command accepted; check the machine report.');
  } catch (error) { entry.error = problem(error.code); }
  finally {
    entry.busy = false;
    if (state.machine === id && live.page === 'detail') {
      renderManualControls(id, true);
      loadManualControls(id, true);
    }
  }
}
app.addEventListener('submit', event => {
  const form = event.target.closest('[data-manual-form]');
  if (!form) return;
  event.preventDefault();
  const value = Number(new FormData(form).get('value'));
  sendManualControl(state.machine, { action: form.dataset.manualForm, id: form.dataset.controlId, value });
});
app.addEventListener('click', event => {
  const [action, index, value] = (event.target.closest('[data-action]')?.dataset.action ?? '').split(':');
  if (!action.startsWith('manual-')) return;
  const data = manualState(state.machine).data;
  if (action === 'manual-refresh') return loadManualControls(state.machine, true);
  if (!data) return;
  if (action === 'manual-light' && data.lights[index]) sendManualControl(state.machine, { action: 'light', id: data.lights[index].id, value: value === 'on' });
  if (action === 'manual-off' && data.heaters[index]) sendManualControl(state.machine, { action: 'heat', id: data.heaters[index].id, value: 0 });
  if (action === 'manual-home') sendManualControl(state.machine, { action: 'home' });
  if (action === 'manual-jog') sendManualControl(state.machine, { action: 'move', axis: index, distance: Number(app.querySelector('[data-jog-step]').value) * Number(value) });
});

const machineFiles = new Map();
const fileName = (path) => path.split('/').at(-1);

function filesState(id) {
  if (!machineFiles.has(id)) machineFiles.set(id, { files: null, loading: false, error: '', upload: null, query: '', sort: 'newest', page: 0, pageSize: 5, truncated: false });
  return machineFiles.get(id);
}

function liveFile(m) {
  return (m.status === 'printing' || m.status === 'paused') && typeof m.filePath === 'string' && Number.isFinite(m.filePosition) ? m.filePath : null;
}

function canStart(m) {
  return state.role === 'admin' && (m.status === 'ready' || m.status === 'done');
}

function filePage(entry) {
  const query = entry.query.trim().toLocaleLowerCase(state.lang);
  const byName = (a, b) => a.file.path.localeCompare(b.file.path, state.lang, { numeric: true, sensitivity: 'base' }) || a.index - b.index;
  const rows = (entry.files ?? []).map((file, index) => ({ file, index })).filter(({ file }) => file.path.toLocaleLowerCase(state.lang).includes(query));
  rows.sort((a, b) => {
    if (entry.sort === 'name') return byName(a, b);
    const aDate = Number.isFinite(a.file.modified) ? a.file.modified : null;
    const bDate = Number.isFinite(b.file.modified) ? b.file.modified : null;
    if (aDate === null || bDate === null) return aDate === bDate ? byName(a, b) : aDate === null ? 1 : -1;
    return (entry.sort === 'oldest' ? aDate - bDate : bDate - aDate) || byName(a, b);
  });
  const pageSize = entry.pageSize === 20 ? 20 : 5;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  entry.page = Math.max(0, Math.min(entry.page, pages - 1));
  const start = entry.page * pageSize;
  return { rows: rows.slice(start, start + pageSize), count: rows.length, pages, start };
}

function filesPanel(m) {
  if (!machineConnectors[m.kind]?.files) return `<section class="panel stack"><h2>${t('Visualiseur G-code','G-code viewer')}</h2><label>${t('Ouvrir un fichier local pour visualiser ses trajectoires','Open a local file to view its toolpaths')}<input type="file" accept=".gcode,.gco,.g,.gc,.nc" data-gcode-local></label><p class="muted">${t('Le transfert des projets natifs de cette machine n’est pas encore pris en charge. Cet aperçu local n’envoie aucune commande.', 'Native project transfer for this machine is not supported yet. This local preview sends no commands.')}</p></section>`;
  const entry = filesState(m.id);
  const current = liveFile(m);
  const page = filePage(entry);
  const size = (bytes) => bytes === null ? '—' : bytes >= 1048576 ? (bytes / 1048576).toLocaleString(state.lang, { maximumFractionDigits: 1 }) + ' Mo' : Math.ceil(bytes / 1024).toLocaleString(state.lang) + ' ko';
  const date = (at) => at ? new Date(at).toLocaleString(state.lang, { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const upload = entry.upload;
  return `<section class="panel stack" data-files data-file-start="${canStart(m)}"><style>.file-download{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:9px 13px;border:1px solid var(--line);border-radius:8px;text-decoration:none;color:var(--text);font-weight:600}.file-download:hover{background:var(--raised)}</style>
      <div class="row between wrap"><h2>${machineConnectors[m.kind]?.retainedOnly ? t('Fichiers envoyés via FabCore','Files uploaded through FabCore') : t('Fichiers de la machine','Machine files')}</h2>${btn('files-refresh', t('Actualiser','Refresh'), '', 'ghost', entry.loading ? 'disabled' : '')}</div>
      ${machineConnectors[m.kind]?.retainedOnly ? `<p class="notice">${t('Fichiers envoyés via FabCore uniquement : le protocole ne fournit pas ici la liste complète du stockage de la machine.', 'Only files uploaded through FabCore: the protocol does not provide a complete storage listing here.')}</p>` : ''}
      ${m.kind === 'longer-ray5' ? `<p class="notice">${t('Carte SD native · lecture à l’arrêt · 16 Mio par fichier · inventaire limité à 300 fichiers / 24 dossiers / 3 sous-niveaux. Tailles et dates non fiables : affichées inconnues. Aucun transfert vers une imprimante FDM.','Native SD card · read while idle · 16 MiB per file · inventory limited to 300 files / 24 folders / 3 sublevels. Unreliable sizes and dates are shown as unknown. No transfer to FDM printers.')}</p>` : ''}
      ${m.kind === 'elegoo' ? `<p class="notice">${t('Stockage interne CC2 · inventaire natif MQTT 1044, limité à 300 entrées. Téléchargement et visualisation selon le firmware. Les anciennes copies FabCore ne sont pas présentées comme des fichiers encore présents.', 'CC2 internal storage · native MQTT 1044 inventory, limited to 300 entries. Download and preview depend on firmware. Old FabCore copies are not presented as files still on the printer.')}</p>` : ''}
      <label>${t('Visualiser un G-code local sans l’envoyer','Preview a local G-code without uploading it')}<input type="file" accept=".gcode,.gco,.g,.gc,.nc" data-gcode-local></label>
      ${current ? `<div class="notice row between wrap"><span>${t('Impression en cours','Print in progress')} · <strong>${esc(fileName(current))}</strong></span>${btn('viewer-live', t('Suivre en direct','Follow live'), 'activity', 'primary')}</div>` : ''}
      ${state.role === 'admin' ? `<label class="stack"><span>${t('Envoyer un fichier G-code sur la machine','Upload a G-code file to the machine')}</span>
        <input type="file" accept=".gcode,.gco,.g${m.kind === 'longer-ray5' ? ",.gc,.nc" : ""}${machineConnectors[m.kind]?.projects ? ",.3mf" : ""}" data-files-upload ${upload ? 'disabled' : ''}></label>
        ${upload ? `<p role="status">${t('Envoi de','Uploading')} ${esc(upload.name)}… <span data-upload-percent>${upload.percent}</span> %</p><progress value="${upload.percent}" max="100" data-upload-bar></progress>` : ''}` : ''}
      <div class="row wrap" style="align-items:end">
        <label class="stack" style="flex:2 1 220px;min-width:0">${t('Rechercher un fichier','Search files')}<input type="search" data-files-search value="${esc(entry.query)}" placeholder="${t('Nom du fichier…','File name…')}" maxlength="200"></label>
        <label class="stack" style="flex:1 1 180px">${t('Trier par','Sort by')}<select data-files-sort>
          <option value="newest" ${entry.sort === 'newest' ? 'selected' : ''}>${t('Plus récent → plus ancien','Newest → oldest')}</option>
          <option value="oldest" ${entry.sort === 'oldest' ? 'selected' : ''}>${t('Plus ancien → plus récent','Oldest → newest')}</option>
          <option value="name" ${entry.sort === 'name' ? 'selected' : ''}>${t('Nom : A → Z','Name: A → Z')}</option>
        </select></label>
        <label class="stack">${t('Par page','Per page')}<select data-files-size><option value="5" ${entry.pageSize === 5 ? 'selected' : ''}>5</option><option value="20" ${entry.pageSize === 20 ? 'selected' : ''}>20</option></select></label>
      </div>
      ${entry.truncated ? `<p class="notice">${t('Liste limitée aux 300 fichiers chargés. La recherche et le tri portent sur cette liste.', 'List limited to 300 loaded files. Search and sorting apply to this list.')}</p>` : ''}
      ${entry.error ? `<p class="error" role="alert">${esc(entry.error)}</p>` : ''}
      ${entry.files === null ? `<p role="status">${t('Chargement de la liste…','Loading the list…')}</p>` : page.count ? `<div class="table"><table>
        <thead><tr><th>${t('Fichier','File')}</th><th>${t('Taille','Size')}</th><th>${t('Modifié','Modified')}</th><th><span class="hide-mobile">${t('Actions','Actions')}</span></th></tr></thead>
        <tbody>${page.rows.map(({ file, index }) => `<tr><td>${esc(file.path)}</td><td>${size(file.size)}</td><td>${date(file.modified)}</td>
          <td><div class="row wrap">${btn('viewer-open:' + index, t('Visualiser','View'))}<a class="file-download" href="/api/machines/${esc(m.id)}/file?download=1&amp;path=${esc(encodeURIComponent(file.path))}" download>${t('Télécharger','Download')}</a>${state.role === 'admin' ? btn('files-transfer:' + index, t('Transférer','Transfer')) : ''}${canStart(m) ? btn('files-print:' + index, t('Lancer','Start')) : ''}</div></td></tr>`).join('')}</tbody>
      </table></div>
      <div class="row between wrap" aria-label="${t('Pagination des fichiers','File pagination')}">
        <small role="status">${page.start + 1}–${page.start + page.rows.length} ${t('sur','of')} ${page.count}${entry.query.trim() ? ' · ' + t('résultats','results') : ' · ' + t('fichiers','files')}</small>
        <div class="row wrap">${btn('files-page:previous', t('Précédent','Previous'), '', 'ghost', entry.page === 0 ? 'disabled' : '')}
          <span>${t('Page','Page')} ${entry.page + 1} / ${page.pages}</span>
          ${btn('files-page:next', t('Suivant','Next'), '', 'ghost', entry.page + 1 >= page.pages ? 'disabled' : '')}</div>
      </div>` : `<p class="muted" role="status">${entry.query.trim() ? t('Aucun fichier ne correspond à cette recherche.','No files match this search.') : machineConnectors[m.kind]?.retainedOnly ? t('Aucun fichier envoyé via FabCore. Les fichiers préinstallés ou envoyés autrement ne sont pas listés ici.', 'No files uploaded through FabCore. Preinstalled files and files sent by other software are not listed here.') : t('Aucun fichier pris en charge trouvé dans le stockage interrogé.','No supported files found in the queried storage.')}</p>`}
    </section>`;
}

function renderFiles(id) {
  const m = machine(id);
  const panel = app.querySelector('[data-files]');
  if (!m || !panel || state.machine !== id || live.page !== 'detail') return;
  const focused = document.activeElement;
  const searchFocused = panel.contains(focused) && focused.matches('[data-files-search]');
  const selection = searchFocused ? [focused.selectionStart, focused.selectionEnd] : null;
  panel.outerHTML = filesPanel(m);
  if (searchFocused) {
    const search = app.querySelector('[data-files-search]');
    search?.focus({ preventScroll: true });
    if (selection) search?.setSelectionRange(...selection);
  }
}

async function loadFiles(id) {
  const entry = filesState(id);
  if (entry.loading) return;
  entry.loading = true;
  entry.error = '';
  renderFiles(id);
  try {
    const result = await api('machines/' + id + '/files');
    entry.files = result.files;
    entry.truncated = result.truncated === true;
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
  if (!/^[\x20-\x7E]{1,200}$/.test(file.name) || file.name.includes('/') || !(machine(id)?.kind === 'longer-ray5' ? /\.(gcode|gco|g|gc|nc)$/i : machineConnectors[machine(id)?.kind]?.projects ? /\.(gcode|gco|g|3mf)$/i : /\.(gcode|gco|g)$/i).test(file.name)) {
    entry.error = t('Nom invalide : caractères ASCII et extension prise en charge par la machine.', 'Invalid name: ASCII characters and an extension supported by the machine.');
    return renderFiles(id);
  }
  if (file.size > (machine(id)?.kind === 'longer-ray5' ? 16 * 1024 * 1024 : gcodeLimit) || file.size < 1) {
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
      entry.error = request.status === 0 ? t('Envoi interrompu. Vérifiez la liste avant de recommencer.', 'Upload interrupted. Check the list before trying again.') : problem(code || (request.status === 413 ? 'upload-proxy-limit' : ''));
      renderFiles(id);
    }
  };
  request.send(file);
}

function fileTransferCandidates(id, path) {
  return state.machines.filter(m => m.id !== id && machineConnectors[m.kind]?.files &&
    (machineConnectors[m.kind]?.fileFamily ?? 'fdm') === (machineConnectors[state.machines.find(item => item.id === id)?.kind]?.fileFamily ?? 'fdm') &&
    (!/\.3mf$/i.test(path) || machineConnectors[m.kind]?.projects));
}

// Sequential copies avoid multiplying sessions to the same source machine.
// Each operation is attempted once; an unknown outcome is never retried here.
async function runFileBatch(items, operation, changed, started) {
  const results = [];
  for (const item of items) {
    started?.(item);
    let result;
    try { result = { item, ok: true, value: await operation(item) }; }
    catch (error) { result = { item, ok: false, error }; }
    results.push(result);
    changed?.(result, results.length, items.length);
  }
  return results;
}

function fileBatchStyles() {
  return `<style>#transfer-file fieldset,#transfer-print fieldset{max-height:28vh;overflow:auto;margin:0;border:1px solid var(--line);border-radius:8px}#transfer-file input[type=checkbox],#transfer-print input[type=checkbox]{min-height:0;flex:none}.transfer-line>span:first-child{overflow-wrap:anywhere}.transfer-list[hidden]{display:none}.transfer-list{list-style:none;padding:0;margin:0;display:grid;gap:8px;max-height:35vh;overflow:auto}.transfer-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px;border:1px solid var(--line);border-radius:8px}.transfer-line>span:last-child{text-align:right}.transfer-spinner{display:inline-block;width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:transfer-spin .8s linear infinite;vertical-align:middle;margin-right:6px}@keyframes transfer-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.transfer-spinner{animation:none}}</style>`;
}

function fileBatchRows(items) {
  return items.map(item => `<li class="transfer-line" data-batch-machine="${esc(item.id)}"><span>${esc(item.name)}</span><span class="muted" data-batch-status>${t('En attente','Queued')}</span></li>`).join('');
}

function updateFileBatch(list, item, phase, message) {
  const row = [...list.querySelectorAll('[data-batch-machine]')].find(row => row.dataset.batchMachine === item.id);
  if (!row) return;
  const status = row.querySelector('[data-batch-status]');
  status.className = phase === 'success' ? 'good' : phase === 'error' ? 'bad' : 'muted';
  status.innerHTML = phase === 'running' ? '<span class="transfer-spinner" aria-hidden="true"></span>' : `<span aria-hidden="true">${phase === 'success' ? '✓' : '✕'}</span> `;
  status.append(document.createTextNode(message));
}

function openFileTransfer(id, path) {
  if (state.role !== 'admin') return;
  const destinations = fileTransferCandidates(id, path);
  dialog.innerHTML = `<form id="transfer-file" class="stack">
    ${fileBatchStyles()}<h2>${t('Transférer un fichier','Transfer a file')}</h2>
    <p>${esc(machine(id).name)} · <strong>${esc(path)}</strong></p>
    ${destinations.length ? `<fieldset class="stack"><legend>${t('Une ou plusieurs machines de destination','One or more destination machines')}</legend>
      ${destinations.map(m => `<label class="row"><input type="checkbox" name="destination" value="${esc(m.id)}">${esc(m.name)}</label>`).join('')}</fieldset>
      <label class="stack">${t('Nom du fichier à destination','Destination file name')}<input name="name" required maxlength="200" value="${esc(fileName(path))}"></label>
      <p class="notice">${t('Le fichier est copié sans être retranché. Vérifiez sa compatibilité avec chaque destination. Vous pourrez choisir les impressions à lancer après les copies.', 'The file is copied without re-slicing. Check compatibility with each destination. You can choose which prints to start after the copies.')}</p>` : `<p class="notice">${t('Aucune autre machine ne prend en charge le transfert de ce format.','No other machine supports transferring this format.')}</p>`}
    <p class="error" role="alert"></p><p role="status" hidden></p><ul class="transfer-list" data-transfer-results aria-live="polite" hidden></ul>
    <div class="row wrap">${btn('close', t('Annuler','Cancel'))}${destinations.length ? `<button type="submit" class="primary">${t('Transférer vers la sélection','Transfer to selected machines')}</button>` : ''}</div>
  </form>`;
  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (form.dataset.busy) return;
    const data = new FormData(form);
    const selected = destinations.filter(m => data.getAll('destination').includes(m.id));
    if (!selected.length) { form.querySelector('[role="alert"]').textContent = t('Choisissez au moins une machine.','Select at least one machine.'); return; }
    form.dataset.busy = 'true';
    form.querySelectorAll('button,input,select').forEach(control => { control.disabled = true; });
    const status = form.querySelector('[role="status"]');
    status.hidden = false;
    status.textContent = t('Transfert en cours…','Transferring…');
    form.querySelector('[role="alert"]').textContent = '';
    const list = form.querySelector('[data-transfer-results]');
    list.hidden = false;
    list.innerHTML = fileBatchRows(selected);
    const results = await runFileBatch(selected, m => api('machines/' + id + '/transfer', {
      path, destination: m.id, name: data.get('name'), confirm: true
    }), (result, count, total) => {
      status.textContent = `${count} / ${total}`;
      updateFileBatch(list, result.item, result.ok ? 'success' : 'error', result.ok ? t('Transféré','Transferred') : problem(result.error.code || 'upload-failed'));
      if (result.ok) filesState(result.item.id).files = null;
    }, item => updateFileBatch(list, item, 'running', t('Transfert…','Transferring…')));
    if (form.isConnected && dialog.open) openTransferredPrint(results);
  });
  dialog.showModal();
}

function openTransferredPrint(results) {
  const successful = results.filter(result => result.ok).map(result => ({ id: result.item.id, name: result.item.name, path: result.value.path }));
  const eligible = successful.filter(item => machine(item.id) && canStart(machine(item.id)));
  const laser = eligible.some(item => machineConnectors[machine(item.id).kind]?.fileFamily === 'laser');
  const external = eligible.some(item => machineConnectors[machine(item.id).kind]?.externalFilament);
  dialog.innerHTML = `<form id="transfer-print" class="stack">
    ${fileBatchStyles()}<h2>${t('Transferts terminés','Transfers finished')}</h2>
    <ul class="transfer-list">${results.map(result => `<li class="transfer-line"><span>${esc(result.item.name)}</span><span class="${result.ok ? 'good' : 'bad'}"><span aria-hidden="true">${result.ok ? '✓' : '✕'}</span> ${result.ok ? t('Transféré','Transferred') : esc(problem(result.error.code || 'upload-failed'))}</span></li>`).join('')}</ul>
    ${eligible.length ? `<p>${t('Lancer maintenant sur toutes les machines disponibles ou seulement votre sélection ?','Start now on all available machines or only your selection?')}</p>
      <label class="row"><input type="checkbox" data-transfer-all checked> ${t('Toutes les machines disponibles','All available machines')}</label>
      <fieldset class="stack"><legend>${t('Machines à démarrer','Machines to start')}</legend>${eligible.map(item => `<label class="row"><input type="checkbox" name="print" value="${esc(item.id)}" checked>${esc(item.name)} · ${esc(item.path)}</label>`).join('')}</fieldset>
      <label class="row"><input type="checkbox" name="confirm" required>${t('Les plateaux sont libres et les fichiers préparés pour ces machines et matériaux.','Beds are clear and the files are prepared for these machines and materials.')}${laser ? ' ' + t('Je suis présent auprès des lasers, avec protections, extraction et zones dégagées.', 'I am present at the lasers, with protection, extraction and clear work areas.') : ''}${external ? ' ' + t('Bobine externe uniquement sur Bambu/Elegoo, sans sélection AMS/CANVAS.', 'External spool only on Bambu/Elegoo, without AMS/CANVAS selection.') : ''}</label>` : `<p>${t('Aucune destination disponible pour lancer une impression maintenant. Les copies réussies sont conservées.','No destination is available to start a print now. Successful copies are kept.')}</p>`}
    ${successful.length > eligible.length ? `<small>${t('Les machines occupées ou indisponibles ne sont pas proposées au lancement.','Busy or unavailable machines are not offered for starting.')}</small>` : ''}
    <p class="error" role="alert"></p><p role="status" hidden></p><ul class="transfer-list" data-print-results aria-live="polite" hidden></ul>
    <div class="row wrap">${btn('close', t('Ne pas lancer','Do not start'))}${eligible.length ? `<button type="submit" value="selected">${t('Lancer la sélection','Start selection')}</button><button type="submit" value="all" class="primary">${t('Tout lancer','Start all')}</button>` : ''}</div>
  </form>`;
  const form = dialog.querySelector('form');
  form.addEventListener('change', event => {
    const boxes = [...form.querySelectorAll('[name="print"]')];
    const all = form.querySelector('[data-transfer-all]');
    if (event.target === all) boxes.forEach(box => { box.checked = all.checked; });
    else { all.checked = boxes.every(box => box.checked); all.indeterminate = boxes.some(box => box.checked) && !all.checked; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (form.dataset.busy || form.dataset.done) return;
    const data = new FormData(form);
    const selected = event.submitter?.value === 'all' ? eligible : eligible.filter(item => data.getAll('print').includes(item.id));
    if (!selected.length) { form.querySelector('[role="alert"]').textContent = t('Choisissez au moins une machine.','Select at least one machine.'); return; }
    if (data.get('confirm') !== 'on') return;
    form.dataset.busy = 'true';
    form.querySelectorAll('button,input').forEach(control => { control.disabled = true; });
    const status = form.querySelector('[role="status"]');
    status.hidden = false;
    status.textContent = t('Lancement en cours…','Starting…');
    const list = form.querySelector('[data-print-results]');
    list.hidden = false;
    list.innerHTML = fileBatchRows(selected);
    await runFileBatch(selected, item => api('machines/' + item.id + '/print', {
      path: item.path, confirm: true, ...(machine(item.id)?.kind === 'longer-ray5' ? { operatorPresent: true } : {}), ...(machineConnectors[machine(item.id)?.kind]?.externalFilament ? { filamentMode: 'external' } : {})
    }), (result, count, total) => {
      status.textContent = `${count} / ${total}`;
      updateFileBatch(list, result.item, result.ok ? 'success' : 'error', result.ok ? t('Impression lancée','Print started') : problem(result.error.code || 'command-unconfirmed'));
    }, item => updateFileBatch(list, item, 'running', t('Lancement…','Starting…')));
    form.dataset.done = 'true';
    delete form.dataset.busy;
    status.textContent = t('Demandes terminées. Aucun renvoi automatique en cas d’échec ou de résultat inconnu.','Requests finished. No automatic retry after failure or unknown outcome.');
    const close = form.querySelector('[data-action="close"]');
    close.disabled = false;
    close.textContent = t('Fermer','Close');
    refresh();
  });
}

async function startPrint(id, path) {
  const m = machine(id);
  const filament = machineConnectors[m?.kind]?.externalFilament ? '\n\n' + t('Bobine externe uniquement : aucun choix automatique AMS/CANVAS. Le fichier doit être préparé pour cette machine et ce filament.', 'External spool only: no automatic AMS/CANVAS mapping. The file must be prepared for this machine and filament.') : '';
  const laser = m?.kind === 'longer-ray5';
  if (!m || !path || !window.confirm((laser ? t('Lancer le travail laser sur','Start laser job on') : t('Lancer l’impression sur','Start printing on')) + ' ' + m.name + ' ?\n\n' + path + filament + (laser ? '\n\n' + t('Je suis présent, équipé des protections laser, avec extraction et zone de travail dégagée. Profil machine, matériau, origine et puissance vérifiés.', 'I am present with laser protection, extraction and a clear work area. Machine profile, material, origin and power checked.') : ''))) return;
  try {
    await api('machines/' + id + '/print', { path, confirm: true, ...(laser ? { operatorPresent: true } : {}), ...(filament ? { filamentMode: 'external' } : {}) });
    toast(laser ? t('Travail laser lancé.', 'Laser job started.') : t('Impression lancée.', 'Print started.'));
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
  if (gcode.cursor != null) return t('Simulation locale du fichier · aucun mouvement machine.', 'Local file simulation · no machine movement.');
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
  return `<div class="gcode-workspace" data-gcode-workspace>` + title(esc(fileName(gcode.path)), esc(m.name + ' · ' + gcode.path), actions) +
    `<style>
      .area:has(.gcode-workspace){padding-bottom:12px}.gcode-workspace{display:flex;flex-direction:column;gap:8px;min-height:0}.gcode-workspace .hero{margin-bottom:0;flex:none}.gcode-workspace .hero h1{font-size:24px;overflow-wrap:anywhere}.gcode-workspace .hero p{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60vw;margin-top:4px}.gcode-workspace>.stack{display:flex;flex-direction:column;flex:1;min-height:0;gap:8px}.gcode-workspace .panel{display:flex;flex-direction:column;flex:1;min-height:0;gap:8px;padding:12px}.gcode-workspace button,.gcode-workspace select{min-height:32px;padding:5px 10px}.gcode-workspace input[type=checkbox]{min-height:0}.gcode-workspace .notice{max-height:50px;overflow:auto}.gcode-workspace .gcode-tools{flex:none;max-height:40%;overflow:auto}.gcode-canvas{position:relative;flex:1;min-height:0;border:1px solid var(--line);border-radius:10px;background:var(--raised);overflow:hidden;touch-action:none;cursor:grab}
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
        <div class="gcode-tools stack"><div class="row wrap between"><strong data-viewer-status>${viewerStatus()}</strong>
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
            <label class="row"><input type="checkbox" data-gcode-option="previous" ${gcode.previous ? 'checked' : ''}> ${t('Couches précédentes en fond','Previous layers underneath')}</label>
          </div>
          <div class="row wrap">
            ${btn('gcode-zoom:out', '−', '', '', `aria-label="${t('Dézoomer','Zoom out')}"`)}
            ${btn('gcode-zoom:in', '+', '', '', `aria-label="${t('Zoomer','Zoom in')}"`)}
            ${btn('gcode-fit', t('Ajuster','Fit'))}
          </div>
        </div>
        <div class="row wrap">
          ${btn('gcode-mode:2d', '2D', '', gcode.mode === '2d' ? 'primary' : '')}${btn('gcode-mode:3d', '3D', '', gcode.mode === '3d' ? 'primary' : '')}
          ${btn('gcode-play', t('Lecture','Play'), '', '', 'data-gcode-play')}${btn('gcode-reset', t('Recommencer','Restart'))}
          <label>${t('Vitesse','Speed')} <select data-gcode-speed aria-label="${t('Vitesse de simulation','Simulation speed')}">${[1,5,10,50,100].map(n => `<option value="${n}" ${gcode.speed === n ? 'selected' : ''}>×${n}</option>`).join('')}</select></label>
          <small data-gcode-play-status>${t('Simulation locale · vitesse indicative, aucun ordre machine.','Local simulation · illustrative speed, no machine commands.')}</small>
        </div></div>
        <div class="gcode-canvas" data-gcode-canvas><canvas role="img" aria-label="${t('Trajectoires de la couche','Layer toolpaths')}"></canvas></div>
        <div class="row wrap"><small class="gcode-legend good">${m.kind === 'xtool-m2' ? t('Réalisé','Completed') : t('Imprimé','Printed')}</small><small class="gcode-legend neutral">${m.kind === 'xtool-m2' ? t('Trajectoire de travail','Work path') : t('À imprimer','To print')}</small><small class="gcode-legend info">${t('Déplacement à vide','Travel move')}</small><small class="gcode-legend warn">${m.kind === 'xtool-m2' ? t('Outil','Tool') : t('Buse','Nozzle')}</small>
          <small>${t('Molette : zoom · glisser : déplacer (2D) / pivoter (3D) · Maj + glisser : déplacer.','Wheel: zoom · drag: pan (2D) / orbit (3D) · Shift + drag: pan.')}</small></div>
      </section>` : `<p class="notice">${m.kind === 'xtool-m2' ? t('Aucune trajectoire laser active trouvée dans ce fichier.', 'No active laser toolpath found in this file.') : t('Aucune extrusion trouvée dans ce fichier.','No extrusion found in this file.')}</p>`) : ''}
    </div></div>`;
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
    gcode.cursor = null;
    if (gcode.mode === '3d' && !gcode.follow) gcode.layer = Math.max(0, gcode.result.layers.length - 1);
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
  let bounds = gcode.result?.bounds;
  if (bounds && gcode.mode === '3d') {
    const projected = [];
    let minZ = 0, maxZ = 0;
    for (const z of gcode.result.heights) { minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    for (const x of [bounds.minX, bounds.maxX]) for (const y of [bounds.minY, bounds.maxY]) for (const z of [minZ, maxZ]) projected.push(projectGcode(x, y, z));
    bounds = { minX: Math.min(...projected.map(p => p[0])), maxX: Math.max(...projected.map(p => p[0])), minY: Math.min(...projected.map(p => p[1])), maxY: Math.max(...projected.map(p => p[1])) };
  }
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!bounds) return { scale: 1, x: width / 2, y: height / 2 };
  const margin = 24;
  const scale = Math.max(0.01, Math.min((width - margin * 2) / Math.max(bounds.maxX - bounds.minX, 1), (height - margin * 2) / Math.max(bounds.maxY - bounds.minY, 1)));
  return {
    scale,
    x: width / 2 - (bounds.minX + bounds.maxX) / 2 * scale,
    y: height / 2 + (bounds.minY + bounds.maxY) / 2 * scale
  };
}

function projectGcode(x, y, z) {
  if (gcode.mode !== '3d') return [x, y];
  const side = x * Math.cos(gcode.yaw) - y * Math.sin(gcode.yaw);
  const depth = x * Math.sin(gcode.yaw) + y * Math.cos(gcode.yaw);
  return [side, depth * Math.sin(gcode.pitch) + z * Math.cos(gcode.pitch)];
}

function pauseGcode() {
  if (gcode.frame != null) cancelAnimationFrame(gcode.frame);
  gcode.frame = null;
  gcode.playing = false;
  const button = app.querySelector('[data-gcode-play]');
  if (button) button.textContent = t('Lecture','Play');
}

function playGcode() {
  if (gcode.playing) return pauseGcode();
  if (!gcode.result?.types.length) return;
  gcode.follow = false;
  const follow = app.querySelector('[data-gcode-option="follow"]');
  if (follow) follow.checked = false;
  if (gcode.cursor == null || gcode.cursor >= gcode.result.types.length) gcode.cursor = 0;
  gcode.playing = true;
  const status = app.querySelector('[data-viewer-status]');
  if (status) status.textContent = viewerStatus();
  app.querySelector('[data-gcode-play]').textContent = t('Pause','Pause');
  let last;
  const tick = (time) => {
    if (!gcode.playing || live.page !== 'viewer') return pauseGcode();
    let distance = Math.min((time - (last ?? time)) / 1000, 0.1) * 60 * gcode.speed;
    last = time;
    const { segments, heights, types } = gcode.result;
    while (distance > 0 && gcode.cursor < types.length) {
      const i = Math.floor(gcode.cursor), at = i * 4;
      const length = Math.max(0.001, Math.hypot(segments[at + 2] - segments[at], segments[at + 3] - segments[at + 1], heights[i * 2 + 1] - heights[i * 2]));
      const remaining = (1 - (gcode.cursor - i)) * length;
      if (distance >= remaining) { gcode.cursor = i + 1; distance -= remaining; }
      else { gcode.cursor += distance / length; distance = 0; }
    }
    setGcodeLayer(layerOfSegment(gcode.result, Math.min(types.length - 1, Math.floor(gcode.cursor))));
    const label = app.querySelector('[data-gcode-play-status]');
    if (label) label.textContent = t('Simulation locale','Local simulation') + ' · ' + Math.round(gcode.cursor / types.length * 100) + ' %';
    if (gcode.cursor >= types.length) return pauseGcode();
    gcode.frame = requestAnimationFrame(tick);
  };
  gcode.frame = requestAnimationFrame(tick);
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
  const { segments, types, heights } = result;
  const point = (index, end = false, fraction = end ? 1 : 0) => {
    const at = index * 4;
    const [x, y] = projectGcode(segments[at] + (segments[at + 2] - segments[at]) * fraction, segments[at + 1] + (segments[at + 3] - segments[at + 1]) * fraction, heights[index * 2] + (heights[index * 2 + 1] - heights[index * 2]) * fraction);
    return [offsetX + x * scale, offsetY - y * scale];
  };
  const stroke = (from, to, type, style, lineWidth, alpha) => {
    if (from >= to) return;
    context.beginPath();
    for (let index = from; index < to; index++) {
      if (types[index] !== type) continue;
      context.moveTo(...point(index));
      context.lineTo(...point(index, true));
    }
    context.globalAlpha = alpha;
    context.strokeStyle = style;
    context.lineWidth = lineWidth;
    context.stroke();
  };
  const current = result.layers[gcode.layer];
  const below = result.layers[gcode.layer - 1];
  const now = viewerLive();
  const position = gcode.cursor ?? now?.printed;
  const printed = position != null ? Math.min(Math.max(Math.floor(position), current.start), current.end) : current.end;
  if (gcode.previous && below) stroke(gcode.mode === '3d' ? 0 : below.start, below.end, 1, color('--dim'), 1.5, 0.3);
  stroke(printed, current.end, 1, color('--dim'), 1.6, 0.55);
  stroke(current.start, printed, 1, color('--accent'), 1.8, 1);
  if (gcode.travel) stroke(current.start, printed, 0, color('--blue'), 1, 0.7);
  if (position != null && types.length) {
    const index = Math.min(types.length - 1, Math.max(0, Math.floor(position)));
    const fraction = position >= types.length ? 1 : position - index;
    const marker = point(index, true, fraction);
    if (gcode.cursor != null && index >= current.start && index < current.end) {
      context.beginPath(); context.moveTo(...point(index)); context.lineTo(...marker);
      context.strokeStyle = color(types[index] ? '--accent' : '--blue'); context.globalAlpha = 1; context.stroke();
    }
    context.globalAlpha = 1;
    context.fillStyle = color('--amber');
    context.beginPath(); context.arc(...marker, 6, 0, Math.PI * 2); context.fill();
    context.strokeStyle = color('--text'); context.lineWidth = 1; context.stroke();
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
  pauseGcode();
  gcode.cursor = null;
  if (gcode.follow) {
    gcode.follow = false;
    const follow = app.querySelector('[data-gcode-option="follow"]');
    if (follow) follow.checked = false;
  }
  setGcodeLayer(index);
}

function sizeGcode() {
  const workspace = app.querySelector('[data-gcode-workspace]');
  if (!workspace) return;
  const mobile = app.querySelector('nav.mobile');
  const bottom = mobile && getComputedStyle(mobile).display !== 'none' ? mobile.getBoundingClientRect().height : 0;
  workspace.style.height = Math.max(180, window.innerHeight - workspace.getBoundingClientRect().top - bottom - 12) + 'px';
  drawGcode();
}

function mountGcode() {
  window.scrollTo(0, 0);
  sizeGcode();
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
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, orbit: gcode.mode === '3d' && !event.shiftKey && event.button === 0 };
    canvas.setPointerCapture(event.pointerId);
    area.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (event) => {
    if (drag?.id !== event.pointerId || !gcode.view) return;
    if (drag.orbit) {
      const fitted = gcodeFit(canvas);
      const zoom = gcode.view.scale / fitted.scale;
      const panX = gcode.view.x - (canvas.clientWidth / 2 + (fitted.x - canvas.clientWidth / 2) * zoom);
      const panY = gcode.view.y - (canvas.clientHeight / 2 + (fitted.y - canvas.clientHeight / 2) * zoom);
      gcode.yaw += (event.clientX - drag.x) * 0.01;
      gcode.pitch = Math.max(-1.5, Math.min(1.5, gcode.pitch + (event.clientY - drag.y) * 0.01));
      const next = gcodeFit(canvas);
      gcode.view = { scale: next.scale * zoom, x: canvas.clientWidth / 2 + (next.x - canvas.clientWidth / 2) * zoom + panX, y: canvas.clientHeight / 2 + (next.y - canvas.clientHeight / 2) * zoom + panY };
    } else {
      gcode.view.x += event.clientX - drag.x;
      gcode.view.y += event.clientY - drag.y;
    }
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
  if (state.machine && (event.target.matches('[data-files-sort]') || event.target.matches('[data-files-size]'))) {
    const entry = filesState(state.machine);
    const selector = event.target.matches('[data-files-sort]') ? '[data-files-sort]' : '[data-files-size]';
    if (selector === '[data-files-sort]') entry.sort = ['newest', 'oldest', 'name'].includes(event.target.value) ? event.target.value : 'newest';
    else entry.pageSize = Number(event.target.value) === 20 ? 20 : 5;
    entry.page = 0;
    renderFiles(state.machine);
    app.querySelector(selector)?.focus({ preventScroll: true });
  }
  if (event.target.matches('[data-gcode-local]') && event.target.files[0] && state.machine) {
    const file = event.target.files[0];
    if (!/\.(gcode|gco|g|gc|nc)$/i.test(file.name) || file.size > gcodeLimit) return toast(problem('file-too-large'));
    Object.assign(gcode, { machine: state.machine, path: file.name, local: true, follow: false, size: file.size, result: null, layer: 0, read: 0, error: '', view: null });
    live.page = 'viewer';
    loadGcode(state.machine, file.name, file);
    renderLive();
  }
  if (event.target.matches('[data-files-upload]') && event.target.files[0] && state.machine) uploadFile(state.machine, event.target.files[0]);
  if (event.target.matches('[data-gcode-speed]')) gcode.speed = Number(event.target.value);
  if (event.target.matches('[data-gcode-option]')) {
    const option = event.target.dataset.gcodeOption;
    gcode[option] = event.target.checked;
    if (option === 'follow') { pauseGcode(); gcode.cursor = null; return updateViewer(); }
    drawGcode();
  }
});

app.addEventListener('input', (event) => {
  if (event.target.matches('[data-files-search]') && state.machine && !event.isComposing) {
    const entry = filesState(state.machine);
    entry.query = event.target.value;
    entry.page = 0;
    renderFiles(state.machine);
  }
  if (event.target.matches('[data-gcode-layer]')) chooseGcodeLayer(Number(event.target.value) - 1);
});

app.addEventListener('click', (event) => {
  const [action, value] = (event.target.closest('[data-action]')?.dataset.action ?? '').split(':');
  const m = machine(state.machine);
  const listed = m && machineFiles.get(m.id)?.files?.[Number(value)];
  if (action === 'gcode-play') playGcode();
  if (action === 'gcode-reset') { pauseGcode(); gcode.cursor = 0; gcode.follow = false; setGcodeLayer(0); renderLive(); }
  if (action === 'gcode-mode' && ['2d', '3d'].includes(value)) { gcode.mode = value; gcode.view = null; if (value === '3d' && gcode.cursor == null) gcode.layer = gcode.result.layers.length - 1; renderLive(); }
  if (action === 'gcode-layer') chooseGcodeLayer(gcode.layer + Number(value));
  if (action === 'gcode-zoom') zoomGcode(value === 'in' ? 1.5 : 1 / 1.5);
  if (action === 'gcode-fit') {
    gcode.view = null;
    drawGcode();
  }
  if (action === 'files-page' && m) {
    const entry = filesState(m.id);
    entry.page += value === 'next' ? 1 : -1;
    renderFiles(m.id);
    app.querySelector('[data-action="files-page:' + value + '"]')?.focus({ preventScroll: true });
  }
  if (action === 'files-transfer' && listed) openFileTransfer(m.id, listed.path);
  if (action === 'files-refresh' && m) loadFiles(m.id);
  if (action === 'viewer-open' && listed) openViewer(m.id, listed.path, liveFile(m) === listed.path);
  if (action === 'viewer-live' && m && liveFile(m)) openViewer(m.id, liveFile(m), true);
  if (action === 'files-print' && listed) startPrint(m.id, listed.path);
  if (action === 'viewer-print') startPrint(gcode.machine, gcode.path);
});

app.addEventListener('keydown', event => {
  const tab = event.target.closest('[role="tab"][data-action^="machine-tab:"]');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const tabs = [...app.querySelectorAll('[role="tab"][data-action^="machine-tab:"]:not([aria-disabled="true"])')];
  if (!tabs.includes(tab)) return;
  const at = tabs.indexOf(tab);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (at + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
  selectMachineTab(tabs[next].dataset.action.split(':')[1]);
});

window.addEventListener('resize', () => {
  if (live.page === 'viewer') { gcode.view = null; sizeGcode(); }
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
  if (formId(event.target.form) === 'gcode-terminal' && state.machine) terminalDrafts.set(state.machine, event.target.value);
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

dialog.addEventListener('cancel', event => {
  if (dialog.querySelector('#transfer-file[data-busy], #transfer-print[data-busy]')) event.preventDefault();
});

dialog.addEventListener('close', () => {
  discoveryCancel?.abort();
  dialog.innerHTML = '';
  if (live.phase === 'workshop') renderLive();
});
renderLive();
loadSession();

const machineLogStates = new Map();
function machineLogState(id) {
  if (!machineLogStates.has(id)) machineLogStates.set(id, { data: null, pending: false, error: '' });
  return machineLogStates.get(id);
}
function logEventLabel(event) {
  const names = {
    'operation-start': ['Opération demandée', 'Operation requested'], 'operation-result': ['Résultat de l’opération', 'Operation result'],
    'operation-error': ['Échec de l’opération', 'Operation failed'], 'mqtt-connect-start': ['Connexion MQTT TLS', 'MQTT TLS connection'],
    'mqtt-send': ['Requête MQTT envoyée', 'MQTT request sent'], 'mqtt-receive': ['Rapport MQTT reçu', 'MQTT report received'],
    'mqtt-command-response': ['Réponse constructeur à la commande', 'Manufacturer command response'],
    'mqtt-command-timeout': ['Aucune réponse corrélée dans le délai', 'No correlated response within deadline'],
    'mqtt-error': ['Erreur de connexion MQTT', 'MQTT connection error'], 'mqtt-subscribe': ['Abonnement MQTT', 'MQTT subscription'],
    'ray5-connecting': ['Connexion Wi-Fi Ray5', 'Ray5 Wi-Fi connection'],
    'ray5-command-send': ['Commande GRBL envoyée','GRBL command sent'],
    'ray5-command-response': ['Réponse GRBL','GRBL response'],
    'ray5-sd-http': ['Échange HTTP carte SD','SD card HTTP exchange'],
    'ray5-connected': ['Transport Ray5 connecté', 'Ray5 transport connected'],
    'ray5-disconnected': ['Liaison Ray5 interrompue', 'Ray5 connection interrupted'],
    'ray5-report': ['État GRBL reçu', 'GRBL status received'],
    'ray5-status-request': ['Interrogation ESP3D', 'ESP3D status request'],
    'heater-confirmation': ['Vérification de la consigne de chauffe', 'Heating setpoint verification']
  };
  return names[event] ? t(...names[event]) : event;
}
function machineLogPanel(m) {
  const entry = machineLogState(m.id);
  return `<section class="panel stack" data-machine-log>
    <style>.machine-log-entries{max-height:60vh;overflow:auto;min-width:0}.machine-log-entries details{padding:8px 0;border-bottom:1px solid var(--line)}.machine-log-entries pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;margin:6px 0}.machine-log-entries summary{cursor:pointer;overflow-wrap:anywhere;font-size:13px}</style>
    <div class="row between wrap"><h2>${t('Logs de la machine', 'Machine logs')}</h2><div class="row wrap">${btn('machine-logs-refresh', t('Actualiser', 'Refresh'), '', '', entry.pending ? 'disabled' : '')}<a href="/api/machines/${esc(m.id)}/logs-download" download>${t('Télécharger le fichier log', 'Download log file')}</a></div></div>
    <p class="notice">${m.kind === 'bambu-cloud' ? t('Connexion cloud : les échanges MQTT sont dans le journal du compte.', 'Cloud connection: MQTT exchanges are in the account log.') : ''} ${t('Les logs du compte cloud sont séparés. Requêtes, réponses filtrées et délais ; aucun mot de passe, jeton ou code LAN. Les rapports MQTT périodiques sont échantillonnés toutes les dix secondes, les réponses de commande sont toutes conservées.', 'Cloud account logs are separate. Requests, filtered responses and timings; no passwords, tokens or LAN access codes. Periodic MQTT reports are sampled every ten seconds; all command responses are retained.')}</p>
    <label>${t('Rechercher dans les logs', 'Search logs')}<input type="search" data-machine-log-search placeholder="${t('chauffe, gcode_line, reason, MQTT…', 'heating, gcode_line, reason, MQTT…')}"></label>
    ${entry.error ? `<p class="error" role="alert">${t('Journal indisponible. Vérifiez le stockage ou reconnectez-vous.', 'Log unavailable. Check storage or sign in again.')}</p>` : ''}
    <small role="status">${entry.pending ? t('Lecture…', 'Reading…') : t('500 dernières entrées conservées · détails techniques ci-dessous.', 'Last 500 retained entries · technical details below.')}</small>
    <div class="machine-log-entries">${entry.data ? entry.data.lines.slice().reverse().map(line => `<details open data-log-entry><summary>${esc(new Date(line.at).toLocaleString(state.lang))} · ${esc(logEventLabel(line.event))} ${line.details?.operation ? '· ' + esc(line.details.operation) : ''}</summary><pre>${esc(JSON.stringify(line.details ?? {}, null, 2))}</pre></details>`).join('') || `<p>${t('Aucune entrée conservée pour cette machine. Les opérations futures seront journalisées après cette mise à jour.', 'No retained entries for this device. Future operations will be logged after this update.')}</p>` : ''}</div>
  </section>`;
}
async function loadMachineLogs(id) {
  if (state.role !== 'admin') return;
  const entry = machineLogState(id); if (entry.pending) return;
  entry.pending = true; entry.error = '';
  try {
    const data = await api('machines/' + id + '/logs');
    if (live.phase !== 'workshop') return;
    entry.data = data;
  } catch (error) { entry.error = error.code; }
  finally {
    entry.pending = false;
    if (live.phase === 'workshop' && live.page === 'detail' && state.machine === id && machineTab() === 'logs') {
      const panel = app.querySelector('[data-machine-log]'); if (panel) panel.outerHTML = machineLogPanel(machine(id));
    }
  }
}
app.addEventListener('click', event => {
  if (event.target.closest('[data-action]')?.dataset.action === 'machine-logs-refresh') loadMachineLogs(state.machine);
});
app.addEventListener('input', event => {
  if (!event.target.matches('[data-machine-log-search]')) return;
  const text = event.target.value.toLocaleLowerCase();
  app.querySelectorAll('[data-log-entry]').forEach(item => { item.hidden = !item.textContent.toLocaleLowerCase().includes(text); });
});

// Covers both the main page and dynamically rendered account/setup dialogs.
function secretVisibilityLabel(shown) {
  return shown ? t('Masquer la saisie', 'Hide input') : t('Afficher la saisie', 'Show input');
}
function updateSecretVisibility(input, button, shown) {
  input.type = shown ? 'text' : 'password';
  const label = secretVisibilityLabel(shown);
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', String(shown));
  button.title = label;
  button.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${shown ? '<path d="m3 3 18 18"/>' : ''}</svg>`;
}
function enhanceSecretInputs(root) {
  const inputs = [...(root.matches?.('input[type="password"]') ? [root] : []), ...root.querySelectorAll('input[type="password"]')];
  for (const input of inputs) {
    if (input.closest('.secret-field')) continue;
    const wrapper = document.createElement('span');
    wrapper.className = 'secret-field';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secret-toggle';
    input.before(wrapper);
    wrapper.append(input, button);
    updateSecretVisibility(input, button, false);
    button.addEventListener('click', () => {
      const start = input.selectionStart, end = input.selectionEnd;
      updateSecretVisibility(input, button, input.type === 'password');
      input.focus({ preventScroll: true });
      if (start !== null && end !== null) input.setSelectionRange(start, end);
    });
  }
}
function concealSecretInputs(root = document) {
  root.querySelectorAll('.secret-field').forEach(wrapper => {
    const input = wrapper.querySelector('input');
    updateSecretVisibility(input, wrapper.querySelector('button'), false);
  });
}
enhanceSecretInputs(document);
new MutationObserver(records => {
  for (const record of records) for (const node of record.addedNodes) {
    if (node.nodeType === 1) enhanceSecretInputs(node);
  }
}).observe(document.body, { childList: true, subtree: true });
document.addEventListener('submit', event => concealSecretInputs(event.target), true);
document.addEventListener('visibilitychange', () => { if (document.hidden) concealSecretInputs(); });
dialog.addEventListener('close', () => concealSecretInputs(dialog));

app.addEventListener('click',event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action?.startsWith('ray5-control:')) sendManualControl(state.machine,{action:action.split(':')[1]});
});
app.addEventListener('submit',event => {
  if (!event.target.matches('[data-ray5-pulse]')) return;
  event.preventDefault();
  const form = new FormData(event.target);
  sendManualControl(state.machine,{action:'laser-pulse',value:Number(form.get('value')),duration:Number(form.get('duration')),operatorPresent:true});
});

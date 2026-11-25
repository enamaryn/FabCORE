// Cloud-account metadata only: credentials are read from the form once, never retained in UI state.
const cloudUI = { data: null, certificates: null, loading: false, error: '', busy: false };
function cloudProblem(code) {
  const labels = {
    'bambu-cert-refresh-failed': ['Renouvellement échoué. Les PEM précédents sont conservés ; vérifiez l’URL ou réimportez les fichiers.', 'Renewal failed. Previous PEMs are preserved; check the URL or import files again.'],
    'bambu-cert-no-refresh-url': ['Renseignez d’abord l’URL de renouvellement.', 'Set the renewal URL first.'],
    "bambu-cert-refresh-url": ["URL de rafraîchissement invalide : utilisez l’URL HTTPS complète Bambu contenant /applications/, ou laissez vide.", "Invalid refresh URL: use the complete Bambu HTTPS URL containing /applications/, or leave blank."],
    "bambu-cert-crl-format": ["crl.pem : bloc PEM X509 CRL requis.", "crl.pem: X509 CRL PEM block required."],
    "bambu-cert-chain-format": ["chain.pem : bloc PEM CERTIFICATE requis.", "chain.pem: CERTIFICATE PEM block required."],
    "bambu-cert-key-format": ["key.pem : bloc PEM de clé privée requis.", "key.pem: private key PEM block required."],
    'bambu-cert-invalid': ['Fichiers PEM invalides : vérifiez la clé et les certificats.', 'Invalid PEM files: check the key and certificates.'],
    'bambu-cert-storage': ['Stockage chiffré indisponible.', 'Encrypted storage unavailable.'],
    'cloud-machine-exists': ['Cette machine est déjà dans FabCore, en LAN ou en cloud.', 'This device is already in FabCore, via LAN or cloud.'],
    'cloud-in-use': ['Supprimez d’abord du parc les machines liées à ce compte.', 'Remove linked fleet devices before deleting this account.'],
    'cloud-auth': ['Connexion refusée ou expirée. Reconnectez ce compte.', 'Sign-in denied or expired. Reconnect this account.'],
    'cloud-access': ['Bambu refuse cet accès (HTTP 403). Consultez le journal du compte.', 'Bambu denied this access (HTTP 403). Check the account log.'],
    'cloud-unavailable': ['Bambu ne répond pas ou la connexion a expiré.', 'Bambu is unreachable or the connection timed out.'],
    'cloud-response': ['Réponse Bambu non reconnue. Consultez le journal.', 'Unrecognized Bambu response. Check the log.'],
    'cloud-code': ['Code incorrect. Réessayez.', 'Incorrect code. Try again.'],
    'cloud-code-expired': ['Vérification expirée. Recommencez la connexion.', 'Verification expired. Start sign-in again.'],
    'cloud-challenge': ['Vérification du portail Bambu indisponible. Aucun contournement automatique.', 'Bambu portal verification is unavailable. No automatic bypass.'],
    'cloud-rate': ['Limite Bambu atteinte. Attendez avant de réessayer.', 'Bambu rate limit reached. Wait before retrying.'],
    'cloud-login-wait': ['Attendez une minute avant de recommencer la connexion. Vous pouvez saisir le code déjà reçu.', 'Wait one minute before restarting sign-in. You can enter the code already received.'],
    'cloud-busy': ['Une opération est déjà en cours sur ce compte.', 'An operation is already running for this account.'],
    'cloud-storage': ['Stockage du compte ou du journal indisponible. Vérifiez les droits et la clé de chiffrement.', 'Account or log storage unavailable. Check permissions and the encryption key.'],
    'cloud-invalid': ['Vérifiez le nom, le fabricant, la région et l’adresse email.', 'Check name, manufacturer, region and email.'],
    'cloud-limit': ['Limite de 24 comptes atteinte pour ce POC.', 'This POC supports up to 24 accounts.'],
    'cloud-unsupported': ['La connexion de ce fabricant n’est pas encore intégrée.', 'This manufacturer connection is not integrated yet.']
  };
  return labels[code] ? t(...labels[code]) : problem(code);
}
function cloudStatus(account) {
  if (account.challenge) return t('Vérification requise', 'Verification required');
  return ({ connected: t('Authentifié', 'Authenticated'), reauth: t('À reconnecter', 'Reconnect required'), disconnected: t('Déconnecté', 'Disconnected') })[account.status] ?? t('Inconnu', 'Unknown');
}
function cloudDeviceAction(account, device) {
  const existing = device.fleetId ? { id: device.fleetId, mode: device.fleetMode } : state.machines.find(machine => ['bambu', 'bambu-cloud'].includes(machine.kind) && machine.serial === device.serial);
  return existing ? `<small>${existing.mode === 'lan' || existing.kind === 'bambu' ? 'LAN' : 'Cloud'}</small> ` + btn('cloud-remove:' + account.id + ':' + device.serial, t('Supprimer de FabCore', 'Remove from FabCore'), '', 'danger')
    : btn('cloud-import:' + account.id + ':' + device.serial, t('Ajout automatique', 'Add automatically'), '', 'primary');
}
function cloudTelemetry(account) {
  if (!account.telemetryEnabled) return '';
  const telemetry = account.telemetry;
  const temp = value => Number.isFinite(value) ? value + ' °C' : '—';
  return `<section class="stack"><div class="row between wrap"><strong>${t('Suivi cloud', 'Cloud monitoring')}</strong><span>${esc(telemetry?.status ?? t('Connexion en cours', 'Connecting'))}</span></div>
    ${telemetry?.issue ? `<p class="error">${esc(cloudProblem(telemetry.issue))}</p>` : ''}
    ${(telemetry?.devices ?? []).map(device => `<article class="notice stack"><div class="row between wrap"><strong>${esc(account.devices.find(item => item.serial === device.serial)?.name ?? device.serial)}</strong><small>${device.stale ? t('En attente de données récentes', 'Waiting for fresh data') : esc(new Date(device.checkedAt).toLocaleString(state.lang))}</small></div>
      <div class="row wrap">${device.heaters.map(heater => `<span><strong>${heater.id === 'bed' ? t('Plateau', 'Bed') : t('Buse', 'Nozzle')}</strong> ${temp(heater.current)} → ${temp(heater.target)}</span>`).join('')}</div>
      ${device.filaments.map(unit => `<div class="stack"><strong>AMS ${unit.id + 1}${Number.isFinite(unit.humidity) ? ' · 💧 ' + unit.humidity + ' %' : ''}${Number.isFinite(unit.temperature) ? ' · ' + temp(unit.temperature) : ''}</strong><div class="row wrap">${unit.slots.map(slot => `<span style="display:inline-flex;align-items:center;gap:6px"><i style="width:18px;height:18px;border:1px solid #888;border-radius:50%;background:${/^#[0-9A-F]{6}$/.test(slot.color ?? '') ? slot.color : 'transparent'}"></i>${slot.id + 1} · ${esc(slot.occupied === false ? t('Vide', 'Empty') : slot.material || t('Inconnu', 'Unknown'))}</span>`).join('')}</div></div>`).join('')}
      <details><summary>${t('Modules et numéros de série', 'Modules and serial numbers')}</summary>${device.modules.map(module => `<p>${esc(module.model || module.name)} · ${esc(module.serial)} · ${esc(module.firmware)}</p>`).join('') || '—'}</details></article>`).join('')}</section>`;
}
function cloudCertificateStatus() {
  const cert = cloudUI.certificates;
  if (!cert?.configured) return '';
  const date = value => value ? esc(new Date(value).toLocaleString(state.lang)) : t('Inconnue', 'Unknown');
  const renewal = cert.renewal ?? {};
  const expiring = [cert.certificateExpiresAt, cert.crlExpiresAt].some(value => value && Date.parse(value) <= Date.now() + 7 * 86400000);
  return `<small>${t('Échéance certificats', 'Certificate expiry')} : ${date(cert.certificateExpiresAt)} · CRL : ${date(cert.crlExpiresAt)}</small>
    ${expiring ? '<p class="notice">'+t('Échéance proche ou dépassée : vérifiez le renouvellement.', 'Expiry is near or past: check renewal status.')+'</p>' : ''}
    <small>${cert.refreshConfigured ? t('Renouvellement automatique activé', 'Automatic renewal enabled') : t('Renouvellement manuel : URL non renseignée', 'Manual renewal: URL not set')}</small>
    ${renewal.nextAttemptAt ? '<small>'+t('Prochaine vérification de renouvellement', 'Next renewal attempt')+' : '+date(renewal.nextAttemptAt)+'</small>' : ''}
    ${renewal.lastSuccessAt ? '<small>'+t('Dernier renouvellement réussi', 'Last successful renewal')+' : '+date(renewal.lastSuccessAt)+'</small>' : ''}
    ${renewal.lastError ? '<p class="error" role="alert">'+esc(cloudProblem(renewal.lastError))+'</p>' : ''}
    <div class="row wrap">${btn('cloud-certs-configure', t('URL de renouvellement', 'Renewal URL'))}${cert.refreshConfigured ? btn('cloud-certs-refresh', t('Renouveler maintenant', 'Renew now'), '', '', cloudUI.busy ? 'disabled' : '') : ''}</div>`;
}
function cloudRenewalForm() {
  dialog.innerHTML = `<form id="cloud-renewal-form" class="stack" autocomplete="off"><h2>${t('URL de renouvellement Bambu', 'Bambu renewal URL')}</h2>
    <label>trigger-url<input name="refreshUrl" type="url" maxlength="4096" placeholder="https://…/applications/…/cert?aes256=…"></label>
    <p>${t('Cette URL est secrète et ne sera jamais réaffichée. Un champ vide désactive le renouvellement automatique.', 'This URL is secret and will never be displayed again. A blank field disables automatic renewal.')}</p>
    <p class="error" role="alert"></p><div class="row">${btn('close',t('Annuler','Cancel'))}<button type="submit">${t('Enregistrer','Save')}</button></div></form>`;
  if (!dialog.open) dialog.showModal();
}
function cloudPage() {
  const header = title(t('Comptes cloud', 'Cloud accounts'), t('Comptes constructeur · plusieurs fabricants et plusieurs comptes par fabricant.', 'Manufacturer accounts · multiple manufacturers and accounts.'),
    btn('cloud-add', t('Ajouter un compte', 'Add account'), 'plus', 'primary', cloudUI.loading ? 'disabled' : ''));
  if (!cloudUI.data) return header + `<p role="status">${cloudUI.error ? esc(cloudProblem(cloudUI.error)) : t('Chargement…', 'Loading…')}</p>` + btn('cloud-open', t('Actualiser', 'Refresh'));
  const providers = new Map(cloudUI.data.providers.map(item => [item.id, item]));
  return header + `<style>.cloud-account{min-width:0}.cloud-account table{width:100%}.cloud-account td{overflow-wrap:anywhere}.cloud-log{white-space:pre-wrap;overflow-wrap:anywhere;max-height:55vh;overflow:auto;font-size:12px}.cloud-scroll{overflow:auto}.cloud-account h2{overflow-wrap:anywhere}</style>

    <section class="panel stack cloud-account" style="margin-bottom:14px">
      <div class="row between wrap"><div class="stack"><h2>${t('Certificats applicatifs Bambu', 'Bambu application certificates')}</h2><small>${t('Ensemble global pour ce serveur, indépendant des comptes Cloud.', 'One server-wide set, independent of Cloud accounts.')}</small></div>${btn('cloud-certs-upload',t('Importer 3 fichiers PEM','Import 3 PEM files'),'plus')}</div>
      <strong>${cloudUI.certificates?.configured ? t('Fichiers importés', 'Files imported') : t('Aucun certificat importé', 'No certificate imported')}</strong>
      ${cloudUI.certificates?.fingerprint ? '<small>'+esc(cloudUI.certificates.fingerprint)+'</small>' : ''}
      ${cloudCertificateStatus()}
      <small>${t('Stockage chiffré local. Format PEM uniquement ; l’imprimante décidera de l’acceptation. Cet import ne déclenche aucune commande.', 'Encrypted local storage. PEM format only; the printer decides acceptance. Import does not trigger commands.')}</small>
    </section>
    <p class="notice">${t('Bambu Lab : les machines ajoutées depuis ce compte utilisent les commandes cloud signées avec les PEM importés. Fichiers via FTPS local ; renseignez leur adresse dans les réglages caméra.', 'Bambu Lab: devices imported from this account use signed cloud commands with the imported PEMs. Files use local FTPS; set the address in camera settings.')}</p>
    ${cloudUI.error ? `<p class="error" role="alert">${esc(cloudProblem(cloudUI.error))}</p>` : ''}
    <div class="stack">${cloudUI.data.accounts.map(account => {
      const provider = providers.get(account.provider);
      return `<section class="panel stack cloud-account"><div class="row between wrap"><div><h2>${esc(account.name)}</h2><small>${esc(provider?.name ?? account.provider)} · ${esc(account.email || t('Email non renseigné', 'Email not set'))} · ${account.region === 'china' ? t('Chine', 'China') : t('International', 'Global')}</small></div><strong>${esc(cloudStatus(account))}</strong></div>
      ${!provider?.available ? `<p class="notice">${t('Compte enregistré ; connecteur cloud non encore intégré pour ce fabricant.', 'Account saved; cloud connector not yet integrated for this manufacturer.')}</p>` : ''}
      ${account.issue ? `<p class="error" role="alert">${esc(cloudProblem(account.issue))}</p>` : ''}
      ${account.checkedAt ? `<small>${t('Liste reçue le', 'List received at')} ${esc(new Date(account.checkedAt).toLocaleString(state.lang))}</small>` : ''}
      <div class="row wrap">${provider?.available ? btn('cloud-login:' + account.id, account.challenge ? t('Saisir le code', 'Enter code') : t('Se connecter', 'Sign in')) : ''}
      ${account.status === 'connected' ? btn('cloud-devices:' + account.id, t('Relire les machines', 'Refresh devices')) : ''}
      ${account.status === 'connected' ? btn((account.telemetryEnabled ? 'cloud-telemetry-stop:' : 'cloud-telemetry-start:') + account.id, account.telemetryEnabled ? t('Arrêter le suivi cloud', 'Stop cloud monitoring') : t('Activer le suivi cloud', 'Enable cloud monitoring')) : ''}
      ${btn('cloud-logs:' + account.id, t('Journal du compte', 'Account log'))}
      ${account.status !== 'disconnected' || account.challenge ? btn('cloud-disconnect:' + account.id, t('Déconnecter', 'Disconnect')) : ''}
      ${btn('cloud-delete:' + account.id, t('Supprimer', 'Delete'), '', 'danger')}</div>
      ${account.status === 'connected' && account.checkedAt ? `<div class="cloud-scroll"><table><thead><tr><th>${t('Machine', 'Device')}</th><th>${t('Modèle', 'Model')}</th><th>${t('Numéro de série', 'Serial number')}</th><th>${t('État d’impression renvoyé', 'Reported print state')}</th><th>${t('Parc FabCore', 'FabCore fleet')}</th></tr></thead><tbody>${account.devices.map(device => `<tr><td>${esc(device.name)}</td><td>${esc(device.model || '—')}</td><td>${esc(device.serial)}</td><td>${esc((device.status === 'FAIL' ? t('Échec d’impression signalé (FAIL)', 'Print failure reported (FAIL)') : device.status) || (device.online === true ? t('En ligne', 'Online') : device.online === false ? t('Hors ligne', 'Offline') : '—'))}</td><td>${cloudDeviceAction(account, device)}</td></tr>`).join('') || `<tr><td colspan="5">${t('Aucune machine renvoyée par ce compte.', 'No devices returned by this account.')}</td></tr>`}</tbody></table></div>` : ''}
      ${cloudTelemetry(account)}
      ${account.truncated ? `<small>${t('Affichage limité aux 200 premières machines reçues.', 'Display limited to the first 200 devices received.')}</small>` : ''}
      </section>`;
    }).join('') || `<section class="panel"><p>${t('Aucun compte cloud. Ajoutez votre premier compte constructeur.', 'No cloud accounts. Add your first manufacturer account.')}</p></section>`}</div>`;
}
async function openCloudAccounts() {
  if (state.role !== 'admin') return;
  live.page = 'cloud'; cloudUI.loading = true; cloudUI.error = ''; renderLive();
  try { [cloudUI.data, cloudUI.certificates] = await Promise.all([api('cloud-accounts'), api('cloud-certificates')]); } catch (error) { cloudUI.error = error.code; }
  cloudUI.loading = false;
  if (live.phase === 'workshop' && live.page === 'cloud') renderLive();
}

function cloudCertificateForm() {
  dialog.innerHTML = `<form id="cloud-certs-form" class="stack" autocomplete="off">
    <h2>${t('Importer les certificats Bambu','Import Bambu certificates')}</h2>
    <p class="notice">${t('Trois fichiers PEM requis. La clé privée est conservée chiffrée, jamais affichée ni renvoyée par le serveur. Aucun pilotage activé.', 'Three PEM files required. Private key encrypted, never displayed or returned. No controls enabled.')}</p>
    <label>key.pem — ${t('Clé privée RSA','RSA private key')}<input name="key" type="file" accept=".pem,.key,text/plain" required></label>
    <label>chain.pem — ${t('Chaîne de certificats','Certificate chain')}<input name="chain" type="file" accept=".pem,text/plain" required></label>
    <label>crl.pem — ${t('Liste de révocation','Certificate revocation list')}<input name="crl" type="file" accept=".pem,text/plain" required></label>
    <label>${t('URL de rafraîchissement (optionnel)','Refresh URL (optional)')} — trigger-url<input name="refreshUrl" type="url" inputmode="url" placeholder="https://…/applications/…/cert?aes256=…"></label>
    <p class="notice">${t('Cette URL active le renouvellement automatique des PEM avant leur échéance. Elle reste secrète.', 'This URL enables automatic PEM renewal before expiry. It remains secret.')}</p>
    <p class="error" role="alert"></p><p role="status" hidden>${t('Vérification et stockage…','Validating and storing…')}</p>
    <div class="row wrap">${btn('close',t('Annuler','Cancel'))}<button class="primary" type="submit">${t('Importer','Import')}</button></div></form>`;
  if (!dialog.open) dialog.showModal();
}
function cloudAccountForm(account) {
  const verify = Boolean(account?.challenge);
  dialog.innerHTML = `<form id="cloud-form" class="stack" autocomplete="off" data-id="${esc(account?.id ?? '')}" data-mode="${account ? verify ? 'verify' : 'login' : 'add'}">
    <h2>${account ? verify ? t('Vérifier la connexion', 'Verify sign-in') : t('Connexion Bambu Lab', 'Bambu Lab sign-in') : t('Ajouter un compte cloud', 'Add cloud account')}</h2>
    ${account ? `<p>${esc(account.name)} · ${esc(account.email)}</p>` : `<div class="fields"><label>${t('Nom du compte', 'Account name')}<input name="name" required maxlength="80" placeholder="${t('Atelier principal', 'Main workshop')}"></label>
    <label>${t('Fabricant', 'Manufacturer')}<select name="provider">${cloudUI.data.providers.map(item => `<option value="${esc(item.id)}">${esc(item.name)}${item.available ? '' : ' · ' + t('à venir', 'planned')}</option>`).join('')}</select></label>
    <label>${t('Région du compte', 'Account region')}<select name="region"><option value="global">${t('International (dont Europe)', 'Global (including Europe)')}</option><option value="china">${t('Chine', 'China')}</option></select></label>
    <label>${t('Adresse email cloud', 'Cloud email address')}<input name="email" type="email" required maxlength="254" autocomplete="off"></label></div>`}
    ${account ? verify ? `<p>${account.challenge === 'email' ? t('Saisissez le code reçu par email.', 'Enter the code received by email.') : t('Saisissez le code de votre application d’authentification.', 'Enter the code from your authenticator app.')}</p><label>${t('Code à six chiffres', 'Six-digit code')}<input name="code" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label>` : `<p class="notice">${t('Compte créé avec Google, Apple ou Facebook ? Dans Bambu Handy : Profil → Sécurité du compte → Modifier le mot de passe. Utilisez ici ce mot de passe Bambu, jamais celui de Google. La connexion Google directe n’est pas intégrée.', 'Account created with Google, Apple or Facebook? In Bambu Handy: Profile → Account Security → Change Password. Use that Bambu password here, never your Google password. Direct Google sign-in is not integrated.')}</p><label>${t('Mot de passe Bambu Lab', 'Bambu Lab password')}<input name="password" type="password" required maxlength="256" autocomplete="off"></label><small>${t('Transmis à Bambu par HTTPS ; non conservé par FabCore.', 'Sent to Bambu via HTTPS; not retained by FabCore.')}</small>` : ''}
    <p class="error" role="alert"></p><p role="status" hidden>${t('Connexion en cours…', 'Connecting…')}</p>
    <div class="row wrap">${btn('close', t('Annuler', 'Cancel'))}${verify ? btn('cloud-restart:' + account.id, t('Recommencer la connexion', 'Restart sign-in')) : ''}<button type="submit" class="primary">${account ? verify ? t('Vérifier', 'Verify') : t('Se connecter', 'Sign in') : t('Enregistrer', 'Save')}</button></div></form>`;
  if (!dialog.open) dialog.showModal();
}
function cloudLogLabel(line) {
  const labels = {
    'mqtt-connected': ['Connexion MQTT cloud établie', 'Cloud MQTT connected'], 'mqtt-report': ['Rapport machine reçu', 'Device report received'],
    'mqtt-modules': ['Modules identifiés', 'Modules identified'], 'mqtt-read-request': ['Requête de lecture MQTT', 'MQTT read request'],
    'mqtt-error': ['Erreur MQTT cloud', 'Cloud MQTT error'],
    'http-start': ['Requête envoyée à Bambu', 'Request sent to Bambu'], 'http-headers': ['Statut HTTP reçu', 'HTTP status received'],
    'http-result': ['Réponse Bambu reçue', 'Bambu response received'], 'authenticated': ['Connexion au compte réussie', 'Account sign-in succeeded'],
    'devices-read': ['Inventaire des machines reçu', 'Device inventory received'], 'challenge-required': ['Code de vérification demandé', 'Verification code requested'],
    'operation-failed': ['Opération échouée', 'Operation failed'], 'login-throttled': ['Nouvelle connexion temporisée', 'New sign-in throttled'],
    'account-created': ['Compte enregistré dans FabCore', 'Account saved in FabCore'], 'disconnected': ['Compte déconnecté', 'Account disconnected']
  };
  return (labels[line.event] ? t(...labels[line.event]) : line.event) +
    (line.path ? ' · ' + (line.method ?? '') + ' ' + line.path : '') +
    (line.status ? ' · HTTP ' + line.status : '') + (line.count !== undefined ? ' · ' + line.count + ' ' + t('machine(s)', 'device(s)') : '');
}
async function cloudClick(event) {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action?.startsWith('cloud-') || live.phase !== 'workshop' || state.role !== 'admin') return;
  const [kind, id, serial] = action.split(':');
  if (kind === 'cloud-open') return openCloudAccounts();
  if (kind === 'cloud-certs-configure') return cloudRenewalForm();
  if (kind === 'cloud-certs-refresh') {
    if (cloudUI.busy) return; cloudUI.busy = true; renderLive();
    try { await api('cloud-certificates', { action: 'refresh' }); }
    catch (failure) { cloudUI.error = failure.code; }
    finally { cloudUI.busy = false; const failure = cloudUI.error; await openCloudAccounts(); if (failure) { cloudUI.error = failure; renderLive(); } }
    return;
  }
  if (kind === 'cloud-certs-upload') return cloudCertificateForm();
  if (kind === 'cloud-add') { if (cloudUI.data) cloudAccountForm(); return; }
  const account = cloudUI.data?.accounts.find(item => item.id === id);
  if (!account || cloudUI.busy) return;
  if (kind === 'cloud-login' || kind === 'cloud-restart') return cloudAccountForm(kind === 'cloud-restart' ? { ...account, challenge: null } : account);
  if (kind === 'cloud-delete' && !window.confirm(t('Supprimer ce compte, sa connexion et ses journaux locaux ?', 'Delete this account, its connection and local logs?') + '\n' + account.name)) return;
  cloudUI.busy = true; const target = event.target.closest('button'); if (target) target.disabled = true;
  try {
    if (kind === 'cloud-import' || kind === 'cloud-remove') {
      const device = account.devices.find(item => item.serial === serial); if (!device) return;
      if (kind === 'cloud-import') await api('cloud-accounts/' + id + '/import', { serial });
      else {
        const existing = device.fleetId ? { id: device.fleetId } : state.machines.find(machine => ['bambu', 'bambu-cloud'].includes(machine.kind) && machine.serial === serial);
        if (!existing || !window.confirm(t('Êtes-vous sûr de vouloir supprimer cette machine de FabCore ?', 'Are you sure you want to remove this device from FabCore?') + '\n' + device.name + '\n' + t('Elle restera associée à votre compte constructeur.', 'It will remain linked to your manufacturer account.'))) return;
        await api('machines/delete', { id: existing.id });
        state.machines = state.machines.filter(machine => machine.id !== existing.id);
      }
      await openCloudAccounts();
    } else if (kind === 'cloud-logs') {
      const data = await api('cloud-accounts/' + id + '/logs');
      if (live.phase !== 'workshop') return;
      dialog.innerHTML = `<form method="dialog" class="stack"><h2>${t('Journal du compte', 'Account log')} · ${esc(account.name)}</h2><small>${t('300 dernières lignes · mots de passe, codes, jetons et cookies exclus.', 'Last 300 lines · passwords, codes, tokens and cookies excluded.')}</small><pre class="cloud-log">${esc(data.lines.map(line => new Date(line.at).toLocaleString(state.lang) + ' · ' + cloudLogLabel(line) + '\n' + JSON.stringify(line, null, 2)).join('\n\n'))}</pre><div class="row wrap"><a class="button" href="/api/cloud-accounts/${id}/logs-download" download>${t('Télécharger le fichier log', 'Download log file')}</a>${btn('close', t('Fermer', 'Close'))}</div></form>`;
      if (!dialog.open) dialog.showModal();
    } else {
      const operation = ({ 'cloud-telemetry-start': 'telemetry-start', 'cloud-telemetry-stop': 'telemetry-stop', 'cloud-devices': 'devices', 'cloud-disconnect': 'disconnect', 'cloud-delete': 'delete' })[kind];
      if (operation) { await api('cloud-accounts/' + id + '/' + operation, {}); await openCloudAccounts(); }
    }
  } catch (error) { toast(cloudProblem(error.code)); }
  finally { cloudUI.busy = false; if (target?.isConnected) target.disabled = false; }
}
app.addEventListener('click', cloudClick);
dialog.addEventListener('click', cloudClick);

dialog.addEventListener('submit', async event => {
  const form=event.target;
  if (form?.getAttribute?.('id')!=='cloud-certs-form') return;
  event.preventDefault();
  if (cloudUI.busy || state.role!=='admin') return;
  cloudUI.busy=true;
  form.querySelector('[role=status]').hidden=false;
  form.querySelector('[role=alert]').textContent='';
  try {
    const payload={};
    for (const field of ['key','chain','crl']) {
      const file=form.elements.namedItem(field)?.files?.[0];
      if (!file || file.size>48*1024 || file.size===0) throw {code:'bambu-cert-invalid'};
      payload[field]=await file.text();
    }
    const refreshUrl=form.elements.namedItem('refreshUrl')?.value?.trim();
    if (refreshUrl) payload.refreshUrl=refreshUrl;
    await api('cloud-certificates',payload);
    if (form.isConnected) { form.reset(); dialog.close(); }
    await openCloudAccounts();
  } catch(error) {
    if (form.isConnected) form.querySelector('[role=alert]').textContent=cloudProblem(error.code);
  } finally {
    cloudUI.busy=false;
    if(form.isConnected) form.querySelector('[role=status]').hidden=true;
  }
});
dialog.addEventListener('submit', async event => {
  const form = event.target;
  if (form?.getAttribute?.('id') !== 'cloud-form') return;
  event.preventDefault();
  if (cloudUI.busy || state.role !== 'admin' || live.phase !== 'workshop') return;
  cloudUI.busy = true;
  const payload = Object.fromEntries(new FormData(form));
  // Immediately erase credential inputs. Never put them into cloudUI or localStorage.
  form.querySelectorAll('input[type=password]').forEach(input => { input.value = ''; });
  form.querySelectorAll('input,button,select').forEach(input => { input.disabled = true; });
  form.querySelector('[role=status]').hidden = false;
  form.querySelector('[role=alert]').textContent = '';
  try {
    const mode = form.dataset.mode; const id = form.dataset.id;
    const result = await api('cloud-accounts' + (mode === 'add' ? '' : '/' + id + '/' + mode), payload);
    if (live.phase !== 'workshop') return;
    dialog.close(); await openCloudAccounts();
    if (result.challenge) cloudAccountForm(result);
    else if (mode === 'add' && result.provider === 'bambu') cloudAccountForm(result);
  } catch (error) {
    if (form.isConnected) form.querySelector('[role=alert]').textContent = cloudProblem(error.code);
  } finally {
    delete payload.password; delete payload.code;
    cloudUI.busy = false;
    if (form.isConnected) {
      form.querySelectorAll('input,button,select').forEach(input => { input.disabled = false; });
      form.querySelector('[role=status]').hidden = true;
    }
  }
});

// Reading this local endpoint never triggers login, pushall or a cloud HTTP request.
let cloudRefreshPending = false;
setInterval(async () => {
  if (cloudRefreshPending || cloudUI.busy || state.role !== 'admin' || live.phase !== 'workshop' || live.page !== 'cloud' || dialog.open || !cloudUI.data?.accounts.some(account => account.telemetryEnabled)) return;
  cloudRefreshPending = true;
  try { cloudUI.data = await api('cloud-accounts'); if (live.page === 'cloud' && !dialog.open && !cloudUI.busy) renderLive(); }
  catch { /* Explicit refresh still displays connection errors. */ }
  finally { cloudRefreshPending = false; }
}, 5000);

dialog.addEventListener('submit', async event => {
  const form = event.target;
  if (form?.getAttribute?.('id') !== 'cloud-renewal-form') return;
  event.preventDefault(); if (cloudUI.busy || state.role !== 'admin') return;
  cloudUI.busy = true;
  try { await api('cloud-certificates', { action: 'configure', refreshUrl: form.elements.namedItem('refreshUrl').value.trim() }); form.reset(); dialog.close(); await openCloudAccounts(); }
  catch (failure) { form.querySelector('[role=alert]').textContent = cloudProblem(failure.code); }
  finally { cloudUI.busy = false; }
});

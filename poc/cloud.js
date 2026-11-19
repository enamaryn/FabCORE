// Cloud-account metadata only: credentials are read from the form once, never retained in UI state.
const cloudUI = { data: null, loading: false, error: '', busy: false };
function cloudProblem(code) {
  const labels = {
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
function cloudPage() {
  const header = title(t('Comptes cloud', 'Cloud accounts'), t('Comptes constructeur · plusieurs fabricants et plusieurs comptes par fabricant.', 'Manufacturer accounts · multiple manufacturers and accounts.'),
    btn('cloud-add', t('Ajouter un compte', 'Add account'), 'plus', 'primary', cloudUI.loading ? 'disabled' : ''));
  if (!cloudUI.data) return header + `<p role="status">${cloudUI.error ? esc(cloudProblem(cloudUI.error)) : t('Chargement…', 'Loading…')}</p>` + btn('cloud-open', t('Actualiser', 'Refresh'));
  const providers = new Map(cloudUI.data.providers.map(item => [item.id, item]));
  return header + `<style>.cloud-account{min-width:0}.cloud-account table{width:100%}.cloud-account td{overflow-wrap:anywhere}.cloud-log{white-space:pre-wrap;overflow-wrap:anywhere;max-height:55vh;overflow:auto;font-size:12px}.cloud-scroll{overflow:auto}.cloud-account h2{overflow-wrap:anywhere}</style>
    <p class="notice">${t('Pilote Bambu Lab : authentification et lecture de la liste des machines uniquement. Aucun lancement, chauffe ou mouvement. Les machines ci-dessous ne sont pas ajoutées au parc.', 'Bambu Lab pilot: sign-in and device-list reading only. No printing, heating or motion. Devices below are not added to the fleet.')}</p>
    ${cloudUI.error ? `<p class="error" role="alert">${esc(cloudProblem(cloudUI.error))}</p>` : ''}
    <div class="stack">${cloudUI.data.accounts.map(account => {
      const provider = providers.get(account.provider);
      return `<section class="panel stack cloud-account"><div class="row between wrap"><div><h2>${esc(account.name)}</h2><small>${esc(provider?.name ?? account.provider)} · ${esc(account.email || t('Email non renseigné', 'Email not set'))} · ${account.region === 'china' ? t('Chine', 'China') : t('International', 'Global')}</small></div><strong>${esc(cloudStatus(account))}</strong></div>
      ${!provider?.available ? `<p class="notice">${t('Compte enregistré ; connecteur cloud non encore intégré pour ce fabricant.', 'Account saved; cloud connector not yet integrated for this manufacturer.')}</p>` : ''}
      ${account.issue ? `<p class="error" role="alert">${esc(cloudProblem(account.issue))}</p>` : ''}
      ${account.checkedAt ? `<small>${t('Liste reçue le', 'List received at')} ${esc(new Date(account.checkedAt).toLocaleString(state.lang))}</small>` : ''}
      <div class="row wrap">${provider?.available ? btn('cloud-login:' + account.id, account.challenge ? t('Saisir le code', 'Enter code') : t('Se connecter', 'Sign in')) : ''}
      ${account.status === 'connected' ? btn('cloud-devices:' + account.id, t('Relire les machines', 'Refresh devices')) : ''}
      ${btn('cloud-logs:' + account.id, t('Journal du compte', 'Account log'))}
      ${account.status !== 'disconnected' || account.challenge ? btn('cloud-disconnect:' + account.id, t('Déconnecter', 'Disconnect')) : ''}
      ${btn('cloud-delete:' + account.id, t('Supprimer', 'Delete'), '', 'danger')}</div>
      ${account.status === 'connected' && account.checkedAt ? `<div class="cloud-scroll"><table><thead><tr><th>${t('Machine', 'Device')}</th><th>${t('Modèle', 'Model')}</th><th>${t('Numéro de série', 'Serial number')}</th><th>${t('État cloud', 'Cloud status')}</th><th>${t('Parc FabCore', 'FabCore fleet')}</th></tr></thead><tbody>${account.devices.map(device => `<tr><td>${esc(device.name)}</td><td>${esc(device.model || '—')}</td><td>${esc(device.serial)}</td><td>${esc(device.status || (device.online === true ? t('En ligne', 'Online') : device.online === false ? t('Hors ligne', 'Offline') : '—'))}</td><td>${state.machines.some(machine => machine.kind === 'bambu' && machine.serial === device.serial) ? t('Déjà ajoutée en LAN', 'Already added via LAN') : t('Non ajoutée', 'Not added')}</td></tr>`).join('') || `<tr><td colspan="5">${t('Aucune machine renvoyée par ce compte.', 'No devices returned by this account.')}</td></tr>`}</tbody></table></div>` : ''}
      ${account.truncated ? `<small>${t('Affichage limité aux 200 premières machines reçues.', 'Display limited to the first 200 devices received.')}</small>` : ''}
      </section>`;
    }).join('') || `<section class="panel"><p>${t('Aucun compte cloud. Ajoutez votre premier compte constructeur.', 'No cloud accounts. Add your first manufacturer account.')}</p></section>`}</div>`;
}
async function openCloudAccounts() {
  if (state.role !== 'admin') return;
  live.page = 'cloud'; cloudUI.loading = true; cloudUI.error = ''; renderLive();
  try { cloudUI.data = await api('cloud-accounts'); } catch (error) { cloudUI.error = error.code; }
  cloudUI.loading = false;
  if (live.phase === 'workshop' && live.page === 'cloud') renderLive();
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
async function cloudClick(event) {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action?.startsWith('cloud-') || live.phase !== 'workshop' || state.role !== 'admin') return;
  const [kind, id] = action.split(':');
  if (kind === 'cloud-open') return openCloudAccounts();
  if (kind === 'cloud-add') { if (cloudUI.data) cloudAccountForm(); return; }
  const account = cloudUI.data?.accounts.find(item => item.id === id);
  if (!account || cloudUI.busy) return;
  if (kind === 'cloud-login' || kind === 'cloud-restart') return cloudAccountForm(kind === 'cloud-restart' ? { ...account, challenge: null } : account);
  if (kind === 'cloud-delete' && !window.confirm(t('Supprimer ce compte, sa connexion et ses journaux locaux ?', 'Delete this account, its connection and local logs?') + '\n' + account.name)) return;
  cloudUI.busy = true; const target = event.target.closest('button'); if (target) target.disabled = true;
  try {
    if (kind === 'cloud-logs') {
      const data = await api('cloud-accounts/' + id + '/logs');
      if (live.phase !== 'workshop') return;
      dialog.innerHTML = `<form method="dialog" class="stack"><h2>${t('Journal du compte', 'Account log')} · ${esc(account.name)}</h2><small>${t('300 dernières lignes · mots de passe, codes, jetons et cookies exclus.', 'Last 300 lines · passwords, codes, tokens and cookies excluded.')}</small><pre class="cloud-log">${esc(data.lines.map(line => JSON.stringify(line)).join('\n'))}</pre><div class="row wrap"><a class="button" href="/api/cloud-accounts/${id}/logs-download" download>${t('Télécharger le fichier log', 'Download log file')}</a>${btn('close', t('Fermer', 'Close'))}</div></form>`;
      if (!dialog.open) dialog.showModal();
    } else {
      const operation = ({ 'cloud-devices': 'devices', 'cloud-disconnect': 'disconnect', 'cloud-delete': 'delete' })[kind];
      if (operation) { await api('cloud-accounts/' + id + '/' + operation, {}); await openCloudAccounts(); }
    }
  } catch (error) { toast(cloudProblem(error.code)); }
  finally { cloudUI.busy = false; if (target?.isConnected) target.disabled = false; }
}
app.addEventListener('click', cloudClick);
dialog.addEventListener('click', cloudClick);
dialog.addEventListener('submit', async event => {
  const form = event.target;
  if (form.id !== 'cloud-form') return;
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

import { bambuCameraInfo } from '../src/domain/camera.ts';
import { streamBambuCamera } from './bambu-camera.mjs';

/** Account Cloud telemetry stays Cloud; the selected camera transport is explicitly LAN RTSPS. */
export async function streamCloudCamera(machine, output, signal, onFrame, { cloud, diagnostics, enabled, stream = streamBambuCamera }) {
  const info = bambuCameraInfo(machine.camera, enabled);
  if (!info.available) return info.issue;
  const abort = new AbortController();
  const combined = AbortSignal.any([signal, abort.signal]);
  let guard, credentials;
  const authorized = () => { try { return credentials?.authorized() === true; } catch { return false; } };
  diagnostics?.trace(machine.id, 'cloud-camera-open', { mode: info.mode, transport: 'rtsps', host: info.host, kind: 'cloud-account-lan-video' });
  try {
    credentials = await cloud.cameraConnection(machine, combined);
    if (combined.aborted || !authorized()) return 'camera-unavailable';
    guard = setInterval(() => { if (!authorized()) abort.abort(); }, 1000); guard.unref?.();
    const ok = await stream({ id: machine.id, origin: 'mqtts://' + info.host + ':8883', serial: machine.serial, accessCode: credentials.accessCode }, output, combined, onFrame);
    diagnostics?.trace(machine.id, 'cloud-camera-result', { transport: 'rtsps', outcome: ok ? 'streamed' : 'unavailable' });
    return ok ? undefined : 'camera-unavailable';
  } catch (failure) {
    if (signal.aborted) { diagnostics?.trace(machine.id, 'cloud-camera-result', { transport: 'rtsps', outcome: 'closed' }); return; }
    const reason = ['cloud-auth', 'cloud-access', 'cloud-rate', 'camera-credentials', 'cloud-storage'].includes(failure?.message) ? failure.message : ['ECONNREFUSED', 'ETIMEDOUT', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(failure?.code) ? failure.code : 'camera-unavailable';
    diagnostics?.trace(machine.id, 'cloud-camera-failed', { transport: 'rtsps', reason });
    return 'camera-unavailable';
  } finally { clearInterval(guard); abort.abort(); if (credentials) credentials.accessCode = ''; }
}

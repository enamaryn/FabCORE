import { createBambuFiles } from './bambu-files.mjs';

/** Cloud commands, local FTPS storage: never substitute the cloud broker as an FTP host. */
export function createBambuCloudFiles(cloud, makeClient) {
  const native = createBambuFiles((machine, command, params) => cloud.send(machine, command, params), makeClient);
  return {
    async list(machine) { return native.list(await cloud.fileConnection(machine)); },
    async download(machine, path, signal) { return native.download(await cloud.fileConnection(machine, signal), path, signal); },
    async upload(machine, name, source) { return native.upload(await cloud.fileConnection(machine), name, source); },
    start(machine, path, plate) { return native.start(machine, path, plate); },
  };
}

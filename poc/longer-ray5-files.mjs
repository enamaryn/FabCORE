import { ray5Target } from './longer-ray5.mjs';
import { readResponse } from './connector-http.mjs';
const limit = 16 * 1024 * 1024;
export function ray5Path(path) {
  if (typeof path !== 'string' || path.length > 200 || !/^[A-Za-z0-9 _./()-]+\.(?:gc|gcode|gco|g|nc)$/i.test(path)) return null;
  return path.split('/').some(p => !p || p === '.' || p === '..' || p.trim() !== p) ? null : path;
}
const folderPath = path => typeof path === 'string' && path.length <= 150 && /^[A-Za-z0-9 _./()-]+$/.test(path) && !path.split('/').some(p => !p || p === '.' || p === '..' || p.trim() !== p);
async function bounded(response, max) {
  if (!response.body) throw new Error('files-unavailable');
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try { while (true) { const {value,done} = await reader.read(); if (done) break; bytes += value.length; if (bytes > max) { await reader.cancel(); throw new Error('file-too-large'); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
export function createRay5Files({ read, fetcher = fetch, diagnostics } = {}) {
  function origin(machine) {
    const target = ray5Target(machine), port = machine.httpPort ?? (target?.transport === 'tcp' ? 80 : target?.port);
    if (!target || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('files-unavailable');
    return `http://${target.host}:${port}`;
  }
  async function idle(machine) { if ((await read(machine))?.nativeState !== 'Idle') throw new Error('files-unavailable'); }
  async function request(machine,path,options = {},signal) {
    const response = await fetcher(origin(machine)+path,{...options,redirect:'error',signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000)});
    diagnostics?.trace?.(machine.id,'ray5-sd-http',{method:options.method ?? 'GET',path:path.split('?')[0],status:response.status});
    if (!response.ok) { await response.body?.cancel(); throw new Error('files-unavailable'); }
    return response;
  }
  async function list(machine) {
    await idle(machine);
    const out = [], queue = [{path:'',depth:0}]; let visited = 0;
    while (queue.length && out.length < 300 && visited++ < 24) {
      const {path,depth} = queue.shift(); await idle(machine);
      const data = await readResponse(await request(machine,'/upload?'+new URLSearchParams({path:'/'+path})));
      if (data?.status !== 'Ok' || !Array.isArray(data.files)) throw new Error('files-unavailable');
      for (const item of data.files.slice(0,300)) {
        if (typeof item.name !== 'string' || item.name.includes('/')) continue;
        const name = path ? path+'/'+item.name : item.name;
        if (String(item.size) === '-1') { if (depth < 3 && folderPath(name)) queue.push({path:name,depth:depth+1}); continue; }
        if (ray5Path(name)) out.push({path:name,size:null,modified:null});
      }
    }
    return out.slice(0,300);
  }
  async function download(machine,path,signal) {
    await idle(machine);
    if (!ray5Path(path)) throw new Error('invalid-file');
    // Read original SD bytes. ESP221 reformats lines and is unsuitable for exact downloads/transfers.
    const data = await bounded(await request(machine,'/SD/'+path.split('/').map(encodeURIComponent).join('/'),{},signal),limit);
    const text = new TextDecoder('utf-8',{fatal:true}).decode(data);
    if (!data.length || /\0/.test(text) || !/^\s*(?:[;(]|(?:N\d+\s*)?[GMXYZFS]\s*[+\d.-])/im.test(text) || /^\s*(?:<|\{|\[|error\b|alarm\b)/im.test(text)) throw new Error('files-unavailable');
    return new Response(data,{headers:{'Content-Length':String(data.length),'Content-Type':'text/plain; charset=utf-8'}});
  }
  return {list,download,
    async upload(machine,name,stream,size,signal) {
      await idle(machine);
      if (!ray5Path(name) || name.includes('/') || !Number.isSafeInteger(size) || size < 1 || size > limit) throw new Error('invalid-file');
      if ((await list(machine)).some(item => item.path.toLowerCase() === name.toLowerCase())) throw new Error('file-exists');
      const chunks = []; let bytes = 0;
      for await (const chunk of stream) { bytes += chunk.length; if (bytes > size || bytes > limit) throw new Error('file-too-large'); chunks.push(chunk); }
      if (bytes !== size) throw new Error('upload-failed');
      const form = new FormData(); form.set('path','/'); form.set(name+'S',String(size));
      form.set('file',new Blob(chunks,{type:'application/octet-stream'}),name);
      await idle(machine);
      const data = await readResponse(await request(machine,'/upload?path=%2F',{method:'POST',body:form},signal));
      if (data?.status !== 'Ok' || !Array.isArray(data.files) || !data.files.some(item => item.name === name)) throw new Error('upload-failed');
      const received = Buffer.from(await (await download(machine,name,signal)).arrayBuffer());
      if (!received.equals(Buffer.concat(chunks))) throw new Error('upload-failed');
      return name;
    },
    async start(machine,path) {
      await idle(machine);
      if (!ray5Path(path) || !(await list(machine)).some(item => item.path === path)) throw new Error('invalid-file');
      await idle(machine);
      const text = (await bounded(await request(machine,'/command?'+new URLSearchParams({plain:'[ESP220]/'+path})),8192)).toString('utf8');
      if (/error|alarm|busy|invalid|not found/i.test(text)) return false;
      if (!/^ok\s*$/i.test(text) && !/<Run[|>]/.test(text)) throw new Error('command-unconfirmed');
      return true;
    }
  };
}

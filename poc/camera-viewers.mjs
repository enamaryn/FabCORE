import { Writable } from 'node:stream';

export function cameraRelay() {
  const controller = new AbortController();
  const viewers = new Map();
  let response;
  let delimiter;
  let tail = Buffer.alloc(0);
  let started = false;

  const output = new Writable({
    write(chunk, _, done) {
      const joining = [...viewers.values()].some(viewer => !viewer.aligned);
      const combined = joining ? Buffer.concat([tail, chunk]) : null;
      const boundary = combined && delimiter ? combined.indexOf(delimiter) : -1;
      for (const [res, viewer] of viewers) {
        if (viewer.aligned) send(res, chunk);
        else if (boundary >= 0) {
          viewer.aligned = true;
          send(res, combined.subarray(boundary + 2));
        }
      }
      started = true;
      if (delimiter) {
        const source = combined ?? (chunk.length >= delimiter.length ? chunk : Buffer.concat([tail, chunk]));
        tail = Buffer.from(source.subarray(-(delimiter.length - 1)));
      }
      done();
    }
  });
  output.writeHead = (status, headers) => {
    response = [status, headers];
    const type = headers['Content-Type'];
    const boundary = /boundary\s*=\s*"?([-A-Za-z0-9_.]+)/i.exec(type)?.[1];
    if (boundary) delimiter = Buffer.from('\r\n--' + boundary);
    for (const res of viewers.keys()) res.writeHead(...response);
  };

  function send(res, chunk) {
    // A slow browser must neither stall the camera nor queue unbounded video.
    if (res.writableLength + chunk.length > 2 * 1024 * 1024) res.destroy();
    else res.write(chunk);
  }

  function subscribe(res, owner, expires) {
    const close = () => {
      clearTimeout(timer);
      viewers.delete(res);
      if (!viewers.size) controller.abort();
    };
    const timer = setTimeout(() => res.destroy(), Math.max(0, expires - Date.now()));
    timer.unref();
    viewers.set(res, { owner, aligned: !started });
    res.once('close', close);
    if (response) res.writeHead(...response);
  }

  return { controller, output, viewers, subscribe };
}

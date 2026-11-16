export function createDiagnostics() {
  const events = [];
  const machines = new Map();
  function record(area, code, id = null) {
    events.unshift({ at: new Date().toISOString(), area, code, id });
    if (events.length > 300) events.pop();
  }
  function entry(id) {
    if (!machines.has(id)) machines.set(id, {});
    return machines.get(id);
  }
  return {
    record,
    report(id) { entry(id).reportAt = new Date().toISOString(); },
    frame(id) { entry(id).frameAt = new Date().toISOString(); },
    status(id, { status, issue }) {
      if (status === 'connecting') return;
      const code = issue ?? status;
      const machine = entry(id);
      if (machine.status !== code) record('status', code, id);
      machine.status = code;
    },
    view() { return { events, machines: Object.fromEntries(machines) }; }
  };
}

// Track complete JPEG images without retaining the video stream.
export async function* observeImages(stream, onFrame) {
  let inside = false;
  let previous = -1;
  for await (const chunk of stream) {
    let frame = false;
    // JPEG start/end markers can straddle two transport chunks.
    if (chunk.length) {
      let offset = 0;
      if (previous === 0xff && chunk[0] === 0xd8) inside = true;
      if (previous === 0xff && chunk[0] === 0xd9 && inside) {
        frame = true;
        inside = false;
      }
      while (offset < chunk.length) {
        const marker = inside ? JPEG_END : JPEG_START;
        const index = chunk.indexOf(marker, offset);
        if (index < 0) break;
        if (inside) frame = true;
        inside = !inside;
        offset = index + marker.length;
      }
      previous = chunk.at(-1);
    }
    if (frame) onFrame();
    yield chunk;
  }
}
const JPEG_START = Buffer.from([0xff, 0xd8]);
const JPEG_END = Buffer.from([0xff, 0xd9]);

export interface EventStream {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener(type: string, callback: () => void): void;
  close(): void;
}
interface EventOptions {
  invalidate(): void;
  events?: string[];
  open?: ((url: string) => EventStream) | undefined;
  now?: () => number;
}
/** Même stratégie que le POC : regroupement 1 s, sécurité 30 s, secours 2 s, aucune commande. */
export function subscribeFleet({ invalidate, events = ['machine.telemetry', 'fleet.changed'], open = typeof EventSource === 'undefined' ? undefined : url => new EventSource(url), now = Date.now }: EventOptions) {
  let reconnecting = false;
  let stopped = false, source: EventStream | null = null, last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined, retry: ReturnType<typeof setTimeout> | undefined;
  let fallback: ReturnType<typeof setInterval> | undefined;
  const refresh = () => { if (!stopped) invalidate(); };
  const poll = (active: boolean) => {
    if (active && !fallback) fallback = setInterval(refresh, 2000);
    if (!active) { clearInterval(fallback); fallback = undefined; }
  };
  const schedule = () => {
    if (stopped || timer) return;
    timer = setTimeout(() => { timer = undefined; last = now(); refresh(); }, Math.max(0, 1000 - (now() - last)));
  };
  function connect() {
    if (stopped || source || !open) return;
    const current = open('/api/events'); source = current;
    current.onopen = () => { if (source === current && !stopped) { poll(false); if (reconnecting) { reconnecting = false; refresh(); } } };
    for (const event of events) current.addEventListener(event, schedule);
    current.addEventListener('resync', refresh);
    current.onerror = () => {
      if (stopped || source !== current) return;
      reconnecting = true; poll(true);
      if (current.readyState === 2) { current.close(); source = null; retry = setTimeout(connect, 5000); }
    };
  }
  try { connect(); } catch { poll(true); }
  if (!source) poll(true);
  const safety = setInterval(() => { if (!fallback) refresh(); }, 30000);
  return () => { stopped = true; clearTimeout(timer); clearTimeout(retry); clearInterval(fallback); clearInterval(safety); source?.close(); source = null; };
}

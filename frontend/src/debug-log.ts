/**
 * Ring-buffer debug log (max 500 entries) + subscription API.
 * Used by /debug page and wired to fetch results + login/logout.
 */

export type DebugLog = {
  ts: number;
  level: "info" | "warn" | "error";
  tag: string;
  message: string;
  meta?: any;
};

const BUFFER_MAX = 500;
const logs: DebugLog[] = [];
const listeners = new Set<() => void>();

export function debugLog(level: DebugLog["level"], tag: string, message: string, meta?: any) {
  const entry: DebugLog = { ts: Date.now(), level, tag, message, meta };
  logs.push(entry);
  if (logs.length > BUFFER_MAX) logs.splice(0, logs.length - BUFFER_MAX);
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* noop */
    }
  });
}

export function getDebugLogs(): DebugLog[] {
  return [...logs].reverse();
}

export function subscribeDebugLogs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

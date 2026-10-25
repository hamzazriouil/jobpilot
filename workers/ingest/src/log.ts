// Structured JSON logs → Workers Logs (Architecture §12). Never pass secrets, keys or full URLs
// with credentials in `fields`: callers log counts, ids and short error messages only.

export type LogFn = (event: string, fields?: Record<string, unknown>) => void;

export const consoleLog: LogFn = (event, fields = {}) => {
  const line = JSON.stringify({ type: 'ingest', event, ...fields });
  if (event.endsWith('_error') || event === 'error') console.error(line);
  else console.log(line);
};

export const silentLog: LogFn = () => {};

/** Short, single-line error text for logs and `sources.last_status`. */
export function errorText(err: unknown, max = 200): string {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return msg.replace(/\s+/g, ' ').slice(0, max);
}

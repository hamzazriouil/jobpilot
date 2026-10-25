import { readFileSync } from 'node:fs';

// Reads a wrangler `.dev.vars` file for the CLI (same parser as evals/lib/dev-vars.ts).
// Values are returned to the caller only: never log them.

export function parseDevVars(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2]!.trim();
    const quoted = /^(["'])(.*)\1$/.exec(value);
    if (quoted) value = quoted[2]!;
    else value = value.replace(/\s+#.*$/, ''); // trailing comment on an unquoted value
    out[m[1]!] = value;
  }
  return out;
}

export function loadDevVars(path: string): Record<string, string> {
  try {
    return parseDevVars(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read ${path}: ${(err as NodeJS.ErrnoException).code ?? String(err)}`);
  }
}

import { himalayas } from './himalayas';
import { remoteok } from './remoteok';
import type { SourceAdapter } from './types';

// Source registry (docs/10-SOURCES.md). Only sources whose terms we've read and accepted have an
// adapter. Whether a source runs is decided by `sources.enabled` in the DB (the Worker) or by
// `--source` (the CLI). `supabase/seed.sql` holds the same attribution/enabled values.

export const ADAPTERS: Readonly<Record<string, SourceAdapter>> = Object.freeze({
  [himalayas.id]: himalayas,
  [remoteok.id]: remoteok,
});

export function getAdapter(id: string): SourceAdapter | null {
  return ADAPTERS[id] ?? null;
}

export type { SourceAdapter, SourceContext, SourcePage } from './types';

import { fileURLToPath } from 'node:url';
import { consoleSink, type ProviderConfig } from '@jobpilot/core/llm';
import { createDb, type IngestDb } from './db';
import { loadDevVars } from './dev-vars';
import { DEFAULT_LLM_FALLBACK_CAP, DEFAULT_MAX_PAGES, intVar, SEARCH_COUNTRIES, userAgent } from './env';
import { consoleLog } from './log';
import { runIngest, type SourceStats } from './pipeline';
import { ADAPTERS, getAdapter, type SourceAdapter } from './sources';

// Local runner for the ingest pipeline (docs/09-PHASE1-CONTRACT.md §5). Same code as the Worker,
// with Workers AI over REST. Reads apps/web/.dev.vars; never prints its values.
//
//   pnpm --filter @jobpilot/ingest once -- --source himalayas --dry-run
//   pnpm --filter @jobpilot/ingest once -- --source himalayas,remoteok --pages 40 --limit 300
//   pnpm --filter @jobpilot/ingest once -- --sync-sources     # write attribution + enabled to `sources`
//   pnpm --filter @jobpilot/ingest once -- --stats            # public job counts by eligibility_type
//
// Flags: --source <id[,id]> (default: sources enabled in the DB), --dry-run (no writes, no LLM,
// no embeddings), --limit <n> new jobs per source, --pages <n> requests per source,
// --llm-cap <n> fallback calls per run, --no-llm.

const DEV_VARS_PATH = fileURLToPath(new URL('../../../apps/web/.dev.vars', import.meta.url));
const APP_URL_DEFAULT = 'https://jobpilot-web.buildli731.workers.dev';

interface Args {
  sources: string[];
  dryRun: boolean;
  limit?: number;
  pages: number;
  llmCap: number;
  noLlm: boolean;
  syncSources: boolean;
  stats: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { sources: [], dryRun: false, pages: DEFAULT_MAX_PAGES, llmCap: DEFAULT_LLM_FALLBACK_CAP, noLlm: false, syncSources: false, stats: false };
  const num = (flag: string, v: string | undefined) => {
    const n = Number.parseInt(v ?? '', 10);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${flag} needs a non-negative number`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') continue; // pnpm passes it through
    if (a === '--source') args.sources.push(...(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--limit') args.limit = num(a, argv[++i]);
    else if (a === '--pages') args.pages = num(a, argv[++i]);
    else if (a === '--llm-cap') args.llmCap = num(a, argv[++i]);
    else if (a === '--no-llm') args.noLlm = true;
    else if (a === '--sync-sources') args.syncSources = true;
    else if (a === '--stats') args.stats = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

async function syncSources(db: IngestDb): Promise<void> {
  // Same values as supabase/seed.sql. Only sources with an adapter (= terms read and accepted).
  for (const a of Object.values(ADAPTERS)) {
    await db.updateSource(a.id, { enabled: true, attribution: a.attribution });
    console.log(`sources.${a.id}: enabled, attribution "${a.attribution}"`);
  }
}

async function printStats(db: IngestDb): Promise<void> {
  const total = await db.countPublicJobs();
  const withEmbedding = await db.countPublicJobs('embedding=not.is.null');
  const rows: Array<[string, number]> = [
    ['public jobs', total],
    ['  with embedding', withEmbedding],
    ['  with eligibility_type', await db.countPublicJobs('eligibility_type=not.is.null')],
    ['  eligible + embedded (feed-ready)', await db.countPublicJobs('eligibility_type=not.is.null&embedding=not.is.null')],
  ];
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const live = `or=(expires_at.is.null,expires_at.gt.${now})`;
  rows.push(['  feed-ready and not expired', await db.countPublicJobs(`${live}&eligibility_type=not.is.null&embedding=not.is.null`)]);
  for (const t of ['worldwide', 'regions', 'unclear'] as const) rows.push([`    not expired, ${t}`, await db.countPublicJobs(`${live}&eligibility_type=eq.${t}`)]);
  for (const t of ['worldwide', 'regions', 'unclear'] as const) rows.push([`  eligibility_type=${t}`, await db.countPublicJobs(`eligibility_type=eq.${t}`)]);
  for (const id of Object.keys(ADAPTERS)) rows.push([`  source_id=${id}`, await db.countPublicJobs(`source_id=eq.${id}`)]);
  for (const [k, v] of rows) console.log(`${k.padEnd(38)} ${v}`);
  const enabled = await db.enabledSources();
  console.log(`enabled sources: ${enabled.map((s) => `${s.id} (last run ${s.last_run_at ?? 'never'})`).join(', ') || 'none'}`);
}

function printRun(stats: SourceStats[], dryRun: boolean): void {
  for (const s of stats) {
    const { samples, ...counts } = s;
    console.log(`\n── ${s.source} ${dryRun ? '(dry run)' : ''}`);
    console.log(JSON.stringify(counts, null, 2));
    if (dryRun) {
      for (const j of samples) {
        console.log(
          JSON.stringify({ ...j, description: `${j.description.slice(0, 300)}${j.description.length > 300 ? '…' : ''}` }, null, 2),
        );
      }
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const vars = loadDevVars(DEV_VARS_PATH);
  // NEXT_PUBLIC_SUPABASE_URL (web's name) → SUPABASE_URL (the Worker's name).
  const supabaseUrl = vars.SUPABASE_URL || vars.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = vars.SUPABASE_SERVICE_ROLE_KEY;
  const db = supabaseUrl && serviceKey ? createDb({ url: supabaseUrl, serviceRoleKey: serviceKey }) : null;
  console.log(
    `config: supabase ${db ? 'yes' : 'no'}, workers-ai rest ${vars.CLOUDFLARE_ACCOUNT_ID && vars.CLOUDFLARE_API_TOKEN ? 'yes' : 'no'}, gemini ${vars.GOOGLE_GENERATIVE_AI_API_KEY ? 'yes' : 'no'}`,
  );

  if (args.syncSources || args.stats) {
    if (!db) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    if (args.syncSources) await syncSources(db);
    if (args.stats) await printStats(db);
    return;
  }

  let ids = args.sources;
  if (!ids.length) {
    if (!db) throw new Error('No --source given and no DB to read enabled sources from');
    ids = (await db.enabledSources()).map((s) => s.id);
  }
  const adapters = ids.map((id) => {
    const a = getAdapter(id);
    if (!a) throw new Error(`No adapter for source "${id}" (have: ${Object.keys(ADAPTERS).join(', ')})`);
    return a;
  }) satisfies SourceAdapter[];

  const llm: ProviderConfig | null =
    !args.noLlm && vars.GOOGLE_GENERATIVE_AI_API_KEY ? { gemini: { apiKey: vars.GOOGLE_GENERATIVE_AI_API_KEY } } : null;
  const embed =
    vars.CLOUDFLARE_ACCOUNT_ID && vars.CLOUDFLARE_API_TOKEN
      ? { accountId: vars.CLOUDFLARE_ACCOUNT_ID, apiToken: vars.CLOUDFLARE_API_TOKEN }
      : null;
  if (!args.dryRun && (!db || !embed)) {
    throw new Error('A real run needs Supabase (URL + service role) and CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN');
  }

  const stats = await runIngest(
    adapters,
    {
      db,
      embed,
      llm,
      llmSink: consoleSink,
      userAgent: userAgent(vars.APP_URL?.startsWith('https://') ? vars.APP_URL : APP_URL_DEFAULT),
      log: consoleLog,
      apiKeys: { himalayas: vars.HIMALAYAS_API_KEY },
      countries: db ? await db.userCountries(SEARCH_COUNTRIES) : [],
    },
    { dryRun: args.dryRun, maxPages: args.pages, limit: args.limit, llmCap: intVar(String(args.llmCap), DEFAULT_LLM_FALLBACK_CAP) },
  );
  printRun(stats, args.dryRun);
  if (stats.some((s) => !s.ok)) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

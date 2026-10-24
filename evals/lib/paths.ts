import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute paths, independent of the cwd pnpm runs the script from. */
export const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_DIR = join(EVALS_DIR, '..');
export const DATASET_DIR = join(EVALS_DIR, 'dataset');
export const RAW_DIR = join(EVALS_DIR, 'raw');
export const RAW_CASES_DIR = join(RAW_DIR, 'cases');
export const RESULTS_DIR = join(EVALS_DIR, 'results');
export const DEV_VARS_PATH = join(REPO_DIR, 'apps', 'web', '.dev.vars');

// Theme bootstrapping, shared by the root layout (server) and ThemeToggle (client).
// Kept out of the 'use client' module so the layout gets the real string, not a client reference.
import { STORAGE_KEYS } from './storage';

export type ThemeMode = 'light' | 'dark';

/** Dark is the brand default (docs/08-BRAND-UI.md §3); the server renders <html class="dark">. */
export const DEFAULT_THEME: ThemeMode = 'dark';

/** Inline <head> script: swaps to a saved light choice before first paint. Never throws. */
export const THEME_INIT_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(
  STORAGE_KEYS.theme,
)})==='light'){var c=document.documentElement.classList;c.remove('dark');c.add('light')}}catch(e){}})();`;

// Theme bootstrapping, shared by the root layout (server) and ThemeToggle (client).
// Kept out of the 'use client' module so the layout gets the real string, not a client reference.
import { STORAGE_KEYS } from './storage';

/** Inline <head> script: applies a saved light/dark choice before first paint. Never throws. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEYS.theme,
)});if(t==='light'||t==='dark')document.documentElement.classList.add(t)}catch(e){}})();`;

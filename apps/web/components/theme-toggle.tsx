'use client';

// Switches dark ↔ light. The choice is applied as a class on <html> (see globals.css) and
// remembered in localStorage; THEME_INIT_SCRIPT (lib/client/theme.ts) applies it before first paint.
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { strings } from '@/lib/strings';
import { STORAGE_KEYS, storageGet, storageRemove, storageSet } from '@/lib/client/storage';
import { DEFAULT_THEME, type ThemeMode } from '@/lib/client/theme';

const NEXT: Record<ThemeMode, ThemeMode> = { dark: 'light', light: 'dark' };
const ICON = { light: Sun, dark: Moon } as const;

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(mode);
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(DEFAULT_THEME);

  useEffect(() => {
    if (storageGet(STORAGE_KEYS.theme) === 'light') setMode('light');
  }, []);

  function onClick() {
    const next = NEXT[mode];
    setMode(next);
    applyTheme(next);
    if (next === DEFAULT_THEME) storageRemove(STORAGE_KEYS.theme);
    else storageSet(STORAGE_KEYS.theme, next);
  }

  const t = strings.theme;
  const Icon = ICON[mode];
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={t.toggleAriaLabel(t.names[mode], t.names[NEXT[mode]])}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}

'use client';

// Hero "Try a sample run". Contract with <Analyzer>: it listens for SAMPLE_RUN_EVENT on window,
// fills in the real sample (packages/core SAMPLE_CV / SAMPLE_JOB) and runs it. This button only
// fires the event and scrolls to the analyzer section (id="analyzer").
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const SAMPLE_RUN_EVENT = 'applyverdict:run-sample';
export const ANALYZER_ID = 'analyzer';

export function scrollToAnalyzer() {
  const el = document.getElementById(ANALYZER_ID);
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

export function SampleRunButton({ children, className }: { children: ReactNode; className?: string }) {
  function onClick() {
    window.dispatchEvent(new CustomEvent(SAMPLE_RUN_EVENT));
    scrollToAnalyzer();
  }
  return (
    <Button type="button" size="lg" onClick={onClick} className={cn(className)}>
      {children}
    </Button>
  );
}

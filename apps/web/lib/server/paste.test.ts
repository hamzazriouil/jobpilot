import { describe, expect, it } from 'vitest';
import { PASTED_JOB_FALLBACK_TITLE, titleFromPaste } from './paste';

describe('titleFromPaste', () => {
  it('takes the first meaningful line', () => {
    expect(titleFromPaste('\n\n  Senior AI Engineer (Remote)\nAcme is hiring…')).toBe('Senior AI Engineer (Remote)');
  });
  it('strips markdown and labels', () => {
    expect(titleFromPaste('## **Backend Developer**\nabout us')).toBe('Backend Developer');
    expect(titleFromPaste('Job title: Full-stack Engineer\n')).toBe('Full-stack Engineer');
  });
  it('cuts long first lines at a word', () => {
    const t = titleFromPaste(`We are looking for ${'a very motivated engineer '.repeat(10)}`);
    expect(t.length).toBeLessThanOrEqual(121);
    expect(t.endsWith('…')).toBe(true);
  });
  it('falls back when there is no usable line', () => {
    expect(titleFromPaste(' \n - \n')).toBe(PASTED_JOB_FALLBACK_TITLE);
  });
});

import { describe, expect, it } from 'vitest';
import { workAuthRegions } from './profile';

describe('workAuthRegions', () => {
  it('expands the residence country', () => {
    expect(workAuthRegions('MA', [])).toEqual(['MA', 'AFRICA', 'MENA', 'EMEA']);
  });
  it('expands extra countries, keeps extra regions, dedupes', () => {
    const r = workAuthRegions('MA', ['FR', 'GCC', 'EMEA']);
    expect(r).toEqual(expect.arrayContaining(['MA', 'FR', 'EU', 'EEA', 'GCC']));
    expect(r.filter((x) => x === 'EMEA')).toHaveLength(1);
  });
});

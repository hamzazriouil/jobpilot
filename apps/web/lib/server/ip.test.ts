import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { clientIp, ipSubject, UNKNOWN_IP, utcDay } from './ip';

describe('clientIp', () => {
  it('prefers cf-connecting-ip', () => {
    const h = new Headers({ 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '203.0.113.1' });
    expect(clientIp(h, true)).toBe('198.51.100.7');
  });

  it('uses the first x-forwarded-for hop outside production only', () => {
    const h = new Headers({ 'x-forwarded-for': '203.0.113.1, 10.0.0.1' });
    expect(clientIp(h, false)).toBe('203.0.113.1');
    expect(clientIp(h, true)).toBe(UNKNOWN_IP);
  });

  it('falls back to a shared unknown bucket', () => {
    expect(clientIp(new Headers(), false)).toBe(UNKNOWN_IP);
  });
});

describe('ipSubject', () => {
  const day1 = new Date('2026-10-24T23:59:59Z');
  const day2 = new Date('2026-10-25T00:00:01Z');

  it('is ip: + sha256(ip + salt + UTC date)', async () => {
    const expected = createHash('sha256').update('198.51.100.7' + 'salt' + '2026-10-24').digest('hex');
    expect(await ipSubject('198.51.100.7', 'salt', day1)).toBe(`ip:${expected}`);
  });

  it('rotates daily (UTC), and depends on the salt and the IP', async () => {
    const a = await ipSubject('198.51.100.7', 'salt', day1);
    expect(await ipSubject('198.51.100.7', 'salt', day2)).not.toBe(a);
    expect(await ipSubject('198.51.100.7', 'other', day1)).not.toBe(a);
    expect(await ipSubject('198.51.100.8', 'salt', day1)).not.toBe(a);
    expect(a).not.toContain('198.51.100.7');
  });

  it('formats the UTC day', () => {
    expect(utcDay(new Date('2026-01-02T03:04:05+05:00'))).toBe('2026-01-01');
  });
});

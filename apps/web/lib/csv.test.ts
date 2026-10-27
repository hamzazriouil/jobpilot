import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv';

describe('csv', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line 1\nline 2')).toBe('"line 1\nline 2"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(72)).toBe('72');
  });

  it('neutralizes spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+1 555')).toBe("'+1 555");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell(-3)).toBe('-3'); // numbers are left alone
  });

  it('joins rows with CRLF and ends with one', () => {
    expect(toCsv(['a', 'b'], [[1, 'x'], [null, 'y']])).toBe('a,b\r\n1,x\r\n,y\r\n');
  });
});

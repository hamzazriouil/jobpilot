import { describe, expect, it } from 'vitest';
import { JOB_DESCRIPTION_MAX } from '../schemas/job';
import { htmlToText, isTechRole, jobContentHash } from './index';

describe('jobContentHash', () => {
  const base = { company: 'Acme', title: 'Senior Backend Engineer', description: 'Build APIs.  We use Go.' };

  it('is a stable sha256 hex', async () => {
    const h = await jobContentHash(base);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await jobContentHash(base)).toBe(h);
  });

  it('ignores case of company/title and whitespace differences', async () => {
    const h = await jobContentHash(base);
    expect(await jobContentHash({ company: ' ACME ', title: 'senior backend   engineer', description: 'Build APIs. We use Go.' })).toBe(h);
  });

  it('only the first 500 description chars count', async () => {
    const long = 'x'.repeat(500);
    expect(await jobContentHash({ ...base, description: `${long}AAA` })).toBe(await jobContentHash({ ...base, description: `${long}BBB` }));
    expect(await jobContentHash({ ...base, description: 'other' })).not.toBe(await jobContentHash(base));
  });

  it('null company hashes like an empty one, and differs from a named one', async () => {
    expect(await jobContentHash({ ...base, company: null })).toBe(await jobContentHash({ ...base, company: '' }));
    expect(await jobContentHash({ ...base, company: null })).not.toBe(await jobContentHash(base));
  });

  it('matches the documented recipe', async () => {
    const text = 'acme\nsenior backend engineer\nBuild APIs. We use Go.';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(await jobContentHash(base)).toBe(hex);
  });
});

describe('htmlToText', () => {
  it('strips tags, keeps paragraphs and list items', () => {
    const html = '<div><p><strong>Getlabs</strong> is hiring.</p><ul><li>Go</li><li>Postgres</li></ul><p>Apply&nbsp;now</p></div>';
    expect(htmlToText(html)).toBe('Getlabs is hiring.\n\n- Go\n- Postgres\n\nApply now');
  });

  it('decodes named and numeric entities once (no double decoding into tags)', () => {
    expect(htmlToText('Tom &amp; Jerry &#8217;s &#x2014; caf&eacute; &lt;b&gt;')).toBe('Tom & Jerry ’s — café <b>');
  });

  it('drops script/style blocks and comments', () => {
    expect(htmlToText('<style>p{color:red}</style><script>alert(1)</script><!-- x --><p>Hello</p>')).toBe('Hello');
  });

  it('handles <br>, plain text and a tag cut off at the end', () => {
    expect(htmlToText('line 1<br>line 2<br/>line 3')).toBe('line 1\nline 2\nline 3');
    expect(htmlToText('Just text, no tags.')).toBe('Just text, no tags.');
    expect(htmlToText('Hello <a href="https://x')).toBe('Hello');
  });

  it(`caps the output at ${JOB_DESCRIPTION_MAX} chars`, () => {
    const out = htmlToText(`<p>${'word '.repeat(5000)}</p>`);
    expect(out.length).toBeLessThanOrEqual(JOB_DESCRIPTION_MAX);
    expect(out.length).toBeGreaterThan(JOB_DESCRIPTION_MAX - 20);
  });
});

describe('isTechRole', () => {
  it.each([
    'Senior Frontend Engineer',
    'Full Stack Engineer',
    'Senior DevOps Engineer',
    'Junior Data Engineer',
    'Talent Database - Sr. AI Engineer - India Only',
    'Senior Data Scientist (Temporary Contract)',
    'Applied Scientist, Remote- Contract',
    'Machine Learning Engineer, LLM Inference',
    'iOS Developer',
    'Software Engineer, Sales Platform',
    'Staff Site Reliability Engineer',
    'Engineering Manager, Payments',
    'Member of Technical Staff',
    'Software Development Test Engineer (SDET), KSM',
    'Senior Software Engineer, Fintech',
    'Interactive Designer / Creative Developer (Web Animation & Data Viz)',
  ])('%s → tech', (title) => {
    expect(isTechRole({ title, tags: [] })).toBe(true);
  });

  it.each([
    'Field Phlebotomy Supervisor Northern California',
    'Sales Development Representative German Speaking',
    'Accounting and Implementation Manager',
    'Technical Recruiter',
    'Sr. Manager, GTM Engineering',
    'Principal Technical Marketing Engineer | US | Remote',
    'Senior Instrumentation & Controls Engineer',
    '🌎Mechanical Engineering Expert (MSc. or PhD), Remote- Contract',
    'Product Solution Engineer',
    'Product Manager',
    'AI Trainer - Coding',
    'Account Executive, AI Platform',
    'Marketing Operations Engineer',
    // seen in the first Himalayas load (2026-10-25)
    'Senior Business Developer, Cyber Insurance - Germany (m/w/d)',
    'Sustainability in the NHS - Course Developer & Skills Coach',
    'Software Publisher Services – Manager',
    'Software Licensing Specialist',
    'Project Manager(Software Development)',
    'Senior Customer Excellence Manager - Software as a Service (SaaS)',
  ])('%s → not tech', (title) => {
    expect(isTechRole({ title, tags: ['golang', 'dev', 'python'] })).toBe(false);
  });

  it('generic engineer titles need a tech tag when tags exist', () => {
    expect(isTechRole({ title: 'Founding Engineer', tags: [] })).toBe(true);
    expect(isTechRole({ title: 'Founding Engineer', tags: ['typescript'] })).toBe(true);
    expect(isTechRole({ title: 'Senior Engineer', tags: ['Hardware-Engineer'] })).toBe(false);
  });
});

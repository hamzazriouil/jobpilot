// A pasted job post needs a title before it's analyzed (jobs.title is NOT NULL). The first line is
// usually the title; after the first analysis the route replaces it with the model's job.title.

const TITLE_MAX = 120;
const LABEL_RE = /^(?:job\s*title|title|position|role|poste|intitulé)\s*[:\-–]\s*/i;
const MARKUP_RE = /^[#>*\-•\s]+|[*_`]+/g;

export const PASTED_JOB_FALLBACK_TITLE = 'Pasted job';

export function titleFromPaste(text: string): string {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(MARKUP_RE, '').replace(LABEL_RE, '').replace(/\s+/g, ' ').trim();
    if (line.length < 3) continue;
    if (line.length <= TITLE_MAX) return line;
    const cut = line.slice(0, TITLE_MAX);
    const space = cut.lastIndexOf(' ');
    return `${(space > 40 ? cut.slice(0, space) : cut).trim()}…`;
  }
  return PASTED_JOB_FALLBACK_TITLE;
}

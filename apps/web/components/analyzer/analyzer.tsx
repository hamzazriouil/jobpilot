'use client';

// The landing page's analyzer (docs/03-UI-UX.md §4.1–4.2, docs/08-BRAND-UI.md §6.4–6.5):
// form → streamed analysis (the evidence trace) → streamed drafts. Owns the input state (never
// cleared by errors), the optional "remember my CV", the two SSE tasks and focus management.
// Results render from the server's `result` once it arrives and from sanitized partials before
// that; the score and band only ever come from the server.
//
// Sample-run contract: anything on the page (the hero's "Try a sample run") can dispatch
// `window.dispatchEvent(new CustomEvent(RUN_SAMPLE_EVENT))`; the analyzer then fills in the sample
// pair and runs it. The form section has id="analyzer" for in-page links.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Play, Square } from 'lucide-react';
import { CV_TEXT_MAX, CV_TEXT_MIN, JOB_TEXT_MAX, JOB_TEXT_MIN } from '@jobpilot/core/schemas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { strings } from '@/lib/strings';
import { resolveEndpoints, type DevMockScenario } from '@/lib/client/endpoints';
import { EMPTY_PARTIAL_ANALYSIS, type PartialAnalysis } from '@/lib/client/partial';
import { STORAGE_KEYS, storageGet, storageRemove, storageSet } from '@/lib/client/storage';
import { useAnalyzeStream, useDraftStream, type AnalyzeBody } from '@/lib/client/use-stream-task';
import { verdictLabel } from './eligibility-card';
import { ResultsView } from './results-view';
import { WindowDots } from './result-card';
import { LABEL_CLASS, QUIET_TEXT, TONE_CLASSES } from './tone';

/** Window event that starts the sample run (dispatched by the hero). */
export const RUN_SAMPLE_EVENT = 'applyverdict:run-sample';

export interface CountryOption {
  code: string;
  name: string;
}

type LengthIssue = 'short' | 'long' | null;

function lengthIssue(length: number, min: number, max: number): LengthIssue {
  if (length < min) return 'short';
  if (length > max) return 'long';
  return null;
}

export function Analyzer({ countries, defaultCountry }: { countries: CountryOption[]; defaultCountry: string }) {
  const a = strings.analyzer;
  const [cvText, setCvText] = useState('');
  const [jobText, setJobText] = useState('');
  const [country, setCountry] = useState(defaultCountry);
  const [remember, setRemember] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [touched, setTouched] = useState({ cv: false, job: false });
  const [mock, setMock] = useState<DevMockScenario | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);

  const analyze = useAnalyzeStream();
  const draft = useDraftStream();
  const lastRequest = useRef<AnalyzeBody | null>(null);
  const sampleCv = useRef<string | null>(null);
  const focusResultsOnStart = useRef(false);
  const resultsRef = useRef<HTMLElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);

  // ── restore from localStorage (after hydration, so server and client HTML match) ──
  useEffect(() => {
    setMock(resolveEndpoints().mock);
    const probe = storageSet('jp.probe', '1');
    storageRemove('jp.probe');
    setStorageAvailable(probe);
    const savedCv = storageGet(STORAGE_KEYS.cv);
    if (savedCv) {
      setCvText(savedCv);
      setRemember(true);
    }
    const savedCountry = storageGet(STORAGE_KEYS.country);
    if (savedCountry && countries.some((c) => c.code === savedCountry)) setCountry(savedCountry);
  }, [countries]);

  // ── persist while "remember" is on (debounced; the sample CV is never saved) ──
  useEffect(() => {
    if (!remember || cvText === sampleCv.current) return;
    const t = setTimeout(() => {
      if (cvText.trim()) storageSet(STORAGE_KEYS.cv, cvText);
      else storageRemove(STORAGE_KEYS.cv);
    }, 400);
    return () => clearTimeout(t);
  }, [cvText, remember]);

  useEffect(() => {
    if (remember) storageSet(STORAGE_KEYS.country, country);
  }, [country, remember]);

  function onRememberChange(checked: boolean) {
    setRemember(checked);
    if (!checked) {
      storageRemove(STORAGE_KEYS.cv);
      storageRemove(STORAGE_KEYS.country);
    }
  }

  // ── validation (lengths are measured after trimming, like the server) ──
  const cvLength = cvText.trim().length;
  const jobLength = jobText.trim().length;
  const cvIssue = lengthIssue(cvLength, CV_TEXT_MIN, CV_TEXT_MAX);
  const jobIssue = lengthIssue(jobLength, JOB_TEXT_MIN, JOB_TEXT_MAX);
  const countryValid = countries.some((c) => c.code === country);
  const analyzing = analyze.state.status === 'streaming';
  const canSubmit = !cvIssue && !jobIssue && countryValid && !analyzing;

  // ── running ──
  async function runAnalysis(body: AnalyzeBody) {
    lastRequest.current = body;
    draft.reset();
    focusResultsOnStart.current = true;
    const result = await analyze.start(resolveEndpoints().analyze, body);
    if (result) void runDrafts(result.analysisToken);
  }

  async function runDrafts(analysisToken: string) {
    const body = lastRequest.current;
    if (!body) return;
    await draft.start(resolveEndpoints().draft, { cvText: body.cvText, jobText: body.jobText, analysisToken });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ cv: true, job: true });
    if (!canSubmit) return;
    void runAnalysis({ cvText, jobText, country });
  }

  function retryAnalysis() {
    // Prefer what's in the fields now (the user may have fixed something), else the last request.
    if (!cvIssue && !jobIssue && countryValid) void runAnalysis({ cvText, jobText, country });
    else if (lastRequest.current) void runAnalysis(lastRequest.current);
  }

  function redoDrafts() {
    if (analyze.state.status === 'done') void runDrafts(analyze.state.result.analysisToken);
  }

  async function trySample() {
    // Same rule as the button's disabled state, so the hero's event can't interrupt a run.
    if (sampleLoading || analyzing) return;
    setSampleLoading(true);
    try {
      // Loaded on demand so the sample text isn't in the landing page's initial JS.
      const { SAMPLE_CV, SAMPLE_JOB } = await import('@jobpilot/core/prompts');
      sampleCv.current = SAMPLE_CV;
      setCvText(SAMPLE_CV);
      setJobText(SAMPLE_JOB);
      setTouched({ cv: false, job: false });
      if (countryValid) void runAnalysis({ cvText: SAMPLE_CV, jobText: SAMPLE_JOB, country });
    } catch {
      // The chunk failed to load (offline?). The fields stay as they were; nothing else to do.
    } finally {
      setSampleLoading(false);
    }
  }

  // The hero (outside this component) asks for a sample run through a window event. A ref keeps
  // the listener pointed at the latest trySample without re-subscribing on every render.
  const trySampleRef = useRef(trySample);
  useEffect(() => {
    trySampleRef.current = trySample;
  });
  useEffect(() => {
    const onRunSample = () => void trySampleRef.current();
    window.addEventListener(RUN_SAMPLE_EVENT, onRunSample);
    return () => window.removeEventListener(RUN_SAMPLE_EVENT, onRunSample);
  }, []);

  // Move to the results when a run starts: scroll there and put focus on the heading.
  useEffect(() => {
    if (analyze.state.status !== 'streaming' || !focusResultsOnStart.current) return;
    focusResultsOnStart.current = false;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resultsRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    resultsHeadingRef.current?.focus({ preventScroll: true });
  }, [analyze.state.status]);

  // ── derived view ──
  const aState = analyze.state;
  const result = aState.status === 'done' ? aState.result.result : null;
  const view: PartialAnalysis =
    result ?? (aState.status === 'idle' ? EMPTY_PARTIAL_ANALYSIS : (aState.partial ?? EMPTY_PARTIAL_ANALYSIS));
  const askedCountry = lastRequest.current?.country ?? country;
  const countryName = countries.find((c) => c.code === askedCountry)?.name ?? askedCountry;
  const step = analysisStep(view);
  const liveMessage = liveAnnouncement();

  function liveAnnouncement(): string {
    if (aState.status === 'streaming') return step;
    if (aState.status !== 'done') return '';
    const r = aState.result.result;
    const summary = strings.announcements.analysisDone(
      verdictLabel(r.eligibility.verdict, countryName),
      strings.results.fit.bands[r.band],
      r.score,
    );
    if (draft.state.status === 'streaming') return `${summary} ${strings.progress.writingDrafts}`;
    if (draft.state.status === 'done') return strings.announcements.draftsDone;
    return summary;
  }

  const buttonHint = analyzing ? step : canSubmit ? a.quotaHint : a.disabledHint;


  return (
    <>
      {/* Screen-reader progress and summaries (the visual results update silently). */}
      <p role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </p>

      {/* scroll-mt clears the sticky 56px header when the hero links or scrolls here. */}
      <section id="analyzer" aria-label={a.sectionAriaLabel} className="scroll-mt-20">
        <Card className="gap-0 py-0">
          {/* Terminal-window header: dots + mono title, the sample run on the right. */}
          <div className="flex items-center justify-between gap-3 border-b border-border py-2 pr-2 pl-4 sm:pl-5">
            <span className={cn('flex min-w-0 items-center gap-3 font-mono text-xs', QUIET_TEXT)}>
              <WindowDots />
              <span className="truncate">{a.windowTitle}</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={trySample}
              disabled={sampleLoading || analyzing}
              aria-describedby="sample-hint"
              className="h-10 shrink-0 px-3 text-[13px] text-muted-foreground hover:text-foreground"
            >
              <Play aria-hidden="true" className="size-3.5" />
              {sampleLoading ? a.sampleLoading : a.sampleButton}
            </Button>
            <span id="sample-hint" className="sr-only">
              {a.sampleHint}
            </span>
          </div>

          <form onSubmit={onSubmit} noValidate className="flex flex-col">
            <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-2">
              <LengthField
                id="cv"
                label={a.cvLabel}
                placeholder={a.cvPlaceholder}
                value={cvText}
                onChange={setCvText}
                onBlur={() => setTouched((t) => ({ ...t, cv: true }))}
                length={cvLength}
                min={CV_TEXT_MIN}
                max={CV_TEXT_MAX}
                issue={cvIssue}
                touched={touched.cv}
              />
              <LengthField
                id="job"
                label={a.jobLabel}
                placeholder={a.jobPlaceholder}
                value={jobText}
                onChange={setJobText}
                onBlur={() => setTouched((t) => ({ ...t, job: true }))}
                length={jobLength}
                min={JOB_TEXT_MIN}
                max={JOB_TEXT_MAX}
                issue={jobIssue}
                touched={touched.job}
              />
            </div>

            {/* `contents` on phones lets the action bar stick to the bottom of the whole form. */}
            <div className="contents md:flex md:flex-wrap md:items-end md:justify-between md:gap-x-6 md:gap-y-4 md:border-t md:border-border md:px-5 md:py-4">
              <div className="grid gap-4 border-t border-border px-4 py-4 sm:px-5 md:flex md:flex-wrap md:items-end md:gap-x-6 md:gap-y-4 md:border-0 md:p-0">
                <div className="grid gap-2">
                  <label htmlFor="country" className={LABEL_CLASS}>
                    {a.countryLabel}
                  </label>
                  <Select value={country} onValueChange={setCountry} disabled={analyzing}>
                    <SelectTrigger id="country" className="w-full md:w-60" aria-describedby="country-hint">
                      <SelectValue placeholder={a.countryPlaceholder}>
                        {countries.find((c) => c.code === country)?.name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {countries.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p id="country-hint" className="text-xs text-muted-foreground">
                    {a.countryHint}
                  </p>
                </div>

                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 md:max-w-xs">
                  <input
                    id="remember-cv"
                    type="checkbox"
                    checked={remember}
                    disabled={!storageAvailable}
                    onChange={(e) => onRememberChange(e.target.checked)}
                    aria-describedby="remember-cv-hint"
                    className="size-4 shrink-0 accent-signal"
                  />
                  {/* min-h-10: the label is the 40px tap target for the small checkbox. */}
                  <label htmlFor="remember-cv" className="flex min-h-10 items-center text-sm">
                    {a.rememberLabel}
                  </label>
                  <p id="remember-cv-hint" className="col-start-2 text-xs text-muted-foreground">
                    {storageAvailable ? a.rememberHint : a.rememberUnavailable}
                  </p>
                </div>
              </div>

              <div className="sticky bottom-0 z-10 flex flex-col gap-2 rounded-b-lg border-t border-border bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-5 md:static md:ml-auto md:items-end md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
                <div className="flex items-center gap-3">
                  {mock ? (
                    <Badge variant="outline" className="border-partial/50 font-mono text-partial">
                      {a.devMockBadge(mock)}
                    </Badge>
                  ) : null}
                  {analyzing ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={analyze.abort}
                      className="flex-1 md:flex-none"
                      aria-describedby="analyze-hint"
                    >
                      <Square aria-hidden="true" />
                      {a.stop}
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      size="lg"
                      disabled={!canSubmit}
                      className="flex-1 md:flex-none"
                      aria-describedby="analyze-hint"
                    >
                      {a.submit}
                      <ArrowRight aria-hidden="true" />
                    </Button>
                  )}
                </div>
                <p id="analyze-hint" className="text-center text-xs text-muted-foreground md:text-right">
                  {buttonHint}
                </p>
              </div>
            </div>
          </form>
        </Card>
      </section>

      {aState.status !== 'idle' ? (
        <ResultsView
          state={aState}
          countryName={countryName}
          onRetry={retryAnalysis}
          draftState={draft.state}
          onRedoDrafts={redoDrafts}
          sectionRef={resultsRef}
          headingRef={resultsHeadingRef}
        />
      ) : null}
    </>
  );
}

/** Step text under the button, derived from how far the stream has got. */
function analysisStep(view: PartialAnalysis): string {
  const p = strings.progress;
  if (!view.eligibility?.verdict) return view.job ? p.checkingEligibility : p.readingJob;
  if (view.gaps.length === 0 && view.redFlags.length === 0) return p.matchingRequirements;
  return p.scoring;
}

function LengthField({
  id,
  label,
  placeholder,
  value,
  onChange,
  onBlur,
  length,
  min,
  max,
  issue,
  touched,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  length: number;
  min: number;
  max: number;
  issue: LengthIssue;
  touched: boolean;
}) {
  const a = strings.analyzer;
  // "Too long" shows at once; "too short" only after the user leaves a non-empty field.
  const error = issue === 'long' ? a.tooLong(max) : issue === 'short' && touched && length > 0 ? a.tooShort(min, length) : null;
  const helpId = `${id}-help`;
  return (
    <div className="grid min-w-0 content-start gap-2">
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <Textarea
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={helpId}
        className="max-h-96 min-h-40 overflow-y-auto font-mono leading-relaxed md:min-h-56"
      />
      <div id={helpId} className="flex items-start justify-between gap-3 text-xs">
        <p className={error ? TONE_CLASSES.bad.text : 'text-muted-foreground'}>{error ?? a.minHint(min)}</p>
        <p className={cn('shrink-0 font-mono tabular-nums', QUIET_TEXT)}>{a.charCount(length, max)}</p>
      </div>
    </div>
  );
}

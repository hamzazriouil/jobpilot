'use client';

// /onboarding, 3 steps (docs/03-UI-UX.md §4.4): CV → review the parsed profile → preferences.
// Step 1 posts to /api/profile/parse; step 3 saves everything with PUT /api/profile, then /feed.
import { X } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { CV_TEXT_MIN, SENIORITY_VALUES, type ProfileLLM, type Seniority } from '@jobpilot/core/schemas';
import type { CountryOption } from '@/components/analyzer/analyzer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { STORAGE_KEYS, storageGet } from '@/lib/client/storage';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';

const MAX_ROLES = 10;

type Step = 0 | 1 | 2;

async function apiCall<T>(url: string, method: 'POST' | 'PUT', body: unknown): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
    if (!res.ok || !json) return { ok: false, message: json?.error?.message ?? strings.onboarding.errors.generic };
    return { ok: true, data: json };
  } catch {
    return { ok: false, message: strings.onboarding.errors.generic };
  }
}

export function OnboardingFlow({ countries, defaultCountry }: { countries: CountryOption[]; defaultCountry: string }) {
  const s = strings.onboarding;
  const [step, setStep] = useState<Step>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cvText, setCvText] = useState('');
  const [profile, setProfile] = useState<ProfileLLM | null>(null);
  const [seniority, setSeniority] = useState<Seniority>('junior');
  const [country, setCountry] = useState(defaultCountry);
  const [extra, setExtra] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [salary, setSalary] = useState('');
  const [digest, setDigest] = useState(false);

  // Pre-fill from what the analyzer remembered on this device (opt-in there).
  useEffect(() => {
    const cv = storageGet(STORAGE_KEYS.cv);
    if (cv) setCvText(cv);
    const c = storageGet(STORAGE_KEYS.country);
    if (c && countries.some((x) => x.code === c)) setCountry(c);
  }, [countries]);

  async function parse(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await apiCall<{ profile: ProfileLLM }>('/api/profile/parse', 'POST', { cvText });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setProfile(res.data.profile);
    setSeniority(res.data.profile.seniorityGuess);
    setStep(1);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    if (roles.length === 0) return setError(s.errors.noRoles);
    setError(null);
    setBusy(true);
    const salaryNum = salary.trim() ? Math.round(Number(salary)) : null;
    const res = await apiCall<{ ok: true }>('/api/profile', 'PUT', {
      cvText,
      cvParsed: { ...profile, seniorityGuess: seniority },
      country,
      extraRegions: extra,
      targetRoles: roles,
      seniority,
      salaryFloorUsd: salaryNum !== null && Number.isFinite(salaryNum) && salaryNum >= 0 ? salaryNum : null,
      digestOptIn: digest,
    });
    if (!res.ok) {
      setBusy(false);
      return setError(res.message);
    }
    window.location.assign('/feed');
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="font-mono text-xs text-subtle">{s.stepOf(step + 1, s.steps.length)}</p>
      <ol className="mt-3 flex gap-2" aria-label={s.title}>
        {s.steps.map((label, i) => (
          <li key={label} className="flex-1">
            <div className={cn('h-1 rounded-full', i <= step ? 'bg-signal' : 'bg-border-strong')} />
            <span className={cn('mt-2 block text-xs', i === step ? 'text-foreground' : 'text-subtle')}>{label}</span>
          </li>
        ))}
      </ol>

      <div className="mt-8 rounded-xl border bg-card p-5 sm:p-7">
        {step === 0 && (
          <form onSubmit={(e) => void parse(e)} className="grid gap-4">
            <Heading title={s.cv.heading} body={s.cv.body} />
            <label htmlFor="cv" className="sr-only">
              {s.cv.label}
            </label>
            <Textarea
              id="cv"
              value={cvText}
              onChange={(e) => setCvText(e.target.value)}
              placeholder={s.cv.placeholder}
              className="min-h-64 font-mono text-[13px] sm:text-[13px]"
              maxLength={20_000}
              disabled={busy}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-mono text-xs text-subtle">{s.cv.count(cvText.trim().length, CV_TEXT_MIN)}</span>
              <Button type="submit" disabled={busy || cvText.trim().length < CV_TEXT_MIN}>
                {busy ? s.cv.parsing : s.cv.parse}
              </Button>
            </div>
            <p className="text-xs text-pretty text-subtle">{s.cv.storedNote}</p>
            <ErrorLine error={error} />
          </form>
        )}

        {step === 1 && profile && (
          <div className="grid gap-7">
            <Heading title={s.review.heading} body={s.review.body} />
            <SkillsEditor skills={profile.skills} onChange={(skills) => setProfile({ ...profile, skills })} />
            <ItemList
              title={s.review.experiences}
              items={profile.experiences.map((x) => ({ title: x.org ? `${x.title} · ${x.org}` : x.title, meta: [x.start, x.end ?? 'now'].filter(Boolean).join(' – '), summary: x.summary }))}
              onRemove={(i) => setProfile({ ...profile, experiences: profile.experiences.filter((_, j) => j !== i) })}
            />
            <ItemList
              title={s.review.projects}
              items={profile.projects.map((x) => ({ title: x.name, meta: x.tech.slice(0, 5).join(' · '), summary: x.summary }))}
              onRemove={(i) => setProfile({ ...profile, projects: profile.projects.filter((_, j) => j !== i) })}
            />
            <Field label={s.review.seniority} htmlFor="seniority">
              <Select value={seniority} onValueChange={(v) => setSeniority(v as Seniority)}>
                <SelectTrigger id="seniority" className="w-full sm:w-60">
                  <SelectValue>{s.review.seniorityNames[seniority]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SENIORITY_VALUES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {s.review.seniorityNames[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <NavRow onBack={() => setStep(0)}>
              <Button onClick={() => setStep(2)}>{s.next}</Button>
            </NavRow>
          </div>
        )}

        {step === 2 && (
          <form onSubmit={(e) => void save(e)} className="grid gap-7">
            <Heading title={s.prefs.heading} />
            <Field label={s.prefs.country} hint={s.prefs.countryHint} htmlFor="country">
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger id="country" className="w-full sm:w-72">
                  <SelectValue>{countries.find((c) => c.code === country)?.name}</SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {countries.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={s.prefs.extra} hint={s.prefs.extraHint}>
              <ChipToggles
                options={s.extraOptions.filter((o) => o.code !== country).map((o) => ({ value: o.code, label: o.label }))}
                selected={extra}
                onChange={setExtra}
              />
            </Field>
            <Field label={s.prefs.roles} hint={s.prefs.rolesHint}>
              <RolesEditor roles={roles} onChange={setRoles} />
            </Field>
            <Field label={s.prefs.salary} hint={s.prefs.salaryHint} htmlFor="salary">
              <Input
                id="salary"
                type="number"
                inputMode="numeric"
                min={0}
                max={100000}
                step={100}
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                className="w-full sm:w-48"
                placeholder="1000"
              />
            </Field>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={digest} onChange={(e) => setDigest(e.target.checked)} className="mt-0.5 size-4 accent-[var(--signal)]" />
              <span>
                {s.prefs.digest}
                <span className="block text-xs text-subtle">{s.prefs.digestHint}</span>
              </span>
            </label>
            <ErrorLine error={error} />
            <NavRow onBack={() => setStep(1)} disabled={busy}>
              <Button type="submit" disabled={busy}>
                {busy ? s.prefs.saving : s.prefs.finish}
              </Button>
            </NavRow>
          </form>
        )}
      </div>
    </div>
  );
}

function Heading({ title, body }: { title: string; body?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-[-0.03em]">{title}</h1>
      {body && <p className="mt-1.5 text-sm text-pretty text-muted-foreground">{body}</p>}
    </div>
  );
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-pretty text-subtle">{hint}</p>}
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-miss">
      {error}
    </p>
  );
}

function NavRow({ onBack, disabled, children }: { onBack: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Button type="button" variant="ghost" onClick={onBack} disabled={disabled}>
        {strings.onboarding.back}
      </Button>
      {children}
    </div>
  );
}

const chipClass =
  'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

function SkillsEditor({ skills, onChange }: { skills: string[]; onChange: (s: string[]) => void }) {
  const s = strings.onboarding.review;
  const [draft, setDraft] = useState('');
  function add() {
    const v = draft.trim().slice(0, 60);
    if (v && !skills.some((x) => x.toLowerCase() === v.toLowerCase()) && skills.length < 80) onChange([...skills, v]);
    setDraft('');
  }
  return (
    <div className="grid gap-3">
      <h2 className="text-sm font-medium">{s.skills}</h2>
      <ul className="flex flex-wrap gap-2">
        {skills.map((skill) => (
          <li key={skill}>
            <span className={cn(chipClass, 'border-border-strong pr-1.5')}>
              {skill}
              <button
                type="button"
                aria-label={s.removeSkill(skill)}
                onClick={() => onChange(skills.filter((x) => x !== skill))}
                className="rounded-full p-0.5 text-subtle hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          aria-label={s.addSkill}
          placeholder={s.addSkillPlaceholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          className="sm:w-60"
        />
        <Button type="button" variant="outline" onClick={add}>
          {s.addSkill}
        </Button>
      </div>
    </div>
  );
}

function ItemList({ title, items, onRemove }: { title: string; items: Array<{ title: string; meta: string; summary: string }>; onRemove: (i: number) => void }) {
  const s = strings.onboarding.review;
  return (
    <div className="grid gap-3">
      <h2 className="text-sm font-medium">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-subtle">{s.none}</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item, i) => (
            <li key={`${item.title}-${i}`} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.title}</p>
                {item.meta && <p className="font-mono text-xs text-subtle">{item.meta}</p>}
                <p className="mt-1 text-sm text-pretty text-muted-foreground">{item.summary}</p>
              </div>
              <Button type="button" variant="ghost" className="shrink-0 px-2 text-subtle" onClick={() => onRemove(i)}>
                {s.remove}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChipToggles({ options, selected, onChange }: { options: Array<{ value: string; label: string }>; selected: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? selected.filter((x) => x !== o.value) : [...selected, o.value])}
            className={cn(chipClass, on ? 'border-signal bg-signal/10 text-foreground' : 'border-border-strong text-muted-foreground hover:text-foreground')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function RolesEditor({ roles, onChange }: { roles: string[]; onChange: (r: string[]) => void }) {
  const s = strings.onboarding;
  const [draft, setDraft] = useState('');
  const options = [...new Set([...s.roleSuggestions, ...roles])];
  function add() {
    const v = draft.trim().slice(0, 60);
    if (v && !roles.includes(v) && roles.length < MAX_ROLES) onChange([...roles, v]);
    setDraft('');
  }
  return (
    <div className="grid gap-3">
      <ChipToggles
        options={options.map((r) => ({ value: r, label: r }))}
        selected={roles}
        onChange={(next) => onChange(next.slice(0, MAX_ROLES))}
      />
      <div className="flex gap-2">
        <Input
          aria-label={s.prefs.addRole}
          placeholder={s.prefs.addRole}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          className="sm:w-60"
        />
        <Button type="button" variant="outline" onClick={add}>
          {s.prefs.addRole}
        </Button>
      </div>
    </div>
  );
}

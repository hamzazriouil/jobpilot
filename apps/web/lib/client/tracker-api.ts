// Fetch wrappers for the tracker routes (app/api/applications). Errors throw TrackerApiError with
// the server's message (the shared `{ error: { code, message } }` shape) or a generic one.
import type { HonestyFlag } from '@jobpilot/core/schemas';
import type { ApplicationFields, Channel, Stage } from '@/lib/tracker';

export class TrackerApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'TrackerApiError';
  }
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init.headers } });
  } catch {
    throw new TrackerApiError('Network error. Check your connection and try again.', 'network');
  }
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (!res.ok) throw new TrackerApiError(body?.error?.message ?? 'Something went wrong. Please try again.', body?.error?.code ?? 'internal');
  return body as T;
}

export function createApplication(jobId: string, opts: { stage?: Stage; channel?: Channel | null } = {}) {
  return call<{ application: ApplicationFields; created: boolean }>('/api/applications', {
    method: 'POST',
    body: JSON.stringify({ jobId, ...opts }),
  });
}

export interface ApplicationPatch {
  stage?: Stage;
  channel?: Channel | null;
  notes?: string | null;
  followUpDueAt?: string | null;
  position?: number;
  followedUp?: true;
}

export function updateApplication(id: string, patch: ApplicationPatch) {
  return call<{ application: ApplicationFields }>(`/api/applications/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export function deleteApplication(id: string) {
  return call<{ ok: true }>(`/api/applications/${id}`, { method: 'DELETE' });
}

export function writeFollowUp(id: string) {
  return call<{ followUp: { message: string; honestyFlags: HonestyFlag[]; createdAt: string } }>(`/api/applications/${id}/follow-up`, {
    method: 'POST',
    body: '{}',
  });
}

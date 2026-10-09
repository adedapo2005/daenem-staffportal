import React, { useEffect, useState } from 'react';

type Interviewer = { id: string; displayName: string };
type Submit = (path: string, payload: { companyId: string; [key: string]: unknown }, withKey?: boolean) => Promise<boolean>;
type Props = {
  companyId: string; candidateId: string; stage: string; canEdit: boolean;
  busy: boolean; submit: Submit; onAccessDenied: () => void;
};

/** Internal, authorized scheduler: selection never contacts employees or sends invitations. */
export function InterviewScheduler({ companyId, candidateId, stage, canEdit, busy, submit, onAccessDenied }: Props) {
  const [interviewers, setInterviewers] = useState<Interviewer[]>([]);
  const [interviewerId, setInterviewerId] = useState('');
  const [scheduledLocal, setScheduledLocal] = useState('');
  const [meetingMode, setMeetingMode] = useState<'remote' | 'onsite' | 'phone'>('remote');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const eligibleStage = stage === 'screening' || stage === 'interview';

  useEffect(() => {
    setInterviewers([]);
    setInterviewerId('');
    setError('');
    if (!canEdit || !eligibleStage) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const query = new URLSearchParams({ companyId, candidateId });
        const result = await fetch('/api/recruitment/interviewers?' + query.toString(), {
          credentials: 'include', cache: 'no-store', signal: controller.signal,
          headers: { accept: 'application/json' }
        });
        if (!result.ok) {
          if ((result.status === 403 || result.status === 404) && !controller.signal.aborted) onAccessDenied();
          throw new Error('Interviewer eligibility could not be verified.');
        }
        const body = await result.json() as {
          companyId: string; candidateId: string; interviewers?: Interviewer[]
        };
        if (body.companyId !== companyId || body.candidateId !== candidateId) {
          throw new Error('Interviewer eligibility scope did not match.');
        }
        if (!controller.signal.aborted) {
          setInterviewers(Array.isArray(body.interviewers) ? body.interviewers.filter(
            person => typeof person.id === 'string' && typeof person.displayName === 'string'
          ) : []);
        }
      } catch {
        if (!controller.signal.aborted) {
          setInterviewers([]);
          setError('Interviewer eligibility is unavailable. Scheduling is disabled.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [companyId, candidateId, canEdit, eligibleStage, onAccessDenied]);

  if (!canEdit || !eligibleStage) return null;
  const date = new Date(scheduledLocal);
  const validTime = scheduledLocal && Number.isFinite(date.getTime()) &&
    date.getTime() > Date.now() && date.getTime() <= Date.now() + 3 * 365 * 86400000;
  const validPerson = interviewers.some(person => person.id === interviewerId);
  const schedule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validPerson || !validTime || busy || loading || error) return;
    const saved = await submit('/interviews', {
      companyId, candidateId, interviewerEmployeeId: interviewerId,
      meetingMode, scheduledAt: date.toISOString()
    }, true);
    if (saved) { setScheduledLocal(''); setInterviewerId(''); }
  };
  return <form className="jobs-erp-action-form" onSubmit={schedule}>
    <h5>Schedule an internal interview</h5>
    <p>Only active eligible internal company members are listed. No invitation is sent.</p>
    {loading && <p role="status">Checking eligibility...</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && !interviewers.length &&
      <p>No eligible interviewer is available for this company and site.</p>}
    <label className="jobs-erp-field">Eligible interviewer
      <select required value={interviewerId} disabled={busy || loading || !!error || !interviewers.length}
        onChange={event => setInterviewerId(event.target.value)}>
        <option value="">Select eligible interviewer</option>
        {interviewers.map(person => <option key={person.id} value={person.id}>{person.displayName}</option>)}
      </select>
    </label>
    <label className="jobs-erp-field">Date and local time
      <input required type="datetime-local" value={scheduledLocal} disabled={busy}
        onChange={event => setScheduledLocal(event.target.value)}/>
    </label>
    <label className="jobs-erp-field">Meeting mode
      <select value={meetingMode} disabled={busy}
        onChange={event => setMeetingMode(event.target.value as 'remote' | 'onsite' | 'phone')}>
        <option value="remote">Remote</option>
        <option value="onsite">On-site</option>
        <option value="phone">Phone</option>
      </select>
    </label>
    <button type="submit" className="jobs-erp-button primary"
      disabled={busy || loading || !!error || !validPerson || !validTime}>Record interview schedule</button>
  </form>;
}

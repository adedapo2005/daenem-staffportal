import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight, BadgeCheck, Building2, CheckCircle2, Clock3,
  LockKeyhole, LogOut, Mail, Phone, RefreshCcw, Save, ShieldCheck, UserRound,
} from 'lucide-react';
import { api, clearPortalAuthCache, type WorkforceContext } from './auth';
import './provisional-profile-workspace.css';

type OwnProfile = {
  id: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  department?: string;
  status: string;
  completionPercent?: number;
};
type ProfileResponse = {
  profile: OwnProfile;
  workplace: { locationName?: string; city?: string; state?: string } | null;
};
type ProfileUpdate = {
  ok: boolean;
  completionPercent: number;
  completed: boolean;
};
type ProvisionalWorkspaceProps = {
  context: WorkforceContext;
  onLogout: () => Promise<void> | void;
  onRefresh: () => Promise<void> | void;
};

export default function ProvisionalProfileWorkspace({
  context, onLogout, onRefresh,
}: ProvisionalWorkspaceProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [record, setRecord] = useState<OwnProfile | null>(null);
  const [workplace, setWorkplace] = useState<ProfileResponse['workplace']>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const profileLoadRequest = useRef(0);

  const profilePermission = context.permissions['profile.access'] || 'none';
  const canEdit = ['edit', 'approve', 'manage'].includes(profilePermission) &&
    context.roles.some(role => role.code === 'provisional');
  const company = context.companies.find(item => item.primary) || context.companies[0];

  const loadProfile = useCallback(async () => {
    const request = ++profileLoadRequest.current;
    setLoading(true);
    setFeedback(null);
    try {
      const data = await api<ProfileResponse>('/api/profile/mine');
      if (request !== profileLoadRequest.current) return;
      setRecord(data.profile);
      setFirstName(data.profile.firstName || '');
      setLastName(data.profile.lastName || '');
      setPhone(data.profile.phone || '');
      setWorkplace(data.workplace);
    } catch (error) {
      if (request !== profileLoadRequest.current) return;
      setRecord(null);
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Your profile could not be loaded.',
      });
    } finally {
      if (request === profileLoadRequest.current) setLoading(false);
    }
  }, [context.employee.id]);

  useEffect(() => {
    void loadProfile();
    return () => { profileLoadRequest.current += 1; };
  }, [loadProfile]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || saving) return;
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      setFeedback({ kind: 'error', text: 'Enter at least two characters for your first and last names.' });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const result = await api<ProfileUpdate>('/api/profile/mine', {
        method: 'POST',
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
        }),
      });
      setRecord(current => current ? {
        ...current,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        displayName: [firstName.trim(), lastName.trim()].join(' '),
        completionPercent: result.completionPercent,
      } : current);
      setFeedback({
        kind: 'success',
        text: 'Your profile was saved. You can continue updating it while management reviews your application.',
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Your profile could not be saved.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function refreshApproval() {
    if (refreshing) return;
    setRefreshing(true);
    setFeedback(null);
    try {
      // Do not reuse a 15-second cached /api/auth/me response when the
      // applicant explicitly asks to check an administrator's decision.
      clearPortalAuthCache();
      await onRefresh();
    } catch {
      setFeedback({ kind: 'error', text: 'Your approval status could not be refreshed.' });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="dsp-provisional-shell">
      <header className="dsp-provisional-header">
        <div className="dsp-provisional-brand" aria-label="DAENEM StaffPortal">
          <span className="dsp-provisional-brandmark" aria-hidden="true"><ShieldCheck size={24} /></span>
          <span><strong>DAENEM</strong><small>StaffPortal</small></span>
        </div>
        <div className="dsp-provisional-header-actions">
          <span className="dsp-provisional-session"><span /> Provisional Access</span>
          <button type="button" className="dsp-provisional-signout" onClick={() => void onLogout()}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </header>

      <main className="dsp-provisional-main">
        <div className="dsp-provisional-intro">
          <div>
            <span className="dsp-provisional-eyebrow"><BadgeCheck size={16} /> Identity Verified</span>
            <h1>Welcome To Your Workspace</h1>
            <p>Complete your employee profile while management reviews your application.
              Your workspace is protected by the Provisional role and administrator-defined permissions.</p>
          </div>
          <div className="dsp-provisional-approval-status">
            <Clock3 size={22} aria-hidden="true" />
            <span><strong>Pending Management Approval</strong><small>Full employee permissions are not yet enabled.</small></span>
          </div>
        </div>

        <div className="dsp-provisional-grid">
          <section className="dsp-provisional-card dsp-provisional-profile" aria-labelledby="dsp-profile-heading">
            <div className="dsp-provisional-card-heading">
              <span className="dsp-provisional-card-icon"><UserRound size={21} /></span>
              <div><h2 id="dsp-profile-heading">Your Profile Setup</h2><p>Keep your verified work details accurate.</p></div>
            </div>
            {loading ? (
              <p className="dsp-provisional-loading" role="status">Loading Your Profile…</p>
            ) : record ? (
              <>
                <div className="dsp-provisional-progress">
                  <span><strong>Profile Completion</strong><b>{Math.max(0,Math.min(100, Number(record.completionPercent||0)))}%</b></span>
                  <div className="dsp-provisional-progress-track"
                    role="progressbar" aria-label="Profile Completion"
                    aria-valuemin={0} aria-valuemax={100}
                    aria-valuenow={Math.max(0,Math.min(100,Number(record.completionPercent||0)))}>
                    <span style={{width:`${Math.max(0,Math.min(100,Number(record.completionPercent||0)))}%`}} />
                  </div>
                </div>
                <form className="dsp-provisional-form" onSubmit={saveProfile} autoComplete="on">
                  <div className="dsp-provisional-field-grid">
                    <label>First Name
                      <input name="firstName" autoComplete="given-name" value={firstName}
                        onChange={event => setFirstName(event.target.value)} minLength={2}
                        maxLength={80} disabled={!canEdit || saving} required />
                    </label>
                    <label>Last Name
                      <input name="lastName" autoComplete="family-name" value={lastName}
                        onChange={event => setLastName(event.target.value)} minLength={2}
                        maxLength={80} disabled={!canEdit || saving} required />
                    </label>
                  </div>
                  <label>Phone Number
                    <div className="dsp-provisional-field-icon"><Phone size={17} aria-hidden="true" />
                      <input name="phone" type="tel" autoComplete="tel" value={phone}
                        onChange={event => setPhone(event.target.value)} maxLength={40}
                        disabled={!canEdit || saving} placeholder="Enter your phone number" />
                    </div>
                  </label>
                  <label>Verified Email Address
                    <div className="dsp-provisional-field-icon dsp-provisional-readonly"><Mail size={17} aria-hidden="true" />
                      <input value={record.email || context.employee.email || ''} readOnly aria-readonly="true" />
                      <LockKeyhole size={15} aria-label="Verified and locked" />
                    </div>
                  </label>
                  {feedback && <p className={`dsp-provisional-feedback is-${feedback.kind}`}
                    role={feedback.kind === 'error' ? 'alert' : 'status'}>
                    {feedback.kind === 'success' ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
                    {feedback.text}
                  </p>}
                  <button className="dsp-provisional-save" type="submit" disabled={!canEdit || saving}>
                    <Save size={18} /> {saving ? 'Saving Profile…' : 'Save Profile'} <ArrowRight size={16} />
                  </button>
                  {!canEdit && <p className="dsp-provisional-helper">
                    Profile editing is currently disabled for the Provisional role. Contact your administrator.
                  </p>}
                </form>
              </>
            ) : (
              <div className="dsp-provisional-load-failure">
                {feedback && <p className="dsp-provisional-feedback is-error" role="alert">
                  <ShieldCheck size={18} /> {feedback.text}
                </p>}
                <p className="dsp-provisional-helper">Profile setup is currently unavailable.
                  Retry loading your profile before contacting your administrator.</p>
                <button className="dsp-provisional-refresh" type="button"
                  onClick={() => void loadProfile()} disabled={loading}>
                  <RefreshCcw size={16} /> Retry Profile Load
                </button>
              </div>
            )}
          </section>

          <aside className="dsp-provisional-aside">
            <section className="dsp-provisional-card" aria-labelledby="dsp-access-heading">
              <div className="dsp-provisional-card-heading">
                <span className="dsp-provisional-card-icon"><ShieldCheck size={21} /></span>
                <div><h2 id="dsp-access-heading">Your Access</h2><p>Controlled by your administrator.</p></div>
              </div>
              <div className="dsp-provisional-status-row"><CheckCircle2 size={18} />
                <span>Identity Verification</span><strong>Completed</strong></div>
              <div className="dsp-provisional-status-row"><CheckCircle2 size={18} />
                <span>Profile Editing</span><strong>{canEdit ? 'Enabled' : 'Restricted'}</strong></div>
              <div className="dsp-provisional-status-row is-pending"><Clock3 size={18} />
                <span>Full Employee Access</span><strong>Awaiting Approval</strong></div>
              <button className="dsp-provisional-refresh" type="button"
                onClick={() => void refreshApproval()} disabled={refreshing}>
                <RefreshCcw size={16} /> {refreshing ? 'Checking Approval…' : 'Check Approval Status'}
              </button>
            </section>
            <section className="dsp-provisional-card" aria-labelledby="dsp-assignment-heading">
              <div className="dsp-provisional-card-heading">
                <span className="dsp-provisional-card-icon"><Building2 size={21} /></span>
                <div><h2 id="dsp-assignment-heading">Work Assignment</h2><p>Managed by your administrator.</p></div>
              </div>
              <dl className="dsp-provisional-assignment">
                <div><dt>Business</dt><dd>{company?.name || 'Pending Assignment'}</dd></div>
                <div><dt>Job Title</dt><dd>{record?.jobTitle || 'To Be Assigned'}</dd></div>
                <div><dt>Department</dt><dd>{record?.department || 'To Be Assigned'}</dd></div>
                <div><dt>Location</dt><dd>{workplace?.locationName || 'To Be Assigned'}</dd></div>
              </dl>
              <p className="dsp-provisional-helper">Management controls your official role,
                department and work assignment. Completing your profile does not grant additional permissions.</p>
            </section>
          </aside>
        </div>
      </main>
      <footer className="dsp-provisional-footer">DAENEM StaffPortal · Secure Employee Onboarding</footer>
    </div>
  );
}

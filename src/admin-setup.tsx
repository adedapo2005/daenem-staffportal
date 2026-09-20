import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Building2, CheckCircle2, LocateFixed, MapPin, Palette, RefreshCw, Save, Settings2, ShieldCheck, X } from 'lucide-react';
import { api, type WorkforceContext } from './auth';
import { themeList } from './theme-system';
import './admin-setup.css';

type LocationRecord = {
  id: string;
  companyId: string;
  companyCode: string;
  companyName: string;
  name: string;
  addressLine?: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  radiusM: number;
  configured: boolean;
  requireLoginLocation: boolean;
  requireClockGeofence: boolean;
  requireClockInPhoto: boolean;
  requireClockOutPhoto: boolean;
  allowOfflineAttendance: boolean;
};

type SettingsMap = Record<string, unknown>;
type RecoveryPolicy='email'|'whatsapp'|'email_whatsapp';
type ScopedRecoverySettings={
  settingKey:string;
  global:{value:RecoveryPolicy;source:'global'};
  companies:Array<{id:string;code:string;name:string;value:RecoveryPolicy;source:'company'|'inherited'}>;
  canSetGlobal:boolean;
};

type EditLocation = {
  latitude: string;
  longitude: string;
  radiusM: number;
  requireLoginLocation: boolean;
  requireClockGeofence: boolean;
  requireClockInPhoto: boolean;
  requireClockOutPhoto: boolean;
  allowOfflineAttendance: boolean;
};

function canManage(context: WorkforceContext) {
  return ['settings.access', 'tracking.access'].some((permission) => context.permissions[permission] === 'manage');
}

function canView(context: WorkforceContext) {
  return ['settings.access', 'tracking.access', 'security.access'].some((permission) => (context.permissions[permission] || 'none') !== 'none');
}

function currentLocation(): Promise<{ latitude: number; longitude: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation is not supported on this device.'));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
      (error) => reject(new Error(error.message || 'Location permission is required.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

function editFrom(record: LocationRecord): EditLocation {
  return {
    latitude: record.latitude == null ? '' : String(record.latitude),
    longitude: record.longitude == null ? '' : String(record.longitude),
    radiusM: record.radiusM || 150,
    requireLoginLocation: record.requireLoginLocation,
    requireClockGeofence: record.requireClockGeofence,
    requireClockInPhoto: record.requireClockInPhoto,
    requireClockOutPhoto: record.requireClockOutPhoto,
    allowOfflineAttendance: record.allowOfflineAttendance,
  };
}

export function AdminSetup({ context, onClose }: { context: WorkforceContext; onClose: () => void }) {
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [settings, setSettings] = useState<SettingsMap>({});
  const [recoveryPolicy, setRecoveryPolicy] = useState<ScopedRecoverySettings | null>(null);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [recoveryValue, setRecoveryValue] = useState<RecoveryPolicy>('email');
  const [edits, setEdits] = useState<Record<string, EditLocation>>({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);
  const manage = canManage(context);

  async function load() {
    setBusy('load');
    setMessage(null);
    try {
      const [locationResult, settingsResult, scopedResult] = await Promise.all([
        api<{ locations: LocationRecord[] }>('/api/admin/locations'),
        api<{ settings: SettingsMap }>('/api/admin/settings'),
        api<ScopedRecoverySettings>('/api/admin/scoped-settings'),
      ]);
      setLocations(locationResult.locations || []);
      setEdits(Object.fromEntries((locationResult.locations || []).map((location) => [location.id, editFrom(location)])));
      setSettings(settingsResult.settings || {});
      setRecoveryPolicy(scopedResult);
      setRecoveryValue(scopedResult.global.value);
      setSelectedCompanies((current) => current.filter((id) => scopedResult.companies.some((company) => company.id === id)));
    } catch (error) {
      setMessage({ type: 'error', text: (error as Error).message });
    } finally { setBusy(''); }
  }

  useEffect(() => { load(); }, []);

  async function useDeviceLocation(location: LocationRecord) {
    setBusy(`locate-${location.id}`);
    setMessage({ type: 'info', text: `Getting precise GPS for ${location.name}… Only use this while physically at the work location.` });
    try {
      const position = await currentLocation();
      setEdits((current) => ({ ...current, [location.id]: { ...current[location.id], latitude: position.latitude.toFixed(7), longitude: position.longitude.toFixed(7) } }));
      setMessage({ type: 'success', text: `GPS captured with approximately ${Math.round(position.accuracy)}m accuracy. Review it before saving.` });
    } catch (error) { setMessage({ type: 'error', text: (error as Error).message }); }
    finally { setBusy(''); }
  }

  async function saveLocation(location: LocationRecord) {
    const edit = edits[location.id];
    if (!edit) return;
    setBusy(`save-${location.id}`);
    setMessage(null);
    try {
      await api('/api/admin/locations/configure', {
        method: 'POST',
        body: JSON.stringify({
          locationId: location.id,
          latitude: Number(edit.latitude),
          longitude: Number(edit.longitude),
          radiusM: edit.radiusM,
          requireLoginLocation: edit.requireLoginLocation,
          requireClockGeofence: edit.requireClockGeofence,
          requireClockInPhoto: edit.requireClockInPhoto,
          requireClockOutPhoto: edit.requireClockOutPhoto,
          allowOfflineAttendance: edit.allowOfflineAttendance,
        }),
      });
      setMessage({ type: 'success', text: `${location.companyName} geofence and attendance policy saved. The change was written to audit and security logs.` });
      await load();
    } catch (error) { setMessage({ type: 'error', text: (error as Error).message }); }
    finally { setBusy(''); }
  }

  async function saveSettings(next: SettingsMap) {
    if (!manage) return;
    setBusy('settings');
    setMessage(null);
    try {
      await api('/api/admin/settings', { method: 'POST', body: JSON.stringify({ settings: next }) });
      setSettings((current) => ({ ...current, ...next }));
      setMessage({ type: 'success', text: 'Workforce policy settings saved.' });
    } catch (error) { setMessage({ type: 'error', text: (error as Error).message }); }
    finally { setBusy(''); }
  }

  async function saveRecoveryPolicy(scope:'global'|'companies',inherit=false){
    if(!manage||!recoveryPolicy)return;
    setBusy('recovery-policy');setMessage(null);
    try{
      const result=await api<ScopedRecoverySettings>('/api/admin/scoped-settings',{
        method:'POST',
        body:JSON.stringify({
          settingKey:'security.password_recovery_methods',
          value:recoveryValue,
          scope,
          companyIds:scope==='companies'?selectedCompanies:undefined,
          inherit:scope==='companies'?inherit:undefined,
        }),
      });
      setRecoveryPolicy(result);
      setMessage({type:'success',text:scope==='global'
        ? 'Global password recovery policy saved. Companies without an override now inherit it.'
        : inherit
          ? 'Selected companies now inherit the global recovery policy.'
          : 'Password recovery policy applied to the selected companies.'});
    }catch(error){setMessage({type:'error',text:(error as Error).message})}
    finally{setBusy('')}
  }

  const allRecoverySelected=Boolean(recoveryPolicy?.companies.length)&&selectedCompanies.length===recoveryPolicy?.companies.length;
  function toggleRecoveryCompany(id:string){
    setSelectedCompanies(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);
  }
  function toggleAllRecoveryCompanies(){
    setSelectedCompanies(allRecoverySelected?[]:(recoveryPolicy?.companies.map(company=>company.id)||[]));
  }

  const configuredCount = useMemo(() => locations.filter((location) => location.configured).length, [locations]);

  return <div className="admin-setup-backdrop" onClick={onClose}>
    <section className="admin-setup-shell" onClick={(event) => event.stopPropagation()}>
      <header className="admin-setup-header">
        <div><span className="eyebrow">OWNER / ADMIN CONFIGURATION</span><h2>Workforce Setup Center</h2><p>Configure security, login location, attendance geofences, evidence requirements and Group UI policies without editing code.</p></div>
        <button onClick={onClose} aria-label="Close Admin Setup"><X size={20} /></button>
      </header>

      {message && <div className={`admin-setup-message ${message.type}`}>{message.text}</div>}

      <div className="admin-setup-stats">
        <div><Building2 size={18} /><span><small>Work locations</small><strong>{locations.length}</strong></span></div>
        <div><MapPin size={18} /><span><small>Geofences configured</small><strong>{configuredCount}/{locations.length}</strong></span></div>
        <div><ShieldCheck size={18} /><span><small>Login location mode</small><strong>{String(settings['security.login_location_mode'] || 'record')}</strong></span></div>
        <button onClick={load} disabled={busy === 'load'}><RefreshCw size={17} /> Refresh</button>
      </div>

      <section className="admin-setup-section">
        <div className="admin-section-title"><Settings2 size={20} /><div><h3>Global smart policies</h3><p>These apply across the Workforce Hub unless a company/location rule is more specific.</p></div></div>
        <div className="admin-policy-grid">
          <label><span>Login geolocation</span><select value={String(settings['security.login_location_mode'] || 'record')} disabled={!manage || busy === 'settings'} onChange={(event) => saveSettings({ 'security.login_location_mode': event.target.value })}><option value="off">Off</option><option value="record">Record location only</option><option value="enforce">Enforce approved location/geofence</option></select><small>Attendance remains separate from ERP login.</small></label>
          <label><span>Default theme</span><select value={String(settings['ui.default_theme'] || themeList[0].id)} disabled={!manage || busy === 'settings'} onChange={(event) => saveSettings({ 'ui.default_theme': event.target.value })}>{themeList.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select><small>The starting appearance for users without a preference.</small></label>
          <label><span>Force theme for everyone</span><select value={String(settings['ui.forced_theme'] || '')} disabled={!manage || busy === 'settings'} onChange={(event) => saveSettings({ 'ui.forced_theme': event.target.value })}><option value="">Do not force</option>{themeList.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select><small>When set, employee theme choice will be visually overridden.</small></label>
          <label className="admin-toggle"><input type="checkbox" checked={Boolean(settings['notifications.daily_word_requires_approval'] ?? true)} disabled={!manage || busy === 'settings'} onChange={(event) => saveSettings({ 'notifications.daily_word_requires_approval': event.target.checked })} /><span><b>Daily Word requires approval</b><small>AI encouragement cannot publish automatically.</small></span></label>
          <label className="admin-toggle"><input type="checkbox" checked={Boolean(settings['notifications.role_data_reminders'] ?? true)} disabled={!manage || busy === 'settings'} onChange={(event) => saveSettings({ 'notifications.role_data_reminders': event.target.checked })} /><span><b>Role-data reminders</b><small>Prompt employees to complete assigned operational data.</small></span></label>
          <label className="admin-toggle"><input type="checkbox" checked={Boolean(settings['ai.smart_exception_detection'] ?? true)} disabled={!manage || busy === 'settings'} onChange={(event) => saveSettings({ 'ai.smart_exception_detection': event.target.checked })} /><span><b>Smart exception detection</b><small>Allow AI-assisted anomaly and missing-data detection.</small></span></label>
        </div>
      </section>

      <section className="admin-setup-section">
        <div className="admin-section-title"><ShieldCheck size={20} /><div><h3>Password recovery methods</h3><p>Use the same multi-company targeting pattern for settings that can apply globally, to selected companies, or to one company.</p></div></div>
        {recoveryPolicy && <div className="admin-multi-policy">
          <div className="admin-policy-grid">
            <label><span>Recovery method</span><select value={recoveryValue} disabled={!manage||busy==='recovery-policy'} onChange={(event)=>setRecoveryValue(event.target.value as RecoveryPolicy)}><option value="email">Email Only</option><option value="whatsapp">WhatsApp Only</option><option value="email_whatsapp">Email + WhatsApp</option></select><small>WhatsApp requires an enrolled, previously verified contact and valid Meta configuration.</small></label>
            <div className="admin-scope-summary"><span>Global policy</span><strong>{recoveryPolicy.global.value==='email'?'Email Only':recoveryPolicy.global.value==='whatsapp'?'WhatsApp Only':'Email + WhatsApp'}</strong><small>Companies without their own override inherit this value.</small></div>
          </div>
          <div className="admin-company-targets">
            <div className="admin-company-targets-head">
              <label><input type="checkbox" checked={allRecoverySelected} onChange={toggleAllRecoveryCompanies} disabled={!manage}/><span><b>Select All</b><small>Apply to all companies you are authorized to manage.</small></span></label>
              <span>{selectedCompanies.length} of {recoveryPolicy.companies.length} selected</span>
            </div>
            <div className="admin-company-target-grid">
              {recoveryPolicy.companies.map(company=><label key={company.id} className="admin-company-target">
                <input type="checkbox" checked={selectedCompanies.includes(company.id)} onChange={()=>toggleRecoveryCompany(company.id)} disabled={!manage}/>
                <span><b>{company.name}</b><small>{company.code}</small></span>
                <em className={company.source}>{company.source==='company'?'Individually configured':'Inherited'}</em>
              </label>)}
            </div>
          </div>
          <div className="admin-location-actions">
            {recoveryPolicy.canSetGlobal && <button className="admin-secondary" disabled={!manage||busy==='recovery-policy'} onClick={()=>saveRecoveryPolicy('global')}><Save size={16}/> Save as global</button>}
            <button className="admin-primary" disabled={!manage||busy==='recovery-policy'||!selectedCompanies.length} onClick={()=>saveRecoveryPolicy('companies')}><Save size={16}/> Apply to selected</button>
            <button className="admin-secondary" disabled={!manage||busy==='recovery-policy'||!selectedCompanies.length} onClick={()=>saveRecoveryPolicy('companies',true)}>Use inherited value</button>
          </div>
        </div>}
      </section>

      <section className="admin-setup-section">
        <div className="admin-section-title"><LocateFixed size={20} /><div><h3>Work locations & attendance geofences</h3><p>Do not use “Use this device location” unless the device is physically at that Daenem workplace.</p></div></div>
        <div className="admin-location-list">
          {locations.map((location) => {
            const edit = edits[location.id] || editFrom(location);
            return <article className="admin-location-card" key={location.id}>
              <div className="admin-location-head"><div><span>{location.companyCode}</span><strong>{location.companyName}</strong><small>{location.name} · {[location.addressLine, location.city, location.state].filter(Boolean).join(', ')}</small></div><b className={location.configured ? 'configured' : 'pending'}>{location.configured ? 'Configured' : 'GPS needed'}</b></div>
              <div className="admin-coordinate-grid"><label><span>Latitude</span><input value={edit.latitude} disabled={!manage} inputMode="decimal" placeholder="e.g. 7.3775" onChange={(event) => setEdits({ ...edits, [location.id]: { ...edit, latitude: event.target.value } })} /></label><label><span>Longitude</span><input value={edit.longitude} disabled={!manage} inputMode="decimal" placeholder="e.g. 3.9470" onChange={(event) => setEdits({ ...edits, [location.id]: { ...edit, longitude: event.target.value } })} /></label><label><span>Radius (meters)</span><input type="number" min={25} max={5000} value={edit.radiusM} disabled={!manage} onChange={(event) => setEdits({ ...edits, [location.id]: { ...edit, radiusM: Number(event.target.value) } })} /></label></div>
              <div className="admin-location-options">
                <label><input type="checkbox" checked={edit.requireLoginLocation} disabled={!manage} onChange={(event) => setEdits({ ...edits, [location.id]: { ...edit, requireLoginLocation: event.target.checked } })} /><span>Require location for ERP login</span></label>
                <label><input type="checkbox" checked={edit.requireClockGeofence} disabled={!manage} onChange={(event) => setEdits({ ...edits, [location.id]: { ...edit, requireClockGeofence: event.target.checked } })} /><span>Enforce geofence for Clock In/Out</span></label>
                <label><input type="checkbox" checked={edit.requireClockInPhoto} disabled={!manage} onChange={(event) => setEdits({ ...edits, [location.id]: { ...edit, requireClockInPhoto: event.target.checked } })} /><span>Require Clock In photo</span></label>
                <label><input type="checkbox" checked={edit.requireClockOutPhoto} disabled={!manage} onChange={(event) => setEdits({ ...edits, [location.id]: { ...edit, requireClockOutPhoto: event.target.checked } })} /><span>Require Clock Out photo</span></label>
                <label><input type="checkbox" checked={edit.allowOfflineAttendance} disabled={!manage} onChange={(event) => setEdits({ ...edits, [location.id]: { ...edit, allowOfflineAttendance: event.target.checked } })} /><span>Allow offline attendance sync</span></label>
              </div>
              <div className="admin-location-actions"><button className="admin-secondary" disabled={!manage || busy.startsWith('locate-')} onClick={() => useDeviceLocation(location)}><LocateFixed size={16} /> Use this device location</button><button className="admin-primary" disabled={!manage || busy === `save-${location.id}` || !edit.latitude || !edit.longitude} onClick={() => saveLocation(location)}><Save size={16} /> Save geofence</button></div>
            </article>;
          })}
        </div>
      </section>

      <section className="admin-setup-section admin-ai-tip">
        <Bot size={22} /><div><strong>AI-guided setup is being connected to this page.</strong><p>The AI Guide will explain each policy using your actual permissions and current configuration, while final changes remain under authorized human control.</p></div><Palette size={19} />
      </section>
      {!manage && <div className="admin-view-only"><CheckCircle2 size={18} /><span>You have View Only access to this setup page. Controls are disabled by permission.</span></div>}
    </section>
  </div>;
}

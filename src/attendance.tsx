import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Clock3, LocateFixed, MapPin, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { api, type WorkforceContext } from './auth';
import './attendance.css';

type AttendanceToday = {
  companyId: string;
  workDate: string;
  day: null | { id: string; status: string; clockInAt?: string; clockOutAt?: string; workedMinutes?: number; lateMinutes?: number };
  policy: {
    locationId?: string;
    locationName: string;
    radiusM: number;
    geofenceRequired: boolean;
    geofenceConfigured: boolean;
    clockInPhotoRequired: boolean;
    clockOutPhotoRequired: boolean;
    offlineAllowed: boolean;
  };
  rule: string;
};

type LocationPayload = { latitude: number; longitude: number; accuracy: number };

function locationNow(): Promise<LocationPayload> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This device does not support GPS location.'));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
      (error) => reject(new Error(error.message || 'GPS location permission is required.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 },
    );
  });
}

function CameraCapture({ onCapture, onClose }: { onCapture: (image: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => undefined);
        }
      })
      .catch((cameraError) => setError(cameraError.message || 'Camera permission is required.'));
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const maxWidth = 720;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/jpeg', .78);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    onCapture(image);
  }

  return <div className="attendance-camera-backdrop"><section className="attendance-camera-card"><div className="attendance-camera-head"><div><span>LIVE EMPLOYEE PHOTO</span><strong>Attendance verification</strong></div><button onClick={onClose} aria-label="Close camera"><X size={18} /></button></div>{error ? <div className="attendance-camera-error"><ShieldAlert size={24} /><p>{error}</p></div> : <video ref={videoRef} playsInline muted className="attendance-video" />}<button className="attendance-camera-action" onClick={capture} disabled={Boolean(error)}><Camera size={18} /> Capture photo</button></section></div>;
}

function fmtTime(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value));
}

export function AttendancePanel({ context, companyId }: { context: WorkforceContext; companyId?: string | null }) {
  const selectedCompany = companyId || context.companies.find((company) => company.primary)?.id || context.companies[0]?.id;
  const [today, setToday] = useState<AttendanceToday | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<'clock_in' | 'clock_out' | null>(null);
  const [location, setLocation] = useState<LocationPayload | null>(null);

  async function load() {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const result = await api<AttendanceToday>(`/api/attendance/today?companyId=${encodeURIComponent(selectedCompany)}`);
      setToday(result);
    } catch (error) {
      setMessage({ type: 'error', text: (error as Error).message });
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [selectedCompany]);

  async function begin(action: 'clock_in' | 'clock_out') {
    setLoading(true);
    setMessage({ type: 'info', text: 'Checking your live GPS location…' });
    try {
      const currentLocation = await locationNow();
      setLocation(currentLocation);
      const photoRequired = action === 'clock_in' ? today?.policy.clockInPhotoRequired : today?.policy.clockOutPhotoRequired;
      if (photoRequired) {
        setPendingAction(action);
        setMessage({ type: 'info', text: 'GPS acquired. Take the required live employee photo.' });
      } else {
        await submitClock(action, currentLocation);
      }
    } catch (error) {
      setMessage({ type: 'error', text: (error as Error).message });
    } finally { setLoading(false); }
  }

  async function submitClock(action: 'clock_in' | 'clock_out', currentLocation: LocationPayload, photoDataUrl?: string) {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const result = await api<{ message: string }>('/api/attendance/clock', {
        method: 'POST',
        body: JSON.stringify({ action, companyId: selectedCompany, ...currentLocation, photoDataUrl }),
      });
      setMessage({ type: 'success', text: result.message });
      setPendingAction(null);
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: (error as Error).message });
    } finally { setLoading(false); }
  }

  const status = today?.day?.status || 'not_started';
  const canClockIn = status === 'not_started' || (!today?.day?.clockInAt && status === 'incomplete');
  const canClockOut = Boolean(today?.day?.clockInAt) && !today?.day?.clockOutAt;

  return <article className="attendance-panel">
    <div className="attendance-panel-head"><div><span className="eyebrow">MY DAY & ATTENDANCE</span><h3>{today?.policy.locationName || 'Assigned work location'}</h3></div><button className="attendance-refresh" onClick={load} disabled={loading}><RefreshCw size={15} /></button></div>
    {message && <div className={`attendance-message ${message.type}`}>{message.text}</div>}
    <div className={`attendance-status ${status}`}><div><span>Today's status</span><strong>{status === 'present' ? 'PRESENT / WORKED' : status === 'incomplete' ? 'INCOMPLETE' : status === 'not_started' ? 'NOT STARTED' : status.toUpperCase()}</strong></div>{status === 'incomplete' && <p>Clock-in alone does not count as a worked day. Complete a valid clock-out before leaving.</p>}{status === 'present' && <p>Clock-in and clock-out are complete for this work day.</p>}</div>
    <div className="attendance-times"><div><Clock3 size={17} /><span><small>Clock in</small><strong>{fmtTime(today?.day?.clockInAt)}</strong></span></div><div><Clock3 size={17} /><span><small>Clock out</small><strong>{fmtTime(today?.day?.clockOutAt)}</strong></span></div><div><MapPin size={17} /><span><small>Geofence</small><strong>{today?.policy.geofenceRequired ? (today.policy.geofenceConfigured ? `${today.policy.radiusM}m enforced` : 'Admin setup required') : 'Not required'}</strong></span></div></div>
    {!today?.policy.geofenceConfigured && today?.policy.geofenceRequired && <div className="attendance-lock"><ShieldAlert size={19} /><span><strong>Attendance locked</strong><small>Your Owner/Admin must set this workplace GPS coordinates before clock-in/out can be accepted.</small></span></div>}
    <div className="attendance-actions"><button className="attendance-in" disabled={loading || !canClockIn || Boolean(today?.policy.geofenceRequired && !today.policy.geofenceConfigured)} onClick={() => begin('clock_in')}><LocateFixed size={18} /> Clock In</button><button className="attendance-out" disabled={loading || !canClockOut || Boolean(today?.policy.geofenceRequired && !today.policy.geofenceConfigured)} onClick={() => begin('clock_out')}><CheckCircle2 size={18} /> Clock Out</button></div>
    <p className="attendance-rule">{today?.rule || 'A completed work day requires a valid clock-in and clock-out.'}</p>
    {pendingAction && location && <CameraCapture onClose={() => setPendingAction(null)} onCapture={(image) => submitClock(pendingAction, location, image)} />}
  </article>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Camera, Clock, MapPin, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useLab } from "./lab-context";
import { byId, canAct, sessionScopeKey } from "./model";
import { apiErrorMessage, staffPortalApi } from "./staffportal-api";
import { isAttendanceClockResponse, isAttendanceToday, workforceCompanyId, type AttendanceToday } from "./workforce-api";
import { formatAuthenticatedTime12 } from "./time-standard";
import { Badge, Btn, Callout, Panel, Timeline } from "./ui";

type AttendanceState =
  | { status: "loading"; scopeKey: string }
  | { status: "ready"; scopeKey: string; data: AttendanceToday }
  | { status: "error"; scopeKey: string; message: string };
type LocationFix = { latitude: number; longitude: number; accuracy: number };

function CameraCapture({ onCapture, onClose }: { onCapture: (dataUrl: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      queueMicrotask(() => setError("Live camera capture is unavailable on this device."));
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((media) => {
        if (!current) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = media;
        if (video.current) video.current.srcObject = media;
      })
      .catch(() => {
        if (current) setError("Camera permission was not granted or the camera is unavailable.");
      });
    return () => {
      current = false;
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    };
  }, []);
  function capture() {
    if (!video.current?.videoWidth || !video.current.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.current.videoWidth;
    canvas.height = video.current.videoHeight;
    canvas.getContext("2d")?.drawImage(video.current, 0, 0);
    onCapture(canvas.toDataURL("image/jpeg", 0.86));
  }
  return <div className="v3-camera-backdrop" role="dialog" aria-modal="true" aria-labelledby="attendance-camera-title">
    <section className="v3-camera-card">
      <header><div><span className="p-kicker">LIVE EMPLOYEE PHOTO</span><h2 id="attendance-camera-title">Attendance verification</h2></div><button onClick={onClose} aria-label="Close camera"><X size={18} /></button></header>
      {error ? <Callout tone="neutral" title="Camera unavailable"><p>{error}</p></Callout> : <video ref={video} autoPlay playsInline muted />}
      <Btn onClick={capture} disabled={Boolean(error)}><Camera size={17} />Capture photo</Btn>
    </section>
  </div>;
}

export default function AttendanceV3() {
  const { session } = useLab();
  const scopeKey = sessionScopeKey(session);
  const companyId = workforceCompanyId(session.company);
  const moduleDef = byId("attendance")!;
  const canClock = canAct(moduleDef, session, "create");
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<AttendanceState>({ status: "loading", scopeKey });
  const [location, setLocation] = useState<LocationFix | null>(null);
  const [locationMessage, setLocationMessage] = useState("Location has not been requested.");
  const [photo, setPhoto] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const writeController = useRef<AbortController | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      setLocation(null);
      setLocationMessage("Location has not been requested.");
      setPhoto("");
      setFeedback("");
    });
    if (!companyId) {
      queueMicrotask(() => setState({ status: "error", scopeKey, message: "Choose a specific assigned business to use attendance." }));
      return;
    }
    const controller = new AbortController();
    let current = true;
    queueMicrotask(() => { if (current) setState({ status: "loading", scopeKey }); });
    staffPortalApi<unknown>(`/api/attendance/today?companyId=${encodeURIComponent(companyId)}`, { signal: controller.signal })
      .then((response) => {
        if (!current) return;
        if (!isAttendanceToday(response) || response.companyId !== companyId) {
          setState({ status: "error", scopeKey, message: "The Staff Portal service returned an invalid response." });
          return;
        }
        setState({ status: "ready", scopeKey, data: response });
      })
      .catch((error: unknown) => {
        if (!current || controller.signal.aborted) return;
        setState({ status: "error", scopeKey, message: apiErrorMessage(error) });
      });
    return () => { current = false; controller.abort(); writeController.current?.abort(); };
  }, [companyId, refresh, scopeKey]);

  const current = state.scopeKey === scopeKey ? state : { status: "loading" as const, scopeKey };
  const data = current.status === "ready" ? current.data : null;
  const day = data?.day;
  const hasIn = Boolean(day?.clockInAt);
  const hasOut = Boolean(day?.clockOutAt);
  const action = hasIn ? "clock_out" : "clock_in";
  const photoRequired = action === "clock_in" ? data?.policy.clockInPhotoRequired : data?.policy.clockOutPhotoRequired;

  function requestLocation() {
    setLocation(null);
    if (!navigator.geolocation) {
      setLocationMessage("Device geolocation is unavailable.");
      return;
    }
    setLocationMessage("Waiting for browser location permission…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy });
        setLocationMessage(`Location ready · accuracy ${Math.round(position.coords.accuracy)} m. Coordinates remain in memory until this attendance request finishes.`);
      },
      (error) => setLocationMessage(error.code === 1 ? "Location permission was denied." : error.code === 3 ? "Location request timed out." : "Device location is unavailable."),
      { timeout: 12_000, maximumAge: 0, enableHighAccuracy: true },
    );
  }

  async function clock() {
    if (!data || !companyId || !canClock || busy || hasOut) return;
    if (data.policy.geofenceRequired && !location) {
      setFeedback("Location permission and an accurate device position are required before this attendance event.");
      return;
    }
    if (photoRequired && !photo) {
      setFeedback("A live employee photo is required before this attendance event.");
      return;
    }
    setBusy(true);
    setFeedback("");
    writeController.current?.abort();
    const controller = new AbortController();
    writeController.current = controller;
    try {
      const response = await staffPortalApi<unknown>("/api/attendance/clock", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({ action, companyId, ...(location || {}), ...(photo ? { photoDataUrl: photo } : {}) }),
      });
      if (!isAttendanceClockResponse(response)) {
        setFeedback("The Staff Portal service returned an invalid response.");
        return;
      }
      setState({ status: "ready", scopeKey, data: { ...data, day: response.day } });
      setPhoto("");
      setFeedback(response.message);
    } catch (error) {
      if (controller.signal.aborted) return;
      setFeedback(apiErrorMessage(error));
    } finally {
      if (writeController.current === controller) {
        writeController.current = null;
        setBusy(false);
      }
    }
  }

  if (current.status === "loading") return <Panel title="Loading attendance"><p role="status" className="p-secondary">Loading today’s authorized attendance policy and state…</p></Panel>;
  if (current.status === "error") return <><Callout tone="neutral" title="Attendance unavailable"><p>{current.message}</p></Callout><Btn variant="outline" onClick={() => setRefresh((value) => value + 1)} disabled={!companyId}><RefreshCw size={16} />Retry</Btn></>;

  const attendance = current.data;
  const timeline = [
    day?.clockInAt ? { action: "Clock-in", actor: attendance.policy.locationName, time: formatAuthenticatedTime12(day.clockInAt, session) } : null,
    day?.clockOutAt ? { action: "Clock-out", actor: attendance.policy.locationName, time: formatAuthenticatedTime12(day.clockOutAt, session) } : null,
  ].filter((item): item is { action: string; actor: string; time: string } => Boolean(item));
  return <>
    {cameraOpen && <CameraCapture onClose={() => setCameraOpen(false)} onCapture={(dataUrl) => { setPhoto(dataUrl); setCameraOpen(false); setFeedback("Live photo is ready for this attendance request."); }} />}
    <div className="v3-attendance-head"><div><span className="p-kicker">YOUR SHIFT · AFRICA/LAGOS</span><h2>Start with presence.<br />Finish with a complete record.</h2><p>Signing in does not clock you in. Both required events must succeed before a day is present.</p></div><div className="v3-attendance-state"><Clock size={30} /><strong>{day?.status ? day.status.replaceAll("_", " ") : "Not started"}</strong><span>{attendance.workDate}</span><Badge>Authoritative attendance</Badge></div></div>
    <div className="v3-attendance-grid">
      <Panel title="Today’s attendance events" kicker="TWO DISTINCT SUCCESSFUL EVENTS">
        <div className="v3-clock-actions"><div><span>01</span><h3>Clock in</h3><p>{day?.clockInAt ? formatAuthenticatedTime12(day.clockInAt, session) : "No event recorded"}</p><Btn disabled={hasIn || !canClock || busy} onClick={clock}>{hasIn ? "Clock-in recorded" : busy ? "Recording…" : "Clock in"}<ArrowRight size={15} /></Btn></div><div><span>02</span><h3>Clock out</h3><p>{day?.clockOutAt ? formatAuthenticatedTime12(day.clockOutAt, session) : "Required to complete the day"}</p><Btn disabled={!hasIn || hasOut || !canClock || busy} onClick={clock}>{hasOut ? "Clock-out recorded" : busy ? "Recording…" : "Clock out"}<ArrowRight size={15} /></Btn></div></div>
        {timeline.length ? <Timeline items={timeline} /> : <p className="p-secondary">No attendance events were returned for today.</p>}
        {feedback && <p role="status" className="p-form-feedback">{feedback}</p>}
      </Panel>
      <Panel title="Validation & privacy" kicker="AUTHORITATIVE COMPANY POLICY">
        <dl className="p-detail-fields"><div><dt>Assigned location</dt><dd>{attendance.policy.locationName}</dd></div><div><dt>Geofence</dt><dd>{attendance.policy.geofenceRequired ? attendance.policy.geofenceConfigured ? `${attendance.policy.radiusM} m radius` : "Configuration required" : "Not required"}</dd></div><div><dt>Current photo rule</dt><dd>{photoRequired ? "Live photo required" : "Photo not required"}</dd></div><div><dt>Offline policy</dt><dd>{attendance.policy.offlineAllowed ? "Allowed by backend policy" : "Not allowed"}</dd></div></dl>
        {attendance.policy.geofenceRequired && <><Btn variant="outline" onClick={requestLocation}><MapPin size={16} />Request device location</Btn><p role="status" className="p-secondary">{locationMessage}</p></>}
        {photoRequired && <><Btn variant="outline" onClick={() => setCameraOpen(true)}><Camera size={16} />{photo ? "Retake live photo" : "Capture live photo"}</Btn><p className="p-secondary">{photo ? "Photo captured in memory and ready for this request." : "The photo is sent only with the attendance event and is not stored by this page."}</p></>}
        {!canClock && <Callout tone="neutral" title="Attendance actions unavailable"><p>Your current assignment does not include attendance creation for this company.</p></Callout>}
        <p className="p-secondary"><ShieldCheck size={15} /> {attendance.rule}</p>
      </Panel>
    </div>
  </>;
}

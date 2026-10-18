"use client";

import {
  ArchiveRestore,
  ArrowLeft,
  Cloud,
  CloudCog,
  Database,
  FileClock,
  FolderLock,
  History,
  KeyRound,
  Link2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Badge, Btn, Callout } from "./ui";

const unavailableMetrics = [
  { label: "Pending", icon: FileClock },
  { label: "Retrying", icon: RefreshCw },
  { label: "Failed", icon: TriangleAlert },
];

const backendDependencies = [
  "Microsoft OAuth authorization, callback handling and protected token vaulting",
  "Microsoft Graph drive and destination discovery",
  "Durable asynchronous job enqueue after every accepted R2 upload",
  "Idempotent OneDrive copy processing with checksum and version mapping",
  "Retry, backoff and dead-letter controls",
  "Permission-scoped sync health and pending, retrying and failed count read models",
  "Retention and deletion-policy persistence",
  "Immutable audit events for connection, copy, retry and deletion activity",
  "Reconnect, disconnect and Microsoft grant-revocation handling",
];

export default function CloudStorageAdmin({ onBack }: { onBack: () => void }) {
  return (
    <section className="cs-admin" aria-labelledby="cloud-storage-title" data-review-surface="cloud-storage" data-review-ready="true">
      <header className="cs-hero">
        <div>
          <span className="p-kicker">ADMIN / PLATFORM / STORAGE</span>
          <h2 id="cloud-storage-title">Cloud Storage &amp; Backup</h2>
          <p>
            Review the approved dual-storage contract without implying a live connection,
            copy, count, destination, policy or audit state.
          </p>
        </div>
        <div className="cs-hero-actions">
          <Badge>READ-MODEL SHELL</Badge>
          <Btn variant="outline" onClick={onBack}><ArrowLeft size={15} />Back to Admin</Btn>
        </div>
      </header>

      <div className="cs-topology" aria-label="Approved storage topology">
        <article className="cs-node primary">
          <span className="cs-node-icon"><Database aria-hidden="true" /></span>
          <div>
            <small>PRIMARY OPERATIONAL STORAGE</small>
            <h3>Cloudflare R2</h3>
            <p>Accepted uploads remain operationally owned by R2.</p>
          </div>
          <Badge>CONTRACT DESIGNATED</Badge>
        </article>
        <div className="cs-flow" aria-label="Asynchronous copy required">
          <span><RefreshCw aria-hidden="true" />Asynchronous copy</span>
          <small>Runtime unverified</small>
        </div>
        <article className="cs-node secondary">
          <span className="cs-node-icon"><Cloud aria-hidden="true" /></span>
          <div>
            <small>SECONDARY BACKUP COPY</small>
            <h3>Microsoft OneDrive</h3>
            <p>Every accepted upload must ultimately receive a secondary copy.</p>
          </div>
          <Badge>CONFIGURATION REQUIRED</Badge>
        </article>
      </div>

      <div className="cs-grid">
        <section className="cs-card cs-connection" aria-labelledby="cs-connection-title">
          <header>
            <CloudCog aria-hidden="true" />
            <div><h3 id="cs-connection-title">Microsoft connection</h3><p>OAuth and Graph only.</p></div>
          </header>
          <dl className="cs-facts">
            <div><dt>Provider status</dt><dd>Not connected</dd></div>
            <div><dt>Destination</dt><dd>Not configured</dd></div>
            <div><dt>Sync health</dt><dd>Unavailable</dd></div>
            <div><dt>Last successful copy</dt><dd>No authoritative event</dd></div>
          </dl>
          <div className="cs-actions" aria-label="OneDrive connection actions">
            <Btn disabled aria-disabled="true" title="Microsoft OAuth backend contract required"><Link2 size={15} />Connect Microsoft OneDrive</Btn>
            <Btn variant="outline" disabled aria-disabled="true" title="No authoritative Microsoft connection exists"><RefreshCw size={15} />Reconnect</Btn>
            <Btn variant="outline" disabled aria-disabled="true" title="No authoritative Microsoft connection exists"><RotateCcw size={15} />Disconnect</Btn>
          </div>
          <p className="cs-privacy"><KeyRound size={15} aria-hidden="true" />This interface never asks for Microsoft passwords, MFA codes, access tokens, refresh tokens or client secrets.</p>
        </section>

        <section className="cs-card" aria-labelledby="cs-health-title">
          <header>
            <ArchiveRestore aria-hidden="true" />
            <div><h3 id="cs-health-title">Secondary-copy health</h3><p>Counts stay neutral until scoped telemetry exists.</p></div>
          </header>
          <div className="cs-metrics">
            {unavailableMetrics.map(({ label, icon: Icon }) => (
              <div key={label}>
                <Icon aria-hidden="true" />
                <span>{label}</span>
                <strong aria-label={`${label} count unavailable`}>—</strong>
                <small>Unavailable</small>
              </div>
            ))}
          </div>
          <Btn variant="outline" disabled aria-disabled="true" title="Scoped retry command and failed-copy telemetry required"><RefreshCw size={15} />Retry failed copies</Btn>
        </section>

        <section className="cs-card" aria-labelledby="cs-policy-title">
          <header>
            <FolderLock aria-hidden="true" />
            <div><h3 id="cs-policy-title">Retention &amp; deletion</h3><p>Policy must be authoritative before it is displayed or changed.</p></div>
          </header>
          <div className="cs-policy-row"><span><strong>Retention policy</strong><small>Unavailable</small></span><Badge>BACKEND REQUIRED</Badge></div>
          <div className="cs-policy-row"><span><strong>Deletion propagation</strong><small>Not configured</small></span><Badge>BACKEND REQUIRED</Badge></div>
          <p className="cs-note">No retention period, deletion delay or legal-hold behavior is inferred by this frontend.</p>
        </section>

        <section className="cs-card" aria-labelledby="cs-audit-title">
          <header>
            <History aria-hidden="true" />
            <div><h3 id="cs-audit-title">Storage audit</h3><p>Connection and copy evidence is permission-scoped.</p></div>
          </header>
          <div className="cs-empty-audit">
            <ShieldCheck aria-hidden="true" />
            <strong>No authoritative sync audit available</strong>
            <p>No event actor, file name, destination, timestamp or retry detail is fabricated.</p>
          </div>
        </section>
      </div>

      <Callout tone="neutral" title="Authoritative dual-storage backend required">
        {backendDependencies.join("; ")}.
      </Callout>
    </section>
  );
}

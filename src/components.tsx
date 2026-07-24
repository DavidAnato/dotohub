import { Droplets, FlaskConical, TriangleAlert, WifiOff, X } from "lucide-react";

function displayVal(v?: string | null) {
  const t = (v || "").trim();
  return t || "Non identifié";
}

function allergiesList(list?: string[] | null) {
  if (!list || !list.length) return ["Non identifié"];
  return list;
}

export function UrgenceHeader({ u }: { u: any }) {
  if (!u) return null;
  const allergies = allergiesList(u.allergies);
  return (
    <div className="urgence critical-grid" style={{ marginBottom: 20 }}>
      <div className="critical-row">
        <div className="critical-icon blood" aria-hidden>
          <Droplets size={18} strokeWidth={2.4} />
        </div>
        <div>
          <div className="small muted">Groupe sanguin</div>
          <div className="critical-value">{displayVal(u.groupe_sanguin)}</div>
        </div>
      </div>
      <div className="critical-row">
        <div className="critical-icon electro" aria-hidden>
          <FlaskConical size={18} strokeWidth={2.4} />
        </div>
        <div>
          <div className="small muted">Électrophorèse</div>
          <div className="critical-value">{displayVal(u.electrophorese)}</div>
        </div>
      </div>
      <div className="critical-row" style={{ flex: 1.4, minWidth: 200 }}>
        <div className="critical-icon allergy" aria-hidden>
          <TriangleAlert size={18} strokeWidth={2.4} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="small muted" style={{ marginBottom: 4 }}>
            Allergies critiques
          </div>
          <div className="critical-value" style={{ fontSize: 15 }}>
            {allergies.join(" · ")}
          </div>
        </div>
      </div>
      <div className="critical-meta">
        <div className="small muted">Contact d&apos;urgence</div>
        <div style={{ fontWeight: 700 }}>{u.contact_urgence_nom || "—"}</div>
        <div className="small mono">{u.tel_urgence}</div>
      </div>
      <div className="critical-meta">
        <div className="small muted">Assureur</div>
        <div style={{ fontWeight: 700 }}>{u.assureur || "—"}</div>
        <div className="small mono">{u.num_police}</div>
      </div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="card" style={{ textAlign: "center", color: "var(--muted)" }}>
      {text}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    normal: "green",
    active: "green",
    eleve: "amber",
    critique: "red",
    dispensee: "blue",
    terminee: "blue",
    annulee: "red",
    annule: "red",
    planifie: "amber",
    confirme: "green",
  };
  return <span className={`pill ${map[status] || "blue"}`}>{status}</span>;
}

export function Skeleton({ height = 16, width = "100%", className = "" }: {
  height?: number | string;
  width?: number | string;
  className?: string;
}) {
  return (
    <div
      className={`skel ${className}`}
      style={{ height, width }}
      aria-hidden
    />
  );
}

export function OfflineBanner({ online }: { online: boolean }) {
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      <WifiOff size={16} strokeWidth={2} aria-hidden />
      Mode hors ligne — certaines actions sont indisponibles.
    </div>
  );
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  if (!message) return null;
  return (
    <div className="toast toast-in" role="status">
      <span style={{ flex: 1 }}>{message}</span>
      <button type="button" className="toast-x" onClick={onClose} aria-label="Fermer">
        <X size={16} />
      </button>
    </div>
  );
}

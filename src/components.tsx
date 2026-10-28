import { useEffect, useRef } from "react";
import { CircleAlert, CircleCheck, Droplets, FlaskConical, Info, TriangleAlert, WifiOff, X } from "lucide-react";
import { labelStatut, type ToastTone } from "./apiMessage";

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
        <div style={{ fontWeight: 700 }}>{u.contact_urgence_nom || "-"}</div>
        <div className="small mono">{u.tel_urgence}</div>
      </div>
      <div className="critical-meta">
        <div className="small muted">Assureur</div>
        <div style={{ fontWeight: 700 }}>{u.assureur || "-"}</div>
        <div className="small mono">{u.num_police}</div>
      </div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="panel" style={{ textAlign: "center", color: "var(--muted)", padding: "28px 16px" }}>
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
    payee: "blue",
    terminee: "blue",
    annulee: "red",
    annule: "red",
    planifie: "amber",
    confirme: "green",
  };
  return <span className={`pill ${map[status] || "blue"}`}>{labelStatut(status)}</span>;
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
      Hors ligne — vos actions seront enregistrées au retour du réseau.
    </div>
  );
}

export function Toast({
  message,
  tone = "info",
  onClose,
}: {
  message: string;
  tone?: ToastTone;
  onClose: () => void;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!message) return;
    const ms = tone === "error" ? 7000 : 4200;
    const id = window.setTimeout(() => closeRef.current(), ms);
    return () => window.clearTimeout(id);
  }, [message, tone]);
  if (!message) return null;
  const Icon = tone === "error" ? CircleAlert : tone === "success" ? CircleCheck : Info;
  return (
    <div className={`toast toast-in toast-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span className="toast-icon" aria-hidden>
        <Icon size={18} strokeWidth={2.4} />
      </span>
      <span className="toast-text">{message}</span>
      <button type="button" className="toast-x" onClick={onClose} aria-label="Fermer">
        <X size={16} />
      </button>
    </div>
  );
}

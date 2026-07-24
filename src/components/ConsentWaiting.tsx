/** Écran d'attente consentement patient + bannière urgence. */
import { Loader2, ShieldAlert } from "lucide-react";

function waitingHint(role?: string): string {
  switch (role) {
    case "pharmacien":
      return "Portée demandée : ordonnances.";
    case "laborantin":
      return "Portée demandée : examens / résultats labo.";
    case "infirmier":
      return "Portée demandée : constantes et notes de soins.";
    case "receptionniste":
      return "Portée demandée : identité et assurance.";
    case "ambulancier":
      return "Portée demandée : informations d'urgence.";
    case "medecin":
    case "admin":
      return "Portée demandée : dossier médical.";
    default:
      return "";
  }
}

export function ConsentWaiting({
  patientName,
  emergency,
  role,
  onCancel,
}: {
  patientName?: string;
  emergency?: boolean;
  /** Rôle du pro demandeur — adapte le message d'attente. */
  role?: string;
  onCancel?: () => void;
}) {
  if (emergency) {
    return (
      <div
        className="card"
        style={{
          borderColor: "var(--emergency)",
          background: "var(--emergency-soft, #fde8e8)",
          marginBottom: 16,
        }}
      >
        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
          <ShieldAlert size={22} color="var(--emergency)" />
          <div>
            <strong style={{ color: "var(--emergency)" }}>
              Accès urgence sans consentement — journalisé
            </strong>
            <p className="muted small" style={{ margin: "6px 0 0" }}>
              Ouverture limitée (groupe sanguin, allergies, chroniques, contacts).
              Toute action est tracée dans le journal d&apos;audit.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const hint = waitingHint(role);

  return (
    <div className="card page-enter" style={{ textAlign: "center", padding: "36px 24px" }}>
      <Loader2
        size={36}
        className="spin"
        style={{ color: "var(--teal)", marginBottom: 14 }}
        aria-hidden
      />
      <h2 style={{ margin: "0 0 8px", color: "var(--heading)" }}>Demande envoyée au patient…</h2>
      <p className="muted" style={{ maxWidth: 420, margin: "0 auto 16px" }}>
        {patientName
          ? `${patientName} doit confirmer l'accès dans l'application DOTO+.`
          : "Le patient doit confirmer l'accès dans l'application DOTO+."}
        {" "}
        Vous serez notifié automatiquement (SSE).
        {hint ? (
          <>
            <br />
            <span style={{ display: "inline-block", marginTop: 8, fontWeight: 600, color: "var(--heading)" }}>
              {hint}
            </span>
          </>
        ) : null}
      </p>
      {onCancel ? (
        <button type="button" className="btn ghost sm" onClick={onCancel}>
          Annuler
        </button>
      ) : null}
    </div>
  );
}

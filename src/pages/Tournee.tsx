import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { Empty } from "../components";
import { Avatar } from "../components/Avatar";

function formatHeure(debut?: string) {
  if (!debut) return "—";
  return new Date(debut).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Tournee() {
  const { data, isLoading } = useQuery({
    queryKey: ["appointments", "today"],
    queryFn: () => api.appointmentsToday(),
  });

  const items = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const todayLabel = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="page-enter">
      <header className="page-head">
        <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ClipboardList size={22} /> Tournée du jour
        </h1>
        <p className="muted small">
          {todayLabel} — saisie des constantes sur le dossier patient
        </p>
      </header>

      {isLoading ? (
        <div className="skel" style={{ height: 120 }} />
      ) : items.length === 0 ? (
        <Empty text="Aucun patient prévu aujourd’hui" />
      ) : (
        <div className="list-stack">
          {items.map((a: any) => (
            <div className="list-item" key={a.id} style={{ flexWrap: "wrap" }}>
              <div className="row" style={{ gap: 12, alignItems: "flex-start", flex: 1 }}>
                <Avatar
                  src={a.patient_photo_url}
                  name={a.patient_name || `Patient #${a.patient}`}
                  size={40}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatHeure(a.debut)}
                    </strong>
                    <span>{a.patient_name || `Patient #${a.patient}`}</span>
                    <span className="pill blue">{a.statut_label || a.statut}</span>
                  </div>
                  <p className="small muted" style={{ marginTop: 6 }}>
                    {a.motif || "Sans motif"}
                    {a.patient_npi ? ` · ${a.patient_npi}` : ""}
                  </p>
                </div>
              </div>
              {a.patient ? (
                <Link className="btn" to={`/patient/${a.patient}`}>
                  Ouvrir dossier
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

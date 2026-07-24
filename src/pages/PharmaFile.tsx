import { useMemo, useState } from "react";
import { Pill } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { Empty } from "../components";
import { PatientSelectSearch, type PatientOption } from "../components/PatientSelectSearch";
import { useAppStore } from "../store/appStore";

function medsResume(meds: any[] | undefined): string {
  if (!meds?.length) return "Aucun médicament";
  const names = meds.map((m) => m.nom).filter(Boolean);
  if (!names.length) return "Aucun médicament";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} (+${names.length - 3})`;
}

export default function PharmaFile() {
  const setToast = useAppStore((s) => s.setToast);
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [patientId, setPatientId] = useState("");
  const [patientLabel, setPatientLabel] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["ordonnances", "pharma", patientId],
    queryFn: () => api.ordonnances(patientId),
    enabled: !!patientId,
  });

  const items = useMemo(() => {
    const raw = data?.results || data || [];
    const list = Array.isArray(raw) ? raw : [];
    return list.filter((o: any) => o.statut === "active" || o.statut === "dispensee");
  }, [data]);

  const dispenseMut = useMutation({
    mutationFn: (id: number) => api.dispenser(id),
    onMutate: (id) => setBusyId(id),
    onSuccess: () => {
      setToast("Ordonnance marquée dispensée");
      qc.invalidateQueries({ queryKey: ["ordonnances", "pharma", patientId] });
    },
    onError: (e: any) => setToast(e?.data?.detail || e.message || "Échec dispense"),
    onSettled: () => setBusyId(null),
  });

  const annulerDispenseMut = useMutation({
    mutationFn: (id: number) => api.annulerDispense(id),
    onMutate: (id) => setBusyId(id),
    onSuccess: () => {
      setToast("Dispense annulée");
      qc.invalidateQueries({ queryKey: ["ordonnances", "pharma", patientId] });
    },
    onError: (e: any) => setToast(e?.data?.detail || e.message || "Échec"),
    onSettled: () => setBusyId(null),
  });

  const onPatientChange = (id: string, p?: PatientOption | null) => {
    setPatientId(id);
    setPatientLabel(
      p
        ? p.full_name || `${p.prenom || ""} ${p.nom || ""}`.trim() || `Patient #${id}`
        : id
          ? `Patient #${id}`
          : ""
    );
  };

  return (
    <div className="page-enter">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Pill size={22} /> Dispenser une ordonnance
          </h1>
          <p className="muted small">
            L’ordonnance est prescrite par le médecin et valable dans toute pharmacie —
            identifiez le patient (NPI / nom), puis dispensez.
          </p>
        </div>
        {patientId ? (
          <button className="btn ghost sm" type="button" onClick={() => refetch()}>
            Actualiser
          </button>
        ) : null}
      </div>

      <div className="card" style={{ marginBottom: 16, maxWidth: 480 }}>
        <label className="small muted" style={{ display: "block", marginBottom: 6 }}>
          Patient au comptoir
        </label>
        <PatientSelectSearch
          value={patientId}
          onChange={onPatientChange}
          placeholder="NPI ou nom du patient…"
        />
      </div>

      {!patientId ? (
        <Empty text="Recherchez un patient pour afficher ses ordonnances actives." />
      ) : isLoading ? (
        <div className="skel" style={{ height: 140 }} />
      ) : isError ? (
        <div className="card">
          <p className="muted">
            {(error as any)?.data?.detail || (error as Error)?.message || "Chargement impossible."}
          </p>
          <button className="btn sm" style={{ marginTop: 10 }} type="button" onClick={() => refetch()}>
            Réessayer
          </button>
        </div>
      ) : items.length === 0 ? (
        <Empty
          text={`Aucune ordonnance active ou dispensée pour ${patientLabel || "ce patient"}.`}
        />
      ) : (
        <div className="grid" style={{ gap: 10 }}>
          {items.map((o: any) => (
            <div className="card" key={o.id}>
              <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                <div>
                  <strong>{o.patient_nom || patientLabel || `Patient #${o.patient}`}</strong>
                  {o.patient_npi ? (
                    <span className="small muted"> · NPI {o.patient_npi}</span>
                  ) : null}
                </div>
                <span className={`pill ${o.statut === "dispensee" ? "green" : "blue"}`}>
                  {o.statut_label || o.statut || "active"}
                </span>
              </div>
              <div className="small muted" style={{ marginTop: 6 }}>
                {o.date ? new Date(o.date).toLocaleDateString("fr-FR") : "—"}
                {o.medecin_nom ? ` · Dr ${o.medecin_nom}` : ""}
                {o.structure_nom ? ` · prescrit à ${o.structure_nom}` : ""}
              </div>
              <p style={{ marginTop: 10, fontSize: 14 }}>{medsResume(o.medicaments)}</p>
              {o.alertes_interactions?.length > 0 && (
                <div className="pill amber" style={{ marginTop: 10, display: "inline-flex" }}>
                  {o.alertes_interactions.join(" ")}
                </div>
              )}
              {o.statut === "active" ? (
                <button
                  className="btn emerald sm"
                  style={{ marginTop: 12 }}
                  type="button"
                  disabled={busyId === o.id || dispenseMut.isPending}
                  onClick={() => {
                    if (!window.confirm("Marquer cette ordonnance comme dispensée ?")) return;
                    dispenseMut.mutate(o.id);
                  }}
                >
                  {busyId === o.id ? "Dispense…" : "Marquer dispensée"}
                </button>
              ) : null}
              {o.statut === "dispensee" ? (
                <button
                  className="btn ghost sm"
                  style={{ marginTop: 12 }}
                  type="button"
                  disabled={busyId === o.id || annulerDispenseMut.isPending}
                  onClick={() => {
                    if (!window.confirm("Annuler la dispense ? L'ordonnance redeviendra active.")) return;
                    annulerDispenseMut.mutate(o.id);
                  }}
                >
                  {busyId === o.id ? "…" : "Annuler la dispense"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

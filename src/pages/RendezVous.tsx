import { useMemo, useState } from "react";
import { Calendar, Plus, X } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Empty } from "../components";
import { Avatar } from "../components/Avatar";
import { PatientSelectSearch } from "../components/PatientSelectSearch";
import { useAppStore } from "../store/appStore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

function defaultRdvLocal() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function RendezVous() {
  const { user } = useAuth();
  const setToast = useAppStore((s) => s.setToast);
  const qc = useQueryClient();
  const canWrite = ["medecin", "receptionniste", "admin"].includes(user?.role || "");
  const isReception = user?.role === "receptionniste";
  const isMedecin = user?.role === "medecin";

  const { data, isLoading } = useQuery({
    queryKey: ["appointments"],
    queryFn: () => api.appointments(),
  });
  const items = useMemo(() => {
    const raw = data?.results || data || [];
    return Array.isArray(raw) ? raw : [];
  }, [data]);

  const { data: medecinsRdv = [] } = useQuery({
    queryKey: ["rdv-medecins"],
    queryFn: () => api.listMedecinsRdv(),
    enabled: canWrite && (isReception || user?.role === "admin"),
  });
  const medecinsList = Array.isArray(medecinsRdv) ? medecinsRdv : [];

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    patient: "",
    debut: defaultRdvLocal(),
    motif: "Consultation",
    notes: "",
    professionnel: "",
    mode: "medecin" as "medecin" | "reception",
  });

  const createMut = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        patient: Number(form.patient),
        debut: form.debut ? new Date(form.debut).toISOString() : new Date().toISOString(),
        motif: form.motif,
        notes: form.notes,
      };
      if (isMedecin) body.professionnel = user?.id;
      else if ((isReception || user?.role === "admin") && form.mode === "medecin" && form.professionnel) {
        body.professionnel = Number(form.professionnel);
      }
      return api.createAppointment(body);
    },
    onSuccess: () => {
      setToast(
        isReception && form.mode === "medecin"
          ? "RDV envoyé au médecin pour confirmation"
          : "Rendez-vous créé"
      );
      setForm({
        patient: "",
        debut: defaultRdvLocal(),
        motif: "Consultation",
        notes: "",
        professionnel: "",
        mode: "medecin",
      });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e: any) => setToast(e?.data?.detail || e.message || "Échec création RDV"),
  });

  const confirmerMut = useMutation({
    mutationFn: (id: number) => api.confirmerAppointment(id),
    onSuccess: () => {
      setToast("RDV confirmé");
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e: any) => setToast(e?.data?.detail || e.message || "Confirmation impossible"),
  });

  const annulerMut = useMutation({
    mutationFn: (id: number) => api.updateAppointment(id, { statut: "annule" }),
    onSuccess: () => {
      setToast("RDV annulé");
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e: any) => setToast(e?.data?.detail || e.message || "Annulation impossible"),
  });

  const askAnnuler = (id: number, label = "Annuler ce rendez-vous ?") => {
    if (!window.confirm(label)) return;
    annulerMut.mutate(id);
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <header className="page-head" style={{ marginBottom: 0 }}>
          <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Calendar size={22} /> Agenda rendez-vous
          </h1>
          <p className="muted small">
            Réception : médecin (à confirmer) ou guichet sans médecin · Médecin : confirme ses RDV
          </p>
        </header>
        {canWrite ? (
          <button className="btn" type="button" onClick={() => setOpen(true)}>
            <Plus size={16} style={{ marginRight: 6 }} />
            Nouveau RDV
          </button>
        ) : (
          <p className="muted small">Lecture seule</p>
        )}
      </div>

      {isLoading ? (
        <div className="skel" style={{ height: 120 }} />
      ) : items.length === 0 ? (
        <Empty text="Aucun rendez-vous." />
      ) : (
        <div className="list-stack">
          {items.map((a: any) => {
            const pending = a.statut === "planifie" && a.professionnel;
            const mine =
              isMedecin && (a.professionnel === user?.id || a.professionnel_id === user?.id);
            return (
              <div className="list-item" key={a.id} style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <strong>{a.motif || "RDV"}</strong>
                    <span className={`pill ${pending ? "amber" : a.statut === "confirme" ? "green" : "blue"}`}>
                      {pending ? "À confirmer" : a.statut_label || a.statut}
                    </span>
                  </div>
                  <div className="small muted row" style={{ gap: 8, alignItems: "center", marginTop: 6 }}>
                    <Avatar src={a.patient_photo_url} name={a.patient_name} size={28} />
                    <span>
                      {a.debut ? new Date(a.debut).toLocaleString("fr-FR") : "—"} · {a.patient_name}
                      {a.patient_npi ? ` (${a.patient_npi})` : ""}
                      {a.professionnel_nom ? ` · Dr ${a.professionnel_nom}` : " · Réception"}
                      {a.structure_nom ? ` · ${a.structure_nom}` : ""}
                    </span>
                  </div>
                  {(mine || user?.role === "admin") && pending ? (
                    <div className="row" style={{ gap: 8, marginTop: 12 }}>
                      <button
                        className="btn sm"
                        type="button"
                        disabled={confirmerMut.isPending}
                        onClick={() => confirmerMut.mutate(a.id)}
                      >
                        Confirmer
                      </button>
                      <button
                        className="btn ghost sm"
                        type="button"
                        disabled={annulerMut.isPending}
                        onClick={() => askAnnuler(a.id, "Refuser ce rendez-vous ?")}
                      >
                        Refuser
                      </button>
                    </div>
                  ) : null}
                  {canWrite &&
                  !pending &&
                  a.statut !== "annule" &&
                  a.statut !== "termine" &&
                  a.statut !== "absent" ? (
                    <div className="row" style={{ gap: 8, marginTop: 12 }}>
                      <button
                        className="btn ghost sm"
                        type="button"
                        disabled={annulerMut.isPending}
                        onClick={() => askAnnuler(a.id)}
                      >
                        Annuler le RDV
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open ? (
        <div className="settings-modal-root" role="dialog" aria-modal="true" aria-label="Nouveau RDV">
          <button type="button" className="settings-modal-backdrop" aria-label="Fermer" onClick={() => setOpen(false)} />
          <div className="settings-modal-card" style={{ maxWidth: 520 }}>
            <div className="settings-modal-head">
              <span className="settings-modal-ico">
                <Calendar size={18} />
              </span>
              <h2>Nouveau rendez-vous</h2>
              <button type="button" className="settings-modal-close" onClick={() => setOpen(false)} aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            <div className="settings-modal-body">
              {(isReception || user?.role === "admin") && (
                <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={`btn sm ${form.mode === "medecin" ? "" : "ghost"}`}
                    onClick={() => setForm({ ...form, mode: "medecin" })}
                  >
                    Avec un médecin
                  </button>
                  <button
                    type="button"
                    className={`btn sm ${form.mode === "reception" ? "" : "ghost"}`}
                    onClick={() => setForm({ ...form, mode: "reception", professionnel: "" })}
                  >
                    RDV réception
                  </button>
                </div>
              )}
              <div className="grid" style={{ gap: 10 }}>
                <PatientSelectSearch
                  value={form.patient}
                  onChange={(patient) => setForm({ ...form, patient })}
                  placeholder="Patient…"
                />
                {(isReception || user?.role === "admin") && form.mode === "medecin" ? (
                  <div>
                    <label className="label">Médecin</label>
                    <select
                      className="select"
                      value={form.professionnel}
                      onChange={(e) => setForm({ ...form, professionnel: e.target.value })}
                    >
                      <option value="">Choisir…</option>
                      {medecinsList.map((m: any) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name || m.username}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <input
                  className="input"
                  type="datetime-local"
                  value={form.debut}
                  onChange={(e) => setForm({ ...form, debut: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="Motif"
                  value={form.motif}
                  onChange={(e) => setForm({ ...form, motif: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="Notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <div className="row" style={{ gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                <button className="btn ghost" type="button" onClick={() => setOpen(false)}>
                  Annuler
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={
                    !form.patient ||
                    !form.debut ||
                    createMut.isPending ||
                    ((isReception || user?.role === "admin") &&
                      form.mode === "medecin" &&
                      !form.professionnel)
                  }
                  onClick={() => createMut.mutate()}
                >
                  {createMut.isPending ? "…" : "Créer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

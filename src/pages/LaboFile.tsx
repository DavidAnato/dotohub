import { useMemo, useState } from "react";
import { FlaskConical, FileText, AlertTriangle, Plus, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { Empty } from "../components";
import { PatientSelectSearch } from "../components/PatientSelectSearch";
import { useAppStore } from "../store/appStore";

type Scope = "tous" | "mes" | "incomplets";

const STATUT_PILL: Record<string, { label: string; cls: string }> = {
  normal: { label: "Normal", cls: "green" },
  eleve: { label: "Élevé", cls: "amber" },
  critique: { label: "Critique", cls: "red" },
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM = {
  patient: "",
  type_examen: "",
  categorie: "analyses",
  date: todayISO(),
  statut: "normal",
  laboratoire: "",
  resultat_texte: "",
};

export default function LaboFile() {
  const setToast = useAppStore((s) => s.setToast);
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>("tous");
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ["labo-examens", scope],
    queryFn: () => {
      if (scope === "mes") return api.mesUploadsExamens();
      if (scope === "incomplets") return api.examensACompleter();
      return api.examensList();
    },
  });

  const items = useMemo(() => {
    const raw = data?.results || data || [];
    const list = Array.isArray(raw) ? raw : [];
    return [...list].sort((a: any, b: any) => {
      const crit = (x: any) => (x.statut === "critique" ? 0 : x.statut === "eleve" ? 1 : 2);
      const d = crit(a) - crit(b);
      if (d !== 0) return d;
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
  }, [data]);

  const critCount = items.filter((x: any) => x.statut === "critique").length;

  const openUpload = () => {
    setForm({ ...EMPTY_FORM, date: todayISO() });
    setFile(null);
    setShowUpload(true);
  };

  const closeUpload = () => setShowUpload(false);

  const createMut = useMutation({
    mutationFn: () =>
      api.createExamenMultipart(
        {
          patient: form.patient,
          type_examen: form.type_examen.trim(),
          categorie: form.categorie,
          date: form.date || todayISO(),
          statut: form.statut,
          laboratoire: form.laboratoire,
          resultat_texte: form.resultat_texte,
        },
        file
      ),
    onSuccess: () => {
      setToast("Examen enregistré");
      closeUpload();
      setForm({ ...EMPTY_FORM, date: todayISO() });
      setFile(null);
      qc.invalidateQueries({ queryKey: ["labo-examens"] });
    },
    onError: (e: any) => setToast(e?.data?.detail || e?.message || "Échec upload examen"),
  });

  const annulerMut = useMutation({
    mutationFn: (id: number) => api.annulerExamen(id),
    onSuccess: () => {
      setToast("Examen annulé");
      qc.invalidateQueries({ queryKey: ["labo-examens"] });
    },
    onError: (e: any) => setToast(e?.data?.detail || e?.message || "Échec"),
  });

  const confirmAnnuler = (id: number) => {
    if (!window.confirm("Annuler cet examen ? Il disparaîtra de la file.")) return;
    annulerMut.mutate(id);
  };

  return (
    <div className="page-enter">
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}
      >
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FlaskConical size={22} /> File laboratoire
          </h1>
          <p className="muted small">Suivi des résultats · upload via modal</p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {critCount > 0 && (
            <span className="pill red" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={14} />
              {critCount} critique{critCount > 1 ? "s" : ""}
            </span>
          )}
          <button className="btn" type="button" onClick={openUpload}>
            <Plus size={16} style={{ marginRight: 6 }} />
            Nouvel examen
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {(
          [
            ["tous", "Tous"],
            ["mes", "Mes uploads"],
            ["incomplets", "À compléter"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`btn sm ${scope === key ? "" : "ghost"}`}
            onClick={() => setScope(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="skel" style={{ height: 120 }} />
      ) : items.length === 0 ? (
        <Empty text="Aucun examen. Cliquez sur « Nouvel examen » pour en ajouter." />
      ) : (
        <div className="grid" style={{ gap: 10 }}>
          {items.map((x: any) => {
            const critique = x.statut === "critique";
            return (
              <div
                className="card"
                key={x.id}
                style={
                  critique
                    ? {
                        borderColor: "rgba(163, 45, 45, 0.45)",
                        background: "rgba(248, 234, 234, 0.55)",
                        boxShadow: "inset 3px 0 0 #A32D2D",
                      }
                    : undefined
                }
              >
                <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {critique && <AlertTriangle size={16} color="#A32D2D" />}
                    {x.type_examen}
                  </strong>
                  <span className={`pill ${(STATUT_PILL[x.statut] || STATUT_PILL.normal).cls}`}>
                    {x.statut_label || (STATUT_PILL[x.statut] || STATUT_PILL.normal).label}
                  </span>
                </div>
                <div className="small muted" style={{ marginTop: 6 }}>
                  {x.patient_nom || `Patient #${x.patient}`}
                  {x.patient_npi ? ` · NPI ${x.patient_npi}` : ""}
                  {" · "}
                  {x.categorie_label || x.categorie}
                  {x.laboratoire ? ` · ${x.laboratoire}` : ""}
                  {" · "}
                  {x.date ? new Date(x.date).toLocaleDateString("fr-FR") : "—"}
                </div>
                {x.resultat_texte ? (
                  <p style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{x.resultat_texte}</p>
                ) : (
                  <p className="small muted" style={{ marginTop: 8 }}>
                    Résultat texte manquant
                  </p>
                )}
                {x.fichier_url ? (
                  <a
                    href={x.fichier_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn ghost sm"
                    style={{ display: "inline-flex", marginTop: 10, alignItems: "center", gap: 6 }}
                  >
                    <FileText size={14} />
                    Ouvrir le fichier
                  </a>
                ) : (
                  <span className="pill amber" style={{ marginTop: 10, display: "inline-flex" }}>
                    Sans fichier
                  </span>
                )}
                {!x.annule ? (
                  <div className="row" style={{ marginTop: 10 }}>
                    <button
                      className="btn ghost sm"
                      type="button"
                      disabled={annulerMut.isPending}
                      onClick={() => confirmAnnuler(x.id)}
                    >
                      Annuler l&apos;examen
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {showUpload ? (
        <div
          className="settings-modal-root"
          role="dialog"
          aria-modal="true"
          aria-label="Nouvel examen"
        >
          <button
            type="button"
            className="settings-modal-backdrop"
            aria-label="Fermer"
            onClick={closeUpload}
          />
          <div className="settings-modal-card" style={{ maxWidth: 560 }}>
            <div className="settings-modal-head">
              <span className="settings-modal-ico">
                <FlaskConical size={18} />
              </span>
              <h2>Nouvel examen</h2>
              <button
                type="button"
                className="settings-modal-close"
                onClick={closeUpload}
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="settings-modal-body">
              <div className="grid cols-2" style={{ gap: 10 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="label">Patient</label>
                  <p className="muted small" style={{ marginBottom: 6 }}>
                    Recherche par nom ou NPI — pas d&apos;ID technique
                  </p>
                  <PatientSelectSearch
                    value={form.patient}
                    onChange={(patient) => setForm({ ...form, patient })}
                    placeholder="Nom ou NPI du patient…"
                  />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="label">Type d&apos;examen</label>
                  <input
                    className="input"
                    placeholder="NFS, CRP, radio…"
                    value={form.type_examen}
                    onChange={(e) => setForm({ ...form, type_examen: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Catégorie</label>
                  <select
                    className="input"
                    value={form.categorie}
                    onChange={(e) => setForm({ ...form, categorie: e.target.value })}
                  >
                    <option value="analyses">Analyses</option>
                    <option value="imagerie">Imagerie</option>
                    <option value="autres">Autres</option>
                  </select>
                </div>
                <div>
                  <label className="label">Date</label>
                  <input
                    className="input"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Statut</label>
                  <select
                    className="input"
                    value={form.statut}
                    onChange={(e) => setForm({ ...form, statut: e.target.value })}
                  >
                    <option value="normal">Normal</option>
                    <option value="eleve">Élevé</option>
                    <option value="critique">Critique</option>
                  </select>
                </div>
                <div>
                  <label className="label">Laboratoire</label>
                  <input
                    className="input"
                    placeholder="Optionnel"
                    value={form.laboratoire}
                    onChange={(e) => setForm({ ...form, laboratoire: e.target.value })}
                  />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="label">Résultat texte</label>
                  <textarea
                    className="input"
                    placeholder="Saisir le résultat…"
                    rows={4}
                    value={form.resultat_texte}
                    onChange={(e) => setForm({ ...form, resultat_texte: e.target.value })}
                  />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="label">Fichier</label>
                  <input
                    className="input"
                    type="file"
                    accept=".pdf,image/*,.doc,.docx"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  {file ? (
                    <p className="small muted" style={{ marginTop: 6 }}>
                      {file.name}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="row" style={{ gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                <button className="btn ghost" type="button" onClick={closeUpload}>
                  Annuler
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={!form.patient || !form.type_examen.trim() || createMut.isPending}
                  onClick={() => createMut.mutate()}
                >
                  {createMut.isPending ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

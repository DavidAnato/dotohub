import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Calendar, FileText, FlaskConical, Plus, TriangleAlert, X } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Empty, StatusBadge, UrgenceHeader } from "../components";
import { ConsentWaiting } from "../components/ConsentWaiting";
import { Avatar } from "../components/Avatar";
import { useAppStore } from "../store/appStore";
import {
  useConsultations,
  useCreateConsultation,
  useAnnulerConsultation,
  useCreateOrdonnance,
  useDispenser,
  useAnnulerOrdonnance,
  useAnnulerDispense,
  useAnnulerExamen,
  useExamens,
  useOrdonnances,
  usePatient,
  useVerifyAnip,
  useConstantes,
  useCreateConstante,
} from "../queries/hooks";
import { useQuery } from "@tanstack/react-query";

type TabKey = "historique" | "ordonnances" | "examens" | "constantes" | "assurance";

// Onglets visibles selon le rôle (RBAC, CDC §3.5)
const ROLE_TABS: Record<string, TabKey[]> = {
  medecin: ["historique", "ordonnances", "examens", "constantes", "assurance"],
  infirmier: ["historique", "constantes", "examens"],
  pharmacien: ["ordonnances"],
  laborantin: ["examens"],
  ambulancier: ["constantes"],
  receptionniste: ["assurance"],
  admin: ["historique", "ordonnances", "examens", "constantes", "assurance"],
};

const RDV_WRITE_ROLES = new Set(["medecin", "receptionniste", "admin"]);
const CLINICAL_WRITE_ROLES = new Set(["medecin", "admin"]); // consult + ordonnances
const CONSTANTES_WRITE_ROLES = new Set(["infirmier", "medecin", "ambulancier", "admin"]);

function defaultRdvLocal() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Patient() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { data: patient, isLoading, refetch } = usePatient(id);
  const verifyAnip = useVerifyAnip(id!);
  const setToast = useAppStore((s) => s.setToast);
  const [tab, setTab] = useState<TabKey>("historique");
  const [requesting, setRequesting] = useState(false);
  const [showRdv, setShowRdv] = useState(false);
  const [rdvBusy, setRdvBusy] = useState(false);
  const [rdvForm, setRdvForm] = useState({
    debut: defaultRdvLocal(),
    motif: "Consultation",
    notes: "",
    professionnel: "",
    mode: "medecin" as "medecin" | "reception",
  });
  const tabs = ROLE_TABS[user?.role || "medecin"] || ["historique"];
  const canWriteRdv = RDV_WRITE_ROLES.has(user?.role || "");
  const isReception = user?.role === "receptionniste";

  const { data: medecinsRdv = [] } = useQuery({
    queryKey: ["rdv-medecins"],
    queryFn: () => api.listMedecinsRdv(),
    enabled: canWriteRdv && (isReception || user?.role === "admin"),
  });
  const medecinsList = Array.isArray(medecinsRdv) ? medecinsRdv : [];

  useEffect(() => {
    setTab(tabs[0]);
    setShowRdv(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.role]);

  const needsAccess = !!patient?.consent?.required && !patient?.consent?.granted;
  const pending = !!patient?.consent?.pending;
  const canRequestFull =
    needsAccess &&
    user?.role !== "admin" &&
    patient?.consent?.can_request !== false &&
    ["medecin", "infirmier", "pharmacien", "laborantin", "receptionniste"].includes(
      user?.role || ""
    );

  // Poll uniquement si une demande est déjà en cours.
  useEffect(() => {
    if (!needsAccess || !pending) return;
    const t = window.setInterval(() => {
      void refetch();
    }, 4000);
    return () => window.clearInterval(t);
  }, [needsAccess, pending, refetch]);

  const requestFullAccess = async () => {
    if (!id) return;
    setRequesting(true);
    try {
      await api.requestAccess(Number(id));
      setToast("Demande envoyée au patient.");
      await refetch();
    } catch (e: any) {
      setToast(e?.data?.detail || e.message || "Impossible de demander l'accès.");
    } finally {
      setRequesting(false);
    }
  };

  const createRdv = async () => {
    if (!patient?.id) return;
    if (!rdvForm.debut) {
      setToast("Indiquez la date et l'heure du RDV.");
      return;
    }
    if (isReception && rdvForm.mode === "medecin" && !rdvForm.professionnel) {
      setToast("Choisissez un médecin, ou basculez sur « RDV réception ».");
      return;
    }
    setRdvBusy(true);
    try {
      const body: Record<string, unknown> = {
        patient: patient.id,
        debut: new Date(rdvForm.debut).toISOString(),
        motif: rdvForm.motif || "Consultation",
        notes: rdvForm.notes,
      };
      if (user?.role === "medecin") {
        body.professionnel = user.id;
      } else if (isReception || user?.role === "admin") {
        if (rdvForm.mode === "medecin" && rdvForm.professionnel) {
          body.professionnel = Number(rdvForm.professionnel);
        }
      }
      await api.createAppointment(body);
      setToast(
        isReception && rdvForm.mode === "medecin"
          ? "RDV envoyé au médecin pour confirmation"
          : "Rendez-vous créé"
      );
      setShowRdv(false);
      setRdvForm({
        debut: defaultRdvLocal(),
        motif: "Consultation",
        notes: "",
        professionnel: "",
        mode: "medecin",
      });
      nav("/rdv");
    } catch (e: any) {
      setToast(e?.data?.detail || e.message || "Échec création RDV");
    } finally {
      setRdvBusy(false);
    }
  };

  if (isLoading || !patient) {
    return (
      <div className="page-enter">
        <div className="skel" style={{ height: 28, width: 220, marginBottom: 12 }} />
        <div className="skel" style={{ height: 100, width: "100%", marginBottom: 16 }} />
        <div className="skel" style={{ height: 200, width: "100%" }} />
      </div>
    );
  }

  const urg = patient.urgence;
  const emergency = !!patient.consent?.emergency;
  const hasFullAccess = !needsAccess;

  const header = (
    <div className="row" style={{ justifyContent: "space-between", marginBottom: 16, gap: 12 }}>
      <div className="row" style={{ gap: 14, alignItems: "center" }}>
        <Avatar src={patient.photo_url} name={patient.full_name} size={56} />
        <div>
          <h1>{patient.full_name || "Patient"}</h1>
          <div className="muted mono">
            {patient.npi}
            {patient.date_naissance ? ` · Né(e) le ${patient.date_naissance}` : ""}
            {patient.sexe ? ` · ${patient.sexe}` : ""}
            {patient.groupe_sanguin ? ` · Groupe ${patient.groupe_sanguin}` : ""}
            {patient.electrophorese || patient.urgence?.electrophorese
              ? ` · Électro ${patient.electrophorese || patient.urgence?.electrophorese}`
              : ""}
          </div>
        </div>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {canWriteRdv ? (
          <button className="btn ghost sm" type="button" onClick={() => setShowRdv(true)}>
            <Calendar size={14} style={{ marginRight: 6 }} />
            Créer un RDV
          </button>
        ) : null}
        {hasFullAccess && !patient.npi_verifie_anip ? (
          <button
            className="btn ghost sm"
            disabled={verifyAnip.isPending}
            onClick={() => verifyAnip.mutate()}
          >
            Vérifier ANIP
          </button>
        ) : null}
      </div>
    </div>
  );

  const rdvModal = showRdv ? (
    <div className="settings-modal-root" role="dialog" aria-modal="true" aria-label="Créer un RDV">
      <button type="button" className="settings-modal-backdrop" aria-label="Fermer" onClick={() => setShowRdv(false)} />
      <div className="settings-modal-card" style={{ maxWidth: 520 }}>
        <div className="settings-modal-head">
          <span className="settings-modal-ico">
            <Calendar size={18} />
          </span>
          <h2>Planifier un RDV</h2>
          <button type="button" className="settings-modal-close" onClick={() => setShowRdv(false)} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="settings-modal-body">
          <p className="muted small" style={{ marginBottom: 12 }}>
            Pour <strong>{patient.full_name}</strong>
          </p>
          {(isReception || user?.role === "admin") && (
            <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                className={`btn sm ${rdvForm.mode === "medecin" ? "" : "ghost"}`}
                onClick={() => setRdvForm({ ...rdvForm, mode: "medecin" })}
              >
                Avec un médecin
              </button>
              <button
                type="button"
                className={`btn sm ${rdvForm.mode === "reception" ? "" : "ghost"}`}
                onClick={() => setRdvForm({ ...rdvForm, mode: "reception", professionnel: "" })}
              >
                RDV réception (sans médecin)
              </button>
            </div>
          )}
          <div className="grid" style={{ gap: 10 }}>
            {(isReception || user?.role === "admin") && rdvForm.mode === "medecin" ? (
              <div>
                <label className="label">Médecin</label>
                <select
                  className="select"
                  value={rdvForm.professionnel}
                  onChange={(e) => setRdvForm({ ...rdvForm, professionnel: e.target.value })}
                >
                  <option value="">Choisir un médecin…</option>
                  {medecinsList.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name || m.username}
                    </option>
                  ))}
                </select>
                <p className="muted small" style={{ marginTop: 6 }}>
                  Le médecin sera notifié et devra confirmer le créneau.
                </p>
              </div>
            ) : null}
            <div>
              <label className="label">Date et heure</label>
              <input
                className="input"
                type="datetime-local"
                value={rdvForm.debut}
                onChange={(e) => setRdvForm({ ...rdvForm, debut: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Motif</label>
              <input
                className="input"
                placeholder="Consultation"
                value={rdvForm.motif}
                onChange={(e) => setRdvForm({ ...rdvForm, motif: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Notes</label>
              <input
                className="input"
                placeholder="Optionnel"
                value={rdvForm.notes}
                onChange={(e) => setRdvForm({ ...rdvForm, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
            <button className="btn ghost" type="button" onClick={() => setShowRdv(false)}>
              Annuler
            </button>
            <button className="btn" type="button" disabled={rdvBusy} onClick={() => void createRdv()}>
              {rdvBusy ? "…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;


  // Demande déjà envoyée → écran d'attente.
  if (needsAccess && pending) {
    return (
      <div>
        {header}
        {rdvModal}
        <ConsentWaiting
          patientName={patient.full_name}
          role={user?.role}
          onCancel={() => {
            const accessId = patient?.consent?.access_request_id;
            void (async () => {
              if (accessId) {
                try {
                  await api.cancelAccessRequest(accessId);
                  setToast("Demande d'accès annulée");
                } catch (e: any) {
                  setToast(e?.data?.detail || e?.message || "Annulation impossible");
                  return;
                }
              }
              nav("/recherche");
            })();
          }}
        />
        {requesting ? (
          <p className="muted small" style={{ textAlign: "center" }}>
            Envoi de la demande…
          </p>
        ) : null}
      </div>
    );
  }

  // Infos de base uniquement — pas de demande auto.
  if (needsAccess && !pending) {
    return (
      <div>
        {header}
        {rdvModal}
        <UrgenceHeader u={urg} />
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ marginBottom: 12 }}>
            {patient.consent?.message ||
              "Infos de base uniquement. Demandez l'accès complet pour consulter le dossier."}
          </p>
          {canRequestFull ? (
            <button className="btn" disabled={requesting} onClick={() => void requestFullAccess()}>
              {requesting ? "Envoi…" : "Demander l'accès complet"}
            </button>
          ) : (
            <p className="muted small">
              Votre rôle n&apos;autorise pas la demande d&apos;accès au dossier complet.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {emergency ? <ConsentWaiting emergency /> : null}
      {header}
      {rdvModal}
      <UrgenceHeader u={urg} />

      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t}
            className={"tab" + (tab === t ? " active" : "")}
            onClick={() => setTab(t)}
          >
            {labels[t]}
          </button>
        ))}
      </div>

      {tab === "historique" && <Historique patientId={patient.id} />}
      {tab === "ordonnances" && (
        <Ordonnances patientId={patient.id} patientName={patient.full_name} />
      )}
      {tab === "examens" && <Examens patientId={patient.id} patientName={patient.full_name} />}
      {tab === "constantes" && <Constantes patientId={patient.id} />}
      {tab === "assurance" && (
        <Assurance
          data={patient.assurance}
          patientId={patient.id}
          canWrite={!!patient.access?.write?.assurance}
          onSaved={() => void refetch()}
        />
      )}
    </div>
  );
}

const labels: Record<TabKey, string> = {
  historique: "Historique",
  ordonnances: "Ordonnances",
  examens: "Examens",
  constantes: "Constantes",
  assurance: "Assurance",
};

function Historique({ patientId }: { patientId: number }) {
  const { user } = useAuth();
  const setToast = useAppStore((s) => s.setToast);
  const { data: raw } = useConsultations(patientId);
  const items = (raw?.results || raw || []) as any[];
  const createMut = useCreateConsultation(patientId);
  const annulerMut = useAnnulerConsultation(patientId);
  const [form, setForm] = useState({ date: "", type: "consultation", diagnostic: "", notes: "" });

  const canWrite = CLINICAL_WRITE_ROLES.has(user?.role || "");

  const create = () => {
    createMut.mutate(
      { patient: patientId, ...form, date: form.date || new Date().toISOString() },
      {
        onSuccess: () => setForm({ date: "", type: "consultation", diagnostic: "", notes: "" }),
      }
    );
  };

  const confirmAnnuler = (id: number) => {
    if (!window.confirm("Annuler cette consultation ? Elle disparaîtra de l'historique.")) return;
    annulerMut.mutate(id, {
      onSuccess: () => setToast("Consultation annulée"),
      onError: (e: any) => setToast(e?.data?.detail || e?.message || "Échec"),
    });
  };

  return (
    <div className="grid" style={{ gap: 12 }}>
      {items.length === 0 && <Empty text="Aucune consultation enregistrée." />}
      {items.map((c) => (
        <div className="card" key={c.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{c.diagnostic || "Consultation"}</strong>
            <span className="pill blue">{c.type_label}</span>
          </div>
          <div className="small muted">
            {new Date(c.date).toLocaleDateString("fr-FR")} · {c.structure_nom} · {c.medecin_nom}
          </div>
          {c.notes && <p style={{ marginTop: 8 }}>{c.notes}</p>}
          {canWrite && !c.annule && (
            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="btn ghost sm"
                type="button"
                disabled={annulerMut.isPending}
                onClick={() => confirmAnnuler(c.id)}
              >
                Annuler la consultation
              </button>
            </div>
          )}
        </div>
      ))}
      {canWrite && (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Nouvelle consultation</h3>
          <div className="grid cols-2">
            <input className="input" placeholder="Diagnostic" value={form.diagnostic}
              onChange={(e) => setForm({ ...form, diagnostic: e.target.value })} />
            <select className="select" value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="consultation">Consultation</option>
              <option value="hospitalisation">Hospitalisation</option>
              <option value="chirurgie">Chirurgie</option>
              <option value="urgence">Urgence</option>
            </select>
          </div>
          <textarea className="textarea" style={{ margin: "12px 0" }} placeholder="Notes"
            value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button className="btn" onClick={create} disabled={!form.diagnostic}>
            Enregistrer
          </button>
        </div>
      )}
    </div>
  );
}

function Ordonnances({ patientId, patientName }: { patientId: number; patientName?: string }) {
  const { user } = useAuth();
  const setToast = useAppStore((s) => s.setToast);
  const { data: raw } = useOrdonnances(patientId);
  const items = (raw?.results || raw || []) as any[];
  const createMut = useCreateOrdonnance(patientId);
  const dispenseMut = useDispenser(patientId);
  const annulerMut = useAnnulerOrdonnance(patientId);
  const annulerDispenseMut = useAnnulerDispense(patientId);
  const [open, setOpen] = useState(false);
  const [meds, setMeds] = useState([{ nom: "", dosage: "", frequence: "", duree_jours: 30 }]);

  const canWrite = CLINICAL_WRITE_ROLES.has(user?.role || "");

  const create = () => {
    createMut.mutate(
      {
        patient: patientId,
        date: new Date().toISOString().slice(0, 10),
        medicaments: meds.filter((m) => m.nom),
      },
      {
        onSuccess: () => {
          setMeds([{ nom: "", dosage: "", frequence: "", duree_jours: 30 }]);
          setOpen(false);
          setToast("Ordonnance créée");
        },
        onError: (e: any) => setToast(e?.data?.detail || e?.message || "Échec"),
      }
    );
  };

  const confirmDispense = (id: number) => {
    if (!window.confirm("Marquer cette ordonnance comme dispensée ?")) return;
    dispenseMut.mutate(id, {
      onSuccess: () => setToast("Ordonnance dispensée"),
      onError: (e: any) => setToast(e?.data?.detail || e?.message || "Échec"),
    });
  };

  const confirmAnnuler = (id: number) => {
    if (!window.confirm("Annuler cette ordonnance ? Elle ne pourra plus être dispensée.")) return;
    annulerMut.mutate(id, {
      onSuccess: () => setToast("Ordonnance annulée"),
      onError: (e: any) => setToast(e?.data?.detail || e?.message || "Échec"),
    });
  };

  const confirmAnnulerDispense = (id: number) => {
    if (!window.confirm("Annuler la dispense ? L'ordonnance redeviendra active.")) return;
    annulerDispenseMut.mutate(id, {
      onSuccess: () => setToast("Dispense annulée"),
      onError: (e: any) => setToast(e?.data?.detail || e?.message || "Échec"),
    });
  };

  return (
    <div className="grid" style={{ gap: 12 }}>
      {canWrite ? (
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" type="button" onClick={() => setOpen(true)}>
            <Plus size={16} style={{ marginRight: 6 }} />
            Nouvelle ordonnance
          </button>
        </div>
      ) : null}
      {items.length === 0 && <Empty text="Aucune ordonnance." />}
      {items.map((o) => (
        <div className="card" key={o.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>Ordonnance du {new Date(o.date).toLocaleDateString("fr-FR")}</strong>
            <StatusBadge status={o.statut} />
          </div>
          <div className="small muted">{o.medecin_nom}</div>
          <ul style={{ margin: "10px 0 0 18px" }}>
            {o.medicaments.map((m: any) => (
              <li key={m.id}>
                <strong>{m.nom}</strong> — {m.dosage} · {m.frequence}
                {m.duree_jours ? ` · ${m.duree_jours}j` : ""}
              </li>
            ))}
          </ul>
          {o.alertes_interactions?.length > 0 && (
            <div className="pill amber" style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <TriangleAlert size={13} strokeWidth={2.5} aria-hidden />
              {o.alertes_interactions.join(" ")}
            </div>
          )}
          <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {user?.role === "pharmacien" && o.statut === "active" && (
              <button
                className="btn emerald sm"
                type="button"
                disabled={dispenseMut.isPending}
                onClick={() => confirmDispense(o.id)}
              >
                Marquer dispensée
              </button>
            )}
            {user?.role === "pharmacien" && o.statut === "dispensee" && (
              <button
                className="btn ghost sm"
                type="button"
                disabled={annulerDispenseMut.isPending}
                onClick={() => confirmAnnulerDispense(o.id)}
              >
                Annuler la dispense
              </button>
            )}
            {canWrite && o.statut === "active" && (
              <button
                className="btn ghost sm"
                type="button"
                disabled={annulerMut.isPending}
                onClick={() => confirmAnnuler(o.id)}
              >
                Annuler l&apos;ordonnance
              </button>
            )}
          </div>
        </div>
      ))}

      {open ? (
        <div className="settings-modal-root" role="dialog" aria-modal="true" aria-label="Nouvelle ordonnance">
          <button type="button" className="settings-modal-backdrop" aria-label="Fermer" onClick={() => setOpen(false)} />
          <div className="settings-modal-card" style={{ maxWidth: 640 }}>
            <div className="settings-modal-head">
              <span className="settings-modal-ico">
                <Plus size={18} />
              </span>
              <h2>Nouvelle ordonnance</h2>
              <button type="button" className="settings-modal-close" onClick={() => setOpen(false)} aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            <div className="settings-modal-body">
              <p className="muted small" style={{ marginBottom: 12 }}>
                Pour <strong>{patientName || "ce patient"}</strong> — pas besoin de resaisir l&apos;identité.
              </p>
              {meds.map((m, i) => (
                <div className="grid cols-4" key={i} style={{ marginBottom: 8 }}>
                  <input
                    className="input"
                    placeholder="Médicament"
                    value={m.nom}
                    onChange={(e) => setMeds(meds.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))}
                  />
                  <input
                    className="input"
                    placeholder="Dosage"
                    value={m.dosage}
                    onChange={(e) => setMeds(meds.map((x, j) => (j === i ? { ...x, dosage: e.target.value } : x)))}
                  />
                  <input
                    className="input"
                    placeholder="Fréquence"
                    value={m.frequence}
                    onChange={(e) => setMeds(meds.map((x, j) => (j === i ? { ...x, frequence: e.target.value } : x)))}
                  />
                  <input
                    className="input"
                    type="number"
                    placeholder="Jours"
                    value={m.duree_jours}
                    onChange={(e) =>
                      setMeds(meds.map((x, j) => (j === i ? { ...x, duree_jours: +e.target.value } : x)))
                    }
                  />
                </div>
              ))}
              <div className="row" style={{ gap: 8, marginTop: 8, justifyContent: "space-between" }}>
                <button
                  className="btn ghost sm"
                  type="button"
                  onClick={() => setMeds([...meds, { nom: "", dosage: "", frequence: "", duree_jours: 30 }])}
                >
                  + Médicament
                </button>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn ghost" type="button" onClick={() => setOpen(false)}>
                    Annuler
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={create}
                    disabled={!meds.some((m) => m.nom) || createMut.isPending}
                  >
                    {createMut.isPending ? "…" : "Créer"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Examens({ patientId, patientName }: { patientId: number; patientName?: string }) {
  const { user } = useAuth();
  const setToast = useAppStore((s) => s.setToast);
  const { data: raw, refetch } = useExamens(patientId);
  const items = (raw?.results || raw || []) as any[];
  const annulerMut = useAnnulerExamen(patientId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    type_examen: "",
    categorie: "analyses",
    statut: "normal",
    laboratoire: "",
    resultat_texte: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const canUpload = user?.role === "laborantin" || user?.role === "admin";

  const confirmAnnuler = (id: number) => {
    if (!window.confirm("Annuler cet examen ? Il disparaîtra de la liste.")) return;
    annulerMut.mutate(id, {
      onSuccess: () => {
        setToast("Examen annulé");
        refetch();
      },
      onError: (e: any) => setToast(e?.data?.detail || e?.message || "Échec"),
    });
  };

  const create = async () => {
    setBusy(true);
    try {
      await api.createExamenMultipart(
        {
          patient: String(patientId),
          date: new Date().toISOString().slice(0, 10),
          type_examen: form.type_examen,
          categorie: form.categorie,
          statut: form.statut,
          laboratoire: form.laboratoire,
          resultat_texte: form.resultat_texte,
        },
        file
      );
      setForm({
        type_examen: "",
        categorie: "analyses",
        statut: "normal",
        laboratoire: "",
        resultat_texte: "",
      });
      setFile(null);
      setOpen(false);
      setToast("Examen enregistré");
      refetch();
    } catch (e: any) {
      setToast(e?.data?.detail || "Échec de l'upload.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid" style={{ gap: 12 }}>
      {canUpload ? (
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" type="button" onClick={() => setOpen(true)}>
            <FlaskConical size={16} style={{ marginRight: 6 }} />
            Nouvel examen
          </button>
        </div>
      ) : null}
      {items.length === 0 && <Empty text="Aucun résultat d'examen." />}
      {items.map((x) => (
        <div className="card" key={x.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{x.type_examen}</strong>
            <StatusBadge status={x.statut} />
          </div>
          <div className="small muted">
            {x.categorie_label} · {x.laboratoire} · {new Date(x.date).toLocaleDateString("fr-FR")}
          </div>
          {x.resultat_texte && <p style={{ marginTop: 8 }}>{x.resultat_texte}</p>}
          {x.fichier_url && (
            <a
              href={x.fichier_url}
              target="_blank"
              rel="noreferrer"
              className="btn ghost sm"
              style={{ display: "inline-flex", marginTop: 10 }}
            >
              <FileText size={14} strokeWidth={2} aria-hidden />
              Ouvrir / télécharger le PDF
            </a>
          )}
          {canUpload && (
            <div style={{ marginTop: 10 }}>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) api.uploadExamenFile(x.id, f).then(() => refetch());
                }}
              />
            </div>
          )}
          {canUpload && !x.annule && (
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
          )}
        </div>
      ))}

      {open ? (
        <div className="settings-modal-root" role="dialog" aria-modal="true" aria-label="Nouvel examen">
          <button type="button" className="settings-modal-backdrop" aria-label="Fermer" onClick={() => setOpen(false)} />
          <div className="settings-modal-card" style={{ maxWidth: 560 }}>
            <div className="settings-modal-head">
              <span className="settings-modal-ico">
                <FlaskConical size={18} />
              </span>
              <h2>Nouvel examen</h2>
              <button type="button" className="settings-modal-close" onClick={() => setOpen(false)} aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            <div className="settings-modal-body">
              <p className="muted small" style={{ marginBottom: 12 }}>
                Pour <strong>{patientName || "ce patient"}</strong> — identité déjà connue.
              </p>
              <div className="grid cols-2" style={{ gap: 10 }}>
                <input
                  className="input"
                  placeholder="Type d'examen (NFS, ECG…)"
                  value={form.type_examen}
                  onChange={(e) => setForm({ ...form, type_examen: e.target.value })}
                  style={{ gridColumn: "1 / -1" }}
                />
                <select
                  className="select"
                  value={form.categorie}
                  onChange={(e) => setForm({ ...form, categorie: e.target.value })}
                >
                  <option value="analyses">Analyses</option>
                  <option value="imagerie">Imagerie</option>
                  <option value="autres">Autres</option>
                </select>
                <select
                  className="select"
                  value={form.statut}
                  onChange={(e) => setForm({ ...form, statut: e.target.value })}
                >
                  <option value="normal">Normal</option>
                  <option value="eleve">Élevé</option>
                  <option value="critique">Critique</option>
                </select>
                <input
                  className="input"
                  placeholder="Laboratoire"
                  value={form.laboratoire}
                  onChange={(e) => setForm({ ...form, laboratoire: e.target.value })}
                  style={{ gridColumn: "1 / -1" }}
                />
                <textarea
                  className="textarea"
                  placeholder="Résultat / commentaire"
                  value={form.resultat_texte}
                  onChange={(e) => setForm({ ...form, resultat_texte: e.target.value })}
                  style={{ gridColumn: "1 / -1" }}
                />
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="label">Fichier PDF / image</label>
                  <input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </div>
              </div>
              <div className="row" style={{ gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                <button className="btn ghost" type="button" onClick={() => setOpen(false)}>
                  Annuler
                </button>
                <button className="btn" type="button" onClick={create} disabled={!form.type_examen || busy}>
                  {busy ? "Envoi…" : "Enregistrer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Constantes({ patientId }: { patientId: number }) {
  const { user } = useAuth();
  const { data: raw } = useConstantes(patientId);
  const items = (raw?.results || raw || []) as any[];
  const createMut = useCreateConstante(patientId);
  const [form, setForm] = useState({ tension_systolique: "", tension_diastolique: "", temperature: "", poids: "", glycemie: "" });

  const create = () => {
    const body: any = { patient: patientId };
    Object.entries(form).forEach(([k, v]) => v !== "" && (body[k] = v));
    createMut.mutate(body, {
      onSuccess: () =>
        setForm({ tension_systolique: "", tension_diastolique: "", temperature: "", poids: "", glycemie: "" }),
    });
  };

  return (
    <div className="grid" style={{ gap: 12 }}>
      {items.length === 0 && <Empty text="Aucune constante saisie." />}
      {items.length > 0 && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Tension</th>
                <th>Temp.</th>
                <th>Poids</th>
                <th>Glycémie</th>
                <th>Infirmier</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>{new Date(c.date).toLocaleDateString("fr-FR")}</td>
                  <td>
                    {c.tension_systolique && c.tension_diastolique
                      ? `${c.tension_systolique}/${c.tension_diastolique}`
                      : "—"}
                  </td>
                  <td>{c.temperature ? `${c.temperature}°C` : "—"}</td>
                  <td>{c.poids ? `${c.poids} kg` : "—"}</td>
                  <td>{c.glycemie ? `${c.glycemie}` : "—"}</td>
                  <td className="small muted">{c.infirmier_nom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {CONSTANTES_WRITE_ROLES.has(user?.role || "") && (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>
            {user?.role === "ambulancier" ? "Notes / constantes d'urgence" : "Saisie des constantes vitales"}
          </h3>
          <div className="grid cols-3">
            <div>
              <label className="label">Tension (sys/dia)</label>
              <div className="row">
                <input className="input" type="number" placeholder="120" value={form.tension_systolique}
                  onChange={(e) => setForm({ ...form, tension_systolique: e.target.value })} />
                <input className="input" type="number" placeholder="80" value={form.tension_diastolique}
                  onChange={(e) => setForm({ ...form, tension_diastolique: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">Température</label>
              <input className="input" type="number" step="0.1" placeholder="37.0" value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: e.target.value })} />
            </div>
            <div>
              <label className="label">Poids (kg)</label>
              <input className="input" type="number" step="0.1" placeholder="70" value={form.poids}
                onChange={(e) => setForm({ ...form, poids: e.target.value })} />
            </div>
            <div>
              <label className="label">Glycémie</label>
              <input className="input" type="number" step="0.01" placeholder="6.5" value={form.glycemie}
                onChange={(e) => setForm({ ...form, glycemie: e.target.value })} />
            </div>
          </div>
          <button className="btn" style={{ marginTop: 12 }} onClick={create}>
            Enregistrer les constantes
          </button>
        </div>
      )}
    </div>
  );
}

function Assurance({
  data,
  patientId,
  canWrite,
  onSaved,
}: {
  data: any;
  patientId: number;
  canWrite?: boolean;
  onSaved?: () => void;
}) {
  const setToast = useAppStore((s) => s.setToast);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    assureur: data?.assureur || "",
    num_police: data?.num_police || "",
    droits_valides: data?.droits_valides ?? true,
  });

  useEffect(() => {
    setForm({
      assureur: data?.assureur || "",
      num_police: data?.num_police || "",
      droits_valides: data?.droits_valides ?? true,
    });
    setEditing(false);
  }, [data?.assureur, data?.num_police, data?.droits_valides, data?.id]);

  const save = async () => {
    setBusy(true);
    try {
      await api.updateAssurance(patientId, {
        assureur: form.assureur.trim(),
        num_police: form.num_police.trim(),
        droits_valides: form.droits_valides,
      });
      setToast("Assurance mise à jour.");
      setEditing(false);
      onSaved?.();
    } catch (e: any) {
      setToast(e?.data?.detail || e.message || "Échec mise à jour assurance.");
    } finally {
      setBusy(false);
    }
  };

  if (!data && !canWrite) return <Empty text="Aucune assurance enregistrée." />;

  if (canWrite && (editing || !data)) {
    return (
      <div className="card">
        <h3 style={{ marginBottom: 12 }}>{data ? "Modifier l'assurance" : "Enregistrer l'assurance"}</h3>
        <div className="grid cols-2">
          <div>
            <label className="label">Assureur</label>
            <input
              className="input"
              placeholder="Ex. NSIA, GSC…"
              value={form.assureur}
              onChange={(e) => setForm({ ...form, assureur: e.target.value })}
            />
          </div>
          <div>
            <label className="label">N° de police</label>
            <input
              className="input mono"
              placeholder="Police"
              value={form.num_police}
              onChange={(e) => setForm({ ...form, num_police: e.target.value })}
            />
          </div>
          <label className="row" style={{ gap: 8, alignItems: "center", gridColumn: "1 / -1" }}>
            <input
              type="checkbox"
              checked={form.droits_valides}
              onChange={(e) => setForm({ ...form, droits_valides: e.target.checked })}
            />
            <span>Droits valides</span>
          </label>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <button className="btn" disabled={busy || !form.assureur.trim()} onClick={() => void save()}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
          {data ? (
            <button className="btn ghost" type="button" disabled={busy} onClick={() => setEditing(false)}>
              Annuler
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!data) return <Empty text="Aucune assurance enregistrée." />;

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h3>{data.assureur}</h3>
          <div className="small muted mono">Police {data.num_police}</div>
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <span className={"pill " + (data.droits_valides ? "green" : "red")}>
            {data.droits_valides ? "Droits valides" : "Droits suspendus"}
          </span>
          {canWrite ? (
            <button className="btn ghost sm" type="button" onClick={() => setEditing(true)}>
              Modifier
            </button>
          ) : null}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Catégorie</th>
            <th>Taux</th>
            <th>Plafond (FCFA)</th>
          </tr>
        </thead>
        <tbody>
          {(data.garanties || []).map((g: any, i: number) => (
            <tr key={i}>
              <td>{g.categorie}</td>
              <td style={{ color: "var(--emerald)", fontWeight: 700 }}>{g.taux}%</td>
              <td>{typeof g.plafond === "number" ? g.plafond.toLocaleString("fr-FR") : g.plafond}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted" style={{ marginTop: 10, fontStyle: "italic" }}>
        Taux variables selon contrat souscrit.
      </p>
    </div>
  );
}

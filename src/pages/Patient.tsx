import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BON_STATUTS,
  emptyMedLine,
  formatDateFR,
  MEDICAMENT_FORMES,
  MEDICAMENT_MOMENTS,
  nowDateISO,
  nowISO,
  PRISE_EN_CHARGE,
  SPECIALITES,
  summarizeMed,
  type MedLine,
} from "../constants";

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

function pickNextAppointment(list: any[] | undefined) {
  if (!list?.length) return null;
  const now = Date.now();
  const upcoming = list
    .filter((a) => a.statut !== "annule" && a.statut !== "termine" && a.debut)
    .map((a) => ({ a, t: new Date(a.debut).getTime() }))
    .filter((x) => !Number.isNaN(x.t) && x.t >= now - 60 * 60 * 1000)
    .sort((x, y) => x.t - y.t);
  return upcoming[0]?.a ?? null;
}

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
  const qc = useQueryClient();
  const verifyAnip = useVerifyAnip(id!);
  const setToast = useAppStore((s) => s.setToast);
  const [tab, setTab] = useState<TabKey>("historique");
  const [params] = useSearchParams();
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

  useEffect(() => {
    const t = params.get("tab") as TabKey | null;
    if (t && (tabs as string[]).includes(t)) setTab(t);
  }, [params, tabs]);

  const { data: medecinsRdv = [] } = useQuery({
    queryKey: ["rdv-medecins"],
    queryFn: () => api.listMedecinsRdv(),
    enabled: canWriteRdv && (isReception || user?.role === "admin"),
  });
  const medecinsList = Array.isArray(medecinsRdv) ? medecinsRdv : [];
  const { data: patientAppts } = useQuery({
    queryKey: ["appointments", "patient", id],
    queryFn: () => api.appointments(`patient=${id}`),
    enabled: !!id,
  });
  const apptList = Array.isArray(patientAppts)
    ? patientAppts
    : Array.isArray((patientAppts as any)?.results)
      ? (patientAppts as any).results
      : [];
  const nextRdv = pickNextAppointment(apptList);

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
      void qc.invalidateQueries({ queryKey: ["appointments"] });
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
    <div className="row" style={{ justifyContent: "space-between", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
      <div className="row" style={{ gap: 14, alignItems: "center" }}>
        <Avatar src={patient.photo_url} name={patient.full_name} size={56} />
        <div>
          <h1>{patient.full_name || "Patient"}</h1>
          <div className="muted mono small" style={{ marginTop: 4 }}>
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

  const nextRdvBlock = (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="small muted" style={{ fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase" }}>
            Prochain RDV
          </div>
          {nextRdv ? (
            <>
              <div style={{ fontWeight: 800, marginTop: 4 }}>
                {new Date(nextRdv.debut).toLocaleString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              <div className="small muted" style={{ marginTop: 2 }}>
                {[nextRdv.professionnel_nom ? `Dr ${nextRdv.professionnel_nom}` : "Réception", nextRdv.structure_nom]
                  .filter(Boolean)
                  .join(" · ") || nextRdv.motif || "Consultation"}
                {nextRdv.statut_label ? ` · ${nextRdv.statut_label}` : ""}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 800, marginTop: 4 }}>Aucun rendez-vous à venir</div>
              <div className="small muted" style={{ marginTop: 2 }}>
                Planifiez depuis cette fiche ou l&apos;agenda
              </div>
            </>
          )}
        </div>
        {canWriteRdv ? (
          <button className="btn ghost sm" type="button" onClick={() => setShowRdv(true)}>
            {nextRdv ? "Nouveau RDV" : "Planifier"}
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
        {nextRdvBlock}
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

  // Infos de base uniquement - pas de demande auto.
  if (needsAccess && !pending) {
    return (
      <div>
        {header}
        {nextRdvBlock}
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
      {nextRdvBlock}
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
  const structures = ((user as any)?.structures || []) as { id: number; nom: string }[];
  const principaleId = (user as any)?.structure_principale as number | undefined;
  const defaultSpec = (user as any)?.specialite || "Médecine générale";
  const specOptions = SPECIALITES.includes(defaultSpec)
    ? SPECIALITES
    : [defaultSpec, ...SPECIALITES];
  const [form, setForm] = useState({
    type: "consultation",
    specialite: defaultSpec,
    structure: principaleId ? String(principaleId) : structures[0] ? String(structures[0].id) : "",
    motif: "",
    diagnostic: "",
    notes: "",
  });
  const [preview, setPreview] = useState(false);

  const canWrite = CLINICAL_WRITE_ROLES.has(user?.role || "");

  const payload = () => ({
    patient: patientId,
    date: nowISO(),
    type: form.type,
    specialite: form.specialite,
    structure: form.structure ? Number(form.structure) : undefined,
    motif: form.motif,
    diagnostic: form.diagnostic,
    notes: form.notes,
    extra: {},
  });

  const create = () => {
    if (!form.structure) {
      setToast("Choisissez la structure de santé.");
      return;
    }
    createMut.mutate(payload(), {
      onSuccess: () => {
        setForm({
          type: "consultation",
          specialite: defaultSpec,
          structure: principaleId ? String(principaleId) : form.structure,
          motif: "",
          diagnostic: "",
          notes: "",
        });
        setPreview(false);
        setToast("Consultation enregistrée");
      },
      onError: (e: any) => setToast(e?.data?.detail || e?.message || "Échec"),
    });
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
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <strong>{c.titre || `${c.specialite || "Consultation"} - ${formatDateFR(c.date)}`}</strong>
            <span className="pill blue">{c.type_label}</span>
          </div>
          <div className="small muted" style={{ marginTop: 4 }}>
            {formatDateFR(c.date)}
            {c.appointment_id ? " · Liée à un RDV" : " · Sans RDV (walk-in)"}
          </div>
          <div style={{ marginTop: 6, lineHeight: 1.45 }}>
            {c.specialite ? (
              <div>
                <strong>Spécialité :</strong> {c.specialite}
              </div>
            ) : null}
            {c.motif ? (
              <div>
                <strong>Motif :</strong> {c.motif}
              </div>
            ) : null}
            {c.diagnostic ? (
              <div>
                <strong>Diagnostic :</strong> {c.diagnostic}
              </div>
            ) : null}
            <div>
              <strong>Médecin :</strong> {c.medecin_nom || "Non renseigné"}
            </div>
            {c.medecin_telephone ? (
              <div className="small muted">Tél. {c.medecin_telephone}</div>
            ) : null}
            <div>
              <strong>Structure :</strong> {c.structure_nom || "Non renseignée"}
            </div>
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
          <div className="grid cols-2" style={{ gap: 10 }}>
            <div className="field">
              <label className="label">Spécialité / domaine</label>
              <select
                className="select"
                value={form.specialite}
                onChange={(e) => setForm({ ...form, specialite: e.target.value })}
              >
                {specOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Structure de santé *</label>
              <select
                className="select"
                value={form.structure}
                onChange={(e) => setForm({ ...form, structure: e.target.value })}
              >
                <option value="">Choisir…</option>
                {structures.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                    {s.id === principaleId ? " (principal)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Type de prise en charge</label>
              <select
                className="select"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {PRISE_EN_CHARGE.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Motif</label>
              <input
                className="input"
                placeholder="Motif de consultation"
                value={form.motif}
                onChange={(e) => setForm({ ...form, motif: e.target.value })}
              />
            </div>
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label className="label">Diagnostic</label>
            <input
              className="input"
              placeholder="Diagnostic"
              value={form.diagnostic}
              onChange={(e) => setForm({ ...form, diagnostic: e.target.value })}
            />
          </div>
          <textarea
            className="textarea"
            style={{ margin: "12px 0" }}
            placeholder="Notes / observations médicales"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <p className="muted small">Date et heure : {formatDateFR(nowISO())} (automatiques)</p>
          {preview ? (
            <div className="card" style={{ marginBottom: 12, background: "var(--surface-2, transparent)" }}>
              <strong>Récapitulatif</strong>
              <p className="small" style={{ marginTop: 6, lineHeight: 1.5 }}>
                {form.specialite} - {user?.full_name || "Médecin"} -{" "}
                {structures.find((s) => String(s.id) === form.structure)?.nom || "-"} - {formatDateFR(nowISO())}
                <br />
                {PRISE_EN_CHARGE.find((t) => t.value === form.type)?.label}
                {form.motif ? ` · ${form.motif}` : ""}
                {form.diagnostic ? ` · ${form.diagnostic}` : ""}
              </p>
            </div>
          ) : null}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" type="button" onClick={() => setPreview((v) => !v)}>
              {preview ? "Masquer l'aperçu" : "Aperçu"}
            </button>
            <button className="btn" onClick={create} disabled={!form.structure || createMut.isPending}>
              {createMut.isPending ? "…" : "Enregistrer"}
            </button>
          </div>
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
  const [step, setStep] = useState<"edit" | "preview">("edit");
  const [meds, setMeds] = useState<MedLine[]>([emptyMedLine()]);

  const canWrite = CLINICAL_WRITE_ROLES.has(user?.role || "");

  const create = () => {
    createMut.mutate(
      {
        patient: patientId,
        date: new Date().toISOString().slice(0, 10),
        medicaments: meds.filter((m) => m.nom).map((m) => ({
          nom: m.nom,
          dosage: m.dosage,
          forme: m.forme,
          quantite: m.quantite,
          unites_par_prise: m.unites_par_prise,
          frequence_par_jour: m.frequence_par_jour,
          frequence:
            m.unites_par_prise && m.frequence_par_jour
              ? `${m.unites_par_prise} × ${m.frequence_par_jour}`
              : "",
          duree_jours: m.duree_jours || null,
          moment: m.moment,
          instructions: m.instructions,
        })),
      },
      {
        onSuccess: () => {
          setMeds([emptyMedLine()]);
          setStep("edit");
          setOpen(false);
          setToast("Ordonnance créée");
        },
        onError: (e: any) => setToast(e?.data?.detail || e?.message || "Échec"),
      }
    );
  };

  const confirmDispense = (id: number) => {
    if (!window.confirm("Marquer cette ordonnance comme payée ?")) return;
    dispenseMut.mutate(id, {
      onSuccess: () => setToast("Ordonnance payée"),
      onError: (e: any) => setToast(e?.data?.detail || e?.message || "Échec"),
    });
  };

  const confirmAnnuler = (id: number) => {
    if (!window.confirm("Annuler cette ordonnance ? Elle ne pourra plus être payée.")) return;
    annulerMut.mutate(id, {
      onSuccess: () => setToast("Ordonnance annulée"),
      onError: (e: any) => setToast(e?.data?.detail || e?.message || "Échec"),
    });
  };

  const confirmAnnulerDispense = (id: number) => {
    if (!window.confirm("Annuler le paiement ? L'ordonnance redeviendra active.")) return;
    annulerDispenseMut.mutate(id, {
      onSuccess: () => setToast("Paiement annulé"),
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
          <div className="small muted" style={{ marginTop: 4 }}>
            <div>
              <strong>Médecin :</strong> {o.medecin_nom || "Non renseigné"}
            </div>
            {o.medecin_telephone ? (
              <div>Tél. {o.medecin_telephone}</div>
            ) : null}
            {o.structure_nom ? <div>{o.structure_nom}</div> : null}
          </div>
          <ul style={{ margin: "10px 0 0 18px" }}>
            {o.medicaments.map((m: any) => (
              <li key={m.id}>
                <strong>{m.nom}</strong>
                {[
                  m.dosage,
                  m.forme,
                  m.quantite,
                  m.unites_par_prise && m.frequence_par_jour
                    ? `${m.unites_par_prise} × ${m.frequence_par_jour}`
                    : m.frequence,
                  m.duree_jours ? `${m.duree_jours} j` : "",
                  MEDICAMENT_MOMENTS.find((x) => x.value === m.moment)?.label,
                  m.instructions,
                ]
                  .filter((x) => x && x !== "-")
                  .map((x) => ` - ${x}`)
                  .join("")}
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
                Marquer payée
              </button>
            )}
            {user?.role === "pharmacien" && (o.statut === "dispensee" || o.statut === "payee") && (
              <button
                className="btn ghost sm"
                type="button"
                disabled={annulerDispenseMut.isPending}
                onClick={() => confirmAnnulerDispense(o.id)}
              >
                Annuler le paiement
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
                Pour <strong>{patientName || "ce patient"}</strong> - pas besoin de resaisir l&apos;identité.
              </p>
              {step === "preview" ? (
                <div>
                  <p className="muted small" style={{ marginBottom: 8 }}>Aperçu avant validation</p>
                  <ul style={{ margin: "0 0 12px 18px" }}>
                    {meds.filter((m) => m.nom).map((m, i) => (
                      <li key={i}>{summarizeMed(m)}</li>
                    ))}
                  </ul>
                  <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn ghost" type="button" onClick={() => setStep("edit")}>
                      Modifier
                    </button>
                    <button
                      className="btn"
                      type="button"
                      onClick={create}
                      disabled={!meds.some((m) => m.nom) || createMut.isPending}
                    >
                      {createMut.isPending ? "…" : "Valider l'ordonnance"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {meds.map((m, i) => (
                    <div
                      key={i}
                      className="card"
                      style={{ marginBottom: 10, padding: 12 }}
                    >
                      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                        <strong className="small">Médicament {i + 1}</strong>
                        {meds.length > 1 ? (
                          <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() => setMeds(meds.filter((_, j) => j !== i))}
                          >
                            Retirer
                          </button>
                        ) : null}
                      </div>
                      <div className="grid cols-2" style={{ gap: 8 }}>
                        <input
                          className="input"
                          placeholder="Nom"
                          value={m.nom}
                          onChange={(e) =>
                            setMeds(meds.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))
                          }
                        />
                        <input
                          className="input"
                          placeholder="Dosage / concentration (ex. 1000 mg)"
                          value={m.dosage}
                          onChange={(e) =>
                            setMeds(meds.map((x, j) => (j === i ? { ...x, dosage: e.target.value } : x)))
                          }
                        />
                        <select
                          className="select"
                          value={m.forme}
                          onChange={(e) =>
                            setMeds(meds.map((x, j) => (j === i ? { ...x, forme: e.target.value } : x)))
                          }
                        >
                          {MEDICAMENT_FORMES.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                        <input
                          className="input"
                          placeholder="Quantité à délivrer (ex. 1 boîte)"
                          value={m.quantite}
                          onChange={(e) =>
                            setMeds(meds.map((x, j) => (j === i ? { ...x, quantite: e.target.value } : x)))
                          }
                        />
                        <input
                          className="input"
                          placeholder="Unités par prise (ex. 2 comprimés)"
                          value={m.unites_par_prise}
                          onChange={(e) =>
                            setMeds(
                              meds.map((x, j) => (j === i ? { ...x, unites_par_prise: e.target.value } : x))
                            )
                          }
                        />
                        <input
                          className="input"
                          placeholder="Fréquence (ex. 3/jour)"
                          value={m.frequence_par_jour}
                          onChange={(e) =>
                            setMeds(
                              meds.map((x, j) => (j === i ? { ...x, frequence_par_jour: e.target.value } : x))
                            )
                          }
                        />
                        <input
                          className="input"
                          type="number"
                          placeholder="Durée (jours)"
                          value={m.duree_jours}
                          onChange={(e) =>
                            setMeds(
                              meds.map((x, j) =>
                                j === i ? { ...x, duree_jours: e.target.value ? +e.target.value : "" } : x
                              )
                            )
                          }
                        />
                        <select
                          className="select"
                          value={m.moment}
                          onChange={(e) =>
                            setMeds(meds.map((x, j) => (j === i ? { ...x, moment: e.target.value } : x)))
                          }
                        >
                          {MEDICAMENT_MOMENTS.map((mo) => (
                            <option key={mo.value} value={mo.value}>
                              {mo.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input
                        className="input"
                        style={{ marginTop: 8 }}
                        placeholder="Instructions complémentaires (optionnel)"
                        value={m.instructions}
                        onChange={(e) =>
                          setMeds(meds.map((x, j) => (j === i ? { ...x, instructions: e.target.value } : x)))
                        }
                      />
                    </div>
                  ))}
                  <div className="row" style={{ gap: 8, marginTop: 8, justifyContent: "space-between" }}>
                    <button
                      className="btn ghost sm"
                      type="button"
                      onClick={() => setMeds([...meds, emptyMedLine()])}
                    >
                      + Ajouter un médicament
                    </button>
                    <div className="row" style={{ gap: 8 }}>
                      <button className="btn ghost" type="button" onClick={() => setOpen(false)}>
                        Annuler
                      </button>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => setStep("preview")}
                        disabled={!meds.some((m) => m.nom)}
                      >
                        Aperçu
                      </button>
                    </div>
                  </div>
                </>
              )}
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
  const { data: bonsRaw, refetch: refetchBons } = useQuery({
    queryKey: ["exam-orders", patientId],
    queryFn: () => api.examOrders(`patient=${patientId}`),
  });
  const { data: catalog = [] } = useQuery({
    queryKey: ["exam-catalog"],
    queryFn: () => api.examCatalog(),
  });
  const { data: hosp } = useQuery({
    queryKey: ["hospitals-labo"],
    queryFn: () => api.hospitals(),
  });
  const labs = ((hosp?.structures || []) as any[]).filter(
    (s) => s.type === "laboratoire" || (s.nom || "").toLowerCase().includes("labo")
  );
  const bons = (bonsRaw?.results || bonsRaw || []) as any[];
  const [open, setOpen] = useState(false);
  const [prescribe, setPrescribe] = useState(false);
  const [form, setForm] = useState({
    type_examen: "",
    categorie: "analyses",
    statut: "normal",
    laboratoire: "",
    resultat_texte: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedExams, setSelectedExams] = useState<string[]>([]);
  const [autreExamen, setAutreExamen] = useState("");
  const [bonForm, setBonForm] = useState({ motif: "", observations: "", laboratoire: "", laboratoire_nom: "" });

  const canUpload = user?.role === "laborantin" || user?.role === "admin";
  const canPrescribe = user?.role === "medecin" || user?.role === "admin";
  const catalogList = Array.isArray(catalog) ? catalog : [];

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
          date: nowDateISO(),
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

  const submitBon = async () => {
    if (!selectedExams.length) {
      setToast("Sélectionnez au moins un examen.");
      return;
    }
    if (selectedExams.includes("autre") && !autreExamen.trim()) {
      setToast("Précisez le type d'examen (Autre).");
      return;
    }
    setBusy(true);
    try {
      const lignes = selectedExams.map((code) => {
        if (code === "autre") {
          return {
            code: "autre",
            type_examen: autreExamen.trim(),
            categorie: "autres",
          };
        }
        const item = catalogList.find((c: any) => c.code === code || c.label === code);
        return {
          code: item?.code || "",
          type_examen: item?.label || code,
          categorie: item?.categorie || "analyses",
        };
      });
      await api.createExamOrder({
        patient: patientId,
        motif: bonForm.motif,
        observations: bonForm.observations,
        laboratoire: bonForm.laboratoire ? Number(bonForm.laboratoire) : null,
        laboratoire_nom: bonForm.laboratoire_nom,
        lignes,
      });
      setPrescribe(false);
      setSelectedExams([]);
      setAutreExamen("");
      setBonForm({ motif: "", observations: "", laboratoire: "", laboratoire_nom: "" });
      setToast("Bon d'examen prescrit");
      refetchBons();
    } catch (e: any) {
      setToast(e?.data?.detail || e?.message || "Échec");
    } finally {
      setBusy(false);
    }
  };

  const toggleExam = (code: string) => {
    setSelectedExams((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  return (
    <div className="grid" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
        {canPrescribe ? (
          <button className="btn" type="button" onClick={() => setPrescribe(true)}>
            <FlaskConical size={16} style={{ marginRight: 6 }} />
            Prescrire un examen
          </button>
        ) : null}
        {canUpload ? (
          <button className="btn ghost" type="button" onClick={() => setOpen(true)}>
            <FlaskConical size={16} style={{ marginRight: 6 }} />
            Déposer un résultat
          </button>
        ) : null}
      </div>

      {bons.length > 0 ? (
        <>
          <h3 style={{ margin: 0, fontSize: 14 }}>Demandes (bons)</h3>
          {bons.map((b) => {
            const st = BON_STATUTS[b.statut] || { label: b.statut_label || b.statut, cls: "blue" };
            return (
              <div className="card" key={`bon-${b.id}`}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>Bon #{b.id}</strong>
                  <span className={`pill ${st.cls}`}>{st.label}</span>
                </div>
                <div className="small muted" style={{ marginTop: 4 }}>
                  {b.medecin_nom || "Médecin"} · {b.laboratoire_structure_nom || b.laboratoire_nom || "Labo"} ·{" "}
                  {formatDateFR(b.created_at)}
                </div>
                {b.motif ? <p style={{ marginTop: 6 }}>{b.motif}</p> : null}
                <ul style={{ margin: "8px 0 0 18px" }}>
                  {(b.lignes || []).map((l: any) => (
                    <li key={l.id}>
                      {l.type_examen}
                      {l.has_resultat ? " · résultat" : " · en attente"}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </>
      ) : null}

      {items.length === 0 && bons.length === 0 && <Empty text="Aucun examen prescrit ni résultat." />}
      {items.map((x) => (
        <div className="card" key={x.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{x.type_examen}</strong>
            <StatusBadge status={x.statut} />
          </div>
          <div className="small muted">
            {x.categorie_label} · {x.laboratoire} · {formatDateFR(x.date)}
            {x.bon_id ? ` · Bon #${x.bon_id}` : ""}
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

      {prescribe ? (
        <div className="settings-modal-root" role="dialog" aria-modal="true" aria-label="Prescrire un examen">
          <button type="button" className="settings-modal-backdrop" aria-label="Fermer" onClick={() => setPrescribe(false)} />
          <div className="settings-modal-card" style={{ maxWidth: 640 }}>
            <div className="settings-modal-head">
              <span className="settings-modal-ico">
                <FlaskConical size={18} />
              </span>
              <h2>Prescrire un examen</h2>
              <button type="button" className="settings-modal-close" onClick={() => setPrescribe(false)} aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            <div className="settings-modal-body">
              <p className="muted small" style={{ marginBottom: 12 }}>
                Patient : <strong>{patientName}</strong>
                {user?.full_name ? ` · Médecin : ${user.full_name}` : ""}
              </p>
              <label className="label">Examens (1 ou plusieurs)</label>
              <div style={{ maxHeight: 180, overflow: "auto", marginBottom: 12 }}>
                {catalogList.map((c: any) => (
                  <label key={c.code} className="row" style={{ gap: 8, padding: "4px 0" }}>
                    <input
                      type="checkbox"
                      checked={selectedExams.includes(c.code)}
                      onChange={() => toggleExam(c.code)}
                    />
                    <span className="small">{c.label}</span>
                  </label>
                ))}
              </div>
              {selectedExams.includes("autre") ? (
                <input
                  className="input"
                  placeholder="Préciser l'examen (saisie libre)"
                  value={autreExamen}
                  onChange={(e) => setAutreExamen(e.target.value)}
                  style={{ marginBottom: 12 }}
                />
              ) : null}
              <input
                className="input"
                placeholder="Motif / indication"
                value={bonForm.motif}
                onChange={(e) => setBonForm({ ...bonForm, motif: e.target.value })}
              />
              <textarea
                className="textarea"
                style={{ marginTop: 8 }}
                placeholder="Observations (optionnel)"
                value={bonForm.observations}
                onChange={(e) => setBonForm({ ...bonForm, observations: e.target.value })}
              />
              <div className="grid cols-2" style={{ gap: 8, marginTop: 8 }}>
                <select
                  className="select"
                  value={bonForm.laboratoire}
                  onChange={(e) => setBonForm({ ...bonForm, laboratoire: e.target.value })}
                >
                  <option value="">Laboratoire / structure…</option>
                  {labs.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.nom}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  placeholder="Nom du laboratoire (libre)"
                  value={bonForm.laboratoire_nom}
                  onChange={(e) => setBonForm({ ...bonForm, laboratoire_nom: e.target.value })}
                />
              </div>
              <div className="row" style={{ gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                <button className="btn ghost" type="button" onClick={() => setPrescribe(false)}>
                  Annuler
                </button>
                <button className="btn" type="button" onClick={submitBon} disabled={busy || !selectedExams.length}>
                  {busy ? "…" : "Créer le bon"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="settings-modal-root" role="dialog" aria-modal="true" aria-label="Nouvel examen">
          <button type="button" className="settings-modal-backdrop" aria-label="Fermer" onClick={() => setOpen(false)} />
          <div className="settings-modal-card" style={{ maxWidth: 560 }}>
            <div className="settings-modal-head">
              <span className="settings-modal-ico">
                <FlaskConical size={18} />
              </span>
              <h2>Déposer un résultat</h2>
              <button type="button" className="settings-modal-close" onClick={() => setOpen(false)} aria-label="Fermer">
                <X size={18} />
              </button>
            </div>
            <div className="settings-modal-body">
              <p className="muted small" style={{ marginBottom: 12 }}>
                Pour <strong>{patientName || "ce patient"}</strong> - identité déjà connue.
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
                      : "-"}
                  </td>
                  <td>{c.temperature ? `${c.temperature}°C` : "-"}</td>
                  <td>{c.poids ? `${c.poids} kg` : "-"}</td>
                  <td>{c.glycemie ? `${c.glycemie}` : "-"}</td>
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

  const remove = async () => {
    if (!window.confirm("Retirer l'assurance de ce patient ? La carte passera en Non assuré.")) return;
    setBusy(true);
    try {
      await api.deleteAssurance(patientId);
      setToast("Assurance retirée.");
      setEditing(false);
      onSaved?.();
    } catch (e: any) {
      setToast(e?.data?.detail || e.message || "Échec retrait assurance.");
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
          {data ? (
            <button className="btn ghost" type="button" disabled={busy} onClick={() => void remove()}>
              Retirer
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
            <>
              <button className="btn ghost sm" type="button" onClick={() => setEditing(true)}>
                Modifier
              </button>
              <button className="btn ghost sm" type="button" disabled={busy} onClick={() => void remove()}>
                Retirer
              </button>
            </>
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

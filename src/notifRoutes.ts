/** Deep-link notifications - aligné sur `core/contracts.py` NOTIFICATION_ROUTES. */

export type NotifLike = {
  type?: string;
  notif_type?: string;
  payload?: Record<string, unknown> | null;
  patient_id?: number;
};

const KIND_TO_TYPE: Record<string, string> = {
  consultation: "dossier_updated",
  consultation_annulee: "dossier_updated",
  ordonnance: "ordonnance",
  ordonnance_dispensee: "ordonnance",
  ordonnance_payee: "ordonnance",
  kyc_updated: "notifications",
  affiliation_updated: "notifications",
  examen: "examen",
  examen_fichier: "examen",
  bon_examen: "bon_examen",
  bon_resultat: "examen",
  rdv_created: "appointment",
  rdv_pending: "appointment",
  rdv_confirmed: "appointment",
  rdv_annule: "appointment",
  access_request: "access_request",
};

export function notificationPath(n: NotifLike, app: "hub" | "admin" | "patient" = "hub"): string {
  const payload = (n.payload || {}) as Record<string, unknown>;
  const kind = String(payload.kind || "");
  const type = KIND_TO_TYPE[kind] || n.type || n.notif_type || "system";
  const rawPatientId = payload.patient_id ?? n.patient_id;
  const patientId = Number(rawPatientId) || null;
  const accessId = Number(payload.access_request_id || 0) || null;
  const apptId = Number(payload.appointment_id || 0) || null;

  if (app === "admin") {
    if (type === "access_request") return "/acces";
    if (type === "appointment") return "/agenda";
    return "/notifications";
  }

  if (app === "patient") {
    if (type === "access_request") return "Notifications";
    if (type === "appointment") return "RendezVous";
    if (type === "ordonnance") return "Dossier:ordonnances";
    if (type === "examen" || type === "bon_examen") return "Dossier:examens";
    if (type === "emergency") return "Urgence";
    return "Dossier:dossier";
  }

  if (type === "access_request" && patientId) {
    return `/patient/${patientId}`;
  }
  if (type === "emergency" && patientId) {
    return `/patient/${patientId}?urgence=1`;
  }
  if (type === "appointment") {
    return apptId ? `/rdv?id=${apptId}` : "/rdv";
  }
  if ((type === "ordonnance" || payload.section === "ordonnances") && patientId) {
    return `/patient/${patientId}?tab=ordonnances`;
  }
  if (
    (type === "examen" || type === "bon_examen" || payload.section === "examens") &&
    patientId
  ) {
    return `/patient/${patientId}?tab=examens`;
  }
  if (type === "dossier_updated" && patientId) {
    return `/patient/${patientId}?tab=historique`;
  }
  if (patientId) return `/patient/${patientId}`;
  if (accessId) return `/recherche`;
  return "/";
}

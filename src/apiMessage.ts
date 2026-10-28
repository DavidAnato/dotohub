export type ToastTone = "success" | "error" | "info";

const NPI_TAKEN = "Ce NPI est déjà enregistré pour un autre patient.";
const GENERIC_TAKEN = "Cette information est déjà enregistrée.";

const META_KEYS = new Set(["code", "status", "status_code", "missing"]);
const FIELDLESS = new Set(["detail", "non_field_errors", "message", "error"]);

const UNIQUE_RE =
  /un objet\s+.+\s+avec ce champ\s+.+\s+existe déjà|with this .+ already exists|this field must be unique|ce champ doit être unique|must make a unique set|doivent former un ensemble unique/i;

const ERROR_RE =
  /(échec|impossible|erreur|déjà enregistr|déjà pris|déjà utilisé|indiquez|choisissez|précisez|sélectionnez|saisissez|invalide|ne peut pas|doit contenir|est nécessaire|refus|révoqu|expir)/i;

const SUCCESS_RE =
  /(créé|créée|mis à jour|mise à jour|enregistr|confirmé|autorisé|payé|payée|prescrit|déposé|annulé|annulée|retiré|retirée|marquée|reçu|ouverte|ouverture)/i;

function isTaken(text: string): boolean {
  return UNIQUE_RE.test(text);
}

function takenPhrase(field: string | undefined, blob: string): string {
  const key = (field || "").toLowerCase();
  if (key === "npi" || /\bnpi\b/i.test(blob)) return NPI_TAKEN;
  return GENERIC_TAKEN;
}

/** Phrase courte, sans préfixe technique (`npi:`) ni formulation Django. */
export function humanizeApiText(text: string, field?: string): string {
  const original = String(text ?? "").trim();
  if (!original) return "";
  let key = (field || "").toLowerCase();
  let body = original;
  const prefixed = original.match(/^([a-z][a-z0-9_]*)\s*:\s+(\S[\s\S]*)$/);
  if (prefixed) {
    key = key || prefixed[1].toLowerCase();
    body = prefixed[2].trim();
  }
  if (isTaken(body) || isTaken(original)) return takenPhrase(key, `${original} ${body}`);
  if (prefixed) return scrub(body);
  return scrub(original);
}

const CODE_LABELS: Record<string, string> = {
  normal: "Normal",
  active: "Active",
  eleve: "Élevé",
  critique: "Critique",
  dispensee: "Payée",
  payee: "Payée",
  terminee: "Terminée",
  termine: "Terminé",
  annulee: "Annulée",
  annule: "Annulé",
  planifie: "Planifié",
  confirme: "Confirmé",
  demande: "Demandé",
  recu: "Reçu",
  en_cours: "En cours",
  disponible: "Disponible",
  absent: "Absent",
  brouillon: "Brouillon",
  en_attente: "En attente",
  valide: "Validé",
  refuse: "Refusé",
  pending: "En attente",
  pending_prior: "En attente du médecin",
  approved: "Autorisé",
  denied: "Refusé",
  expired: "Expiré",
  emergency_bypass: "Urgence",
  revoked: "Révoqué",
  cancelled: "Annulé",
  scan: "Scan de la carte",
  search: "Recherche",
  emergency: "Urgence",
  full: "Dossier complet",
  urgence: "Urgence",
  medecin: "Médecin",
  reception: "Accueil",
  infirmier: "Infirmier",
  pharmacien: "Pharmacien",
  laborantin: "Laborantin",
  ambulancier: "Ambulancier",
  admin: "Administrateur",
  patient: "Patient",
  access_request: "Demande d'accès",
  access_granted: "Accès autorisé",
  access_denied: "Accès refusé",
  access_expired: "Demande expirée",
  dossier_updated: "Dossier mis à jour",
  ordonnance: "Ordonnance",
  examen: "Examen",
  appointment: "Rendez-vous",
  bon_examen: "Bon d'examen",
  system: "Information",
  profile_incomplete_for_card: "Complétez le profil avant d'émettre la carte.",
};

function labelFromCode(code: string): string {
  const key = code.trim().toLowerCase();
  if (CODE_LABELS[key]) return CODE_LABELS[key];
  if (/^[a-z][a-z0-9_]*$/.test(key)) {
    const words = key.replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return code.trim();
}

function scrub(text: string): string {
  const raw = text.trim();
  if (!raw) return "";
  if (/https?:\/\/|localhost|loca\.lt|127\.0\.0\.1/i.test(raw)) {
    return "Une erreur est survenue. Réessayez.";
  }
  if (/erreur api\s*\(\s*\d+\s*\)/i.test(raw) || /^erreur api$/i.test(raw)) {
    return "Action impossible.";
  }
  if (/profile_incomplete_for_card/i.test(raw)) {
    return CODE_LABELS.profile_incomplete_for_card;
  }
  if (/^[a-z][a-z0-9_]*$/.test(raw)) return labelFromCode(raw);
  let s = raw;
  s = s.replace(/lecture ocr/gi, "Lecture de la carte");
  s = s.replace(/\bOCR\b/g, "la lecture");
  s = s.replace(/vérifiez que le backend tourne\.?/gi, "réessayez dans un instant");
  s = s.replace(/le serveur doit tourner\.?/gi, "réessayez dans un instant");
  s = s.replace(/urgence \(bypass\)/gi, "Urgence");
  s = s.replace(/annulé \(pro\)/gi, "Annulé");
  s = s.replace(/\btoken qr\b/gi, "code de la carte");
  return s;
}

/** Libellé français d'un statut ou d'un code, sans le nom technique. */
export function labelStatut(code?: string | null, label?: string | null): string {
  const rawLabel = (label || "").trim();
  const rawCode = (code || "").trim();
  if (rawLabel) {
    const cleaned = scrub(rawLabel);
    if (cleaned && cleaned.toLowerCase() !== rawCode.toLowerCase() && !/^[a-z][a-z0-9_]*$/.test(cleaned)) {
      return cleaned;
    }
  }
  return labelFromCode(rawCode || rawLabel);
}

function pushLine(parts: string[], text: string, field?: string) {
  const line = humanizeApiText(text, field);
  if (line && !parts.includes(line)) parts.push(line);
}

/** Dict / liste DRF → une ou plusieurs phrases lisibles. */
export function formatDrfData(data: unknown): string {
  if (data == null || data === "") return "";
  if (typeof data === "string") return humanizeApiText(data);
  if (typeof data !== "object") return "";
  if (Array.isArray(data)) {
    const parts: string[] = [];
    for (const item of data) {
      if (typeof item === "string") pushLine(parts, item);
      else if (item && typeof item === "object") {
        const nested = formatDrfData(item);
        if (nested) pushLine(parts, nested);
      }
    }
    return parts.join(" · ");
  }
  const parts: string[] = [];
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    if (META_KEYS.has(key) || val == null || val === "") continue;
    const field = FIELDLESS.has(key) ? undefined : key;
    if (typeof val === "string") pushLine(parts, val, field);
    else if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string") pushLine(parts, item, field);
        else if (item && typeof item === "object") {
          const nested = formatDrfData(item);
          if (nested) pushLine(parts, nested, field);
        }
      }
    } else if (typeof val === "object") {
      const nested = formatDrfData(val);
      if (nested) pushLine(parts, nested, field);
    }
  }
  return parts.join(" · ");
}

export function formatApiError(e: unknown, fallback = "Action impossible."): string {
  if (e && typeof e === "object" && "data" in e) {
    const fromData = formatDrfData((e as { data?: unknown }).data);
    if (fromData) return fromData;
  }
  if (e instanceof Error && e.message && e.message !== "Erreur API") {
    return humanizeApiText(e.message);
  }
  return humanizeApiText(fallback) || fallback;
}

export function inferToastTone(message: string): ToastTone {
  if (ERROR_RE.test(message)) return "error";
  if (SUCCESS_RE.test(message)) return "success";
  return "info";
}

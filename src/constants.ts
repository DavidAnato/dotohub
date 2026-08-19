/** Constantes partagées DotoHub - alignées sur `core/contracts.py`. */

export const HOSPITAL_REQUIRED_ROLES = [
  "medecin",
  "infirmier",
  "pharmacien",
  "laborantin",
  "ambulancier",
  "receptionniste",
] as const;

export const TYPE_EXERCICE = [
  { v: "etablissement_sante", l: "Établissement de santé" },
  { v: "pharmacie", l: "Pharmacie" },
  { v: "laboratoire", l: "Laboratoire" },
  { v: "independant", l: "Indépendant" },
] as const;

export function typeExerciceHint(kind: string): string {
  if (kind === "independant") {
    return "Cabinet ou exercice libéral. Un nom suffit, sans liste d'hôpitaux.";
  }
  if (kind === "pharmacie") {
    return "Choisissez la pharmacie dans le catalogue, ou saisissez son nom.";
  }
  if (kind === "laboratoire") {
    return "Choisissez le laboratoire dans le catalogue, ou saisissez son nom.";
  }
  return "Choisissez un ou plusieurs établissements. L'étoile marque le principal, proposé par défaut en consultation.";
}

export const PRO_ROLES = [
  { v: "medecin", l: "Médecin" },
  { v: "infirmier", l: "Infirmier" },
  { v: "pharmacien", l: "Pharmacien" },
  { v: "laborantin", l: "Laborantin" },
  { v: "ambulancier", l: "Ambulancier" },
  { v: "receptionniste", l: "Réceptionniste" },
] as const;

export function needsHospitalAttach(user?: {
  role?: string;
  structures?: { id?: number }[] | null;
  structure_principale?: number | null;
  type_exercice?: string | null;
  nom_etablissement?: string | null;
} | null): boolean {
  if (!user || !HOSPITAL_REQUIRED_ROLES.includes(user.role as any)) return false;
  if (user.type_exercice === "independant" && (user.nom_etablissement || "").trim()) return false;
  const ids = user.structures || [];
  return !ids.length || !user.structure_principale;
}

export const PIN_LEN = 4;
export const OTP_LEN = 5;
export const PIN_REGEX = /^\d{4}$/;
export const OTP_REGEX = /^\d{5}$/;
export const PIN_ERROR = "Le PIN doit contenir exactement 4 chiffres.";
export const OTP_ERROR = "Le code OTP doit contenir exactement 5 chiffres.";

export const SPECIALITES = [
  "Médecine générale",
  "ORL",
  "Gynécologie-obstétrique",
  "Cardiologie",
  "Pédiatrie",
  "Dermatologie",
  "Ophtalmologie",
  "Chirurgie générale",
  "Traumatologie-orthopédie",
  "Neurologie",
  "Psychiatrie",
  "Urologie",
  "Gastro-entérologie",
  "Pneumologie",
  "Rhumatologie",
  "Endocrinologie",
  "Néphrologie",
  "Oncologie",
  "Anesthésie-réanimation",
  "Médecine interne",
  "Médecine d'urgence",
  "Radiologie",
  "Biologie médicale",
  "Santé publique",
  "Stomatologie",
  "Néonatologie",
];

export const PRISE_EN_CHARGE = [
  { value: "consultation", label: "Consultation" },
  { value: "hospitalisation", label: "Hospitalisation" },
  { value: "urgence", label: "Urgence" },
  { value: "suivi", label: "Suivi/Contrôle" },
] as const;

export const MEDICAMENT_FORMES = [
  "comprimé",
  "gélule",
  "sirop",
  "sachet",
  "ampoule",
  "flacon",
  "gouttes",
  "pommade",
  "crème",
  "suppositoire",
  "inhalateur",
  "patch",
  "injectable",
  "autre",
];

export const MEDICAMENT_MOMENTS = [
  { value: "", label: "-" },
  { value: "a_jeun", label: "À jeun" },
  { value: "avant_repas", label: "Avant les repas" },
  { value: "pendant_repas", label: "Pendant les repas" },
  { value: "apres_repas", label: "Après les repas" },
  { value: "entre_repas", label: "Entre les repas" },
  { value: "au_coucher", label: "Au coucher" },
];

export const BON_STATUTS: Record<string, { label: string; cls: string }> = {
  demande: { label: "Demandé", cls: "blue" },
  recu: { label: "Reçu", cls: "teal" },
  en_cours: { label: "En cours", cls: "amber" },
  resultat_disponible: { label: "Résultat disponible", cls: "green" },
  cloture: { label: "Clôturé", cls: "gray" },
};

/** Date/heure « maintenant » - à utiliser dans les formulaires, jamais hardcodé. */
export function nowISO(): string {
  return new Date().toISOString();
}

export function nowDateISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDateFR(value?: string | Date | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR");
}

export function formatDateTimeFR(value?: string | Date | null): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export type MedLine = {
  nom: string;
  dosage: string;
  forme: string;
  quantite: string;
  unites_par_prise: string;
  frequence_par_jour: string;
  duree_jours: number | "";
  moment: string;
  instructions: string;
};

export function emptyMedLine(): MedLine {
  return {
    nom: "",
    dosage: "",
    forme: "comprimé",
    quantite: "1 boîte",
    unites_par_prise: "",
    frequence_par_jour: "",
    duree_jours: 3,
    moment: "",
    instructions: "",
  };
}

export function summarizeMed(m: MedLine): string {
  const poso =
    m.unites_par_prise && m.frequence_par_jour
      ? `${m.unites_par_prise} × ${m.frequence_par_jour}`
      : "";
  const duree = m.duree_jours ? `pendant ${m.duree_jours} jour${Number(m.duree_jours) > 1 ? "s" : ""}` : "";
  const moment = MEDICAMENT_MOMENTS.find((x) => x.value === m.moment)?.label;
  return [m.nom, m.dosage, m.forme, m.quantite, poso, duree, moment && moment !== "-" ? moment : ""]
    .filter(Boolean)
    .join(" - ");
}

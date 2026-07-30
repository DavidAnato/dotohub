export type RoleHomeLink = { to: string; label: string; hint: string };

export type RoleStatKey = "consultations" | "ordonnances" | "scans";

function norm(role?: string): string {
  return (role || "").trim().toLowerCase();
}

/** Agenda / RDV : médecin, admin, infirmier, réceptionniste */
export function canSeeAgenda(role?: string): boolean {
  return ["medecin", "admin", "infirmier", "receptionniste"].includes(norm(role));
}

/** DotoCards : admin uniquement */
export function canSeeDodoCards(role?: string): boolean {
  return norm(role) === "admin";
}

/** Destination métier pour un chip de stats Accueil (null = non cliquable) */
export function roleStatDestination(role?: string, stat?: RoleStatKey): string | null {
  const r = norm(role);
  switch (r) {
    case "pharmacien":
      return "/pharma";
    case "laborantin":
      return "/labo";
    case "infirmier":
      return "/tournee";
    case "ambulancier":
      return "/recherche?urgence=1";
    case "receptionniste":
      if (stat === "consultations") return "/rdv";
      return "/recherche";
    case "medecin":
    case "admin":
      if (stat === "consultations") return "/rdv";
      return "/recherche";
    default:
      return "/recherche";
  }
}

/** Liens métier de la page Accueil selon le rôle */
export function roleHomeLinks(role?: string): RoleHomeLink[] {
  switch (norm(role)) {
    case "receptionniste":
      return [
        { to: "/patients/nouveau", label: "Nouveau patient", hint: "Créer un dossier patient" },
        { to: "/rdv", label: "Agenda", hint: "Rendez-vous et suivi" },
      ];
    case "pharmacien":
      return [{ to: "/pharma", label: "Pharmacie", hint: "Ordonnances et délivrance" }];
    case "laborantin":
      return [{ to: "/labo", label: "Laboratoire", hint: "Examens et résultats" }];
    case "infirmier":
      return [{ to: "/tournee", label: "Tournée", hint: "Soins et constantes" }];
    case "ambulancier":
      return [
        {
          to: "/recherche?urgence=1",
          label: "Urgence",
          hint: "Recherche patient en mode urgence",
        },
      ];
    case "medecin":
    case "admin":
    default:
      return [
        { to: "/recherche", label: "Rechercher", hint: "NPI, nom ou scan QR patient" },
        { to: "/rdv", label: "Agenda", hint: "Rendez-vous et suivi" },
      ];
  }
}

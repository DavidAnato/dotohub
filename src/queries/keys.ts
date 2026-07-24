export const qk = {
  me: ["auth", "me"] as const,
  hubDashboard: ["hub", "dashboard"] as const,
  patientsSearch: (params: string) => ["patients", "search", params] as const,
  patient: (id: string | number) => ["patients", id] as const,
  urgence: (id: string | number) => ["patients", id, "urgence"] as const,
  consultations: (id: string | number) => ["consultations", id] as const,
  ordonnances: (id: string | number) => ["ordonnances", id] as const,
  examens: (id: string | number) => ["examens", id] as const,
  constantes: (id: string | number) => ["constantes", id] as const,
  dodocards: (params = "") => ["dodocards", params] as const,
};

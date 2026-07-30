// En dev : URLs relatives → proxy Vite (évite CORS hotspot/LAN).
// Prod / preprod : VITE_API_URL ou défaut Render.
const API_URL =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? "" : "https://doto-backend-71tk.onrender.com");

const LOCAL_PIN_KEY = "doto_hub_local_pin";

export function saveLocalPin(pin: string) {
  if (/^\d{5}$/.test(pin)) localStorage.setItem(LOCAL_PIN_KEY, pin);
}

export function clearLocalPin() {
  localStorage.removeItem(LOCAL_PIN_KEY);
}

export function matchLocalPin(pin: string): boolean {
  const stored = localStorage.getItem(LOCAL_PIN_KEY);
  return !!stored && stored === pin;
}

type Tokens = { access: string; refresh: string };

const store = {
  get access() {
    return localStorage.getItem("doto_access");
  },
  get refresh() {
    return localStorage.getItem("doto_refresh");
  },
  set(tokens: Tokens) {
    localStorage.setItem("doto_access", tokens.access);
    localStorage.setItem("doto_refresh", tokens.refresh);
  },
  clear() {
    localStorage.removeItem("doto_access");
    localStorage.removeItem("doto_refresh");
    localStorage.removeItem("doto_user");
    clearLocalPin();
  },
};

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, data: any) {
    super(data?.detail || "Erreur API");
    this.status = status;
    this.data = data;
  }
}

const SESSION_EXPIRED_MSG = "Session expirée, reconnectez-vous";

type SessionExpiredHandler = (message: string) => void;
let sessionExpiredHandler: SessionExpiredHandler | null = null;
let sessionExpiredLock = false;

/** Enregistré par AuthProvider — clear Zustand + toast + redirection Login. */
export function setSessionExpiredHandler(handler: SessionExpiredHandler | null) {
  sessionExpiredHandler = handler;
}

function notifySessionExpired() {
  if (sessionExpiredLock) return;
  sessionExpiredLock = true;
  store.clear();
  try {
    sessionExpiredHandler?.(SESSION_EXPIRED_MSG);
  } finally {
    window.setTimeout(() => {
      sessionExpiredLock = false;
    }, 800);
  }
}

async function request<T = any>(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (store.access) headers.Authorization = `Bearer ${store.access}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401 && retry) {
    if (store.refresh) {
      const refreshed = await tryRefresh();
      if (refreshed) return request<T>(path, options, false);
    }
    if (store.access || store.refresh) {
      notifySessionExpired();
    }
  }

  if (!res.ok) {
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, data);
  }
  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return (await res.blob()) as T;
  return res.json();
}

async function tryRefresh(): Promise<boolean> {
  const refresh = store.refresh;
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem("doto_access", data.access);
    if (data.refresh) localStorage.setItem("doto_refresh", data.refresh);
    return true;
  } catch {
    return false;
  }
}

/** Upload multipart avec même logique 401 → refresh → session expirée. */
async function authFetch(path: string, init: RequestInit, retry = true): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (store.access) headers.Authorization = `Bearer ${store.access}`;
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401 && retry) {
    if (store.refresh) {
      const refreshed = await tryRefresh();
      if (refreshed) return authFetch(path, init, false);
    }
    if (store.access || store.refresh) notifySessionExpired();
  }
  return res;
}

export const api = {
  url: API_URL,
  tokens: store,

  async loginPro(username: string, password: string) {
    const data = await request("/api/auth/login/", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    store.set({ access: data.access, refresh: data.refresh });
    const user = { ...data.user, pin_set: data.pin_set ?? data.user?.pin_set };
    localStorage.setItem("doto_user", JSON.stringify(user));
    return user;
  },

  logout() {
    const hadToken = !!store.access;
    if (hadToken) {
      request("/api/auth/logout/", { method: "POST" }).catch(() => {});
    }
    store.clear();
  },

  me: () => request("/api/auth/me/"),
  updateMe: (body: {
    first_name?: string;
    last_name?: string;
    telephone?: string;
    email?: string;
  }) => request("/api/auth/me/", { method: "PATCH", body: JSON.stringify(body) }),

  async setPin(pin: string, oldPin?: string) {
    const data = await request("/api/auth/set-pin/", {
      method: "POST",
      body: JSON.stringify({ pin, old_pin: oldPin || "" }),
    });
    saveLocalPin(pin);
    return data;
  },

  async verifyPin(pin: string) {
    // Déverrouillage local immédiat si le PIN est en cache client
    if (matchLocalPin(pin)) {
      void request("/api/auth/verify-pin/", {
        method: "POST",
        body: JSON.stringify({ pin }),
      }).catch(() => {});
      return { detail: "ok", local: true };
    }
    const data = await request("/api/auth/verify-pin/", {
      method: "POST",
      body: JSON.stringify({ pin }),
    });
    saveLocalPin(pin);
    return data;
  },
  async uploadPhoto(file: File) {
    const form = new FormData();
    form.append("photo", file);
    const res = await authFetch("/api/auth/me/photo/", { method: "POST", body: form });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(res.status, data);
    }
    return res.json();
  },
  hubDashboard: () => request("/api/hub/dashboard/"),
  /** URL EventSource — JWT en query (pas de header Authorization possible). */
  hubEventsUrl() {
    const access = encodeURIComponent(store.access || "");
    return `${API_URL}/api/hub/events/?access=${access}`;
  },
  searchPatients: (params: string) => request(`/api/patients/search/?${params}`),
  patientSuggestions: (params?: { q?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.q) q.set("q", params.q);
    if (params?.limit != null) q.set("limit", String(params.limit));
    const qs = q.toString();
    return request(`/api/patients/suggestions/${qs ? `?${qs}` : ""}`);
  },
  patient: (id: number | string) => request(`/api/patients/${id}/`),
  createPatient: (body: Record<string, unknown>) =>
    request("/api/patients/", { method: "POST", body: JSON.stringify(body) }),
  updatePatient: (id: number | string, body: Record<string, unknown>) =>
    request(`/api/patients/${id}/`, { method: "PATCH", body: JSON.stringify(body) }),
  urgence: (id: number | string) => request(`/api/patients/${id}/urgence/`),
  verifyAnip: (id: number | string) =>
    request(`/api/patients/${id}/verify_anip/`, { method: "POST" }),
  updateAssurance: (
    patientId: number | string,
    body: {
      assureur?: string;
      num_police?: string;
      droits_valides?: boolean;
      type_couverture?: string;
      valide_du?: string | null;
      valide_au?: string | null;
      garanties?: any[];
    }
  ) =>
    request(`/api/patients/${patientId}/assurance/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  consultations: (patient: number | string) =>
    request(`/api/consultations/?patient=${patient}`),
  createConsultation: (body: any) =>
    request("/api/consultations/", { method: "POST", body: JSON.stringify(body) }),
  annulerConsultation: (id: number) =>
    request(`/api/consultations/${id}/annuler/`, { method: "POST" }),
  ordonnances: (patient: number | string) =>
    request(`/api/ordonnances/?patient=${patient}`),
  /** Ordonnances actives d'un patient (dispensables dans toute pharmacie). */
  ordonnancesActives: (patient: number | string) =>
    request(`/api/ordonnances/?statut=active&patient=${patient}`),
  createOrdonnance: (body: any) =>
    request("/api/ordonnances/", { method: "POST", body: JSON.stringify(body) }),
  dispenser: (id: number) =>
    request(`/api/ordonnances/${id}/dispenser/`, { method: "POST" }),
  annulerOrdonnance: (id: number) =>
    request(`/api/ordonnances/${id}/annuler/`, { method: "POST" }),
  annulerDispense: (id: number) =>
    request(`/api/ordonnances/${id}/annuler-dispense/`, { method: "POST" }),
  examens: (patient: number | string) => request(`/api/examens/?patient=${patient}`),
  /** Liste examens (tous, filtres optionnels). */
  examensList: (params?: {
    patient?: number | string;
    categorie?: string;
    statut?: string;
    sans_fichier?: boolean;
    sans_resultat?: boolean;
  }) => {
    const q = new URLSearchParams();
    if (params?.patient != null) q.set("patient", String(params.patient));
    if (params?.categorie) q.set("categorie", params.categorie);
    if (params?.statut) q.set("statut", params.statut);
    if (params?.sans_fichier) q.set("sans_fichier", "1");
    if (params?.sans_resultat) q.set("sans_resultat", "1");
    const qs = q.toString();
    return request(`/api/examens/${qs ? `?${qs}` : ""}`);
  },
  mesUploadsExamens: () => request("/api/examens/mes_uploads/"),
  examensACompleter: () => request("/api/examens/a_completer/"),
  createExamen: (body: any) =>
    request("/api/examens/", { method: "POST", body: JSON.stringify(body) }),
  annulerExamen: (id: number) =>
    request(`/api/examens/${id}/annuler/`, { method: "POST" }),
  async uploadExamenFile(id: number, file: File) {
    const form = new FormData();
    form.append("fichier", file);
    const res = await authFetch(`/api/examens/${id}/upload/`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(res.status, data);
    }
    return res.json();
  },
  async createExamenMultipart(fields: Record<string, string>, file?: File | null) {
    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => form.append(k, v));
    if (file) form.append("fichier", file);
    const res = await authFetch("/api/examens/", { method: "POST", body: form });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(res.status, data);
    }
    return res.json();
  },
  constantes: (patient: number | string) =>
    request(`/api/constantes/?patient=${patient}`),
  createConstante: (body: any) =>
    request("/api/constantes/", { method: "POST", body: JSON.stringify(body) }),

  appointments: (params = "") => request(`/api/appointments/${params ? `?${params}` : ""}`),
  /** RDV du jour (filtre client) — exclut les annulés. */
  async appointmentsToday() {
    const data = await request("/api/appointments/");
    const raw = data?.results || data || [];
    const list = Array.isArray(raw) ? raw : [];
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    return list
      .filter((a: any) => {
        if (!a?.debut || a.statut === "annule") return false;
        const dt = new Date(a.debut);
        return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
      })
      .sort(
        (a: any, b: any) => new Date(a.debut).getTime() - new Date(b.debut).getTime()
      );
  },
  createAppointment: (body: any) =>
    request("/api/appointments/", { method: "POST", body: JSON.stringify(body) }),
  updateAppointment: (id: number, body: any) =>
    request(`/api/appointments/${id}/`, { method: "PATCH", body: JSON.stringify(body) }),
  listMedecinsRdv: () => request("/api/appointments/medecins/"),
  confirmerAppointment: (id: number | string) =>
    request(`/api/appointments/${id}/confirmer/`, { method: "POST" }),
  accessBlocks: (params = "") => request(`/api/access-blocks/${params ? `?${params}` : ""}`),

  /** OTP patient : inscription / changement MDP (pas login pro). */
  requestOtp: (phone: string, purpose: "register" | "password_change" | "password_reset" = "register") =>
    request("/api/auth/otp/", { method: "POST", body: JSON.stringify({ phone, purpose }) }),

  dodocards: (params = "") => request(`/api/dodocards/${params}`),
  scan: (token: string, emergency = false) =>
    request("/api/dodocards/scan/", {
      method: "POST",
      body: JSON.stringify({ token, emergency }),
    }),
  requestAccess: (patientId: number, opts?: { emergency?: boolean; reason?: string }) =>
    request("/api/access-requests/create/", {
      method: "POST",
      body: JSON.stringify({
        patient_id: patientId,
        mode: "search",
        emergency: !!opts?.emergency,
        ...(opts?.reason ? { reason: opts.reason } : {}),
      }),
    }),
  accessRequest: (id: number) => request(`/api/access-requests/${id}/`),
  cancelAccessRequest: (id: number) =>
    request(`/api/access-requests/${id}/cancel/`, { method: "POST" }),
  notifications: () => request("/api/notifications/"),
  unreadCount: () => request("/api/notifications/unread_count/"),
  markNotifRead: (id: number) =>
    request(`/api/notifications/${id}/read/`, { method: "POST" }),
  markAllNotifsRead: () =>
    request("/api/notifications/read_all/", { method: "POST" }),
  qrUrl: (id: number) => `${API_URL}/api/dodocards/${id}/qr/`,
  revokeCard: (id: number) =>
    request(`/api/dodocards/${id}/revoke/`, {
      method: "POST",
      body: JSON.stringify({ motif: "perte" }),
    }),
  reissueCard: (id: number) =>
    request(`/api/dodocards/${id}/reissue/`, {
      method: "POST",
      body: JSON.stringify({ motif: "reemission_admin" }),
    }),
  raw: request,
};

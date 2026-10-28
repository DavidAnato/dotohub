import { create } from "zustand";
import { api } from "../api";
import { formatDrfData, humanizeApiText, inferToastTone, type ToastTone } from "../apiMessage";
import { queryClient } from "../queries/queryClient";

export type ThemeMode = "light" | "dark";

export type PendingIdOcr = {
  npi?: string;
  first_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  birth_place?: string | null;
  phone?: string | null;
  address_commune?: string | null;
  address_arrondissement?: string | null;
  address_quartier?: string | null;
  father_name?: string | null;
  mother_name?: string | null;
  card_type?: string | null;
  ts?: string;
};

export interface HubUser {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  full_name: string;
  email?: string;
  telephone?: string;
  role: string;
  role_label: string;
  photo_url?: string | null;
  photo_required?: boolean;
  pin_set?: boolean;
  specialite?: string;
  structures?: { id?: number; nom: string }[];
  structure_principale?: number | null;
  type_exercice?: string | null;
  nom_etablissement?: string | null;
  pending_validation?: boolean;
  compte_statut?: string;
}

type AppState = {
  user: HubUser | null;
  authLoading: boolean;
  theme: ThemeMode;
  online: boolean;
  toast: string;
  toastTone: ToastTone;
  sseOk: boolean;
  unread: number;
  pendingAccessId: number | null;
  /** OCR CIP / CEDEAO reçu du téléphone (même compte). */
  pendingIdOcr: PendingIdOcr | null;
  /** Verrouillage session PIN (obligatoire pro) */
  sessionLocked: boolean;
  needsPinSetup: boolean;
  setUser: (u: HubUser | null) => void;
  setAuthLoading: (v: boolean) => void;
  setOnline: (v: boolean) => void;
  setToast: (msg: string, tone?: ToastTone) => void;
  setSseOk: (v: boolean) => void;
  setUnread: (n: number) => void;
  bumpUnread: () => void;
  setPendingAccessId: (id: number | null) => void;
  setPendingIdOcr: (ocr: PendingIdOcr | null) => void;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
  hydrateTheme: () => void;
  setSessionLocked: (v: boolean) => void;
  setNeedsPinSetup: (v: boolean) => void;
  login: (username: string, password: string) => Promise<void>;
  acceptSession: (user: HubUser) => void;
  logout: () => void;
  /** Déconnexion locale après échec refresh JWT (pas d'appel API logout). */
  sessionExpired: (message?: string) => void;
  bootstrapAuth: () => Promise<void>;
};

const THEME_KEY = "dotohub_theme";

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}

function readTheme(): ThemeMode {
  const saved = localStorage.getItem(THEME_KEY) as ThemeMode | null;
  if (saved === "light" || saved === "dark") return saved;
  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

export const useAppStore = create<AppState>((set, get) => ({
  user: (() => {
    try {
      const raw = localStorage.getItem("doto_user");
      return raw ? (JSON.parse(raw) as HubUser) : null;
    } catch {
      return null;
    }
  })(),
  authLoading: true,
  theme: "light",
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  toast: "",
  toastTone: "info",
  sseOk: false,
  unread: 0,
  pendingAccessId: null,
  pendingIdOcr: null,
  sessionLocked: false,
  needsPinSetup: false,

  setUser: (user) => set({ user }),
  setAuthLoading: (authLoading) => set({ authLoading }),
  setOnline: (online) => set({ online }),
  setToast: (msg, tone) => {
    const raw = typeof msg === "string" ? msg : formatDrfData(msg as unknown);
    const toast = humanizeApiText(raw);
    if (!toast) {
      set({ toast: "", toastTone: "info" });
      return;
    }
    set({ toast, toastTone: tone ?? inferToastTone(toast) });
  },
  setSseOk: (sseOk) => set({ sseOk }),
  setUnread: (unread) => set({ unread }),
  bumpUnread: () => set((s) => ({ unread: s.unread + 1 })),
  setPendingAccessId: (pendingAccessId) => set({ pendingAccessId }),
  setPendingIdOcr: (pendingIdOcr) => set({ pendingIdOcr }),
  setSessionLocked: (sessionLocked) => set({ sessionLocked }),
  setNeedsPinSetup: (needsPinSetup) => set({ needsPinSetup }),

  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    get().setTheme(next);
  },
  hydrateTheme: () => {
    const theme = readTheme();
    applyTheme(theme);
    set({ theme });
  },

  login: async (username, password) => {
    const user = await api.loginPro(username, password);
    get().acceptSession(user);
  },
  acceptSession: (user) => {
    const needsSetup = !user.pin_set;
    set({
      user,
      needsPinSetup: needsSetup,
      sessionLocked: !needsSetup,
    });
  },
  logout: () => {
    api.logout();
    queryClient.clear();
    set({
      user: null,
      sseOk: false,
      toast: "",
      toastTone: "info",
      unread: 0,
      pendingAccessId: null,
      pendingIdOcr: null,
      sessionLocked: false,
      needsPinSetup: false,
    });
  },
  sessionExpired: (message = "Session expirée, reconnectez-vous") => {
    api.tokens.clear();
    queryClient.clear();
    const toast = humanizeApiText(message);
    set({
      user: null,
      sseOk: false,
      toast,
      toastTone: "error",
      unread: 0,
      pendingAccessId: null,
      pendingIdOcr: null,
      sessionLocked: false,
      needsPinSetup: false,
    });
    window.setTimeout(() => {
      if (get().toast === toast) set({ toast: "", toastTone: "info" });
    }, 4500);
  },
  bootstrapAuth: async () => {
    if (!api.tokens.access) {
      set({ authLoading: false });
      return;
    }
    try {
      const user = await api.me();
      localStorage.setItem("doto_user", JSON.stringify(user));
      const needsSetup = !user.pin_set;
      set({
        user,
        authLoading: false,
        needsPinSetup: needsSetup,
        sessionLocked: !needsSetup,
      });
    } catch {
      api.logout();
      set({ user: null, authLoading: false, sessionLocked: false, needsPinSetup: false });
    }
  },
}));

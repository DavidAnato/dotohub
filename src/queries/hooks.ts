import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useAppStore } from "../store/appStore";
import { qk } from "./keys";

const STALE_MS = 5 * 60 * 1000;
const DASH_CACHE = "dotohub_dash_cache";

export function useHubDashboard() {
  const online = useAppStore((s) => s.online);
  return useQuery({
    queryKey: qk.hubDashboard,
    queryFn: async () => {
      if (!online) {
        const raw = localStorage.getItem(DASH_CACHE);
        if (raw) return { data: JSON.parse(raw), fromCache: true as const };
        return { data: {}, fromCache: true as const };
      }
      try {
        const data = await api.hubDashboard();
        localStorage.setItem(DASH_CACHE, JSON.stringify(data));
        return { data, fromCache: false as const };
      } catch {
        const raw = localStorage.getItem(DASH_CACHE);
        if (raw) return { data: JSON.parse(raw), fromCache: true as const };
        throw new Error("Tableau de bord indisponible");
      }
    },
    refetchInterval: online ? 15_000 : false,
    refetchOnWindowFocus: true,
  });
}

export function usePatient(id: string | number | undefined) {
  const online = useAppStore((s) => s.online);
  return useQuery({
    queryKey: qk.patient(id ?? "none"),
    queryFn: () => api.patient(id!),
    enabled: !!id,
    staleTime: online ? 0 : 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnMount: online ? "always" : false,
    networkMode: "offlineFirst",
  });
}

export function useConsultations(patientId: number | undefined) {
  const online = useAppStore((s) => s.online);
  return useQuery({
    queryKey: qk.consultations(patientId ?? "none"),
    queryFn: () => api.consultations(patientId!),
    enabled: !!patientId,
    staleTime: online ? STALE_MS : 24 * 60 * 60 * 1000,
    networkMode: "offlineFirst",
  });
}

export function useOrdonnances(patientId: number | undefined) {
  return useQuery({
    queryKey: qk.ordonnances(patientId ?? "none"),
    queryFn: () => api.ordonnances(patientId!),
    enabled: !!patientId,
    networkMode: "offlineFirst",
  });
}

export function useExamens(patientId: number | undefined) {
  return useQuery({
    queryKey: qk.examens(patientId ?? "none"),
    queryFn: () => api.examens(patientId!),
    enabled: !!patientId,
    networkMode: "offlineFirst",
  });
}

export function useConstantes(patientId: number | undefined) {
  return useQuery({
    queryKey: qk.constantes(patientId ?? "none"),
    queryFn: () => api.constantes(patientId!),
    enabled: !!patientId,
    networkMode: "offlineFirst",
  });
}

export function useDodoCards(params = "") {
  return useQuery({
    queryKey: qk.dodocards(params),
    queryFn: async () => {
      const r = await api.dodocards(params);
      return r.results || r;
    },
  });
}

export function useSearchPatients() {
  return useMutation({
    mutationFn: (params: string) => api.searchPatients(params),
  });
}

export function useScanCard() {
  return useMutation({
    mutationFn: (token: string) => api.scan(token),
  });
}

export function useVerifyAnip(patientId: string | number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.verifyAnip(patientId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.patient(patientId) });
    },
  });
}

export function useRevokeCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.revokeCard(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dodocards"] }),
  });
}

export function useReissueCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.reissueCard(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dodocards"] }),
  });
}

export function useCreateConsultation(patientId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.createConsultation(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.consultations(patientId) });
      qc.invalidateQueries({ queryKey: qk.hubDashboard });
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

export function useUpdateConsultation(patientId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: unknown }) => api.updateConsultation(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.consultations(patientId) });
      qc.invalidateQueries({ queryKey: qk.hubDashboard });
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

export function useAnnulerConsultation(patientId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.annulerConsultation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.consultations(patientId) }),
  });
}

export function useCreateOrdonnance(patientId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.createOrdonnance(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ordonnances(patientId) }),
  });
}

export function useDispenser(patientId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.dispenser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ordonnances(patientId) }),
  });
}

export function useAnnulerOrdonnance(patientId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.annulerOrdonnance(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ordonnances(patientId) }),
  });
}

export function useAnnulerDispense(patientId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.annulerDispense(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.ordonnances(patientId) }),
  });
}

export function useAnnulerExamen(patientId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.annulerExamen(id),
    onSuccess: () => {
      if (patientId != null) {
        qc.invalidateQueries({ queryKey: qk.examens(patientId) });
      }
      qc.invalidateQueries({ queryKey: ["labo-examens"] });
    },
  });
}

export function useCreateConstante(patientId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.createConstante(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.constantes(patientId) }),
  });
}

export function useLoginMutation() {
  const login = useAppStore((s) => s.login);
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      login(username, password),
  });
}

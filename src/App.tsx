import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Calendar, CreditCard, Home, Inbox, LogOut, Moon, Search, Sun, UserRound } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth";
import { OfflineBanner, Toast } from "./components";
import { NotificationBell } from "./components/NotificationBell";
import { Avatar } from "./components/Avatar";
import { PinSessionGate } from "./components/PinSessionGate";
import { HospitalAttachGate } from "./components/HospitalAttachGate";
import { useHubSSE, type HubSseEvent } from "./hooks";
import { useAppStore } from "./store/appStore";
import { api } from "./api";
import { canSeeAgenda, canSeeDodoCards, canSeeDemandes } from "./roleNav";
import { qk } from "./queries/keys";
import { needsHospitalAttach, PIN_ERROR, PIN_REGEX } from "./constants";
import Login from "./pages/Login";
import Inscription from "./pages/Inscription";
import Accueil from "./pages/Accueil";
import Recherche from "./pages/Recherche";
import Patient from "./pages/Patient";
import RendezVous from "./pages/RendezVous";
import Profil from "./pages/Profil";
import NouveauPatient from "./pages/NouveauPatient";
import PharmaFile from "./pages/PharmaFile";
import LaboFile from "./pages/LaboFile";
import Tournee from "./pages/Tournee";
import DodoCards from "./pages/DodoCards";
import Demandes from "./pages/Demandes";

const IDLE_LOCK_MS = 15 * 60 * 1000; // inactivité sur la page
const AWAY_LOCK_MS = 15 * 60 * 1000; // absence onglet / app (pas de verrou immédiat)

function invalidatePatientMedical(
  qc: ReturnType<typeof useQueryClient>,
  patientId: number | string | undefined | null
) {
  if (patientId == null || patientId === "") return;
  const id = String(patientId);
  const num = Number(patientId);
  const ids = Number.isFinite(num) ? [id, num] : [id];

  for (const pid of ids) {
    void qc.invalidateQueries({ queryKey: qk.patient(pid) });
    void qc.invalidateQueries({ queryKey: qk.consultations(pid) });
    void qc.invalidateQueries({ queryKey: qk.ordonnances(pid) });
    void qc.invalidateQueries({ queryKey: qk.examens(pid) });
    void qc.invalidateQueries({ queryKey: qk.constantes(pid) });
    void qc.invalidateQueries({ queryKey: qk.urgence(pid) });
    void qc.invalidateQueries({ queryKey: ["patient", pid] });
  }
  // Clés legacy / pages pharma-labo
  void qc.invalidateQueries({ queryKey: ["ordonnances"] });
  void qc.invalidateQueries({ queryKey: ["labo-examens"] });
}

function invalidateFromHubEvent(
  qc: ReturnType<typeof useQueryClient>,
  ev: HubSseEvent
) {
  const pid = ev.patient_id ?? ev.payload?.patient_id;
  const section = ev.payload?.section || ev.notif_type || ev.type;

  if (
    section === "rdv" ||
    ev.type === "appointment" ||
    String(ev.payload?.kind || "").startsWith("rdv")
  ) {
    void qc.invalidateQueries({ queryKey: ["appointments"] });
    void qc.invalidateQueries({ queryKey: qk.hubDashboard });
  }

  if (
    ev.type === "insurance_updated" ||
    section === "assurance" ||
    String(ev.payload?.kind || "").startsWith("insurance")
  ) {
    invalidatePatientMedical(qc, pid);
    void qc.invalidateQueries({ queryKey: qk.hubDashboard });
    void qc.invalidateQueries({ queryKey: ["dodocards"] });
  }

  if (
    ev.type === "patient_list" ||
    ev.type === "insurance_updated" ||
    ev.type === "dossier_updated" ||
    ev.type === "ordonnance" ||
    ev.type === "examen" ||
    ev.notif_type === "ordonnance" ||
    ev.notif_type === "examen" ||
    ev.notif_type === "dossier_updated" ||
    ev.notif_type === "bon_examen" ||
    section === "ordonnances" ||
    section === "examens" ||
    section === "dossier"
  ) {
    invalidatePatientMedical(qc, pid);
    void qc.invalidateQueries({ queryKey: qk.hubDashboard });
    void qc.invalidateQueries({ queryKey: ["exam-orders"] });
    void qc.invalidateQueries({ queryKey: ["labo-examens"] });
  } else if (pid != null) {
    invalidatePatientMedical(qc, pid);
  }
}

function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;
  const qc = useQueryClient();
  const online = useAppStore((s) => s.online);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const setToast = useAppStore((s) => s.setToast);
  const bumpUnread = useAppStore((s) => s.bumpUnread);
  const setPendingAccessId = useAppStore((s) => s.setPendingAccessId);
  const setPendingIdOcr = useAppStore((s) => s.setPendingIdOcr);

  const kickFromPatientIfOpen = useCallback(
    (patientId: number | string | undefined | null, message: string) => {
      if (patientId == null || patientId === "") return;
      const path = locationRef.current.pathname;
      const m = path.match(/^\/patient\/([^/]+)/);
      const onPatient =
        m && (m[1] === String(patientId) || Number(m[1]) === Number(patientId));
      const onPharmaLab =
        path.startsWith("/pharma") || path.startsWith("/labo") || path.startsWith("/urgence");
      setToast(message);
      window.setTimeout(() => setToast(""), 5500);
      if (onPatient || onPharmaLab) {
        nav("/", { replace: true });
      }
    },
    [nav, setToast]
  );

  const seenLive = useRef(new Set<string>());

  const onSse = useCallback(
    (ev: HubSseEvent) => {
      if (ev.type !== "connected" && ev.type !== "ping") {
        const key = `${ev.type}|${ev.patient_id ?? ""}|${ev.access_request_id ?? ""}|${ev.ts ?? ""}`;
        if (seenLive.current.has(key)) return;
        seenLive.current.add(key);
      }
      if (ev.type === "connected") {
        return;
      }
      if (ev.type === "ping") return;

      if (ev.type === "notification") {
        bumpUnread();
        if (ev.title) {
          setToast(ev.title);
          window.setTimeout(() => setToast(""), 4200);
        }
        qc.invalidateQueries({ queryKey: ["notifications"] });
        invalidateFromHubEvent(qc, ev);
        // Révocation aussi via notif (si l'event typé a été raté)
        if (ev.payload?.revoked || ev.payload?.close_dossier) {
          const pid = ev.payload?.patient_id ?? ev.patient_id;
          const msg =
            (typeof ev.payload?.message === "string" && ev.payload.message) ||
            ev.body ||
            "Accès révoqué par le patient. Le dossier se ferme.";
          kickFromPatientIfOpen(pid as number | string | undefined, msg);
        }
        return;
      }
      if (
        ev.type === "dossier_updated" ||
        ev.type === "ordonnance" ||
        ev.type === "examen" ||
        ev.type === "appointment" ||
        ev.type === "patient_list" ||
        ev.type === "insurance_updated"
      ) {
        invalidateFromHubEvent(qc, ev);
        return;
      }
      if (ev.type === "access_pending" && ev.patient_id) {
        if (ev.access_request_id) setPendingAccessId(ev.access_request_id);
        const viaHopital = (ev as { route?: string }).route === "hopital_mere";
        setToast(
          viaHopital
            ? "Demande envoyée à l'hôpital mère. Le dossier reste fermé."
            : "Demande envoyée au patient - en attente de confirmation…"
        );
        nav(`/patient/${ev.patient_id}`);
        return;
      }
      if (ev.type === "access_granted" && ev.patient_id) {
        setPendingAccessId(null);
        const label = ev.full_name || ev.npi || `#${ev.patient_id}`;
        setToast(
          ev.emergency
            ? `Accès urgence - ${label}`
            : `Accès autorisé - ouverture du dossier ${label}`
        );
        invalidatePatientMedical(qc, ev.patient_id);
        nav(`/patient/${ev.patient_id}`);
        window.setTimeout(() => setToast(""), 4200);
        return;
      }
      if (ev.type === "access_awaiting_prior") {
        const label = ev.full_name || ev.npi || (ev.patient_id ? `#${ev.patient_id}` : "le patient");
        setToast(`Patient d'accord — en attente de l'ancien médecin · ${label}`);
        if (ev.patient_id) invalidatePatientMedical(qc, ev.patient_id);
        window.setTimeout(() => setToast(""), 4200);
        return;
      }
      if (ev.type === "access_denied") {
        setPendingAccessId(null);
        setToast(
          (ev as { prior_denied?: boolean }).prior_denied
            ? "Transfert refusé par l'ancien médecin."
            : (ev as { hopital_denied?: boolean }).hopital_denied
              ? "Accès refusé par l'hôpital mère."
              : "Accès refusé par le patient."
        );
        window.setTimeout(() => setToast(""), 4200);
        return;
      }
      if (ev.type === "access_expired") {
        setPendingAccessId(null);
        const msg =
          (typeof (ev as { message?: string }).message === "string" &&
            (ev as { message?: string }).message) ||
          "Cet accès a expiré";
        kickFromPatientIfOpen(ev.patient_id, msg);
        if (ev.patient_id) invalidatePatientMedical(qc, ev.patient_id);
        return;
      }
      if (ev.type === "access_revoked") {
        setPendingAccessId(null);
        const msg =
          (typeof (ev as { message?: string }).message === "string" &&
            (ev as { message?: string }).message) ||
          "Accès révoqué par le patient. Le dossier se ferme.";
        kickFromPatientIfOpen(ev.patient_id, msg);
        if (ev.patient_id) invalidatePatientMedical(qc, ev.patient_id);
        return;
      }
      if (ev.type === "patient_id_ocr") {
        setPendingIdOcr({
          npi: ev.npi,
          first_name: (ev as { first_name?: string | null }).first_name,
          last_name: (ev as { last_name?: string | null }).last_name,
          birth_date: (ev as { birth_date?: string | null }).birth_date,
          birth_place: (ev as { birth_place?: string | null }).birth_place,
          phone: (ev as { phone?: string | null }).phone,
          address_commune: (ev as { address_commune?: string | null }).address_commune,
          address_arrondissement: (ev as { address_arrondissement?: string | null }).address_arrondissement,
          address_quartier: (ev as { address_quartier?: string | null }).address_quartier,
          father_name: (ev as { father_name?: string | null }).father_name,
          mother_name: (ev as { mother_name?: string | null }).mother_name,
          card_type: (ev as { card_type?: string | null }).card_type,
          ts: ev.ts,
        });
        setToast("Pièce lue — vérifiez les informations du nouveau patient");
        if (!locationRef.current.pathname.startsWith("/patients/nouveau")) {
          nav("/patients/nouveau");
        }
        window.setTimeout(() => setToast(""), 4200);
        return;
      }
      if (ev.type === "dodocard_scan" && ev.patient_id) {
        if ((ev as { access_expired?: boolean }).access_expired) {
          kickFromPatientIfOpen(ev.patient_id, "Cet accès a expiré");
          if (ev.patient_id) invalidatePatientMedical(qc, ev.patient_id);
          return;
        }
        if ((ev as { duration_required?: boolean }).duration_required) {
          setToast("Indiquez la durée d'accès. Le dossier reste fermé.");
          nav(`/patient/${ev.patient_id}`);
          window.setTimeout(() => setToast(""), 4200);
          return;
        }
        if ((ev as { dossier_visible?: boolean }).dossier_visible === false) {
          if (ev.access_request_id) setPendingAccessId(ev.access_request_id);
          setToast(
            (ev as { message?: string }).message ||
              "Demande envoyée à l'hôpital mère. Le dossier reste fermé."
          );
          nav(`/patient/${ev.patient_id}`);
          window.setTimeout(() => setToast(""), 4200);
          return;
        }
        // Scan mobile (même compte JWT) → ouvrir le dossier ici, même depuis Accueil / autre page.
        if (ev.consent_required && ev.access_request_id) {
          setPendingAccessId(ev.access_request_id);
        } else if (!ev.consent_required) {
          setPendingAccessId(null);
        }
        const label = ev.full_name || ev.npi || `#${ev.patient_id}`;
        setToast(
          ev.consent_required
            ? `Scan DotoCard - en attente de consentement · ${label}`
            : `Scan DotoCard - ouverture du dossier ${label}`
        );
        invalidatePatientMedical(qc, ev.patient_id);
        nav(`/patient/${ev.patient_id}`);
        window.setTimeout(() => setToast(""), 4200);
      }
    },
    [nav, setToast, bumpUnread, setPendingAccessId, setPendingIdOcr, qc, kickFromPatientIfOpen]
  );

  useHubSSE(!!user, onSse);

  useEffect(() => {
    if (!user) return;
    let stop = false;
    const pull = async () => {
      try {
        const data = await api.hubLive();
        if (stop) return;
        for (const ev of data?.events || []) onSse(ev);
      } catch {
        /* le flux SSE reste le canal principal */
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), 2000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [user, onSse]);

  const role = user?.role;
  const links: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
    { to: "/", label: "Accueil", icon: Home, end: true },
    { to: "/recherche", label: "Recherche patient", icon: Search },
    ...(canSeeAgenda(role) ? [{ to: "/rdv", label: "Rendez-vous", icon: Calendar }] : []),
    ...(canSeeDemandes(role) ? [{ to: "/demandes", label: "Demandes", icon: Inbox }] : []),
    ...(canSeeDodoCards(role) ? [{ to: "/dotocards", label: "DotoCards", icon: CreditCard }] : []),
    { to: "/parametres", label: "Paramètres", icon: UserRound },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand brand-wordmark">
          <img src="/logo-dotohub.png" alt="DotoHub" className="brand-logo" />
          <div>
            <span>Professionnels · DOTO+</span>
          </div>
        </div>
        <nav className="nav-stack">
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
              >
                <span className="nav-ico">
                  <Icon size={18} strokeWidth={2} />
                </span>
                {l.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="foot" />
      </aside>
      <div className="main">
        <OfflineBanner online={online} />
        <div className="topbar">
          <strong className="topbar-title">DotoHub</strong>
          <div className="row topbar-actions">
            <NotificationBell />
            <button
              type="button"
              className="btn ghost sm icon-btn"
              onClick={toggleTheme}
              title={theme === "dark" ? "Mode clair" : "Mode sombre"}
              aria-label="Basculer le thème"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button
              type="button"
              className="topbar-user"
              onClick={() => nav("/parametres")}
              title="Paramètres du compte"
              aria-label="Ouvrir les paramètres du compte"
            >
              <div className="topbar-user-meta">
                <div style={{ fontWeight: 600 }}>{user?.full_name}</div>
                <div className="small muted">{user?.role_label}</div>
              </div>
              <Avatar src={user?.photo_url} name={user?.full_name} size={36} />
            </button>
            <button
              className="btn ghost sm topbar-logout"
              onClick={() => {
                logout();
                nav("/login");
              }}
            >
              <LogOut size={14} strokeWidth={2} aria-hidden />
              <span className="topbar-logout-label">Déconnexion</span>
            </button>
          </div>
        </div>
        <div className="content page-enter">
          <Outlet />
        </div>
      </div>
      <nav className="mobile-nav" aria-label="Navigation principale">
        {links.map((l) => {
          const Icon = l.icon;
          return (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => "mobile-nav-link" + (isActive ? " active" : "")}
            >
              <Icon size={20} strokeWidth={2} />
              <span>{l.label.split(" ")[0]}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

/** Layout unique : SSE reste connecté en naviguant (Accueil → Patient, etc.). */
function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="page-enter" style={{ padding: 40 }}>
        <div className="skel" style={{ height: 24, width: 180, marginBottom: 16 }} />
        <div className="skel" style={{ height: 120, width: "100%" }} />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  const { user } = useAuth();
  const toast = useAppStore((s) => s.toast);
  const toastTone = useAppStore((s) => s.toastTone);
  const setToast = useAppStore((s) => s.setToast);
  const sessionLocked = useAppStore((s) => s.sessionLocked);
  const needsPinSetup = useAppStore((s) => s.needsPinSetup);
  const setSessionLocked = useAppStore((s) => s.setSessionLocked);
  const setNeedsPinSetup = useAppStore((s) => s.setNeedsPinSetup);
  const setUser = useAppStore((s) => s.setUser);
  const [pinError, setPinError] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const pinBusyRef = useRef(false);
  const idleTimer = useRef<number | null>(null);
  const hiddenAt = useRef<number | null>(null);

  const lockSession = useCallback(() => {
    if (!user || needsPinSetup) return;
    setSessionLocked(true);
    setPinError("");
  }, [user, needsPinSetup, setSessionLocked]);

  const bumpIdle = useCallback(() => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    if (!user || needsPinSetup || sessionLocked) return;
    idleTimer.current = window.setTimeout(lockSession, IDLE_LOCK_MS);
  }, [user, needsPinSetup, sessionLocked, lockSession]);

  useEffect(() => {
    if (!user) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        // Ne pas verrouiller tout de suite - mémoriser le départ
        hiddenAt.current = Date.now();
        if (idleTimer.current) window.clearTimeout(idleTimer.current);
        return;
      }
      // Retour : verrouiller seulement si absence >= AWAY_LOCK_MS
      const left = hiddenAt.current;
      hiddenAt.current = null;
      if (left != null && Date.now() - left >= AWAY_LOCK_MS) {
        lockSession();
      } else {
        bumpIdle();
      }
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, bumpIdle, { passive: true }));
    document.addEventListener("visibilitychange", onVis);
    bumpIdle();
    return () => {
      events.forEach((e) => window.removeEventListener(e, bumpIdle));
      document.removeEventListener("visibilitychange", onVis);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, [user, bumpIdle, lockSession]);

  const handleSetupPin = async (pin: string) => {
    if (pinBusyRef.current) return;
    if (!PIN_REGEX.test(pin)) {
      setPinError(PIN_ERROR);
      return;
    }
    pinBusyRef.current = true;
    setPinBusy(true);
    setPinError("");
    try {
      await api.setPin(pin);
      const next = user ? { ...user, pin_set: true } : null;
      if (next) {
        localStorage.setItem("doto_user", JSON.stringify(next));
        setUser(next);
      }
      setNeedsPinSetup(false);
      setSessionLocked(false);
    } catch (e: any) {
      setPinError(e?.data?.detail || e?.message || "Impossible d'enregistrer le PIN.");
    } finally {
      pinBusyRef.current = false;
      setPinBusy(false);
    }
  };

  const handleUnlock = async (pin: string) => {
    if (pinBusyRef.current) return;
    if (!PIN_REGEX.test(pin)) {
      setPinError(PIN_ERROR);
      return;
    }
    pinBusyRef.current = true;
    setPinBusy(true);
    setPinError("");
    try {
      await api.verifyPin(pin);
      setSessionLocked(false);
      bumpIdle();
    } catch (e: any) {
      setPinError(e?.data?.detail || e?.message || "PIN incorrect.");
    } finally {
      pinBusyRef.current = false;
      setPinBusy(false);
    }
  };

  const showPinGate = !!user && (needsPinSetup || sessionLocked);
  const showHospitalGate = !!user && !showPinGate && needsHospitalAttach(user);

  return (
    <>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route path="/inscription" element={user ? <Navigate to="/" /> : <Inscription />} />
        <Route path="/register" element={<Navigate to="/inscription" replace />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Accueil />} />
          <Route path="/recherche" element={<Recherche />} />
          <Route path="/rdv" element={<RendezVous />} />
          <Route path="/patients/nouveau" element={<NouveauPatient />} />
          <Route path="/pharma" element={<PharmaFile />} />
          <Route path="/labo" element={<LaboFile />} />
          <Route path="/tournee" element={<Tournee />} />
          <Route path="/dotocards" element={<DodoCards />} />
          <Route path="/demandes" element={<Demandes />} />
          <Route path="/dodocards" element={<Navigate to="/dotocards" replace />} />
          <Route path="/patient/:id" element={<Patient />} />
          <Route path="/profil" element={<Profil />} />
          <Route path="/parametres" element={<Profil />} />
        </Route>
        <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
      </Routes>
      <Toast message={toast} tone={toastTone} onClose={() => setToast("")} />
      {showPinGate ? (
        <PinSessionGate
          mode={needsPinSetup ? "setup" : "unlock"}
          error={pinError}
          busy={pinBusy}
          onSubmit={needsPinSetup ? handleSetupPin : handleUnlock}
        />
      ) : null}
      {showHospitalGate ? (
        <HospitalAttachGate onDone={(u) => setUser(u)} />
      ) : null}
    </>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Home, Search, LogOut, Moon, Sun, Radio, Calendar, UserRound, CreditCard } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth";
import { OfflineBanner, Toast } from "./components";
import { NotificationBell } from "./components/NotificationBell";
import { Avatar } from "./components/Avatar";
import { PinSessionGate } from "./components/PinSessionGate";
import { useHubSSE, type HubSseEvent } from "./hooks";
import { useAppStore } from "./store/appStore";
import { api } from "./api";
import { canSeeAgenda, canSeeDodoCards } from "./roleNav";
import { qk } from "./queries/keys";
import Login from "./pages/Login";
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
  }

  if (
    ev.type === "dossier_updated" ||
    ev.type === "ordonnance" ||
    ev.type === "examen" ||
    ev.notif_type === "ordonnance" ||
    ev.notif_type === "examen" ||
    ev.notif_type === "dossier_updated" ||
    section === "ordonnances" ||
    section === "examens" ||
    section === "dossier"
  ) {
    invalidatePatientMedical(qc, pid);
    void qc.invalidateQueries({ queryKey: qk.hubDashboard });
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
  const [sseOk, setSseOk] = useState(false);

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

  const onSse = useCallback(
    (ev: HubSseEvent) => {
      if (ev.type === "connected") {
        setSseOk(true);
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
        ev.type === "appointment"
      ) {
        invalidateFromHubEvent(qc, ev);
        return;
      }
      if (ev.type === "access_pending" && ev.patient_id) {
        if (ev.access_request_id) setPendingAccessId(ev.access_request_id);
        setToast("Demande envoyée au patient — en attente de confirmation…");
        nav(`/patient/${ev.patient_id}`);
        return;
      }
      if (ev.type === "access_granted" && ev.patient_id) {
        setPendingAccessId(null);
        const label = ev.full_name || ev.npi || `#${ev.patient_id}`;
        setToast(
          ev.emergency
            ? `Accès urgence — ${label}`
            : `Accès autorisé — ouverture du dossier ${label}`
        );
        invalidatePatientMedical(qc, ev.patient_id);
        nav(`/patient/${ev.patient_id}`);
        window.setTimeout(() => setToast(""), 4200);
        return;
      }
      if (ev.type === "access_denied") {
        setPendingAccessId(null);
        setToast("Accès refusé par le patient.");
        window.setTimeout(() => setToast(""), 4200);
        return;
      }
      if (ev.type === "access_expired") {
        setPendingAccessId(null);
        const msg = "Demande d'accès expirée. Le dossier se ferme.";
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
      if (ev.type === "dodocard_scan" && ev.patient_id) {
        // Scan mobile (même compte JWT) → ouvrir le dossier ici, même depuis Accueil / autre page.
        if (ev.consent_required && ev.access_request_id) {
          setPendingAccessId(ev.access_request_id);
        } else if (!ev.consent_required) {
          setPendingAccessId(null);
        }
        const label = ev.full_name || ev.npi || `#${ev.patient_id}`;
        setToast(
          ev.consent_required
            ? `Scan DotoCard — en attente de consentement · ${label}`
            : `Scan DotoCard — ouverture du dossier ${label}`
        );
        invalidatePatientMedical(qc, ev.patient_id);
        nav(`/patient/${ev.patient_id}`);
        window.setTimeout(() => setToast(""), 4200);
      }
    },
    [nav, setToast, bumpUnread, setPendingAccessId, qc, kickFromPatientIfOpen]
  );

  const { status: sseStatus } = useHubSSE(!!user, onSse);

  const role = user?.role;
  const links: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
    { to: "/", label: "Accueil", icon: Home, end: true },
    { to: "/recherche", label: "Recherche patient", icon: Search },
    ...(canSeeAgenda(role) ? [{ to: "/rdv", label: "Rendez-vous", icon: Calendar }] : []),
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
        <div className="foot">
          <div className={`sse-pill ${sseStatus === "open" || sseOk ? "on" : ""}`}>
            <Radio size={12} strokeWidth={2.5} aria-hidden />
            {sseStatus === "open" || sseOk ? "Temps réel actif" : "Connexion…"}
          </div>
        </div>
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
            <div
              role="button"
              tabIndex={0}
              className="topbar-user"
              onClick={() => nav("/profil")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") nav("/profil");
              }}
              title="Mon profil"
            >
              <div className="topbar-user-meta">
                <div style={{ fontWeight: 600 }}>{user?.full_name}</div>
                <div className="small muted">{user?.role_label}</div>
              </div>
              <Avatar src={user?.photo_url} name={user?.full_name} size={36} />
            </div>
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
        // Ne pas verrouiller tout de suite — mémoriser le départ
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

  return (
    <>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Accueil />} />
          <Route path="/recherche" element={<Recherche />} />
          <Route path="/rdv" element={<RendezVous />} />
          <Route path="/patients/nouveau" element={<NouveauPatient />} />
          <Route path="/pharma" element={<PharmaFile />} />
          <Route path="/labo" element={<LaboFile />} />
          <Route path="/tournee" element={<Tournee />} />
          <Route path="/dotocards" element={<DodoCards />} />
          <Route path="/dodocards" element={<Navigate to="/dotocards" replace />} />
          <Route path="/patient/:id" element={<Patient />} />
          <Route path="/profil" element={<Profil />} />
          <Route path="/parametres" element={<Profil />} />
        </Route>
        <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
      </Routes>
      <Toast message={toast} onClose={() => setToast("")} />
      {showPinGate ? (
        <PinSessionGate
          mode={needsPinSetup ? "setup" : "unlock"}
          error={pinError}
          busy={pinBusy}
          onSubmit={needsPinSetup ? handleSetupPin : handleUnlock}
        />
      ) : null}
    </>
  );
}

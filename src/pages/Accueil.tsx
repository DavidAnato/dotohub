import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  Pill,
  Camera,
  UserRound,
  Search,
  IdCard,
  WalletCards,
  Zap,
  FlaskConical,
  Route,
  UserPlus,
  Siren,
} from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Skeleton } from "../components";
import { Avatar } from "../components/Avatar";
import { useHubDashboard } from "../queries/hooks";
import { useAppStore } from "../store/appStore";
import { canSeeAgenda, roleHomeLinks, roleStatDestination } from "../roleNav";

const ACTION_STYLES = ["navy", "teal", "deep"] as const;

function pathOf(to: string): string {
  return to.split("?")[0];
}

function isUrgenceLink(to: string): boolean {
  return /[?&]urgence=(1|true|oui)\b/i.test(to);
}

function linkIcon(to: string): LucideIcon {
  const path = pathOf(to);
  if (isUrgenceLink(to)) return Siren;
  if (path === "/rdv") return ClipboardList;
  if (path === "/patients/nouveau") return UserPlus;
  if (path === "/pharma") return Pill;
  if (path === "/labo") return FlaskConical;
  if (path === "/tournee") return Route;
  if (path === "/recherche") return Search;
  return Search;
}

function linkTone(to: string, role?: string): string {
  if (isUrgenceLink(to) || (pathOf(to) === "/recherche" && role === "ambulancier")) return "deep";
  return "";
}

type HubDash = {
  role?: string;
  role_label?: string;
  full_name?: string;
  structure_principale?: { id: number; nom: string; type: string; localisation?: string } | null;
  structures?: { id: number; nom: string; type: string; localisation?: string }[];
  stats?: {
    consultations_7j?: number;
    ordonnances_actives?: number;
    scans_7j?: number;
    patients_recents?: number;
  };
  patients_recents?: {
    id: number;
    npi: string;
    nom?: string;
    prenom?: string;
    full_name?: string;
    photo_url?: string | null;
  }[];
};

function StatChip({
  label,
  value,
  icon: Icon,
  onClick,
  delay,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
  onClick?: () => void;
  delay: number;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={`hub-stat stagger ${onClick ? "clickable" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onClick}
    >
      <div className="hub-stat-icon">
        <Icon size={18} strokeWidth={2} />
      </div>
      <div>
        <div className="hub-stat-value">{value}</div>
        <div className="hub-stat-label">{label}</div>
      </div>
    </Tag>
  );
}

export default function Accueil() {
  const { user } = useAuth();
  const nav = useNavigate();
  const online = useAppStore((s) => s.online);
  const { data: dashResult, isLoading: loading } = useHubDashboard();
  const data = (dashResult?.data || {}) as HubDash;
  const fromCache = !!dashResult?.fromCache;
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Bonjour";
    if (h < 18) return "Bon après-midi";
    return "Bonsoir";
  };

  const onSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!online) {
      setMsg("Hors ligne — recherche indisponible.");
      return;
    }
    const term = q.trim();
    if (!term) return;
    setMsg("");
    setBusy(true);
    try {
      if (/^\d{10}$/.test(term)) {
        const results = await api.searchPatients(`npi=${encodeURIComponent(term)}`);
        if (results?.length === 1) {
          nav(`/patient/${results[0].id}`);
          return;
        }
        if (results?.length > 1) {
          nav(`/recherche?npi=${encodeURIComponent(term)}`);
          return;
        }
        setMsg("Aucun patient trouvé pour ce NPI.");
      } else if (term.length > 40) {
        const res = await api.scan(term);
        if (res.consent_required) {
          setMsg("Demande envoyée au patient — en attente de confirmation…");
        }
        nav(`/patient/${res.patient_id}`);
      } else {
        nav(`/recherche?nom=${encodeURIComponent(term)}`);
      }
    } catch (err: any) {
      setMsg(err?.data?.detail || err?.message || "Recherche impossible.");
    } finally {
      setBusy(false);
    }
  };

  const name = data?.full_name || user?.full_name || "professionnel";
  const role = data?.role_label || user?.role_label || "Professionnel";
  const roleKey = data?.role || user?.role;
  const homeLinks = roleHomeLinks(roleKey);
  const showAgenda = canSeeAgenda(roleKey);
  const stats = data?.stats || {};
  const recent = data?.patients_recents || [];
  const scanHref = roleKey === "ambulancier" ? "/recherche?urgence=1" : "/recherche";
  const destConsult = roleStatDestination(roleKey, "consultations");
  const destOrdo = roleStatDestination(roleKey, "ordonnances");
  const destScans = roleStatDestination(roleKey, "scans");

  if (loading && !dashResult) {
    return (
      <div className="hub-home page-enter">
        <div className="hub-hero">
          <div style={{ flex: 1 }}>
            <Skeleton height={14} width={140} />
            <Skeleton height={32} width={280} className="mt-skel" />
            <Skeleton height={14} width={200} className="mt-skel" />
          </div>
        </div>
        <div className="hub-stat-grid">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={88} className="skel-card" />
          ))}
        </div>
        <div className="hub-main-grid">
          <Skeleton height={260} className="skel-card" />
          <Skeleton height={260} className="skel-card" />
        </div>
      </div>
    );
  }

  return (
    <div className="hub-home page-enter">
      <header className="hub-hero stagger" style={{ animationDelay: "40ms" }}>
        <div>
          <p className="hub-kicker">DotoHub · espace professionnel</p>
          <h1>
            {greeting()}, {name.split(" ")[0]}
          </h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {role}
            {data?.structure_principale?.nom
              ? ` · ${data.structure_principale.nom}`
              : ""}
            {fromCache ? " · cache" : ""}
          </p>
        </div>
        <div className="hub-hero-badge" aria-hidden>
          <img src="/logo-dotohub.png" alt="" />
        </div>
      </header>

      <div className="hub-actions stagger" style={{ animationDelay: "70ms" }}>
        {homeLinks.map((l, i) => {
          const Icon = linkIcon(l.to);
          const tone = linkTone(l.to, roleKey) || ACTION_STYLES[i % ACTION_STYLES.length];
          return (
            <Link key={l.to + l.label} to={l.to} className={`hub-action ${tone}`}>
              <span className="hub-action-ico">
                <Icon size={18} strokeWidth={2.2} />
              </span>
              <strong>{l.label}</strong>
              <span>{l.hint}</span>
            </Link>
          );
        })}
      </div>

      <div className="hub-stat-grid">
        <StatChip
          label="Consultations (7 j)"
          value={stats.consultations_7j ?? 0}
          icon={ClipboardList}
          delay={80}
          onClick={destConsult ? () => nav(destConsult) : undefined}
        />
        <StatChip
          label="Ordonnances actives"
          value={stats.ordonnances_actives ?? 0}
          icon={Pill}
          delay={120}
          onClick={destOrdo ? () => nav(destOrdo) : undefined}
        />
        <StatChip
          label="Scans DotoCard (7 j)"
          value={stats.scans_7j ?? 0}
          icon={Camera}
          delay={160}
          onClick={destScans ? () => nav(destScans) : undefined}
        />
        <StatChip
          label="Patients récents"
          value={stats.patients_recents ?? recent.length}
          icon={UserRound}
          delay={200}
          onClick={() => recent[0] && nav(`/patient/${recent[0].id}`)}
        />
      </div>

      <div className="hub-main-grid">
        <section className="panel hub-panel stagger" style={{ animationDelay: "220ms" }}>
          <h3>Recherche rapide</h3>
          <p className="small muted" style={{ marginBottom: 14 }}>
            NPI, nom, ou token DotoCard pour ouvrir le dossier. Un scan mobile ouvre aussi le dossier via SSE.
          </p>
          <form onSubmit={onSearch} className="hub-search">
            <input
              className="input"
              placeholder="Ex. 1234567890 ou Adjovi…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={!online}
            />
            <button className="btn" type="submit" disabled={busy || !online}>
              {busy ? "…" : "Ouvrir"}
            </button>
          </form>
          {msg ? <p className="small" style={{ color: "var(--emergency)", marginTop: 10 }}>{msg}</p> : null}
          <div className="hub-shortcuts">
            <Link to="/recherche" className="hub-sc">
              <span className="hub-sc-ico">
                <Search size={18} strokeWidth={2} />
              </span>
              <div>
                <strong>Recherche avancée</strong>
                <div className="small muted">NPI, nom, scan caméra</div>
              </div>
            </Link>
            <Link to={scanHref} className="hub-sc">
              <span className="hub-sc-ico">
                <IdCard size={18} strokeWidth={2} />
              </span>
              <div>
                <strong>Scanner DotoCard</strong>
                <div className="small muted">
                  {roleKey === "ambulancier" ? "QR / token · mode urgence" : "QR / douchette / token"}
                </div>
              </div>
            </Link>
            {showAgenda ? (
              <Link to="/rdv" className="hub-sc">
                <span className="hub-sc-ico">
                  <WalletCards size={18} strokeWidth={2} />
                </span>
                <div>
                  <strong>Rendez-vous</strong>
                  <div className="small muted">Agenda et suivi patient</div>
                </div>
              </Link>
            ) : null}
          </div>
        </section>

        <section className="panel hub-panel stagger" style={{ animationDelay: "280ms" }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <h3>Patients récents</h3>
            <Link to="/recherche" className="small">
              Rechercher →
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="hub-empty">
              <p className="muted">
                Aucun patient récent. Lancez une recherche ou un scan DotoCard.
              </p>
            </div>
          ) : (
            <ul className="hub-patients">
              {recent.map((p, i) => (
                <li key={p.id} className="stagger" style={{ animationDelay: `${320 + i * 50}ms` }}>
                  <Link to={`/patient/${p.id}`}>
                    <div className="row" style={{ gap: 10, alignItems: "center" }}>
                      <Avatar
                        src={p.photo_url}
                        name={p.full_name || `${p.nom || ""} ${p.prenom || ""}`.trim()}
                        size={36}
                      />
                      <div>
                        <strong>{p.full_name || `${p.nom || ""} ${p.prenom || ""}`.trim()}</strong>
                        <div className="mono small muted">{p.npi}</div>
                      </div>
                    </div>
                    <span className="small muted" style={{ fontWeight: 650 }}>Ouvrir</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="panel hub-emergency-tip stagger" style={{ animationDelay: "360ms" }}>
        <div className="hub-em-icon">
          <Zap size={22} strokeWidth={2} />
        </div>
        <div style={{ flex: 1 }}>
          <strong>Mode urgence</strong>
          <p className="small muted" style={{ marginTop: 4 }}>
            Scannez avec le téléphone (app DOTO+ mode pro) : le dossier s&apos;ouvre automatiquement
            ici via le flux SSE.
          </p>
        </div>
        <Link to={scanHref} className="btn danger sm">
          Scanner maintenant
        </Link>
      </div>

      {(data?.structures || []).length > 0 ? (
        <section className="stagger" style={{ marginTop: 22, animationDelay: "400ms" }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
            <h3 style={{ margin: 0 }}>Vos structures</h3>
            <span className="small muted">Affichage informatif</span>
          </div>
          <div className="hub-structs">
            {(data?.structures || []).map((s) => (
              <div key={s.id} className="hub-struct">
                <strong>{s.nom}</strong>
                <span className="small muted">
                  {s.type}
                  {s.localisation ? ` · ${s.localisation}` : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

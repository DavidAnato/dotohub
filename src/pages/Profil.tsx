import { useMemo, useState } from "react";
import {
  Building2,
  Camera,
  ChevronRight,
  Info,
  Moon,
  Palette,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import { useAuth } from "../auth";
import { api } from "../api";
import { Avatar } from "../components/Avatar";
import { useAppStore } from "../store/appStore";
import { PhoneInput } from "../components/PhoneInput";

type Panel = "compte" | "photo" | "structure" | "apparence" | "a-propos" | null;

function SettingsRow({
  icon: Icon,
  label,
  subtitle,
  onClick,
}: {
  icon: typeof UserRound;
  label: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="settings-row" onClick={onClick}>
      <span className="settings-row-ico">
        <Icon size={18} strokeWidth={2} />
      </span>
      <span className="settings-row-body">
        <span className="settings-row-label">{label}</span>
        {subtitle ? <span className="settings-row-sub">{subtitle}</span> : null}
      </span>
      <ChevronRight size={16} className="settings-row-chevron" strokeWidth={2} />
    </button>
  );
}

function SettingsModal({
  open,
  title,
  icon: Icon,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  icon: typeof UserRound;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="settings-modal-root" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="settings-modal-backdrop" aria-label="Fermer" onClick={onClose} />
      <div className="settings-modal-card">
        <div className="settings-modal-head">
          <span className="settings-modal-ico">
            <Icon size={18} strokeWidth={2} />
          </span>
          <h2>{title}</h2>
          <button type="button" className="settings-modal-close" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="settings-modal-body">{children}</div>
      </div>
    </div>
  );
}

export default function Profil() {
  const { user } = useAuth();
  const setUser = useAppStore((s) => s.setUser);
  const setToast = useAppStore((s) => s.setToast);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const [panel, setPanel] = useState<Panel>(null);
  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [lastName, setLastName] = useState(user?.last_name || "");
  const [phone, setPhone] = useState(user?.telephone || "");
  const [email, setEmail] = useState(user?.email || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const structures = (user as any)?.structures as { nom: string }[] | undefined;
  const structureLabel = useMemo(() => {
    if (structures?.length) return structures.map((s) => s.nom).join(", ");
    return "Non liée";
  }, [structures]);

  if (!user) return null;

  const photoSrc = preview || user.photo_url || null;

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const updated = await api.updateMe({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        telephone: phone.trim(),
        email: email.trim(),
      });
      localStorage.setItem("doto_user", JSON.stringify(updated));
      setUser(updated);
      setToast("Profil mis à jour.");
      setPanel(null);
    } catch (e: any) {
      setErr(e.message || "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const onPhoto = async (file: File | null) => {
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setBusy(true);
    setErr("");
    try {
      const updated = await api.uploadPhoto(file);
      localStorage.setItem("doto_user", JSON.stringify(updated));
      setUser(updated);
      setPreview(null);
      URL.revokeObjectURL(localUrl);
      setToast("Photo d'identité enregistrée.");
    } catch (e: any) {
      setPreview(null);
      URL.revokeObjectURL(localUrl);
      setErr(e.message || "Upload impossible");
    } finally {
      setBusy(false);
    }
  };

  const openPhoto = () => {
    setErr("");
    setPanel("photo");
  };

  return (
    <div className="page-enter settings-hub" style={{ maxWidth: 560 }}>
      <h1>Paramètres</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        Gérez votre compte professionnel. Les détails s&apos;ouvrent dans un panneau dédié.
      </p>

      <button type="button" className="settings-profile-card settings-profile-card-btn" onClick={openPhoto}>
        <Avatar src={photoSrc} name={user.full_name} size={96} />
        <div style={{ textAlign: "left" }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: "var(--text)" }}>{user.full_name}</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {user.role_label} · @{user.username}
          </div>
          {!user.photo_url ? (
            <span className="settings-badge">Photo à ajouter</span>
          ) : (
            <span className="settings-badge">
              Photo d&apos;identité
            </span>
          )}
        </div>
        <Camera size={18} className="settings-row-chevron" strokeWidth={2} style={{ marginLeft: "auto" }} />
      </button>

      <p className="settings-section-label">Compte</p>
      <div className="settings-list">
        <SettingsRow
          icon={UserRound}
          label="Compte"
          subtitle="Nom, téléphone, e-mail"
          onClick={() => {
            setErr("");
            setFirstName(user.first_name || "");
            setLastName(user.last_name || "");
            setPhone(user.telephone || "");
            setEmail(user.email || "");
            setPanel("compte");
          }}
        />
        <SettingsRow
          icon={Camera}
          label="Photo d'identité"
          subtitle={user.photo_url ? "Photo enregistrée" : "Visage centré — obligatoire"}
          onClick={openPhoto}
        />
        <SettingsRow
          icon={Building2}
          label="Structure & rôle"
          subtitle={`${structureLabel} · ${user.role_label}`}
          onClick={() => setPanel("structure")}
        />
      </div>

      <p className="settings-section-label">Préférences</p>
      <div className="settings-list">
        <SettingsRow
          icon={Palette}
          label="Apparence"
          subtitle={theme === "dark" ? "Mode sombre" : "Mode clair"}
          onClick={() => setPanel("apparence")}
        />
        <SettingsRow
          icon={Info}
          label="À propos"
          subtitle="DotoHub · DOTO+"
          onClick={() => setPanel("a-propos")}
        />
      </div>

      <SettingsModal
        open={panel === "compte"}
        title="Compte"
        icon={UserRound}
        onClose={() => setPanel(null)}
      >
        <div className="grid cols-2">
          <div className="field">
            <label className="label">Prénom</label>
            <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Nom</label>
            <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <PhoneInput
            id="hub-profil-tel"
            label="Téléphone"
            value={phone}
            onChange={setPhone}
          />
          <div className="field">
            <label className="label">Email</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        {err ? <p style={{ color: "var(--emergency)", marginTop: 10 }}>{err}</p> : null}
        <button className="btn" style={{ marginTop: 14 }} disabled={busy} onClick={() => void save()}>
          Enregistrer
        </button>
      </SettingsModal>

      <SettingsModal
        open={panel === "photo"}
        title="Photo d'identité"
        icon={Camera}
        onClose={() => setPanel(null)}
      >
        <div style={{ textAlign: "center" }}>
          <div className="photo-frame">
            <Avatar src={photoSrc} name={user.full_name} size={128} />
          </div>
          <p className="muted" style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5 }}>
            Cadrez votre visage au centre. JPEG, PNG ou WebP — type photo d&apos;identité.
          </p>
          {err ? <p style={{ color: "var(--emergency)", marginTop: 10 }}>{err}</p> : null}
          <label className="btn ghost sm" style={{ marginTop: 14, cursor: "pointer" }}>
            {busy ? "Envoi…" : photoSrc ? "Changer la photo" : "Ajouter une photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              disabled={busy}
              onChange={(e) => void onPhoto(e.target.files?.[0] || null)}
            />
          </label>
        </div>
      </SettingsModal>

      <SettingsModal
        open={panel === "structure"}
        title="Structure & rôle"
        icon={Building2}
        onClose={() => setPanel(null)}
      >
        <div className="settings-readonly">
          <div>
            <span className="label">Rôle</span>
            <strong>{user.role_label}</strong>
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Attribué par l&apos;administration — non modifiable
            </p>
          </div>
          <div>
            <span className="label">Structure</span>
            <strong>{structureLabel}</strong>
          </div>
          <div>
            <span className="label">Identifiant</span>
            <strong>@{user.username}</strong>
          </div>
        </div>
      </SettingsModal>

      <SettingsModal
        open={panel === "apparence"}
        title="Apparence"
        icon={Palette}
        onClose={() => setPanel(null)}
      >
        <button type="button" className="settings-row" onClick={toggleTheme} style={{ width: "100%" }}>
          <span className="settings-row-ico">
            {theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
          </span>
          <span className="settings-row-body">
            <span className="settings-row-label">Mode sombre</span>
            <span className="settings-row-sub">
              {theme === "dark" ? "Activé" : "Désactivé"} — basculez depuis ce panneau ou la barre
              supérieure
            </span>
          </span>
        </button>
      </SettingsModal>

      <SettingsModal
        open={panel === "a-propos"}
        title="À propos"
        icon={Info}
        onClose={() => setPanel(null)}
      >
        <p style={{ fontWeight: 800, fontSize: 16, color: "var(--text)" }}>DotoHub</p>
        <p className="muted" style={{ marginTop: 8, lineHeight: 1.55 }}>
          Application professionnelle de la plateforme DOTO+. Accès sécurisé aux dossiers patients
          avec consentement et journal d&apos;audit.
        </p>
        <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>
          Version 1.0
        </p>
      </SettingsModal>
    </div>
  );
}

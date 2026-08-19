import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { HospitalPicker } from "../components/HospitalPicker";
import { PhoneInput } from "../components/PhoneInput";
import { PRO_ROLES, TYPE_EXERCICE } from "../constants";
import { useAppStore } from "../store/appStore";

function firstError(data: any, fallback: string) {
  if (!data) return fallback;
  if (typeof data.detail === "string") return data.detail;
  for (const val of Object.values(data)) {
    if (typeof val === "string") return val;
    if (Array.isArray(val) && val[0]) return String(val[0]);
  }
  return fallback;
}

export default function Inscription() {
  const acceptSession = useAppStore((s) => s.acceptSession);
  const setToast = useAppStore((s) => s.setToast);
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [role, setRole] = useState("medecin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [kind, setKind] = useState("etablissement_sante");
  const [ville, setVille] = useState("");
  const [nomLibre, setNomLibre] = useState("");
  const [autorisation, setAutorisation] = useState("");
  const [ordre, setOrdre] = useState("");
  const [emailPro, setEmailPro] = useState("");
  const [lignePro, setLignePro] = useState("");
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [pickedIds, setPickedIds] = useState<number[]>([]);
  const [principalId, setPrincipalId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const independant = kind === "independant";

  useEffect(() => {
    api
      .hospitals()
      .then((r: any) => setHospitals(r.structures || []))
      .catch(() => setHospitals([]));
  }, []);

  const goStep2 = (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!lastName.trim() || !firstName.trim()) {
      setErr("Nom et prénom requis.");
      return;
    }
    if (!username.trim()) {
      setErr("Identifiant ou email de connexion requis.");
      return;
    }
    if (password.length < 8) {
      setErr("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== password2) {
      setErr("Les mots de passe ne correspondent pas.");
      return;
    }
    setStep(2);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!independant && !pickedIds.length && !nomLibre.trim()) {
      setErr("Choisissez un établissement ou saisissez un nom.");
      return;
    }
    if (independant && !nomLibre.trim()) {
      setErr("Indiquez le nom de votre cabinet / exercice.");
      return;
    }
    if (!independant && pickedIds.length && !principalId) {
      setErr("Désignez l'établissement principal.");
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        username: username.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: emailPro.trim(),
        role,
        type_exercice: kind,
        ville_exercice: ville,
        nom_etablissement: nomLibre,
        numero_autorisation: autorisation,
        numero_ordre: ordre,
        email_pro: emailPro,
        ligne_pro: lignePro,
        structure_ids: independant ? [] : pickedIds,
        structure_principale: independant ? null : principalId || null,
      };
      if (nomLibre.trim()) {
        payload.etablissement_libre = { nom: nomLibre.trim(), ville, type: kind };
      }
      const user = await api.registerPro(payload);
      acceptSession(user);
      setToast("Compte créé. En attente de validation admin.");
      nav("/");
    } catch (e: any) {
      setErr(firstError(e?.data, e.message || "Inscription impossible."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card card login-card--wide">
        <div className="login-brand">
          <img src="/logo-dotohub.png" alt="DotoHub" />
          <h1>Inscription professionnelle</h1>
          <p className="muted">
            {step === 1
              ? "Identité et identifiants de compte"
              : "Type, ville, établissement(s) et numéros d'autorisation."}
          </p>
          <p className="reg-steps">
            <span className={step === 1 ? "on" : ""}>1 · Identité</span>
            <span className={step === 2 ? "on" : ""}>2 · Établissement</span>
          </p>
        </div>

        {step === 1 ? (
          <form onSubmit={goStep2}>
            <div className="field">
              <label className="label">Nom</label>
              <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label className="label">Prénom</label>
              <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Rôle</label>
              <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
                {PRO_ROLES.map((r) => (
                  <option key={r.v} value={r.v}>
                    {r.l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">Identifiant / email</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="awa.kpo ou awa@clinique.bj"
              />
            </div>
            <div className="field">
              <label className="label">Mot de passe</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="8 caractères minimum"
              />
            </div>
            <div className="field">
              <label className="label">Confirmer le mot de passe</label>
              <input
                className="input"
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {err ? <p className="reg-error">{err}</p> : null}
            <button className="btn" style={{ width: "100%" }} type="submit">
              Continuer
            </button>
          </form>
        ) : (
          <form onSubmit={submit}>
            <label className="label">Type</label>
            <div className="kind-chips">
              {TYPE_EXERCICE.map((k) => (
                <button
                  key={k.v}
                  type="button"
                  className={"kind-chip" + (kind === k.v ? " on" : "")}
                  onClick={() => setKind(k.v)}
                >
                  {k.l}
                </button>
              ))}
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label className="label">Ville d'exercice</label>
              <input className="input" value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Cotonou" />
            </div>
            <div className="field">
              <label className="label">
                {independant ? "Nom du cabinet" : "Nom de l'établissement"}
              </label>
              <input
                className="input"
                value={nomLibre}
                onChange={(e) => setNomLibre(e.target.value)}
                placeholder="Clinique, pharmacie ou cabinet"
              />
            </div>
            <div className="field">
              <label className="label">N° Autorisation</label>
              <input
                className="input"
                value={autorisation}
                onChange={(e) => setAutorisation(e.target.value)}
                placeholder="890094/BEN"
              />
            </div>
            <div className="field">
              <label className="label">N° Ordre National</label>
              <input
                className="input"
                value={ordre}
                onChange={(e) => setOrdre(e.target.value)}
                placeholder="12345/ON/DEPT/2023"
              />
            </div>
            <div className="field">
              <label className="label">Email professionnel</label>
              <input
                className="input"
                type="email"
                value={emailPro}
                onChange={(e) => setEmailPro(e.target.value)}
              />
            </div>
            <PhoneInput id="reg-ligne" label="Ligne professionnelle +229" value={lignePro} onChange={setLignePro} />
            {!independant ? (
              <div className="field" style={{ marginTop: 8 }}>
                <label className="label">Établissements (plusieurs possibles, un principal)</label>
                <HospitalPicker
                  hospitals={hospitals}
                  pickedIds={pickedIds}
                  principalId={principalId}
                  onChangePicked={setPickedIds}
                  onChangePrincipal={setPrincipalId}
                />
              </div>
            ) : null}
            {err ? <p className="reg-error">{err}</p> : null}
            <div className="reg-actions">
              <button className="btn ghost" type="button" onClick={() => { setErr(""); setStep(1); }}>
                Retour
              </button>
              <button className="btn" type="submit" disabled={busy} style={{ flex: 1 }}>
                {busy ? "Création…" : "Créer le compte"}
              </button>
            </div>
            <p className="muted small" style={{ marginTop: 12, textAlign: "center" }}>
              Le compte est créé immédiatement. L'affiliation reste en attente de validation admin.
              Le PIN à 4 chiffres se configure à la première connexion.
            </p>
          </form>
        )}

        <p className="login-switch">
          Déjà un compte ? <Link to="/login">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}

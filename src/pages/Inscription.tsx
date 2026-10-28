import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { AuthShell } from "../components/AuthShell";
import { HospitalPicker } from "../components/HospitalPicker";
import { PasswordInput } from "../components/PasswordInput";
import { PhoneInput } from "../components/PhoneInput";
import { PRO_ROLES, TYPE_EXERCICE, typeExerciceHint } from "../constants";
import { formatDrfData, humanizeApiText } from "../apiMessage";
import { useAppStore } from "../store/appStore";

function firstError(data: any, fallback: string) {
  return formatDrfData(data) || humanizeApiText(fallback);
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
  const [horsCatalogue, setHorsCatalogue] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const independant = kind === "independant";
  const showNomLibre = independant || horsCatalogue || !hospitals.length;

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

  const chooseKind = (next: string) => {
    setKind(next);
    if (next === "independant") {
      setPickedIds([]);
      setPrincipalId("");
      setHorsCatalogue(false);
    }
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
      setErr("Désignez l'établissement principal (étoile).");
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

  const roleLabel = PRO_ROLES.find((r) => r.v === role)?.l || role;
  const kindLabel = TYPE_EXERCICE.find((k) => k.v === kind)?.l || kind;
  const principalNom = hospitals.find((h) => h.id === principalId)?.nom;
  const pickedNoms = hospitals.filter((h) => pickedIds.includes(h.id)).map((h: any) => h.nom);
  const recapLieu = independant
    ? nomLibre.trim() || "Nom du cabinet à renseigner"
    : pickedNoms.length
      ? pickedNoms.length > 2
        ? `${pickedNoms[0]} + ${pickedNoms.length - 1} autre${pickedNoms.length > 2 ? "s" : ""}`
        : pickedNoms.join(", ")
      : nomLibre.trim() || "Aucun établissement choisi";

  const recapReady = useMemo(
    () =>
      independant
        ? Boolean(nomLibre.trim())
        : Boolean(pickedIds.length || nomLibre.trim()),
    [independant, nomLibre, pickedIds.length]
  );

  return (
    <AuthShell
      wide
      kicker="Rejoindre DotoHub"
      headline="Votre exercice, en un compte."
      lede="Deux étapes. L’affiliation est ensuite validée par un administrateur."
      points={[
        { title: "Identité. ", text: "Nom, rôle et identifiants de connexion." },
        { title: "Établissement. ", text: "Où vous exercez, puis vos numéros professionnels." },
        { title: "PIN ensuite. ", text: "Code à 4 chiffres à la première session." },
      ]}
    >
      <div className="auth-head">
        <p className="auth-kicker">Inscription</p>
        <h1>{step === 1 ? "Votre identité" : "Votre exercice"}</h1>
        <p className="muted">
          {step === 1
            ? "Nom, rôle et identifiants de compte."
            : "D’abord le type, ensuite seulement les champs utiles."}
        </p>
        <ol className="auth-steps" aria-label="Étapes d'inscription">
          <li className={step === 1 ? "on" : "done"}>
            <span>1</span> Identité
          </li>
          <li className={step === 2 ? "on" : ""}>
            <span>2</span> Établissement
          </li>
        </ol>
      </div>

      {step === 1 ? (
        <form onSubmit={goStep2}>
          <div className="auth-grid">
            <div className="field">
              <label className="label" htmlFor="reg-nom">
                Nom
              </label>
              <input
                id="reg-nom"
                className="input"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                autoFocus
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="reg-prenom">
                Prénom
              </label>
              <input
                id="reg-prenom"
                className="input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
              />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="reg-role">
              Rôle
            </label>
            <select
              id="reg-role"
              className="select"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {PRO_ROLES.map((r) => (
                <option key={r.v} value={r.v}>
                  {r.l}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="reg-user">
              Identifiant / email
            </label>
            <input
              id="reg-user"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="awa.kpo ou awa@clinique.bj"
            />
          </div>
          <div className="auth-grid">
            <div className="field">
              <label className="label" htmlFor="reg-pass">
                Mot de passe
              </label>
              <PasswordInput
                id="reg-pass"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="8 caractères minimum"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="reg-pass2">
                Confirmation
              </label>
              <PasswordInput
                id="reg-pass2"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          {err ? <p className="auth-error">{err}</p> : null}
          <button className="btn auth-submit" type="submit">
            Continuer
          </button>
        </form>
      ) : (
        <form className="auth-step2" onSubmit={submit}>
          <div className="auth-step2__scroll">
          <div className="field">
            <p className="label" id="reg-kind-label">
              Type d'exercice
            </p>
            <div className="kind-chips" role="radiogroup" aria-labelledby="reg-kind-label">
              {TYPE_EXERCICE.map((k) => (
                <button
                  key={k.v}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.v}
                  className={"kind-chip" + (kind === k.v ? " on" : "")}
                  onClick={() => chooseKind(k.v)}
                >
                  {k.l}
                </button>
              ))}
            </div>
            <p className="muted auth-hint">{typeExerciceHint(kind)}</p>
          </div>

          <section className="auth-group" aria-labelledby="reg-lieu-title">
            <h2 className="auth-group__title" id="reg-lieu-title">
              Où j'exerce
            </h2>
            <div className="field">
              <label className="label" htmlFor="reg-ville">
                Ville d'exercice
              </label>
              <input
                id="reg-ville"
                className="input"
                value={ville}
                onChange={(e) => setVille(e.target.value)}
                placeholder="Cotonou"
              />
            </div>
            {independant ? (
              <div className="field">
                <label className="label" htmlFor="reg-etab">
                  Nom du cabinet / exercice
                </label>
                <input
                  id="reg-etab"
                  className="input"
                  value={nomLibre}
                  onChange={(e) => setNomLibre(e.target.value)}
                  placeholder="Cabinet Dr. Kpo"
                  required
                />
              </div>
            ) : (
              <>
                <div className="field">
                  <p className="label">Établissements du catalogue</p>
                  <HospitalPicker
                    hospitals={hospitals}
                    pickedIds={pickedIds}
                    principalId={principalId}
                    onChangePicked={setPickedIds}
                    onChangePrincipal={setPrincipalId}
                  />
                </div>
                {hospitals.length ? (
                  <button
                    type="button"
                    className="auth-linkbtn"
                    onClick={() => setHorsCatalogue((v) => !v)}
                  >
                    {horsCatalogue
                      ? "Masquer le nom hors catalogue"
                      : "Mon établissement n'est pas dans la liste"}
                  </button>
                ) : null}
                {showNomLibre ? (
                  <div className="field">
                    <label className="label" htmlFor="reg-etab">
                      Nom hors catalogue
                    </label>
                    <input
                      id="reg-etab"
                      className="input"
                      value={nomLibre}
                      onChange={(e) => setNomLibre(e.target.value)}
                      placeholder="Clinique, pharmacie ou laboratoire"
                    />
                  </div>
                ) : null}
              </>
            )}
          </section>

          <section className="auth-group" aria-labelledby="reg-ids-title">
            <h2 className="auth-group__title" id="reg-ids-title">
              Identifiants professionnels
            </h2>
            <p className="muted auth-hint">Facultatif. Utile pour la validation admin.</p>
            <div className="auth-grid">
              <div className="field">
                <label className="label" htmlFor="reg-auth">
                  N° Autorisation
                </label>
                <input
                  id="reg-auth"
                  className="input"
                  value={autorisation}
                  onChange={(e) => setAutorisation(e.target.value)}
                  placeholder="890094/BEN"
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="reg-ordre">
                  N° Ordre National
                </label>
                <input
                  id="reg-ordre"
                  className="input"
                  value={ordre}
                  onChange={(e) => setOrdre(e.target.value)}
                  placeholder="12345/ON/DEPT/2023"
                />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="reg-email">
                Email professionnel
              </label>
              <input
                id="reg-email"
                className="input"
                type="email"
                value={emailPro}
                onChange={(e) => setEmailPro(e.target.value)}
                autoComplete="email"
              />
            </div>
            <PhoneInput id="reg-ligne" label="Ligne professionnelle +229" value={lignePro} onChange={setLignePro} />
          </section>

          <section className="auth-recap" aria-labelledby="reg-recap-title">
            <h2 className="auth-group__title" id="reg-recap-title">
              Récapitulatif
            </h2>
            <dl>
              <div>
                <dt>Identité</dt>
                <dd>
                  {firstName} {lastName} · {roleLabel}
                </dd>
              </div>
              <div>
                <dt>Exercice</dt>
                <dd>{kindLabel}</dd>
              </div>
              <div>
                <dt>Lieu</dt>
                <dd>{ville.trim() ? `${recapLieu} · ${ville.trim()}` : recapLieu}</dd>
              </div>
              {!independant && principalNom ? (
                <div>
                  <dt>Principal</dt>
                  <dd>{principalNom}</dd>
                </div>
              ) : null}
              {autorisation.trim() || ordre.trim() ? (
                <div>
                  <dt>N° pro</dt>
                  <dd>{[autorisation.trim(), ordre.trim()].filter(Boolean).join(" · ")}</dd>
                </div>
              ) : null}
              {emailPro.trim() || lignePro.trim() ? (
                <div>
                  <dt>Contact</dt>
                  <dd>{[emailPro.trim(), lignePro.trim()].filter(Boolean).join(" · ")}</dd>
                </div>
              ) : null}
            </dl>
            {!recapReady ? (
              <p className="muted auth-hint">Complétez le lieu d'exercice pour créer le compte.</p>
            ) : null}
          </section>
          </div>

          <div className="auth-sticky">
            {err ? <p className="auth-error">{err}</p> : null}
            <div className="auth-actions">
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setErr("");
                  setStep(1);
                }}
              >
                Retour
              </button>
              <button className="btn auth-submit" type="submit" disabled={busy}>
                {busy ? "Création…" : "Créer le compte"}
              </button>
            </div>
          </div>
        </form>
      )}

      <p className="auth-switch">
        Déjà un compte ? <Link to="/login">Se connecter</Link>
      </p>
    </AuthShell>
  );
}

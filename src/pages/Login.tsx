import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { AuthShell } from "../components/AuthShell";
import { PasswordInput } from "../components/PasswordInput";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(username, password);
      nav("/");
    } catch (err: any) {
      setError(err?.data?.detail || "Identifiants invalides.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      kicker="Espace professionnels"
      headline="La santé, sans friction."
      lede="Dossiers, DotoCard et agenda dans un même espace sécurisé."
      points={[
        { title: "Dossier unifié. ", text: "Historique, ordonnances et examens." },
        { title: "Accès maîtrisé. ", text: "PIN de session et journal d’audit." },
        { title: "Urgence prête. ", text: "Données critiques en un scan." },
      ]}
    >
      <div className="auth-head">
        <p className="auth-kicker">DotoHub</p>
        <h1>Connexion</h1>
        <p className="muted">Identifiant professionnel et mot de passe.</p>
      </div>
      <form onSubmit={submit}>
        <div className="field">
          <label className="label" htmlFor="hub-login-user">
            Identifiant
          </label>
          <input
            id="hub-login-user"
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="medecin"
            autoComplete="username"
            autoFocus
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="hub-login-pass">
            Mot de passe
          </label>
          <PasswordInput
            id="hub-login-pass"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>
        {error ? <p className="auth-error">{error}</p> : null}
        <button className="btn auth-submit" disabled={busy}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>
      <p className="auth-switch">
        Nouveau professionnel ? <Link to="/inscription">Créer un compte</Link>
      </p>
      <p className="auth-foot">
        Démo <span className="mono">medecin</span> / <span className="mono">Medecin123!</span>
      </p>
    </AuthShell>
  );
}

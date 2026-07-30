import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { api, ApiError } from "../api";
import { PhoneInput, toE164Bj, nationalDigits } from "../components/PhoneInput";
import { useAppStore } from "../store/appStore";

const NPI_RE = /^\d{10}$/;

type FormState = {
  npi: string;
  nom: string;
  prenom: string;
  telephone: string;
  date_naissance: string;
  sexe: "" | "M" | "F";
  contact_urgence_nom: string;
  contact_urgence_lien: string;
  tel_urgence: string;
  adresse_commune: string;
  adresse_quartier: string;
};

const EMPTY: FormState = {
  npi: "",
  nom: "",
  prenom: "",
  telephone: "",
  date_naissance: "",
  sexe: "",
  contact_urgence_nom: "",
  contact_urgence_lien: "",
  tel_urgence: "",
  adresse_commune: "",
  adresse_quartier: "",
};

function apiErrMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const d = e.data;
    if (typeof d?.detail === "string") return d.detail;
    if (d && typeof d === "object") {
      const parts = Object.entries(d)
        .filter(([k]) => k !== "detail")
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
      if (parts.length) return parts.join(" · ");
    }
    return e.message;
  }
  return e instanceof Error ? e.message : "Enregistrement impossible.";
}

export default function NouveauPatient() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get("id");
  const isEdit = !!editId;
  const setToast = useAppStore((s) => s.setToast);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const p = await api.patient(editId);
        if (cancelled) return;
        setForm({
          npi: (p.npi || "").replace(/\D/g, "").slice(0, 10),
          nom: p.nom || "",
          prenom: p.prenom || "",
          telephone: p.telephone || "",
          date_naissance: p.date_naissance || "",
          sexe: p.sexe === "M" || p.sexe === "F" ? p.sexe : "",
          contact_urgence_nom: p.contact_urgence_nom || "",
          contact_urgence_lien: p.contact_urgence_lien || "",
          tel_urgence: p.tel_urgence || "",
          adresse_commune: p.adresse_commune || "",
          adresse_quartier: p.adresse_quartier || "",
        });
      } catch (e) {
        if (!cancelled) setError(apiErrMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editId]);

  const set =
    (key: keyof FormState) =>
    (value: string) =>
      setForm((f) => ({ ...f, [key]: value }));

  const validate = (): string | null => {
    if (!NPI_RE.test(form.npi.trim())) return "Le NPI doit contenir exactement 10 chiffres.";
    if (!form.nom.trim()) return "Le nom est requis.";
    if (!form.prenom.trim()) return "Le prénom est requis.";
    const telDigits = nationalDigits(form.telephone);
    if (telDigits.length < 8) return "Téléphone invalide (numéro local Bénin).";
    if (!form.date_naissance) return "La date de naissance est requise.";
    const urgDigits = nationalDigits(form.tel_urgence);
    if (form.tel_urgence && urgDigits.length > 0 && urgDigits.length < 8) {
      return "Téléphone d'urgence invalide.";
    }
    return null;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    const body: Record<string, unknown> = {
      npi: form.npi.trim(),
      nom: form.nom.trim(),
      prenom: form.prenom.trim(),
      telephone: toE164Bj(form.telephone),
      date_naissance: form.date_naissance,
      sexe: form.sexe || "",
      adresse_commune: form.adresse_commune.trim(),
      adresse_quartier: form.adresse_quartier.trim(),
      contact_urgence_nom: form.contact_urgence_nom.trim(),
      contact_urgence_lien: form.contact_urgence_lien.trim(),
      tel_urgence: form.tel_urgence ? toE164Bj(form.tel_urgence) : "",
    };
    setBusy(true);
    try {
      const saved = isEdit
        ? await api.updatePatient(editId!, body)
        : await api.createPatient(body);
      setToast(isEdit ? "Patient mis à jour" : "Patient créé");
      nav(`/patient/${saved.id}`);
    } catch (ex) {
      setError(apiErrMessage(ex));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="page-enter">
        <h1>{isEdit ? "Modifier le patient" : "Nouveau patient"}</h1>
        <div className="skel" style={{ height: 180, marginTop: 16 }} />
      </div>
    );
  }

  return (
    <div className="page-enter">
      <header className="page-head">
        <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <UserPlus size={22} />
          {isEdit ? "Modifier le patient" : "Nouveau patient"}
        </h1>
        <p className="muted small">
          Identité ANIP (NPI 10 chiffres) et coordonnées — réception / admin / médecin.
        </p>
      </header>

      <form className="panel" onSubmit={onSubmit}>
        <h3 style={{ marginBottom: 12 }}>Identité</h3>
        <div className="grid cols-2">
          <div className="field">
            <label className="label" htmlFor="np-npi">
              NPI (10 chiffres)
            </label>
            <input
              id="np-npi"
              className="input"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              placeholder="1234567890"
              value={form.npi}
              disabled={isEdit}
              onChange={(e) => set("npi")(e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="np-naissance">
              Date de naissance
            </label>
            <input
              id="np-naissance"
              className="input"
              type="date"
              value={form.date_naissance}
              onChange={(e) => set("date_naissance")(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="np-nom">
              Nom
            </label>
            <input
              id="np-nom"
              className="input"
              value={form.nom}
              onChange={(e) => set("nom")(e.target.value)}
              autoComplete="family-name"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="np-prenom">
              Prénom
            </label>
            <input
              id="np-prenom"
              className="input"
              value={form.prenom}
              onChange={(e) => set("prenom")(e.target.value)}
              autoComplete="given-name"
            />
          </div>
          <PhoneInput label="Téléphone" value={form.telephone} onChange={set("telephone")} id="np-tel" />
          <div className="field">
            <label className="label" htmlFor="np-sexe">
              Sexe
            </label>
            <select
              id="np-sexe"
              className="input"
              value={form.sexe}
              onChange={(e) => set("sexe")(e.target.value)}
            >
              <option value="">Non renseigné</option>
              <option value="M">Masculin</option>
              <option value="F">Féminin</option>
            </select>
          </div>
        </div>

        <h3 style={{ marginTop: 20, marginBottom: 12 }}>Adresse</h3>
        <div className="grid cols-2">
          <div className="field">
            <label className="label" htmlFor="np-commune">
              Commune
            </label>
            <input
              id="np-commune"
              className="input"
              value={form.adresse_commune}
              onChange={(e) => set("adresse_commune")(e.target.value)}
              placeholder="Cotonou"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="np-quartier">
              Quartier
            </label>
            <input
              id="np-quartier"
              className="input"
              value={form.adresse_quartier}
              onChange={(e) => set("adresse_quartier")(e.target.value)}
              placeholder="Akpakpa"
            />
          </div>
        </div>

        <h3 style={{ marginTop: 20, marginBottom: 12 }}>Contact d&apos;urgence (optionnel)</h3>
        <div className="grid cols-2">
          <div className="field">
            <label className="label" htmlFor="np-urg-nom">
              Nom du contact
            </label>
            <input
              id="np-urg-nom"
              className="input"
              value={form.contact_urgence_nom}
              onChange={(e) => set("contact_urgence_nom")(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="np-urg-lien">
              Lien
            </label>
            <input
              id="np-urg-lien"
              className="input"
              value={form.contact_urgence_lien}
              onChange={(e) => set("contact_urgence_lien")(e.target.value)}
              placeholder="Époux / Parent…"
            />
          </div>
          <PhoneInput
            label="Téléphone d'urgence"
            value={form.tel_urgence}
            onChange={set("tel_urgence")}
            id="np-urg-tel"
          />
        </div>

        {error ? (
          <p className="muted" style={{ color: "var(--amber, #d97706)", marginTop: 12, fontWeight: 600 }}>
            {error}
          </p>
        ) : null}

        <div className="row" style={{ gap: 10, marginTop: 16 }}>
          <button type="submit" className="btn" disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => nav(-1)}>
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
}

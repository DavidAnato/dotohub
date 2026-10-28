import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ScanLine, TriangleAlert, UserPlus } from "lucide-react";
import { api } from "../api";
import { formatApiError } from "../apiMessage";
import { PhoneInput, toE164Bj, nationalDigits } from "../components/PhoneInput";
import { useAppStore, type PendingIdOcr } from "../store/appStore";

const NPI_RE = /^\d{10}$/;

type Step = 0 | 1 | 2 | 3;

type FormState = {
  npi: string;
  nom: string;
  prenom: string;
  telephone: string;
  date_naissance: string;
  lieu_naissance: string;
  sexe: "" | "M" | "F";
  nom_pere: string;
  nom_mere: string;
  contact_urgence_nom: string;
  contact_urgence_lien: string;
  tel_urgence: string;
  adresse_commune: string;
  adresse_quartier: string;
  allergies: string[];
};

const EMPTY: FormState = {
  npi: "",
  nom: "",
  prenom: "",
  telephone: "",
  date_naissance: "",
  lieu_naissance: "",
  sexe: "",
  nom_pere: "",
  nom_mere: "",
  contact_urgence_nom: "",
  contact_urgence_lien: "",
  tel_urgence: "",
  adresse_commune: "",
  adresse_quartier: "",
  allergies: [],
};

const STEPS = ["Pièce", "Identité", "Photo", "Contact"] as const;

function apiErrMessage(e: unknown): string {
  return formatApiError(e, "Enregistrement impossible.");
}

function applyOcr(prev: FormState, ocr: PendingIdOcr): FormState {
  const quartier = (ocr.address_quartier || ocr.address_arrondissement || "").trim();
  return {
    ...prev,
    npi: String(ocr.npi || prev.npi).replace(/\D/g, "").slice(0, 10),
    nom: (ocr.last_name || prev.nom || "").trim(),
    prenom: (ocr.first_name || prev.prenom || "").trim(),
    date_naissance: String(ocr.birth_date || prev.date_naissance || "").slice(0, 10),
    lieu_naissance: (ocr.birth_place || prev.lieu_naissance || "").trim(),
    telephone: ocr.phone || prev.telephone,
    adresse_commune: (ocr.address_commune || prev.adresse_commune || "").trim(),
    adresse_quartier: quartier || prev.adresse_quartier,
    nom_pere: (ocr.father_name || prev.nom_pere || "").trim(),
    nom_mere: (ocr.mother_name || prev.nom_mere || "").trim(),
  };
}

function cardLabel(kind: string) {
  if (kind === "cip") return "CIP";
  if (kind === "cedeao") return "CEDEAO";
  return kind ? "Pièce d'identité" : "";
}

export default function NouveauPatient() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get("id");
  const isEdit = !!editId;
  const setToast = useAppStore((s) => s.setToast);
  const user = useAppStore((s) => s.user);
  const pendingOcr = useAppStore((s) => s.pendingIdOcr);
  const setPendingOcr = useAppStore((s) => s.setPendingIdOcr);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [step, setStep] = useState<Step>(isEdit ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState("");
  const [cardType, setCardType] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [existingPhoto, setExistingPhoto] = useState("");
  const [allergyDraft, setAllergyDraft] = useState("");
  const [savedId, setSavedId] = useState<string | null>(editId);

  const structureNom =
    user?.structures?.find((s) => s.id && s.id === user.structure_principale)?.nom ||
    user?.nom_etablissement ||
    user?.structures?.[0]?.nom ||
    "Votre établissement";

  useEffect(() => {
    if (!pendingOcr) return;
    setForm((f) => applyOcr(f, pendingOcr));
    if (pendingOcr.card_type) setCardType(pendingOcr.card_type);
    setStep(1);
    setError("");
    setPendingOcr(null);
  }, [pendingOcr, setPendingOcr]);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview("");
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const p = await api.patient(editId);
        if (cancelled) return;
        const allergies = Array.isArray(p?.dossier?.allergies)
          ? p.dossier.allergies.map((a: unknown) => String(a))
          : Array.isArray(p?.allergies)
            ? p.allergies.map((a: unknown) => String(a))
            : [];
        setForm({
          npi: String(p.npi || "").replace(/\D/g, "").slice(0, 10),
          nom: p.nom || "",
          prenom: p.prenom || "",
          telephone: p.telephone || "",
          date_naissance: p.date_naissance || "",
          lieu_naissance: p.lieu_naissance || "",
          sexe: p.sexe === "M" || p.sexe === "F" ? p.sexe : "",
          nom_pere: p.nom_pere || "",
          nom_mere: p.nom_mere || "",
          contact_urgence_nom: p.contact_urgence_nom || "",
          contact_urgence_lien: p.contact_urgence_lien || "",
          tel_urgence: p.tel_urgence || "",
          adresse_commune: p.adresse_commune || "",
          adresse_quartier: p.adresse_quartier || "",
          allergies,
        });
        setExistingPhoto(p.photo_url || "");
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

  const validateIdentity = (): string | null => {
    if (!NPI_RE.test(form.npi.trim())) return "Le NPI doit contenir exactement 10 chiffres.";
    if (!form.nom.trim()) return "Le nom est requis.";
    if (!form.prenom.trim()) return "Le prénom est requis.";
    const telDigits = nationalDigits(form.telephone);
    if (telDigits.length > 0 && telDigits.length < 8) return "Téléphone invalide (numéro local Bénin).";
    if (!form.date_naissance) return "La date de naissance est requise.";
    return null;
  };

  const validateContact = (): string | null => {
    const urgDigits = nationalDigits(form.tel_urgence);
    if (form.tel_urgence && urgDigits.length > 0 && urgDigits.length < 8) {
      return "Téléphone d'urgence invalide.";
    }
    return null;
  };

  const onLocalScan = async (file: File | null) => {
    if (!file) return;
    setError("");
    setOcrBusy(true);
    try {
      const data = await api.ocrIdCard(file);
      setForm((f) => applyOcr(f, data));
      setCardType(data.card_type || "");
      setStep(1);
      setToast("Pièce lue — vérifiez les informations");
    } catch (e) {
      setError(apiErrMessage(e));
    } finally {
      setOcrBusy(false);
    }
  };

  const addAllergy = () => {
    const label = allergyDraft.trim();
    if (!label) return;
    setForm((f) => (f.allergies.includes(label) ? f : { ...f, allergies: [...f.allergies, label] }));
    setAllergyDraft("");
  };

  const goNext = () => {
    setError("");
    if (step === 0) {
      setStep(1);
      return;
    }
    if (step === 1) {
      const err = validateIdentity();
      if (err) {
        setError(err);
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!photoFile && !existingPhoto) {
        setError("Ajoutez la photo d'identité (JPEG, PNG ou WebP, minimum 200×200).");
        return;
      }
      setStep(3);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const err = validateIdentity() || validateContact();
    if (err) {
      setError(err);
      if (validateIdentity()) setStep(1);
      return;
    }
    if (!photoFile && !existingPhoto) {
      setError("La photo d'identité est nécessaire pour émettre la DotoCard.");
      setStep(2);
      return;
    }
    const body: Record<string, unknown> = {
      npi: form.npi.trim(),
      nom: form.nom.trim(),
      prenom: form.prenom.trim(),
      telephone: nationalDigits(form.telephone).length >= 8 ? toE164Bj(form.telephone) : "",
      date_naissance: form.date_naissance,
      lieu_naissance: form.lieu_naissance.trim(),
      sexe: form.sexe || "",
      nom_pere: form.nom_pere.trim(),
      nom_mere: form.nom_mere.trim(),
      adresse_commune: form.adresse_commune.trim(),
      adresse_quartier: form.adresse_quartier.trim(),
      contact_urgence_nom: form.contact_urgence_nom.trim(),
      contact_urgence_lien: form.contact_urgence_lien.trim(),
      tel_urgence: form.tel_urgence ? toE164Bj(form.tel_urgence) : "",
      allergies: form.allergies,
    };
    setBusy(true);
    try {
      const saved = savedId
        ? await api.updatePatient(savedId, body)
        : await api.createPatient(body);
      const id = String(saved.id);
      setSavedId(id);
      if (photoFile) {
        await api.uploadPatientPhoto(id, photoFile);
      }
      setToast(isEdit || savedId ? "Patient mis à jour" : "Patient créé");
      nav(`/patient/${id}`);
    } catch (ex) {
      const msg = apiErrMessage(ex);
      setError(msg);
      setToast(msg, "error");
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
          Le scan de la pièce ouvre le dossier. Vous pouvez corriger les informations lues, puis ajouter la photo.
          L&apos;établissement qui enregistre devient l&apos;hôpital mère.
        </p>
      </header>

      <ol className="np-steps">
        {STEPS.map((label, i) => (
          <li key={label} className={step === i ? "on" : i < step ? "done" : ""}>
            <button type="button" onClick={() => setStep(i as Step)} disabled={busy}>
              <span>{i + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <form className="panel" onSubmit={onSubmit}>
        {step === 0 ? (
          <div>
            <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <ScanLine size={18} />
              Scanner la pièce
            </h3>
            <p className="muted">
              Sur le téléphone (DotoHub, écran Nouveau patient ou Scan), photographiez la CIP ou la carte CEDEAO.
              La reconnaissance arrive ici et préremplit le formulaire, comme un scan de DotoCard.
            </p>
            <p style={{ fontWeight: 700, marginTop: 12 }}>
              {ocrBusy ? "Lecture de la pièce…" : "En attente du scan téléphone"}
            </p>
            {cardType ? (
              <p className="small muted">Dernière pièce : {cardLabel(cardType)}</p>
            ) : null}
            <label className="btn ghost" style={{ marginTop: 16, cursor: "pointer" }}>
              {ocrBusy ? "Lecture…" : "Ou choisir une photo de la pièce"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                disabled={ocrBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  e.target.value = "";
                  void onLocalScan(file);
                }}
              />
            </label>
            <p className="small muted" style={{ marginTop: 10 }}>
              La même lecture de pièce que pour l&apos;inscription d&apos;un patient.
            </p>
          </div>
        ) : null}

        {step === 1 ? (
          <div>
            <h3 style={{ marginTop: 0 }}>Vérifier l&apos;identité</h3>
            <p className="muted small">
              {cardType
                ? `Lu sur la ${cardLabel(cardType)}. Corrigez si besoin.`
                : "Complétez ou corrigez les informations."}
            </p>
            <div className="grid cols-2" style={{ marginTop: 12 }}>
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
                <input id="np-nom" className="input" value={form.nom} onChange={(e) => set("nom")(e.target.value)} />
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
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="np-lieu">
                  Lieu de naissance
                </label>
                <input
                  id="np-lieu"
                  className="input"
                  value={form.lieu_naissance}
                  onChange={(e) => set("lieu_naissance")(e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="np-sexe">
                  Sexe
                </label>
                <select id="np-sexe" className="input" value={form.sexe} onChange={(e) => set("sexe")(e.target.value)}>
                  <option value="">Non renseigné</option>
                  <option value="M">Masculin</option>
                  <option value="F">Féminin</option>
                </select>
              </div>
              <PhoneInput label="Téléphone (facultatif)" value={form.telephone} onChange={set("telephone")} id="np-tel" />
              <div className="field">
                <label className="label" htmlFor="np-pere">
                  Nom du père
                </label>
                <input id="np-pere" className="input" value={form.nom_pere} onChange={(e) => set("nom_pere")(e.target.value)} />
              </div>
              <div className="field">
                <label className="label" htmlFor="np-mere">
                  Nom de la mère
                </label>
                <input id="np-mere" className="input" value={form.nom_mere} onChange={(e) => set("nom_mere")(e.target.value)} />
              </div>
              <div className="field">
                <label className="label" htmlFor="np-commune">
                  Commune
                </label>
                <input
                  id="np-commune"
                  className="input"
                  value={form.adresse_commune}
                  onChange={(e) => set("adresse_commune")(e.target.value)}
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
                />
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <h3 style={{ marginTop: 0 }}>Photo d&apos;identité</h3>
            <p className="muted small">Visage centré. JPEG, PNG ou WebP, au moins 200×200 px. Ce n&apos;est pas la photo de la pièce.</p>
            {photoPreview || existingPhoto ? (
              <img
                src={photoPreview || existingPhoto}
                alt=""
                style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 16, marginTop: 12 }}
              />
            ) : null}
            <label className="btn ghost" style={{ marginTop: 16, cursor: "pointer" }}>
              {photoFile || existingPhoto ? "Changer la photo" : "Ajouter la photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  e.target.value = "";
                  setPhotoFile(file);
                  setError("");
                }}
              />
            </label>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <h3 style={{ marginTop: 0 }}>Contact, allergies, hôpital</h3>
            <div className="grid cols-2">
              <div className="field">
                <label className="label" htmlFor="np-urg-nom">
                  Contact d&apos;urgence
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
            <div className="field" style={{ marginTop: 12 }}>
              <label className="label" htmlFor="np-all">
                Allergies
              </label>
              <div className="row" style={{ gap: 8 }}>
                <input
                  id="np-all"
                  className="input"
                  value={allergyDraft}
                  onChange={(e) => setAllergyDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addAllergy();
                    }
                  }}
                  placeholder="Ajouter une allergie"
                />
                <button type="button" className="btn ghost" onClick={addAllergy}>
                  Ajouter
                </button>
              </div>
              {form.allergies.length ? (
                <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {form.allergies.map((a) => (
                    <button
                      key={a}
                      type="button"
                      className="btn ghost sm"
                      onClick={() => setForm((f) => ({ ...f, allergies: f.allergies.filter((x) => x !== a) }))}
                    >
                      {a} ×
                    </button>
                  ))}
                </div>
              ) : (
                <p className="small muted">Aucune allergie renseignée.</p>
              )}
            </div>
            <p style={{ marginTop: 16 }}>
              Hôpital mère : <strong>{structureNom}</strong>
            </p>
            <p className="small muted">
              Enregistré automatiquement : c&apos;est l&apos;établissement du compte qui crée le dossier. Il pourra émettre la DotoCard.
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="form-alert" role="alert">
            <TriangleAlert size={18} aria-hidden />
            <span>{error}</span>
          </p>
        ) : null}

        <div className="row" style={{ gap: 10, marginTop: 16 }}>
          {step > 0 ? (
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setStep((step - 1) as Step)}>
              Retour
            </button>
          ) : (
            <button type="button" className="btn ghost" disabled={busy} onClick={() => nav(-1)}>
              Annuler
            </button>
          )}
          {step < 3 ? (
            <button type="button" className="btn" disabled={busy || ocrBusy} onClick={goNext}>
              {step === 0 && !form.npi ? "Saisir à la main" : "Continuer"}
            </button>
          ) : (
            <button type="submit" className="btn" disabled={busy}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

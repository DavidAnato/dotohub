import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { api } from "../api";
import { HospitalPicker } from "./HospitalPicker";
import { PhoneInput } from "./PhoneInput";
import { useAppStore } from "../store/appStore";
import { TYPE_EXERCICE } from "../constants";

/** Première connexion : inscription professionnelle (pas une nouvelle page). */
export function HospitalAttachGate({
  onDone,
}: {
  onDone: (user: any) => void;
}) {
  const setToast = useAppStore((s) => s.setToast);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [kind, setKind] = useState("etablissement_sante");
  const [ville, setVille] = useState("");
  const [nomLibre, setNomLibre] = useState("");
  const [autorisation, setAutorisation] = useState("");
  const [ordre, setOrdre] = useState("");
  const [emailPro, setEmailPro] = useState("");
  const [lignePro, setLignePro] = useState("");
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

  const save = async () => {
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
    setErr("");
    try {
      const payload: Record<string, unknown> = {
        type_exercice: kind,
        ville_exercice: ville,
        nom_etablissement: nomLibre,
        numero_autorisation: autorisation,
        numero_ordre: ordre,
        email_pro: emailPro,
        ligne_pro: lignePro,
        structure_ids: pickedIds,
        structure_principale: principalId || null,
      };
      if (nomLibre.trim()) {
        payload.etablissement_libre = { nom: nomLibre.trim(), ville, type: kind };
      }
      const updated = await api.updateMe(payload);
      localStorage.setItem("doto_user", JSON.stringify(updated));
      setToast("Inscription professionnelle enregistrée.");
      onDone(updated);
    } catch (e: any) {
      setErr(
        e?.data?.structure_ids?.[0] ||
          e?.data?.structure_principale?.[0] ||
          e.message ||
          "Erreur"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pin-gate" role="dialog" aria-modal="true" aria-labelledby="hospital-gate-title">
      <div className="pin-gate__card" style={{ textAlign: "left", width: "min(520px, 100%)", maxHeight: "92vh", overflow: "auto" }}>
        <div className="pin-gate__icon">
          <Building2 size={28} />
        </div>
        <h2 id="hospital-gate-title" style={{ textAlign: "center" }}>
          Inscription professionnelle
        </h2>
        <p className="muted" style={{ textAlign: "center" }}>
          Type, ville, établissement(s) et numéros d'autorisation.
        </p>
        <label className="label">Type</label>
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
          {TYPE_EXERCICE.map((k) => (
            <option key={k.v} value={k.v}>
              {k.l}
            </option>
          ))}
        </select>
        <div className="field" style={{ marginTop: 12 }}>
          <label className="label">Ville d'exercice</label>
          <input className="input" value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Cotonou" />
        </div>
        <div className="field">
          <label className="label">{independant ? "Nom du cabinet" : "Nom établissement (si hors catalogue)"}</label>
          <input className="input" value={nomLibre} onChange={(e) => setNomLibre(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">N° autorisation</label>
          <input className="input" value={autorisation} onChange={(e) => setAutorisation(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">N° Ordre National</label>
          <input className="input" value={ordre} onChange={(e) => setOrdre(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">Email professionnel</label>
          <input className="input" type="email" value={emailPro} onChange={(e) => setEmailPro(e.target.value)} />
        </div>
        <PhoneInput id="pro-ligne" label="Ligne professionnelle +229" value={lignePro} onChange={setLignePro} />
        {!independant ? (
          <div className="field" style={{ marginTop: 8 }}>
            <label className="label">Établissements du catalogue</label>
            <HospitalPicker
              hospitals={hospitals}
              pickedIds={pickedIds}
              principalId={principalId}
              onChangePicked={setPickedIds}
              onChangePrincipal={setPrincipalId}
            />
          </div>
        ) : null}
        {err ? <p style={{ color: "var(--emergency)", marginTop: 10 }}>{err}</p> : null}
        <button className="btn" style={{ width: "100%", marginTop: 16 }} disabled={busy} onClick={() => void save()}>
          {busy ? "Enregistrement…" : "Valider"}
        </button>
      </div>
    </div>
  );
}

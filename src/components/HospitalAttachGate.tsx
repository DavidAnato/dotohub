import { useEffect, useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import { api } from "../api";
import { HospitalPicker } from "./HospitalPicker";
import { PhoneInput } from "./PhoneInput";
import { useAppStore } from "../store/appStore";
import { TYPE_EXERCICE, typeExerciceHint } from "../constants";

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

  const chooseKind = (next: string) => {
    setKind(next);
    if (next === "independant") {
      setPickedIds([]);
      setPrincipalId("");
      setHorsCatalogue(false);
    }
  };

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
      setErr("Désignez l'établissement principal (étoile).");
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
        structure_ids: independant ? [] : pickedIds,
        structure_principale: independant ? null : principalId || null,
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

  const kindLabel = TYPE_EXERCICE.find((k) => k.v === kind)?.l || kind;
  const principalNom = hospitals.find((h) => h.id === principalId)?.nom;
  const pickedNoms = hospitals.filter((h) => pickedIds.includes(h.id)).map((h: any) => h.nom);
  const recapLieu = independant
    ? nomLibre.trim() || "Nom du cabinet à renseigner"
    : pickedNoms.length
      ? pickedNoms.length > 2
        ? `${pickedNoms[0]} + ${pickedNoms.length - 1} autres`
        : pickedNoms.join(", ")
      : nomLibre.trim() || "Aucun établissement choisi";

  const recapReady = useMemo(
    () =>
      independant ? Boolean(nomLibre.trim()) : Boolean(pickedIds.length || nomLibre.trim()),
    [independant, nomLibre, pickedIds.length]
  );

  return (
    <div className="pin-gate" role="dialog" aria-modal="true" aria-labelledby="hospital-gate-title">
      <div
        className="pin-gate__card"
        style={{
          textAlign: "left",
          width: "min(520px, 100%)",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div className="auth-head" style={{ textAlign: "center", flexShrink: 0 }}>
          <div className="pin-gate__icon">
            <Building2 size={24} />
          </div>
          <p className="auth-kicker">Première connexion</p>
          <h2 id="hospital-gate-title">Votre exercice</h2>
          <p className="muted">D’abord le type, ensuite seulement les champs utiles.</p>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
          <p className="label" id="gate-kind-label">
            Type d'exercice
          </p>
          <div className="kind-chips" role="radiogroup" aria-labelledby="gate-kind-label">
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

          <section className="auth-group" aria-labelledby="gate-lieu-title">
            <h2 className="auth-group__title" id="gate-lieu-title">
              Où j'exerce
            </h2>
            <div className="field">
              <label className="label" htmlFor="gate-ville">
                Ville d'exercice
              </label>
              <input
                id="gate-ville"
                className="input"
                value={ville}
                onChange={(e) => setVille(e.target.value)}
                placeholder="Cotonou"
              />
            </div>
            {independant ? (
              <div className="field">
                <label className="label" htmlFor="gate-etab">
                  Nom du cabinet / exercice
                </label>
                <input
                  id="gate-etab"
                  className="input"
                  value={nomLibre}
                  onChange={(e) => setNomLibre(e.target.value)}
                  placeholder="Cabinet Dr. Kpo"
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
                    <label className="label" htmlFor="gate-etab">
                      Nom hors catalogue
                    </label>
                    <input
                      id="gate-etab"
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

          <section className="auth-group" aria-labelledby="gate-ids-title">
            <h2 className="auth-group__title" id="gate-ids-title">
              Identifiants professionnels
            </h2>
            <p className="muted auth-hint">Facultatif. Utile pour la validation admin.</p>
            <div className="auth-grid">
              <div className="field">
                <label className="label">N° autorisation</label>
                <input className="input" value={autorisation} onChange={(e) => setAutorisation(e.target.value)} />
              </div>
              <div className="field">
                <label className="label">N° Ordre National</label>
                <input className="input" value={ordre} onChange={(e) => setOrdre(e.target.value)} />
              </div>
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
            <PhoneInput id="pro-ligne" label="Ligne professionnelle +229" value={lignePro} onChange={setLignePro} />
          </section>

          <section className="auth-recap" aria-labelledby="gate-recap-title">
            <h2 className="auth-group__title" id="gate-recap-title">
              Récapitulatif
            </h2>
            <dl>
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
            </dl>
            {!recapReady ? (
              <p className="muted auth-hint">Complétez le lieu d'exercice pour valider.</p>
            ) : null}
          </section>
        </div>
        <div className="auth-sticky" style={{ marginTop: 0 }}>
          {err ? <p className="auth-error">{err}</p> : null}
          <button className="btn auth-submit" disabled={busy} onClick={() => void save()}>
            {busy ? "Enregistrement…" : "Valider"}
          </button>
        </div>
      </div>
    </div>
  );
}

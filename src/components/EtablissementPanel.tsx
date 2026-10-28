import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Building2, CreditCard, X } from "lucide-react";
import { api } from "../api";
import { formatApiError } from "../apiMessage";
import { DotoCardPreview, type DotoCardPatient } from "./DotoCardPreview";
import { useAppStore } from "../store/appStore";

type TransferBrief = {
  id: number;
  status: string;
  status_label: string;
  from_structure_nom: string;
  to_structure_nom: string;
  from_approved: boolean;
  to_approved: boolean;
};

type Etab = {
  hopital_mere_id?: number | null;
  hopital_mere_nom?: string | null;
  app_activee?: boolean;
  medecin_referent_id?: number | null;
  medecin_referent_nom?: string | null;
  peut_emettre_carte?: boolean;
  peut_designer_referent?: boolean;
  peut_lancer_transfert?: boolean;
  peut_demander_transfert?: boolean;
  transfert?: TransferBrief | null;
};

function errMessage(e: unknown): string {
  return formatApiError(e, "Action impossible.");
}

type IssuedCard = { id: number; date_expiration?: string };

function pickCard(raw: unknown): IssuedCard | null {
  const data = raw as {
    id?: number;
    date_expiration?: string;
    card?: IssuedCard;
    results?: Array<IssuedCard & { is_active?: boolean; statut?: string }>;
  };
  const rows = Array.isArray(raw)
    ? (raw as Array<IssuedCard & { is_active?: boolean; statut?: string }>)
    : Array.isArray(data?.results)
      ? data.results
      : null;
  if (rows) {
    const active = rows.find((item) => item?.is_active !== false && (!item?.statut || item.statut === "active") && item?.id);
    if (!active?.id) return null;
    return { id: Number(active.id), date_expiration: active.date_expiration };
  }
  const card = data?.card?.id ? data.card : data;
  if (!card?.id) return null;
  return { id: Number(card.id), date_expiration: card.date_expiration };
}

function Modal({
  title,
  label,
  icon,
  wide,
  onClose,
  children,
}: {
  title: string;
  label: string;
  icon: ReactNode;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="settings-modal-root" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" className="settings-modal-backdrop" aria-label="Fermer" onClick={onClose} />
      <div className={"settings-modal-card" + (wide ? " dotocard-modal" : "")} style={{ maxWidth: wide ? 760 : 560 }}>
        <div className="settings-modal-head">
          <span className="settings-modal-ico">{icon}</span>
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

export function EtablissementPanel({
  patientId,
  patient,
  etablissement,
  photoUrl,
  onChanged,
}: {
  patientId: number;
  patient?: DotoCardPatient | null;
  etablissement?: Etab | null;
  photoUrl?: string | null;
  onChanged?: () => void;
}) {
  const setToast = useAppStore((s) => s.setToast);
  const user = useAppStore((s) => s.user);
  const etab = etablissement || {};
  const show =
    etab.hopital_mere_nom ||
    etab.peut_emettre_carte ||
    etab.peut_designer_referent ||
    etab.peut_demander_transfert ||
    etab.transfert;
  const [open, setOpen] = useState<"carte" | "hopital" | null>(null);
  const [medecins, setMedecins] = useState<{ id: number; full_name: string }[]>([]);
  const [referent, setReferent] = useState<string>(etab.medecin_referent_id ? String(etab.medecin_referent_id) : "");
  const [heures, setHeures] = useState("72");
  const [busy, setBusy] = useState(false);
  const [localPhoto, setLocalPhoto] = useState(photoUrl || "");
  const [issued, setIssued] = useState<IssuedCard | null>(null);
  const [checkingCard, setCheckingCard] = useState(false);

  const myHospital =
    user?.structures?.find((s) => s.id && s.id === user.structure_principale)?.nom ||
    user?.nom_etablissement ||
    "votre hôpital";

  useEffect(() => {
    setReferent(etab.medecin_referent_id ? String(etab.medecin_referent_id) : "");
  }, [etab.medecin_referent_id]);

  useEffect(() => {
    setLocalPhoto(photoUrl || "");
  }, [photoUrl]);

  useEffect(() => {
    if (open !== "carte") return;
    let stop = false;
    setCheckingCard(true);
    setIssued(null);
    api
      .dodocards(`?patient=${patientId}&statut=active`)
      .then((raw) => {
        if (stop) return;
        setIssued(pickCard(raw));
      })
      .catch(() => {
        if (!stop) setIssued(null);
      })
      .finally(() => {
        if (!stop) setCheckingCard(false);
      });
    return () => {
      stop = true;
    };
  }, [open, patientId]);

  useEffect(() => {
    if (!etab.peut_designer_referent || open !== "hopital") return;
    let stop = false;
    api
      .medecinsReferents(patientId)
      .then((rows) => {
        if (!stop) setMedecins(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, [patientId, etab.peut_designer_referent, open]);

  if (!show) return null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      setToast(ok);
      onChanged?.();
    } catch (e) {
      setToast(errMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onTransfer = (e: FormEvent) => {
    e.preventDefault();
    const hours = Number(heures);
    if (!Number.isFinite(hours) || hours < 1) {
      setToast("Indiquez une durée en heures.");
      return;
    }
    void run(
      () =>
        api.createHopitalTransfer({
          patient_id: patientId,
          duration_hours: hours,
          ...(user?.structure_principale ? { to_structure_id: user.structure_principale } : {}),
        }),
      "Demande envoyée à l'hôpital mère actuel"
    );
  };

  const transfert = etab.transfert;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div className="small muted" style={{ fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase" }}>
            Hôpital mère
          </div>
          <div style={{ fontWeight: 800, marginTop: 4 }}>{etab.hopital_mere_nom || "Non renseigné"}</div>
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            {etab.app_activee
              ? "Le patient valide les demandes extérieures."
              : "Demandes extérieures traitées par l'accueil ou le médecin référent."}
            {etab.medecin_referent_nom ? ` Référent : ${etab.medecin_referent_nom}.` : ""}
          </p>
          {transfert ? (
            <p className="small" style={{ margin: "6px 0 0" }}>
              Transfert {transfert.from_structure_nom} → {transfert.to_structure_nom} · {transfert.status_label}
            </p>
          ) : null}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {etab.peut_emettre_carte ? (
            <button className="btn ghost sm" type="button" onClick={() => setOpen("carte")}>
              <CreditCard size={14} style={{ marginRight: 6 }} />
              DotoCard
            </button>
          ) : null}
          <button className="btn ghost sm" type="button" onClick={() => setOpen("hopital")}>
            <Building2 size={14} style={{ marginRight: 6 }} />
            Hôpital mère
          </button>
        </div>
      </div>

      {open === "carte" ? (
        <Modal
          title={issued ? "Aperçu de la carte" : "DotoCard"}
          label={issued ? "Aperçu de la DotoCard" : "Émettre la DotoCard"}
          icon={<CreditCard size={18} />}
          wide={!!issued}
          onClose={() => {
            setOpen(null);
            setIssued(null);
          }}
        >
          {checkingCard && !issued ? (
            <p className="muted">Ouverture de la carte…</p>
          ) : issued ? (
            <DotoCardPreview
              patient={patient || {}}
              photoUrl={localPhoto || patient?.photo_url}
              cardId={issued.id}
              expiry={issued.date_expiration}
            />
          ) : (
            <>
              <p className="muted small">
                Photo, nom et date de naissance sont nécessaires. Le QR ne contient pas le dossier.
              </p>
              {localPhoto ? (
                <img
                  src={localPhoto}
                  alt=""
                  style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 16, margin: "12px 0" }}
                />
              ) : (
                <p style={{ marginTop: 12 }}>Aucune photo d&apos;identité pour l&apos;instant.</p>
              )}
              <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <label className="btn ghost sm" style={{ cursor: "pointer" }}>
                  Photo d&apos;identité
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      void run(async () => {
                        const data = await api.uploadPatientPhoto(patientId, file);
                        if (data?.photo_url) setLocalPhoto(data.photo_url);
                      }, "Photo enregistrée");
                    }}
                  />
                </label>
                <button
                  className="btn sm"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const card = await api.emettreCarte(patientId);
                      const next = pickCard(card);
                      if (!next) throw new Error("La carte n'a pas pu être préparée.");
                      setIssued(next);
                    }, "DotoCard prête")
                  }
                >
                  Émettre la DotoCard
                </button>
              </div>
            </>
          )}
        </Modal>
      ) : null}

      {open === "hopital" ? (
        <Modal title="Hôpital mère" label="Hôpital mère" icon={<Building2 size={18} />} onClose={() => setOpen(null)}>
          <p style={{ marginTop: 0 }}>
            <strong>{etab.hopital_mere_nom || "Non renseigné"}</strong>
            {etab.app_activee
              ? " — le patient valide les demandes extérieures."
              : " — l'accueil ou le médecin référent traite les demandes extérieures."}
          </p>
          {etab.medecin_referent_nom ? (
            <p className="small muted">Médecin référent : {etab.medecin_referent_nom}</p>
          ) : (
            <p className="small muted">Aucun médecin référent : seul l&apos;accueil peut accepter.</p>
          )}
          {transfert ? (
            <p>
              Transfert en cours : {transfert.from_structure_nom} → {transfert.to_structure_nom} ({transfert.status_label}).
              Les deux hôpitaux ont accès. Une fois confirmé, {transfert.to_structure_nom} reçoit les demandes extérieures.
            </p>
          ) : (
            <p className="small muted">
              La demande de transfert part de l&apos;hôpital qui veut devenir l&apos;hôpital mère. L&apos;hôpital actuel accepte ensuite.
              Pendant le transfert, les deux ont accès.
            </p>
          )}

          {etab.peut_designer_referent ? (
            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <select className="input" value={referent} onChange={(e) => setReferent(e.target.value)}>
                <option value="">Aucun médecin référent</option>
                {medecins.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
              <button
                className="btn sm"
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => api.setMedecinReferent(patientId, referent ? Number(referent) : null),
                    "Médecin référent enregistré"
                  )
                }
              >
                Enregistrer
              </button>
            </div>
          ) : null}

          {etab.peut_demander_transfert ? (
            <form onSubmit={onTransfer} style={{ marginTop: 16 }}>
              <p style={{ marginBottom: 8 }}>
                {myHospital} demande à devenir l&apos;hôpital mère. {etab.hopital_mere_nom || "L'hôpital actuel"} doit accepter.
              </p>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={8784}
                  value={heures}
                  onChange={(e) => setHeures(e.target.value)}
                  aria-label="Durée conservée par l'ancien hôpital, en heures"
                  style={{ maxWidth: 140 }}
                />
                <button className="btn sm" type="submit" disabled={busy}>
                  Demander le transfert
                </button>
              </div>
              <p className="small muted">
                Durée en heures pendant laquelle l&apos;ancien hôpital garde l&apos;accès déjà ouvert après confirmation.
              </p>
            </form>
          ) : null}

          {transfert && !etab.peut_demander_transfert ? (
            <p style={{ marginTop: 12 }}>
              <Link to="/demandes" className="btn sm">
                Traiter la demande
              </Link>
            </p>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}

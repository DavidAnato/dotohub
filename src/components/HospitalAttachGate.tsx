import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { api } from "../api";
import { HospitalPicker } from "./HospitalPicker";
import { useAppStore } from "../store/appStore";

/** Première connexion : rattachement hôpitaux obligatoire (pas une nouvelle page). */
export function HospitalAttachGate({
  onDone,
}: {
  onDone: (user: any) => void;
}) {
  const setToast = useAppStore((s) => s.setToast);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [pickedIds, setPickedIds] = useState<number[]>([]);
  const [principalId, setPrincipalId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .hospitals()
      .then((r: any) => setHospitals(r.structures || []))
      .catch(() => setHospitals([]));
  }, []);

  const save = async () => {
    if (!pickedIds.length) {
      setErr("Choisissez au moins un hôpital.");
      return;
    }
    if (!principalId) {
      setErr("Désignez l'hôpital principal.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const updated = await api.updateMe({
        structure_ids: pickedIds,
        structure_principale: principalId || null,
      });
      localStorage.setItem("doto_user", JSON.stringify(updated));
      setToast("Hôpitaux enregistrés.");
      onDone(updated);
    } catch (e: any) {
      setErr(e?.data?.structure_ids?.[0] || e?.data?.structure_principale?.[0] || e.message || "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pin-gate" role="dialog" aria-modal="true" aria-labelledby="hospital-gate-title">
      <div className="pin-gate__card" style={{ textAlign: "left", width: "min(440px, 100%)" }}>
        <div className="pin-gate__icon">
          <Building2 size={28} />
        </div>
        <h2 id="hospital-gate-title" style={{ textAlign: "center" }}>
          Vos hôpitaux
        </h2>
        <p className="muted" style={{ textAlign: "center" }}>
          Choisissez les structures où vous exercez et désignez le principal.
        </p>
        <HospitalPicker
          hospitals={hospitals}
          pickedIds={pickedIds}
          principalId={principalId}
          onChangePicked={setPickedIds}
          onChangePrincipal={setPrincipalId}
        />
        {err ? <p style={{ color: "var(--emergency)", marginTop: 10 }}>{err}</p> : null}
        <button className="btn" style={{ width: "100%", marginTop: 16 }} disabled={busy} onClick={() => void save()}>
          {busy ? "Enregistrement…" : "Valider"}
        </button>
      </div>
    </div>
  );
}

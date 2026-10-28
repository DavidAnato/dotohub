import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { formatApiError } from "../apiMessage";
import { useAppStore } from "../store/appStore";

function errMessage(e: unknown): string {
  return formatApiError(e, "Action impossible.");
}

export default function Demandes() {
  const setToast = useAppStore((s) => s.setToast);
  const [rows, setRows] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inbox, xf] = await Promise.all([api.accessInbox(), api.hopitalTransfers()]);
      setRows(Array.isArray(inbox) ? inbox : []);
      setTransfers(Array.isArray(xf) ? xf : []);
    } catch (e) {
      setToast(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, [setToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setToast(ok);
      await load();
    } catch (e) {
      setToast(errMessage(e));
    }
  };

  return (
    <div className="page-enter">
      <header className="page-head">
        <h1>Demandes d'accès</h1>
        <p className="muted">
          Accueil de l'hôpital mère, ou médecin référent s'il est désigné. Sans médecin référent,
          seul l'accueil répond. Dès que le patient active son téléphone, ces demandes lui reviennent.
        </p>
      </header>

      {loading ? <div className="skel" style={{ height: 120 }} /> : null}

      <section className="panel" style={{ marginBottom: 16 }}>
        <h3>À accepter</h3>
        {rows.length === 0 && !loading ? (
          <p className="muted">Aucune demande en attente pour votre rôle.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Demandeur</th>
                  <th>Durée</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/patient/${r.patient_id}`}>{r.patient_name}</Link>
                      <div className="small muted mono">{r.patient_npi}</div>
                    </td>
                    <td>
                      {r.requester_name}
                      <div className="small muted">
                        {r.requester_role_label}
                        {r.structure ? ` · ${r.structure}` : ""}
                      </div>
                    </td>
                    <td>{r.duration_label || (r.requested_duration_hours ? `${r.requested_duration_hours} h` : "—")}</td>
                    <td>
                      <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
                        <button
                          className="btn sm"
                          type="button"
                          onClick={() => void act(() => api.approveAccess(r.id), "Accès accordé pour la durée demandée")}
                        >
                          Accepter
                        </button>
                        <button
                          className="btn ghost sm"
                          type="button"
                          onClick={() => void act(() => api.denyAccess(r.id), "Demande refusée")}
                        >
                          Refuser
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Transferts d'hôpital mère</h3>
        {transfers.length === 0 && !loading ? (
          <p className="muted">Aucun transfert en cours.</p>
        ) : (
          transfers.map((t) => (
            <div key={t.id} className="card" style={{ marginBottom: 10 }}>
              <strong>{t.patient_name}</strong>
              <p className="small" style={{ margin: "6px 0" }}>
                {t.to_structure_nom} demande à devenir l&apos;hôpital mère (aujourd&apos;hui {t.from_structure_nom}) · {t.status_label}
                {t.duration_label ? ` · ancien hôpital ${t.duration_label}` : ""}
              </p>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {t.peut_accepter ? (
                  <>
                    <button className="btn sm" type="button" onClick={() => void act(() => api.approveHopitalTransfer(t.id), "Accord enregistré")}>
                      Accepter
                    </button>
                    <button className="btn ghost sm" type="button" onClick={() => void act(() => api.denyHopitalTransfer(t.id), "Transfert refusé")}>
                      Refuser
                    </button>
                  </>
                ) : null}
                {t.peut_confirmer ? (
                  <button className="btn sm" type="button" onClick={() => void act(() => api.confirmHopitalTransfer(t.id), "Nouvel hôpital mère confirmé")}>
                    Confirmer le transfert
                  </button>
                ) : null}
                {t.peut_annuler ? (
                  <button className="btn ghost sm" type="button" onClick={() => void act(() => api.cancelHopitalTransfer(t.id), "Transfert annulé")}>
                    Annuler
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

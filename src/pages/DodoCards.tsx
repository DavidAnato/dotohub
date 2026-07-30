import { useDodoCards, useReissueCard, useRevokeCard } from "../queries/hooks";
import { useAuth } from "../auth";
import { Empty } from "../components";
import { api } from "../api";

export default function DodoCards() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data: cards = [], isLoading } = useDodoCards();
  const revoke = useRevokeCard();
  const reissue = useReissueCard();

  if (isLoading) {
    return (
      <div className="page-enter">
        <div className="skel" style={{ height: 28, width: 180, marginBottom: 16 }} />
        <div className="grid cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skel skel-card" style={{ height: 280 }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <header className="page-head">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1>DotoCard</h1>
            <p className="muted">
              Cartes d&apos;accès QR. Le QR ne contient qu&apos;un token chiffré — jamais de données
              médicales. En cas de perte, le token est révoqué en moins d&apos;une minute.
            </p>
          </div>
          {isAdmin ? (
            <span className="pill blue">Admin · gestion active</span>
          ) : (
            <span className="pill grey">Lecture seule</span>
          )}
        </div>
      </header>

      {cards.length === 0 && <Empty text="Aucune DotoCard émise." />}

      <div className="grid cols-3 dotocard-grid">
        {cards.map((c: any) => (
          <div className="card" key={c.id}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <strong>{c.patient_detail.full_name}</strong>
              <span className={"pill " + (c.is_active ? "green" : "red")}>{c.statut_label}</span>
            </div>
            <img
              src={api.qrUrl(c.id)}
              alt={`QR DotoCard ${c.patient_detail.full_name}`}
              className="qr-surface"
              style={{
                width: "100%",
                maxWidth: 180,
                margin: "0 auto",
                display: "block",
              }}
            />
            <div className="small muted mono" style={{ textAlign: "center", marginTop: 8 }}>
              {c.patient_detail.npi}
            </div>
            <div className="small muted" style={{ textAlign: "center" }}>
              Expire le {c.date_expiration}
            </div>
            {c.motif ? (
              <div className="small muted" style={{ textAlign: "center", marginTop: 4 }}>
                Motif : {c.motif}
                {c.lost_at ? ` · ${new Date(c.lost_at).toLocaleString("fr-FR")}` : ""}
              </div>
            ) : null}
            {isAdmin && (
              <div
                className="row"
                style={{ gap: 8, marginTop: 14, justifyContent: "center", flexWrap: "wrap" }}
              >
                {c.is_active && (
                  <button
                    className="btn danger sm"
                    disabled={revoke.isPending || reissue.isPending}
                    onClick={() => {
                      if (window.confirm("Signaler la perte et révoquer cette carte ?")) {
                        revoke.mutate(c.id);
                      }
                    }}
                  >
                    {revoke.isPending ? "Révocation…" : "Signaler perte"}
                  </button>
                )}
                <button
                  className="btn ghost sm"
                  disabled={reissue.isPending || revoke.isPending}
                  onClick={() => {
                    if (window.confirm("Réémettre une nouvelle DotoCard ?")) {
                      reissue.mutate(c.id);
                    }
                  }}
                >
                  {reissue.isPending ? "Réémission…" : "Réémettre"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {!isAdmin && (
        <p className="small muted" style={{ marginTop: 16 }}>
          La gestion (révocation / réémission) est réservée à l&apos;admin structure.
        </p>
      )}
    </div>
  );
}

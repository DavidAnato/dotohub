import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Camera, ShieldAlert } from "lucide-react";
import { api } from "../api";
import { Avatar } from "../components/Avatar";

export default function Recherche() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const urgenceParam = params.get("urgence");
  const urgenceFromQuery =
    urgenceParam === "1" || urgenceParam === "true" || urgenceParam === "oui";
  const [npi, setNpi] = useState(params.get("npi") || "");
  const [nom, setNom] = useState(params.get("nom") || "");
  const [token, setToken] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [emergency, setEmergency] = useState(urgenceFromQuery);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const searchNpi = async (override?: { npi?: string; nom?: string }) => {
    const npiVal = override?.npi ?? npi;
    const nomVal = override?.nom ?? nom;
    setMsg("");
    setBusy(true);
    try {
      const query = npiVal
        ? `npi=${encodeURIComponent(npiVal)}`
        : `nom=${encodeURIComponent(nomVal)}`;
      const data = await api.searchPatients(query);
      setResults(data);
      if (!data.length) setMsg("Aucun patient trouvé.");
    } catch (e: any) {
      setMsg(e?.data?.detail || "Erreur de recherche.");
    } finally {
      setBusy(false);
    }
  };

  const openPatient = async (patientId: number) => {
    if (emergency) {
      setBusy(true);
      setMsg("");
      try {
        const res = await api.requestAccess(patientId, { emergency: true });
        if (res?.emergency || res?.status === "emergency_bypass") {
          setMsg("Accès urgence sans consentement — journalisé.");
        }
        nav(`/patient/${patientId}`);
      } catch (e: any) {
        setMsg(e?.data?.detail || "Impossible d'ouvrir en mode urgence.");
      } finally {
        setBusy(false);
      }
      return;
    }
    // Pas de demande d'accès auto — le dossier affiche les infos de base.
    nav(`/patient/${patientId}`);
  };

  const resolveToken = async (raw: string) => {
    setMsg("");
    setBusy(true);
    try {
      const res = await api.scan(raw.trim(), emergency);
      if (res.consent_required) {
        setMsg("Demande envoyée au patient — en attente de confirmation…");
      } else if (res.emergency || emergency) {
        setMsg("Accès urgence sans consentement — journalisé.");
      }
      nav(`/patient/${res.patient_id}`);
    } catch (e: any) {
      setMsg(e?.data?.detail || "Token invalide.");
    } finally {
      setBusy(false);
    }
  };

  const stopScan = async () => {
    try {
      if (scannerRef.current?.isScanning) await scannerRef.current.stop();
    } catch {
      /* ignore */
    }
    scannerRef.current = null;
    setScanning(false);
  };

  const startScan = async () => {
    setMsg("");
    setScanning(true);
    await new Promise((r) => setTimeout(r, 50));
    try {
      const scanner = new Html5Qrcode("doto-qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 8, qrbox: { width: 240, height: 240 } },
        async (decoded) => {
          await stopScan();
          setToken(decoded);
          await resolveToken(decoded);
        },
        () => {}
      );
    } catch (e: any) {
      setScanning(false);
      setMsg(
        e?.message?.includes("Permission") || e?.name === "NotAllowedError"
          ? "Autorisez l'accès à la caméra dans le navigateur."
          : "Caméra indisponible — collez le token ou utilisez une douchette."
      );
    }
  };

  useEffect(() => {
    return () => {
      stopScan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const qUrgence = params.get("urgence");
    if (qUrgence === "1" || qUrgence === "true" || qUrgence === "oui") {
      setEmergency(true);
    }
    const qNpi = params.get("npi");
    const qNom = params.get("nom");
    if (qNpi || qNom) {
      searchNpi({ npi: qNpi || "", nom: qNom || "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <header className="page-head">
        <h1>Recherche patient</h1>
        <p className="muted">
          Identifiez un patient par NPI, nom, scan caméra DotoCard, ou douchette USB.
        </p>
      </header>

      <div className={`panel search-emergency${emergency ? " is-on" : ""}`}>
        <div className="row" style={{ gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <ShieldAlert size={20} color={emergency ? "var(--emergency)" : "var(--muted)"} />
            <div>
              <strong style={{ color: emergency ? "var(--emergency)" : "var(--heading)" }}>
                Mode urgence
              </strong>
              <p className="small muted" style={{ margin: "2px 0 0" }}>
                Bypass consentement — accès limité journalisé (scan &amp; demande d&apos;accès).
              </p>
            </div>
          </div>
          <label className="row" style={{ gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={emergency}
              onChange={(e) => {
                if (!e.target.checked) {
                  setEmergency(false);
                  return;
                }
                if (
                  !window.confirm(
                    "Activer le mode urgence ? Bypass consentement — accès limité et journalisé."
                  )
                ) {
                  return;
                }
                setEmergency(true);
              }}
              aria-label="Activer le mode urgence"
            />
            <span className="small" style={{ fontWeight: 650 }}>
              {emergency ? "Activé" : "Désactivé"}
            </span>
          </label>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 14 }}>
        <div className="panel">
          <label className="label">NPI officiel (ANIP)</label>
          <div className="row">
            <input
              className="input mono"
              placeholder="1234567890"
              value={npi}
              onChange={(e) => setNpi(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchNpi()}
            />
            <button className="btn" onClick={() => searchNpi()} disabled={busy || (!npi && !nom)}>
              Rechercher
            </button>
          </div>
          <div style={{ marginTop: 14 }}>
            <label className="label">Ou par nom</label>
            <input
              className="input"
              placeholder="ADJOVI"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchNpi()}
            />
          </div>
        </div>

        <div className="panel">
          <label className="label">Scan DotoCard</label>
          <p className="small muted" style={{ marginBottom: 10 }}>
            Caméra smartphone / webcam, ou collez le token lu par une douchette USB.
          </p>

          {!scanning ? (
            <button className="btn emerald" style={{ width: "100%", marginBottom: 12 }} onClick={startScan} disabled={busy}>
              <Camera size={16} strokeWidth={2} aria-hidden />
              Scanner avec la caméra
            </button>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <div id="doto-qr-reader" style={{ width: "100%", borderRadius: 12, overflow: "hidden" }} />
              <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={stopScan}>
                Arrêter le scan
              </button>
            </div>
          )}

          <textarea
            className="textarea"
            rows={3}
            placeholder="Token chiffré du QR…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button
            className="btn"
            style={{ marginTop: 12, width: "100%" }}
            onClick={() => resolveToken(token)}
            disabled={busy || !token}
          >
            Résoudre le token
          </button>
        </div>
      </div>

      {msg && (
        <p style={{ color: "var(--emergency)", marginTop: 16, fontWeight: 600 }}>{msg}</p>
      )}

      {results.length > 0 && (
        <div className="panel table-wrap" style={{ marginTop: 20 }}>
          <table>
            <thead>
              <tr>
                <th>NPI</th>
                <th>Patient</th>
                <th>Naissance</th>
                <th>Groupe</th>
                <th>ANIP</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.npi}</td>
                  <td style={{ fontWeight: 600 }}>
                    <span className="row" style={{ gap: 8, alignItems: "center" }}>
                      <Avatar src={p.photo_url} name={p.full_name} size={28} />
                      {p.full_name}
                    </span>
                  </td>
                  <td>{p.date_naissance || "—"}</td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span className="pill red">{p.groupe_sanguin || "Non identifié"}</span>
                      {p.electrophorese ? (
                        <span className="pill blue" style={{ alignSelf: "flex-start" }}>
                          Électro {p.electrophorese}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    {p.npi_verifie_anip ? (
                      <span className="pill green">Vérifié</span>
                    ) : (
                      <span className="pill amber">Non vérifié</span>
                    )}
                  </td>
                  <td>
                    <button className="btn sm" disabled={busy} onClick={() => openPatient(p.id)}>
                      {emergency ? "Ouvrir (urgence)" : "Demander l'accès"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

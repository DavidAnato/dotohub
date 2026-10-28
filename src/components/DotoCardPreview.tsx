import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Download, Printer, RefreshCw, User } from "lucide-react";
import { api } from "../api";
import armoiriesUrl from "../assets/armoiries-benin.png";
import { buildCardPdf, downloadBlob, printBlob } from "./dotocardPdf";

const NAVY = "#003462";
const TEAL = "#3d8ba8";
const RED = "#c01818";
const ORANGE = "#d03a00";
const BORDER = "#1f3a6e";
const LABEL = "#8b95a1";
const FRONT_BG = "#e3e3e9";
const BACK_BG = "#f7f7f7";
const BAND = "#f6d4d0";
const INS_BG = "#fde6dc";
const EXPORT_W = 960;

export type DotoCardPatient = {
  npi?: string | null;
  nom?: string | null;
  prenom?: string | null;
  date_naissance?: string | null;
  lieu_naissance?: string | null;
  telephone?: string | null;
  tel_urgence?: string | null;
  groupe_sanguin?: string | null;
  nom_pere?: string | null;
  nom_mere?: string | null;
  adresse_commune?: string | null;
  adresse_quartier?: string | null;
  photo_url?: string | null;
  dossier?: { allergies?: Array<string | null> | null } | null;
  assurance?: {
    assureur?: string | null;
    num_police?: string | null;
    droits_valides?: boolean | null;
  } | null;
  urgence?: {
    allergies?: Array<string | null> | null;
    groupe_sanguin?: string | null;
    tel_urgence?: string | null;
    assureur?: string | null;
    num_police?: string | null;
  } | null;
};

type Box = {
  w: number;
  h: number;
  px: (n: number) => number;
  headerH: number;
  pad: number;
  photo: number;
  qr: number;
  radius: number;
  border: number;
};

type FaceProps = {
  box: Box;
  fill?: boolean;
  patient: DotoCardPatient;
  photoSrc: string;
  qrSrc: string;
  cardId: number | string;
  expiry?: string | null;
};

function cardBox(w: number): Box {
  const h = w / 1.6;
  const s = w / 340;
  const px = (n: number) => Math.round(n * s * 10) / 10;
  const headerH = Math.round(h * 0.132);
  const photo = Math.round(h * 0.36);
  const qr = Math.round(Math.min(h * 0.3, photo * 0.92));
  return {
    w,
    h,
    px,
    headerH,
    pad: px(8),
    photo,
    qr,
    radius: w * (45 / 960),
    border: Math.max(2, w * (7 / 960)),
  };
}

function dash(value?: string | null) {
  const text = (value || "").trim();
  return text || "-";
}

function fmtDate(raw?: string | null) {
  const value = (raw || "").trim();
  if (!value) return "-";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return value;
}

function formatNpi(raw?: string | null) {
  const value = (raw || "").trim();
  if (!value) return "-";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  return value;
}

function displayPhone(raw?: string | null) {
  let d = (raw || "").replace(/\D/g, "");
  if (!d) return "-";
  if (d.startsWith("229")) d = d.slice(3);
  if (!d) return "-";
  if (!d.startsWith("01")) {
    d = d.replace(/^0+/, "");
    if (!d.startsWith("01")) d = `01${d}`;
  }
  d = d.slice(0, 10);
  const parts: string[] = [];
  for (let i = 0; i < d.length; i += 2) parts.push(d.slice(i, i + 2));
  return `+229 ${parts.join(" ")}`;
}

function allergiesText(list?: Array<string | null> | null) {
  const items = (list || []).map((item) => String(item || "").trim()).filter(Boolean);
  return items.length ? items.join(", ") : "-";
}

function cardNumber(id?: number | string) {
  if (id === undefined || id === null || id === "") return "-";
  return String(id);
}

type ImageState = { src: string; status: "empty" | "loading" | "ready" | "missing" };

function useImageBlob(url: string, allowPublic: boolean): ImageState {
  const [state, setState] = useState<ImageState>({ src: "", status: url ? "loading" : "empty" });
  useEffect(() => {
    if (!url) {
      setState({ src: "", status: "empty" });
      return;
    }
    let revoke = "";
    let stop = false;
    setState({ src: "", status: "loading" });
    const apply = (blob: Blob) => {
      if (stop) return false;
      if (blob.type && !blob.type.startsWith("image") && blob.type !== "application/octet-stream") return false;
      revoke = URL.createObjectURL(blob);
      setState({ src: revoke, status: "ready" });
      return true;
    };
    const run = async () => {
      try {
        if (apply(await api.authedBlob(url))) return;
      } catch {
        /* essai sans session, pour une photo déjà publique */
      }
      if (allowPublic) {
        try {
          const res = await fetch(url);
          if (res.ok && apply(await res.blob())) return;
        } catch {
          /* photo distante indisponible pour le PDF */
        }
      }
      if (!stop) setState({ src: "", status: "missing" });
    };
    void run();
    return () => {
      stop = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [url, allowPublic]);
  return state;
}

function Watermark({ box }: { box: Box }) {
  const cross = box.w * 0.34;
  const thick = Math.max(8, box.w * 0.062);
  const disc = box.w * 0.58;
  const top = box.h * 0.3;
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          width: disc,
          height: disc,
          borderRadius: "50%",
          border: `${Math.max(8, box.w * 0.04)}px solid rgba(168, 192, 214, 0.38)`,
          left: (box.w - disc) / 2,
          top: box.h * 0.2,
          boxSizing: "border-box",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: thick,
          height: cross,
          borderRadius: thick / 2,
          background: "rgba(176, 198, 218, 0.42)",
          left: (box.w - thick) / 2,
          top,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: cross,
          height: thick,
          borderRadius: thick / 2,
          background: "rgba(176, 198, 218, 0.42)",
          left: (box.w - cross) / 2,
          top: top + (cross - thick) / 2,
        }}
      />
    </div>
  );
}

function faceStyle(box: Box, bg: string, fill?: boolean): CSSProperties {
  return {
    width: fill ? "100%" : box.w,
    height: fill ? "100%" : box.h,
    borderRadius: box.radius,
    border: `${box.border}px solid ${BORDER}`,
    background: bg,
    overflow: "hidden",
    boxSizing: "border-box",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    fontFamily: '"DM Sans", "Segoe UI", sans-serif',
    color: NAVY,
    lineHeight: 1.15,
  };
}

function CardHeader({ box, title, republic }: { box: Box; title: string; republic?: boolean }) {
  const arms = box.headerH * 0.78;
  return (
    <div
      style={{
        height: box.headerH,
        background: NAVY,
        display: "flex",
        alignItems: "center",
        padding: `0 ${box.pad}px`,
        gap: box.px(4),
        flexShrink: 0,
        position: "relative",
        zIndex: 1,
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          color: "#fff",
          fontWeight: 800,
          fontSize: box.px(12),
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {title}
      </div>
      {republic ? (
        <div
          style={{
            color: "#fff",
            fontWeight: 600,
            fontSize: box.px(8.5),
            whiteSpace: "nowrap",
          }}
        >
          République du Bénin
        </div>
      ) : null}
      {republic ? (
        <img
          src={armoiriesUrl}
          alt=""
          style={{ width: arms * 1.15, height: arms, objectFit: "contain", flexShrink: 0 }}
        />
      ) : null}
    </div>
  );
}

function OneLine({
  text,
  size,
  weight,
  color,
  align = "left",
}: {
  text: string;
  size: number;
  weight: number;
  color: string;
  align?: "left" | "right" | "center";
}) {
  return (
    <div
      title={text !== "-" ? text : undefined}
      style={{
        color,
        fontSize: size,
        fontWeight: weight,
        textAlign: align,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        lineHeight: 1.15,
      }}
    >
      {text}
    </div>
  );
}

function IdentityField({ label, value, box }: { label: string; value: string; box: Box }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: LABEL, fontSize: box.px(7.5), fontWeight: 500, lineHeight: 1.1 }}>{label}</div>
      <OneLine text={value} size={box.px(11.5)} weight={800} color={NAVY} />
    </div>
  );
}

function CardFront({ box, fill, patient, photoSrc, qrSrc, cardId }: FaceProps) {
  const lastName = (patient.nom || "").trim();
  const qrCol = Math.max(box.qr + box.px(4), box.px(104));
  const phone = displayPhone(patient.telephone);
  return (
    <div style={faceStyle(box, FRONT_BG, fill)}>
      <Watermark box={box} />
      <CardHeader box={box} title="Carte d'accès santé" republic />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: `${box.px(4)}px ${box.pad}px ${box.px(3)}px`,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: box.px(6), alignItems: "flex-start" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: box.px(18), letterSpacing: -0.3, lineHeight: 1 }}>
              <span style={{ color: NAVY }}>Doto</span>
              <span style={{ color: TEAL }}>Card</span>
            </div>
            <OneLine text={`Carte N°: ${cardNumber(cardId)}`} size={box.px(10)} weight={800} color={NAVY} />
          </div>
          <div style={{ maxWidth: "48%", marginTop: box.px(2), textDecoration: "underline" }}>
            <OneLine text={`NPI: ${formatNpi(patient.npi)}`} size={box.px(10)} weight={800} color={NAVY} align="right" />
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "flex-start",
            gap: box.px(6),
            marginTop: box.px(4),
          }}
        >
          <div
            style={{
              width: box.photo,
              height: box.photo,
              borderRadius: box.px(3),
              overflow: "hidden",
              background: "#e7e9ee",
              border: "1px solid #c5cad3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {photoSrc ? (
              <img src={photoSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <User size={box.px(26)} color="#9CA3AF" aria-hidden />
            )}
          </div>

          <div
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: box.photo,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "1px 0",
            }}
          >
            <IdentityField label="Nom" value={lastName ? lastName.toUpperCase() : "-"} box={box} />
            <IdentityField label="Prénoms" value={dash(patient.prenom)} box={box} />
            <IdentityField label="Date de naissance" value={fmtDate(patient.date_naissance)} box={box} />
            <IdentityField label="Lieu de naissance" value={dash(patient.lieu_naissance)} box={box} />
          </div>

          <div style={{ width: qrCol, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            {qrSrc ? (
              <div style={{ background: "#fff", padding: 2 }}>
                <img
                  src={qrSrc}
                  alt="Code de la carte"
                  style={{ display: "block", width: box.qr, height: box.qr }}
                />
              </div>
            ) : (
              <div style={{ width: box.qr, height: box.qr, background: "#fff" }} />
            )}
            <div style={{ marginTop: box.px(3), width: "100%" }}>
              <OneLine text={`Num. tél: ${phone}`} size={box.px(8)} weight={800} color={NAVY} align="right" />
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          background: BAND,
          display: "flex",
          gap: box.px(6),
          padding: `${box.px(6)}px ${box.pad}px`,
          flexShrink: 0,
          position: "relative",
          zIndex: 1,
        }}
      >
        <FooterCol box={box} label="Groupe sanguin:" value={dash(patient.groupe_sanguin || patient.urgence?.groupe_sanguin)} />
        <FooterCol
          box={box}
          label="Allergies connues"
          value={allergiesText(patient.dossier?.allergies || patient.urgence?.allergies)}
          wide
        />
        <FooterCol
          box={box}
          label="Numéro en cas d'urgence"
          value={displayPhone(patient.tel_urgence || patient.urgence?.tel_urgence)}
        />
      </div>
    </div>
  );
}

function FooterCol({ box, label, value, wide }: { box: Box; label: string; value: string; wide?: boolean }) {
  return (
    <div style={{ flex: wide ? 1.35 : 1, minWidth: 0 }}>
      <div
        style={{
          color: RED,
          fontSize: box.px(7.2),
          fontWeight: 700,
          lineHeight: 1.15,
        }}
      >
        {label}
      </div>
      <div
        title={value !== "-" ? value : undefined}
        style={{
          color: RED,
          fontSize: box.px(10),
          fontWeight: 800,
          marginTop: 1,
          lineHeight: 1.15,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function MetaLine({ label, value, size }: { label: string; value: string; size: number }) {
  return (
    <div style={{ color: NAVY, fontSize: size, marginTop: 3, display: "flex", gap: 4, minWidth: 0 }}>
      <span style={{ fontWeight: 500, flexShrink: 0 }}>{label}</span>
      <span
        title={value !== "-" ? value : undefined}
        style={{ fontWeight: 800, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {value}
      </span>
    </div>
  );
}

function coverageOf(patient: DotoCardPatient) {
  const assurance = patient.assurance;
  if (assurance?.assureur && assurance.droits_valides !== false) {
    return { insured: true, label: assurance.assureur.trim(), policy: (assurance.num_police || "").trim() };
  }
  if (!assurance && patient.urgence?.assureur) {
    return {
      insured: true,
      label: patient.urgence.assureur.trim(),
      policy: (patient.urgence.num_police || "").trim(),
    };
  }
  return { insured: false, label: "Non assuré", policy: "" };
}

function CardBack({ box, fill, patient, expiry }: FaceProps) {
  const coverage = coverageOf(patient);
  const section = box.px(11);
  const meta = box.px(10);
  return (
    <div style={faceStyle(box, BACK_BG, fill)}>
      <Watermark box={box} />
      <CardHeader box={box} title="Informations complémentaires" />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: `${box.px(8)}px ${box.pad}px 0`,
          position: "relative",
          zIndex: 1,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", gap: box.px(12) }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                alignSelf: "flex-start",
                display: "inline-block",
                borderBottom: `1px solid ${NAVY}`,
                paddingRight: box.px(10),
                marginBottom: box.px(3),
                color: NAVY,
                fontWeight: 800,
                fontSize: section,
              }}
            >
              Filiation
            </div>
            <MetaLine label="Père:" value={dash(patient.nom_pere)} size={meta} />
            <MetaLine label="Mère:" value={dash(patient.nom_mere)} size={meta} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                borderBottom: `1px solid ${NAVY}`,
                marginBottom: box.px(3),
                color: NAVY,
                fontWeight: 800,
                fontSize: section,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Adresse de résidence
            </div>
            <MetaLine label="Com." value={dash(patient.adresse_commune)} size={meta} />
            <MetaLine label="Qtr:" value={dash(patient.adresse_quartier)} size={meta} />
          </div>
        </div>

        <div
          style={{
            marginTop: box.px(8),
            background: INS_BG,
            borderRadius: box.px(12),
            padding: `${box.px(8)}px ${box.px(10)}px`,
          }}
        >
          <div
            style={{
              color: ORANGE,
              fontWeight: 800,
              fontSize: box.px(10),
              letterSpacing: 0.2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            COUVERTURE ASSURANTIELLE
          </div>
          <div
            style={{
              display: "inline-block",
              maxWidth: "100%",
              marginTop: box.px(5),
              background: "#fff",
              borderRadius: 999,
              border: "1px solid #f0c2b0",
              padding: `${box.px(3)}px ${box.px(10)}px`,
              color: ORANGE,
              fontWeight: 800,
              fontSize: box.px(11),
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={coverage.label}
          >
            {coverage.label}
          </div>
          {coverage.insured ? (
            <div style={{ color: ORANGE, fontSize: box.px(9.5), fontWeight: 600, marginTop: box.px(6) }}>
              Police: {dash(coverage.policy)}
            </div>
          ) : (
            <>
              <div style={{ color: ORANGE, fontSize: box.px(9), fontWeight: 600, marginTop: box.px(6), lineHeight: 1.25 }}>
                Soins à paiement direct auprès des structures partenaires
              </div>
              <div style={{ color: ORANGE, fontSize: box.px(9), fontWeight: 600, marginTop: box.px(2), lineHeight: 1.25 }}>
                Urgence vitale : dispositif national de paiement différé
              </div>
            </>
          )}
        </div>
      </div>

      <div
        style={{
          color: RED,
          fontSize: box.px(7.4),
          textAlign: "center",
          lineHeight: `${box.px(10)}px`,
          padding: `0 ${box.pad}px`,
          position: "relative",
          zIndex: 1,
          flexShrink: 0,
        }}
      >
        Cette carte est strictement personnelle, non-transférable et demeure la propriété de l'émetteur.*
      </div>
      <div
        style={{
          color: NAVY,
          fontWeight: 800,
          fontSize: box.px(11),
          textAlign: "center",
          marginTop: box.px(3),
          marginBottom: box.px(7),
          position: "relative",
          zIndex: 1,
          flexShrink: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          padding: `0 ${box.pad}px`,
        }}
      >
        Valable jusqu'au : {fmtDate(expiry)}
      </div>
    </div>
  );
}

export function DotoCardPreview({
  patient,
  photoUrl,
  cardId,
  expiry,
}: {
  patient: DotoCardPatient;
  photoUrl?: string | null;
  cardId: number | string;
  expiry?: string | null;
}) {
  const stageRef = useRef<HTMLButtonElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
  const [flipped, setFlipped] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");

  const remotePhoto = (photoUrl || patient.photo_url || "").trim();
  const photo = useImageBlob(remotePhoto, true);
  const qr = useImageBlob(api.qrUrl(Number(cardId)), false);
  const previewPhoto = photo.src || remotePhoto;
  const photoBlob = photo.src;
  const box = cardBox(width);
  const exportBox = cardBox(EXPORT_W);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const apply = () => {
      const next = Math.max(280, Math.round(el.clientWidth));
      setWidth((current) => (Math.abs(current - next) < 2 ? current : next));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toggle = () => setFlipped((value) => !value);

  const serverPdf = async () => {
    const blob = await api.authedBlob(api.pdfUrl(Number(cardId)));
    const kind = blob.type || "";
    if (kind && !kind.includes("pdf") && !kind.includes("octet-stream")) {
      throw new Error("PDF indisponible.");
    }
    return blob;
  };

  const makePdf = async () => {
    const front = frontRef.current;
    const back = backRef.current;
    if (!front || !back) throw new Error("Aperçu indisponible.");
    try {
      return await buildCardPdf(front, back);
    } catch {
      return serverPdf();
    }
  };

  const onDownload = async () => {
    setPdfBusy(true);
    setPdfError("");
    try {
      const blob = await makePdf();
      downloadBlob(blob, "DotoCard.pdf");
    } catch {
      setPdfError("Le PDF n'a pas pu être préparé. Réessayez.");
    } finally {
      setPdfBusy(false);
    }
  };

  const onPrint = async () => {
    setPdfBusy(true);
    setPdfError("");
    try {
      const blob = await makePdf();
      printBlob(blob);
    } catch {
      setPdfError("L'impression n'a pas pu être préparée. Réessayez.");
    } finally {
      setPdfBusy(false);
    }
  };

  const shared = {
    patient,
    cardId,
    expiry,
  };

  const exportNode = (
    <div className="dotocard-export-root" aria-hidden>
      <div ref={frontRef} style={{ width: EXPORT_W, height: exportBox.h, background: "#fff" }}>
        <CardFront box={exportBox} photoSrc={photoBlob} qrSrc={qr.src} {...shared} />
      </div>
      <div ref={backRef} style={{ width: EXPORT_W, height: exportBox.h, background: "#fff", marginTop: 12 }}>
        <CardBack box={exportBox} photoSrc="" qrSrc="" {...shared} />
      </div>
    </div>
  );

  return (
    <div>
      <p className="muted small" style={{ marginTop: 0 }}>
        Recto et verso. Le QR reste sur le recto et ne contient pas le dossier.
      </p>
      <button
        ref={stageRef}
        type="button"
        className="dotocard-stage"
        style={{ height: box.h }}
        onClick={toggle}
        aria-label={flipped ? "Voir le recto" : "Voir le verso"}
      >
        <div className={"dotocard-rotor" + (flipped ? " is-back" : "")} style={{ height: box.h }}>
          <div className="dotocard-face" aria-hidden={flipped}>
            <CardFront box={box} fill photoSrc={previewPhoto} qrSrc={qr.src} {...shared} />
          </div>
          <div className="dotocard-face dotocard-face-back" aria-hidden={!flipped}>
            <CardBack box={box} fill photoSrc="" qrSrc="" {...shared} />
          </div>
        </div>
      </button>
      <div className="dotocard-actions">
        <button type="button" className="btn ghost sm" onClick={toggle}>
          <RefreshCw size={14} />
          {flipped ? "Voir le recto" : "Voir le verso"}
        </button>
        <button
          type="button"
          className="btn sm"
          disabled={pdfBusy || !qr.src || photo.status === "loading"}
          onClick={() => void onDownload()}
        >
          <Download size={14} />
          {pdfBusy ? "Préparation…" : "Télécharger le PDF"}
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={pdfBusy || !qr.src || photo.status === "loading"}
          onClick={() => void onPrint()}
        >
          <Printer size={14} />
          Imprimer
        </button>
      </div>
      <p className={"small muted dotocard-hint" + (pdfError || qr.status === "missing" ? " error" : "")}>
        {pdfError ||
          (qr.status === "missing"
            ? "Le code de la carte est indisponible pour le moment."
            : "Cliquez sur la carte pour la retourner. Le PDF compte deux pages, une par face.")}
      </p>
      {createPortal(exportNode, document.body)}
    </div>
  );
}

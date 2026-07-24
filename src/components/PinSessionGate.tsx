import { useEffect, useRef, useState } from "react";
import { Fingerprint, Lock, ShieldAlert } from "lucide-react";

const PIN_LEN = 5;

type PinBoxesProps = {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (pin: string) => void;
  error?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Affiche un loader centré et grise les cases (vérif / setup PIN) */
  loading?: boolean;
  label?: string;
};

export function PinBoxes({
  value,
  onChange,
  onComplete,
  error,
  autoFocus = true,
  disabled,
  loading = false,
  label,
}: PinBoxesProps) {
  const ref = useRef<HTMLInputElement>(null);
  const digits = value.replace(/\D/g, "").slice(0, PIN_LEN);
  const locked = !!(disabled || loading);

  useEffect(() => {
    if (autoFocus && !locked) {
      const t = window.setTimeout(() => ref.current?.focus(), 200);
      return () => window.clearTimeout(t);
    }
  }, [autoFocus, error, locked]);

  useEffect(() => {
    if (locked) ref.current?.blur();
  }, [locked]);

  const handle = (raw: string) => {
    if (locked) return;
    const next = raw.replace(/\D/g, "").slice(0, PIN_LEN);
    onChange(next);
    if (next.length === PIN_LEN) onComplete?.(next);
  };

  return (
    <div
      className={`pin-wrap${error ? " pin-wrap--error" : ""}${loading ? " pin-wrap--loading" : ""}`}
    >
      {label ? <p className="pin-label">{label}</p> : null}
      <div className="pin-boxes-shell">
        <button
          type="button"
          className="pin-boxes"
          onClick={() => !locked && ref.current?.focus()}
          disabled={locked}
          aria-label={label || "Code PIN"}
          aria-busy={loading || undefined}
        >
          {Array.from({ length: PIN_LEN }).map((_, i) => (
            <span
              key={i}
              className={`pin-box${i < digits.length ? " is-filled" : ""}${
                !locked && i === digits.length ? " is-active" : ""
              }`}
            >
              {i < digits.length ? "●" : ""}
            </span>
          ))}
        </button>
        {loading ? (
          <div className="pin-loader" aria-hidden>
            <div className="pin-loader__badge">
              <span className="pin-spinner" />
            </div>
          </div>
        ) : null}
      </div>
      <input
        ref={ref}
        className="pin-hidden"
        value={digits}
        onChange={(e) => handle(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={PIN_LEN}
        disabled={locked}
        aria-hidden
      />
    </div>
  );
}

type GateProps = {
  mode: "unlock" | "setup";
  error?: string;
  busy?: boolean;
  onSubmit: (pin: string) => void | Promise<void>;
  title?: string;
  subtitle?: string;
};

/** Modal plein écran — configuration ou déverrouillage PIN session Hub. */
export function PinSessionGate({
  mode,
  error,
  busy,
  onSubmit,
  title,
  subtitle,
}: GateProps) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState<"pin" | "confirm">("pin");
  const [localErr, setLocalErr] = useState("");
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!busy) submittingRef.current = false;
  }, [busy]);

  useEffect(() => {
    if (error) {
      setPin("");
      setConfirm("");
      setStep("pin");
      submittingRef.current = false;
    }
  }, [error]);

  const complete = async (v: string) => {
    if (busy || submittingRef.current) return;
    setLocalErr("");
    if (mode === "setup") {
      if (step === "pin") {
        setPin(v);
        setStep("confirm");
        setConfirm("");
        return;
      }
      if (v !== pin) {
        setLocalErr("Les codes ne correspondent pas.");
        setPin("");
        setConfirm("");
        setStep("pin");
        return;
      }
      submittingRef.current = true;
      await onSubmit(v);
      return;
    }
    submittingRef.current = true;
    await onSubmit(v);
  };

  const displayErr = localErr || error || "";
  const current = mode === "setup" && step === "confirm" ? confirm : pin;
  const setCurrent = mode === "setup" && step === "confirm" ? setConfirm : setPin;

  return (
    <div className="pin-gate" role="dialog" aria-modal="true" aria-labelledby="pin-gate-title">
      <div className="pin-gate__card">
        <div className="pin-gate__icon">
          {mode === "setup" ? <ShieldAlert size={28} /> : <Lock size={28} />}
        </div>
        <h2 id="pin-gate-title">
          {title ||
            (mode === "setup" ? "Configurer votre code PIN" : "Session verrouillée")}
        </h2>
        <p className="muted">
          {subtitle ||
            (mode === "setup"
              ? step === "confirm"
                ? "Confirmez votre code à 5 chiffres"
                : "Obligatoire pour sécuriser votre session Hub"
              : "Saisissez votre PIN pour continuer")}
        </p>
        <PinBoxes
          value={current}
          onChange={setCurrent}
          onComplete={complete}
          error={!!displayErr && !busy}
          disabled={busy}
          loading={!!busy}
          label="5 chiffres"
        />
        {displayErr && !busy ? <p className="pin-error">{displayErr}</p> : null}
        {busy ? <p className="pin-busy-hint muted">Vérification en cours…</p> : null}
        {mode === "unlock" ? (
          <p className="pin-hint small muted" style={{ marginTop: 20 }}>
            <Fingerprint size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
            Biométrie indisponible sur le web — PIN requis
          </p>
        ) : null}
      </div>
    </div>
  );
}

export { PIN_LEN };

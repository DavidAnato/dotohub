import { useMemo } from "react";

const BJ = "+229";

function digitsOnly(raw: string) {
  return (raw || "").replace(/\D/g, "");
}

export function nationalDigits(raw: string): string {
  let d = digitsOnly(raw);
  if (d.startsWith("229")) d = d.slice(3);
  return d.slice(0, 10);
}

export function formatNational(raw: string): string {
  const d = nationalDigits(raw);
  if (!d) return "";
  const parts: string[] = [];
  for (let i = 0; i < d.length; i += 2) parts.push(d.slice(i, i + 2));
  return parts.join(" ");
}

export function toE164Bj(raw: string): string {
  const nat = nationalDigits(raw);
  if (!nat) return "";
  return `${BJ} ${formatNational(nat)}`.trim();
}

type Props = {
  label: string;
  value: string;
  onChange: (full: string) => void;
  placeholder?: string;
  id?: string;
};

export function PhoneInput({
  label,
  value,
  onChange,
  placeholder = "97 45 12 88",
  id,
}: Props) {
  const local = useMemo(() => formatNational(value), [value]);

  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="phone-field">
        <span className="phone-prefix" aria-hidden="true">
          {BJ}
        </span>
        <input
          id={id}
          className="input phone-local"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={local}
          placeholder={placeholder}
          onChange={(e) => onChange(toE164Bj(e.target.value))}
          aria-label={`${label}, indicatif Bénin ${BJ}`}
        />
      </div>
      <p className="phone-hint">Indicatif Bénin prérempli — saisissez uniquement le numéro local.</p>
    </div>
  );
}

import { InputHTMLAttributes, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function PasswordInput({ className, ...rest }: Props) {
  const [revealed, setRevealed] = useState(false);
  const label = revealed ? "Masquer le mot de passe" : "Afficher le mot de passe";

  return (
    <div className="password-field">
      <input
        {...rest}
        className={["input", className].filter(Boolean).join(" ")}
        type={revealed ? "text" : "password"}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setRevealed((v) => !v)}
        aria-label={label}
        aria-pressed={revealed}
        title={label}
      >
        {revealed ? (
          <EyeOff size={18} strokeWidth={2} aria-hidden />
        ) : (
          <Eye size={18} strokeWidth={2} aria-hidden />
        )}
      </button>
    </div>
  );
}

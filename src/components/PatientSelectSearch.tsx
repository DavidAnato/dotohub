import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";

export type PatientOption = {
  id: number;
  full_name?: string;
  nom?: string;
  prenom?: string;
  npi?: string;
  suggestion_reason?: string;
};

function labelOf(p: PatientOption) {
  return p.full_name || `${p.prenom || ""} ${p.nom || ""}`.trim() || `Patient #${p.id}`;
}

type Props = {
  value: string;
  onChange: (patientId: string, patient?: PatientOption | null) => void;
  placeholder?: string;
};

export function PatientSelectSearch({
  value,
  onChange,
  placeholder = "Rechercher un patient…",
}: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PatientOption[]>([]);
  const [selected, setSelected] = useState<PatientOption | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  const selectedLabel = useMemo(() => {
    if (selected && String(selected.id) === value) return labelOf(selected);
    return "";
  }, [selected, value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void load(q);
    }, 220);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const load = async (query: string) => {
    setLoading(true);
    try {
      const list = await api.patientSuggestions({ q: query.trim() || undefined, limit: 20 });
      setItems(Array.isArray(list) ? list : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const pick = (p: PatientOption) => {
    setSelected(p);
    onChange(String(p.id), p);
    setQ("");
    setOpen(false);
  };

  const clear = () => {
    setSelected(null);
    onChange("", null);
    setQ("");
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {value && selectedLabel ? (
        <div className="input" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
              {selectedLabel}
            </div>
            {selected?.npi ? <div className="small muted mono">{selected.npi}</div> : null}
          </div>
          <button type="button" className="btn ghost sm" onClick={clear}>
            Changer
          </button>
        </div>
      ) : (
        <input
          className="input"
          value={q}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            if (!items.length) void load(q);
          }}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
        />
      )}
      {open && !value ? (
        <div
          className="card"
          style={{
            position: "absolute",
            zIndex: 40,
            left: 0,
            right: 0,
            top: "100%",
            marginTop: 4,
            maxHeight: 260,
            overflow: "auto",
            padding: 6,
          }}
        >
          {loading ? <div className="muted small" style={{ padding: 8 }}>Chargement…</div> : null}
          {!loading && items.length === 0 ? (
            <div className="muted small" style={{ padding: 8 }}>Aucun patient.</div>
          ) : null}
          {items.map((p) => (
            <button
              key={p.id}
              type="button"
              className="btn ghost"
              style={{
                width: "100%",
                justifyContent: "flex-start",
                textAlign: "left",
                marginBottom: 2,
                padding: "8px 10px",
              }}
              onClick={() => pick(p)}
            >
              <span>
                <strong>{labelOf(p)}</strong>
                <span className="muted small" style={{ display: "block" }}>
                  {p.npi || `#${p.id}`}
                  {p.suggestion_reason === "recent" ? " · récent" : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

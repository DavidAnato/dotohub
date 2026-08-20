import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, Star, X } from "lucide-react";

type Hospital = { id: number; nom: string; commune?: string; department?: string };

function hospitalLabel(h: Hospital) {
  return h.commune ? `${h.nom} · ${h.commune}` : h.nom;
}

export function HospitalPicker({
  hospitals,
  pickedIds,
  principalId,
  onChangePicked,
  onChangePrincipal,
}: {
  hospitals: Hospital[];
  pickedIds: number[];
  principalId: number | "";
  onChangePicked: (ids: number[]) => void;
  onChangePrincipal: (id: number | "") => void;
  maxHeight?: number;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const query = q.trim().toLowerCase();

  const picked = useMemo(
    () => hospitals.filter((h) => pickedIds.includes(h.id)),
    [hospitals, pickedIds]
  );

  const filtered = useMemo(() => {
    if (!query) return hospitals;
    return hospitals.filter((h) => {
      const hay = `${h.nom} ${h.commune || ""} ${h.department || ""}`.toLowerCase();
      return hay.includes(query);
    });
  }, [hospitals, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open]);

  const applyNext = (next: number[]) => {
    onChangePicked(next);
    if (principalId && !next.includes(Number(principalId))) {
      onChangePrincipal(next[0] || "");
    } else if (!principalId && next.length) {
      onChangePrincipal(next[0]);
    }
  };

  const toggle = (id: number) => {
    applyNext(pickedIds.includes(id) ? pickedIds.filter((x) => x !== id) : [...pickedIds, id]);
  };

  return (
    <div className="hpicker" ref={wrapRef}>
      {picked.length ? (
        <div className="hpicker-chips" role="list" aria-label="Établissements choisis">
          {picked.map((h) => {
            const principal = principalId === h.id;
            return (
              <div
                key={h.id}
                className={"hpicker-chip" + (principal ? " is-principal" : "")}
                role="listitem"
              >
                <button
                  type="button"
                  className="hpicker-chip__star"
                  aria-pressed={principal}
                  aria-label={
                    principal
                      ? `${h.nom}, établissement principal`
                      : `Définir ${h.nom} comme principal`
                  }
                  onClick={() => onChangePrincipal(h.id)}
                >
                  <Star size={15} fill={principal ? "currentColor" : "none"} />
                </button>
                <span title={hospitalLabel(h)}>{h.nom}</span>
                <button
                  type="button"
                  className="hpicker-chip__x"
                  aria-label={`Retirer ${h.nom}`}
                  onClick={() => toggle(h.id)}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {!hospitals.length ? (
        <p className="muted hpicker-empty">Catalogue indisponible. Saisissez le nom ci-dessous.</p>
      ) : (
        <div className="hpicker-combo">
          <button
            type="button"
            className="hpicker-trigger"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls="hpicker-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <Search size={16} aria-hidden />
            <span>{picked.length ? "Ajouter un établissement" : "Choisir un établissement"}</span>
            <ChevronDown size={18} aria-hidden className={open ? "is-open" : undefined} />
          </button>

          {open ? (
            <div className="hpicker-menu" id="hpicker-menu">
              <label className="hpicker-search">
                <span className="sr-only">Rechercher un établissement</span>
                <input
                  ref={searchRef}
                  className="input"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Rechercher…"
                  autoComplete="off"
                />
              </label>
              {!filtered.length ? (
                <p className="muted hpicker-empty hpicker-empty--menu">
                  Aucun établissement pour « {q.trim()} ».
                </p>
              ) : (
                  <div className="hpicker-list" role="listbox" aria-label="Catalogue" aria-multiselectable="true">
                  {filtered.map((h) => {
                    const on = pickedIds.includes(h.id);
                    return (
                      <div key={h.id} className={"hpicker-row" + (on ? " is-on" : "")} role="option" aria-selected={on}>
                        <label className="hpicker-row__pick">
                          <input type="checkbox" checked={on} onChange={() => toggle(h.id)} />
                          <span>
                            {h.nom}
                            {h.commune ? <em> · {h.commune}</em> : null}
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {picked.length ? (
        <p className="muted hpicker-hint">
          L’étoile désigne le principal : lieu proposé par défaut en consultation.
        </p>
      ) : null}
    </div>
  );
}

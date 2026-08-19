import { useMemo, useState } from "react";
import { Search, Star, X } from "lucide-react";

type Hospital = { id: number; nom: string; commune?: string; department?: string };

const PREVIEW = 8;

function hospitalLabel(h: Hospital) {
  return h.commune ? `${h.nom} · ${h.commune}` : h.nom;
}

export function HospitalPicker({
  hospitals,
  pickedIds,
  principalId,
  onChangePicked,
  onChangePrincipal,
  maxHeight = 260,
}: {
  hospitals: Hospital[];
  pickedIds: number[];
  principalId: number | "";
  onChangePicked: (ids: number[]) => void;
  onChangePrincipal: (id: number | "") => void;
  maxHeight?: number;
}) {
  const [q, setQ] = useState("");
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

  const visible = query ? filtered : filtered.slice(0, PREVIEW);
  const hiddenCount = query ? 0 : Math.max(0, filtered.length - visible.length);

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
    <div className="hpicker">
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
                  <Star size={14} fill={principal ? "currentColor" : "none"} />
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
      ) : (
        <p className="muted hpicker-empty">Aucun établissement choisi pour l’instant.</p>
      )}

      <label className="hpicker-search">
        <Search size={16} aria-hidden />
        <span className="sr-only">Rechercher un établissement</span>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher par nom ou ville"
          autoComplete="off"
        />
      </label>

      {!hospitals.length ? (
        <p className="muted hpicker-empty">Catalogue indisponible. Saisissez le nom ci-dessous.</p>
      ) : !visible.length ? (
        <p className="muted hpicker-empty">Aucun établissement pour « {q.trim()} ».</p>
      ) : (
        <div className="hpicker-list" style={{ maxHeight }} role="listbox" aria-label="Catalogue">
          {visible.map((h) => {
            const on = pickedIds.includes(h.id);
            const principal = principalId === h.id;
            return (
              <div key={h.id} className={"hpicker-row" + (on ? " is-on" : "")} role="option" aria-selected={on}>
                <label className="hpicker-row__pick">
                  <input type="checkbox" checked={on} onChange={() => toggle(h.id)} />
                  <span>
                    {h.nom}
                    {h.commune ? <em> · {h.commune}</em> : null}
                  </span>
                </label>
                {on ? (
                  <button
                    type="button"
                    className={"hpicker-star" + (principal ? " on" : "")}
                    aria-pressed={principal}
                    aria-label={
                      principal ? "Établissement principal" : `Définir ${h.nom} comme principal`
                    }
                    onClick={() => onChangePrincipal(h.id)}
                  >
                    <Star size={16} fill={principal ? "currentColor" : "none"} />
                    <span>{principal ? "Principal" : "Principal ?"}</span>
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {hiddenCount ? (
        <p className="muted hpicker-more">
          {hiddenCount} autre{hiddenCount > 1 ? "s" : ""} dans le catalogue. Tapez pour affiner.
        </p>
      ) : null}
      {picked.length ? (
        <p className="muted hpicker-hint">
          L’étoile désigne le principal : lieu proposé par défaut en consultation.
        </p>
      ) : null}
    </div>
  );
}

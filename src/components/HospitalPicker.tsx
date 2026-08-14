type Hospital = { id: number; nom: string; commune?: string; department?: string };

export function HospitalPicker({
  hospitals,
  pickedIds,
  principalId,
  onChangePicked,
  onChangePrincipal,
  maxHeight = 220,
}: {
  hospitals: Hospital[];
  pickedIds: number[];
  principalId: number | "";
  onChangePicked: (ids: number[]) => void;
  onChangePrincipal: (id: number | "") => void;
  maxHeight?: number;
}) {
  return (
    <>
      <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        Cochez vos structures, puis désignez le principal (pré-sélectionné en consultation).
      </p>
      <div style={{ maxHeight, overflow: "auto" }}>
        {hospitals.map((h) => (
          <label key={h.id} className="row" style={{ gap: 8, padding: "4px 0" }}>
            <input
              type="checkbox"
              checked={pickedIds.includes(h.id)}
              onChange={() => {
                const next = pickedIds.includes(h.id)
                  ? pickedIds.filter((x) => x !== h.id)
                  : [...pickedIds, h.id];
                onChangePicked(next);
                if (principalId && !next.includes(Number(principalId))) {
                  onChangePrincipal(next[0] || "");
                } else if (!principalId && next.length === 1) {
                  onChangePrincipal(next[0]);
                }
              }}
            />
            <span className="small">
              {h.nom}
              {h.commune ? ` · ${h.commune}` : ""}
            </span>
          </label>
        ))}
      </div>
      <label className="label" style={{ marginTop: 10 }}>
        Principal
      </label>
      <select
        className="select"
        value={principalId}
        onChange={(e) => onChangePrincipal(e.target.value ? Number(e.target.value) : "")}
      >
        <option value="">—</option>
        {hospitals
          .filter((h) => pickedIds.includes(h.id))
          .map((h) => (
            <option key={h.id} value={h.id}>
              {h.nom}
            </option>
          ))}
      </select>
    </>
  );
}

/** Règles RDV partagées (validation date + détection de chevauchement). */

export const APPOINTMENT_SLOT_MINUTES = 30;

export function datetimeLocalMin(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function isPastDateTime(value: Date | string): boolean {
  const t = typeof value === "string" ? new Date(value).getTime() : value.getTime();
  return Number.isNaN(t) || t < Date.now() - 60_000;
}

export function findAppointmentConflict(
  appointments: any[],
  debut: Date | string,
  professionnelId?: number | string | null,
  excludeId?: number
): any | null {
  if (!professionnelId) return null;
  const profId = Number(professionnelId);
  if (!profId) return null;

  const start = new Date(debut).getTime();
  if (Number.isNaN(start)) return null;
  const slotMs = APPOINTMENT_SLOT_MINUTES * 60_000;
  const end = start + slotMs;
  const inactive = new Set(["annule", "termine", "absent"]);

  for (const a of appointments) {
    if (excludeId && a.id === excludeId) continue;
    if (inactive.has(a.statut)) continue;
    const aProf = a.professionnel ?? a.professionnel_id;
    if (!aProf || Number(aProf) !== profId) continue;
    const aStart = new Date(a.debut).getTime();
    if (Number.isNaN(aStart)) continue;
    const aEnd = a.fin ? new Date(a.fin).getTime() : aStart + slotMs;
    if (start < aEnd && end > aStart) return a;
  }
  return null;
}

export function formatConflictLabel(appt: any): string {
  const when = appt.debut
    ? new Date(appt.debut).toLocaleString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const who = appt.patient_name || "un patient";
  const motif = appt.motif ? ` (${appt.motif})` : "";
  return `${when} avec ${who}${motif}`;
}

/** Cloche notifications in-app (liste + unread). */
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useAppStore } from "../store/appStore";

export function NotificationBell() {
  const unread = useAppStore((s) => s.unread);
  const setUnread = useAppStore((s) => s.setUnread);
  const setToast = useAppStore((s) => s.setToast);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const r = await api.notifications();
      return (r.results || r) as any[];
    },
    refetchInterval: open ? 8000 : 30000,
  });

  useEffect(() => {
    api.unreadCount()
      .then((r) => setUnread(r.unread ?? 0))
      .catch(() => {});
  }, [setUnread, data]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const list = data || [];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="btn ghost sm icon-btn"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        style={{ position: "relative" }}
      >
        <Bell size={16} />
        {unread > 0 ? (
          <span
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: "var(--emergency)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className="card"
          style={{
            position: "absolute",
            right: 0,
            top: "110%",
            width: 320,
            maxHeight: 360,
            overflow: "auto",
            zIndex: 40,
            padding: 0,
            boxShadow: "0 12px 32px rgba(30,55,85,0.18)",
          }}
        >
          <div
            className="row"
            style={{
              justifyContent: "space-between",
              padding: "10px 12px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <strong style={{ fontSize: 13 }}>Notifications</strong>
            <button
              type="button"
              className="btn ghost sm"
              style={{ fontSize: 11 }}
              onClick={async () => {
                await api.markAllNotifsRead();
                setUnread(0);
                qc.invalidateQueries({ queryKey: ["notifications"] });
              }}
            >
              Tout lu
            </button>
          </div>
          {!list.length ? (
            <div className="muted small" style={{ padding: 16, textAlign: "center" }}>
              Aucune notification
            </div>
          ) : (
            list.slice(0, 20).map((n: any) => (
              <button
                key={n.id}
                type="button"
                onClick={async () => {
                  if (!n.read_at) {
                    await api.markNotifRead(n.id);
                    setUnread(Math.max(0, unread - 1));
                    qc.invalidateQueries({ queryKey: ["notifications"] });
                  }
                  setToast(n.title);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  background: n.read_at ? "transparent" : "rgba(62,130,149,0.08)",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--heading)" }}>{n.title}</div>
                <div className="muted small" style={{ marginTop: 2 }}>
                  {n.body}
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}


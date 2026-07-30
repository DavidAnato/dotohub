/** SSE + helpers — online/theme vivent désormais dans le store Zustand. */
import { useEffect, useRef, useState } from "react";
import { api } from "./api";

export type HubSseEvent = {
  type: string;
  patient_id?: number;
  npi?: string;
  full_name?: string;
  access_request_id?: number;
  emergency?: boolean;
  consent_required?: boolean;
  notification_id?: number;
  title?: string;
  body?: string;
  message?: string;
  close_dossier?: boolean;
  notif_type?: string;
  payload?: {
    patient_id?: number;
    section?: string;
    kind?: string;
    revoked?: boolean;
    close_dossier?: boolean;
    message?: string;
    [key: string]: unknown;
  };
  ts?: string;
};

/**
 * Connexion SSE DotoHub — JWT via query `?access=` (EventSource ne gère pas Authorization).
 * Canal ciblé par user_id côté backend : seul le même compte pro reçoit les events.
 */
export function useHubSSE(
  enabled: boolean,
  onEvent: (ev: HubSseEvent) => void
) {
  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "error">("idle");
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  // Relancer si le JWT change (refresh) tout en gardant la connexion stable entre pages.
  const accessToken = enabled ? api.tokens.access : null;

  useEffect(() => {
    if (!enabled || !accessToken) {
      setStatus("idle");
      return;
    }

    let es: EventSource | null = null;
    let closed = false;
    let retryTimer: number | undefined;

    const connect = () => {
      if (closed) return;
      setStatus("connecting");
      const url = api.hubEventsUrl();
      es = new EventSource(url);

      es.onopen = () => setStatus("open");
      es.onerror = () => {
        setStatus("error");
        es?.close();
        es = null;
        if (!closed) {
          retryTimer = window.setTimeout(connect, 4000);
        }
      };
      es.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data) as HubSseEvent;
          onEventRef.current(data);
        } catch {
          /* ignore malformed */
        }
      };
    };

    connect();

    return () => {
      closed = true;
      window.clearTimeout(retryTimer);
      es?.close();
    };
  }, [enabled, accessToken]);

  return { status };
}

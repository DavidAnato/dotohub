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
  notification_id?: number;
  title?: string;
  body?: string;
  notif_type?: string;
  ts?: string;
};

/**
 * Connexion SSE DotoHub — JWT via query `?access=` (EventSource ne gère pas Authorization).
 */
export function useHubSSE(
  enabled: boolean,
  onEvent: (ev: HubSseEvent) => void
) {
  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "error">("idle");
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !api.tokens.access) {
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
        retryTimer = window.setTimeout(connect, 4000);
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
  }, [enabled]);

  return { status };
}

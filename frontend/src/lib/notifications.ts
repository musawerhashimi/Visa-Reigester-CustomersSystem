import { tokenStore } from "./api";
import type { Notification } from "@/types/domain";

/**
 * Live notification socket.
 *
 * Reconnects with exponential backoff, because a dropped socket in the MIS
 * means staff silently stop hearing about new applications. The REST
 * notification list remains the source of truth; this only makes it immediate.
 */

type Listener = (notification: Notification) => void;

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;
const HEARTBEAT_MS = 25_000;

class NotificationSocket {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private attempt = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private closedByUs = false;

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  connect() {
    const token = tokenStore.access;
    if (!token || this.socket) return;

    this.closedByUs = false;

    const base = import.meta.env.VITE_WS_BASE_URL ?? defaultWsBase();
    const socket = new WebSocket(
      `${base}/ws/notifications/?token=${encodeURIComponent(token)}`,
    );
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.heartbeatTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "ping" }));
        }
      }, HEARTBEAT_MS);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          type: string;
          notification?: Notification;
        };
        if (data.type === "notification" && data.notification) {
          for (const listener of this.listeners) listener(data.notification);
        }
      } catch {
        // A malformed frame is not worth tearing the connection down for.
      }
    };

    socket.onclose = (event) => {
      this.cleanup();
      // 4401 means the token was rejected; retrying with the same token would
      // just loop, so wait for the next explicit connect() after a refresh.
      if (!this.closedByUs && event.code !== 4401) this.scheduleReconnect();
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  disconnect() {
    this.closedByUs = true;
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.cleanup();
  }

  private cleanup() {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
    this.socket = null;
  }

  private scheduleReconnect() {
    const delay = Math.min(BASE_BACKOFF_MS * 2 ** this.attempt, MAX_BACKOFF_MS);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}

function defaultWsBase() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  // In development Vite serves the app; the API lives on the Django port.
  const host = import.meta.env.DEV ? "localhost:8000" : window.location.host;
  return `${protocol}//${host}`;
}

export const notificationSocket = new NotificationSocket();

/**
 * Short alert tone for new applications, synthesised rather than shipped as
 * an audio file so there is no asset to load before the first alert.
 */
export function playAlertTone() {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const context = new AudioCtx();
    const gain = context.createGain();
    gain.connect(context.destination);

    // Two short rising notes: audible across a room, not alarming.
    [880, 1174].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);

      const start = context.currentTime + index * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);

      oscillator.start(start);
      oscillator.stop(start + 0.16);
    });

    setTimeout(() => void context.close(), 800);
  } catch {
    // Autoplay policy may block audio until the user interacts with the page;
    // the visual notification still lands.
  }
}

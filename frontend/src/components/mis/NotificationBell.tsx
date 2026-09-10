import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Bell, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { notificationSocket, playAlertTone } from "@/lib/notifications";
import type { Notification, Paginated } from "@/types/domain";

export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Notification>>("/notifications/", {
        params: { page_size: 15 },
      });
      return data;
    },
  });

  const notifications = data?.results ?? [];
  const unreadCount = notifications.filter((item) => !item.is_read).length;

  // Live updates. A pushed notification refreshes the list rather than being
  // spliced in, so the badge count stays consistent with the server.
  useEffect(() => {
    notificationSocket.connect();
    const unsubscribe = notificationSocket.subscribe((notification) => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (notification.play_sound) playAlertTone();
    });
    return () => {
      unsubscribe();
      notificationSocket.disconnect();
    };
  }, [queryClient]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const markAllRead = useMutation({
    mutationFn: () => api.post("/notifications/read-all/"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markRead = useMutation({
    mutationFn: (id: number) => api.post(`/notifications/${id}/read/`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        className="relative rounded-lg p-2 text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
      >
        <Bell className="size-5" aria-hidden />
        {unreadCount > 0 && (
          <span className="tabular absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lifted">
          <header className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                <Check className="size-3.5" aria-hidden />
                Mark all read
              </button>
            )}
          </header>

          <ul className="scroll-slim max-h-96 divide-y divide-ink-100 overflow-y-auto">
            {notifications.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-ink-500">
                Nothing yet.
              </li>
            )}

            {notifications.map((notification) => {
              const body = (
                <>
                  <div className="flex items-start gap-2">
                    {!notification.is_read && (
                      <span
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500"
                        aria-hidden
                      />
                    )}
                    <div className={cn("min-w-0", notification.is_read && "pl-4")}>
                      <p className="truncate text-sm font-medium text-ink-900">
                        {notification.title}
                      </p>
                      {notification.message && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">
                          {notification.message}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-ink-400">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>
                </>
              );

              return (
                <li key={notification.id}>
                  {notification.link ? (
                    <Link
                      to={notification.link}
                      onClick={() => {
                        if (!notification.is_read) markRead.mutate(notification.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "block px-4 py-3 transition-colors hover:bg-ink-50",
                        !notification.is_read && "bg-brand-50/40",
                      )}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div
                      className={cn(
                        "px-4 py-3",
                        !notification.is_read && "bg-brand-50/40",
                      )}
                    >
                      {body}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

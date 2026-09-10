import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Bell, Check } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { notificationSocket } from "@/lib/notifications";
import type { Notification, Paginated } from "@/types/domain";

export default function PortalNotifications() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["portal", "notifications"],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Notification>>("/notifications/", {
        params: { page_size: 50 },
      });
      return data.results;
    },
  });

  // Customers get live updates too: a document rejection should appear while
  // they are looking at the page, not on the next refresh.
  useEffect(() => {
    notificationSocket.connect();
    const unsubscribe = notificationSocket.subscribe(() => {
      void queryClient.invalidateQueries({ queryKey: ["portal", "notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["portal", "unread-count"] });
    });
    return () => {
      unsubscribe();
      notificationSocket.disconnect();
    };
  }, [queryClient]);

  const markAllRead = useMutation({
    mutationFn: () => api.post("/notifications/read-all/"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["portal", "notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["portal", "unread-count"] });
    },
  });

  const rows = data ?? [];
  const unreadCount = rows.filter((row) => !row.is_read).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold">
          {t("portal.notifications")}
        </h1>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            <Check className="size-4" aria-hidden />
            Mark all read
          </button>
        )}
      </header>

      <div className="card overflow-hidden">
        {isLoading && (
          <p className="px-5 py-16 text-center text-sm text-ink-500">
            {t("common.loading")}
          </p>
        )}

        {!isLoading && rows.length === 0 && (
          <div className="px-5 py-16 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-xl bg-ink-100 text-ink-400">
              <Bell className="size-6" aria-hidden />
            </span>
            <p className="mt-4 text-sm text-ink-500">{t("common.noResults")}</p>
          </div>
        )}

        <ul className="divide-y divide-ink-100">
          {rows.map((notification) => {
            const content = (
              <div className="flex items-start gap-3">
                {!notification.is_read && (
                  <span
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500"
                    aria-hidden
                  />
                )}
                <div className={cn("min-w-0 flex-1", notification.is_read && "pl-5")}>
                  <p className="text-sm font-medium text-ink-900">
                    {notification.title}
                  </p>
                  {notification.message && (
                    <p className="mt-0.5 text-sm text-ink-600">
                      {notification.message}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-ink-400">
                    {notification.reference_number &&
                      `${notification.reference_number} · `}
                    {formatDistanceToNow(new Date(notification.created_at), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
            );

            return (
              <li key={notification.id}>
                {notification.link ? (
                  <Link
                    to={notification.link}
                    className={cn(
                      "block px-5 py-4 transition-colors hover:bg-ink-50",
                      !notification.is_read && "bg-brand-50/40",
                    )}
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    className={cn(
                      "px-5 py-4",
                      !notification.is_read && "bg-brand-50/40",
                    )}
                  >
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

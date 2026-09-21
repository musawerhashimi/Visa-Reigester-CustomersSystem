import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Mail, Phone, Search, UserX, Users } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import type { Paginated } from "@/types/domain";

interface Customer {
  id: number;
  customer_code: string;
  full_name: string;
  email: string;
  phone: string;
  nationality: string;
  city: string;
  country: string;
  status: "active" | "inactive" | "archived";
  application_count: number;
  /**
   * The offices handling this customer, via the applications they made.
   * Optional: a response from a backend predating this field omits it, and
   * a missing branch must not blank the whole directory.
   */
  branches?: { id: number; name: string; code: string }[];
  created_at: string;
}

export default function Customers() {
  const queryClient = useQueryClient();
  const hasPermission = useAuth((state) => state.hasPermission);
  const canEdit = hasPermission("customers.edit");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["mis", "customers", { search, status, page }],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Customer>>("/customers/", {
        params: { search: search || undefined, status: status || undefined, page },
      });
      return data;
    },
    placeholderData: keepPreviousData,
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api.post(`/customers/${id}/${active ? "reactivate" : "deactivate"}/`),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["mis", "customers"] });
    },
    onError: (err) =>
      setError(apiErrorMessage(err, "Could not change the customer's status.")),
  });

  const rows = data?.results ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold">Customers</h1>
        <p className="mt-1 text-sm text-ink-500">
          {data?.count ?? 0} {data?.count === 1 ? "customer" : "customers"}
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-56 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by name, code, email or phone…"
              aria-label="Search customers"
              className="w-full rounded-lg border border-ink-300 py-2.5 pl-10 pr-3 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
            className="rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="scroll-slim overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Customer</th>
                <th scope="col" className="px-4 py-3 font-medium">Contact</th>
                <th scope="col" className="px-4 py-3 font-medium">Country</th>
                <th scope="col" className="px-4 py-3 font-medium">Branch</th>
                <th scope="col" className="px-4 py-3 font-medium">Applications</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Registered</th>
                {canEdit && <th scope="col" className="px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>

            <tbody className="divide-y divide-ink-100">
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-ink-500">
                    Loading…
                  </td>
                </tr>
              )}

              {isError && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-danger">
                    Could not load customers.
                  </td>
                </tr>
              )}

              {!isLoading && !isError && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <span className="mx-auto grid size-11 place-items-center rounded-xl bg-ink-100 text-ink-400">
                      <Users className="size-5" aria-hidden />
                    </span>
                    <p className="mt-3 text-sm text-ink-500">
                      No customers match these filters.
                    </p>
                  </td>
                </tr>
              )}

              {rows.map((customer) => (
                <tr key={customer.id} className="transition-colors hover:bg-ink-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink-900">{customer.full_name}</p>
                    <p className="tabular mt-0.5 text-xs text-ink-400">
                      {customer.customer_code}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    <a
                      href={`mailto:${customer.email}`}
                      className="inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-700"
                    >
                      <Mail className="size-3.5" aria-hidden />
                      {customer.email}
                    </a>
                    {customer.phone && (
                      <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-ink-500">
                        <Phone className="size-3" aria-hidden />
                        {customer.phone}
                      </p>
                    )}
                  </td>

                  <td className="px-4 py-3 text-ink-600">
                    {customer.country || <span className="text-ink-300">—</span>}
                  </td>

                  <td className="px-4 py-3">
                    {/* A customer reaches a branch by applying there, and may
                        have applied at more than one, so every office that
                        handles them is listed. */}
                    {customer.branches && customer.branches.length > 0 ? (
                      <span className="text-ink-700">
                        {customer.branches.map((branch) => branch.name).join(", ")}
                      </span>
                    ) : (
                      <span className="text-ink-300" title="No applications yet">
                        —
                      </span>
                    )}
                  </td>

                  <td className="tabular px-4 py-3 text-ink-700">
                    {customer.application_count}
                  </td>

                  <td className="px-4 py-3">
                    <Badge
                      dot
                      tone={customer.status === "active" ? "success" : "neutral"}
                      label={customer.status}
                    />
                  </td>

                  <td className="tabular px-4 py-3 text-ink-600">
                    {format(new Date(customer.created_at), "d MMM yyyy")}
                  </td>

                  {canEdit && (
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant={customer.status === "active" ? "ghost" : "outline"}
                        icon={<UserX className="size-3.5" />}
                        loading={
                          toggleActive.isPending &&
                          toggleActive.variables?.id === customer.id
                        }
                        onClick={() =>
                          toggleActive.mutate({
                            id: customer.id,
                            active: customer.status !== "active",
                          })
                        }
                      >
                        {customer.status === "active" ? "Deactivate" : "Reactivate"}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(data?.next || data?.previous) && (
          <div className="flex items-center justify-between border-t border-ink-200 px-4 py-3">
            <p className="text-xs text-ink-500">Page {page}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={!data?.previous}
                className="rounded-lg border border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((value) => value + 1)}
                disabled={!data?.next}
                className="rounded-lg border border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

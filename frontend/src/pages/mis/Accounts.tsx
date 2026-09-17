import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, KeyRound, Pencil, Plus, Search, ShieldCheck, UserPlus, Users } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { api, apiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/stores/auth";
import type { Branch, BranchBrief, Paginated, UserRole } from "@/types/domain";

interface Account {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  role: UserRole;
  role_label: string;
  branch: BranchBrief | null;
  is_active: boolean;
  email_verified: boolean;
  extra_permissions: string[];
  denied_permissions: string[];
  effective_permissions: string[];
  role_defaults: string[];
  assigned_count: number;
  last_login_at: string | null;
  created_at: string;
}

interface PermissionCatalogue {
  groups: { name: string; permissions: string[] }[];
  roles: { value: UserRole; label: string; defaults: string[] }[];
}

/** Staff roles. Customers are created by signing up, not here. */
const STAFF_ROLES: { value: UserRole; label: string }[] = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin / Manager" },
  { value: "visa_officer", label: "Visa Officer" },
  { value: "cms_manager", label: "CMS Manager" },
];

const ROLE_TONES: Record<string, "brand" | "info" | "success" | "neutral"> = {
  super_admin: "brand",
  admin: "info",
  visa_officer: "success",
  cms_manager: "neutral",
  customer: "neutral",
};

export default function Accounts() {
  const queryClient = useQueryClient();
  const user = useAuth((state) => state.user);
  const hasPermission = useAuth((state) => state.hasPermission);
  const canCreate = hasPermission("users.create");
  const canEdit = hasPermission("users.edit");

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Account | null>(null);
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["mis", "accounts", { search, role, page }],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Account>>("/accounts/", {
        params: { search: search || undefined, role: role || undefined, page },
      });
      return data;
    },
    placeholderData: keepPreviousData,
  });

  const catalogue = useQuery({
    queryKey: ["mis", "permission-catalogue"],
    queryFn: async () => {
      const { data } = await api.get<PermissionCatalogue>("/accounts/permissions/");
      return data;
    },
  });

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["mis", "accounts"] });

  const toggleActive = useMutation({
    mutationFn: (account: Account) =>
      account.is_active
        ? api.delete(`/accounts/${account.id}/`)
        : api.post(`/accounts/${account.id}/activate/`),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err) =>
      setError(apiErrorMessage(err, "Could not change the account.")),
  });

  const resetPassword = useMutation({
    mutationFn: (account: Account) =>
      api.post<{ password: string }>(`/accounts/${account.id}/set-password/`, {}),
    onSuccess: (response, account) => {
      setError(null);
      setIssued({ email: account.email, password: response.data.password });
    },
    onError: (err) =>
      setError(apiErrorMessage(err, "Could not reset the password.")),
  });

  const rows = data?.results ?? [];

  if (creating || editing) {
    return (
      <AccountForm
        account={editing}
        catalogue={catalogue.data}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={(password, email) => {
          setCreating(false);
          setEditing(null);
          if (password) setIssued({ email, password });
          refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Users &amp; accounts</h1>
          <p className="mt-1 text-sm text-ink-500">
            {data?.count ?? 0} {data?.count === 1 ? "account" : "accounts"} · roles
            and permissions
          </p>
        </div>
        {canCreate && (
          <Button icon={<UserPlus className="size-4" />} onClick={() => setCreating(true)}>
            New staff account
          </Button>
        )}
      </header>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {issued && (
        <div className="card border-l-4 border-l-accent-500 p-5">
          <h2 className="text-sm font-semibold">Password for {issued.email}</h2>
          <p className="mt-1 text-xs text-ink-500">
            Shown once. Copy it now and hand it over — it cannot be retrieved
            again.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <code className="tabular rounded-lg bg-ink-100 px-3 py-2 text-sm font-medium text-ink-900">
              {issued.password}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(issued.password);
              }}
            >
              Copy
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIssued(null)}>
              Done
            </Button>
          </div>
        </div>
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
              placeholder="Search by name, email or phone…"
              aria-label="Search accounts"
              className="w-full rounded-lg border border-ink-300 py-2.5 pl-10 pr-3 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          <select
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setPage(1);
            }}
            aria-label="Filter by role"
            className="rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="">All roles</option>
            {STAFF_ROLES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
            <option value="customer">Customer</option>
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="scroll-slim overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Name</th>
                <th scope="col" className="px-4 py-3 font-medium">Role</th>
                <th scope="col" className="px-4 py-3 font-medium">Assigned</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Last signed in</th>
                {canEdit && <th scope="col" className="px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>

            <tbody className="divide-y divide-ink-100">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-ink-500">
                    Loading…
                  </td>
                </tr>
              )}

              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <span className="mx-auto grid size-11 place-items-center rounded-xl bg-ink-100 text-ink-400">
                      <Users className="size-5" aria-hidden />
                    </span>
                    <p className="mt-3 text-sm text-ink-500">
                      No accounts match these filters.
                    </p>
                  </td>
                </tr>
              )}

              {rows.map((account) => {
                const isSelf = account.id === user?.id;
                const custom =
                  account.extra_permissions.length > 0 ||
                  account.denied_permissions.length > 0;

                return (
                  <tr key={account.id} className="transition-colors hover:bg-ink-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-900">
                        {account.full_name || account.email}
                        {isSelf && (
                          <span className="ml-2 text-xs font-normal text-ink-400">
                            you
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">{account.email}</p>
                    </td>

                    <td className="px-4 py-3">
                      <Badge
                        tone={ROLE_TONES[account.role] ?? "neutral"}
                        label={account.role_label}
                      />
                      {custom && (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs text-ink-400">
                          <ShieldCheck className="size-3" aria-hidden />
                          customised
                        </p>
                      )}
                    </td>

                    <td className="tabular px-4 py-3 text-ink-700">
                      {account.role === "customer" ? "—" : account.assigned_count}
                    </td>

                    <td className="px-4 py-3">
                      <Badge
                        dot
                        tone={account.is_active ? "success" : "neutral"}
                        label={account.is_active ? "Active" : "Inactive"}
                      />
                    </td>

                    <td className="tabular px-4 py-3 text-ink-600">
                      {account.last_login_at
                        ? format(new Date(account.last_login_at), "d MMM yyyy")
                        : "Never"}
                    </td>

                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {account.role !== "customer" && (
                            <Button
                              size="sm"
                              variant="outline"
                              icon={<Pencil className="size-3.5" />}
                              onClick={() => setEditing(account)}
                            >
                              Edit
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<KeyRound className="size-3.5" />}
                            loading={
                              resetPassword.isPending &&
                              resetPassword.variables?.id === account.id
                            }
                            onClick={() => resetPassword.mutate(account)}
                          >
                            Password
                          </Button>
                          {!isSelf && (
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={
                                toggleActive.isPending &&
                                toggleActive.variables?.id === account.id
                              }
                              onClick={() => toggleActive.mutate(account)}
                            >
                              {account.is_active ? "Deactivate" : "Activate"}
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
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

function AccountForm({
  account,
  catalogue,
  onClose,
  onSaved,
}: {
  account: Account | null;
  catalogue?: PermissionCatalogue;
  onClose: () => void;
  onSaved: (password: string | null, email: string) => void;
}) {
  const isNew = account === null;
  const [form, setForm] = useState({
    email: account?.email ?? "",
    first_name: account?.first_name ?? "",
    last_name: account?.last_name ?? "",
    phone: account?.phone ?? "",
    role: (account?.role ?? "visa_officer") as UserRole,
    branch_id: account?.branch?.id ?? null,
    extra_permissions: account?.extra_permissions ?? [],
    denied_permissions: account?.denied_permissions ?? [],
  });
  const [error, setError] = useState<string | null>(null);

  const { data: branches } = useQuery({
    queryKey: ["mis", "branches"],
    queryFn: async () => {
      const { data } = await api.get<Branch[]>("/branches/");
      return data;
    },
  });

  const defaults =
    catalogue?.roles.find((item) => item.value === form.role)?.defaults ?? [];

  const save = useMutation({
    mutationFn: async () => {
      if (isNew) {
        const { data } = await api.post<Account & { initial_password?: string }>(
          "/accounts/",
          form,
        );
        return data;
      }
      const { data } = await api.patch<Account>(`/accounts/${account.id}/`, {
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone,
        role: form.role,
        branch_id: form.branch_id,
        extra_permissions: form.extra_permissions,
        denied_permissions: form.denied_permissions,
      });
      return data;
    },
    onSuccess: (data) => {
      onSaved(
        (data as Account & { initial_password?: string }).initial_password ?? null,
        data.email,
      );
    },
    onError: (err) => setError(apiErrorMessage(err, "Could not save the account.")),
  });

  /**
   * A permission is either inherited from the role, added on top, or taken
   * away. Clicking cycles through those three states.
   */
  function cyclePermission(slug: string) {
    const isDefault = defaults.includes(slug);
    const added = form.extra_permissions.includes(slug);
    const denied = form.denied_permissions.includes(slug);

    setForm((previous) => {
      const extra = previous.extra_permissions.filter((item) => item !== slug);
      const denies = previous.denied_permissions.filter((item) => item !== slug);

      if (isDefault) {
        // Inherited → denied → inherited.
        return denied
          ? { ...previous, extra_permissions: extra, denied_permissions: denies }
          : { ...previous, extra_permissions: extra, denied_permissions: [...denies, slug] };
      }
      // Not granted → added → not granted.
      return added
        ? { ...previous, extra_permissions: extra, denied_permissions: denies }
        : { ...previous, extra_permissions: [...extra, slug], denied_permissions: denies };
    });
  }

  function stateOf(slug: string) {
    if (form.denied_permissions.includes(slug)) return "denied" as const;
    if (form.extra_permissions.includes(slug)) return "added" as const;
    if (defaults.includes(slug)) return "inherited" as const;
    return "none" as const;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <button
        type="button"
        onClick={onClose}
        className="text-sm font-medium text-ink-500 transition-colors hover:text-ink-800"
      >
        ← Users &amp; accounts
      </button>

      <h1 className="font-display text-2xl font-bold">
        {isNew ? "New staff account" : account.full_name || account.email}
      </h1>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <form
        className="card space-y-5 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        {isNew && (
          <Field
            label="Email"
            type="email"
            required
            hint="This is also their sign-in name."
            value={form.email}
            onChange={(event) => setForm((f) => ({ ...f, email: event.target.value }))}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="First name"
            value={form.first_name}
            onChange={(event) =>
              setForm((f) => ({ ...f, first_name: event.target.value }))
            }
          />
          <Field
            label="Last name"
            value={form.last_name}
            onChange={(event) =>
              setForm((f) => ({ ...f, last_name: event.target.value }))
            }
          />
        </div>

        <Field
          label="Phone"
          value={form.phone}
          onChange={(event) => setForm((f) => ({ ...f, phone: event.target.value }))}
        />

        <div className="space-y-1.5">
          <label htmlFor="account-role" className="block text-sm font-medium text-ink-700">
            Role
          </label>
          <select
            id="account-role"
            value={form.role}
            onChange={(event) =>
              setForm((f) => ({
                ...f,
                role: event.target.value as UserRole,
                // Customisations belong to the previous role's baseline.
                extra_permissions: [],
                denied_permissions: [],
              }))
            }
            className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            {STAFF_ROLES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-ink-500">
            The role sets the baseline. Adjust individual permissions below if
            this person needs more or less.
          </p>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="account-branch"
            className="block text-sm font-medium text-ink-700"
          >
            Branch
          </label>
          <select
            id="account-branch"
            value={form.branch_id ?? ""}
            onChange={(event) =>
              setForm((f) => ({
                ...f,
                branch_id: event.target.value ? Number(event.target.value) : null,
              }))
            }
            className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            {branches?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-ink-500">
            Staff in the general branch see every branch's work. Everyone else
            sees only their own.
          </p>
        </div>

        {catalogue && (
          <fieldset className="rounded-lg border border-ink-200 p-4">
            <legend className="px-1 text-xs font-medium uppercase tracking-wide text-ink-500">
              Permissions
            </legend>

            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-brand-500" aria-hidden />
                From role
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-success" aria-hidden />
                Added
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-danger" aria-hidden />
                Removed
              </span>
            </p>

            <div className="mt-4 space-y-4">
              {catalogue.groups.map((group) => (
                <div key={group.name}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-600">
                    {group.name}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {group.permissions.map((slug) => {
                      const state = stateOf(slug);
                      return (
                        <button
                          key={slug}
                          type="button"
                          onClick={() => cyclePermission(slug)}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                            state === "inherited" &&
                              "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200",
                            state === "added" &&
                              "bg-success-soft text-success ring-1 ring-inset ring-success/25",
                            state === "denied" &&
                              "bg-danger-soft text-danger line-through ring-1 ring-inset ring-danger/25",
                            state === "none" &&
                              "bg-white text-ink-500 ring-1 ring-inset ring-ink-200 hover:bg-ink-50",
                          )}
                        >
                          {slug.split(".").slice(1).join(".") || slug}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
        )}

        <div className="flex items-center gap-3 border-t border-ink-200 pt-5">
          <Button
            type="submit"
            icon={isNew ? <Plus className="size-4" /> : <Check className="size-4" />}
            loading={save.isPending}
          >
            {isNew ? "Create account" : "Save changes"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {isNew && (
            <p className="ml-auto text-xs text-ink-500">
              A password is generated and shown once.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}

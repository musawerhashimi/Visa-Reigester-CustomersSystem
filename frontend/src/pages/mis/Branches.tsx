import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { api, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import type { Branch } from "@/types/domain";

type Draft = {
  name: string;
  code: string;
  city: string;
  country: string;
  address: string;
  phone: string;
  email: string;
  is_active: boolean;
};

const EMPTY: Draft = {
  name: "",
  code: "",
  city: "",
  country: "",
  address: "",
  phone: "",
  email: "",
  is_active: true,
};

/**
 * The offices the company runs.
 *
 * Only the general branch reaches this page with write access: a branch
 * defining its own peers would undo the partition it sits behind.
 */
export default function Branches() {
  const queryClient = useQueryClient();
  const seesAllBranches = useAuth((state) => state.user?.sees_all_branches ?? false);
  const hasPermission = useAuth((state) => state.hasPermission);
  const canManage = hasPermission("branches.manage") && seesAllBranches;

  const [editing, setEditing] = useState<Branch | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["mis", "branches"],
    queryFn: async () => {
      const { data } = await api.get<Branch[]>("/branches/");
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: async (branch: Branch) => {
      await api.delete(`/branches/${branch.id}/`);
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["mis", "branches"] });
    },
    onError: (err) =>
      setError(apiErrorMessage(err, "Could not delete the branch.")),
  });

  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">Branches</h1>
          <p className="mt-1 text-sm text-ink-500">
            {rows.length} {rows.length === 1 ? "office" : "offices"}
          </p>
        </div>
        {canManage && (
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            New branch
          </Button>
        )}
      </header>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="card overflow-hidden">
        <div className="scroll-slim overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Branch</th>
                <th scope="col" className="px-4 py-3 font-medium">Location</th>
                <th scope="col" className="px-4 py-3 font-medium">Applications</th>
                <th scope="col" className="px-4 py-3 font-medium">Staff</th>
                <th scope="col" className="px-4 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-ink-100">
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-ink-500">
                    Loading…
                  </td>
                </tr>
              )}

              {isError && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-danger">
                    Could not load branches.
                  </td>
                </tr>
              )}

              {rows.map((branch) => (
                <tr key={branch.id} className="transition-colors hover:bg-ink-50">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => canManage && setEditing(branch)}
                      disabled={!canManage}
                      className="text-left font-medium text-brand-700 hover:text-brand-800 disabled:cursor-default disabled:text-ink-800"
                    >
                      {branch.name}
                    </button>
                    <span className="ml-2 text-xs text-ink-400">{branch.code}</span>
                    {branch.is_general && (
                      <span className="ml-2">
                        <Badge tone="info" label="General" dot />
                      </span>
                    )}
                    {!branch.is_active && (
                      <span className="ml-2">
                        <Badge tone="neutral" label="Inactive" dot />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-600">
                    {[branch.city, branch.country].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="tabular px-4 py-3 text-ink-600">
                    {branch.application_count}
                  </td>
                  <td className="tabular px-4 py-3 text-ink-600">
                    {branch.staff_count}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/* The general branch anchors the partition, so it has no
                        delete control at all rather than one that errors. */}
                    {canManage && !branch.is_general && (
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete ${branch.name}? This cannot be undone.`,
                            )
                          ) {
                            remove.mutate(branch);
                          }
                        }}
                        aria-label={`Delete ${branch.name}`}
                        className="rounded-lg p-2 text-ink-400 transition-colors hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {!isLoading && !isError && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-ink-500">
                    <Building2 className="mx-auto size-6 text-ink-300" aria-hidden />
                    <p className="mt-2">No branches yet.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(creating || editing) && (
        <BranchDialog
          branch={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ["mis", "branches"] });
          }}
        />
      )}
    </div>
  );
}

function BranchDialog({
  branch,
  onClose,
  onSaved,
}: {
  branch: Branch | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = branch === null;
  const [form, setForm] = useState<Draft>(
    branch
      ? {
          name: branch.name,
          code: branch.code,
          city: branch.city,
          country: branch.country,
          address: branch.address,
          phone: branch.phone,
          email: branch.email,
          is_active: branch.is_active,
        }
      : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (isNew) {
        const { data } = await api.post<Branch>("/branches/", form);
        return data;
      }
      const { data } = await api.patch<Branch>(`/branches/${branch.id}/`, form);
      return data;
    },
    onSuccess: onSaved,
    onError: (err) => setError(apiErrorMessage(err, "Could not save the branch.")),
  });

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 p-4">
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-lg font-bold">
            {isNew ? "New branch" : form.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger"
          >
            {error}
          </p>
        )}

        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Name"
              required
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
            />
            <Field
              label="Code"
              required
              hint="Short identifier, e.g. KBL"
              maxLength={10}
              value={form.code}
              onChange={(event) => set("code", event.target.value.toUpperCase())}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="City"
              value={form.city}
              onChange={(event) => set("city", event.target.value)}
            />
            <Field
              label="Country"
              value={form.country}
              onChange={(event) => set("country", event.target.value)}
            />
          </div>

          <Field
            label="Address"
            hint="Shown to applicants choosing an office"
            value={form.address}
            onChange={(event) => set("address", event.target.value)}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Phone"
              value={form.phone}
              onChange={(event) => set("phone", event.target.value)}
            />
            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={(event) => set("email", event.target.value)}
            />
          </div>

          <label className="flex items-center gap-2.5 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => set("is_active", event.target.checked)}
              className="size-4 rounded text-brand-600 focus:ring-brand-500/30"
            />
            Active — applicants can choose this office
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {isNew ? "Create branch" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download, FileSpreadsheet, FileText, Table2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { api, apiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { downloadFile } from "@/lib/download";
import { useAuth } from "@/stores/auth";

interface ReportColumn {
  key: string;
  label: string;
  numeric?: boolean;
}

interface ReportResult {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  summary: Record<string, string | number>;
}

const REPORTS = [
  { key: "applications", label: "Applications by status" },
  { key: "visas", label: "By country / visa" },
  { key: "processing-time", label: "Processing time" },
  { key: "customers", label: "Customers" },
  { key: "financial", label: "Financial" },
  { key: "over-time", label: "Over time" },
] as const;

const FORMATS = [
  { key: "csv", label: "CSV", icon: Table2 },
  { key: "xlsx", label: "Excel", icon: FileSpreadsheet },
  { key: "pdf", label: "PDF", icon: FileText },
] as const;

export default function Reports() {
  const hasPermission = useAuth((state) => state.hasPermission);
  const canExport = hasPermission("reports.export");

  const [report, setReport] = useState<string>("applications");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [group, setGroup] = useState<"country" | "type">("country");
  const [interval, setInterval] = useState("month");
  const [error, setError] = useState<string | null>(null);

  const params = {
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    group: report === "visas" ? group : undefined,
    interval: report === "over-time" ? interval : undefined,
  };

  const { data, isLoading, isError, error: queryError } = useQuery({
    queryKey: ["mis", "report", report, params],
    queryFn: async () => {
      const { data } = await api.get<ReportResult>(`/reports/${report}/`, { params });
      return data;
    },
  });

  // The export must carry the same filters as the table on screen, so the
  // query string is rebuilt from current state rather than reusing the
  // react-query params object.
  async function download(format: string) {
    setError(null);
    const query = new URLSearchParams({ export_format: format });
    if (dateFrom) query.set("date_from", dateFrom);
    if (dateTo) query.set("date_to", dateTo);
    if (report === "visas") query.set("group", group);
    if (report === "over-time") query.set("interval", interval);

    const extension = format === "xlsx" ? "xlsx" : format;
    try {
      await downloadFile(
        `/reports/${report}/export/?${query.toString()}`,
        `${report}-report.${extension}`,
      );
    } catch (err) {
      setError(apiErrorMessage(err, "Could not export the report."));
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold">Reports</h1>
        <p className="mt-1 text-sm text-ink-500">
          Figures for any period, exportable as CSV, Excel or PDF.
        </p>
      </header>

      <div className="card p-4">
        <div className="flex flex-wrap gap-2">
          {REPORTS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setReport(item.key)}
              aria-pressed={report === item.key}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                report === item.key
                  ? "bg-brand-700 text-white"
                  : "bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-ink-100 pt-4">
          <div className="space-y-1.5">
            <label htmlFor="date-from" className="block text-xs font-medium text-ink-600">
              From
            </label>
            <input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="rounded-lg border border-ink-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="date-to" className="block text-xs font-medium text-ink-600">
              To
            </label>
            <input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="rounded-lg border border-ink-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {report === "visas" && (
            <div className="space-y-1.5">
              <label htmlFor="group-by" className="block text-xs font-medium text-ink-600">
                Group by
              </label>
              <select
                id="group-by"
                value={group}
                onChange={(event) =>
                  setGroup(event.target.value as "country" | "type")
                }
                className="rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="country">Country</option>
                <option value="type">Visa type</option>
              </select>
            </div>
          )}

          {report === "over-time" && (
            <div className="space-y-1.5">
              <label htmlFor="interval" className="block text-xs font-medium text-ink-600">
                Interval
              </label>
              <select
                id="interval"
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
                className="rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="day">Daily</option>
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </div>
          )}

          {(dateFrom || dateTo) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
            >
              Clear dates
            </Button>
          )}

          {canExport && (
            <div className="ml-auto flex gap-2">
              {FORMATS.map(({ key, label, icon: Icon }) => (
                <Button
                  key={key}
                  size="sm"
                  variant="outline"
                  icon={<Icon className="size-3.5" />}
                  onClick={() => download(key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {isError && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {apiErrorMessage(queryError, "Could not run this report.")}
        </p>
      )}

      {!data && isLoading && (
        <div className="card px-5 py-16 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-ink-100 text-ink-400">
            <BarChart3 className="size-6" aria-hidden />
          </span>
          <p className="mt-4 text-sm text-ink-500">Running report…</p>
        </div>
      )}

      {data && (
        <>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(data.summary).map(([label, value]) => (
              <div key={label} className="card p-5">
                <dt className="text-sm text-ink-500">{label}</dt>
                <dd className="tabular mt-2 font-display text-2xl font-bold text-ink-900">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <section className="card overflow-hidden">
            <header className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
              <h2 className="text-sm font-semibold">{data.title}</h2>
              <span className="text-xs text-ink-500">
                {data.rows.length} {data.rows.length === 1 ? "row" : "rows"}
              </span>
            </header>

            <div className="scroll-slim overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    {data.columns.map((column) => (
                      <th
                        key={column.key}
                        scope="col"
                        className={cn(
                          "px-4 py-3 font-medium",
                          column.numeric && "text-right",
                        )}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-ink-100">
                  {data.rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={data.columns.length}
                        className="px-4 py-12 text-center text-ink-500"
                      >
                        No data for this period.
                      </td>
                    </tr>
                  )}

                  {data.rows.map((row, index) => (
                    <tr key={index} className="transition-colors hover:bg-ink-50">
                      {data.columns.map((column) => (
                        <td
                          key={column.key}
                          className={cn(
                            "px-4 py-3 text-ink-700",
                            column.numeric && "tabular text-right",
                          )}
                        >
                          {row[column.key] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {!canExport && (
        <p className="flex items-center gap-2 text-xs text-ink-500">
          <Download className="size-3.5" aria-hidden />
          You can view reports but not export them.
        </p>
      )}
    </div>
  );
}

import { Plane } from "lucide-react";

import { mediaUrl, useCompanyInfo } from "@/lib/cms";
import { cn } from "@/lib/cn";
import { translate } from "@/lib/i18n";

import { FALLBACK_COMPANY_NAME } from "./useCompanyName";

/**
 * The company's name and logo, as set in the MIS under Settings.
 *
 * Lives in one place because the header, footer and sign-in page all show the
 * same mark: three copies would drift the moment one of them was restyled.
 * The name is translated, so each language can carry its own.
 */
export function CompanyBrand({
  size = "md",
  tone = "dark",
  className,
}: {
  size?: "sm" | "md" | "lg";
  /** "dark" for light backgrounds, "light" for the navy footer. */
  tone?: "dark" | "light";
  className?: string;
}) {
  const { data } = useCompanyInfo();

  const name = translate(data?.name) || FALLBACK_COMPANY_NAME;
  const logo = mediaUrl(data?.logo ?? null);

  const mark = {
    sm: "size-8",
    md: "size-9",
    lg: "size-10",
  }[size];

  const text = {
    sm: "text-[15px]",
    md: "text-[17px]",
    lg: "text-lg",
  }[size];

  return (
    <span className={cn("flex shrink-0 items-center gap-2.5", className)}>
      {logo ? (
        // object-contain, because an uploaded logo is rarely square and must
        // not be cropped or stretched to fit the tile.
        <img
          src={logo}
          alt=""
          className={cn(mark, "rounded-xl object-contain")}
        />
      ) : (
        <span
          className={cn(
            mark,
            "grid place-items-center rounded-xl shadow-subtle",
            tone === "light"
              ? "bg-white/10 text-white"
              : "bg-brand-700 text-white",
          )}
        >
          <Plane className="size-5" aria-hidden />
        </span>
      )}
      <span
        className={cn(
          "font-display font-bold tracking-tight",
          text,
          tone === "light" ? "text-white" : "text-ink-900",
        )}
      >
        {name}
      </span>
    </span>
  );
}

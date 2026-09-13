import { Images, Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { EmptyState, PageBody, PageHeader } from "@/components/public/PageShell";
import { cn } from "@/lib/cn";
import { mediaUrl, usePublicContent, type GalleryImage } from "@/lib/cms";
import { translate } from "@/lib/i18n";

const CATEGORIES = [
  { value: "", labelKey: "pages.catAll" },
  { value: "events", labelKey: "pages.catEvents" },
  { value: "office", labelKey: "pages.catOffice" },
  { value: "activities", labelKey: "pages.catActivities" },
  { value: "company", labelKey: "pages.catCompany" },
] as const;

export default function Gallery() {
  const { t } = useTranslation();
  const [category, setCategory] = useState("");
  const [lightbox, setLightbox] = useState<GalleryImage | null>(null);

  const gallery = usePublicContent<GalleryImage>("gallery", {
    limit: 60,
    params: category ? { category } : undefined,
  });

  // Escape closes the lightbox; without it the only way out is the button.
  useEffect(() => {
    if (!lightbox) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLightbox(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [lightbox]);

  const images = gallery.data ?? [];

  return (
    <>
      <PageHeader title={t("nav.gallery")} subtitle={t("pages.gallerySubtitle")} />

      <PageBody>
        <div className="mb-8 flex flex-wrap gap-2">
          {CATEGORIES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setCategory(item.value)}
              aria-pressed={category === item.value}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                category === item.value
                  ? "bg-brand-700 text-white"
                  : "bg-white text-ink-600 ring-1 ring-inset ring-ink-200 hover:bg-ink-50",
              )}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>

        {gallery.isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="aspect-[4/3] animate-pulse rounded-xl bg-ink-100"
              />
            ))}
          </div>
        )}

        {!gallery.isLoading && images.length === 0 && (
          <EmptyState
            icon={<Images className="size-6" />}
            title={t("pages.noPhotos")}
            body={t("pages.publishedSoon")}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((item) => {
            const src = mediaUrl(item.image);
            const caption = translate(item.title);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setLightbox(item)}
                className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-ink-100"
              >
                {src ? (
                  <img
                    src={src}
                    alt={caption}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : item.kind === "video" && item.video ? (
                  // A video with no poster: the first frame stands in for one.
                  <video
                    src={mediaUrl(item.video)}
                    muted
                    preload="metadata"
                    className="size-full object-cover"
                  />
                ) : null}

                {item.kind === "video" && (
                  <span
                    className="absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-brand-950/60 text-white ring-2 ring-white/70 transition-transform group-hover:scale-110"
                    aria-hidden
                  >
                    <Play className="size-5 translate-x-0.5 fill-current" />
                  </span>
                )}
                {caption && (
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-950/80 to-transparent p-3 text-left text-sm font-medium text-white">
                    {caption}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </PageBody>

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={translate(lightbox.title) || "Photograph"}
          className="fixed inset-0 z-50 grid place-items-center bg-brand-950/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-6" />
          </button>

          <figure
            className="max-h-full max-w-4xl"
            onClick={(event) => event.stopPropagation()}
          >
            {lightbox.kind === "video" ? (
              lightbox.video ? (
                <video
                  src={mediaUrl(lightbox.video)}
                  poster={mediaUrl(lightbox.image)}
                  controls
                  autoPlay
                  className="max-h-[80dvh] w-auto rounded-xl"
                />
              ) : (
                <iframe
                  src={embedUrl(lightbox.video_url)}
                  title={translate(lightbox.title) || "Video"}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="aspect-video max-h-[80dvh] w-[min(56rem,90vw)] rounded-xl border-0"
                />
              )
            ) : (
              <img
                src={mediaUrl(lightbox.image)}
                alt={translate(lightbox.title)}
                className="max-h-[80dvh] w-auto rounded-xl object-contain"
              />
            )}
            {(translate(lightbox.title) || translate(lightbox.description)) && (
              <figcaption className="mt-3 text-center text-sm text-brand-200">
                {translate(lightbox.title)}
                {translate(lightbox.description) && (
                  <span className="mt-1 block text-brand-300">
                    {translate(lightbox.description)}
                  </span>
                )}
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </>
  );
}

/**
 * Turn a YouTube or Vimeo page address into one that can be embedded.
 *
 * Staff paste the link from the browser bar, which is a watch page and
 * refuses to load in a frame; the embed form is what actually plays.
 */
function embedUrl(url: string) {
  const youtube = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/,
  );
  if (youtube) return `https://www.youtube.com/embed/${youtube[1]}`;

  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;

  // Anything else is used as given: it may already be an embed address.
  return url;
}

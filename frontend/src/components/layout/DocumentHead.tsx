import { useEffect } from "react";

import { mediaUrl, useCompanyInfo } from "@/lib/cms";
import { translate } from "@/lib/i18n";

/**
 * Puts the company's name in the browser tab and its logo in the favicon.
 *
 * index.html is a static file baked at build time, so it cannot know who the
 * office is. It therefore ships with no title and no icon at all, and this
 * fills both in once the company record arrives — the tab is usually the
 * first thing a returning visitor recognises, and a stock name or icon there
 * would make the site look like somebody else's.
 *
 * Nothing is shown in the meantime: an empty tab is anonymous, a wrong one
 * is misleading.
 *
 * Renders nothing; it only touches the document head.
 */
export function DocumentHead() {
  const { data } = useCompanyInfo();

  const name = translate(data?.name);
  const description = translate(data?.description);
  const logo = mediaUrl(data?.logo ?? null);

  useEffect(() => {
    // Blank until the record loads, rather than a stock title.
    document.title = name || "";
  }, [name]);

  useEffect(() => {
    const tag = document.querySelector('meta[name="description"]');
    if (tag) tag.setAttribute("content", description || "");
  }, [description]);

  useEffect(() => {
    if (!logo) return;

    // index.html ships without an icon link, so the first logo creates one.
    // Any the document already has are pointed at the logo instead.
    let icons = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'),
    );
    let created: HTMLLinkElement | null = null;

    if (icons.length === 0) {
      created = document.createElement("link");
      created.rel = "icon";
      document.head.appendChild(created);
      icons = [created];
    }

    const previous = icons.map((icon) => ({
      href: icon.getAttribute("href"),
      type: icon.getAttribute("type"),
    }));

    icons.forEach((icon) => {
      icon.href = logo;
      // An uploaded logo is rarely an SVG, and a wrong type attribute stops
      // some browsers drawing it at all.
      icon.removeAttribute("type");
    });

    return () => {
      // A logo that is cleared or replaced must not leave a dead URL in the
      // tab: one this effect created goes away, others are put back.
      if (created) {
        created.remove();
        return;
      }
      icons.forEach((icon, index) => {
        const restored = previous[index];
        if (!restored) return;
        if (restored.href === null) icon.removeAttribute("href");
        else icon.href = restored.href;
        if (restored.type) icon.setAttribute("type", restored.type);
      });
    };
  }, [logo]);

  return null;
}

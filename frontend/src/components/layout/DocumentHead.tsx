import { useEffect } from "react";

import { mediaUrl, useCompanyInfo } from "@/lib/cms";
import { translate } from "@/lib/i18n";

/**
 * Puts the company's name in the browser tab and its logo in the favicon.
 *
 * index.html is a static file baked at build time, so it cannot know who the
 * office is. This rewrites both once the company record arrives — the tab is
 * usually the first thing a returning visitor recognises, and a stock icon
 * there makes the site look like somebody else's.
 *
 * Renders nothing; it only touches the document head.
 */
export function DocumentHead() {
  const { data } = useCompanyInfo();

  const name = translate(data?.name);
  const description = translate(data?.description);
  const logo = mediaUrl(data?.logo ?? null);

  useEffect(() => {
    if (name) document.title = name;
  }, [name]);

  useEffect(() => {
    if (!description) return;
    const tag = document.querySelector('meta[name="description"]');
    if (tag) tag.setAttribute("content", description);
  }, [description]);

  useEffect(() => {
    if (!logo) return;

    const previous: { href: string; type: string | null }[] = [];
    const icons = document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]');

    icons.forEach((icon) => {
      previous.push({ href: icon.href, type: icon.getAttribute("type") });
      icon.href = logo;
      // The bundled default is an SVG; an uploaded logo rarely is, and a
      // wrong type attribute stops some browsers drawing it at all.
      icon.removeAttribute("type");
    });

    return () => {
      // Put the bundled icon back if the logo is cleared or changed, rather
      // than leaving a dead URL in the tab.
      icons.forEach((icon, index) => {
        const restored = previous[index];
        if (!restored) return;
        icon.href = restored.href;
        if (restored.type) icon.setAttribute("type", restored.type);
      });
    };
  }, [logo]);

  return null;
}

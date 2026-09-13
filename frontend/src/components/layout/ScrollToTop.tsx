import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Start each new page at the top.
 *
 * A single-page app keeps the window's scroll position across navigations, so
 * opening a link from halfway down one page drops you halfway down the next.
 *
 * Going Back or Forward is the exception: the browser restores where the
 * reader was, and overriding that would lose their place.
 */
export function ScrollToTop() {
  const { pathname, search, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") return;

    // An anchor link names its own target, which outranks the top of the page.
    if (hash) {
      const target = document.querySelector(hash);
      if (target) {
        target.scrollIntoView();
        return;
      }
    }

    // "instant" rather than smooth: a new page should already be at the top,
    // not visibly race there — and this respects reduced-motion by default.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, search, hash, navigationType]);

  return null;
}

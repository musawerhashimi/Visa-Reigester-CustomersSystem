/**
 * Every sidebar entry must have a route behind it.
 *
 * Customers, Documents, Emails and Settings were listed in the nav with no
 * route defined, so clicking them fell through to the catch-all and bounced
 * the user to the public homepage — which reads as the app being broken.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";

import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

function navTargets(source: string): string[] {
  // Matches the `to: "/mis/..."` entries in the NAV table.
  return [...source.matchAll(/to:\s*"(\/mis[^"]*)"/g)].map((match) => match[1]!);
}

function misRoutes(source: string): string[] {
  // Routes are nested under <Route path="/mis">, so paths are relative.
  const block = source.slice(source.indexOf('path="/mis"'));
  const end = block.indexOf('path="/portal"');
  const misBlock = end === -1 ? block : block.slice(0, end);
  return [...misBlock.matchAll(/<Route path="([^"]+)"/g)].map((match) => match[1]!);
}

describe("MIS navigation", () => {
  const layout = read("./MISLayout.tsx");
  const app = read("../../App.tsx");

  it("has a route for every sidebar entry", () => {
    const routes = misRoutes(app);
    const missing = navTargets(layout).filter((target) => {
      // "/mis" itself is the index route.
      if (target === "/mis") return false;
      const path = target.replace("/mis/", "");
      return !routes.includes(path);
    });

    expect(missing).toEqual([]);
  });

  it("lists the pages the specification expects", () => {
    const targets = navTargets(layout);

    for (const expected of [
      "/mis/applications",
      "/mis/customers",
      "/mis/documents",
      "/mis/emails",
      "/mis/reports",
      "/mis/settings",
    ]) {
      expect(targets).toContain(expected);
    }
  });
});

/**
 * Session tokens must not leak between browser tabs.
 *
 * localStorage is shared across every tab of an origin, so storing the token
 * there let a second tab — or a pasted deep link — walk past the login screen.
 * These tests pin the token to sessionStorage, which is per-tab.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { api, tokenStore } from "./api";

const ACCESS_KEY = "visacrm.access";
const REFRESH_KEY = "visacrm.refresh";

describe("tokenStore", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("keeps tokens in sessionStorage, not localStorage", () => {
    tokenStore.set("access-token", "refresh-token");

    expect(sessionStorage.getItem(ACCESS_KEY)).toBe("access-token");
    expect(sessionStorage.getItem(REFRESH_KEY)).toBe("refresh-token");

    // A second tab reads localStorage-backed state; nothing may be there.
    expect(localStorage.getItem(ACCESS_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });

  it("reports no session when this tab never signed in", () => {
    // Simulates a fresh tab: another tab's localStorage entry must not count.
    localStorage.setItem(ACCESS_KEY, "another-tabs-token");

    expect(tokenStore.access).toBeNull();
    expect(tokenStore.refresh).toBeNull();
  });

  it("round-trips a token within the same tab", () => {
    tokenStore.set("abc", "def");

    expect(tokenStore.access).toBe("abc");
    expect(tokenStore.refresh).toBe("def");
  });

  it("clears both tokens on logout", () => {
    tokenStore.set("abc", "def");
    tokenStore.clear();

    expect(tokenStore.access).toBeNull();
    expect(tokenStore.refresh).toBeNull();
  });

  it("keeps an existing refresh token when only the access token rotates", () => {
    tokenStore.set("first-access", "the-refresh");
    tokenStore.set("second-access");

    expect(tokenStore.access).toBe("second-access");
    expect(tokenStore.refresh).toBe("the-refresh");
  });
});

/**
 * File uploads must not be labelled as JSON.
 *
 * The client sets a JSON Content-Type by default, which would override the
 * multipart type axios generates for FormData — leaving the server with a
 * body it cannot find a file in ("The submitted data was not a file").
 */
describe("request content type", () => {
  async function sentHeaders(data: unknown) {
    // A stub adapter sees the headers after every interceptor has run, which
    // an interceptor of our own would not: axios runs those in reverse order.
    const original = api.defaults.adapter;
    let captured: Record<string, unknown> = {};
    api.defaults.adapter = async (config) => {
      captured = { ...config.headers };
      return {
        data: {},
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    };

    await api.post("/probe/", data).catch(() => undefined);
    api.defaults.adapter = original;
    return captured;
  }

  it("never labels FormData as JSON", async () => {
    const form = new FormData();
    form.append("featured_image", new Blob(["x"]), "picture.png");

    const headers = await sentHeaders(form);

    // The exact value is chosen by axios per environment (and carries the
    // boundary in a browser); what matters is that the JSON default no
    // longer wins, which is what stripped the file from the request.
    expect(headers["Content-Type"]).not.toBe("application/json");
  });

  it("still sends plain objects as JSON", async () => {
    const headers = await sentHeaders({ title: "An article" });

    expect(headers["Content-Type"]).toBe("application/json");
  });
});

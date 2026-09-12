/**
 * Session tokens must not leak between browser tabs.
 *
 * localStorage is shared across every tab of an origin, so storing the token
 * there let a second tab — or a pasted deep link — walk past the login screen.
 * These tests pin the token to sessionStorage, which is per-tab.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { tokenStore } from "./api";

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

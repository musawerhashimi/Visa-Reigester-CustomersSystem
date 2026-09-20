import { describe, expect, it, vi, afterEach } from "vitest";

import { mediaUrl } from "./cms";

/**
 * mediaUrl decides which host an uploaded file is fetched from. Getting it
 * wrong shows no error — the image is simply absent — so the fallbacks are
 * pinned here.
 */
describe("mediaUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns nothing for an empty path", () => {
    expect(mediaUrl(null)).toBeUndefined();
    expect(mediaUrl("")).toBeUndefined();
  });

  it("leaves an absolute URL alone", () => {
    const url = "https://cdn.example.com/media/logo.png";
    expect(mediaUrl(url)).toBe(url);
  });

  it("uses the configured media base", () => {
    vi.stubEnv("VITE_MEDIA_BASE_URL", "https://api.example.com");
    expect(mediaUrl("/media/company/logo.png")).toBe(
      "https://api.example.com/media/company/logo.png",
    );
  });

  it("falls back to the API origin when no media base is set", () => {
    // A deployment that sets VITE_API_BASE_URL but forgets the media one
    // would otherwise resolve against the frontend, which holds no uploads.
    vi.stubEnv("VITE_MEDIA_BASE_URL", "");
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/api");
    expect(mediaUrl("/media/company/logo.png")).toBe(
      "https://api.example.com/media/company/logo.png",
    );
  });

  it("does not double the slash when the base carries one", () => {
    vi.stubEnv("VITE_MEDIA_BASE_URL", "https://api.example.com/");
    expect(mediaUrl("/media/x.png")).toBe("https://api.example.com/media/x.png");
  });

  it("adds the separator when the path lacks one", () => {
    vi.stubEnv("VITE_MEDIA_BASE_URL", "https://api.example.com");
    expect(mediaUrl("media/x.png")).toBe("https://api.example.com/media/x.png");
  });
});

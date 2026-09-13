import { api } from "./api";

/**
 * Download a file from a permission-checked endpoint.
 *
 * A plain anchor would arrive without the Authorization header and be
 * refused, so the file is fetched as a blob and handed to the browser.
 */
export async function downloadFile(url: string, filename: string) {
  const response = await api.get(apiPath(url), { responseType: "blob" });
  const objectUrl = URL.createObjectURL(response.data as Blob);

  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();

  // Revoking immediately can cancel the download in some browsers; one tick
  // is enough for the click to be handled.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

/**
 * Strip the "/api" the server puts in its download URLs.
 *
 * The API client is already based at "/api", so passing a server-supplied
 * path through unchanged would request "/api/api/...". Absolute URLs are
 * left alone.
 */
function apiPath(url: string) {
  if (/^https?:\/\//i.test(url)) return url;

  // The base may be a bare path ("/api") or absolute
  // ("https://host/api"); either way it is the path part that overlaps.
  const base = api.defaults.baseURL ?? "";
  const basePath = /^https?:\/\//i.test(base)
    ? new URL(base).pathname.replace(/\/$/, "")
    : base.replace(/\/$/, "");

  if (basePath && url.startsWith(`${basePath}/`)) {
    return url.slice(basePath.length);
  }
  return url;
}

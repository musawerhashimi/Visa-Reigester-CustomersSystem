import { api } from "./api";

/**
 * Download a file from a permission-checked endpoint.
 *
 * A plain anchor would arrive without the Authorization header and be
 * refused, so the file is fetched as a blob and handed to the browser.
 */
export async function downloadFile(url: string, filename: string) {
  const response = await api.get(url, { responseType: "blob" });
  const objectUrl = URL.createObjectURL(response.data as Blob);

  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.click();

  // Revoking immediately can cancel the download in some browsers; one tick
  // is enough for the click to be handled.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

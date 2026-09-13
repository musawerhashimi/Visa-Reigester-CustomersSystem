import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";

const ACCESS_TOKEN_KEY = "visacrm.access";
const REFRESH_TOKEN_KEY = "visacrm.refresh";

/**
 * Session tokens, scoped to one browser tab.
 *
 * sessionStorage rather than localStorage: localStorage is shared across every
 * tab of an origin, so opening the portal in a second tab — or following a
 * pasted deep link — would walk straight past the login screen on a machine
 * the customer may not be alone at. A tab that did not sign in has no session.
 */
const storage = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    // Private modes and some embedded browsers throw on access; the app then
    // behaves as signed out rather than crashing.
    return null;
  }
};

/** Tokens written by an older build that used localStorage. */
function purgeLegacyTokens() {
  try {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

purgeLegacyTokens();

export const tokenStore = {
  get access() {
    return storage()?.getItem(ACCESS_TOKEN_KEY) ?? null;
  },
  get refresh() {
    return storage()?.getItem(REFRESH_TOKEN_KEY) ?? null;
  },
  set(access: string, refresh?: string) {
    const store = storage();
    if (!store) return;
    store.setItem(ACCESS_TOKEN_KEY, access);
    if (refresh) store.setItem(REFRESH_TOKEN_KEY, refresh);
  },
  clear() {
    const store = storage();
    store?.removeItem(ACCESS_TOKEN_KEY);
    store?.removeItem(REFRESH_TOKEN_KEY);
  },
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // File uploads must carry multipart/form-data plus the boundary axios
  // generates. The JSON default above would otherwise mislabel the body and
  // the server would find no file in it.
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

/**
 * Refresh the access token at most once per expiry, queueing any requests that
 * hit 401 in the meantime so a page issuing several calls does not fire several
 * refreshes and invalidate its own rotated token.
 */
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refresh = tokenStore.refresh;
  if (!refresh) throw new Error("No refresh token available");

  const { data } = await axios.post<{ access: string; refresh?: string }>(
    `${api.defaults.baseURL}/auth/token/refresh/`,
    { refresh },
  );
  tokenStore.set(data.access, data.refresh);
  return data.access;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      | (AxiosRequestConfig & { _retried?: boolean })
      | undefined;

    const isAuthEndpoint = original?.url?.includes("/auth/token/refresh/");
    if (
      error.response?.status !== 401 ||
      !original ||
      original._retried ||
      isAuthEndpoint
    ) {
      return Promise.reject(error);
    }

    original._retried = true;
    try {
      refreshInFlight ??= refreshAccessToken().finally(() => {
        refreshInFlight = null;
      });
      const access = await refreshInFlight;
      original.headers = { ...original.headers, Authorization: `Bearer ${access}` };
      return api(original);
    } catch (refreshError) {
      tokenStore.clear();
      // Bounce to login, preserving where the user was headed.
      const target = `${window.location.pathname}${window.location.search}`;
      if (!window.location.pathname.startsWith("/login")) {
        window.location.assign(`/login?next=${encodeURIComponent(target)}`);
      }
      return Promise.reject(refreshError);
    }
  },
);

/** Flatten DRF's error shapes into one message suitable for a toast. */
export function apiErrorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (!axios.isAxiosError(error)) return fallback;
  const data = error.response?.data as unknown;

  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of ["detail", "error", "message"]) {
      const value = record[key];
      if (typeof value === "string") return value;
    }
    const firstField = Object.values(record)[0];
    if (Array.isArray(firstField) && typeof firstField[0] === "string") {
      return firstField[0];
    }
  }
  return error.message || fallback;
}

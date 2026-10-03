/**
 * Resolves the backend API base URL dynamically:
 * - In local dev (localhost, 127.0.0.1, port 8080, file:): uses port 10000 on the same host
 * - In production: reads <meta name="streaks-api-base-url"> or falls back to production Render backend
 */
export function getApiBaseUrl() {
  if (typeof document === "undefined") {
    return "https://streaks-api-7213.onrender.com";
  }

  const configuredApiUrl = document.querySelector("meta[name='streaks-api-base-url']")?.content.trim();
  const localHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(window.location.hostname);
  const localFrontend = localHost || window.location.port === "8080" || window.location.protocol === "file:";

  if (localFrontend) {
    try {
      const localApiUrl = new URL(window.location.protocol === "file:" ? "http://localhost/" : window.location.origin);
      localApiUrl.port = "10000";
      return localApiUrl.origin;
    } catch (_) {
      return "http://localhost:10000";
    }
  }

  return (configuredApiUrl || "https://streaks-api-7213.onrender.com").replace(/\/+$/, "");
}

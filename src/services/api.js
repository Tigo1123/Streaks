import { getApiBaseUrl } from "../utils/config.js";

export { getApiBaseUrl };

/**
 * Standard fetch client for the Streaks backend API.
 * Preserves exact error resilience, Bearer auth header injection, If-Match support, and response parsing.
 *
 * @param {string} path - API endpoint path starting with "/"
 * @param {object} [options]
 * @param {string} [options.method="GET"]
 * @param {string} [options.token] - JWT token for Authorization header
 * @param {any} [options.body] - Request body object to be JSON serialized
 * @param {Record<string, string>} [options.headers={}] - Custom headers (e.g. If-Match, If-None-Match)
 * @param {AbortSignal} [options.signal] - Abort controller signal
 * @returns {Promise<{ response: Response, payload: any }>}
 */
export async function authRequest(path, {
  method = "GET",
  token,
  body,
  headers: extraHeaders = {},
  signal
} = {}) {
  const baseUrl = getApiBaseUrl();
  const headers = { Accept: "application/json", ...extraHeaders };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_) {
    // If response has no JSON body (or is 204 No Content), payload remains null
  }

  return { response, payload };
}

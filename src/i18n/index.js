import { en } from "./en.js";
import { ar } from "./ar.js";

export const i18n = { en, ar };

/**
 * Translates a key for the given language with parameter substitution.
 * Preserves exact fallback behavior: specified language -> english -> key.
 *
 * @param {string} key - Translation key
 * @param {Record<string, any>} [values={}] - Interpolation values e.g. { day: 1, total: 30 }
 * @param {"en" | "ar"} [language="en"] - Target language
 * @returns {string} Translated string
 */
export function t(key, values = {}, language = "en") {
  const langDict = i18n[language] || i18n.en;
  const template = langDict[key] ?? i18n.en[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (_, k) => values[k] ?? "");
}

/**
 * Creates a scoped translator function for a given language.
 *
 * @param {"en" | "ar"} language
 * @returns {(key: string, values?: Record<string, any>) => string}
 */
export function createTranslator(language = "en") {
  return (key, values = {}) => t(key, values, language);
}

export default i18n;

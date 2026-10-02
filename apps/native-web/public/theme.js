import { t } from "./i18n.js";
/**
 * Product themes. The attribute is applied before first paint by an inline
 * snippet in each page head; this module owns the choice list and persistence.
 */
export const THEME_STORE = "oss.theme";
export const THEMES = Object.freeze([
  { id: "warm", name: t("暖调"), note: t("象牙底色、陶土点缀，当前默认") },
  { id: "ink", name: t("水墨 · OOPS"), note: t("纸墨单色、等宽字体，与 O.O.P.S 同源") },
]);

export function currentTheme() {
  const value = document.documentElement.dataset.theme;
  return THEMES.some((theme) => theme.id === value) ? value : "warm";
}

export function applyTheme(id) {
  const next = THEMES.some((theme) => theme.id === id) ? id : "warm";
  if (next === "warm") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = next;
  try {
    if (next === "warm") localStorage.removeItem(THEME_STORE);
    else localStorage.setItem(THEME_STORE, next);
  } catch {
    /* the choice still applies to this page */
  }
  return next;
}

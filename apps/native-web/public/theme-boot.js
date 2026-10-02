// Applies the saved product theme before first paint (render-blocking on purpose;
// the page CSP forbids inline scripts). The choice list lives in theme.js.
try {
  if (localStorage.getItem("oss.theme") === "ink") document.documentElement.dataset.theme = "ink";
} catch {
  /* storage unavailable: default theme */
}
// Raster capture pages (render=1) must never show the workspace cover: the
// export screenshots whatever is painted over #slide.
if (/[?&]render=1(?:&|$)/.test(location.search)) document.documentElement.dataset.render = "1";

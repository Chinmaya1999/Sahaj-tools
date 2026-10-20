// Applies the saved light/dark theme before first paint, so there is no flash.
// Kept as a separate file because the Content-Security-Policy does not allow inline scripts.
try {
  var t = localStorage.getItem("sahaj-theme");
  if (t !== "light" && t !== "dark") t = "dark";
  document.documentElement.dataset.theme = t;
} catch (e) {
  document.documentElement.dataset.theme = "dark";
}

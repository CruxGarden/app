/** Fade out and remove the boot splash (index.html). Safe to call repeatedly. */
export function dismissSplash(): void {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.style.opacity = '0';
  setTimeout(() => splash.remove(), 300);
}

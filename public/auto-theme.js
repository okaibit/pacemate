// Runs in the document head before the app renders. Local time is the only input.
(() => {
  const root = document.documentElement;
  let previous;
  function apply() {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const theme = minutes >= 360 && minutes < 1110 ? 'light' : 'dark';
    if (theme === previous) return;
    previous = theme;
    const background = theme === 'light' ? '#F5F2EB' : '#0D1B15';
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    root.style.backgroundColor = background;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', background);
  }
  apply();
  window.setInterval(apply, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') apply();
  });
  window.addEventListener('pageshow', apply);
  window.addEventListener('focus', apply);
})();

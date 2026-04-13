try {
  var stored = localStorage.getItem('theme');
  var theme;
  if (stored === 'dark' || stored === 'light') {
    theme = stored;
  } else {
    theme = window.matchMedia('(max-width: 767px)').matches ? 'dark' : 'light';
    localStorage.setItem('theme', theme);
  }
  document.documentElement.setAttribute('data-theme', theme);
} catch {}

if (history.scrollRestoration) history.scrollRestoration = 'manual';

if (window.location.pathname === '/') {
  document.documentElement.classList.add('intro-lock');
  var shouldIntro = true;

  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      shouldIntro = false;
    }
    if (sessionStorage.getItem('introSeen') === '1') {
      shouldIntro = false;
    }
  } catch {}

  if (shouldIntro) {
    document.documentElement.dataset.introActive = 'true';
  } else {
    document.documentElement.dataset.introSkip = 'true';
  }
}

window.addEventListener('pageshow', function (e) {
  if (e.persisted) window.location.reload();
});

(function () {
  function applyUtterancesTheme(theme) {
    var iframe = document.querySelector('.utterances-frame');
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(
      { type: 'set-theme', theme: theme === 'dark' ? 'github-dark' : 'github-light' },
      'https://utteranc.es'
    );
  }

  document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    // utterances iframe은 비동기로 늦게 붙기 때문에, 붙는 걸 감지해서 현재 테마를 한 번 맞춰준다.
    var observer = new MutationObserver(function () {
      var iframe = document.querySelector('.utterances-frame');
      if (iframe) {
        iframe.addEventListener('load', function () {
          applyUtterancesTheme(document.documentElement.getAttribute('data-theme'));
        });
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    toggle.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem('theme', next);
      } catch (e) {}
      applyUtterancesTheme(next);
    });
  });
})();

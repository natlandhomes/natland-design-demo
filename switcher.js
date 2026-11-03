// Floating design-variation switcher for the preview site.
// Each variation folder has the same page files, so switching keeps the current page.
(function () {
  var VARIANTS = [
    { dir: 'final', label: 'Final' },
    { dir: 'variation-g', label: 'Demo 1' },
    { dir: 'variation-f', label: 'Demo 2' },
    { dir: 'variation-e', label: 'Demo 3' },
  ];
  var parts = location.pathname.split('/');
  var file = parts.pop() || 'Home.dc.html';
  var current = parts[parts.length - 1];

  var wrap = document.createElement('label');
  wrap.style.cssText = 'position: fixed; left: 12px; bottom: 12px; z-index: 1000; display: flex; align-items: center; gap: 8px; ' +
    'padding: 6px 8px 6px 12px; background: rgba(12, 42, 77, 0.92); color: #fff; border-radius: 999px; ' +
    'box-shadow: 0 6px 20px rgba(0, 0, 0, 0.22); font: 500 12px/1 \'Helvetica Neue\', Arial, sans-serif; letter-spacing: 0.02em;';
  wrap.appendChild(document.createTextNode('Design'));

  var select = document.createElement('select');
  select.setAttribute('aria-label', 'Design variation');
  select.style.cssText = 'appearance: none; -webkit-appearance: none; margin: 0; padding: 6px 26px 6px 10px; ' +
    'background: #fff url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' fill=\'none\' stroke=\'%230c2a4d\' stroke-width=\'1.5\'/%3E%3C/svg%3E") no-repeat right 10px center; ' +
    'color: #0c2a4d; border: 0; border-radius: 999px; font: 600 12px/1.2 \'Helvetica Neue\', Arial, sans-serif; cursor: pointer;';
  VARIANTS.forEach(function (v) {
    var opt = document.createElement('option');
    opt.value = v.dir;
    opt.textContent = v.label;
    select.appendChild(opt);
  });
  var reset = function () { select.value = current; };
  reset();
  // Restore the selection when the page comes back from the back/forward cache.
  window.addEventListener('pageshow', reset);
  select.addEventListener('change', function () {
    if (select.value !== current) location.href = '../' + select.value + '/' + file;
  });

  wrap.appendChild(select);
  document.body.appendChild(wrap);
})();

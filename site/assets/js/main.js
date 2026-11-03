/* natlandhomes.com — site behaviour. No dependencies (Lenis is loaded on demand from
   /assets/js/, desktop only). Motion follows docs/ANIMATIONS.md. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var narrow = window.matchMedia('(max-width: 767px)');
  // .fx is set in <head> unless the visitor prefers reduced motion; it enables every animation.
  var fx = root.classList.contains('fx');
  window.__nlfx = true; // tells the <head> safety timeout that this script is running
  var swing = function (t) { return 0.5 - Math.cos(t * Math.PI) / 2; };
  var EASE_CURTAIN = 'cubic-bezier(0.76, 0, 0.24, 1)';
  var EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
  var lenis = null;
  var each = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); };
  var session = {
    get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} },
    remove: function (k) { try { sessionStorage.removeItem(k); } catch (e) {} }
  };

  // Animate window scroll to `to` with "swing" easing (no Lenis: phones, reduced motion).
  function scrollToY(to, duration) {
    if (reduceMotion.matches) { window.scrollTo(0, to); return; }
    var from = window.scrollY, start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      window.scrollTo(0, from + (to - from) * swing(p));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- Smooth scrolling (Lenis, desktop only) ---------- */
  if (fx && !narrow.matches) {
    var lenisScript = document.createElement('script');
    lenisScript.src = new URL('lenis-1.1.20.min.js', (document.currentScript || document.querySelector('script[src*="main.js"]')).src).href;
    lenisScript.onload = function () {
      if (window.Lenis) lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true, autoRaf: false });
    };
    document.head.appendChild(lenisScript);
  }

  /* ---------- Mobile menu (drops down below the header) ---------- */
  var toggle = document.querySelector('.menu-toggle');
  var menu = document.getElementById('mobile-menu');
  function setMenu(open) {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }
  if (toggle && menu) {
    toggle.addEventListener('click', function () { setMenu(menu.hidden); });
    document.addEventListener('click', function (e) {
      if (!menu.hidden && !e.target.closest('.site-header')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) { setMenu(false); toggle.focus(); }
    });
    narrow.addEventListener('change', function () { setMenu(false); });
  }

  /* ---------- Back to top (desktop) ---------- */
  var backTop = document.querySelector('.back-to-top');
  if (backTop) {
    backTop.addEventListener('click', function (e) {
      e.preventDefault();
      if (lenis) lenis.scrollTo(0);
      else scrollToY(0, 600);
      document.getElementById('top').focus({ preventScroll: true });
    });
  }

  /* ---------- Scroll animations ----------
   * data-reveal  fade in + rise            data-split  heading words rise one by one
   * data-line    rule draws (="y": down)   data-clip   photo uncovered from a side (left|right|up) + settles from 1.25×
   * data-delay   ms before it starts       data-kb     hero photo settles from 1.18× once the page shows
   * data-parallax / data-scrub / data-travel / data-pulse: see loop() below.
   * Start states are in main.css (under html.fx); here elements only get .is-in. */
  var ANIMATED = '[data-reveal],[data-split],[data-line],[data-clip]';

  function splitWords(el) {
    var i = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            var mask = document.createElement('span');
            var word = document.createElement('span');
            mask.className = 'w';
            word.textContent = part;
            word.style.setProperty('--i', i++);
            mask.appendChild(word);
            frag.appendChild(mask);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') {
          walk(n);
        }
      });
    })(el);
    el.classList.add('is-split');
  }

  function play(el) {
    el.classList.add('is-in');
    if (el.hasAttribute('data-clip')) {
      // After the reveal, hovering a [data-zoom] parent may zoom the photo (main.css).
      setTimeout(function () { el.classList.add('is-done'); }, (+el.getAttribute('data-delay') || 0) + 1300);
    }
  }

  var observer = null;
  function release() {
    if (!fx) return;
    if ('IntersectionObserver' in window) {
      // A fully clipped element never counts as intersecting, so a [data-clip] is watched through
      // its parent.
      var targets = new Map();
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          targets.get(entry.target).forEach(play);
        });
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 });
      each(ANIMATED, function (el) {
        var t = el.hasAttribute('data-clip') && el.parentElement ? el.parentElement : el;
        if (!targets.has(t)) { targets.set(t, []); observer.observe(t); }
        targets.get(t).push(el);
      });
    } else {
      each(ANIMATED, play);
    }
    // Ken Burns: on a parallax layer the photo inside is animated (the layer's own transform is
    // set every frame by the loop).
    each('[data-kb]', function (el) {
      var target = el.hasAttribute('data-parallax') ? el.querySelector('img') : el;
      if (target && target.animate) target.animate([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 2600, easing: EASE_OUT, fill: 'both' });
    });
  }

  if (fx) {
    // A lazy photo inside a fully clipped [data-clip] never counts as visible, so the browser would
    // only fetch it once the reveal starts: load it when its box comes near the viewport instead.
    if ('IntersectionObserver' in window) {
      var preload = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          preload.unobserve(entry.target);
          entry.target.__lazy.forEach(function (img) { img.loading = 'eager'; });
        });
      }, { rootMargin: '800px 0px' });
      each('[data-clip] img[loading="lazy"]', function (img) {
        var box = img.closest('[data-clip]').parentElement;
        if (!box.__lazy) { box.__lazy = []; preload.observe(box); }
        box.__lazy.push(img);
      });
    }
    each('[data-split]', splitWords);
    each('[data-delay]', function (el) { el.style.setProperty('--d', (+el.getAttribute('data-delay') || 0) + 'ms'); });
    each('[data-pulse]', function (el) {
      if (!el.animate) return;
      el.animate([{ transform: 'scale(1)', opacity: 0.75 }, { transform: 'scale(3.4)', opacity: 0 }],
        { duration: 2000, iterations: Infinity, delay: +el.getAttribute('data-pulse') || 0, easing: EASE_OUT });
    });
  }

  /* ---------- Scroll progress bar, parallax, scrubbed panorama, map traveller ---------- */
  var bar = document.querySelector('.progress');
  var parallax = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
  var scrubs = Array.prototype.slice.call(document.querySelectorAll('[data-scrub]'));
  var travellers = Array.prototype.slice.call(document.querySelectorAll('[data-travel]')).map(function (el) {
    return {
      el: el,
      p: el.getAttribute('data-travel').split(',').map(Number),
      ms: +el.getAttribute('data-travel-ms') || 2600,   // length of one flight
      off: +el.getAttribute('data-travel-offset') || 0  // phase shift: two dots can fly opposite ways out of step
    };
  });

  function loop(now) {
    requestAnimationFrame(loop);
    if (lenis) lenis.raf(now);
    var y = window.scrollY, vh = window.innerHeight, H = root.scrollHeight - vh;
    if (bar) bar.style.transform = 'scaleX(' + (H > 0 ? Math.min(1, y / H) : 0).toFixed(4) + ')';
    if (!fx) return;
    parallax.forEach(function (el) {
      var r = (el.parentElement || el).getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      var s = +el.getAttribute('data-parallax') || 0.1;
      var p = (r.top + r.height / 2 - vh / 2) / vh;
      el.style.transform = 'translate3d(0,' + (p * vh * s).toFixed(1) + 'px,0) scale(' + (1 + s * 1.6).toFixed(3) + ')';
    });
    // The panorama opens from an inset, rounded frame to full width as it scrolls into view.
    scrubs.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      var p = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.85)));
      p = 1 - Math.pow(1 - p, 3);
      var q = 1 - p;
      el.style.clipPath = 'inset(' + (q * 10).toFixed(2) + '% ' + (q * 12).toFixed(2) + '% round ' + (q * 28).toFixed(1) + 'px)';
      var img = el.querySelector('img');
      if (img) img.style.transform = 'translate3d(' + ((0.5 - p) * 4).toFixed(2) + '%,0,0) scale(' + (1.22 - p * 0.14).toFixed(3) + ')';
    });
    // White dots flying between Canada and China along a quadratic curve (x0,y0, control, x1,y1 in %).
    travellers.forEach(function (t) {
      var k = ((now + t.off) % t.ms) / t.ms, u = 1 - k, a = t.p;
      t.el.style.left = (u * u * a[0] + 2 * u * k * a[2] + k * k * a[4]).toFixed(2) + '%';
      t.el.style.top = (u * u * a[1] + 2 * u * k * a[3] + k * k * a[5]).toFixed(2) + '%';
      t.el.style.opacity = Math.min(1, Math.min(k, u) * 6).toFixed(2);
    });
    if (backTop) backTop.classList.toggle('is-active', y > 400);
  }
  requestAnimationFrame(loop);
  if (!fx && backTop) {
    window.addEventListener('scroll', function () { backTop.classList.toggle('is-active', window.scrollY > 400); }, { passive: true });
  }

  /* ---------- Page transition curtain ----------
   * Leaving: red then navy panels rise over the page, then the browser navigates. Arriving: the
   * page starts covered (html.nl-cover from <head>), the panels lift, and the animations start.
   * The first visit of a session shows the logo on the navy panel before lifting. */
  var curtain = document.querySelector('.curtain');
  var red = curtain && curtain.children[0];
  var navy = curtain && curtain.children[1];
  var curtainLogo = navy && navy.querySelector('img');
  var curtainBar = navy && navy.querySelector('.curtain__bar');

  function resetCurtain() {
    [red, navy, curtainLogo, curtainBar].forEach(function (el) {
      if (el && el.getAnimations) el.getAnimations().forEach(function (a) { a.cancel(); });
    });
  }
  function hideCurtain() { curtain.classList.remove('is-on'); resetCurtain(); }

  function openCurtain() {
    var arriving = session.get('nl-curtain') === '1';
    var seen = session.get('nl-intro') === '1';
    session.remove('nl-curtain');
    session.set('nl-intro', '1');
    var intro = !arriving && !seen;
    if (!curtain || !fx || !red.animate || (!arriving && !intro)) {
      root.classList.remove('nl-cover');
      release();
      return;
    }
    curtain.classList.add('is-on'); // takes over from html.nl-cover without a gap
    root.classList.remove('nl-cover');
    function lift(start) {
      navy.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], { duration: 900, delay: start, easing: EASE_CURTAIN, fill: 'forwards' });
      red.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], { duration: 900, delay: start + 120, easing: EASE_CURTAIN, fill: 'forwards' })
        .onfinish = hideCurtain;
      setTimeout(release, start + 380);
    }
    if (intro && curtainLogo) {
      curtainLogo.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 700, easing: EASE_OUT, fill: 'forwards' });
      curtainBar.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 900, delay: 250, easing: EASE_CURTAIN, fill: 'forwards' });
      curtainLogo.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 1250, fill: 'forwards' });
      lift(1350);
    } else {
      lift(80);
    }
  }

  function leave(url) {
    session.set('nl-curtain', '1');
    if (!curtain || !fx || !red.animate) { window.location.href = url; return; }
    resetCurtain();
    curtain.classList.add('is-on');
    // fill: both — the panels must sit below the screen during the delay, not cover it.
    red.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: 600, easing: EASE_CURTAIN, fill: 'both' });
    navy.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: 600, delay: 100, easing: EASE_CURTAIN, fill: 'both' })
      .onfinish = function () { window.location.href = url; };
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target instanceof Element && e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^(mailto:|tel:|https?:|javascript:)/i.test(href) || a.origin !== window.location.origin) return;
    e.preventDefault();
    leave(a.href);
  });

  // Back/forward from the browser's page cache: the page comes back as it was left, covered.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted || !curtain) return;
    session.remove('nl-curtain');
    hideCurtain();
  });

  openCurtain();

  /* ---------- Portfolio carousel ---------- */
  var carousel = document.querySelector('[data-carousel]');
  if (carousel) {
    var slides = document.querySelectorAll('.portfolio-hero__slides li');
    var current = 0, timer = null;
    var go = function (i) {
      current = (i + slides.length) % slides.length;
      Array.prototype.forEach.call(slides, function (s, k) { s.classList.toggle('is-current', k === current); });
    };
    each('[data-carousel] [data-step]', function (btn) {
      btn.addEventListener('click', function () {
        clearInterval(timer);
        go(current + Number(btn.getAttribute('data-step')));
      });
    });
    if (!reduceMotion.matches) timer = setInterval(function () { if (!document.hidden) go(current + 1); }, 6000);
  }

  /* ---------- Gallery lightbox ---------- */
  var gallery = document.querySelector('[data-lightbox]');
  if (gallery) {
    // A project page can have several gallery blocks: the lightbox steps through all of them.
    var links = Array.prototype.slice.call(document.querySelectorAll('[data-lightbox] a'));
    var box = document.querySelector('.lightbox');
    var stage = box.querySelector('.lightbox__stage');
    // The full-size <img> is created here rather than in the HTML: its size depends on the photo shown.
    // It sits in a <picture> (display: contents in CSS) so the browser can pick the AVIF file.
    var pic = document.createElement('picture');
    var avif = document.createElement('source');
    avif.type = 'image/avif';
    var img = document.createElement('img');
    img.className = 'lightbox__img';
    img.alt = '';
    pic.appendChild(avif);
    pic.appendChild(img);
    stage.appendChild(pic);
    var counter = box.querySelector('.lightbox__counter');
    var prev = box.querySelector('.lightbox__prev');
    var next = box.querySelector('.lightbox__next');
    var closeBtn = box.querySelector('.lightbox__close');
    var shown = -1, opener = null;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };

    // Zoom the image from the thumbnail's rect to its final rect.
    function zoomFrom(thumb) {
      if (reduceMotion.matches || !thumb) return;
      var a = thumb.getBoundingClientRect(), b = img.getBoundingClientRect();
      if (!b.width) return;
      img.animate([
        { transform: 'translate(' + (a.left - b.left) + 'px,' + (a.top - b.top) + 'px) scale(' + a.width / b.width + ',' + a.height / b.height + ')', opacity: 0.1 },
        { transform: 'none', opacity: 1 }
      ], { duration: 366, easing: 'cubic-bezier(0.5, 0, 0.14, 1)' });
    }

    // Smallest variant at least as wide as the photo will be displayed (x device pixel ratio):
    // .lightbox__img is limited to the stage's width and height.
    function photoUrl(link, ext) {
      var thumb = link.querySelector('img');
      var ratio = thumb.getAttribute('width') / thumb.getAttribute('height');
      var w0 = Math.min(stage.clientWidth, stage.clientHeight * ratio);
      var need = w0 * (window.devicePixelRatio || 1);
      var widths = link.getAttribute('data-widths').split(' ').map(Number);
      var w = widths.filter(function (x) { return x >= need; })[0] || widths[widths.length - 1];
      return link.getAttribute('data-base') + '-w' + w + '.' + ext;
    }

    function show(i, fromThumb) {
      shown = (i + links.length) % links.length; // loops at both ends
      var link = links[shown];
      counter.textContent = pad(shown + 1) + ' / ' + pad(links.length);
      prev.hidden = next.hidden = links.length < 2;
      img.alt = link.querySelector('img').alt;
      var load = function () {
        if (fromThumb) zoomFrom(link.querySelector('img'));
        else if (!reduceMotion.matches) img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 366 });
      };
      img.onload = load;
      if (link.hasAttribute('data-widths')) {
        if (link.hasAttribute('data-avif')) avif.srcset = photoUrl(link, 'avif');
        else avif.removeAttribute('srcset');
        img.src = photoUrl(link, 'webp');
      } else {
        img.src = link.href;
      }
      if (img.complete && img.naturalWidth) { img.onload = null; load(); }
    }

    function open(i) {
      opener = document.activeElement;
      box.hidden = false;
      box.classList.add('is-open');
      root.classList.add('lightbox-lock');
      if (lenis) lenis.stop();
      requestAnimationFrame(function () { box.classList.add('is-visible'); });
      show(i, true);
      closeBtn.focus();
    }

    function close() {
      box.classList.remove('is-visible', 'is-open');
      box.hidden = true;
      root.classList.remove('lightbox-lock');
      if (lenis) lenis.start();
      avif.removeAttribute('srcset');
      img.removeAttribute('src');
      shown = -1;
      if (opener) opener.focus();
    }

    links.forEach(function (link, i) {
      link.addEventListener('click', function (e) { e.preventDefault(); open(i); });
    });
    prev.addEventListener('click', function () { show(shown - 1); });
    next.addEventListener('click', function () { show(shown + 1); });
    closeBtn.addEventListener('click', close);
    box.querySelector('.lightbox__bg').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (shown < 0) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(shown - 1);
      else if (e.key === 'ArrowRight') show(shown + 1);
      else if (e.key === 'Tab') {
        // Keep focus inside the dialog.
        var focusables = Array.prototype.filter.call(box.querySelectorAll('button'), function (b) { return !b.hidden; });
        var first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ---------- Contact forms → mailto: (no backend) ---------- */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validate(field) {
    var value = field.value.trim();
    var msg = '';
    if (field.required && !value) msg = 'Please fill out this field.';
    else if (field.type === 'email' && value && !EMAIL_RE.test(value)) msg = 'Please enter an email address.';
    else if (field.type === 'tel' && value && !/^[0-9+().\-\s]{6,}$/.test(value)) msg = 'Please enter a telephone number.';
    var err = document.getElementById(field.getAttribute('aria-describedby'));
    field.setAttribute('aria-invalid', String(Boolean(msg)));
    if (err) err.textContent = msg;
    return !msg;
  }

  function buildMailto(form) {
    var data = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (el.name) data[el.name] = el.value.trim();
    });
    var lines = [];
    lines.push('Name: ' + data['your-name']);
    if (data['your-phone'] !== undefined) lines.push('Phone: ' + (data['your-phone'] || '-'));
    lines.push('Email: ' + data['your-email']);
    lines.push('');
    lines.push('Message:');
    lines.push(data['your-message'] || '-');
    lines.push('');
    lines.push('--');
    lines.push('Sent from ' + window.location.href);
    var subject = (form.getAttribute('data-subject') || 'Website enquiry') + ' - ' + data['your-name'];
    return 'mailto:' + form.getAttribute('data-to') +
      '?subject=' + encodeURIComponent(subject) +
      // RFC 6068: line breaks in a mailto body are CRLF, including those typed in the message.
      '&body=' + encodeURIComponent(lines.join('\n').replace(/\r?\n/g, '\r\n'));
  }

  document.querySelectorAll('form[data-mailto]').forEach(function (form) {
    var fields = Array.prototype.filter.call(form.elements, function (el) { return el.name; });
    fields.forEach(function (field) {
      field.addEventListener('blur', function () { if (field.value) validate(field); });
      field.addEventListener('input', function () { if (field.getAttribute('aria-invalid') === 'true') validate(field); });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var firstInvalid = null;
      fields.forEach(function (field) { if (!validate(field) && !firstInvalid) firstInvalid = field; });
      if (firstInvalid) { firstInvalid.focus(); return; }
      window.location.href = buildMailto(form);
    });
  });

  // Exposed for automated tests (tools/check-forms.mjs).
  window.__natland = { buildMailto: buildMailto };
})();

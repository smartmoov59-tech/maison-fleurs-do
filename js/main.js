/* ==========================================================================
   MAISON FLEURS D'Ô — scripts
   Site 100 % statique : aucun serveur, aucun abonnement.
   La réservation génère un récapitulatif (appel / SMS / e-mail / agenda .ics).
   ========================================================================== */
(function () {
  'use strict';

  /* ======================================================================
     CONFIG — à compléter avec la boutique
     ====================================================================== */
  var CONFIG = {
    shopName: 'Maison Fleurs d’Ô',
    phone: '+33442643505',
    phoneDisplay: '04 42 64 35 05',
    /* Numéro de MOBILE de la boutique pour recevoir les réservations par SMS
       (ex. '+33612345678'). Le 04 42 64 35 05 est un fixe : il ne reçoit pas de SMS.
       Laissé vide, le bouton « Envoyer par SMS » reste masqué. */
    smsNumber: '',
    /* Adresse e-mail de la boutique pour recevoir les réservations
       (ex. 'bonjour@exemple.fr'). Laissée vide, le bouton e-mail reste masqué. */
    email: '',
    address: 'Place Jeanne d’Arc, 13100 Aix-en-Provence',
    tz: 'Europe/Paris',
    /* Horaires en minutes depuis minuit : 0 = dimanche … 6 = samedi */
    hours: {
      0: [570, 780],
      1: [570, 1170], 2: [570, 1170], 3: [570, 1170], 4: [570, 1170],
      5: [570, 1200], 6: [570, 1200]
    },
    leadMinutes: 60,   /* délai minimum entre maintenant et le retrait */
    maxDays: 21        /* nombre de jours proposés */
  };

  /* ====================================================================== helpers */
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var html = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var lenis = null;
  var hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var pad = function (n) { return String(n).padStart(2, '0'); };

  window.__foReady = true;

  function parisNow() {
    var f = new Intl.DateTimeFormat('en-GB', {
      timeZone: CONFIG.tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short'
    });
    var o = {};
    f.formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
    var map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { y: +o.year, m: +o.month, d: +o.day, dow: map[o.weekday], min: (+o.hour) * 60 + (+o.minute) };
  }
  function fmtHour(min) {
    var h = Math.floor(min / 60), m = min % 60;
    return h + 'h' + (m ? pad(m) : '');
  }
  function fmtClock(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }

  /* ====================================================================== statut d'ouverture */
  function updateOpen() {
    var el = $('#openBadge');
    if (!el) return;
    var n = parisNow(), h = CONFIG.hours[n.dow], t = $('span', el);
    if (n.min >= h[0] && n.min < h[1]) {
      el.classList.remove('chip--closed');
      t.textContent = 'Ouvert maintenant · jusqu’à ' + fmtHour(h[1]);
    } else if (n.min < h[0]) {
      el.classList.add('chip--closed');
      t.textContent = 'Fermé · ouvre à ' + fmtHour(h[0]);
    } else {
      el.classList.add('chip--closed');
      t.textContent = 'Fermé · rouvre demain à ' + fmtHour(CONFIG.hours[(n.dow + 1) % 7][0]);
    }
    $$('#hours tr').forEach(function (tr) { tr.classList.toggle('is-today', +tr.dataset.d === n.dow); });
  }

  /* ====================================================================== split text */
  function splitNode(node, chars) {
    Array.prototype.slice.call(node.childNodes).forEach(function (child) {
      if (child.nodeType === 3) {
        var frag = document.createDocumentFragment();
        child.textContent.split(/([ \t\r\n]+)/).forEach(function (part) {
          if (!part) return;
          if (/^[ \t\r\n]+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          var w = document.createElement('span');
          w.className = 'w';
          w.setAttribute('aria-hidden', 'true');
          Array.from(part).forEach(function (ch) {
            var c = document.createElement('span');
            c.className = 'c';
            c.textContent = ch;
            w.appendChild(c);
            chars.push(c);
          });
          frag.appendChild(w);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1) {
        splitNode(child, chars);
      }
    });
  }
  function splitText(el) {
    if (el.__chars) return el.__chars;
    var chars = [];
    if (el.tagName !== 'SPAN' && !el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    splitNode(el, chars);
    el.__chars = chars;
    el.classList.add('is-split');
    return chars;
  }

  /* ====================================================================== vidéos */
  function setupHeroVideo() {
    var v = $('#heroVideo');
    if (!v || reduce) return Promise.resolve();
    var saveData = navigator.connection && navigator.connection.saveData;
    var big = window.innerWidth > 900 && !saveData;
    v.src = big ? v.dataset.srcLg : v.dataset.srcSm;
    v.muted = true;
    var ready = new Promise(function (res) {
      v.addEventListener('loadeddata', res, { once: true });
      v.addEventListener('error', res, { once: true });
      setTimeout(res, 3800);
    });
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
    return ready;
  }
  function setupLazyVideos() {
    if (reduce || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        else v.pause();
      });
    }, { rootMargin: '150px' });
    $$('video[data-lazy-video]').forEach(function (v) { io.observe(v); });
  }

  /* ====================================================================== menu mobile */
  function setupMenu() {
    var burger = $('#burger'), menu = $('#menu');
    if (!burger || !menu) return;
    function setOpen(open) {
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
      menu.classList.toggle('is-open', open);
      menu.setAttribute('aria-hidden', open ? 'false' : 'true');
      html.classList.toggle('menu-open', open);
      if (lenis) { open ? lenis.stop() : lenis.start(); }
      if (open) { var a = $('a', menu); if (a) setTimeout(function () { a.focus({ preventScroll: true }); }, 400); }
    }
    burger.addEventListener('click', function () { setOpen(burger.getAttribute('aria-expanded') !== 'true'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.classList.contains('is-open')) { setOpen(false); burger.focus(); } });
    window.__closeMenu = function () { if (menu.classList.contains('is-open')) setOpen(false); };
    $$('.menu__links a', menu).forEach(function (a, i) { a.style.setProperty('--i', i); });
  }

  /* ====================================================================== avis (carrousel) */
  function setupReviews() {
    var rail = $('#revRail');
    if (!rail) return;
    var prev = $('#revPrev'), next = $('#revNext');
    function step() { var c = $('.rev', rail); return c ? c.getBoundingClientRect().width + 20 : 320; }
    function atEnd() { return rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 8; }
    function go(dir) {
      if (dir > 0 && atEnd()) rail.scrollTo({ left: 0, behavior: reduce ? 'auto' : 'smooth' });
      else if (dir < 0 && rail.scrollLeft <= 4) rail.scrollTo({ left: rail.scrollWidth, behavior: reduce ? 'auto' : 'smooth' });
      else rail.scrollBy({ left: dir * step(), behavior: reduce ? 'auto' : 'smooth' });
    }
    prev.addEventListener('click', function () { go(-1); });
    next.addEventListener('click', function () { go(1); });
    if (reduce) return;
    var timer = null, paused = false, visible = false;
    function start() { stop(); timer = setInterval(function () { if (!paused && visible) go(1); }, 5500); }
    function stop() { if (timer) clearInterval(timer); timer = null; }
    ['mouseenter', 'focusin', 'touchstart', 'pointerdown'].forEach(function (ev) { rail.addEventListener(ev, function () { paused = true; }); });
    ['mouseleave', 'focusout'].forEach(function (ev) { rail.addEventListener(ev, function () { paused = false; }); });
    rail.addEventListener('touchend', function () { setTimeout(function () { paused = false; }, 4000); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }, { threshold: .3 }).observe(rail);
    } else visible = true;
    start();
  }

  /* ====================================================================== lightbox */
  function setupLightbox() {
    var dlg = $('#lightbox');
    if (!dlg || typeof dlg.showModal !== 'function') return;
    var figs = $$('.gfig'), idx = 0;
    var img = $('#lbImg'), cap = $('#lbCap');
    function show(i) {
      idx = (i + figs.length) % figs.length;
      var f = figs[idx], im = $('img', f);
      img.src = im.currentSrc || im.src;
      img.alt = im.alt;
      cap.textContent = f.dataset.cap || '';
    }
    figs.forEach(function (f, i) {
      $('.gfig__btn', f).addEventListener('click', function () {
        show(i);
        dlg.showModal();
        if (lenis) lenis.stop();
      });
    });
    $('#lbClose').addEventListener('click', function () { dlg.close(); });
    $('#lbPrev').addEventListener('click', function () { show(idx - 1); });
    $('#lbNext').addEventListener('click', function () { show(idx + 1); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () { if (lenis && !html.classList.contains('menu-open')) lenis.start(); });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') show(idx + 1);
      if (e.key === 'ArrowLeft') show(idx - 1);
    });
  }

  /* ======================================================================
     RÉSERVATION — assistant en 4 étapes (aucun serveur)
     ====================================================================== */
  var booking = (function () {
    var form = $('#bkForm');
    if (!form) return { preselect: function () {} };
    var panes = $$('.bk__pane', form), stepsLi = $$('.bk__steps li');
    var current = 0, note = '', ref = '', lastMsg = '', lastData = null;
    var daysBox = $('#days'), slotsBox = $('#slots'), slotHint = $('#slotHint');
    var dayNames = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
    var monthNames = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

    /* ---- créneaux */
    function slotsFor(dow, nowMin) {
      var h = CONFIG.hours[dow], out = [];
      var from = h[0];
      if (nowMin !== null) {
        var min = nowMin + CONFIG.leadMinutes;
        from = Math.max(from, Math.ceil(min / 30) * 30);
      }
      for (var t = from; t <= h[1] - 30; t += 30) out.push(t);
      return out;
    }
    function iso(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }

    function buildDays() {
      var now = parisNow();
      var base = Date.UTC(now.y, now.m - 1, now.d);
      daysBox.innerHTML = '';
      for (var k = 0; k < CONFIG.maxDays; k++) {
        var dt = new Date(base + k * 864e5), dow = dt.getUTCDay();
        if (k === 0 && !slotsFor(dow, now.min).length) continue;
        var label = document.createElement('label');
        var input = document.createElement('input');
        input.type = 'radio'; input.name = 'jour'; input.value = iso(dt); input.dataset.dow = dow; input.dataset.today = k === 0 ? '1' : '';
        var span = document.createElement('span');
        var s1 = document.createElement('small'); s1.textContent = k === 0 ? 'auj.' : dayNames[dow];
        var s2 = document.createElement('b'); s2.textContent = dt.getUTCDate();
        var s3 = document.createElement('em'); s3.textContent = monthNames[dt.getUTCMonth()];
        span.appendChild(s1); span.appendChild(s2); span.appendChild(s3);
        label.appendChild(input); label.appendChild(span);
        daysBox.appendChild(label);
      }
    }
    function renderSlots() {
      var sel = $('input[name=jour]:checked', form);
      var prevSlot = $('input[name=heure]:checked', form);
      var keep = prevSlot ? prevSlot.value : '';
      slotsBox.innerHTML = '';
      if (!sel) {
        var p = document.createElement('p'); p.className = 'slots__empty'; p.textContent = 'Choisissez d’abord un jour.'; slotsBox.appendChild(p);
        return;
      }
      var dow = +sel.dataset.dow, now = parisNow();
      var list = slotsFor(dow, sel.dataset.today ? now.min : null);
      var h = CONFIG.hours[dow];
      var mode = $('input[name=mode]:checked', form).value;
      slotHint.textContent = (mode === 'Livraison' ? '(créneau souhaité) · ' : '') + 'ouvert ' + fmtHour(h[0]) + '–' + fmtHour(h[1]);
      if (!list.length) {
        var e = document.createElement('p'); e.className = 'slots__empty'; e.textContent = 'Plus de créneau ce jour-là : choisissez un autre jour.'; slotsBox.appendChild(e);
        return;
      }
      list.forEach(function (t) {
        var label = document.createElement('label');
        var input = document.createElement('input');
        input.type = 'radio'; input.name = 'heure'; input.value = fmtClock(t);
        if (keep === input.value) input.checked = true;
        var span = document.createElement('span'); span.textContent = fmtClock(t).replace(':', 'h');
        label.appendChild(input); label.appendChild(span);
        slotsBox.appendChild(label);
      });
    }

    /* ---- navigation entre étapes */
    function setSteps() {
      stepsLi.forEach(function (li, i) {
        li.classList.toggle('is-on', i === current);
        li.classList.toggle('is-done', i < current);
        if (i === current) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      });
    }
    function show(i) {
      panes[current].classList.remove('is-on');
      current = i;
      panes[current].classList.add('is-on');
      setSteps();
      if (hasGsap && !reduce) gsap.fromTo(panes[current], { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: .7, ease: 'power3.out', clearProps: 'transform' });
      var card = $('#bk');
      var r = card.getBoundingClientRect();
      if (r.top < 70 || r.top > window.innerHeight * .6) {
        if (lenis) lenis.scrollTo(card, { offset: -90, duration: 1 });
        else card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }
      var target = current === 3 ? $('#ticket') : $('h3', panes[current]);
      if (target) { if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
    }
    function err(i, msg) { var e = $('.bk__err', panes[i]); if (e) e.textContent = msg || ''; return !msg; }
    function validate(i) {
      err(i, '');
      if (i === 0) {
        if (!$('input[name=occasion]:checked', form)) return err(i, 'Choisissez une occasion pour continuer.');
        if (!$('input[name=produit]:checked', form)) return err(i, 'Choisissez la création qui vous fait envie.');
      }
      if (i === 1) {
        var mode = $('input[name=mode]:checked', form).value;
        if (mode === 'Livraison') {
          var a = $('#adresse').value.trim();
          if (a.length < 8) return err(i, 'Indiquez l’adresse de livraison (rue, code postal, ville).');
        }
        if (!$('input[name=jour]:checked', form)) return err(i, 'Choisissez un jour.');
        if (!$('input[name=heure]:checked', form)) return err(i, 'Choisissez une heure.');
      }
      if (i === 2) {
        if ($('#prenom').value.trim().length < 2) return err(i, 'Indiquez votre prénom.');
        var digits = $('#tel').value.replace(/[^\d+]/g, '');
        if (digits.replace(/\D/g, '').length < 9) return err(i, 'Indiquez un numéro de téléphone valide pour que la boutique puisse vous joindre.');
      }
      return true;
    }
    function next() { if (validate(current)) { if (current < 2) show(current + 1); else form.requestSubmit ? form.requestSubmit() : submit(); } }
    function prev() { if (current > 0) show(current - 1); }

    $$('[data-next]', form).forEach(function (b) { b.addEventListener('click', next); });
    $$('[data-prev]', form).forEach(function (b) { b.addEventListener('click', prev); });
    $('#bkEdit').addEventListener('click', function () { show(0); });

    /* ---- sélection */
    $$('input[name=mode]', form).forEach(function (r) {
      r.addEventListener('change', function () {
        var liv = $('input[name=mode]:checked', form).value === 'Livraison';
        $('#delivBox').hidden = !liv;
        renderSlots();
      });
    });
    daysBox.addEventListener('change', renderSlots);
    var range = $('#budget'), out = $('#budgetOut');
    range.addEventListener('input', function () { out.textContent = range.value + '\u00A0€'; });
    form.addEventListener('change', function () { err(current, ''); });

    /* ---- pré-sélection depuis les cartes / services */
    var pre = document.createElement('p');
    pre.className = 'bk__pre'; pre.hidden = true;
    var preTxt = document.createElement('span');
    var preBtn = document.createElement('button'); preBtn.type = 'button'; preBtn.textContent = 'retirer';
    pre.appendChild(preTxt); pre.appendChild(preBtn);
    $('.picks', form).after(pre);
    preBtn.addEventListener('click', function () { setNote(''); });
    function setNote(n) { note = n || ''; pre.hidden = !note; preTxt.textContent = note ? 'Votre choix : ' + note : ''; }
    function check(name, value) {
      var el = $$('input[name=' + name + ']', form).filter(function (i) { return i.value === value; })[0];
      if (el) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    function preselect(name) {
      var clean = name.replace(/\s*\((catalogue|plante)\)\s*$/i, '');
      var n = '';
      if (/^Bouquet du fleuriste/.test(name)) check('produit', 'Bouquet du fleuriste (composé sur place)');
      else if (/^Bouquet rond/.test(name)) { check('produit', 'Bouquet du fleuriste (composé sur place)'); n = 'Bouquet rond pastel'; }
      else if (/^Rose/.test(name)) check('produit', 'Rose à l’unité ou bouquet de roses');
      else if (/^Orchidée|^Plante/.test(name)) { check('produit', 'Plante ou orchidée'); n = clean; }
      else if (/^Livraison/.test(name)) { check('mode', 'Livraison'); n = 'Livraison à Aix-en-Provence / Les Milles'; }
      else if (/catalogue/.test(name)) { check('produit', 'Bouquet de la sélection (catalogue)'); n = clean; }
      else { check('produit', 'Autre idée (à préciser)'); n = clean; }
      setNote(n);
      if (current !== 0) show(0);
    }

    /* ---- récapitulatif */
    function longDate(isoStr) {
      var p = isoStr.split('-');
      var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
      return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    }
    function collect() {
      var fd = new FormData(form);
      return {
        occasion: fd.get('occasion'), produit: fd.get('produit'), mode: fd.get('mode'),
        adresse: (fd.get('adresse') || '').toString().trim(), jour: fd.get('jour'), heure: fd.get('heure'),
        budget: fd.get('budget'), couleurs: fd.getAll('couleur'), carte: (fd.get('carte') || '').toString().trim(),
        prenom: (fd.get('prenom') || '').toString().trim(), tel: (fd.get('tel') || '').toString().trim()
      };
    }
    function makeRef() {
      var abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', s = 'FO-';
      for (var i = 0; i < 4; i++) s += abc[Math.floor(Math.random() * abc.length)];
      return s;
    }
    function rows(d) {
      var liv = d.mode === 'Livraison';
      var r = [
        ['Occasion', d.occasion],
        ['Création', d.produit + (note ? ' — ' + note : '')],
        [liv ? 'Livraison' : 'Retrait', longDate(d.jour) + ' à ' + d.heure.replace(':', 'h')]
      ];
      if (liv) r.push(['Adresse', d.adresse]);
      r.push(['Budget', '≈ ' + d.budget + ' €']);
      if (d.couleurs.length) r.push(['Couleurs', d.couleurs.join(', ')]);
      if (d.carte) r.push(['Carte', '« ' + d.carte + ' »']);
      r.push(['Au nom de', d.prenom + ' · ' + d.tel]);
      return r;
    }
    function message(d) {
      return 'Réservation ' + CONFIG.shopName + ' — réf. ' + ref + '\n' +
        rows(d).map(function (x) { return x[0] + ' : ' + x[1]; }).join('\n') +
        '\n\n(Demande faite depuis le site)';
    }

    /* .ics (agenda) */
    function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
    function fold(line) {
      var out = [], s = line;
      while (s.length > 73) { out.push(s.slice(0, 73)); s = ' ' + s.slice(73); }
      out.push(s);
      return out.join('\r\n');
    }
    function buildIcs(d) {
      var p = d.jour.split('-'), t = d.heure.split(':');
      var startMin = (+t[0]) * 60 + (+t[1]), endMin = startMin + 30;
      var dt = function (min) { return p[0] + p[1] + p[2] + 'T' + pad(Math.floor(min / 60)) + pad(min % 60) + '00'; };
      var now = new Date();
      var stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
      var liv = d.mode === 'Livraison';
      var lines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Maison Fleurs d\'O//Reservation//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'BEGIN:VTIMEZONE', 'TZID:Europe/Paris',
        'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
        'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
        'END:VTIMEZONE',
        'BEGIN:VEVENT',
        'UID:' + ref + '-' + now.getTime() + '@maisonfleursdo',
        'DTSTAMP:' + stamp,
        'DTSTART;TZID=Europe/Paris:' + dt(startMin),
        'DTEND;TZID=Europe/Paris:' + dt(endMin),
        'SUMMARY:' + icsEscape((liv ? 'Livraison bouquet' : 'Retrait bouquet') + ' — ' + CONFIG.shopName + ' (' + ref + ')'),
        'LOCATION:' + icsEscape(CONFIG.shopName + ', ' + CONFIG.address),
        'DESCRIPTION:' + icsEscape(message(d) + '\nTél. boutique : ' + CONFIG.phoneDisplay),
        'BEGIN:VALARM', 'TRIGGER:-PT60M', 'ACTION:DISPLAY', 'DESCRIPTION:Votre bouquet vous attend dans une heure', 'END:VALARM',
        'END:VEVENT', 'END:VCALENDAR'
      ];
      return lines.map(fold).join('\r\n') + '\r\n';
    }
    function download(name, text, type) {
      var blob = new Blob([text], { type: type });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }
    function status(msg) { var s = $('#bkStatus'); s.textContent = msg; }

    function renderTicket(d) {
      $('#tkRef').textContent = ref;
      var dl = $('#tkList');
      dl.innerHTML = '';
      rows(d).forEach(function (r) {
        var dt = document.createElement('dt'); dt.textContent = r[0];
        var dd = document.createElement('dd'); dd.textContent = r[1];
        dl.appendChild(dt); dl.appendChild(dd);
      });
      var msg = message(d);
      var sms = $('#actSms'), mail = $('#actMail');
      if (CONFIG.smsNumber) { sms.href = 'sms:' + CONFIG.smsNumber + '?&body=' + encodeURIComponent(msg); sms.hidden = false; } else sms.hidden = true;
      if (CONFIG.email) {
        mail.href = 'mailto:' + CONFIG.email + '?subject=' + encodeURIComponent('Réservation ' + ref + ' — ' + d.prenom) + '&body=' + encodeURIComponent(msg.replace(/\n/g, '\r\n'));
        mail.hidden = false;
      } else mail.hidden = true;
      /* l'appel reste toujours disponible */
      status('');
    }
    function submit() {
      if (!validate(2)) return;
      ref = makeRef();
      lastData = collect();
      lastMsg = message(lastData);
      renderTicket(lastData);
      show(3);
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (current < 2) next(); else submit();
    });
    $('#actIcs').addEventListener('click', function () {
      if (!lastData) return;
      download('reservation-fleurs-do-' + ref + '.ics', buildIcs(lastData), 'text/calendar;charset=utf-8');
      status('Fichier d’agenda téléchargé : ouvrez-le pour l’ajouter à votre calendrier.');
    });
    $('#actCopy').addEventListener('click', function () {
      if (!lastMsg) return;
      var done = function () { status('Récapitulatif copié : vous pouvez le coller dans un message.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lastMsg).then(done, fallback);
      else fallback();
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = lastMsg; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { status('Copie impossible : sélectionnez le texte du récapitulatif.'); }
        ta.remove();
      }
    });

    buildDays();
    renderSlots();
    setSteps();
    return { preselect: preselect };
  })();

  /* ====================================================================== animations (GSAP) */
  function setupLenis() {
    if (typeof window.Lenis === 'undefined' || !finePointer || reduce) return null;
    var l = new window.Lenis({
      duration: 1.15,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true
    });
    l.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { l.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
    return l;
  }

  function scrollToEl(t) {
    if (lenis) lenis.scrollTo(t, { duration: 1.6, easing: function (x) { return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; } });
    else t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
  function setupAnchors() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href');
      if (!id || id.length < 2) return;
      var t = document.querySelector(id);
      if (!t) return;
      e.preventDefault();
      if (a.dataset.pick) booking.preselect(a.dataset.pick);
      if (window.__closeMenu) window.__closeMenu();
      var go = function () { scrollToEl(t); try { history.replaceState(null, '', id); } catch (er) {} };
      if (html.classList.contains('menu-open')) setTimeout(go, 450); else go();
    });
  }

  function setupNav() {
    var nav = $('#nav'), bar = $('#progressBar'), fab = $('#fab');
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: function (self) {
        var y = self.scroll();
        nav.classList.toggle('is-solid', y > 60);
        if (!html.classList.contains('menu-open')) {
          if (y > 500 && self.direction === 1) nav.classList.add('is-hidden');
          else if (self.direction === -1 || y < 300) nav.classList.remove('is-hidden');
        }
        bar.style.transform = 'scaleX(' + self.progress.toFixed(4) + ')';
        if (fab) fab.classList.toggle('is-in', y > window.innerHeight * .7);
      }
    });
  }

  function runLoader(done) {
    var loader = $('#loader');
    if (!loader) { done(); return; }
    var circle = $('.loader__circle'), leaf = $('.loader__leaf'), name = $('.loader__name'),
        count = $('#loaderCount'), shutter = $('.loader__shutter'), inner = $('.loader__inner');
    var state = { v: 0 };
    var heroReady = setupHeroVideo();
    gsap.set(leaf, { scale: 0, svgOrigin: '100 54' });
    var anim = new Promise(function (resolve) {
      gsap.timeline({ onComplete: resolve })
        .to(circle, { strokeDashoffset: 0, duration: 1.5, ease: 'power2.inOut' }, 0)
        .to(leaf, { scale: 1, svgOrigin: '100 54', duration: .7, ease: 'back.out(2.2)' }, .85)
        .fromTo(name, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: .9, ease: 'power3.out' }, .3)
        .to(state, { v: 100, duration: 1.7, ease: 'power1.inOut', onUpdate: function () { count.textContent = Math.round(state.v); } }, 0)
        .to({}, { duration: .25 });
    });
    Promise.all([anim, heroReady]).then(function () {
      count.textContent = '100';
      var travel = shutter.offsetHeight + 40;
      gsap.timeline({
        onComplete: function () {
          loader.remove();
          html.classList.remove('is-loading');
          if (lenis) lenis.start();
        }
      })
        .to(inner, { opacity: 0, y: -40, duration: .5, ease: 'power2.in' })
        .to(shutter, { y: -travel, duration: 1.3, ease: 'power4.inOut' }, .15)
        .call(done, null, .55);
    });
  }

  /* état de départ du hero, posé AVANT que le rideau ne se lève (pas de flash) */
  function heroPrep() {
    gsap.set('.hero__maison .c, .hero__big [data-split] .c, .o__ch', { yPercent: 125, rotate: 7, transformOrigin: '0% 100%' });
    gsap.set('.hero__video', { scale: 1.28 });
    gsap.set('.hero__screen--l', { xPercent: -100 });
    gsap.set('.hero__screen--r', { xPercent: 100 });
    gsap.set('.hero__eyebrow, .hero__lead, .hero__cta>*, .hero__foot>*', { opacity: 0, y: 24 });
  }
  function heroIntro() {
    var tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
    tl.to('.hero__video', { scale: 1.06, duration: 2.8, ease: 'power3.out' }, 0)
      .to('.hero__screen--l', { xPercent: 0, duration: 1.8 }, 0)
      .to('.hero__screen--r', { xPercent: 0, duration: 1.8 }, 0)
      .to('.hero__eyebrow', { opacity: 1, y: 0, duration: 1 }, .2)
      .to('.hero__maison .c', { yPercent: 0, rotate: 0, duration: 1.1, stagger: .045 }, .3)
      .to('.hero__big [data-split] .c', { yPercent: 0, rotate: 0, duration: 1.3, stagger: .055 }, .4)
      .to('.o__ch', { yPercent: 0, rotate: 0, duration: 1.3 }, .85)
      .to('.o__ring circle', { strokeDashoffset: 0, duration: 1.8, ease: 'power2.inOut' }, 1.15)
      .to('.hero__lead', { opacity: 1, y: 0, duration: 1.1 }, 1.0)
      .to('.hero__cta>*', { opacity: 1, y: 0, duration: 1, stagger: .12 }, 1.15)
      .to('.hero__foot>*', { opacity: 1, y: 0, duration: 1, stagger: .1 }, 1.4);
  }

  function spawnPetals() {
    var box = $('#petals');
    if (!box || reduce) return [];
    var W = box.clientWidth || window.innerWidth, H = box.clientHeight || window.innerHeight;
    var n = W < 700 ? 8 : 16, tweens = [];
    var tints = ['#eeb1bd', '#f5eee2', '#e98fa3', '#d9763a'];
    for (var i = 0; i < n; i++) {
      var p = document.createElement('span');
      p.className = 'petal';
      p.style.setProperty('--s', rand(14, 30).toFixed(0) + 'px');
      p.style.color = tints[i % tints.length];
      p.innerHTML = '<svg viewBox="0 0 40 60" aria-hidden="true"><use href="#petal"/></svg>';
      box.appendChild(p);
      var inner = p.firstChild, dur = rand(11, 19), r0 = rand(0, 360), delay = rand(0, dur);
      gsap.set(p, { x: rand(0, W), y: -70, rotation: r0, opacity: 0 });
      tweens.push(gsap.to(p, {
        y: H + 70, rotation: r0 + rand(260, 560), duration: dur, ease: 'none', repeat: -1, delay: delay,
        onRepeat: function () { gsap.set(this.targets()[0], { x: rand(0, W) }); }
      }));
      tweens.push(gsap.fromTo(p, { opacity: 0 }, { keyframes: { opacity: [0, .85, .85, 0] }, duration: dur, ease: 'none', repeat: -1, delay: delay }));
      tweens.push(gsap.to(inner, { x: rand(-70, 70), rotation: rand(-35, 35), duration: rand(2.5, 4.5), ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    }
    ScrollTrigger.create({
      trigger: '.hero', start: 'top bottom', end: 'bottom top',
      onToggle: function (self) { tweens.forEach(function (t) { self.isActive ? t.play() : t.pause(); }); }
    });
    return tweens;
  }

  /* ---------- animations communes (desktop + mobile) ---------- */
  function sharedAnimations(cleanups) {
    /* parallax multicouche du hero */
    var hero = $('.hero');
    var st = { trigger: hero, start: 'top top', end: 'bottom top', scrub: true };
    gsap.to('.hero__media', { yPercent: 16, scale: 1.08, ease: 'none', scrollTrigger: st });
    gsap.to('.hero__petals', { yPercent: -18, ease: 'none', scrollTrigger: st });
    gsap.to('.hero__screen--l', { yPercent: -14, x: -50, ease: 'none', scrollTrigger: st });
    gsap.to('.hero__screen--r', { yPercent: -14, x: 50, ease: 'none', scrollTrigger: st });
    gsap.to('.hero__inner', { yPercent: -9, opacity: .25, ease: 'none', scrollTrigger: st });

    /* titres : lettre par lettre, masque qui monte */
    $$('[data-split-title]').forEach(function (el) {
      if (el.classList.contains('step__title') && !html.classList.contains('static-mode')) return;
      var chars = splitText(el);
      gsap.from(chars, {
        yPercent: 118, rotate: 5, transformOrigin: '0% 100%', duration: 1.15, ease: 'power4.out',
        stagger: { each: .02 },
        scrollTrigger: { trigger: el, start: 'top 88%', end: 'max', once: true }
      });
    });

    /* révélations */
    ScrollTrigger.batch('[data-reveal]', {
      start: 'top 90%', end: 'max', once: true,
      onEnter: function (els) { gsap.to(els, { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out', stagger: .1, overwrite: true }); }
    });

    /* compteurs + anneaux */
    $$('[data-count]').forEach(function (el) {
      var target = parseFloat(el.dataset.count), dec = +el.dataset.decimals || 0, o = { v: 0 };
      ScrollTrigger.create({
        trigger: el, start: 'top 88%', end: 'max', once: true,
        onEnter: function () {
          gsap.to(o, { v: target, duration: 2.2, ease: 'power3.out', onUpdate: function () { el.textContent = o.v.toFixed(dec).replace('.', ','); } });
        }
      });
    });
    $$('.stat__arc').forEach(function (a) {
      var f = parseFloat(a.dataset.fill);
      ScrollTrigger.create({
        trigger: a, start: 'top 88%', end: 'max', once: true,
        onEnter: function () { gsap.to(a, { strokeDashoffset: 1 - f, duration: 2.4, ease: 'power3.out' }); }
      });
    });

    /* galerie : révélation par masque + image qui bouge dans son cadre */
    $$('.gfig').forEach(function (fig) {
      var frame = $('.gfig__in', fig), img = $('img', fig);
      gsap.from(frame, { clipPath: 'inset(100% 0% 0% 0%)', duration: 1.3, ease: 'power4.out', scrollTrigger: { trigger: fig, start: 'top 90%', end: 'max', once: true } });
      gsap.from(img, { scale: 1.35, duration: 1.8, ease: 'power3.out', scrollTrigger: { trigger: fig, start: 'top 90%', end: 'max', once: true } });
      gsap.fromTo(img, { yPercent: -6 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: true } });
    });

    /* réservation : la vidéo respire */
    gsap.fromTo('.booking__video', { scale: 1.15 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.booking', start: 'top bottom', end: 'bottom top', scrub: true } });

    /* pied de page : le grand nom monte lettre par lettre */
    var giant = $('#footGiant');
    if (giant) {
      var gChars = [];
      $$('span', giant).forEach(function (s) { if (!s.__chars) { var c = []; splitNode(s, c); s.__chars = c; } gChars = gChars.concat(s.__chars); });
      gsap.from(gChars, { yPercent: 110, duration: 1.4, ease: 'power4.out', stagger: .06, scrollTrigger: { trigger: giant, start: 'top 95%', end: 'max', once: true } });
    }

    /* marquee réactif au scroll */
    var track = $('#marqueeTrack');
    if (track) {
      var group = track.firstElementChild;
      if (track.children.length < 4) { for (var i = 0; i < 3; i++) track.appendChild(group.cloneNode(true)); }
      var gw = group.getBoundingClientRect().width, x = 0, heading = 1, vel = 0, inView = false;
      var onResize = function () { gw = group.getBoundingClientRect().width; };
      window.addEventListener('resize', onResize);
      ScrollTrigger.create({
        start: 0, end: 'max',
        onUpdate: function (self) { vel = self.getVelocity(); if (Math.abs(vel) > 40) heading = vel < 0 ? -1 : 1; }
      });
      ScrollTrigger.create({ trigger: '#marquee', start: 'top bottom', end: 'bottom top', onToggle: function (s) { inView = s.isActive; } });
      var tick = function (time, dt) {
        vel *= .93;
        if (!inView) return;
        var d = dt / 1000, speed = 60 + Math.min(Math.abs(vel), 5000) * .5;
        x -= heading * speed * d;
        if (x <= -gw) x += gw;
        if (x > 0) x -= gw;
        gsap.set(track, { x: x });
      };
      gsap.ticker.add(tick);
      cleanups.push(function () { gsap.ticker.remove(tick); window.removeEventListener('resize', onResize); });
    }

    /* pétales */
    var petals = spawnPetals();
    cleanups.push(function () { petals.forEach(function (t) { t.kill(); }); $$('.petal').forEach(function (p) { p.remove(); }); });
  }

  /* ---------- desktop : sections épinglées, horizontal, tilt, curseur ---------- */
  function desktopAnimations(cleanups) {
    /* STORY épinglée */
    var steps = $$('.step'), shots = $$('.shot'), n = steps.length;
    var noEl = $('#storyNo'), bar = $('#storyBar'), ring = $('.story__ring circle');
    var titleChars = steps.map(function (s) { return splitText($('.step__title', s)); });
    var current = 0, timers = [];
    function setStep(i) {
      if (i === current) return;
      var prev = current; current = i;
      steps.forEach(function (s, k) { s.classList.toggle('is-active', k === i); });
      gsap.fromTo(titleChars[i], { yPercent: 118, rotate: 4 }, { yPercent: 0, rotate: 0, duration: 1.1, ease: 'power4.out', stagger: .018, transformOrigin: '0% 100%', overwrite: true });
      gsap.fromTo($$('.step__no, p', steps[i]), { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: .9, ease: 'power3.out', stagger: .1, overwrite: true });
      shots.forEach(function (sh, k) {
        if (k === i) {
          sh.classList.add('is-active'); sh.style.zIndex = 2;
          gsap.fromTo(sh, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.1, ease: 'power4.inOut', overwrite: true });
          gsap.fromTo($('img,video', sh), { scale: 1.28 }, { scale: 1, duration: 1.9, ease: 'power3.out', overwrite: true });
        } else if (k === prev) {
          sh.style.zIndex = 1;
          timers.push(gsap.delayedCall(1.15, function () { if (current !== k) { sh.classList.remove('is-active'); gsap.set(sh, { clearProps: 'clipPath' }); } }));
        } else { sh.classList.remove('is-active'); gsap.set(sh, { clearProps: 'clipPath' }); }
      });
      noEl.textContent = pad(i + 1);
    }
    gsap.from(titleChars[0], {
      yPercent: 118, rotate: 4, transformOrigin: '0% 100%', duration: 1.2, ease: 'power4.out', stagger: .018,
      scrollTrigger: { trigger: '.story__grid', start: 'top 80%', once: true }
    });
    ScrollTrigger.create({
      trigger: '#storyPin', start: 'top top', end: '+=' + (n * 85) + '%', pin: true, anticipatePin: 1,
      onUpdate: function (self) {
        setStep(Math.min(n - 1, Math.floor(self.progress * n)));
        bar.style.transform = 'scaleX(' + self.progress.toFixed(4) + ')';
        ring.style.strokeDashoffset = (1 - self.progress).toFixed(4);
      }
    });
    cleanups.push(function () {
      timers.forEach(function (t) { t.kill(); });
      steps.forEach(function (s, k) { s.classList.toggle('is-active', k === 0); });
      shots.forEach(function (sh, k) { sh.classList.toggle('is-active', k === 0); sh.style.zIndex = ''; gsap.set(sh, { clearProps: 'clipPath' }); });
      current = 0;
    });

    /* CRÉATIONS : défilement horizontal piloté par le scroll vertical */
    var pin = $('#creaPin'), track = $('#creaTrack');
    var dist = function () { return Math.max(0, track.scrollWidth - window.innerWidth); };
    var tween = gsap.to(track, {
      x: function () { return -dist(); }, ease: 'none',
      scrollTrigger: { trigger: pin, start: 'top top', end: function () { return '+=' + dist(); }, pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1 }
    });
    $$('.card__img img').forEach(function (im) {
      gsap.fromTo(im, { xPercent: -7 }, {
        xPercent: 7, ease: 'none',
        scrollTrigger: { trigger: im.closest('.card'), containerAnimation: tween, start: 'left right', end: 'right left', scrub: true }
      });
    });

    /* GALERIE : colonnes à vitesses différentes */
    $$('.gal__col').forEach(function (col) {
      var s = (+col.dataset.speed || 0) * 2;
      gsap.fromTo(col, { y: -s / 2 }, { y: s / 2, ease: 'none', scrollTrigger: { trigger: '#gal', start: 'top bottom', end: 'bottom top', scrub: true } });
    });
  }

  /* ---------- mobile : titres des étapes animés au scroll (déjà géré) ---------- */

  /* ---------- interactions souris (hors GSAP matchMedia) ---------- */
  function setupPointerFx() {
    if (!finePointer) return;

    /* tilt 3D + reflet */
    $$('.tilt').forEach(function (el) {
      var raf = 0, max = el.classList.contains('card') ? 9 : 6;
      el.addEventListener('pointerenter', function () { if (!html.classList.contains('static-mode')) el.classList.add('is-tilting'); });
      el.addEventListener('pointermove', function (e) {
        if (html.classList.contains('static-mode')) return;
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          el.style.transform = 'perspective(900px) rotateX(' + ((0.5 - py) * max).toFixed(2) + 'deg) rotateY(' + ((px - 0.5) * max * 1.2).toFixed(2) + 'deg)';
          el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
          el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
        });
      });
      el.addEventListener('pointerleave', function () { cancelAnimationFrame(raf); el.classList.remove('is-tilting'); el.style.transform = ''; });
    });

    if (!hasGsap || reduce) return;

    /* boutons magnétiques */
    $$('.magnetic').forEach(function (el) {
      var xTo = gsap.quickTo(el, 'x', { duration: .7, ease: 'elastic.out(1,.55)' });
      var yTo = gsap.quickTo(el, 'y', { duration: .7, ease: 'elastic.out(1,.55)' });
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * .3);
        yTo((e.clientY - (r.top + r.height / 2)) * .4);
      });
      el.addEventListener('pointerleave', function () { xTo(0); yTo(0); });
    });

    /* liste des services : aperçu photo qui suit le curseur */
    var list = $('#svcList'), prev = $('#svcPreview');
    if (list && prev) {
      var pimg = $('img', prev);
      $$('.svc').forEach(function (li) { var i = new Image(); i.src = li.dataset.img; });
      gsap.set(prev, { xPercent: -50, yPercent: -50, scale: .7, rotation: -6 });
      var px = gsap.quickTo(prev, 'x', { duration: .6, ease: 'power3' });
      var py = gsap.quickTo(prev, 'y', { duration: .6, ease: 'power3' });
      var pr = gsap.quickTo(prev, 'rotation', { duration: .5, ease: 'power3' });
      list.addEventListener('pointermove', function (e) {
        var off = e.clientX > window.innerWidth * .6 ? -240 : 240;
        px(e.clientX + off); py(e.clientY);
        pr(gsap.utils.clamp(-12, 12, e.movementX * .6));
      });
      $$('.svc', list).forEach(function (li) {
        li.addEventListener('pointerenter', function () {
          if (html.classList.contains('static-mode')) return;
          pimg.src = li.dataset.img;
          gsap.to(prev, { opacity: 1, scale: 1, duration: .6, ease: 'power3.out', overwrite: 'auto' });
        });
      });
      list.addEventListener('pointerleave', function () { gsap.to(prev, { opacity: 0, scale: .7, duration: .5, ease: 'power3.in', overwrite: 'auto' }); });
    }

    /* curseur */
    var cur = $('#cursor'), lab = $('#cursorLabel');
    if (cur) {
      var cx = gsap.quickTo(cur, 'x', { duration: .25, ease: 'power3' }), cy = gsap.quickTo(cur, 'y', { duration: .25, ease: 'power3' });
      window.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        cur.classList.add('is-on'); cx(e.clientX); cy(e.clientY);
      }, { passive: true });
      document.addEventListener('mouseleave', function () { cur.classList.remove('is-on'); });
      document.addEventListener('pointerover', function (e) {
        var t = e.target;
        var big = t.closest && t.closest('.gfig__btn');
        var link = t.closest && t.closest('a, button, label, summary, .svc');
        cur.classList.toggle('is-big', !!big);
        cur.classList.toggle('is-link', !big && !!link);
        lab.textContent = big ? 'Voir' : '';
      });
    }
  }

  /* ====================================================================== démarrage */
  function showAllStatic() {
    /* mouvement réduit / pas de GSAP : tout est visible, valeurs finales */
    $$('[data-count]').forEach(function (el) {
      var t = parseFloat(el.dataset.count), d = +el.dataset.decimals || 0;
      el.textContent = t.toFixed(d).replace('.', ',');
    });
    $$('.stat__arc').forEach(function (a) { a.style.setProperty('--fill', a.dataset.fill); a.style.strokeDasharray = a.dataset.fill + ' 1'; a.style.strokeDashoffset = '0'; });
    $$('.o__ring circle').forEach(function (c) { c.style.strokeDashoffset = '0'; });
    $$('[data-split-title],[data-split]').forEach(function (el) { el.classList.add('is-split'); });
    $$('[data-reveal]').forEach(function (el) { el.style.opacity = 1; el.style.transform = 'none'; });
    html.classList.remove('is-loading');
    var l = $('#loader'); if (l) l.remove();
  }

  function init() {
    var y = $('#year'); if (y) y.textContent = new Date().getFullYear();
    updateOpen(); setInterval(updateOpen, 60000);
    setupMenu(); setupReviews(); setupLightbox(); setupLazyVideos();
    setupAnchors();

    if (reduce || !hasGsap) {
      showAllStatic();
      /* anchors fonctionnent en natif */
      return;
    }

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    lenis = setupLenis();
    if (lenis) lenis.stop();

    setupNav();
    setupPointerFx();

    /* split des titres du hero (avant le loader pour éviter un flash) */
    $$('.hero [data-split]').forEach(splitText);
    $$('.hero__maison').forEach(function (el) { el.classList.add('is-split'); });

    heroPrep();

    var mm = gsap.matchMedia();
    var cleanups = [];
    function dispose() { cleanups.splice(0).forEach(function (f) { f(); }); }
    mm.add('(min-width: 901px)', function () {
      html.classList.remove('static-mode');
      sharedAnimations(cleanups);
      desktopAnimations(cleanups);
      return dispose;
    });
    mm.add('(max-width: 900px)', function () {
      html.classList.add('static-mode');
      sharedAnimations(cleanups);
      return dispose;
    });

    runLoader(heroIntro);

    var refresh = function () { ScrollTrigger.refresh(); };
    window.addEventListener('load', refresh);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

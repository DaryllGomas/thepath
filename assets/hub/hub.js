/*!
 * BigPic Studios game hub (vanilla, no build step).
 *
 * One shared block for every game page: What's new, Now building, Help us test, and a Report / Request /
 * Feedback form that posts to BigPic Pulse. It renders inside any element like:
 *
 *   <link rel="stylesheet" href="https://studio.bigpicsolutions.com/assets/hub/hub.css">
 *   <section class="game-hub" id="devlog" data-game="the-first-world" data-src="devlog.json" data-version="v0.7"></section>
 *   <script src="https://studio.bigpicsolutions.com/assets/hub/hub.js" defer></script>
 *
 * Attributes
 *   data-game     required. The Pulse project: the-first-world | the-path | beyond-the-nexus | the-junction
 *   data-src      the devlog JSON, relative to the page. Must be same-origin (anything else is refused).
 *   data-version  the build players are on (sent with each report). Falls back to the devlog's "version".
 *   data-title    optional heading for the block (default "Built in the open").
 *   data-level    optional heading level for the block title, 2 (default) to 4; sub-headings go one below.
 *   data-ask-intro optional line under "Help us test" (default "Play a while, then tell us. One line helps.").
 *
 * Theme: set these custom properties on the page (or on .game-hub) to make the block look native.
 *   --hub-accent, --hub-accent-2, --hub-ink, --hub-ink-soft, --hub-ink-dim, --hub-line, --hub-surface,
 *   --hub-surface-2, --hub-page, --hub-font-display, --hub-font-ui, --hub-font-body, --hub-radius,
 *   --hub-ok, --hub-err. Defaults are the studio's gold on dark (see hub.css).
 *
 * devlog.json (text only; public; run tools/hub/check-devlog.mjs on it before every publish)
 *   {
 *     "game":    "the-first-world",          // same as data-game
 *     "title":   "THE FIRST WORLD",           // the game's display name
 *     "version": "v0.7",                      // the current public build
 *     "updated": "2026-10-15",                // YYYY-MM-DD
 *     "now":     ["What we're building", ...],              // 3-6 short lines
 *     "ask":     [{ "q": "A question for players", "hint": "optional detail" }, ...],
 *     "releases": [                                           // newest first
 *       { "version": "v0.7", "date": "2026-10-14", "title": "Name of the update",
 *         "summary": "optional one or two sentences",
 *         "items": ["plain line", { "h": "short lead", "t": "the detail" }, { "group": "A sub-heading" }, ...] }
 *     ]
 *   }
 *   An item { "group": "..." } starts a small sub-heading inside a release (for big updates with several parts).
 *
 * Safety: every string from the devlog or the form is inserted with textContent; nothing is ever parsed as
 * HTML. The only network calls are the same-origin devlog and the public Pulse endpoint below.
 */
(() => {
  'use strict';

  const PULSE = 'https://pulse.bigpicsolutions.com/v1/request';
  const PROJECTS = ['the-first-world', 'the-path', 'beyond-the-nexus', 'the-junction'];
  const MIN = 10, MAX = 4000, NAME_MAX = 80, VERSION_MAX = 24, CONTEXT_MAX = 160;
  const KINDS = [
    { id: 'bug', label: 'Bug', api: 'bug', ph: 'What happened, and what did you expect? Where were you in the game when it happened?',
      icon: 'M8 8.5a4 4 0 0 1 8 0M7 11h10v3.5a5 5 0 0 1-10 0zM12 11v8.5M4 12.5h3M17 12.5h3M5 7.5l2.4 1.8M19 7.5l-2.4 1.8M5 18l2.6-1.5M19 18l-2.6-1.5' },
    { id: 'idea', label: 'Idea', api: 'feature', ph: 'What would make the game better for you? A feature, a change, something you wished you could do.',
      icon: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z' },
    { id: 'feedback', label: 'Feedback', api: 'feedback', ph: 'What did you think? What felt good, what felt off, what stuck with you?',
      icon: 'M4 5.5h16v10H9l-5 4z' },
  ];

  // ---------- tiny DOM helpers (textContent only) ----------
  const h = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  };
  const svg = (d, cls) => {
    const NS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    if (cls) s.setAttribute('class', cls);
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.6'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    s.appendChild(p);
    return s;
  };
  const STAR = 'M12 2.5c.5 5.2 4.3 9 9.5 9.5-5.2.5-9 4.3-9.5 9.5-.5-5.2-4.3-9-9.5-9.5 5.2-.5 9-4.3 9.5-9.5z';
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max || 600) : '');
  const fmtDate = (iso) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return str(iso, 40);
    try { return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }
    catch { return iso; }
  };
  const shortDate = (iso) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return str(iso, 40);
    try { return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); }
    catch { return iso; }
  };
  let uid = 0;
  const id = (p) => `hub-${p}-${++uid}`;

  // ---------- what the report carries: the build, the browser and OS family, and the page path ----------
  const browserName = (ua) =>
    /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
      : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const osName = (ua) =>
    /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows'
      : /CrOS/.test(ua) ? 'ChromeOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
  const context = () => {
    const ua = navigator.userAgent || '';
    return `${browserName(ua)} on ${osName(ua)} · ${location.pathname}`.slice(0, CONTEXT_MAX);
  };
  const visitor = () => {
    if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return undefined;
    try {
      let v = localStorage.getItem('bp_vid');
      if (!v && crypto.randomUUID) { v = crypto.randomUUID(); localStorage.setItem('bp_vid', v); }
      return /^[0-9a-f-]{36}$/i.test(v || '') ? v : undefined;
    } catch { return undefined; }
  };

  // ---------- the devlog: same-origin only ----------
  const loadDevlog = async (src) => {
    if (!src) return null;
    const url = new URL(src, location.href);
    if (url.origin !== location.origin) throw new Error('devlog must be same-origin');
    const r = await fetch(url.href, { cache: 'no-cache', credentials: 'omit' });
    if (!r.ok) throw new Error('devlog ' + r.status);
    const d = await r.json();
    if (!d || typeof d !== 'object') throw new Error('devlog is not an object');
    return d;
  };

  // ---------- sections ----------
  const renderNews = (releases, lvl) => {
    const box = h('div', 'hub-news');
    const head = h('div', 'hub-col-head');
    head.appendChild(h(`h${lvl}`, 'hub-h', "What's new"));
    box.appendChild(head);
    const list = h('ol', 'hub-rels');
    releases.forEach((r, i) => {
      const li = h('li', 'hub-rel' + (i === 0 ? ' is-latest' : ''));
      const det = h('details');
      if (i === 0) det.open = true;
      const sum = h('summary');
      const top = h('span', 'hub-rel-top');
      top.appendChild(h('span', 'hub-ver', str(r.version, 24)));
      if (i === 0) top.appendChild(h('span', 'hub-tag', 'Latest'));
      top.appendChild(h('time', 'hub-date', fmtDate(r.date))).setAttribute('datetime', str(r.date, 10));
      sum.appendChild(top);
      sum.appendChild(h('span', 'hub-rel-title', str(r.title, 120)));
      sum.appendChild(svg('M6 9l6 6 6-6', 'hub-chev'));
      det.appendChild(sum);
      const body = h('div', 'hub-rel-body');
      if (str(r.summary)) body.appendChild(h('p', 'hub-sum', str(r.summary)));
      const items = Array.isArray(r.items) ? r.items : [];
      if (items.length) {
        const ul = h('ul', 'hub-items');
        items.forEach((it) => {
          const li2 = h('li');
          if (it && typeof it === 'object' && str(it.group, 120)) { li2.className = 'hub-group'; li2.textContent = str(it.group, 120); }
          else if (typeof it === 'string') li2.textContent = str(it);
          else if (it && typeof it === 'object') {
            if (str(it.h, 120)) li2.appendChild(h('strong', null, str(it.h, 120)));
            if (str(it.t)) li2.appendChild(h('span', null, str(it.t)));
          }
          if (li2.childNodes.length || li2.textContent) ul.appendChild(li2);
        });
        body.appendChild(ul);
      }
      det.appendChild(body);
      li.appendChild(det);
      list.appendChild(li);
    });
    box.appendChild(list);
    return box;
  };

  const renderNow = (now, lvl) => {
    const card = h('div', 'hub-card hub-now');
    const head = h('div', 'hub-col-head');
    const hh = h(`h${lvl}`, 'hub-h');
    hh.appendChild(h('span', 'hub-live', '')).setAttribute('aria-hidden', 'true');
    hh.appendChild(document.createTextNode('Now building'));
    head.appendChild(hh);
    card.appendChild(head);
    const ul = h('ul', 'hub-now-list');
    now.forEach((t) => { const li = h('li'); li.appendChild(svg(STAR, 'hub-star')); li.appendChild(h('span', null, str(t, 240))); ul.appendChild(li); });
    card.appendChild(ul);
    return card;
  };

  const renderAsk = (asks, lvl, onAnswer, intro) => {
    const card = h('div', 'hub-card hub-ask');
    const head = h('div', 'hub-col-head');
    head.appendChild(h(`h${lvl}`, 'hub-h', 'Help us test'));
    head.appendChild(h('p', 'hub-col-sub', intro || 'Play a while, then tell us. One line helps.'));
    card.appendChild(head);
    const ol = h('ol', 'hub-asks');
    asks.forEach((a, i) => {
      const q = str(a && a.q, 200);
      if (!q) return;
      const li = h('li', 'hub-askq');
      li.appendChild(h('span', 'hub-askn', String(i + 1).padStart(2, '0'))).setAttribute('aria-hidden', 'true');
      const tx = h('div', 'hub-asktx');
      tx.appendChild(h('p', 'hub-q', q));
      if (str(a.hint, 240)) tx.appendChild(h('p', 'hub-hint', str(a.hint, 240)));
      const b = h('button', 'hub-answer');
      b.type = 'button';
      b.appendChild(h('span', null, 'Answer this'));
      b.appendChild(svg('M5 12h14M13 6l6 6-6 6'));
      b.setAttribute('aria-label', 'Answer this: ' + q);
      b.addEventListener('click', () => onAnswer(q));
      tx.appendChild(b);
      li.appendChild(tx);
      ol.appendChild(li);
    });
    card.appendChild(ol);
    return card;
  };

  const renderForm = (root, game, version, lvl, gameTitle) => {
    const wrap = h('div', 'hub-form-wrap');
    wrap.id = (root.id || 'hub') + '-feedback';
    const form = h('form', 'hub-form');
    form.noValidate = true;
    form.setAttribute('aria-labelledby', wrap.id + '-h');

    const head = h('div', 'hub-form-head');
    const fh = h(`h${lvl}`, 'hub-h hub-form-h', 'Report a bug · Request a feature · Say anything');
    fh.id = wrap.id + '-h';
    head.appendChild(fh);
    head.appendChild(h('p', 'hub-col-sub', `It goes straight to the person making ${gameTitle || 'the game'}. Every message gets read.`));
    form.appendChild(head);

    // kind: three radios that look like a segmented switch
    const fs = h('fieldset', 'hub-kinds');
    fs.appendChild(h('legend', 'hub-sr', 'What kind of message?'));
    const seg = h('div', 'hub-seg');
    const radios = {};
    KINDS.forEach((k, i) => {
      const rid = id('kind');
      const inp = h('input');
      inp.type = 'radio'; inp.name = 'kind'; inp.value = k.id; inp.id = rid;
      if (k.id === 'feedback') inp.checked = true;
      const lab = h('label');
      lab.htmlFor = rid;
      lab.appendChild(svg(k.icon));
      lab.appendChild(h('span', null, k.label));
      seg.appendChild(inp); seg.appendChild(lab);
      radios[k.id] = inp;
      if (i === KINDS.length - 1) seg.appendChild(h('span', 'hub-seg-thumb')).setAttribute('aria-hidden', 'true');
    });
    fs.appendChild(seg);
    form.appendChild(fs);

    // message
    const mid = id('msg');
    const mf = h('div', 'hub-field hub-field-msg');
    const ml = h('label', 'hub-label', 'Your message');
    ml.htmlFor = mid;
    const ta = h('textarea', 'hub-input');
    ta.id = mid; ta.name = 'message'; ta.rows = 6; ta.maxLength = MAX; ta.required = true;
    ta.setAttribute('aria-required', 'true');
    const meta = h('div', 'hub-msg-meta');
    const err = h('p', 'hub-err');
    err.id = id('msgerr');
    const count = h('span', 'hub-count', `0 / ${MAX}`);
    count.setAttribute('aria-hidden', 'true');
    meta.appendChild(err); meta.appendChild(count);
    ta.setAttribute('aria-describedby', err.id);
    mf.appendChild(ml); mf.appendChild(ta); mf.appendChild(meta);
    form.appendChild(mf);

    // name + email (both optional)
    const row = h('div', 'hub-row');
    const nid = id('name'), eid = id('email'), ehint = id('ehint'), eerr = id('eerr');
    const nf = h('div', 'hub-field');
    const nl = h('label', 'hub-label');
    nl.htmlFor = nid; nl.appendChild(document.createTextNode('Name ')); nl.appendChild(h('span', 'hub-opt', 'optional'));
    const ni = h('input', 'hub-input');
    ni.id = nid; ni.name = 'name'; ni.type = 'text'; ni.maxLength = NAME_MAX; ni.autocomplete = 'nickname';
    nf.appendChild(nl); nf.appendChild(ni);
    const ef = h('div', 'hub-field');
    const el = h('label', 'hub-label');
    el.htmlFor = eid; el.appendChild(document.createTextNode('Email ')); el.appendChild(h('span', 'hub-opt', 'optional'));
    const ei = h('input', 'hub-input');
    ei.id = eid; ei.name = 'email'; ei.type = 'email'; ei.maxLength = 254; ei.autocomplete = 'email'; ei.inputMode = 'email';
    const eh = h('p', 'hub-hint2', 'Only to reply to you. Never shown, never shared.');
    eh.id = ehint;
    const ee = h('p', 'hub-err');
    ee.id = eerr;
    ei.setAttribute('aria-describedby', `${ehint} ${eerr}`);
    ef.appendChild(el); ef.appendChild(ei); ef.appendChild(eh); ef.appendChild(ee);
    row.appendChild(nf); row.appendChild(ef);
    form.appendChild(row);

    // honeypot: people never see it; bots fill it and the server drops them
    const hp = h('div', 'hub-hp');
    hp.setAttribute('aria-hidden', 'true');
    const hpl = h('label', null, 'Website');
    const hpi = h('input');
    hpi.type = 'text'; hpi.name = 'website'; hpi.tabIndex = -1; hpi.autocomplete = 'off';
    hpl.appendChild(hpi); hp.appendChild(hpl);
    form.appendChild(hp);

    // footer: what gets sent, and the button
    const foot = h('div', 'hub-form-foot');
    const sent = h('p', 'hub-sent-with');
    sent.appendChild(h('span', 'hub-sent-k', 'Sent with it: '));
    sent.appendChild(h('span', null, [version, context()].filter(Boolean).join(' · ')));
    const btn = h('button', 'hub-send');
    btn.type = 'submit';
    const btnLabel = h('span', null, 'Send to the dev');
    btn.appendChild(btnLabel);
    btn.appendChild(svg('M4 12l16-8-6 16-2.5-6.5z'));
    foot.appendChild(sent); foot.appendChild(btn);
    form.appendChild(foot);

    const status = h('p', 'hub-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    form.appendChild(status);

    // success panel
    const done = h('div', 'hub-done');
    done.hidden = true;
    done.tabIndex = -1;
    const ring = h('div', 'hub-done-mark');
    ring.appendChild(svg('M6 12.5l4 4 8-9'));
    done.appendChild(ring);
    const dh = h('p', 'hub-done-h', 'Got it. Thank you.');
    const dt = h('p', 'hub-done-t', '');
    const again = h('button', 'hub-again', 'Send another');
    again.type = 'button';
    done.appendChild(dh); done.appendChild(dt); done.appendChild(again);

    wrap.appendChild(form);
    wrap.appendChild(done);

    // behaviour
    const kindNow = () => KINDS.find((k) => radios[k.id].checked) || KINDS[2];
    const setKind = (k) => { ta.placeholder = k.ph; seg.dataset.kind = k.id; };
    KINDS.forEach((k) => radios[k.id].addEventListener('change', () => setKind(k)));
    setKind(kindNow());
    const upd = () => {
      const n = ta.value.trim().length;
      count.textContent = `${ta.value.length} / ${MAX}`;
      count.classList.toggle('is-low', n > 0 && n < MIN);
      if (n >= MIN && ta.getAttribute('aria-invalid') === 'true') { ta.removeAttribute('aria-invalid'); err.textContent = ''; }
    };
    ta.addEventListener('input', upd);
    ei.addEventListener('input', () => { if (ei.getAttribute('aria-invalid') === 'true') { ei.removeAttribute('aria-invalid'); ee.textContent = ''; } });
    const say = (msg, kind) => { status.textContent = msg; status.className = 'hub-status' + (kind ? ' is-' + kind : ''); };
    let busy = false;
    const setBusy = (on) => {
      busy = on; btn.disabled = on; form.setAttribute('aria-busy', String(on));
      btnLabel.textContent = on ? 'Sending…' : 'Send to the dev';
      wrap.classList.toggle('is-sending', on);
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      say('');
      const message = ta.value.trim(), name = ni.value.trim().slice(0, NAME_MAX), email = ei.value.trim();
      let bad = null;
      if (message.length < MIN) {
        ta.setAttribute('aria-invalid', 'true');
        err.textContent = message.length ? `A little more, please: at least ${MIN} characters.` : 'Write a sentence or two first.';
        bad = bad || ta;
      }
      if (email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
        ei.setAttribute('aria-invalid', 'true');
        ee.textContent = 'That email doesn’t look right. Fix it, or leave it empty.';
        bad = bad || ei;
      }
      if (bad) { say('Check the highlighted field.', 'err'); bad.focus(); return; }
      if (!PROJECTS.includes(game)) { say('This page isn’t set up for feedback yet.', 'err'); return; }

      const k = kindNow();
      const body = { kind: k.api, project: game, message: message.slice(0, MAX), name, email,
        version: (version || '').slice(0, VERSION_MAX), context: context(), website: hpi.value };
      const v = visitor();
      if (v) body.visitor = v;

      setBusy(true);
      try {
        const r = await fetch(PULSE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin' });
        let d = null;
        try { d = await r.json(); } catch { /* not JSON */ }
        if (r.ok && d && d.ok) {
          const words = { bug: 'We’ll look into it.', idea: 'It’s on the list to think about.', feedback: 'It helps more than you know.' };
          dt.textContent = words[k.id] + (email ? ' If there’s a question, we’ll write back.' : '');
          form.hidden = true; done.hidden = false; done.focus();
          ta.value = ''; upd();
          root.dispatchEvent(new CustomEvent('hub:sent', { bubbles: true, detail: { kind: k.api, project: game } }));
        } else if (r.status === 429) {
          say('That’s a lot at once. Give it a minute, then send again. Your message is still here.', 'err');
        } else if (r.status === 400) {
          say('Something in the form needs a look: a message of 10 to 4000 characters, and a valid email or none.', 'err');
        } else {
          say('The studio didn’t answer just now. Your message is still here; try again in a moment.', 'err');
        }
      } catch {
        say('Couldn’t reach the studio. Check your connection; your message is still here.', 'err');
      } finally {
        setBusy(false);
      }
    });
    again.addEventListener('click', () => { done.hidden = true; form.hidden = false; say(''); ta.focus(); });

    const prefill = (q) => {
      radios.feedback.checked = true; setKind(KINDS[2]);
      if (!done.hidden) { done.hidden = true; form.hidden = false; }
      const lead = `About “${q}”\n\n`;
      if (!ta.value.startsWith(lead)) ta.value = lead + ta.value.replace(/^About “[^”]*”\n\n/, '');
      upd();
      wrap.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      setTimeout(() => { ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); }, 380);
      wrap.classList.remove('is-flash'); void wrap.offsetWidth; wrap.classList.add('is-flash');
    };
    return { el: wrap, prefill };
  };

  // ---------- mount ----------
  const mount = async (root) => {
    if (root.dataset.hubMounted) return;
    root.dataset.hubMounted = '1';
    const game = root.dataset.game || '';
    const lvl = Math.min(4, Math.max(2, parseInt(root.dataset.level || '2', 10) || 2));
    const sub = Math.min(6, lvl + 1);
    root.textContent = '';
    root.classList.add('hub-ready');

    let log = null, logErr = false;
    try { log = await loadDevlog(root.dataset.src); } catch { logErr = true; }
    if (log && log.game && log.game !== game) log = null; // a devlog for another game is never shown
    const version = str(root.dataset.version || (log && log.version), VERSION_MAX);
    const gameTitle = str(log && log.title, 60);

    // head
    const head = h('header', 'hub-head');
    const eb = h('p', 'hub-eyebrow');
    eb.appendChild(svg(STAR, 'hub-star'));
    eb.appendChild(document.createTextNode('The devlog'));
    head.appendChild(eb);
    head.appendChild(h(`h${lvl}`, 'hub-title', str(root.dataset.title, 80) || 'Built in the open'));
    head.appendChild(h('p', 'hub-lede', 'What changed, what we’re making right now, and a straight line to the dev. Found a bug? Got an idea? Tell us.'));
    const pills = h('div', 'hub-pills');
    if (version) { const p = h('span', 'hub-pill is-live'); p.appendChild(h('i')); p.appendChild(h('span', null, `Live build ${version}`)); pills.appendChild(p); }
    if (log && str(log.updated, 10)) pills.appendChild(h('span', 'hub-pill', `Updated ${shortDate(log.updated)}`));
    head.appendChild(pills);
    root.appendChild(head);

    const form = renderForm(root, game, version, sub, gameTitle);
    const grid = h('div', 'hub-grid');
    const releases = log && Array.isArray(log.releases) ? log.releases.filter((r) => r && typeof r === 'object') : [];
    if (releases.length) grid.appendChild(renderNews(releases, sub));
    else {
      const box = h('div', 'hub-news hub-empty');
      box.appendChild(h('p', null, logErr ? 'The devlog didn’t load. The form below still works.' : 'The first entry is on its way.'));
      grid.appendChild(box);
    }
    const side = h('aside', 'hub-side');
    side.setAttribute('aria-label', 'In progress');
    const now = log && Array.isArray(log.now) ? log.now.filter((t) => typeof t === 'string' && t.trim()).slice(0, 8) : [];
    const asks = log && Array.isArray(log.ask) ? log.ask.filter((a) => a && typeof a.q === 'string').slice(0, 8) : [];
    if (now.length) side.appendChild(renderNow(now, sub));
    if (asks.length) side.appendChild(renderAsk(asks, sub, form.prefill, str(root.dataset.askIntro, 160)));
    if (side.childNodes.length) grid.appendChild(side);
    else grid.classList.add('is-single');
    root.appendChild(grid);
    root.appendChild(form.el);
  };

  const start = () => document.querySelectorAll('.game-hub[data-game]').forEach(mount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

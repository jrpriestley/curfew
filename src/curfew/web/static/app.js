// curfew's page script. Everything here is an enhancement: without it every
// form still posts and the server answers with a fresh page.
//
// With it, forms post in the background and the page swaps in just its
// <main> and top bar from the server's answer (the same HTML a reload would
// bring), so there's no flash and no jump; links that only change the view
// of this page (a range, a sort) load the same way; the page also refreshes itself
// every 30 s while nobody is mid-edit. Elements marked data-keep (the live
// chart) survive swaps with their state.
//
// Motion: what changed is shown changing (numbers count, a status that
// moved flashes, charts grow when their view changes), live figures poll in
// the background, and clocks tick. All of it stops for "reduce motion".

var busy = false;
var calm = window.matchMedia('(prefers-reduced-motion: reduce)');

// ---------------------------------------------------------------- helpers --

function closeInfo() {
  document.querySelectorAll('.info.open').forEach(function (info) {
    info.classList.remove('open');
    info.querySelector('.info-btn').setAttribute('aria-expanded', 'false');
  });
}

// The pop-up sits in tables that scroll sideways, which would clip it, so it
// is placed against the window instead: beside the ⓘ, kept on screen.
function placeInfo(info) {
  var pop = info.querySelector('.info-pop');
  var at = info.querySelector('.info-btn').getBoundingClientRect();
  var size = pop.getBoundingClientRect();
  var left = Math.min(at.right + 4, window.innerWidth - size.width - 8);
  var top = Math.min(at.top - 4, window.innerHeight - size.height - 8);
  pop.style.position = 'fixed';
  pop.style.left = Math.max(8, left) + 'px';
  pop.style.top = Math.max(8, top) + 'px';
}

// Info pop-up: hover or focus shows it; a tap toggles it (touch has no hover).
function bindInfo(root) {
  root.querySelectorAll('.info').forEach(function (info) {
    var button = info.querySelector('.info-btn');
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      var open = !info.classList.contains('open');
      closeInfo();
      info.classList.toggle('open', open);
      button.setAttribute('aria-expanded', String(open));
      if (open) { placeInfo(info); }
    });
    info.addEventListener('mouseenter', function () { placeInfo(info); });
    info.addEventListener('focusin', function () { placeInfo(info); });
  });
}

// Device rows open to the row under them (facts, controls, the page link):
// by their ▸, or a click anywhere on the row but its own controls. Which
// are open is kept by MAC, so a refresh or an action leaves them open.
var openRows = {};

function setRow(row, open) {
  var button = row.querySelector('button.more');
  var more = document.getElementById(button.getAttribute('aria-controls'));
  openRows[row.dataset.key] = open;
  button.setAttribute('aria-expanded', String(open));
  row.classList.toggle('open', open);
  more.hidden = !open || row.hidden;
}

function bindRows(root) {
  root.querySelectorAll('tr.dev-row').forEach(function (row) {
    row.querySelector('button.more').addEventListener('click', function () {
      setRow(row, !openRows[row.dataset.key]);
    });
    row.addEventListener('click', function (event) {
      if (event.target.closest('a, button, input, select, label, form')) { return; }
      setRow(row, !openRows[row.dataset.key]);
    });
    if (openRows[row.dataset.key]) { setRow(row, true); }
  });
}

// What a device can be found by: its row and its facts (IP, MAC, maker). Not its opened
// row's controls: the menus there name every profile on every device.
function deviceText(row) {
  var more = row.nextElementSibling;
  var facts = more && more.classList.contains('dev-more') ? more.querySelector('.device-facts') : null;
  return row.textContent + ' ' + (facts ? facts.textContent : '');
}

// By the filter's text and the type chosen beside it, together.
function applyFilter() {
  var filter = document.getElementById('filter'), types = document.getElementById('type-filter');
  var needle = filter ? filter.value.trim().toLowerCase() : '', kind = types ? types.value : '';
  var group = null, groupShown = false, groupMatches = false;
  function closeGroup() { if (group) { group.hidden = !groupShown; } }
  function matches(text) { return !needle || text.toLowerCase().indexOf(needle) >= 0; }
  document.querySelectorAll('.device-list tbody tr').forEach(function (row) {
    // Profile headings stay while any device under them still matches.
    if (row.classList.contains('group')) {
      closeGroup();
      group = row;
      groupMatches = matches(row.textContent);
      groupShown = groupMatches && !kind;
      return;
    }
    if (row.classList.contains('dev-more')) { return; }  // follows its device row
    row.hidden = (kind && row.dataset.kind !== kind) || (!groupMatches && !matches(deviceText(row)));
    if (row.classList.contains('dev-row')) { setRow(row, !!openRows[row.dataset.key]); }
    if (!row.hidden) { groupShown = true; }
  });
  closeGroup();
}

// Folds (collapsible sections) remember how they were left, in a cookie the
// server reads, so the page arrives already open or shut: no jump.
document.addEventListener('toggle', function (event) {
  var key = event.target.getAttribute && event.target.getAttribute('data-fold');
  if (!key) { return; }
  var folds = {};
  var saved = (document.cookie.match(/(?:^|; )curfew_folds=([^;]*)/) || [])[1] || '';
  saved.split('/').forEach(function (item) {
    var parts = item.split(':');
    if (/^[a-z]+$/i.test(parts[0]) && (parts[1] === '0' || parts[1] === '1')) {
      folds[parts[0]] = parts[1];
    }
  });
  folds[key] = event.target.open ? '1' : '0';
  var value = Object.keys(folds).map(function (name) { return name + ':' + folds[name]; });
  document.cookie = 'curfew_folds=' + value.join('/') +
    '; Path=/; Max-Age=31536000; Secure; SameSite=Lax';
}, true);

// ---------------------------------------------------------------- tooltip --

// One tooltip, drawn by the page, that follows the pointer. Hints written as
// SVG <title> or a title attribute become data-tip (an SVG mark keeps the text
// as its accessible label), so the browser's own slow tooltip doesn't double up.
var tip = document.createElement('div');
tip.className = 'tip';
tip.setAttribute('role', 'tooltip');
tip.hidden = true;
document.body.appendChild(tip);

function adoptTips(root) {
  root.querySelectorAll('svg title').forEach(function (title) {
    var owner = title.parentNode;
    owner.setAttribute('data-tip', title.textContent);
    if (owner.tagName.toLowerCase() !== 'svg' || !owner.getAttribute('aria-label')) {
      owner.setAttribute('aria-label', title.textContent);
    }
    title.remove();
  });
  root.querySelectorAll('[title]').forEach(function (element) {
    element.setAttribute('data-tip', element.getAttribute('title'));
    element.removeAttribute('title');
  });
}

function placeTip(x, y) {
  var gap = 14, width = tip.offsetWidth, height = tip.offsetHeight;
  var left = x + gap + width > window.innerWidth - 8 ? x - gap - width : x + gap;
  var top = y + gap + height > window.innerHeight - 8 ? y - gap - height : y + gap;
  tip.style.left = Math.max(8, left) + 'px';
  tip.style.top = Math.max(8, top) + 'px';
}

function showTip(owner, x, y) {
  tip.textContent = owner.getAttribute('data-tip');
  tip.hidden = false;
  placeTip(x, y);
}

document.addEventListener('pointermove', function (event) {
  var owner = event.target.closest && event.target.closest('[data-tip]');
  if (!owner) { tip.hidden = true; return; }
  if (tip.hidden || tip.textContent !== owner.getAttribute('data-tip')) {
    showTip(owner, event.clientX, event.clientY);
  } else {
    placeTip(event.clientX, event.clientY);
  }
});
document.addEventListener('pointerleave', function () { tip.hidden = true; });
document.addEventListener('scroll', function () { tip.hidden = true; }, true);
// Keyboard: a focused mark (a constellation dot) shows its tip beside it.
document.addEventListener('focusin', function (event) {
  var owner = event.target.closest && event.target.closest('[data-tip]');
  if (!owner) { return; }
  var box = owner.getBoundingClientRect();
  showTip(owner, box.right, box.top);
});
document.addEventListener('focusout', function () { tip.hidden = true; });
// An open menu (the theme's) shuts on a press anywhere else.
document.addEventListener('pointerdown', function (event) {
  document.querySelectorAll('details.theme-menu[open]').forEach(function (menu) {
    if (!menu.contains(event.target)) { menu.open = false; }
  });
});

// A drop-down's (or a box's) Save button shows only once it's changed. (Not saved as it's chosen:
// the arrow keys go through every choice between.)
function bindPicks(root) {
  root.querySelectorAll('form.pick').forEach(function (form) {
    var box = form.querySelector('select, input:not([type=hidden])'), saved = box.value;
    form.classList.add('ready');
    box.addEventListener('input', function () {
      form.classList.toggle('edited', box.value !== saved);
    });
  });
}

// Bind the page's small behaviours inside root (the document, or a swapped-in
// <main>); safe to run again on new content.
function enhance(root) {
  adoptTips(root);
  var filter = root.querySelector('#filter');
  if (filter) {
    var types = root.querySelector('#type-filter');
    filter.addEventListener('input', applyFilter);
    types.addEventListener('change', function () {
      types.blur();  // while a menu has the focus the page doesn't refresh
      applyFilter();
    });
    if (filter.value || types.value) { applyFilter(); }
  }
  bindInfo(root);
  bindRows(root);
  bindPicks(root);
  // TV Settings: the remote starts on the choice in use.
  var chosen = root.querySelector('.tv-option[aria-pressed=true]');
  if (chosen) { chosen.focus(); }
  // On narrow screens wide charts scroll; open them with "now" in view.
  root.querySelectorAll('.chart-wrap').forEach(function (wrap) {
    var chart = wrap.querySelector('[data-now]');
    if (chart && wrap.scrollWidth > wrap.clientWidth) {
      var at = parseFloat(chart.dataset.now) * wrap.scrollWidth;
      wrap.scrollLeft = Math.max(0, at - wrap.clientWidth / 2);
    }
  });
  // Inline rename: the pencil swaps the name for its form; Esc puts it back.
  root.querySelectorAll('.namebox').forEach(function (box) {
    var shown = box.querySelector('.shown');
    var form = box.querySelector('form.rename');
    var input = form.querySelector('input[name=name]');
    function edit(on) {
      shown.hidden = on;
      form.hidden = !on;
      if (on) { input.focus(); input.select(); }
    }
    box.querySelector('button.edit').addEventListener('click', function () { edit(true); });
    form.querySelector('.cancel').addEventListener('click', function () { edit(false); });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { input.value = input.defaultValue; edit(false); }
    });
  });
  root.querySelectorAll('svg[data-cross]').forEach(addCrosshair);
  root.querySelectorAll('.toast').forEach(function (toast) {
    // It stays while the pointer or focus is on it, so Undo can't vanish under you.
    var leave = function () {
      if (!toast.matches(':hover, :focus-within')) { toast.remove(); }
      else { setTimeout(leave, 2000); }
    };
    setTimeout(leave, 8000);
  });
  startLive(root);
  placeSky();
  tick();
  // The theme menu: shows which one is in force (the server sets data-theme).
  var theme = document.documentElement.getAttribute('data-theme') || 'system';
  document.querySelectorAll('.theme-list button').forEach(function (button) {
    button.setAttribute('aria-pressed', String(button.value === theme));
  });
}


// ------------------------------------------------------------ swapping in --

// Which view a URL shows: the page and its subject (a device, a profile),
// not its options. A swap within one view keeps the scroll position.
function view(url) {
  var parsed = new URL(url, location.href);
  return parsed.pathname + '|' + ['mac', 'id', 'profile'].map(function (key) {
    return parsed.searchParams.get(key) || '';
  }).join('|');
}

// What a swap compares, before and after, to show what changed.
function snapshot(main) {
  var state = {keys: {}, numbers: [], charts: [], stars: null};
  main.querySelectorAll('[data-key]').forEach(function (item) {
    state.keys[item.getAttribute('data-key')] = signature(item);
  });
  main.querySelectorAll(NUMBERS).forEach(function (item) { state.numbers.push(item.textContent); });
  main.querySelectorAll(CHARTS).forEach(function (chart) { state.charts.push(chart.outerHTML); });
  var sky = main.querySelector('svg.constellation');
  if (sky) {
    state.stars = {};
    sky.querySelectorAll('a[data-mac]').forEach(function (star) {
      state.stars[star.getAttribute('data-mac')] = true;
    });
  }
  return state;
}

var NUMBERS = '.tile-value, .facts dd, .legend strong:not([data-read]), .bar-value, ' +
  '.ring-value, .pihole-top strong';
var CHARTS = 'svg.usage-chart, svg.quality-chart, svg.rhythm, svg.calendar, svg.timeline';

// A keyed item's state: its classes and status pills, not text that drifts
// every minute ("3 min ago").
function signature(item) {
  return item.className + '|' + Array.prototype.map.call(
    item.querySelectorAll('.pill, .tile-value'), function (part) { return part.textContent; }
  ).join('|');
}

// After a swap: flash keyed items whose state changed, count numbers to their
// new values, grow charts whose view changed, and fly in new devices.
function showChanges(main, before, grow) {
  main.querySelectorAll('[data-key]').forEach(function (item) {
    var was = before.keys[item.getAttribute('data-key')];
    if (was !== undefined && was !== signature(item) && !item.classList.contains('tile')) {
      replay(item, 'changed');
    }
  });
  var numbers = main.querySelectorAll(NUMBERS);
  if (numbers.length === before.numbers.length) {
    numbers.forEach(function (item, index) { countTo(item, before.numbers[index]); });
  }
  if (grow) {
    main.querySelectorAll(CHARTS).forEach(function (chart, index) {
      if (chart.outerHTML !== before.charts[index]) { replay(chart, 'grow'); }
    });
  }
  if (before.stars) {
    main.querySelectorAll('svg.constellation a[data-mac]').forEach(function (star) {
      if (!before.stars[star.getAttribute('data-mac')]) { replay(star, 'arrive'); }
    });
  }
}

// Run a one-off CSS animation (a class), then take the class off again.
function replay(element, name) {
  if (calm.matches) { return; }
  element.classList.add(name);
  setTimeout(function () { element.classList.remove(name); }, 1600);
}

// Count a figure from its old value to its new one ("1.2 GB" to "1.4 GB"),
// when both are a number in the same unit.
function countTo(item, oldText) {
  var pattern = /^([\d.,]+)(\s*\D*)$/;
  var now = item.textContent.trim().match(pattern), was = oldText.trim().match(pattern);
  if (calm.matches || !now || !was || now[2] !== was[2] || now[1] === was[1]) { return; }
  var from = parseFloat(was[1].replace(/,/g, '')), to = parseFloat(now[1].replace(/,/g, ''));
  var places = (now[1].split('.')[1] || '').length, unit = now[2], started = null;
  var grouped = now[1].indexOf(',') >= 0;  // 12,345
  function step(time) {
    started = started || time;
    var done = Math.min(1, (time - started) / 700);
    var eased = 1 - Math.pow(1 - done, 3);
    var value = from + (to - from) * eased;
    item.textContent = (grouped ? Math.round(value).toLocaleString('en-US')
      : value.toFixed(places)) + unit;
    if (done < 1) { requestAnimationFrame(step); }
  }
  requestAnimationFrame(step);
}

// Put a server page's <main> and top bar in place of ours. Anything that
// isn't a signed-in page (the login page, an error) loads normally instead.
// The same view stays where it was scrolled to; another starts at the top.
// ``moved`` (a link, a form, Back) cross-fades the page and grows its charts;
// the quiet refresh only shows what changed.
function swapIn(html, url, push, moved) {
  var doc = new DOMParser().parseFromString(html, 'text/html');
  var freshMain = doc.querySelector('main'), freshBar = doc.querySelector('header.topbar');
  var main = document.querySelector('main'), bar = document.querySelector('header.topbar');
  if (!freshMain || !freshBar || !main || !bar) { location.assign(url); return; }
  var sameView = view(url) === view(location.href);
  function update() {
    // A live panel survives the swap (with its history) if it shows the same feed.
    freshMain.querySelectorAll('[data-keep][id]').forEach(function (fresh) {
      var kept = document.getElementById(fresh.id);
      if (kept && kept.getAttribute('data-src') === fresh.getAttribute('data-src')) {
        fresh.replaceWith(kept);
      }
    });
    var filter = document.getElementById('filter');
    var needle = filter ? filter.value : '';
    var types = document.getElementById('type-filter');
    var kind = types ? types.value : '';
    var opened = Array.prototype.map.call(main.querySelectorAll('details'), function (item) {
      return item.open;
    });
    var before = sameView ? snapshot(main) : null;
    var scrolled = window.scrollY;
    arrived();
    main.replaceWith(freshMain);
    bar.replaceWith(freshBar);
    var theme = doc.documentElement.getAttribute('data-theme');
    if (theme) { document.documentElement.setAttribute('data-theme', theme); }
    else { document.documentElement.removeAttribute('data-theme'); }
    document.querySelectorAll('meta[name=theme-color]').forEach(function (meta) { meta.remove(); });
    doc.querySelectorAll('meta[name=theme-color]').forEach(function (meta) {
      document.head.appendChild(meta);
    });
    document.title = doc.title;
    if (push && url !== location.href) { history.pushState(null, '', url); }
    // The same view keeps what was open; another page arrives as the server
    // drew it (folds from their cookie), never with this page's sections.
    var details = freshMain.querySelectorAll('details');
    if (sameView && details.length === opened.length) {
      details.forEach(function (item, index) { item.open = opened[index]; });
    }
    var freshFilter = document.getElementById('filter');
    if (freshFilter && needle) { freshFilter.value = needle; }
    var freshTypes = document.getElementById('type-filter');
    if (freshTypes && kind) {
      freshTypes.value = kind;
      if (!freshTypes.value) { freshTypes.value = ''; }  // none of that type left
    }
    enhance(document);
    window.scrollTo(0, sameView ? scrolled : 0);
    swappedAt = Date.now();
    stopGone();
    if (before) { showChanges(freshMain, before, moved); }
    else if (moved) { freshMain.querySelectorAll(CHARTS).forEach(function (c) { replay(c, 'grow'); }); }
  }
  if (moved && !calm.matches && document.startViewTransition) {
    // Another page slides in (see .moving in app.css); the same page cross-fades.
    var root = document.documentElement;
    root.classList.toggle('moving', !sameView);
    var transition = document.startViewTransition(update);
    transition.finished.finally(function () { root.classList.remove('moving'); });
  } else {
    update();
  }
}

// Say at once that a click registered: light the tab it leads to and run a
// bar along the top until the page arrives (a full load, or a swap, ends it).
function leaving(url) {
  var path = new URL(url, location.href).pathname;
  document.querySelectorAll('nav.primary a').forEach(function (tab) {
    var target = new URL(tab.href).pathname;
    var match = target === '/' ? path === '/' || path === '/profile' : path.indexOf(target) === 0;
    if (match) { tab.setAttribute('aria-current', 'page'); } else { tab.removeAttribute('aria-current'); }
  });
  document.documentElement.classList.add('loading');
}

function arrived() { document.documentElement.classList.remove('loading'); }
window.addEventListener('pageshow', function () {
  arrived();  // Back into a page the browser kept
  // A browser may put the filter's text back on a reload, without an input event.
  var filter = document.getElementById('filter');
  if (filter) { applyFilter(); }
});

// Fetch a page and swap it in; if that fails, load it normally.
function load(url, push) {
  busy = true;
  fetch(url, {credentials: 'same-origin'})
    .then(function (response) { return response.text().then(function (html) {
      if (response.ok) { swapIn(html, response.url, push, true); } else { location.assign(url); }
    }); })
    .catch(function () { location.assign(url); })
    .finally(function () { busy = false; });
}

// Links between pages (the tabs, a device, a profile) and to this page with
// other options (a range, a sort, show all) swap in place: the page stays
// put while the next one loads, then slides in. Files (the CA certificate)
// and anything off-site load normally.
document.addEventListener('click', function (event) {
  var link = event.target.closest && event.target.closest('a[href]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey ||
      event.ctrlKey || event.shiftKey || event.altKey || link.getAttribute('target') ||
      link.hasAttribute('download')) { return; }
  var url = new URL(link.getAttribute('href'), location.href);
  if (url.origin !== location.origin || url.hash || /\.[a-z0-9]+$/i.test(url.pathname)) {
    return;
  }
  event.preventDefault();
  if (view(url.href) !== view(location.href)) { leaving(url.href); }
  load(url.href, true);
});

// Forms post in the background; the server's redirect lands on the page to
// show, which fetch follows. Sign-in and sign-out stay full page loads.
document.addEventListener('submit', function (event) {
  var form = event.target;
  var action = form.getAttribute('action') || '';
  if (form.method !== 'post' || action === '/login' || action === '/logout') { return; }
  event.preventDefault();
  var body = new URLSearchParams(new FormData(form, event.submitter));
  form.setAttribute('aria-busy', 'true');
  busy = true;
  fetch(action, {method: 'POST', body: body, credentials: 'same-origin'})
    .then(function (response) {
      return response.text().then(function (html) {
        if (!response.ok) {
          // A refusal ("Times must be HH:MM ...") is a short page: show its words.
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var message = doc.querySelector('main p');
          window.alert(message ? message.textContent : 'Not saved.');
          return;
        }
        swapIn(html, response.url, true, true);
      });
    })
    .catch(function () { form.submit(); })  // network trouble: fall back to a plain post
    .finally(function () { form.removeAttribute('aria-busy'); busy = false; });
});

// Refresh the page's figures quietly, unless someone is in the middle of something.
function quiet() {
  var active = document.activeElement;
  return !document.hidden && !busy && !document.querySelector('.info.open') &&
    !document.querySelector('form.rename:not([hidden]), form.pick.edited') &&
    !(active && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName));
}

// What refreshes when: the whole page every <main data-every> seconds, and
// panels with their own pace (data-part, a fragment URL; data-every) in
// between. The server sets the intervals ([refresh] in curfew.toml).
var swappedAt = Date.now(), partsDue = {};

function refreshPage() {
  fetch(location.href, {credentials: 'same-origin', cache: 'no-store'})
    .then(function (response) { return response.text().then(function (html) {
      if (response.ok && quiet()) { swapIn(html, response.url, false, false); }
    }); })
    .catch(function () { /* offline for a moment: try again next time */ });
}

function refreshPart(part) {
  fetch(part.dataset.part, {credentials: 'same-origin', cache: 'no-store'})
    .then(function (response) { return response.ok ? response.text() : ''; })
    .then(function (html) {
      var current = document.getElementById(part.id);
      // Not while someone is reading one of its pop-ups: it would snap shut.
      if (!html.trim() || !current || current.querySelector('.info.open')) { return; }
      var holder = document.createElement('div');
      holder.innerHTML = html;
      var fresh = holder.firstElementChild;
      var before = snapshot(current);
      // Rows someone opened (the path's hops) stay open, matched by their key.
      var opened = {};
      current.querySelectorAll('[data-key] > details[open]').forEach(function (item) {
        opened[item.parentNode.dataset.key] = true;
      });
      fresh.querySelectorAll('[data-key] > details').forEach(function (item) {
        if (opened[item.parentNode.dataset.key]) { item.open = true; }
      });
      current.replaceWith(fresh);
      adoptTips(fresh);
      bindInfo(fresh);
      bindRows(fresh);
      showChanges(fresh, before, false);
    })
    .catch(function () { /* try again next time */ });
}

setInterval(function () {
  var main = document.querySelector('main[data-every]');
  if (!main || document.hidden || busy) { return; }
  var now = Date.now();
  if (now - swappedAt >= Number(main.dataset.every) * 1000) {
    swappedAt = now;
    if (quiet()) { refreshPage(); }
    return;
  }
  main.querySelectorAll('[data-part][data-every][id]').forEach(function (part) {
    var due = partsDue[part.id];
    partsDue[part.id] = due && now < due ? due : now + Number(part.dataset.every) * 1000;
    if (due && now >= due) { refreshPart(part); }
  });
}, 1000);

// Back and forward after a background page change: swap that view back in.
window.addEventListener('popstate', function () { load(location.href, false); });

document.addEventListener('click', closeInfo);
window.addEventListener('scroll', closeInfo, true);
document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape') { closeInfo(); }
});

// ----------------------------------------------------------- live figures --

function rate(bits) {
  if (bits >= 1e9) { return (bits / 1e9).toFixed(2) + ' Gbit/s'; }
  if (bits >= 1e6) { return (bits / 1e6).toFixed(bits >= 1e8 ? 0 : 1) + ' Mbit/s'; }
  if (bits >= 1e3) { return (bits / 1e3).toFixed(0) + ' kbit/s'; }
  return Math.round(bits) + ' bit/s';
}

// Bits per second between two counter readings ({t, rx, tx}), or null when a
// counter went backwards (a reset: reconnect, firewall reload) or time didn't move.
function bitRates(now, before) {
  if (!before || now.t <= before.t || now.rx < before.rx || now.tx < before.tx) { return null; }
  var seconds = now.t - before.t;
  return {down: (now.rx - before.rx) * 8 / seconds, up: (now.tx - before.tx) * 8 / seconds};
}

// Every background poll, so they can all pause while the tab is hidden and
// stop once what they feed has left the page (``alive``).
var polls = [];

function poll(url, seconds, alive, handle) {
  var entry = {timer: null, last: null, alive: alive};
  function fetchOnce() {
    if (!alive()) { stop(entry); return; }
    fetch(url, {cache: 'no-store', credentials: 'same-origin'})
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) { handle(data, entry.last); entry.last = data; })
      .catch(function () { handle(null, entry.last); });
  }
  entry.start = function () {
    if (!entry.timer) { fetchOnce(); entry.timer = setInterval(fetchOnce, seconds * 1000); }
  };
  polls.push(entry);
  if (!document.hidden) { entry.start(); }
}

function stop(entry) {
  clearInterval(entry.timer);
  entry.timer = null;
  entry.last = null;
}

function stopGone() {
  polls = polls.filter(function (entry) {
    if (entry.alive()) { return true; }
    stop(entry);
    return false;
  });
}

document.addEventListener('visibilitychange', function () {
  polls.forEach(function (entry) { if (document.hidden) { stop(entry); } else { entry.start(); } });
});

// Start whatever live figures the page has that aren't running yet.
function startLive(root) {
  root.querySelectorAll('.live[data-src]:not([data-running])').forEach(liveChart);
  var stars = document.querySelector('svg.constellation');
  if (stars && !stars.hasAttribute('data-running')) {
    stars.setAttribute('data-running', '');
    poll(stars.dataset.src || '/live.json?devices=1', Number(stars.dataset.every) || 5,
      function () { return document.contains(stars); },
      function (data, before) { lightStars(stars, data, before); });
  }
}

// A live chart: the last two minutes of a feed's throughput as two lines. The
// panel is data-keep, so swaps leave it (and its history) alone.
function liveChart(live) {
  live.setAttribute('data-running', '');
  var liveSvg = live.querySelector('svg');
  var downLine = liveSvg.querySelector('.live-down');
  var upLine = liveSvg.querySelector('.live-up');
  var cross = liveSvg.querySelector('.live-cross');
  var hover = live.querySelector('.live-hover');
  var readDown = live.querySelector('[data-read=down]');
  var readUp = live.querySelector('[data-read=up]');
  function showReadings(down, up) {
    readDown.textContent = down;
    readUp.textContent = up;
  }
  // Geometry comes from the server (render_live_panel), in viewBox units.
  // (Not "top": that name is the window's own.)
  var box = live.dataset.plot.split(' ').map(Number);
  var plotLeft = box[0], plotTop = box[1], plotRight = box[2], plotBottom = box[3];
  var viewWidth = Number(live.dataset.width), points = Number(live.dataset.points);
  var interval = Number(live.dataset.interval);
  var steps = live.dataset.steps.split(' ').map(Number);
  var samples = [], peak = 1e6;
  var ceiling = function (value) {
    var base = Math.pow(10, Math.floor(Math.log10(Math.max(value, 1))));
    for (var i = 0; i < steps.length; i++) {
      if (steps[i] * base >= value) { return steps[i] * base; }
    }
    return 10 * base;
  };
  var xAt = function (index) {
    return plotRight - (samples.length - 1 - index) * (plotRight - plotLeft) / (points - 1);
  };
  var line = function (key) {
    return samples.map(function (sample, index) {
      var y = plotBottom - sample[key] / peak * (plotBottom - plotTop);
      return xAt(index).toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
  };
  var draw = function () {
    peak = ceiling(Math.max.apply(null, samples.map(function (sample) {
      return Math.max(sample.down, sample.up);
    }).concat([1e6])));
    liveSvg.querySelector('.live-top').textContent = rate(peak);
    liveSvg.querySelector('.live-mid').textContent = rate(peak / 2);
    downLine.setAttribute('points', line('down'));
    upLine.setAttribute('points', line('up'));
    var newest = samples[samples.length - 1];
    if (newest) {
      showReadings(rate(newest.down), rate(newest.up));
    }
  };
  poll(live.dataset.src, interval, function () { return document.contains(live); },
    function (data, before) {
      if (!data) {
        showReadings('—', '—');
        return;
      }
      if (data.rx === null) {
        showReadings('offline', '—');
        return;
      }
      var sample = data && bitRates(data, before);
      if (!sample) { return; }
      samples.push(sample);
      if (samples.length > points) { samples.shift(); }
      draw();
    });
  // Crosshair: the nearest sample's values under the pointer.
  liveSvg.querySelector('.live-hit').addEventListener('mousemove', function (event) {
    if (!samples.length) { return; }
    var rect = liveSvg.getBoundingClientRect();
    var x = (event.clientX - rect.left) / rect.width * viewWidth;
    var back = Math.round((plotRight - x) / (plotRight - plotLeft) * (points - 1));
    var index = Math.max(0, Math.min(samples.length - 1, samples.length - 1 - back));
    var at = xAt(index);
    cross.setAttribute('x1', at); cross.setAttribute('x2', at);
    cross.setAttribute('visibility', 'visible');
    var ago = (samples.length - 1 - index) * interval;
    hover.textContent = (ago ? ago + ' s ago' : 'now') + ': download ' +
      rate(samples[index].down) + ', upload ' + rate(samples[index].up);
  });
  liveSvg.querySelector('.live-hit').addEventListener('mouseleave', function () {
    cross.setAttribute('visibility', 'hidden');
    hover.innerHTML = '&nbsp;';
  });
}

// The constellation's online stars glow with what each device moves right now.
function lightStars(stars, data, before) {
  if (!data || !before || !data.devices || data.t <= before.t) { return; }
  var seconds = data.t - before.t;
  stars.querySelectorAll('a[data-mac]').forEach(function (star) {
    var glow = star.querySelector('.glow');
    var now = data.devices[star.getAttribute('data-mac')];
    var was = before.devices && before.devices[star.getAttribute('data-mac')];
    if (!glow || !now || !was || now[0] < was[0] || now[1] < was[1]) { return; }
    var bits = (now[0] - was[0] + now[1] - was[1]) * 8 / seconds;
    // 10 kbit/s and under: a faint glow; 100 Mbit/s: the brightest.
    var level = Math.max(0, Math.min(1, Math.log10(Math.max(bits, 1e4) / 1e4) / 4));
    glow.style.setProperty('--level', level.toFixed(2));
    if (!star.dataset.base) { star.dataset.base = star.getAttribute('data-tip') || ''; }
    star.setAttribute('data-tip', star.dataset.base + ' · now ' + rate(bits));
  });
}

// ------------------------------------------------------------------ clocks --

// Countdowns tick every second and the page reloads when one reaches its
// moment; "now" lines and the sky move with the clock.
function waitText(seconds) {
  var minutes = Math.floor(seconds / 60);
  if (seconds < 60) { return Math.max(0, Math.floor(seconds)) + ' s'; }
  if (minutes < 10) { return minutes + ' min ' + Math.floor(seconds % 60) + ' s'; }
  if (minutes < 60) { return minutes + ' min'; }
  return Math.floor(minutes / 60) + ' h' + (minutes % 60 ? ' ' + (minutes % 60) + ' min' : '');
}

var reloaded = {};  // the moments already reloaded for, so a clock that's ahead can't loop

function tick() {
  var now = new Date();
  document.querySelectorAll('.countdown[data-at]').forEach(function (item) {
    var seconds = Number(item.dataset.at) - now.getTime() / 1000;
    item.querySelector('.cd-text').textContent = waitText(seconds);
    item.classList.toggle('far', seconds > 3600);  // the ring shows in the last hour only
    var left = Math.max(0, Math.min(seconds, 3600)) / 3600;
    item.querySelector('.cd-arc').setAttribute('stroke-dasharray', left.toFixed(3) + ' 1');
    if (seconds <= 0 && !reloaded[item.dataset.at]) {
      reloaded[item.dataset.at] = true;  // the change has happened: show the page as it is now
      setTimeout(function () { load(location.href, false); }, 1500);
    }
  });
  var minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  document.querySelectorAll('.now-line[data-per-min]').forEach(function (line) {
    var x = Number(line.dataset.x0) + minutes * Number(line.dataset.perMin);
    line.setAttribute('x1', x.toFixed(1));
    line.setAttribute('x2', x.toFixed(1));
    if (line.dataset.rowH) {
      var y = Number(line.dataset.y0) + (now.getDay() + 6) % 7 * Number(line.dataset.rowH);
      line.setAttribute('y1', y - 2);
      line.setAttribute('y2', y + Number(line.dataset.rowH) + 2);
    }
  });
}
setInterval(tick, 1000);

// The sun crosses its track in the top bar from dawn to nightfall on an
// arc, low at the ends and highest at midday; the moon crosses it by night.
function placeSky() {
  var body = document.querySelector('.sky-body');
  if (!body) { return; }
  var now = new Date();
  var hours = now.getHours() + now.getMinutes() / 60;
  var up = Number(body.dataset.up), down = Number(body.dataset.down);
  var across = hours >= up && hours < down ? (hours - up) / (down - up)
    : ((hours - down + 24) % 24) / (24 - down + up);
  body.style.setProperty('--across', across.toFixed(4));
  body.style.setProperty('--height', Math.sin(Math.PI * across).toFixed(4));
}
setInterval(placeSky, 60000);

// --------------------------------------------------------------- crosshair --

// History charts: a line follows the pointer to the period under it (whose
// tooltip shows its figures).
function addCrosshair(chart) {
  var span = chart.getAttribute('data-cross').split(' ');
  var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('class', 'crosshair');
  line.setAttribute('y1', span[0]);
  line.setAttribute('y2', span[1]);
  line.setAttribute('visibility', 'hidden');
  chart.appendChild(line);
  chart.addEventListener('pointermove', function (event) {
    var period = event.target.closest && event.target.closest('[data-x]');
    if (!period) { line.setAttribute('visibility', 'hidden'); return; }
    line.setAttribute('x1', period.getAttribute('data-x'));
    line.setAttribute('x2', period.getAttribute('data-x'));
    line.setAttribute('visibility', 'visible');
  });
  chart.addEventListener('pointerleave', function () { line.setAttribute('visibility', 'hidden'); });
}

enhance(document);
document.querySelectorAll(CHARTS).forEach(function (chart) { replay(chart, 'grow'); });

// --------------------------------------------------------------------- TV --
// The TV (/tv) has a remote, not a pointer: left and right walk the tabs (and
// wrap), up and down scroll the page or, on Settings, move between the
// choices, which OK picks (the focused button's own submit).
//
// A tab change shows at once: the highlight moves and pulses while its page
// loads. The page is fetched only once the remote rests (TV_SETTLE), so
// stepping across several tabs loads just the last, and a slower page that
// arrives after another press is dropped. It swaps in without the slide.
var TV_SETTLE = 300, tvTimer = null, tvSeq = 0;

function tvStep(step) {
  var tabs = document.querySelectorAll('nav.primary a'), at = 0;
  tabs.forEach(function (tab, index) { if (tab.hasAttribute('aria-current')) { at = index; } });
  var next = tabs[(at + step + tabs.length) % tabs.length];
  tabs.forEach(function (tab) { tab.removeAttribute('aria-current'); });
  next.setAttribute('aria-current', 'page');
  document.documentElement.classList.add('loading');
  busy = true;  // no background refresh of the page being left
  var seq = ++tvSeq;
  clearTimeout(tvTimer);
  tvTimer = setTimeout(function () {
    fetch(next.href, {credentials: 'same-origin'})
      .then(function (response) { return response.text().then(function (html) {
        if (seq !== tvSeq) { return; }  // the remote moved on: a later tab wins
        busy = false;
        if (response.ok) { swapIn(html, response.url, true, false); } else { location.assign(next.href); }
      }); })
      .catch(function () { if (seq === tvSeq) { location.assign(next.href); } });
  }, TV_SETTLE);
}

// Flow (/flow; /tv/flow on a TV, where it's the screensaver) starts on a TV after <main
// data-saver> minutes without a key (Settings), or with OK; on it, any key goes back where it
// came from.
var tvLastKey = Date.now();
// In the Fire TV app (Android's WebView, "; wv)"), or a computer's browser: there, the
// remote's Menu and Play/Pause (which the app hands over) are Z and Space, and the hint
// names the keyboard's keys.
var tvApp = /; wv\)/.test(navigator.userAgent);

// What Flow keeps on this screen: a TV's is sent only to /tv, any other's only to /flow.
function flowKeep(name, value) {
  document.cookie = name + '=' + value + '; Path=' + (/^\/tv/.test(location.pathname) ? '/tv' : '/flow') +
    '; Max-Age=' + (value ? 31536000 : 0) + '; SameSite=Lax; Secure';
}
function tvFlow() {
  location.assign('/tv/flow?back=' + encodeURIComponent(location.pathname));
}

// Zen (Menu on the remote, which the app hands over): the screensaver with no words and
// no asteroids, its data at a fifth of the speed. Kept on the TV until Menu again; from
// another page, Menu starts the screensaver in it.
function tvZenOn() {
  return /(^|; )curfew_zen=1/.test(document.cookie);
}
function tvZen() {
  var on = !(document.querySelector('main.tv-flow') && tvZenOn());
  flowKeep('curfew_zen', on ? '1' : '');
  document.documentElement.classList.toggle('zen', on);
  if (!document.querySelector('main.tv-flow')) {
    tvFlow();
  }
}
if (document.documentElement.classList.contains('tv-saver') && tvZenOn()) {
  document.documentElement.classList.add('zen');
}

// OK on the screensaver: the next theme, faded to in place, kept for next time.
function tvNextLook() {
  var flow = document.querySelector('main.tv-flow');
  var looks = ['space', 'simple', 'town', 'forest', 'highway'], at = 0;
  looks.forEach(function (each, index) {
    if (flow.classList.contains('flow-' + each)) {
      at = index;
    }
  });
  var look = looks[(at + 1) % looks.length];
  flowKeep('curfew_flow', look);
  var scene = document.getElementById('flow');
  if (scene && scene.switchLook) {
    scene.switchLook(look);
  } else {
    location.reload();
  }
}
// Off the screensaver: back where it came from.
function tvBack() {
  location.assign(document.querySelector('main.tv-flow').dataset.back || '/tv');
}

// Play/Pause on the remote (the app hands it over: the page may never see media
// keys): the screensaver on, or off again.
function tvFlowToggle() {
  var flow = document.querySelector('main.tv-flow');
  if (flow) {
    location.assign(flow.dataset.back || '/tv');
  } else {
    tvFlow();
  }
}

// The TV app's remote on the screensaver: Menu (or z) for zen, up for more sound, down for
// less, left and right for Highway's minimum speed, channel up and down (or fast forward
// and rewind) for its next and previous biome, OK for the next theme, any other key back.
var BIOME_KEYS = {ChannelUp: 1, ChannelDown: -1, PageUp: 1, PageDown: -1, MediaFastForward: 1, MediaRewind: -1};
// By number too, as a WebView may not know their names.
var BIOME_CODES = {427: 'ChannelUp', 428: 'ChannelDown', 166: 'ChannelUp', 167: 'ChannelDown', 33: 'PageUp', 34: 'PageDown'};
function flowKey(key) {
  var highway = document.querySelector('main.flow-highway');
  if (key === 'z' || key === 'Z' || key === 'ContextMenu') {
    tvZen();
  } else if (key === 'ArrowUp' || key === 'ArrowDown') {
    if (window.flowSoundStep) {
      window.flowSoundStep(key === 'ArrowUp' ? 1 : -1);
    }
  } else if ((key === 'ArrowLeft' || key === 'ArrowRight') && highway) {
    window.flowMinSpeed(key === 'ArrowRight' ? 1 : -1);
  } else if (BIOME_KEYS[key]) {
    if (highway) {
      window.flowBiome(BIOME_KEYS[key]);
    }
  } else if (key === 'Enter') {
    tvNextLook();
  } else {
    tvBack();
  }
}
// The last few keys the screensaver was given, for its frame report: what a remote's buttons
// send is found out there.
var flowKeys = [];
function keyName(event) {
  var name = event.key && event.key !== 'Unidentified' ? event.key : BIOME_CODES[event.keyCode] || 'key ' + event.keyCode;
  if (!event.repeat) {
    flowKeys.push(name);
    flowKeys = flowKeys.slice(-8);
  }
  return name;
}

if (document.documentElement.classList.contains('tv-page')) {
  document.addEventListener('keydown', function (event) {
    tvLastKey = Date.now();
    var key = event.key;
    var flow = document.querySelector('main.tv-flow');
    if (flow) {
      // At a computer, only the on-screen controls (flow.js) work the screensaver.
      if (!tvApp) {
        return;
      }
      event.preventDefault();
      flowKey(keyName(event));
      return;
    }
    var options = Array.prototype.slice.call(document.querySelectorAll('main .tv-option'));
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      event.preventDefault();
      tvStep(key === 'ArrowRight' ? 1 : -1);
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
      event.preventDefault();
      var step = key === 'ArrowDown' ? 1 : -1;
      if (options.length) {
        var current = options.indexOf(document.activeElement);
        options[Math.max(0, Math.min(options.length - 1, current + step))].focus();
      } else {
        window.scrollBy(0, step * window.innerHeight * 0.45);
      }
    } else if ((key === 'Enter' && !options.length) || key === 'MediaPlayPause' || key === ' ') {
      event.preventDefault();
      tvFlow();
    } else if (key === 'z' || key === 'Z' || key === 'ContextMenu') {
      event.preventDefault();
      tvZen();
    }
  });
  setInterval(function () {
    var main = document.querySelector('main[data-saver]');
    var minutes = main ? Number(main.dataset.saver) : 0;
    if (minutes && !busy && Date.now() - tvLastKey > minutes * 60000) { tvFlow(); }
  }, 5000);
}

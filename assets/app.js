/* Rennes Control — clock, Rennes weather, STAR departures at Pont de Châteaudun.
 * Plain ES2017 (Safari 12+ / iPad Air 2), no build step. */
(function () {
  'use strict';

  var CONFIG = {
    feedUrl: 'https://proxy.transport.data.gouv.fr/resource/star-rennes-integration-gtfs-rt-trip-update',
    vehiclesUrl: 'https://proxy.transport.data.gouv.fr/resource/star-rennes-integration-gtfs-rt-vehicle-position',
    scheduleUrl: 'data/schedule.json',
    weatherUrl: 'https://api.open-meteo.com/v1/forecast?latitude=48.1113&longitude=-1.6800' +
      '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,precipitation' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&hourly=temperature_2m,precipitation_probability' +
      '&timezone=Europe%2FParis&forecast_days=2',
    feedEverySec: 30,       // STAR feed is regenerated about every 30 s
    weatherEverySec: 900,
    scheduleEverySec: 6 * 3600,
    staleAfterSec: 150,     // feed header older than this: warn
    ignoreAfterSec: 420,    // older than this: stop trusting it, show timetable only
    perLine: 4,
    timeoutMs: 15000
  };
  // Allow ?feed=https://my-proxy/... to route the feed through a self-hosted proxy.
  var qsFeed = /[?&]feed=([^&]+)/.exec(location.search);
  if (qsFeed) CONFIG.feedUrl = decodeURIComponent(qsFeed[1]);

  var TZ = 'Europe/Paris';
  var state = {
    schedule: null, scheduleError: null,
    feed: null, feedFetchedAt: null, feedError: null, feedLoading: true
  };

  function $(id) { return document.getElementById(id); }
  function nowSec() { return Math.floor(Date.now() / 1000); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var fmtHM = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
  var fmtHMS = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  var fmtDate = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  var fmtSec = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, second: '2-digit' });
  function hm(sec) { return fmtHM.format(new Date(sec * 1000)); }
  function hms(sec) { return fmtHMS.format(new Date(sec * 1000)); }

  function ago(sec) {
    if (sec < 60) return 'il y a ' + Math.max(0, sec) + ' s';
    var m = Math.floor(sec / 60);
    return m < 60 ? 'il y a ' + m + ' min' : 'il y a ' + Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
  }

  function fetchWithTimeout(url, opts) {
    opts = opts || {};
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (ctrl) opts.signal = ctrl.signal;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, CONFIG.timeoutMs);
    return fetch(url, opts).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r;
    }, function (e) {
      clearTimeout(timer);
      throw new Error(e && e.name === 'AbortError' ? 'délai dépassé' : 'réseau injoignable');
    });
  }

  /* ── clock ─────────────────────────────────── */
  function tickClock() {
    var d = new Date();
    $('clock').textContent = fmtHM.format(d);
    $('clock-sec').textContent = fmtSec.format(d).replace(/\D/g, '').padStart(2, '0');
    $('date').textContent = fmtDate.format(d);
  }

  /* ── weather (Open-Meteo, no key) ──────────── */
  var WMO = {
    0: 'Ciel clair', 1: 'Plutôt dégagé', 2: 'Partiellement nuageux', 3: 'Couvert',
    45: 'Brouillard', 48: 'Brouillard givrant',
    51: 'Bruine légère', 53: 'Bruine', 55: 'Bruine forte', 56: 'Bruine verglaçante', 57: 'Bruine verglaçante',
    61: 'Pluie faible', 63: 'Pluie', 65: 'Pluie forte', 66: 'Pluie verglaçante', 67: 'Pluie verglaçante',
    71: 'Neige faible', 73: 'Neige', 75: 'Neige forte', 77: 'Grains de neige',
    80: 'Averses faibles', 81: 'Averses', 82: 'Averses violentes', 85: 'Averses de neige', 86: 'Averses de neige',
    95: 'Orage', 96: 'Orage et grêle', 99: 'Orage et grêle'
  };
  var DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

  // Next 6 hours of the hourly forecast. Open-Meteo gives local Europe/Paris times
  // ("YYYY-MM-DDTHH:MM") and the current one in current.time, so plain string
  // comparison works on every browser without date parsing.
  function renderHours(h, currentTime) {
    var list = $('w-hours');
    if (!h || !h.time || !currentTime) { list.innerHTML = ''; return; }
    var start = 0;
    while (start < h.time.length && h.time[start] <= currentTime) start++;
    var html = '';
    for (var i = start; i < Math.min(start + 6, h.time.length); i++) {
      var p = h.precipitation_probability ? h.precipitation_probability[i] : null;
      var pc = p === null || p === undefined ? null : p;
      html += '<li><span class="h-hour">' + h.time[i].slice(11, 13) + 'h</span>' +
        '<span class="h-temp">' + Math.round(h.temperature_2m[i]) + '°</span>' +
        '<span class="h-bar" aria-hidden="true"><i style="height:' + (pc || 0) + '%"></i></span>' +
        '<span class="h-rain">' + (pc === null ? '–' : pc + '%') + '</span></li>';
    }
    list.innerHTML = html;
  }

  function nextHourRain(h, currentTime) {
    if (!h || !h.time || !h.precipitation_probability) return null;
    for (var i = 0; i < h.time.length; i++) if (h.time[i] > currentTime) return h.precipitation_probability[i];
    return null;
  }

  /* ── the butler ───────────────────────────── */
  var fmtHour = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', hour12: false });
  function renderButler() {
    var el = $('butler');
    var line = state.schedule && !state.feedLoading
      ? Butler.butlerLine(board, state.weather || null, nowSec(), parseInt(fmtHour.format(new Date()), 10) % 24) : null;
    if (!line || el.getAttribute('data-line') === line) return;
    el.setAttribute('data-line', line);
    el.classList.remove('show');
    setTimeout(function () { el.textContent = line; el.classList.add('show'); }, el.textContent ? 400 : 0);
  }

  function loadWeather() {
    var box = $('weather');
    fetchWithTimeout(CONFIG.weatherUrl, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (w) {
        var c = w.current, d = w.daily;
        $('w-temp').textContent = Math.round(c.temperature_2m);
        $('w-label').textContent = WMO[c.weather_code] || '—';
        $('w-range').textContent = Math.round(d.temperature_2m_min[0]) + '° / ' + Math.round(d.temperature_2m_max[0]) + '°';
        $('w-feel').textContent = Math.round(c.apparent_temperature) + '°';
        $('w-wind').textContent = Math.round(c.wind_speed_10m) + ' km/h ' + DIRS[Math.round(c.wind_direction_10m / 45) % 8];
        var p = d.precipitation_probability_max && d.precipitation_probability_max[0];
        $('w-rain').textContent = (p === null || p === undefined ? '–' : p + ' %') + (c.precipitation > 0 ? ' · ' + c.precipitation + ' mm' : '');
        renderHours(w.hourly, c.time);
        state.weather = { code: c.weather_code, precipitation: c.precipitation, rainSoon: nextHourRain(w.hourly, c.time) };
        renderButler();
        box.setAttribute('data-state', 'ok');
      })
      .catch(function (e) {
        box.setAttribute('data-state', 'error');
        if ($('w-temp').textContent === '--') {
          // Never loaded yet: retry soon instead of waiting for the 15 min cycle.
          $('w-label').textContent = 'Météo indisponible (' + e.message + '), nouvel essai dans 2 min';
          setTimeout(loadWeather, 120000);
        }
      });
  }

  /* ── STAR data ─────────────────────────────── */
  function loadSchedule() {
    var bust = Math.floor(Date.now() / 3600000);
    return fetchWithTimeout(CONFIG.scheduleUrl + '?h=' + bust)
      .then(function (r) { return r.json(); })
      .then(function (s) { state.schedule = s; state.scheduleError = null; render(); })
      .catch(function (e) { state.scheduleError = e.message; render(); });
  }

  function loadFeed() {
    return fetchWithTimeout(CONFIG.feedUrl, { cache: 'no-store' })
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (buf) {
        state.feed = GtfsRt.decodeFeed(buf);
        state.feedFetchedAt = nowSec();
        state.feedError = null;
      })
      .catch(function (e) {
        state.feedError = e instanceof Error ? e.message : String(e);
        if (window.console) console.warn('[Rennes Control] flux temps réel :', state.feedError);
      })
      .then(function () { state.feedLoading = false; render(); });
  }

  // GPS positions: optional layer, failures only hide the track.
  function loadVehicles() {
    return fetchWithTimeout(CONFIG.vehiclesUrl, { cache: 'no-store' })
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (buf) { state.vehicles = GtfsRt.decodeFeed(buf); state.vehiclesError = null; })
      .catch(function (e) { state.vehiclesError = e instanceof Error ? e.message : String(e); })
      .then(renderTrack);
  }

  /* ── live track ───────────────────────────── */
  var trackBuilt = false;
  function buildTrack() {
    var t = state.schedule && state.schedule.tracks && state.schedule.tracks.C4;
    if (!t || trackBuilt) return !!t;
    var n = t.length - 1;
    $('track-stops').innerHTML = t.map(function (s, i) {
      var cls = i === 0 ? 'first' : i === n ? 'last here' : '';
      return '<li class="' + cls + '" style="left:' + (i / n * 100) + '%"><i></i><span>' + esc(s.name) + '</span></li>';
    }).join('');
    trackBuilt = true;
    return true;
  }

  function renderTrack() {
    if (!buildTrack()) return;
    var s = state.schedule, now = nowSec(), n = s.tracks.C4.length - 1;
    var vp = state.vehicles && state.vehicles.header.timestamp && now - state.vehicles.header.timestamp < CONFIG.ignoreAfterSec ? state.vehicles : null;
    var buses = vp ? Departures.trackPositions(s, vp, now) : [];
    // Live departures whose bus is not yet on the drawn stretch: show it waiting at the left edge.
    var seen = {};
    buses.forEach(function (b) { seen[b.trip] = true; });
    ['C4', 'C6'].forEach(function (line) {
      (board[line] || []).forEach(function (d) {
        if (d.status === 'live' && !seen[d.trip] && d.time - now < 1200 && d.time > now) buses.push({ line: line, vehicle: d.vehicle, trip: d.trip, pos: 0, far: true, eta: d.time });
      });
    });
    var lines = s.lines, prev = null;
    buses.sort(function (a, b) { return b.pos - a.pos; });
    $('track-buses').innerHTML = buses.map(function (b) {
      var l = lines[b.line];
      // Two buses close together: the second one keeps only its badge, nudged aside.
      var stacked = prev !== null && prev - b.pos < 0.8;
      prev = b.pos;
      var label = b.far ? 'plus loin' : b.atStop && b.pos === n ? 'à quai' : 'bus ' + b.vehicle;
      return '<span class="bus' + (b.far ? ' far' : '') + (b.atStop && b.pos === n ? ' docked' : '') +
        (stacked ? ' stacked' : '') + (b.pos > n - 1.2 ? ' end' : '') +
        '" style="left:' + (b.pos / n * 100) + '%;--line:' + l.color + ';--line-ink:' + l.text_color + '">' +
        '<b>' + b.line + '</b><small>' + esc(label) + '</small></span>';
    }).join('');
    var note;
    if (!state.vehicles && !state.vehiclesError) note = 'Lecture des positions…';
    else if (!vp) note = 'Positions GPS indisponibles' + (state.vehiclesError ? ' (' + esc(state.vehiclesError) + ')' : '');
    else if (!buses.length) note = 'Aucun bus C4 ou C6 sur les 6 derniers arrêts';
    else note = 'Positions de ' + hms(vp.header.timestamp);
    $('track-note').innerHTML = note;
  }

  function feedAge() {
    return state.feed && state.feed.header.timestamp ? nowSec() - state.feed.header.timestamp : null;
  }
  function usableFeed() {
    var age = feedAge();
    return age !== null && age <= CONFIG.ignoreAfterSec ? state.feed : null;
  }

  /* ── render ───────────────────────────────── */
  function renderDep(d, now) {
    var cls = d.status === 'live' ? 'is-live' : d.status === 'canceled' ? 'is-cancel' : 'is-sched';
    var c = Departures.countdown(d.time, now);
    var count;
    if (d.status === 'canceled') count = '<span>Supprimé</span>';
    else if (c === 'à quai') count = '<span class="now-word">À quai</span>';
    else {
      var m = /^dans (\d+) min$/.exec(c);
      count = m ? m[1] + '<small>min</small>' : esc(c.replace('dans ', ''));
    }
    var timeHtml = hm(d.time);
    if (d.status === 'live' && hm(d.time) !== hm(d.scheduled)) timeHtml += '<s>prévu ' + hm(d.scheduled) + '</s>';

    var tag = d.status === 'live' ? '<span class="tag tag-live"><i></i>Temps réel</span>'
      : d.status === 'canceled' ? '<span class="tag tag-cancel">Supprimé</span>'
      : '<span class="tag tag-sched">Théorique</span>';
    var note = d.status === 'live' && d.vehicle ? '<span class="dep-note">bus n° ' + esc(d.vehicle) + '</span>' : '';
    var dl = d.status === 'live' ? Departures.delayLabel(d.delay) : null;
    var delay = dl ? '<span class="dep-delay" data-kind="' + dl.kind + '">' + esc(dl.text) + '</span>' : '<span></span>';

    return '<li class="dep ' + cls + '" aria-label="' + esc(c + ', ' + hm(d.time) + ', ' + (d.status === 'live' ? 'temps réel' : d.status === 'canceled' ? 'supprimé' : 'horaire théorique')) + '">' +
      '<p class="dep-count' + (c === 'à quai' && d.status !== 'canceled' ? ' now' : '') + '">' + count + '</p>' +
      '<p class="dep-time">' + timeHtml + '</p>' +
      '<p class="dep-info">' + tag + note + '</p>' + delay + '</li>';
  }

  function renderBoard(now) {
    var s = state.schedule;
    ['C4', 'C6'].forEach(function (line) {
      var list = document.querySelector('#line-' + line + ' .deps');
      if (!s) {
        list.innerHTML = state.scheduleError
          ? '<li class="state">Horaires indisponibles (' + esc(state.scheduleError) + '). Nouvel essai automatique.</li>'
          : '<li class="state loading">Chargement des horaires </li>';
        return;
      }
      if (state.feedLoading) { list.innerHTML = '<li class="state loading">Lecture du flux temps réel STAR </li>'; return; }
      var deps = board[line] || [];
      list.innerHTML = deps.length ? deps.map(function (d) { return renderDep(d, now); }).join('')
        : '<li class="state">Aucun départ prévu dans les 6 prochaines heures.</li>';
    });
  }

  // Single-screen layout: drop the last departure of the longest line until the board fits.
  function fitBoard() {
    var el = document.querySelector('.board');
    var deps = [].slice.call(el.querySelectorAll('.dep'));
    deps.forEach(function (d) { d.hidden = false; });
    if (window.innerWidth < 900) return;
    for (var guard = 0; guard < 8 && el.scrollHeight > el.clientHeight + 1; guard++) {
      var lists = [].slice.call(el.querySelectorAll('.deps')).map(function (l) {
        return [].slice.call(l.querySelectorAll('.dep')).filter(function (d) { return !d.hidden && getComputedStyle(d).display !== 'none'; });
      }).sort(function (a, b) { return b.length - a.length; });
      if (!lists.length || lists[0].length <= 1) break;
      lists[0][lists[0].length - 1].hidden = true;
    }
  }
  window.addEventListener('resize', function () { fitBoard(); });

  var board = {};
  function render() {
    var now = nowSec();
    var feed = usableFeed();
    if (state.schedule) board = Departures.buildBoard(state.schedule, feed, now, { perLine: CONFIG.perLine });
    renderBoard(now);
    renderTrack();
    fitBoard();
    renderButler();

    // feed status pill + banner
    var pill = $('feed-pill'), banner = $('banner'), age = feedAge(), msg = null, kind = 'warn', pillState, pillText;
    if (state.feedLoading) { pillState = 'loading'; pillText = 'Connexion au flux STAR'; }
    else if (!state.feed) {
      pillState = 'down'; pillText = 'Temps réel indisponible';
      msg = 'Le flux temps réel STAR ne répond pas (' + esc(state.feedError || 'erreur inconnue') + '). Seuls les horaires théoriques sont affichés. Nouvel essai toutes les ' + CONFIG.feedEverySec + ' s.';
      kind = 'down';
    } else if (!feed) {
      pillState = 'down'; pillText = 'Flux STAR figé';
      msg = 'Le flux STAR n’a pas été mis à jour depuis ' + Math.round(age / 60) + ' min. Il est ignoré : horaires théoriques uniquement.';
      kind = 'down';
    } else if (age > CONFIG.staleAfterSec || state.feedError) {
      pillState = 'stale'; pillText = 'Temps réel en retard';
      msg = state.feedError ? 'Dernière lecture du flux en échec (' + esc(state.feedError) + '). Données temps réel de ' + hms(state.feed.header.timestamp) + '.'
        : 'Le flux STAR date de ' + Math.round(age / 60) + ' min. Les prévisions peuvent être imprécises.';
    } else { pillState = 'live'; pillText = 'Temps réel STAR'; }

    if (state.schedule && state.schedule.departures.length) {
      var last = state.schedule.departures[state.schedule.departures.length - 1].t;
      if (last < now + 6 * 3600) {
        msg = (msg ? msg + ' ' : '') + 'Le fichier d’horaires théoriques arrive à échéance (' + esc(state.schedule.feed_end || '') + ') : relancez tools/build_schedule.py.';
      }
    }
    pill.setAttribute('data-state', pillState);
    pill.lastChild.textContent = pillText;
    if (msg) { banner.innerHTML = msg; banner.setAttribute('data-kind', kind); banner.hidden = false; }
    else banner.hidden = true;
    document.querySelector('.board').classList.toggle('has-banner', !!msg);

    // freshness footer
    var parts = [];
    if (state.feed) {
      parts.push('Flux STAR <b>' + hms(state.feed.header.timestamp) + '</b> <span class="' + (age > CONFIG.staleAfterSec ? 'warn' : '') + '">(' + ago(age) + ')</span>');
    }
    if (state.feedFetchedAt) parts.push('actualisé à <b>' + hms(state.feedFetchedAt) + '</b>');
    if (state.schedule) parts.push('horaires GTFS du ' + esc(fmtFeedVersion(state.schedule.feed_version)));
    $('fresh').innerHTML = parts.length ? parts.join(' · ') : 'Données STAR : en attente';
  }

  function fmtFeedVersion(v) {
    if (!v || v.length < 8) return '?';
    return v.slice(6, 8) + '/' + v.slice(4, 6) + '/' + v.slice(0, 4);
  }

  /* ── scheduling ───────────────────────────── */
  var timers = [];
  function every(sec, fn) { timers.push(setInterval(fn, sec * 1000)); }

  function start() {
    tickClock();
    loadSchedule();
    loadFeed();
    loadVehicles();
    loadWeather();
    setInterval(tickClock, 1000);
    every(5, render);  // countdowns
    every(CONFIG.feedEverySec, function () { if (!document.hidden) loadFeed(); });
    every(15, function () { if (!document.hidden) loadVehicles(); });
    every(CONFIG.weatherEverySec, loadWeather);
    every(CONFIG.scheduleEverySec, loadSchedule);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { tickClock(); loadFeed(); loadVehicles(); render(); }
    });
    // A schedule error is retried quickly rather than waiting 6 h.
    every(60, function () { if (!state.schedule) loadSchedule(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

/*
 * The butler: one short line at the top of the screen, picked from the real
 * situation (departures board, weather, time of day). Pure function, tested in
 * tests/butler.js. Rules are checked in order; the first that applies wins.
 */
(function (root) {
  'use strict';

  var RAIN_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];

  /*
   * board:   { C4: [dep], C6: [dep] } from Departures.buildBoard
   * weather: { code, precipitation, rainSoon (0-100 probability next hour) } or null
   * nowSec:  unix seconds; hour: current hour in Europe/Paris (0-23)
   */
  function butlerLine(board, weather, nowSec, hour) {
    if (!board) return null;
    var all = [];
    Object.keys(board).forEach(function (k) { all = all.concat(board[k]); });
    var next = all.filter(function (d) { return d.status !== 'canceled'; })
      .sort(function (a, b) { return a.time - b.time; })[0];
    var canceled = all.filter(function (d) { return d.status === 'canceled' && d.scheduled - nowSec < 1800; })[0];

    if (!next) return 'Plus de bus ce soir. Restez donc.';
    var wait = next.time - nowSec, mins = Math.round(wait / 60);
    var raining = weather && (RAIN_CODES.indexOf(weather.code) !== -1 || weather.precipitation > 0);
    var rainSoon = weather && weather.rainSoon >= 60;

    if (canceled) return 'Le ' + canceled.line + ' de ' + hm(canceled.scheduled) + ' s’est décommandé. Le suivant fera l’affaire.';
    if (wait > 3600) return (hour >= 21 || hour < 5 ? 'Prochain bus dans plus d’une heure. La nuit est à vous.' : 'Prochain bus dans plus d’une heure. Rien ne presse.');
    if (wait <= 150 && wait > 30) return 'Le ' + next.line + ' est presque là. C’est maintenant ou jamais.';
    if (raining && wait <= 900) return 'Il pleut. Parapluie, et on y va.';
    if (next.status === 'live' && next.delay >= 180) return 'Le ' + next.line + ' se fait désirer, ' + Math.round(next.delay / 60) + ' minutes de retard. Prenez votre temps.';
    if (next.status === 'live' && next.delay <= -60) return 'Le ' + next.line + ' est en avance. Ne traînez pas.';
    if (rainSoon && wait <= 1800) return 'La pluie s’annonce. Prenez un parapluie, au cas où.';
    if (hour >= 5 && hour < 10) return 'Tout est en ordre. Belle journée.';
    if (hour >= 21 || hour < 5) return 'Tout roule. Bonne soirée.';
    if (mins >= 20) return 'Le prochain bus est dans ' + mins + ' minutes. Un café ?';
    return 'Tout est en ordre.';
  }

  var fmt = typeof Intl !== 'undefined'
    ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }) : null;
  function hm(sec) { return fmt ? fmt.format(new Date(sec * 1000)) : ''; }

  var api = { butlerLine: butlerLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Butler = api;
})(this);

/*
 * Every STAR bus gets an old-fashioned French first name, always the same for
 * the same vehicle number (stable hash). Pure function, tested in tests/names.js.
 */
(function (root) {
  'use strict';

  var NAMES = [
    'Gérard', 'Josiane', 'Michel', 'Odette', 'Bernard', 'Ginette', 'René', 'Huguette',
    'Raymond', 'Paulette', 'Marcel', 'Simone', 'Lucien', 'Yvette', 'Albert', 'Germaine',
    'Roger', 'Colette', 'Maurice', 'Monique', 'Gilbert', 'Jacqueline', 'Jean-Claude', 'Micheline',
    'Robert', 'Solange', 'Fernand', 'Raymonde', 'Guy', 'Lucienne', 'Henri', 'Denise'
  ];

  // FNV-1a: spreads neighbouring numbers (386, 387) over different names
  function busName(vehicle) {
    if (vehicle === null || vehicle === undefined || vehicle === '') return null;
    var s = String(vehicle), h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return NAMES[h % NAMES.length];
  }

  var api = { busName: busName, NAMES: NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BusNames = api;
})(this);

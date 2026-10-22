// Rain within the hour, from 15-minute slots. Usage: node tests/rain.js
const assert = require('assert');
const { rainOutlook } = require('../assets/rain.js');
const slots = (start, values) => {
  const t0 = Date.UTC(2026, 9, 23, ...start.split(':').map(Number));
  return { time: values.map((_, i) => new Date(t0 + i * 900000).toISOString().slice(0, 16)), precipitation: values };
};
const t = (vals, now) => rainOutlook(slots('17:00', vals), '2026-10-23T' + now).text;
assert.strictEqual(t([0, 0, 0, 0, 0, 0, 0, 0], '17:00'), 'Pas de pluie dans l’heure');
assert.strictEqual(t([0, 0, 0.4, 0.6, 0.2, 0, 0, 0], '17:00'), 'Pluie dans 30 min · pendant ~45 min');
assert.strictEqual(t([0, 0.3, 0, 0, 0, 0, 0, 0], '17:10'), 'Pluie dans 5 min · pendant ~15 min');
assert.strictEqual(t([0, 0.3, 0, 0, 0, 0, 0, 0], '17:13'), 'Pluie dans quelques minutes · pendant ~15 min');
assert.strictEqual(t([0.5, 0.5, 0, 0, 0, 0, 0, 0], '17:00'), 'Il pleut · encore ~30 min');
assert.strictEqual(t([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0], '17:00'), 'Il pleut · encore ~1 h 45');
assert.strictEqual(t([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], '17:00'), 'Il pleut · pour au moins 2 h');
assert.strictEqual(t([0, 0, 0, 0, 0, 0.5, 0.5, 0], '17:00'), 'Pas de pluie dans l’heure'); // rain in 75 min: beyond the hour
assert.strictEqual(t([0, 0.05, 0, 0, 0, 0, 0, 0], '17:00'), 'Pas de pluie dans l’heure');  // trace amounts ignored
assert.strictEqual(rainOutlook(null, '2026-10-23T17:00'), null);
console.log('OK: rain tests passed');

// Bar opening status, including ranges past midnight. Usage: node tests/bars.js
const assert = require('assert');
const { barStatus } = require('../assets/bars.js');
const bars = require('../data/bars.json').bars;
const [penny, cour, melody, bateau] = bars;
assert.strictEqual(penny.name, 'Penny Lane'); assert.strictEqual(cour.name, 'La Cour');
const at = (bar, day, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return barStatus(bar, day, h * 60 + m).text; };
// day: 0 = lundi … 6 = dimanche
assert.strictEqual(at(cour, 0, '20:00'), 'ouvre demain 11h');          // closed on monday
assert.strictEqual(at(cour, 1, '20:00'), 'ouvert · jusqu’à 1h');
assert.strictEqual(at(cour, 2, '00:30'), 'ferme bientôt · 1h');         // tuesday night, after midnight
assert.strictEqual(at(cour, 2, '01:00'), 'ouvre à 11h');
assert.strictEqual(at(cour, 6, '22:00'), 'ouvre mardi 11h');            // sunday 16-21, then closed monday
assert.strictEqual(at(melody, 5, '12:00'), 'ouvre à 15h');
assert.strictEqual(at(melody, 6, '00:20'), 'ferme bientôt · 1h');       // saturday night
assert.strictEqual(at(melody, 6, '18:00'), 'ouvre demain 11h30');
assert.strictEqual(at(bateau, 4, '16:30'), 'ouvre à 17h');
assert.strictEqual(at(bateau, 4, '23:00'), 'ouvert · jusqu’à 0h45');
assert.strictEqual(at(bateau, 0, '00:30'), 'ouvre à 17h');              // sunday closed, nothing from last night
assert.strictEqual(at(penny, 4, '01:30'), 'ouvert · jusqu’à 3h');      // thursday night, still open after 1h
assert.strictEqual(at(penny, 4, '02:30'), 'ferme bientôt · 3h');
assert.strictEqual(at(penny, 4, '03:00'), 'ouvre à 16h');
assert.strictEqual(at(penny, 6, '17:00'), 'ouvre à 18h');               // sunday
console.log('OK: bars tests passed');

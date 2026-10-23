// Bus first names: stable, varied, and used by the butler. Usage: node tests/names.js
const assert = require('assert');
const { busName, NAMES } = require('../assets/names.js');
const { butlerLine } = require('../assets/butler.js');
assert.strictEqual(busName('386'), busName('386'));             // always the same
assert.strictEqual(busName(386), busName('386'));
assert.strictEqual(busName(''), null); assert.strictEqual(busName(null), null);
const seen = new Set(); for (let v = 300; v < 420; v++) seen.add(busName(v));
assert.ok(seen.size >= NAMES.length * 0.9, 'names should be spread: ' + seen.size);
assert.notStrictEqual(busName('386'), busName('387'));
const now = 1000000, n = busName('386');
const live = (inSec, delay) => ({ C4: [{ line: 'C4', time: now + inSec, scheduled: now + inSec - delay, status: 'live', delay, vehicle: '386' }], C6: [] });
assert.strictEqual(butlerLine(live(100, 0), null, now, 14, null, busName), n + ', le C4, est presque là. C’est maintenant ou jamais.');
assert.strictEqual(butlerLine(live(600, 300), null, now, 14, null, busName), n + ' se fait désirer : 5 minutes de retard. Prenez votre temps.');
assert.strictEqual(butlerLine(live(600, -90), null, now, 14, null, busName), n + ', le C4, est en avance. Ne traînez pas.');
assert.strictEqual(butlerLine(live(100, 0), null, now, 14), 'Le C4 est presque là. C’est maintenant ou jamais.'); // without names
console.log('OK: names tests passed (386 = ' + n + ', 356 = ' + busName('356') + ', 373 = ' + busName('373') + ')');

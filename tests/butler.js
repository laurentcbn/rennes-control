// The butler's line for typical situations. Usage: node tests/butler.js
const assert = require('assert');
const { butlerLine } = require('../assets/butler.js');
const now = 1000000;
const dep = (line, inSec, extra) => Object.assign({ line, time: now + inSec, scheduled: now + inSec, status: 'scheduled', delay: null }, extra);
const cases = [
  [{ C4: [], C6: [] }, null, 23, 'Plus de bus ce soir. Restez donc.'],
  [{ C4: [dep('C4', 5000)], C6: [] }, null, 1, 'Prochain bus dans plus d’une heure. La nuit est à vous.'],
  [{ C4: [dep('C4', 100)], C6: [] }, null, 14, 'Le C4 est presque là. C’est maintenant ou jamais.'],
  [{ C4: [dep('C4', 400)], C6: [] }, { code: 61, precipitation: 0.4 }, 14, 'Il pleut. Parapluie, et on y va.'],
  [{ C4: [dep('C4', 400, { status: 'live', delay: 300 })], C6: [] }, null, 14, 'Le C4 se fait désirer, 5 minutes de retard. Prenez votre temps.'],
  [{ C4: [], C6: [dep('C6', 400, { status: 'live', delay: -70 })] }, null, 14, 'Le C6 est en avance. Ne traînez pas.'],
  [{ C4: [dep('C4', 600)], C6: [] }, { code: 3, precipitation: 0, rainSoon: 80 }, 14, 'La pluie s’annonce. Prenez un parapluie, au cas où.'],
  [{ C4: [dep('C4', 600)], C6: [] }, { code: 3, precipitation: 0, rainIn: 20 }, 14, 'Pluie dans 20 minutes. Prenez un parapluie.'],
  [{ C4: [dep('C4', 600)], C6: [] }, null, 7, 'Tout est en ordre. Belle journée.'],
  [{ C4: [dep('C4', 600)], C6: [] }, null, 22, 'Tout roule. Bonne soirée.'],
  [{ C4: [dep('C4', 1500)], C6: [] }, null, 15, 'Le prochain bus est dans 25 minutes. Un café ?'],
  [{ C4: [dep('C4', 600)], C6: [] }, null, 15, 'Tout est en ordre.']
];
for (const [board, weather, hour, expected] of cases) assert.strictEqual(butlerLine(board, weather, now, hour), expected);
const canceled = butlerLine({ C4: [dep('C4', 300, { status: 'canceled' }), dep('C4', 900)], C6: [] }, null, now, 14);
assert.ok(/^Le C4 de \d\d:\d\d s’est décommandé\. Le suivant fera l’affaire\.$/.test(canceled), canceled);
console.log('OK: butler tests passed');

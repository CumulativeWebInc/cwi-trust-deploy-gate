// Fixture: CLEAN — every top-level reference has a top-level declaration.
import { init } from './init.js';

const MODE = 'live';
const DISTRICT_BEACONS = [];

function boot() {
  const items = [1, 2, 3];
  return items.map(x => x * 2);
}

fetch('forms.json')
  .then(r => r.json())
  .then(data => {
    const beacons = data.items || [];
    DISTRICT_BEACONS.push(...beacons);
  });

boot();
init(MODE);

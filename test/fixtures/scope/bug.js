// Fixture: REPRODUCES the gear-ledger 2026-09-17 incident.
// DISTRICT_BEACONS was declared with `const` inside the forms.json fetch
// .then() callback, but referenced at module top level in the PRIME anims
// loop -> ReferenceError killed boot before the first frame. Unit tests
// never saw it because no test evaluated the page's inline module script.
const anims = [];
function buildBeacons(data) { return data; }

fetch('forms.json')
  .then(r => r.json())
  .then(data => {
    const DISTRICT_BEACONS = buildBeacons(data);
    anims.push(DISTRICT_BEACONS);
  });

// module top-level PRIME anims loop
for (const tick of anims) {
  render(tick, DISTRICT_BEACONS);
}
boot(DISTRICT_BEACONS);

function render() {}
function boot() {}

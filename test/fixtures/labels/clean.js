// Fixture: CLEAN — every SAMPLE/LIVE label is driven by a mode value.
const MODE = 'live';
billboard.textContent = MODE === 'live' ? 'LIVE' : 'SAMPLE';
const LABELS = { live: 'LIVE', sample: 'SAMPLE' };
ticker.textContent = LABELS[MODE];

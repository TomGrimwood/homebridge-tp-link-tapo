'use strict';

const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const DeviceInfoStore = require('../dist/api/DeviceInfoStore').default;
const {
  patchFromCommand
} = require('../dist/api/DeviceInfoStore');

const sampleInfo = {
  device_id: 'abc',
  device_on: true,
  brightness: 80,
  hue: 120,
  saturation: 50,
  color_temp: 4000,
  model: 'L530',
  mac: 'AA:BB:CC:DD:EE:FF'
};

describe('patchFromCommand', () => {
  it('maps known write commands to cache patches', () => {
    assert.deepEqual(patchFromCommand('power', [false]), { device_on: false });
    assert.deepEqual(patchFromCommand('brightness', [42]), { brightness: 42 });
    assert.deepEqual(patchFromCommand('hueAndSaturation', [10, 20]), {
      hue: 10,
      saturation: 20
    });
    assert.deepEqual(patchFromCommand('colorTemp', [2700]), {
      color_temp: 2700
    });
  });

  it('returns undefined for unrelated commands', () => {
    assert.equal(patchFromCommand('startAlarm', []), undefined);
  });
});

describe('DeviceInfoStore', () => {
  afterEach(() => {
    mock.timers.reset();
  });

  it('seeds and returns cached snapshots without fetching', () => {
    const store = new DeviceInfoStore();
    store.seed(sampleInfo);

    assert.equal(store.snapshot().device_on, true);
    assert.equal(store.snapshot().brightness, 80);
  });

  it('ignores empty seed data', () => {
    const store = new DeviceInfoStore();
    store.seed({});

    assert.deepEqual(store.snapshot(), {});
  });

  it('merges patches into existing state', () => {
    const store = new DeviceInfoStore();
    store.seed(sampleInfo);
    store.patch({ device_on: false, brightness: 10 });

    const snapshot = store.snapshot();
    assert.equal(snapshot.device_on, false);
    assert.equal(snapshot.brightness, 10);
    assert.equal(snapshot.hue, 120);
  });

  it('refresh updates state from fetcher', async () => {
    const store = new DeviceInfoStore();
    const updated = { ...sampleInfo, brightness: 15 };

    await store.refresh(async () => updated);

    assert.equal(store.snapshot().brightness, 15);
  });

  it('refresh keeps prior cache when fetch returns empty', async () => {
    const store = new DeviceInfoStore();
    store.seed(sampleInfo);

    await store.refresh(async () => null);

    assert.equal(store.snapshot().brightness, 80);
  });

  it('refresh can run again after the debounce window', async () => {
    const store = new DeviceInfoStore();
    let brightness = 80;
    const fetch = async () => ({ ...sampleInfo, brightness: brightness++ });

    await store.refresh(fetch);
    assert.equal(store.snapshot().brightness, 80);

    await new Promise((resolve) => setTimeout(resolve, 110));
    await store.refresh(fetch);
    assert.equal(store.snapshot().brightness, 81);
  });

  it('stopSync clears polling timers', () => {
    mock.timers.enable({ apis: ['setInterval'] });

    const store = new DeviceInfoStore();
    let fetchCount = 0;

    store.startSync(async () => {
      fetchCount += 1;
      return sampleInfo;
    }, 1000);

    store.stopSync();
    mock.timers.tick(5000);

    assert.equal(fetchCount, 1);
  });
});

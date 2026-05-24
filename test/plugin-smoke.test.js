'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('plugin entrypoint', () => {
  it('registers the platform with homebridge', () => {
    const registrations = [];

    const api = {
      registerPlatform(platformName, PlatformClass) {
        registrations.push({ platformName, PlatformClass });
      }
    };

    require('../dist/index.js')(api);

    assert.equal(registrations.length, 1);
    assert.equal(registrations[0].platformName, 'HomebridgeTPLinkTapo');
    assert.equal(typeof registrations[0].PlatformClass, 'function');
  });
});

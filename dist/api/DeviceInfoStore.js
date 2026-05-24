"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATE_SYNC_INTERVAL_MS = void 0;
exports.patchFromCommand = patchFromCommand;
exports.STATE_SYNC_INTERVAL_MS = 10 * 1000;
const MIN_FETCH_INTERVAL_MS = 100;
function patchFromCommand(command, args) {
    switch (command) {
        case 'power':
            return { device_on: args[0] };
        case 'brightness':
            return { brightness: args[0] };
        case 'hueAndSaturation':
            return {
                hue: args[0],
                saturation: args[1]
            };
        case 'colorTemp':
            return { color_temp: args[0] };
        default:
            return undefined;
    }
}
class DeviceInfoStore {
    constructor() {
        this.updatedAt = 0;
    }
    seed(info) {
        if (Object.keys(info).length === 0) {
            return;
        }
        this.data = info;
        this.updatedAt = Date.now();
    }
    snapshot() {
        var _a;
        this.scheduleRefreshIfStale();
        return (_a = this.data) !== null && _a !== void 0 ? _a : {};
    }
    async refresh(fetch) {
        await this.pull(fetch);
        return this.snapshot();
    }
    patch(partial) {
        if (!this.data) {
            this.data = partial;
            this.updatedAt = Date.now();
            return;
        }
        this.data = {
            ...this.data,
            ...partial
        };
        this.updatedAt = Date.now();
    }
    startSync(fetch, intervalMs = exports.STATE_SYNC_INTERVAL_MS) {
        var _a, _b;
        this.fetch = fetch;
        if (this.timer) {
            return;
        }
        void this.pull(fetch);
        this.timer = setInterval(() => void this.pull(fetch), intervalMs);
        (_b = (_a = this.timer).unref) === null || _b === void 0 ? void 0 : _b.call(_a);
    }
    stopSync() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
        this.fetch = undefined;
        this.refreshInFlight = undefined;
    }
    scheduleRefreshIfStale() {
        if (!this.fetch) {
            return;
        }
        const stale = !this.data || Date.now() - this.updatedAt >= exports.STATE_SYNC_INTERVAL_MS;
        if (!stale || this.refreshInFlight) {
            return;
        }
        this.refreshInFlight = this.pull(this.fetch).finally(() => {
            this.refreshInFlight = undefined;
        });
    }
    async pull(fetch) {
        if (this.data && Date.now() - this.updatedAt < MIN_FETCH_INTERVAL_MS) {
            return;
        }
        const info = await fetch();
        if (!info || Object.keys(info).length === 0) {
            return;
        }
        this.data = info;
        this.updatedAt = Date.now();
    }
}
exports.default = DeviceInfoStore;
//# sourceMappingURL=DeviceInfoStore.js.map
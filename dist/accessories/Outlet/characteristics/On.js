"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const readState_1 = require("../../readState");
const errors_1 = require("../../../utils/errors");
const characteristic = {
    get: (0, readState_1.readState)((info) => info.device_on || false),
    set: async function (value) {
        try {
            await this.tpLink.sendCommand('power', value);
        }
        catch (err) {
            const summary = (0, errors_1.errorSummary)(err);
            if ((0, errors_1.isNetworkError)(err)) {
                this.log.debug('[%s] set power skipped (offline): %s', this.mac, summary);
            }
            else {
                this.log.warn('[%s] set power failed: %s', this.mac, summary);
            }
        }
    }
};
exports.default = characteristic;
//# sourceMappingURL=On.js.map
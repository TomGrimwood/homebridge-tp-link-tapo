"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const readState_1 = require("../../readState");
const errors_1 = require("../../../utils/errors");
const translateColorTemp_1 = require("../../../utils/translateColorTemp");
const characteristic = {
    get: (0, readState_1.readState)((info) => {
        const value = (0, translateColorTemp_1.toHomeKitValues)(info.color_temp || translateColorTemp_1.TP_LINK_VALUES.min);
        if (value < translateColorTemp_1.HOME_KIT_VALUES.min) {
            return translateColorTemp_1.HOME_KIT_VALUES.min;
        }
        if (value > translateColorTemp_1.HOME_KIT_VALUES.max) {
            return translateColorTemp_1.HOME_KIT_VALUES.max;
        }
        return value;
    }),
    set: async function (value) {
        try {
            await this.tpLink.sendCommand('colorTemp', (0, translateColorTemp_1.toTPLinkValues)(parseInt(value.toString())));
        }
        catch (err) {
            const summary = (0, errors_1.errorSummary)(err);
            if ((0, errors_1.isNetworkError)(err)) {
                this.log.debug('[%s] set color temperature skipped (offline): %s', this.mac, summary);
            }
            else {
                this.log.warn('[%s] set color temperature failed: %s', this.mac, summary);
            }
        }
    }
};
exports.default = characteristic;
//# sourceMappingURL=ColorTemperature.js.map
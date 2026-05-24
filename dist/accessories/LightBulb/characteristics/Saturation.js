"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const readState_1 = require("../../readState");
const characteristic = {
    get: (0, readState_1.readState)((info) => info.saturation || 0),
    set: async function (value) {
        this.saturation = parseInt(value.toString());
    }
};
exports.default = characteristic;
//# sourceMappingURL=Saturation.js.map
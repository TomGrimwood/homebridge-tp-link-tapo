"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readState = readState;
function readState(select) {
    return function () {
        return select(this.tpLink.getStateSnapshot());
    };
}
//# sourceMappingURL=readState.js.map
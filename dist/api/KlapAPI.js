"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const async_lock_1 = __importDefault(require("async-lock"));
const crypto_1 = __importDefault(require("crypto"));
const http_1 = __importDefault(require("http"));
const KlapCipher_1 = __importDefault(require("./KlapCipher"));
const API_1 = __importDefault(require("./@types/API"));
class KlapAPI extends API_1.default {
    constructor(ip, email, password, log) {
        super(ip, email, password, log);
        this.ip = ip;
        this.email = email;
        this.password = password;
        this.log = log;
        this.lock = new async_lock_1.default();
    }
    async login() {
        // KLAP login is performed inline as part of the handshake; the
        // legacy login() entry point is a no-op for KLAP devices.
    }
    async setup() {
        // KLAP setup is performed inline as part of the handshake; the
        // legacy setup() entry point is a no-op for KLAP devices.
    }
    async sendRequest() {
        throw new Error('sendRequest is not supported for KLAP devices');
    }
    async sendSecureRequest(method, params, _, forceHandshake = false) {
        var _a, _b;
        await this.handshake(forceHandshake);
        const rawRequest = JSON.stringify({
            method,
            params: (Object.keys(params).length > 0 && params) || null
        });
        this.log.debug('[%s] klap %s', this.ip, method);
        const requestData = this.session.cipher.encrypt(rawRequest);
        try {
            const response = await this.sessionPost('/request', requestData.encrypted, 'arraybuffer', this.session.Cookie, {
                seq: requestData.seq.toString()
            });
            if (response.status !== 200) {
                throw new Error(`klap request failed: HTTP ${response.status}`);
            }
            const data = JSON.parse(this.session.cipher.decrypt(response.data));
            return {
                response,
                body: data
            };
        }
        catch (error) {
            if (((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) === 403 && !forceHandshake) {
                this.log.debug('[%s] klap %s -> 403, regenerating session and retrying', this.ip, method);
                return this.sendSecureRequest(method, params, _, true);
            }
            throw new Error(`klap request failed: ${(_b = error === null || error === void 0 ? void 0 : error.message) !== null && _b !== void 0 ? _b : error}`);
        }
    }
    needsNewHandshake() {
        if (!this.session) {
            return true;
        }
        if (!this.session.cipher) {
            return true;
        }
        if (this.session.IsExpired) {
            return true;
        }
        if (!this.session.Cookie) {
            return true;
        }
        return false;
    }
    async handshake(force = false) {
        return this.lock.acquire('handshake', async () => {
            if (!this.needsNewHandshake() && !force) {
                return;
            }
            const { localSeed, remoteSeed, authHash } = await this.firstHandshake();
            await this.secondHandshake(localSeed, remoteSeed, authHash);
        });
    }
    async firstHandshake(seed) {
        var _a;
        const localSeed = seed ? seed : crypto_1.default.randomBytes(16);
        const handshake1Result = await this.sessionPost('/handshake1', localSeed, 'arraybuffer');
        if (handshake1Result.status !== 200) {
            throw new Error('Handshake1 failed');
        }
        if (handshake1Result.headers['content-length'] !== '48') {
            throw new Error('Handshake1 failed due to invalid content length');
        }
        const cookie = (_a = handshake1Result.headers['set-cookie']) === null || _a === void 0 ? void 0 : _a[0];
        const data = handshake1Result.data;
        const [cookieValue, timeout] = cookie.split(';');
        const timeoutValue = timeout.split('=').pop();
        this.session = new Session(timeoutValue, cookieValue);
        const remoteSeed = data.subarray(0, 16);
        const serverHash = data.subarray(16);
        this.log.debug('[%s] klap handshake1 ok', this.ip);
        const localHash = this.hashAuth(this.rawEmail, this.rawPassword);
        const localAuthHash = this.sha256(Buffer.concat([localSeed, remoteSeed, localHash]));
        if (Buffer.compare(localAuthHash, serverHash) === 0) {
            return {
                localSeed,
                remoteSeed,
                authHash: localHash
            };
        }
        const emptyHash = this.sha256(Buffer.concat([localSeed, remoteSeed, this.hashAuth('', '')]));
        if (Buffer.compare(emptyHash, serverHash) === 0) {
            this.log.warn('[%s] klap accepted empty credentials — device may be factory-reset', this.ip);
            return {
                localSeed,
                remoteSeed,
                authHash: emptyHash
            };
        }
        const testHash = this.sha256(Buffer.concat([
            localSeed,
            remoteSeed,
            this.hashAuth(KlapAPI.TP_TEST_USER, KlapAPI.TP_TEST_PASSWORD)
        ]));
        if (Buffer.compare(testHash, serverHash) === 0) {
            this.log.warn('[%s] klap accepted built-in test credentials — device firmware may be unusual', this.ip);
            return {
                localSeed,
                remoteSeed,
                authHash: testHash
            };
        }
        this.session = undefined;
        throw new Error('klap handshake1 server hash mismatch (wrong credentials?)');
    }
    async secondHandshake(localSeed, remoteSeed, authHash) {
        var _a, _b, _c;
        const localAuthHash = this.sha256(Buffer.concat([remoteSeed, localSeed, authHash]));
        try {
            const handshake2Result = await this.sessionPost('/handshake2', localAuthHash, 'text', this.session.Cookie);
            if (handshake2Result.status === 200) {
                this.log.debug('[%s] klap handshake2 ok', this.ip);
                this.session = this.session.completeHandshake(new KlapCipher_1.default(localSeed, remoteSeed, authHash));
                return;
            }
            this.log.warn('[%s] klap handshake2 returned HTTP %s', this.ip, handshake2Result.status);
        }
        catch (e) {
            // e.response may be undefined for network errors; fall back to
            // the error message in that case.
            const detail = (_c = (_b = (_a = e === null || e === void 0 ? void 0 : e.response) === null || _a === void 0 ? void 0 : _a.data) !== null && _b !== void 0 ? _b : e === null || e === void 0 ? void 0 : e.message) !== null && _c !== void 0 ? _c : String(e);
            this.log.warn('[%s] klap handshake2 failed: %s', this.ip, detail);
        }
        this.session = undefined;
    }
    async sessionPost(path, payload, responseType, cookie, params) {
        return axios_1.default.post(`http://${this.ip}/app${path}`, payload, {
            responseType: responseType,
            params: params,
            headers: {
                Host: this.ip,
                Accept: '*/*',
                'Content-Type': 'application/octet-stream',
                ...(cookie && {
                    Cookie: cookie
                })
            },
            httpAgent: new http_1.default.Agent({
                keepAlive: false
            })
        });
    }
    sha256(data) {
        return crypto_1.default.createHash('sha256').update(data).digest();
    }
    sha1(data) {
        return crypto_1.default.createHash('sha1').update(data).digest();
    }
    hashAuth(email, password) {
        return this.sha256(Buffer.concat([
            this.sha1(Buffer.from(email.normalize('NFKC'))),
            this.sha1(Buffer.from(password.normalize('NFKC')))
        ]));
    }
}
KlapAPI.TP_TEST_USER = 'test@tp-link.net';
KlapAPI.TP_TEST_PASSWORD = 'test';
exports.default = KlapAPI;
class Session {
    constructor(timeout, cookie, cipher) {
        this.cookie = cookie;
        this.cipher = cipher;
        this.handshakeCompleted = false;
        this.rawTimeout = timeout;
        this.expireAt = new Date(Date.now() + parseInt(timeout) * 1000);
        if (cipher) {
            this.handshakeCompleted = true;
        }
    }
    get IsExpired() {
        return this.expireAt.getTime() - Date.now() <= 40 * 1000;
    }
    get Cookie() {
        return this.cookie;
    }
    completeHandshake(cipher) {
        return new Session(this.rawTimeout, this.cookie, cipher);
    }
}
//# sourceMappingURL=KlapAPI.js.map
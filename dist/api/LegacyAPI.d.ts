import API from './@types/API';
export default class LegacyAPI extends API {
    private handshakeData;
    private tpLinkCipher?;
    private privateKey?;
    private publicKey?;
    private classSetup;
    login(): Promise<void>;
    setup(): Promise<void>;
    sendRequest(method: string, params: {
        [key: string]: any;
    }, setCookie?: boolean): Promise<import("axios").AxiosResponse<any, any>>;
    sendSecureRequest(method: string, params: {
        [key: string]: any;
    }, useToken?: boolean, forceHandshake?: boolean): any;
    needsNewHandshake(): boolean;
    private handshake;
    private decodeHandshakeKey;
}
//# sourceMappingURL=LegacyAPI.d.ts.map
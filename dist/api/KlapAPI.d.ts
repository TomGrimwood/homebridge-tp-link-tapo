import { AxiosResponse } from 'axios';
import { Logger } from 'homebridge';
import API from './@types/API';
export default class KlapAPI extends API {
    protected readonly ip: string;
    protected readonly email: string;
    protected readonly password: string;
    protected readonly log: Logger;
    private static readonly TP_TEST_USER;
    private static readonly TP_TEST_PASSWORD;
    private readonly lock;
    private session?;
    constructor(ip: string, email: string, password: string, log: Logger);
    login(): Promise<void>;
    setup(): Promise<void>;
    sendRequest(): Promise<AxiosResponse<any, any>>;
    sendSecureRequest(method: string, params: {
        [key: string]: any;
    }, _: boolean, forceHandshake?: boolean): Promise<{
        body: any;
        response: AxiosResponse<any, any>;
    }>;
    needsNewHandshake(): boolean;
    private handshake;
    private firstHandshake;
    private secondHandshake;
    private sessionPost;
    private sha256;
    private sha1;
    private hashAuth;
}
//# sourceMappingURL=KlapAPI.d.ts.map
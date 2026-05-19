import { AxiosResponse } from 'axios';
import { Logger } from 'homebridge';
declare abstract class API {
    protected readonly ip: string;
    protected readonly email: string;
    protected readonly password: string;
    protected readonly log: Logger;
    protected readonly terminalUUID: string;
    protected loginToken?: string;
    protected readonly rawEmail: string;
    protected readonly rawPassword: string;
    constructor(ip: string, email: string, password: string, log: Logger);
    abstract login(): Promise<void>;
    abstract setup(): Promise<void>;
    abstract sendRequest(method: string, params: {
        [key: string]: any;
    }, setCookie: boolean): Promise<AxiosResponse<any, any>>;
    abstract sendSecureRequest(method: string, params: {
        [key: string]: any;
    }, useToken: boolean, forceHandshake: boolean): Promise<{
        body: any;
        response: AxiosResponse<any, any>;
    }>;
    abstract needsNewHandshake(): boolean;
}
export default API;
//# sourceMappingURL=API.d.ts.map
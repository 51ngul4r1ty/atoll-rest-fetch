// externals
import axios, { AxiosError } from "axios";

export enum RequestApiFetchCacheOption {
    Default = 0,
    NoCache = 1
}

export enum RequestApiFetchFormatOption {
    Default = 0,
    Json = 1
}

export const REST_API_FETCH_OPTIONS_DEFAULT = {
    cache: RequestApiFetchCacheOption.NoCache,
    format: RequestApiFetchFormatOption.Json
};

export enum RestApiFetchErrorType {
    UnexpectedError = 1,
    ThirdPartyLibError = 2 // aka Axios, but that could change in future
}

export type RestApiFetchError<T = any> = {
    message: string;
    status: string;
    errorType: RestApiFetchErrorType;
    response?: T;
};

export type RestApiFetchResponseMappers = {
    item: (response: any) => any;
    items: (response: any) => any[];
};

export type RestApiFetchOptions = {
    cache?: RequestApiFetchCacheOption;
    format?: RequestApiFetchFormatOption;
};

export type RequestApiFetchHeaders = Record<string, string | number | boolean>;

/**
 * ST = Base Success Type, FT = Failure Type
 *
 * If you don't have a consistent structure for your API results then
 * leave ST as `any`.
 *
 * If you don't have a consistent structure for your API failure states
 * the leave FT as `string` (typically most REST API frameworks return
 * a simple text message instead of a JSON object when a call fails).
 */
export class RestApiFetch<ST = any, FT = string> {
    private cache: RequestApiFetchCacheOption;
    private format: RequestApiFetchFormatOption;
    private defaultHeaders: RequestApiFetchHeaders;
    constructor(options: RestApiFetchOptions = REST_API_FETCH_OPTIONS_DEFAULT) {
        this.cache = options.cache;
        this.format = options.format;
        this.defaultHeaders = {};
    }
    private buildHeaders(requestIncludesContent = true) {
        const result: RequestApiFetchHeaders = { ...this.defaultHeaders };
        if (this.cache === RequestApiFetchCacheOption.NoCache) {
            result["Cache-Control"] = "no-cache";
        }
        if (this.format === RequestApiFetchFormatOption.Json) {
            result["Accept"] = "application/json";
            if (requestIncludesContent) {
                result["Content-Type"] = "no-cache";
            }
        }
        return result;
    }
    private mapAxiosError(err: AxiosError): RestApiFetchError<FT> {
        return {
            message: err.message || "",
            status: err.status || "",
            errorType: RestApiFetchErrorType.ThirdPartyLibError,
            response: err.response?.data as FT
        };
    }
    private buildErrorValidationMessage(error: any): string | null {
        if (!error) {
            return "Unexpected condition- error is undefined";
        }
        const errorResponse = error.response;
        if (!errorResponse) {
            return `Unexpected condition- error is "${error}"`;
        }
        const responseData = errorResponse.data;
        if (!responseData) {
            return `Unexpected condition- error.response.data is undefined`;
        }
        const status = responseData.status;
        const message = responseData.message;
        if (!status && !message) {
            if (typeof responseData === "string") {
                // not what we expected, but roll with it... maybe this is a legacy
                // API call result or maybe auto-generated because of an unhandled error?
                return responseData as string;
            } else {
                try {
                    const stringifiedErrorObj = JSON.stringify(error);
                    return `Atoll REST API error: ${stringifiedErrorObj}`;
                } catch (error) {
                    return "Unexpected coniditon in 'connect'- error is not simple object";
                }
            }
        }
        return null;
    }
    private mapStringToError(error: string): RestApiFetchError {
        return {
            message: error,
            status: "",
            errorType: RestApiFetchErrorType.UnexpectedError
        };
    }
    private buildFromCaughtError(error: any): string | Error | RestApiFetchError {
        const errorValidationMessage = this.buildErrorValidationMessage(error);
        if (!errorValidationMessage) {
            const errTyped = error as AxiosError;
            return errTyped.isAxiosError ? this.mapAxiosError(errTyped) : error;
        }
        return this.mapStringToError(errorValidationMessage);
    }
    public getDefaultHeaders(): RequestApiFetchHeaders {
        return { ...this.defaultHeaders };
    }
    public setDefaultHeaders(headers: RequestApiFetchHeaders) {
        this.defaultHeaders = { ...headers };
    }
    public setDefaultHeader(headerName: string, headerValue: string) {
        this.defaultHeaders[headerName] = headerValue;
    }
    public async get<T>(uri: string): Promise<T> {
        try {
            const response = await axios.get(uri, {
                headers: this.buildHeaders()
            });
            return response.data as T;
        } catch (error) {
            throw this.buildFromCaughtError(error);
        }
    }
    public async execAction<T>(uri: string, payload: any): Promise<T> {
        try {
            const actionResponse = await axios.post(uri, payload, {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                }
            });
            const axiosResponseData = actionResponse.data as T; // as AuthServerResponse;
            return axiosResponseData;
        } catch (error) {
            throw this.buildFromCaughtError(error);
        }
    }
}

export const restApiFetch = new RestApiFetch();

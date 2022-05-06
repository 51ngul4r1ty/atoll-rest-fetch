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

export type AsyncAuthFailureHandler = () => Promise<boolean>;

export type RestApiFetchOptions = {
    cache?: RequestApiFetchCacheOption;
    format?: RequestApiFetchFormatOption;
};

export type RequestApiFetchHeaders = Record<string, string | number | boolean>;

/** This represents the correct runtime type as opposed to the defined type */
export type RuntimeAxiosError = Omit<AxiosError, "status"> & {
    status: number;
};

export type ResourceRequestOptions = {
    includeAuthHeader?: boolean;
    includeContentTypeHeader?: boolean;
    skipRetryOnAuthFailure?: boolean;
};

export const RESOURCE_REQUEST_OPTIONS_NOCONTENT_DEFAULT: ResourceRequestOptions = {
    includeAuthHeader: true,
    includeContentTypeHeader: true
};

export const RESOURCE_REQUEST_OPTIONS_CONTENT_DEFAULT: ResourceRequestOptions = {
    includeAuthHeader: true,
    includeContentTypeHeader: false
};

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
    constructor(options?: RestApiFetchOptions) {
        this.cache = options?.cache ?? REST_API_FETCH_OPTIONS_DEFAULT.cache;
        this.format = options?.format ?? REST_API_FETCH_OPTIONS_DEFAULT.format;
        this.defaultHeaders = {};
    }
    public onAuthFailure: AsyncAuthFailureHandler;
    private async handleAuthFailure(): Promise<boolean> {
        if (this.onAuthFailure) {
            return await this.onAuthFailure();
        }
        return false;
    }
    private buildHeaders(options: ResourceRequestOptions) {
        const result: RequestApiFetchHeaders = { ...this.defaultHeaders };
        if (this.cache === RequestApiFetchCacheOption.NoCache) {
            result["Cache-Control"] = "no-cache";
        }
        if (this.format === RequestApiFetchFormatOption.Json) {
            result["Accept"] = "application/json";
            if (options.includeContentTypeHeader) {
                result["Content-Type"] = "application/json";
            }
        }
        if (!options.includeAuthHeader) {
            if (result["Authorization"]) {
                delete result["Authorization"];
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
    public async setDefaultHeaders(headers: RequestApiFetchHeaders) {
        this.defaultHeaders = { ...headers };
    }
    public setDefaultHeader(headerName: string, headerValue: string) {
        this.defaultHeaders[headerName] = headerValue;
    }
    private fixAxiosError(error: any): RuntimeAxiosError {
        try {
            if (error.status === "") {
                return { ...error, status: undefined } as RuntimeAxiosError;
            }
            if (error.status && typeof error.status === "string") {
                const status = parseInt(error.status);
                return { ...error, status } as RuntimeAxiosError;
            } else if (!error.status) {
                const obj = JSON.parse(JSON.stringify(error));
                return { ...error, status: obj.status };
            }
        } catch (error) {
            // just swallow this error- it doesn't matter
        }
        return error as RuntimeAxiosError;
    }
    private async handleErrorAndRetry<T>(error: any, options: ResourceRequestOptions, apiCall: () => T) {
        const errorTyped = this.fixAxiosError(error);
        if (options.skipRetryOnAuthFailure || errorTyped.status !== 401) {
            throw this.buildFromCaughtError(error);
        }
        const success = await this.handleAuthFailure();
        if (success) {
            const response = await apiCall();
            return response;
        } else {
            throw this.buildFromCaughtError(error);
        }
    }
    public async get<T>(uri: string, options: ResourceRequestOptions = RESOURCE_REQUEST_OPTIONS_NOCONTENT_DEFAULT): Promise<T> {
        const apiCall = async () => {
            const response = await axios.get(uri, {
                headers: this.buildHeaders(options)
            });
            return response.data as T;
        };
        try {
            return await apiCall();
        } catch (error: any) {
            return await this.handleErrorAndRetry(error, options, apiCall);
        }
    }
    public async execAction<T>(
        uri: string,
        payload: any,
        options: ResourceRequestOptions = RESOURCE_REQUEST_OPTIONS_CONTENT_DEFAULT
    ): Promise<T> {
        const apiCall = async () => {
            const actionResponse = await axios.post(uri, payload, this.buildHeaders({ includeContentTypeHeader: true }));
            return actionResponse.data as T;
        };
        try {
            return await apiCall();
        } catch (error: any) {
            return await this.handleErrorAndRetry(error, options, apiCall);
        }
        // try {
        //     const actionResponse = await axios.post(uri, payload, this.buildHeaders(requestIncludesContent));
        //     const axiosResponseData = actionResponse.data as T; // as AuthServerResponse;
        //     return axiosResponseData;
        // } catch (error) {
        //     throw this.buildFromCaughtError(error);
        // }
    }
}
// externals
import axios, { AxiosError } from "axios";
import { StatusCodes } from "http-status-codes";

// consts/enums
import {
    RESOURCE_REQUEST_OPTIONS_CONTENT_DEFAULT,
    RESOURCE_REQUEST_OPTIONS_NOCONTENT_DEFAULT,
    REST_API_FETCH_OPTIONS_DEFAULT
} from "./restApiFetchConsts";
import {
    RequestApiFetchCacheOption,
    RequestApiFetchFormatOption,
    RestApiFetchErrorSubType,
    RestApiFetchErrorType
} from "./restApiFetchEnums";

// interfaces/types
import type {
    AsyncAuthFailureHandler,
    RequestApiFetchHeaders,
    ResourceRequestOptions,
    RestApiFetchError,
    RestApiFetchOptions,
    RuntimeAxiosError
} from "./restApiFetchTypes";

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
    private mapAxiosErrorType1(err: AxiosError): RestApiFetchError<FT> {
        const fixedError = this.fixAxiosError(err);
        return {
            message: fixedError.message || "",
            status: fixedError.status || StatusCodes.OK,
            errorType: RestApiFetchErrorType.ThirdPartyLibError,
            errorSubType: RestApiFetchErrorSubType.ThirdPartyLibErrorType1,
            response: fixedError.response?.data as FT
        };
    }
    private mapAxiosErrorType2(err: any): RestApiFetchError<FT> {
        return {
            message: err.message || "",
            status: err.status || StatusCodes.OK,
            errorType: RestApiFetchErrorType.ThirdPartyLibError,
            errorSubType: RestApiFetchErrorSubType.ThirdPartyLibErrorType2,
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
            status: StatusCodes.INTERNAL_SERVER_ERROR,
            errorType: RestApiFetchErrorType.UnexpectedError,
            errorSubType: RestApiFetchErrorSubType.None
        };
    }
    private isAxiosErrorType2(error: any) {
        return error.status && error.name === "AxiosError";
    }
    private buildFromCaughtError(error: any): string | Error | RestApiFetchError {
        const errorValidationMessage = this.buildErrorValidationMessage(error);
        if (!errorValidationMessage) {
            const errTyped = error as AxiosError;
            if (axios.isAxiosError(error)) {
                return this.mapAxiosErrorType1(errTyped);
            } else if (this.isAxiosErrorType2(error)) {
                return this.mapAxiosErrorType2(error);
            }
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
    private async handleError<T = any>(error: any): Promise<T> {
        const errorTyped = this.fixAxiosError(error);
        throw this.buildFromCaughtError(errorTyped);
    }
    private async handleErrorAndRetry<T>(error: any, options: ResourceRequestOptions, apiCall: () => T): Promise<T> {
        const errorTyped = this.fixAxiosError(error);
        if (options.skipRetryOnAuthFailure || errorTyped.status !== 401) {
            this.handleError(error);
        }
        const success = await this.handleAuthFailure();
        if (!success) {
            // NOTE: TS requires "return" here even though handleError always throws error
            return await this.handleError(error);
        } else {
            try {
                const response = await apiCall();
                return response;
            } catch (error: any) {
                // NOTE: TS requires "return" here even though handleError always throws error
                return await this.handleError(error);
            }
        }
    }
    /**
     * Performs a GET operation to retrieve a resource collection or item.
     */
    public async read<T>(uri: string, options: ResourceRequestOptions = RESOURCE_REQUEST_OPTIONS_NOCONTENT_DEFAULT): Promise<T> {
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
    /**
     * Performs a PUT operation to update a resource collection or item.
     */
    public async update<T>(
        uri: string,
        payload: any,
        options: ResourceRequestOptions = RESOURCE_REQUEST_OPTIONS_NOCONTENT_DEFAULT
    ): Promise<T> {
        const apiCall = async () => {
            const response = await axios.put(uri, payload, {
                headers: this.buildHeaders({ ...options, includeContentTypeHeader: true })
            });
            return response.data as T;
        };
        try {
            return await apiCall();
        } catch (error: any) {
            return await this.handleErrorAndRetry(error, options, apiCall);
        }
    }
    /**
     * Performs a POST operation to add a resource collection or item.
     */
    public async add<T>(
        uri: string,
        payload: any,
        options: ResourceRequestOptions = RESOURCE_REQUEST_OPTIONS_NOCONTENT_DEFAULT
    ): Promise<T> {
        const apiCall = async () => {
            const response = await axios.put(uri, payload, {
                headers: this.buildHeaders({ ...options, includeContentTypeHeader: true })
            });
            return response.data as T;
        };
        try {
            return await apiCall();
        } catch (error: any) {
            return await this.handleErrorAndRetry(error, options, apiCall);
        }
    }
    /**
     * Performs a GET operation to retrieve a resource collection or item.
     */
    public async delete<T>(uri: string, options: ResourceRequestOptions = RESOURCE_REQUEST_OPTIONS_NOCONTENT_DEFAULT): Promise<T> {
        const apiCall = async () => {
            const response = await axios.delete(uri, {
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
    /**
     * Performs a PATCH operation to update a resource collection or item.
     */
    public async patch<T>(
        uri: string,
        payload: any,
        options: ResourceRequestOptions = RESOURCE_REQUEST_OPTIONS_NOCONTENT_DEFAULT
    ): Promise<T> {
        const apiCall = async () => {
            const response = await axios.patch(uri, payload, {
                headers: this.buildHeaders({ ...options, includeContentTypeHeader: true })
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
            const actionResponse = await axios.post(uri, payload, {
                headers: this.buildHeaders({ ...options, includeContentTypeHeader: true })
            });
            return actionResponse.data as T;
        };
        try {
            return await apiCall();
        } catch (error: any) {
            return await this.handleErrorAndRetry(error, options, apiCall);
        }
    }
}

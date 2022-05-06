// externals
import { AxiosError } from "axios";

// consts/enums
import { RequestApiFetchCacheOption, RequestApiFetchFormatOption, RestApiFetchErrorType } from "./restApiFetchEnums";

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

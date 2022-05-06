// consts/enums
import { RequestApiFetchCacheOption, RequestApiFetchFormatOption } from "./restApiFetchEnums";

// interfaces/types
import type { ResourceRequestOptions } from "./restApiFetchTypes";

export const REST_API_FETCH_OPTIONS_DEFAULT = {
    cache: RequestApiFetchCacheOption.NoCache,
    format: RequestApiFetchFormatOption.Json
};

export const RESOURCE_REQUEST_OPTIONS_NOCONTENT_DEFAULT: ResourceRequestOptions = {
    includeAuthHeader: true,
    includeContentTypeHeader: true
};

export const RESOURCE_REQUEST_OPTIONS_CONTENT_DEFAULT: ResourceRequestOptions = {
    includeAuthHeader: true,
    includeContentTypeHeader: false
};

export enum RequestApiFetchCacheOption {
    Default = 0,
    NoCache = 1
}

export enum RequestApiFetchFormatOption {
    Default = 0,
    Json = 1
}

export enum RestApiFetchErrorType {
    UnexpectedError = 1,
    ThirdPartyLibError = 2 // aka Axios, but that could change in future
}

export enum RestApiFetchErrorSubType {
    None = 0,
    ThirdPartyLibErrorType1 = 1, // isAxiosError(err) has returned true
    ThirdPartyLibErrorType2 = 2 // isAxiosError(err) has returned false
}

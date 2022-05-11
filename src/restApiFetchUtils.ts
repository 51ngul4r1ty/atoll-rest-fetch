// interfaces/types
import type { RestApiFetchError } from "./restApiFetchTypes";

export const isRestApiFetchError = (err: any): err is RestApiFetchError => {
    return err.status && err.errorType;
};

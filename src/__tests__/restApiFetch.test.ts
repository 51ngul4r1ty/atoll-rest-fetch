// test related
import "jest";

// code under test
import { RestApiFetch } from "../restApiFetch";

import type { AuthServerResponse } from "@atoll/api-types";

describe("Rest API Fetch", () => {
    // it("should ...", async () => {
    //     // arrange
    //     const apiFetch = new RestApiFetch();

    //     // act
    //     const result = await apiFetch.execAction("https://pointswag.herokuapp.com/api/v1/actions/login", {
    //         username: "test",
    //         password: "atoll"
    //     });

    //     // assert
    //     expect(result).toStrictEqual({});
    // });
    it("should ...", async () => {
        // arrange
        const refreshToken =
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIyMTc3OTZmNmUxYWI0NTVhOTgwMjYzMTcxMDk5NTMzZiIsInVzZXJuYW1lIjoidGVzdCIsInJlZnJlc2hUb2tlbklkIjoiMjgxYTZmZGI5NzUxNDQwMGIyYjQ4MjM2MzQ1ZGJmODQiLCJpYXQiOjE2NTE3NjA1MjV9.rq18GkA1jl4m0tCIGRAZjK7fUftP0oYBmRMvIJwDCRE";
        const apiFetch = new RestApiFetch();
        apiFetch.onAuthFailure = async () => {
            console.log("ON AUTH FAILURE");
            const result = await apiFetch.execAction<AuthServerResponse>(
                "https://pointswag.herokuapp.com/api/v1/actions/refresh-token",
                { refreshToken },
                { skipRetryOnAuthFailure: true }
            );
            const { authToken /*, refreshToken */ } = result.data.item;
            console.log("AUTH TOKEN", authToken);
            apiFetch.setDefaultHeader("Authorization", `Bearer  ${authToken}`);
            // TODO: Store new refresh token
            return true;
        };
        // apiFetch.refreshToken = refreshToken;

        // act
        const result = await apiFetch.get("https://pointswag.herokuapp.com/api/v1/users/--self--/feature-toggles");

        // assert
        expect(result).toStrictEqual({});
    });
});

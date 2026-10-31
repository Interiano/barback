import { Amplify } from "aws-amplify"; /*fetch set up tool*/
import { fetchAuthSession } from "aws-amplify/auth"; /*fetch token*/

Amplify.configure({  /*points amplify at your user pool and app client using values of Env.local*/
    Auth: { Cognito: {
        userPoolId: import.meta.env.VITE_USER_POOL_ID,
        userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
        loginWith: { email: true }
    }},
});


/*this function gets your token and calls your api with it in Authorization header*/
export async function api(path: string, init: RequestInit = {}) {
    const { tokens } = await fetchAuthSession();
    return fetch(import.meta.env.VITE_API_URL + path, {
        ...init,
        headers: { Authorization: tokens!.idToken!.toString(), "Content-Type": "application/json" },
    });
}


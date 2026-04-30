import { PublicClientApplication, type Configuration } from "@azure/msal-browser";

const clientId =
  import.meta.env.VITE_MSAL_CLIENT_ID ?? "00000000-0000-0000-0000-000000000000";
const authority =
  import.meta.env.VITE_MSAL_AUTHORITY ??
  "https://login.microsoftonline.com/organizations";

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority,
    // Multi-tenant sign-in: must allow all known authorities so consent works
    // in any tenant, not just the home tenant where the App Reg lives.
    knownAuthorities: ["login.microsoftonline.com"],
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

/** Builds the Dataverse OAuth scope for the user's selected org URL. */
export function dataverseScopes(orgUrl: string): string[] {
  // Strip trailing slash and use the org host as the resource.
  const trimmed = orgUrl.replace(/\/+$/, "");
  return [`${trimmed}/.default`];
}

/** Acquires a token for the given Dataverse org URL, popup-fallback on silent failure. */
export async function getDataverseToken(orgUrl: string): Promise<string> {
  const account =
    msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  if (!account) {
    throw new Error("Not signed in");
  }
  const scopes = dataverseScopes(orgUrl);
  try {
    const result = await msalInstance.acquireTokenSilent({ scopes, account });
    return result.accessToken;
  } catch {
    const result = await msalInstance.acquireTokenPopup({ scopes, account });
    return result.accessToken;
  }
}

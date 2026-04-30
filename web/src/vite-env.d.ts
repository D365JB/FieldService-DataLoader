/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_MSAL_CLIENT_ID: string;
  readonly VITE_MSAL_AUTHORITY: string;
  readonly VITE_AOAI_PROXY_URL: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

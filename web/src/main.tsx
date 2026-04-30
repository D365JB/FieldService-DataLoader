import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { msalInstance } from "@/auth/msal";

// MSAL v4 requires explicit initialize() before any auth calls.
async function bootstrap() {
  await msalInstance.initialize();
  await msalInstance.handleRedirectPromise();

  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0 && !msalInstance.getActiveAccount()) {
    msalInstance.setActiveAccount(accounts[0]);
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed", err);
  document.getElementById("root")!.innerHTML = `
    <div style="padding: 2rem; color: #fca5a5; font-family: monospace;">
      <h2>Failed to start</h2>
      <pre>${(err as Error).message}</pre>
    </div>
  `;
});

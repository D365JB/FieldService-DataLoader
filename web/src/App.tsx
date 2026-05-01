import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "@/auth/msal";
import { Landing } from "@/pages/Landing";
import { Connect } from "@/pages/Connect";
import { Dashboard } from "@/pages/Dashboard";
import { Analyze } from "@/pages/Analyze";
import { Generate } from "@/pages/Generate";
import { Reset } from "@/pages/Reset";
import { Brand } from "@/pages/Brand";
import { Admin } from "@/pages/Admin";
import { AppFooter } from "@/components/AppFooter";
import { AppKeyGate } from "@/components/AppKeyGate";
import { attachRouteTracker, track } from "@/lib/telemetry";

export default function App() {
  useEffect(() => {
    track("session-start");
    return attachRouteTracker();
  }, []);
  return (
    <MsalProvider instance={msalInstance}>
      <BrowserRouter>
        <div className="flex flex-col min-h-screen">
          <div className="flex-1">
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/connect" element={<Connect />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/analyze" element={<Analyze />} />
              <Route path="/generate" element={<Generate />} />
              <Route path="/brand" element={<Brand />} />
              <Route path="/reset" element={<Reset />} />
              <Route
                path="/admin"
                element={
                  <AppKeyGate>
                    <Admin />
                  </AppKeyGate>
                }
              />
              <Route path="*" element={<Landing />} />
            </Routes>
          </div>
          <AppFooter />
        </div>
      </BrowserRouter>
    </MsalProvider>
  );
}

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "@/auth/msal";
import { Landing } from "@/pages/Landing";
import { Connect } from "@/pages/Connect";
import { Dashboard } from "@/pages/Dashboard";
import { Analyze } from "@/pages/Analyze";
import { Generate } from "@/pages/Generate";
import { Reset } from "@/pages/Reset";
import { AppFooter } from "@/components/AppFooter";

export default function App() {
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
              <Route path="/reset" element={<Reset />} />
              <Route path="*" element={<Landing />} />
            </Routes>
          </div>
          <AppFooter />
        </div>
      </BrowserRouter>
    </MsalProvider>
  );
}

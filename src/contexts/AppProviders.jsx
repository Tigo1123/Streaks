import React from "react";
import { ToastProvider } from "./ToastContext.jsx";
import { AuthProvider } from "./AuthContext.jsx";
import { StreaksProvider } from "./StreaksContext.jsx";
import { SyncProvider } from "./SyncContext.jsx";
import { NavigationProvider } from "./NavigationContext.jsx";

export function AppProviders({ children }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <StreaksProvider>
          <SyncProvider>
            <NavigationProvider>
              {children}
            </NavigationProvider>
          </SyncProvider>
        </StreaksProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default AppProviders;

import React, { createContext, useState, useCallback, useRef } from "react";
import { Toast } from "../components/common/Toast.jsx";

export const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const dismissToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback((message, type = "status", duration = 3200, actions = []) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    const id = Date.now();
    setToast({ id, message, type, actions });

    if (duration > 0) {
      timerRef.current = setTimeout(() => {
        setToast((current) => (current?.id === id ? null : current));
        timerRef.current = null;
      }, duration);
    }
  }, []);

  return (
    <ToastContext.Provider value={{ toast, showToast, dismissToast }}>
      {children}
      <Toast toast={toast} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

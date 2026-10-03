import React from "react";

export function Toast({ toast, onDismiss }) {
  if (!toast || !toast.message) return null;

  const isAlert = toast.type === "alert" || toast.type === "danger";

  return (
    <div
      className="toast-container"
      role={isAlert ? "alert" : "status"}
      aria-live={isAlert ? "assertive" : "polite"}
      onClick={onDismiss}
      style={{ cursor: "pointer" }}
    >
      {toast.message}
    </div>
  );
}

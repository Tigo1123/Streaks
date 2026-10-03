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
      {toast.actions?.length > 0 && (
        <span className="toast-actions">
          {toast.actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className="toast-action"
              onClick={(event) => {
                event.stopPropagation();
                action.onClick();
                onDismiss();
              }}
            >
              {action.label}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

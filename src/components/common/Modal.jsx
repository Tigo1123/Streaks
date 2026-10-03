import React, { useEffect, useRef } from "react";

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  preventClose = false,
  maxWidth = 460,
  ariaLabel
}) {
  const dialogRef = useRef(null);
  const openerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    openerRef.current = document.activeElement;

    // Trap focus inside modal
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Focus first interactive element or dialog itself
    const focusable = dialog.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const visibleElements = Array.from(focusable).filter((el) => !el.hidden && el.getClientRects().length > 0);

    if (visibleElements.length > 0) {
      visibleElements[0].focus();
    } else {
      dialog.focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (!preventClose) {
          e.preventDefault();
          onClose?.();
        }
        return;
      }

      if (e.key === "Tab") {
        const currentFocusable = dialog.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const items = Array.from(currentFocusable).filter((el) => !el.hidden && el.getClientRects().length > 0);

        if (!items.length) {
          e.preventDefault();
          dialog.focus();
          return;
        }

        const first = items[0];
        const last = items[items.length - 1];

        if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (openerRef.current && typeof openerRef.current.focus === "function") {
        openerRef.current.focus();
      }
    };
  }, [isOpen, onClose, preventClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !preventClose) {
      onClose?.();
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      aria-hidden="false"
    >
      <div
        ref={dialogRef}
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modalTitle" : undefined}
        aria-label={!title ? ariaLabel : undefined}
        tabIndex="-1"
        style={{ width: `min(100%, ${maxWidth}px)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          {title && <h2 id="modalTitle" className="modal-title">{title}</h2>}
          {!preventClose && (
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label="Close dialog"
            >
              ✕
            </button>
          )}
        </div>

        <div className="modal-body">
          {children}
        </div>

        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default Modal;

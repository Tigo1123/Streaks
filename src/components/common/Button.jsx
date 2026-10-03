import React from "react";

export function Button({
  children,
  variant = "secondary", // "primary" | "secondary" | "danger" | "icon" | "outline" | "ghost"
  size = "md", // "sm" | "md" | "lg"
  type = "button",
  disabled = false,
  isLoading = false,
  ariaLabel,
  className = "",
  onClick,
  ...rest
}) {
  const baseClass = variant === "icon" ? "btn-icon" : "btn";
  const variantClass = variant !== "icon" ? `btn-${variant}` : "";
  const sizeClass = size !== "md" ? `btn-${size}` : "";
  const combinedClass = [baseClass, variantClass, sizeClass, className].filter(Boolean).join(" ");

  return (
    <button
      type={type}
      className={combinedClass}
      disabled={disabled || isLoading}
      aria-label={ariaLabel}
      aria-busy={isLoading ? "true" : undefined}
      onClick={onClick}
      {...rest}
    >
      {isLoading ? (
        <>
          <span className="spinner-inline" aria-hidden="true">⏳</span>
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

export default Button;

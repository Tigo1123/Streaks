import React from "react";

export function Badge({
  children,
  variant = "neutral", // "active" | "complete" | "missed" | "neutral" | "danger" | "warning"
  icon,
  className = ""
}) {
  const combinedClass = `badge badge-${variant} ${className}`.trim();

  return (
    <span className={combinedClass}>
      {icon && <span aria-hidden="true" style={{ fontSize: "0.85em" }}>{icon}</span>}
      <span>{children}</span>
    </span>
  );
}

export default Badge;

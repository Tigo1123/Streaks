import React from "react";

export function ProgressBar({
  value = 0,
  label = "Progress",
  showText = false,
  height = 7,
  className = ""
}) {
  const clampedValue = Math.min(100, Math.max(0, Math.round(Number(value) || 0)));

  return (
    <div className={`progress-bar-container ${className}`.trim()}>
      <div
        className="progress-bar-track"
        style={{ height: `${height}px` }}
        role="progressbar"
        aria-label={label}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={clampedValue}
      >
        <div
          className="progress-bar-fill"
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      {showText && (
        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
          {clampedValue}%
        </span>
      )}
    </div>
  );
}

export default ProgressBar;

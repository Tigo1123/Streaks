import React, { useId } from "react";

export function ProgressRing({ value = 0, label, size = 88, className = "" }) {
  const id = useId().replaceAll(":", "");
  const percentage = Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percentage / 100);

  return (
    <div
      className={`progress-ring ${className}`.trim()}
      role="img"
      aria-label={`${label}: ${percentage}%`}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={`${id}-outer`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-accent-violet)" />
            <stop offset="100%" stopColor="var(--color-accent-blue)" />
          </linearGradient>
          <linearGradient id={`${id}-inner`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-accent-violet)" />
            <stop offset="100%" stopColor="var(--color-accent-blue)" />
          </linearGradient>
        </defs>
        <circle className="progress-ring-outer-track" cx="50" cy="50" r="48" />
        <circle className="progress-ring-outer" cx="50" cy="50" r="48" stroke={`url(#${id}-outer)`} />
        <circle className="progress-ring-inner-track" cx="50" cy="50" r={radius} />
        <circle
          className="progress-ring-inner"
          cx="50"
          cy="50"
          r={radius}
          stroke={`url(#${id}-inner)`}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="progress-ring-value" aria-hidden="true">{percentage}%</span>
    </div>
  );
}

export default ProgressRing;

import React from "react";

const paths = {
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  chart: (
    <>
      <path d="M4 19.5h16" />
      <path d="m5.5 15.5 4-4 3 2 5.5-7" />
      <path d="M14.5 6.5H18v3.5" />
    </>
  ),
  bolt: <path d="m13.5 2.8-8 10h6l-1 8.4 8-10h-6l1-8.4Z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9h17M3.5 15h17M12 3c2.1 2.4 3.2 5.4 3.2 9s-1.1 6.6-3.2 9c-2.1-2.4-3.2-5.4-3.2-9S9.9 5.4 12 3Z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.7-3.1 3.4-5 7-5s6.3 1.9 7 5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />
};

export function LineIcon({ name, size = 20, className = "" }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

export default LineIcon;

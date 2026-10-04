const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getSidebarFocusableItems(sidebar) {
  if (!sidebar) return [];
  return Array.from(sidebar.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hidden && element.getClientRects().length > 0);
}

export function focusFirstSidebarItem(sidebar) {
  const first = getSidebarFocusableItems(sidebar)[0];
  if (first) first.focus();
  else sidebar?.focus();
}

export function handleSidebarKeyDown(event, sidebar, onClose) {
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key !== "Tab") return;

  const items = getSidebarFocusableItems(sidebar);
  if (!items.length) {
    event.preventDefault();
    sidebar?.focus();
    return;
  }

  const first = items[0];
  const last = items[items.length - 1];
  const activeElement = sidebar.ownerDocument?.activeElement;

  if (event.shiftKey && (activeElement === first || !sidebar.contains(activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (activeElement === last || !sidebar.contains(activeElement))) {
    event.preventDefault();
    first.focus();
  }
}

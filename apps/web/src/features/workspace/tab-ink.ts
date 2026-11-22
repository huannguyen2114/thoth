/**
 * The sliding underline under the dock's tabs (ADR-0048). dockview owns the tab DOM, so each
 * group header gets one extra, absolutely placed element that we move under the active tab.
 * CSS transitions it with a spring-like curve; the global reduced-motion rule turns that off.
 */
export function syncTabInk(root: HTMLElement) {
  for (const header of root.querySelectorAll<HTMLElement>(".dv-tabs-and-actions-container")) {
    let ink = header.querySelector<HTMLElement>(":scope > .ws-tab-ink");
    const tab = header.querySelector<HTMLElement>(".dv-tab.dv-active-tab");
    if (!tab) {
      ink?.remove();
      continue;
    }
    const fresh = !ink;
    if (!ink) {
      ink = document.createElement("span");
      ink.className = "ws-tab-ink";
      ink.setAttribute("aria-hidden", "true");
      header.append(ink);
    }
    const h = header.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    // Inset like the old underline: a little in from each side of the tab.
    const inset = 8;
    const left = Math.max(0, t.left - h.left + inset);
    const width = Math.max(0, Math.min(t.right - h.left, h.width) - inset - left);
    if (fresh) ink.style.transition = "none";
    ink.style.transform = `translateX(${left}px)`;
    ink.style.width = `${width}px`;
    if (fresh) {
      void ink.offsetWidth;
      ink.style.transition = "";
    }
  }
}

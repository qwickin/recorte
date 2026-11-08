import { CodedError } from "./i18n";

/**
 * `captureVisibleTab(windowId)` captures whatever tab is active in that window. A capture must therefore check,
 * right before (and after) each call, that the tab it started on is still the active one and still shows the
 * same URL — otherwise another page's pixels would be stored under this page's URL.
 */

export interface TabSnapshot {
  id?: number;
  windowId?: number;
  url?: string;
  active?: boolean;
}

export interface CaptureTarget {
  tabId: number;
  windowId: number;
  url: string;
}

/** Its text is the "error.tabChanged" message, translated where it is shown (see CodedError). */
export class TabChangedError extends CodedError {
  constructor() {
    super("error.tabChanged");
    this.name = "TabChangedError";
  }
}

/** True when `current` is still the capture target: same tab, same window, active, same URL. */
export function isSameTarget(target: CaptureTarget, current: TabSnapshot | undefined | null): boolean {
  return (
    !!current &&
    current.id === target.tabId &&
    current.windowId === target.windowId &&
    current.active === true &&
    current.url === target.url
  );
}

/** Builds a guard that throws `TabChangedError` when the target tab is gone, inactive or navigated. */
export function makeTabGuard(target: CaptureTarget, getTab: (tabId: number) => Promise<TabSnapshot>): () => Promise<void> {
  return async () => {
    let current: TabSnapshot | undefined;
    try {
      current = await getTab(target.tabId);
    } catch {
      current = undefined; // tab closed
    }
    if (!isSameTarget(target, current)) throw new TabChangedError();
  };
}

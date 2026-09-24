/**
 * Is this node part of the player's own chrome? Every OSD region carries
 * `data-osd`, which makes one predicate serve both jobs: the touch gesture
 * machine ignores presses that land on a control, and TV focus knows which
 * elements belong to the OSD.
 */
export function isChrome(target: EventTarget | null) {
  return target instanceof Element && target.closest("[data-osd]") !== null;
}

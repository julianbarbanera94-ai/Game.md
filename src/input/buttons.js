// Multi-touch-safe button activation.
//
// Browsers only synthesize a `click` for a tap made with a single finger. On a
// phone the left thumb is almost always resting on the stick, so taps on
// menu/shop/hotbar buttons made with the other thumb never produced a click.
// This fires the click ourselves on pointerup (when the finger lifts over the
// same button it went down on) and swallows the browser's own click if one
// follows, so a button never fires twice.
export function installTapActivation() {
  let down = null; // { button, pointerId }
  let synthetic = null; // { at } — we already clicked for the current gesture

  const buttonAt = (el) => el?.closest?.('button') || null;

  document.addEventListener('pointerdown', (e) => {
    synthetic = null; // a new touch starts a new gesture
    const button = buttonAt(e.target);
    down = button && !button.disabled ? { button, pointerId: e.pointerId } : null;
  }, true);

  document.addEventListener('pointerup', (e) => {
    if (!down || down.pointerId !== e.pointerId) return;
    const { button } = down;
    down = null;
    if (!button.isConnected || button.disabled) return;
    if (buttonAt(document.elementFromPoint(e.clientX, e.clientY)) !== button) return;
    synthetic = { at: performance.now() };
    button.click();
  }, true);

  document.addEventListener('pointercancel', () => { down = null; }, true);

  // The browser's own click for a tap we already handled. It is swallowed
  // whatever its target: if the tap opened a dialog, that click now lands on
  // the dialog's backdrop and would close it again.
  document.addEventListener('click', (e) => {
    if (!e.isTrusted || !synthetic) return;
    const fresh = performance.now() - synthetic.at < 500;
    synthetic = null;
    if (fresh) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);
}

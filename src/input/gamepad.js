// Gamepad menus: when a panel (or the title screen) is showing, the d-pad
// moves a visible focus between its buttons, A presses the focused one and B
// closes the panel. In the world the codes go to the game as usual.

const FOCUSABLE = 'button:not([disabled]), input[type="range"], [data-pad-focus]';

function visible(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function centre(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// The nearest focusable element in a direction (dx, dy), favouring ones straight ahead.
export function nextFocus(root, from, dx, dy) {
  const items = [...root.querySelectorAll(FOCUSABLE)].filter(visible);
  if (!items.length) return null;
  if (!from || !root.contains(from)) return items[0];
  const a = centre(from);
  let best = null;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === from) continue;
    const b = centre(el);
    const vx = b.x - a.x, vy = b.y - a.y;
    const ahead = vx * dx + vy * dy; // distance along the pressed direction
    if (ahead <= 4) continue;
    const side = Math.abs(vx * dy - vy * dx); // distance off to the side
    const score = ahead + side * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best || from;
}

const DIRS = { PadUp: [0, -1], PadDown: [0, 1], PadLeft: [-1, 0], PadRight: [1, 0] };

// Handles a pad code for an open menu. Returns true when it was used.
export function padMenu(root, code) {
  document.body.classList.add('pad-nav');
  const cur = document.activeElement;
  if (DIRS[code]) {
    if (cur instanceof HTMLInputElement && cur.type === 'range' && code !== 'PadUp' && code !== 'PadDown') {
      // left/right adjust a slider
      cur.value = String(Number(cur.value) + (code === 'PadRight' ? 5 : -5));
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      cur.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    const next = nextFocus(root, cur, ...DIRS[code]);
    if (next) {
      next.focus();
      next.scrollIntoView({ block: 'nearest' });
    }
    return true;
  }
  if (code === 'PadA') {
    const target = cur && root.contains(cur) ? cur : nextFocus(root, null, 0, 1);
    if (target) {
      if (target === cur) target.click();
      else target.focus();
    }
    return true;
  }
  return false;
}

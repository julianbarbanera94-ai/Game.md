// Minimal synchronous event bus used to connect gameplay systems
// (farming, economy) to listeners (quests, audio, HUD).
export class EventBus {
  constructor() {
    this.handlers = new Map();
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  emit(type, payload = {}) {
    for (const fn of this.handlers.get(type) || []) fn(payload, type);
    for (const fn of this.handlers.get('*') || []) fn(payload, type);
  }
}

// Used by systems when no bus is supplied (e.g. tests).
export const NULL_BUS = { emit() {}, on() { return () => {}; } };

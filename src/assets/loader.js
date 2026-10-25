// Loads assets/manifest.json and the images the game needs. Every sprite is
// referenced by manifest key (e.g. "building.starter_house"), never by path.

export class Assets {
  constructor() {
    this.manifest = {};
    this.images = new Map();
    this.missing = [];
  }

  async loadManifest(url = 'assets/manifest.json') {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load asset manifest (${res.status})`);
    this.manifest = (await res.json()).assets;
  }

  entry(key) {
    return this.manifest[key] || null;
  }

  async loadImages(keys, onProgress) {
    let done = 0;
    const unique = [...new Set(keys)];
    await Promise.all(
      unique.map(
        (key) =>
          new Promise((resolve) => {
            const e = this.manifest[key];
            const finish = () => {
              done += 1;
              onProgress?.(done / unique.length);
              resolve();
            };
            if (!e) {
              this.missing.push(key);
              finish();
              return;
            }
            const img = new Image();
            img.onload = () => {
              this.images.set(key, img);
              finish();
            };
            img.onerror = () => {
              this.missing.push(key);
              finish();
            };
            img.src = e.file;
          }),
      ),
    );
    if (this.missing.length) console.warn('[assets] missing:', this.missing);
  }

  get(key) {
    return this.images.get(key) || null;
  }

  url(key) {
    return this.manifest[key]?.file || '';
  }
}

// Generates the sample artwork used by `pnpm seed`. Deterministic, so the same
// seed always produces the same pieces — offline, no placeholder service, and
// no rate limit.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve(import.meta.dirname, '../../web/public/mock');

/** Small deterministic PRNG (mulberry32). */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES = [
  { name: 'Ember', bg: '#1b1210', ink: '#f7e6d0', hues: ['#e2553d', '#f2a03d', '#c3312a', '#f6d365'] },
  { name: 'Tidal', bg: '#0d1b24', ink: '#dbeef5', hues: ['#2c7da0', '#61a5c2', '#168aad', '#99d8e8'] },
  { name: 'Moss', bg: '#12180f', ink: '#e6efdc', hues: ['#5a8f4a', '#8fbc6d', '#3c6e37', '#cfe6a8'] },
  { name: 'Bloom', bg: '#1a1020', ink: '#f2e4f7', hues: ['#8e4aa8', '#c877d4', '#5c2f78', '#e9a8e0'] },
  { name: 'Slate', bg: '#f4f5f7', ink: '#1b1f24', hues: ['#2f3a45', '#5a6b7a', '#8fa1b0', '#c3ced8'] },
  { name: 'Solar', bg: '#faf6ec', ink: '#26211a', hues: ['#d99b28', '#e8c44f', '#a86a1f', '#f3e0a1'] },
];

const pick = (r, list) => list[Math.floor(r() * list.length)];

/* Each style is a different structural idea rather than a recolour of one. */
const STYLES = {
  arcs(r, p) {
    const parts = [];
    const rings = 7 + Math.floor(r() * 6);
    for (let i = 0; i < rings; i++) {
      const radius = 60 + i * (340 / rings);
      const start = r() * 360;
      const sweep = 60 + r() * 230;
      const a0 = (start * Math.PI) / 180;
      const a1 = ((start + sweep) * Math.PI) / 180;
      const large = sweep > 180 ? 1 : 0;
      parts.push(
        `<path d="M ${500 + radius * Math.cos(a0)} ${500 + radius * Math.sin(a0)} A ${radius} ${radius} 0 ${large} 1 ${500 + radius * Math.cos(a1)} ${500 + radius * Math.sin(a1)}" fill="none" stroke="${pick(r, p.hues)}" stroke-width="${5 + r() * 26}" stroke-linecap="round" opacity="${0.55 + r() * 0.45}"/>`,
      );
    }
    return parts.join('');
  },

  grid(r, p) {
    const parts = [];
    const n = 5 + Math.floor(r() * 4);
    const cell = 1000 / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (r() < 0.16) continue;
        const s = cell * (0.35 + r() * 0.5);
        const cx = x * cell + cell / 2;
        const cy = y * cell + cell / 2;
        parts.push(
          `<rect x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" fill="${pick(r, p.hues)}" opacity="${0.5 + r() * 0.5}" transform="rotate(${r() * 90} ${cx} ${cy})" rx="${r() * 8}"/>`,
        );
      }
    }
    return parts.join('');
  },

  ribbons(r, p) {
    const parts = [];
    const count = 5 + Math.floor(r() * 5);
    for (let i = 0; i < count; i++) {
      const y = 120 + (i * 760) / count;
      parts.push(
        `<path d="M -40 ${y} C ${250 + r() * 220} ${y - 220 + r() * 440}, ${520 + r() * 260} ${y - 220 + r() * 440}, 1040 ${y + (r() - 0.5) * 300}" fill="none" stroke="${pick(r, p.hues)}" stroke-width="${14 + r() * 50}" stroke-linecap="round" opacity="${0.45 + r() * 0.4}"/>`,
      );
    }
    return parts.join('');
  },

  packing(r, p) {
    const parts = [];
    const placed = [];
    let tries = 0;
    while (placed.length < 44 && tries < 2600) {
      tries++;
      const radius = 14 + r() * 95;
      const cx = radius + r() * (1000 - radius * 2);
      const cy = radius + r() * (1000 - radius * 2);
      if (placed.some((c) => Math.hypot(c.cx - cx, c.cy - cy) < c.radius + radius + 7)) {
        continue;
      }
      placed.push({ cx, cy, radius });
      const filled = r() > 0.38;
      parts.push(
        `<circle cx="${cx}" cy="${cy}" r="${radius}" ${filled ? `fill="${pick(r, p.hues)}" opacity="${0.5 + r() * 0.5}"` : `fill="none" stroke="${pick(r, p.hues)}" stroke-width="${3 + r() * 9}"`}/>`,
      );
    }
    return parts.join('');
  },

  strata(r, p) {
    const parts = [];
    let y = 0;
    while (y < 1000) {
      const h = 22 + r() * 120;
      const skew = (r() - 0.5) * 90;
      parts.push(
        `<path d="M 0 ${y} L 1000 ${y + skew} L 1000 ${y + skew + h} L 0 ${y + h} Z" fill="${pick(r, p.hues)}" opacity="${0.4 + r() * 0.55}"/>`,
      );
      y += h;
    }
    return parts.join('');
  },
};

const STYLE_NAMES = Object.keys(STYLES);

export function artwork(seed) {
  const r = rng(seed);
  const palette = PALETTES[seed % PALETTES.length];
  const style = STYLE_NAMES[Math.floor(r() * STYLE_NAMES.length)];

  const body = STYLES[style](r, palette);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
<rect width="1000" height="1000" fill="${palette.bg}"/>
<g>${body}</g>
</svg>`;

  return { svg, palette, style };
}

const TITLES = {
  arcs: ['Meridian', 'Sweep', 'Orbit', 'Transit'],
  grid: ['Lattice', 'Plot', 'Quadrant', 'Index'],
  ribbons: ['Current', 'Drift', 'Thread', 'Passage'],
  packing: ['Cluster', 'Colony', 'Spore', 'Bloom'],
  strata: ['Strata', 'Seam', 'Bedding', 'Fault'],
};

const BLURBS = {
  arcs: 'Concentric sweeps drawn from a single seed, each arc taking its angle and weight from the one before it.',
  grid: 'A regular lattice disturbed by rotation, where every cell decides its own size and angle.',
  ribbons: 'Bezier paths crossing the frame, weighted so the eye follows one band at a time.',
  packing: 'Circles placed until no more fit, filled or outlined at random.',
  strata: 'Sedimentary bands laid down in sequence, each one skewing the horizon a little further.',
};

/** Metadata in the OpenSea shape, matching what the piece actually is. */
export function metadata(seed, baseUrl) {
  const { palette, style } = artwork(seed);
  const titles = TITLES[style];
  const name = `${titles[seed % titles.length]} No.${seed}`;

  return {
    name,
    description: BLURBS[style],
    image: `${baseUrl}/mock/${seed}.svg`,
    background_color: palette.bg.replace('#', ''),
    attributes: [
      { trait_type: 'Palette', value: palette.name },
      { trait_type: 'Structure', value: style[0].toUpperCase() + style.slice(1) },
      { trait_type: 'Edition', value: seed, display_type: 'number', max_value: 14 },
      {
        trait_type: 'Generated',
        value: 1735689600 + seed * 86400,
        display_type: 'date',
      },
    ],
  };
}

export const COUNT = 14;

if (import.meta.filename === process.argv[1]) {
  const baseUrl = process.env.MOCK_BASE_URL ?? 'http://localhost:3000';
  mkdirSync(OUT, { recursive: true });

  for (let i = 1; i <= COUNT; i++) {
    writeFileSync(resolve(OUT, `${i}.svg`), artwork(i).svg);
    writeFileSync(
      resolve(OUT, `${i}.json`),
      JSON.stringify(metadata(i, baseUrl), null, 2),
    );
  }

  console.log(`wrote ${COUNT} artworks and metadata to web/public/mock/`);
}

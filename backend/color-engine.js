#!/usr/bin/env node
/* ============================================
   J4J COLOR ENGINE — Palette Variation Generator
   ============================================
   Takes a base pattern and generates color variations
   using hue rotation, tinting, and color mapping.

   Usage:
     node color-engine.js --input pattern.jpg --palette metallics --output ./variations
     node color-engine.js --input pattern.jpg --colors "rose-gold,amethyst,sapphire"
     node color-engine.js --input pattern.jpg --palette pastels --preview
   ============================================ */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('sharp is required. Run: npm install sharp');
  process.exit(1);
}

// --- Color Definitions (matching J4J product line) ---
const COLORS = {
  'rose-gold':    { h: 10,  s: 0.40, l: 0.60, hex: '#B76E79', tint: [183, 110, 121] },
  'gold':         { h: 45,  s: 0.75, l: 0.52, hex: '#D4AF37', tint: [212, 175, 55] },
  'silver':       { h: 0,   s: 0.00, l: 0.75, hex: '#C0C0C0', tint: [192, 192, 192] },
  'amethyst':     { h: 270, s: 0.50, l: 0.60, hex: '#9966CC', tint: [153, 102, 204] },
  'sapphire':     { h: 220, s: 0.85, l: 0.39, hex: '#0F52BA', tint: [15, 82, 186] },
  'emerald':      { h: 140, s: 0.52, l: 0.55, hex: '#50C878', tint: [80, 200, 120] },
  'ruby':         { h: 340, s: 0.90, l: 0.47, hex: '#E0115F', tint: [224, 17, 95] },
  'opal':         { h: 160, s: 0.20, l: 0.72, hex: '#A8C3BC', tint: [168, 195, 188] },
  'cotton-candy': { h: 330, s: 0.60, l: 0.87, hex: '#FFBCD9', tint: [255, 188, 217] },
  'black':        { h: 0,   s: 0.00, l: 0.11, hex: '#1C1C1C', tint: [28, 28, 28] },
  'steel-gray':   { h: 200, s: 0.05, l: 0.47, hex: '#71797E', tint: [113, 121, 126] },
  'cream':        { h: 55,  s: 0.50, l: 0.91, hex: '#FFFDD0', tint: [255, 253, 208] },
  'brown':        { h: 25,  s: 0.75, l: 0.31, hex: '#8B4513', tint: [139, 69, 19] },
  'dusty-rose':   { h: 20,  s: 0.40, l: 0.73, hex: '#DCAE96', tint: [220, 174, 150] },
  'sage':         { h: 75,  s: 0.15, l: 0.62, hex: '#B2AC88', tint: [178, 172, 136] },
  'navy':         { h: 240, s: 1.00, l: 0.25, hex: '#000080', tint: [0, 0, 128] },
  'burgundy':     { h: 345, s: 1.00, l: 0.25, hex: '#800020', tint: [128, 0, 32] },
  'teal':         { h: 180, s: 1.00, l: 0.25, hex: '#008080', tint: [0, 128, 128] },
};

// --- Palette Presets (curated for J4J product collections) ---
const PALETTES = {
  metallics: {
    name: 'Metallics Collection',
    description: 'Gold, Silver, Rose Gold — J4J bestseller palette',
    colors: ['gold', 'rose-gold', 'silver', 'amethyst', 'sapphire', 'emerald', 'ruby', 'opal', 'cotton-candy', 'black'],
  },
  'metallics-core': {
    name: 'Metallics Core',
    description: 'The essential 5 metallic colors',
    colors: ['gold', 'rose-gold', 'silver', 'amethyst', 'sapphire'],
  },
  jewel: {
    name: 'Jewel Tones',
    description: 'Rich saturated gemstone colors',
    colors: ['amethyst', 'sapphire', 'emerald', 'ruby', 'teal', 'burgundy'],
  },
  earth: {
    name: 'Earth Tones',
    description: 'Warm natural colors for vintage aesthetic',
    colors: ['brown', 'cream', 'dusty-rose', 'sage', 'opal', 'steel-gray'],
  },
  pastels: {
    name: 'Soft Pastels',
    description: 'Light dreamy colors for spring/summer',
    colors: ['cotton-candy', 'dusty-rose', 'cream', 'opal', 'sage'],
  },
  dark: {
    name: 'Dark & Moody',
    description: 'Gothic / dark academia palette',
    colors: ['black', 'navy', 'burgundy', 'steel-gray', 'brown'],
  },
  rainbow: {
    name: 'Rainbow Full',
    description: 'All major colors for maximum variety',
    colors: ['ruby', 'gold', 'emerald', 'sapphire', 'amethyst', 'cotton-candy', 'teal', 'brown', 'navy', 'burgundy'],
  },
  vintage: {
    name: 'Vintage Muted',
    description: 'Muted tones for vintage/distressed papers',
    colors: ['cream', 'dusty-rose', 'sage', 'steel-gray', 'brown', 'opal'],
  },
  // Matches existing J4J damask product line
  'j4j-damask': {
    name: 'J4J Damask (Match Existing)',
    description: 'Blue, Brown, Cream, Green, Orange, Purple, Red, Yellow — matches existing shop listings',
    colors: ['sapphire', 'brown', 'cream', 'emerald', 'gold', 'amethyst', 'ruby', 'dusty-rose'],
  },
};

// --- Recoloring Methods ---

/**
 * Method 1: Hue Rotation
 * Rotates the hue channel in HSL space. Good for patterns with a clear dominant hue.
 */
async function recolorHueShift(inputBuffer, targetColor, options = {}) {
  const color = COLORS[targetColor] || COLORS.gold;
  const metadata = await sharp(inputBuffer).metadata();

  // Extract raw pixel data
  const { data, info } = await sharp(inputBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data);
  const channels = info.channels;

  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const [h, s, l] = rgbToHsl(r, g, b);

    // Shift hue to target, preserve saturation and lightness
    const newH = color.h / 360;
    const newS = Math.min(1, s * (0.5 + color.s * 0.8));
    const [nr, ng, nb] = hslToRgb(newH, newS, l);

    pixels[i] = nr;
    pixels[i + 1] = ng;
    pixels[i + 2] = nb;
  }

  return sharp(Buffer.from(pixels), {
    raw: { width: info.width, height: info.height, channels: info.channels }
  })
    .withMetadata({ density: options.dpi || 300 })
    .jpeg({ quality: 95 })
    .toBuffer();
}

/**
 * Method 2: Tint Overlay
 * Converts to grayscale then applies a color tint. Best for metallic/glitter textures.
 */
async function recolorTint(inputBuffer, targetColor, options = {}) {
  const color = COLORS[targetColor] || COLORS.gold;
  const [r, g, b] = color.tint;
  const intensity = options.intensity || 0.65;

  // Convert to grayscale first, then tint
  const grayscale = await sharp(inputBuffer)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(grayscale.data);
  const outPixels = new Uint8Array(pixels.length * 3); // expand to RGB

  for (let i = 0; i < pixels.length; i++) {
    const gray = pixels[i];
    // Blend grayscale with tint color
    outPixels[i * 3] = Math.round(gray * (1 - intensity) + r * intensity * (gray / 255));
    outPixels[i * 3 + 1] = Math.round(gray * (1 - intensity) + g * intensity * (gray / 255));
    outPixels[i * 3 + 2] = Math.round(gray * (1 - intensity) + b * intensity * (gray / 255));
  }

  return sharp(Buffer.from(outPixels), {
    raw: { width: grayscale.info.width, height: grayscale.info.height, channels: 3 }
  })
    .withMetadata({ density: options.dpi || 300 })
    .jpeg({ quality: 95 })
    .toBuffer();
}

/**
 * Method 3: Color Multiply
 * Multiplies each pixel by the target color. Preserves texture detail, shifts overall tone.
 * Great for damask and patterned papers.
 */
async function recolorMultiply(inputBuffer, targetColor, options = {}) {
  const color = COLORS[targetColor] || COLORS.gold;
  const [tr, tg, tb] = color.tint;

  const { data, info } = await sharp(inputBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data);
  const channels = info.channels;

  for (let i = 0; i < pixels.length; i += channels) {
    pixels[i] = Math.round((pixels[i] * tr) / 255);
    pixels[i + 1] = Math.round((pixels[i + 1] * tg) / 255);
    pixels[i + 2] = Math.round((pixels[i + 2] * tb) / 255);
  }

  return sharp(Buffer.from(pixels), {
    raw: { width: info.width, height: info.height, channels }
  })
    .withMetadata({ density: options.dpi || 300 })
    .jpeg({ quality: 95 })
    .toBuffer();
}

/**
 * Method 4: Duotone
 * Maps shadows to one color and highlights to another. High-impact, artistic results.
 */
async function recolorDuotone(inputBuffer, targetColor, options = {}) {
  const color = COLORS[targetColor] || COLORS.gold;
  const [hr, hg, hb] = color.tint; // highlight color
  // Shadow color: darker version
  const sr = Math.round(hr * 0.15);
  const sg = Math.round(hg * 0.15);
  const sb = Math.round(hb * 0.15);

  const grayscale = await sharp(inputBuffer)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(grayscale.data);
  const outPixels = new Uint8Array(pixels.length * 3);

  for (let i = 0; i < pixels.length; i++) {
    const t = pixels[i] / 255; // 0 = shadow, 1 = highlight
    outPixels[i * 3] = Math.round(sr * (1 - t) + hr * t);
    outPixels[i * 3 + 1] = Math.round(sg * (1 - t) + hg * t);
    outPixels[i * 3 + 2] = Math.round(sb * (1 - t) + hb * t);
  }

  return sharp(Buffer.from(outPixels), {
    raw: { width: grayscale.info.width, height: grayscale.info.height, channels: 3 }
  })
    .withMetadata({ density: options.dpi || 300 })
    .jpeg({ quality: 95 })
    .toBuffer();
}

// --- Auto-Select Best Method ---
function selectMethod(preset) {
  const methodMap = {
    metallic: 'tint', 'metallic-foil': 'tint', 'metallic-glitter': 'tint',
    damask: 'hue-shift', 'damask-pysanky': 'hue-shift', 'damask-mayan': 'hue-shift',
    watercolor: 'multiply', 'watercolor-floral': 'multiply',
    vintage: 'duotone', 'vintage-ephemera': 'duotone',
    floral: 'hue-shift', geometric: 'hue-shift', chevron: 'hue-shift',
    stars: 'hue-shift', mosaic: 'multiply',
    'cottage-floral': 'hue-shift', 'dark-academia': 'duotone', gothic: 'duotone',
  };
  return methodMap[preset] || 'hue-shift';
}

const METHODS = {
  'hue-shift': recolorHueShift,
  'tint': recolorTint,
  'multiply': recolorMultiply,
  'duotone': recolorDuotone,
};

// --- Main: Generate Variations ---
async function generateVariations(options) {
  const {
    inputPath,
    colors,
    palette,
    method,
    preset,
    outputDir,
    baseName,
    dpi = 300,
  } = options;

  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  // Determine colors
  let colorList = colors;
  if (!colorList && palette) {
    const pal = PALETTES[palette];
    if (!pal) throw new Error(`Unknown palette: ${palette}. Use: ${Object.keys(PALETTES).join(', ')}`);
    colorList = pal.colors;
  }
  if (!colorList) {
    colorList = PALETTES.metallics.colors;
  }

  // Determine method
  const recolorMethod = method || selectMethod(preset || '');
  const recolorFn = METHODS[recolorMethod] || recolorHueShift;

  // Prepare output
  const outDir = outputDir || path.join(path.dirname(inputPath), 'variations');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const name = baseName || path.basename(inputPath, path.extname(inputPath));
  const inputBuffer = fs.readFileSync(inputPath);

  console.log(`\n=== Color Variation Engine ===`);
  console.log(`Input: ${inputPath}`);
  console.log(`Method: ${recolorMethod}`);
  console.log(`Colors: ${colorList.join(', ')} (${colorList.length} variations)`);
  console.log(`Output: ${outDir}\n`);

  const results = [];

  for (let i = 0; i < colorList.length; i++) {
    const colorId = colorList[i];
    const colorDef = COLORS[colorId];
    if (!colorDef) {
      console.log(`  [${i + 1}/${colorList.length}] SKIP: Unknown color "${colorId}"`);
      results.push({ color: colorId, error: 'Unknown color' });
      continue;
    }

    const colorName = colorId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    console.log(`  [${i + 1}/${colorList.length}] ${colorName} (${colorDef.hex})...`);

    try {
      const recolored = await recolorFn(inputBuffer, colorId, { dpi });
      const fileName = `${name}-${colorId}.jpg`;
      const filePath = path.join(outDir, fileName);
      fs.writeFileSync(filePath, recolored);

      const sizeMB = (recolored.length / 1024 / 1024).toFixed(1);
      console.log(`    Saved: ${fileName} (${sizeMB}MB)`);

      results.push({
        color: colorId,
        colorName,
        hex: colorDef.hex,
        file: filePath,
        size: recolored.length,
        method: recolorMethod,
      });
    } catch (e) {
      console.error(`    ERROR: ${e.message}`);
      results.push({ color: colorId, error: e.message });
    }
  }

  // Save manifest
  const manifest = {
    source: inputPath,
    baseName: name,
    method: recolorMethod,
    palette: palette || 'custom',
    generatedAt: new Date().toISOString(),
    variations: results,
  };
  const manifestPath = path.join(outDir, 'variations.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const successCount = results.filter(r => !r.error).length;
  console.log(`\nDone: ${successCount}/${colorList.length} variations generated.`);
  console.log(`Manifest: ${manifestPath}`);

  return manifest;
}

// --- Generate Preview Strip (small thumbnails of all variations) ---
async function generatePreviewStrip(options) {
  const { inputPath, colors, palette, method, preset } = options;

  const colorList = colors || PALETTES[palette]?.colors || PALETTES.metallics.colors;
  const recolorMethod = method || selectMethod(preset || '');
  const recolorFn = METHODS[recolorMethod] || recolorHueShift;
  const inputBuffer = fs.readFileSync(inputPath);

  // Generate small thumbnails
  const thumbSize = 150;
  const thumbnails = [];

  for (const colorId of colorList) {
    if (!COLORS[colorId]) continue;
    try {
      const recolored = await recolorFn(inputBuffer, colorId, { dpi: 72 });
      const thumb = await sharp(recolored)
        .resize(thumbSize, thumbSize, { fit: 'cover' })
        .jpeg({ quality: 80 })
        .toBuffer();
      thumbnails.push({ color: colorId, buffer: thumb });
    } catch {
      // Skip failed thumbnails
    }
  }

  // Compose into strip
  const stripWidth = thumbSize * thumbnails.length + (thumbnails.length - 1) * 4;
  const composites = thumbnails.map((t, i) => ({
    input: t.buffer,
    left: i * (thumbSize + 4),
    top: 0,
  }));

  const strip = await sharp({
    create: {
      width: stripWidth,
      height: thumbSize,
      channels: 3,
      background: { r: 13, g: 17, b: 23 }, // --bg color
    }
  })
    .composite(composites)
    .jpeg({ quality: 85 })
    .toBuffer();

  return strip;
}

// --- HSL Utilities ---
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// --- Exports ---
export {
  COLORS, PALETTES, METHODS,
  generateVariations, generatePreviewStrip,
  recolorHueShift, recolorTint, recolorMultiply, recolorDuotone,
  selectMethod,
};

// --- CLI ---
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`
J4J Color Engine — Palette Variation Generator

Usage:
  node color-engine.js --input <image> --palette <name>
  node color-engine.js --input <image> --colors "gold,amethyst,sapphire"
  node color-engine.js --input <image> --palette metallics --method tint
  node color-engine.js --list-palettes
  node color-engine.js --list-colors
  node color-engine.js --list-methods

Options:
  --input <path>       Source pattern image
  --palette <name>     Palette preset (metallics, jewel, earth, pastels, dark, etc.)
  --colors <list>      Comma-separated color IDs
  --method <name>      Recoloring method (hue-shift, tint, multiply, duotone)
  --preset <name>      Pattern preset (auto-selects best method)
  --output <dir>       Output directory
  --name <name>        Base name for output files
  --preview            Generate preview strip only
`);
    return;
  }

  if (args.includes('--list-palettes')) {
    console.log('\nAvailable Palettes:');
    Object.entries(PALETTES).forEach(([key, val]) => {
      console.log(`  ${key.padEnd(18)} ${val.name.padEnd(25)} (${val.colors.length} colors)`);
    });
    return;
  }

  if (args.includes('--list-colors')) {
    console.log('\nAvailable Colors:');
    Object.entries(COLORS).forEach(([key, val]) => {
      console.log(`  ${key.padEnd(16)} ${val.hex}`);
    });
    return;
  }

  if (args.includes('--list-methods')) {
    console.log('\nRecoloring Methods:');
    console.log('  hue-shift    Rotate hue channel (best for patterned papers)');
    console.log('  tint         Grayscale + color overlay (best for metallics/glitter)');
    console.log('  multiply     Color multiply blend (best for watercolors)');
    console.log('  duotone      Shadow/highlight mapping (best for vintage/gothic)');
    return;
  }

  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
  };

  const inputPath = getArg('--input');
  const palette = getArg('--palette');
  const colorsArg = getArg('--colors');
  const method = getArg('--method');
  const preset = getArg('--preset');
  const outputDir = getArg('--output');
  const baseName = getArg('--name');

  const colors = colorsArg ? colorsArg.split(',').map(c => c.trim()) : undefined;

  if (args.includes('--preview')) {
    const strip = await generatePreviewStrip({ inputPath, colors, palette, method, preset });
    const outPath = path.join(outputDir || path.dirname(inputPath), 'preview-strip.jpg');
    fs.writeFileSync(outPath, strip);
    console.log(`Preview strip saved: ${outPath}`);
    return;
  }

  await generateVariations({ inputPath, colors, palette, method, preset, outputDir, baseName });
}

main().catch(e => {
  console.error(`FATAL: ${e.message}`);
  process.exit(1);
});

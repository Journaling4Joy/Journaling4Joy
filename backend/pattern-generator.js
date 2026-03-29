#!/usr/bin/env node
/* ============================================
   J4J PATTERN GENERATOR — AI-Powered Digital Papers
   ============================================
   Generates seamless tiling digital papers using AI image APIs.
   Supports OpenAI (DALL-E) and Stability AI.

   Usage:
     node pattern-generator.js --preset damask --color "rose gold" --name "Rose Gold Damask"
     node pattern-generator.js --prompt "vintage floral damask" --color "sapphire blue"
     node pattern-generator.js --config generate-config.json
   ============================================ */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, 'generator-config.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'source-assets');

// --- Style Presets (Journaling4Joy Aesthetic) ---
const STYLE_PRESETS = {
  damask: {
    name: 'Damask Pattern',
    prompt: 'seamless repeating damask pattern, ornate baroque flourishes, elegant symmetrical design, intricate scrollwork, textile wallpaper pattern, tileable, high detail',
    negativePrompt: 'text, watermark, logo, blurry, low quality, asymmetric, broken pattern, people, faces',
    style: 'vintage',
  },
  'damask-pysanky': {
    name: 'Pysanky-Inspired Damask',
    prompt: 'seamless repeating damask pattern inspired by Ukrainian pysanky egg art, geometric folk motifs, intricate symmetrical design, ornamental, tileable textile pattern',
    negativePrompt: 'text, watermark, blurry, low quality, broken pattern, people, faces',
    style: 'folk',
  },
  'damask-mayan': {
    name: 'Mayan-Inspired Damask',
    prompt: 'seamless repeating damask pattern with Mayan-inspired geometric motifs, ancient temple carvings, symmetrical stepped pyramids and serpent scrollwork, tileable textile pattern',
    negativePrompt: 'text, watermark, blurry, low quality, broken pattern, people, faces',
    style: 'ancient',
  },
  metallic: {
    name: 'Metallic Texture',
    prompt: 'seamless metallic texture, foil shimmer, glitter sparkle, bokeh light dots, luxurious shiny surface, tileable, high resolution digital paper',
    negativePrompt: 'text, watermark, blurry, matte, flat, dull, people, faces',
    style: 'luxury',
  },
  'metallic-foil': {
    name: 'Metallic Foil',
    prompt: 'seamless crinkled metallic foil texture, reflective hammered metal surface, shimmering light, luxurious, tileable digital paper',
    negativePrompt: 'text, watermark, blurry, matte, flat, people, faces',
    style: 'luxury',
  },
  'metallic-glitter': {
    name: 'Metallic Glitter',
    prompt: 'seamless fine glitter texture, thousands of tiny sparkling particles, macro glitter surface, shimmering, tileable digital paper',
    negativePrompt: 'text, watermark, blurry, matte, chunky, people, faces',
    style: 'luxury',
  },
  watercolor: {
    name: 'Watercolor Wash',
    prompt: 'seamless watercolor wash texture, soft blended paint strokes, wet-on-wet technique, organic flowing colors, artistic paper texture, tileable',
    negativePrompt: 'text, watermark, sharp edges, digital, geometric, people, faces',
    style: 'artistic',
  },
  'watercolor-floral': {
    name: 'Watercolor Floral',
    prompt: 'seamless watercolor floral pattern, delicate hand-painted flowers and leaves, soft botanical illustration, vintage garden roses, tileable fabric pattern',
    negativePrompt: 'text, watermark, sharp edges, photographic, people, faces',
    style: 'botanical',
  },
  vintage: {
    name: 'Vintage Distressed',
    prompt: 'seamless vintage distressed paper texture, aged parchment, coffee-stained, worn edges, antique document background, tileable',
    negativePrompt: 'text, watermark, modern, clean, bright, people, faces',
    style: 'aged',
  },
  'vintage-ephemera': {
    name: 'Vintage Ephemera Collage',
    prompt: 'seamless vintage ephemera collage pattern, old postage stamps, handwritten letters, pressed flowers, antique postcards, aged paper layers, tileable',
    negativePrompt: 'text, watermark, modern, digital, people, faces, readable text',
    style: 'collage',
  },
  floral: {
    name: 'Classic Floral',
    prompt: 'seamless classic floral pattern, botanical illustration style, roses peonies and leaves, Victorian garden motif, elegant tileable textile design',
    negativePrompt: 'text, watermark, blurry, low quality, cartoon, people, faces',
    style: 'botanical',
  },
  geometric: {
    name: 'Geometric Pattern',
    prompt: 'seamless geometric pattern, Art Deco inspired, clean lines, repeating shapes, tessellation, elegant tileable design',
    negativePrompt: 'text, watermark, blurry, organic, messy, people, faces',
    style: 'modern',
  },
  chevron: {
    name: 'Chevron / Zigzag',
    prompt: 'seamless chevron zigzag pattern, clean crisp lines, alternating colored stripes in V-shapes, textile design, tileable',
    negativePrompt: 'text, watermark, blurry, curved, organic, people, faces',
    style: 'graphic',
  },
  stars: {
    name: 'Star Pattern',
    prompt: 'seamless star pattern, scattered stars of varying sizes, celestial night sky design, whimsical, tileable fabric pattern',
    negativePrompt: 'text, watermark, blurry, people, faces',
    style: 'whimsical',
  },
  mosaic: {
    name: 'Mosaic / Rock Texture',
    prompt: 'seamless mosaic stone texture, natural rock surface, small pebbles and stones arranged in organic pattern, earthy mineral, tileable',
    negativePrompt: 'text, watermark, blurry, artificial, plastic, people, faces',
    style: 'natural',
  },
  'cottage-floral': {
    name: 'Cottagecore Floral',
    prompt: 'seamless cottagecore floral pattern, wildflowers and meadow grasses, soft pastel colors, hand-drawn botanical illustration, whimsical garden, tileable fabric design',
    negativePrompt: 'text, watermark, dark, gothic, modern, people, faces',
    style: 'cottagecore',
  },
  'dark-academia': {
    name: 'Dark Academia',
    prompt: 'seamless dark academia pattern, vintage leather book spines, old library shelves, scholarly motifs, quill pens and ink, moody classical, tileable',
    negativePrompt: 'text, watermark, bright colors, modern, people, faces, readable text',
    style: 'scholarly',
  },
  gothic: {
    name: 'Gothic / Witchy',
    prompt: 'seamless gothic pattern, dark elegant damask with moons and stars, apothecary bottles, mystical botanicals, Victorian gothic aesthetic, tileable',
    negativePrompt: 'text, watermark, bright, cheerful, cartoon, people, faces',
    style: 'gothic',
  },
};

// --- Color Palettes (Matching J4J Products) ---
const COLOR_PALETTES = {
  'rose-gold': { name: 'Rose Gold', hex: '#B76E79', hueShift: 0, warmth: 'warm' },
  'gold': { name: 'Gold', hex: '#D4AF37', hueShift: 45, warmth: 'warm' },
  'silver': { name: 'Silver', hex: '#C0C0C0', hueShift: 0, warmth: 'neutral' },
  'amethyst': { name: 'Amethyst Purple', hex: '#9966CC', hueShift: 270, warmth: 'cool' },
  'sapphire': { name: 'Sapphire Blue', hex: '#0F52BA', hueShift: 220, warmth: 'cool' },
  'emerald': { name: 'Emerald Green', hex: '#50C878', hueShift: 140, warmth: 'cool' },
  'ruby': { name: 'Ruby Red', hex: '#E0115F', hueShift: 340, warmth: 'warm' },
  'opal': { name: 'Opal', hex: '#A8C3BC', hueShift: 160, warmth: 'neutral' },
  'cotton-candy': { name: 'Cotton Candy Pink', hex: '#FFBCD9', hueShift: 330, warmth: 'warm' },
  'black': { name: 'Black/Onyx', hex: '#1C1C1C', hueShift: 0, warmth: 'neutral' },
  'steel-gray': { name: 'Steel Gray', hex: '#71797E', hueShift: 200, warmth: 'cool' },
  'cream': { name: 'Cream', hex: '#FFFDD0', hueShift: 50, warmth: 'warm' },
  'brown': { name: 'Brown/Sepia', hex: '#8B4513', hueShift: 25, warmth: 'warm' },
  'dusty-rose': { name: 'Dusty Rose', hex: '#DCAE96', hueShift: 15, warmth: 'warm' },
  'sage': { name: 'Sage Green', hex: '#B2AC88', hueShift: 75, warmth: 'neutral' },
  'navy': { name: 'Navy Blue', hex: '#000080', hueShift: 240, warmth: 'cool' },
  'burgundy': { name: 'Burgundy', hex: '#800020', hueShift: 345, warmth: 'warm' },
  'teal': { name: 'Teal', hex: '#008080', hueShift: 180, warmth: 'cool' },
};

// --- Config ---
function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  }
  return {};
}

function getApiKey(provider) {
  const config = loadConfig();
  if (provider === 'openai') {
    return config.openaiApiKey || process.env.OPENAI_API_KEY;
  }
  if (provider === 'stability') {
    return config.stabilityApiKey || process.env.STABILITY_API_KEY;
  }
  return null;
}

// --- OpenAI DALL-E Generation ---
async function generateWithOpenAI(prompt, options = {}) {
  const apiKey = getApiKey('openai');
  if (!apiKey) throw new Error('No OpenAI API key. Set in generator-config.json or OPENAI_API_KEY env var.');

  const size = options.size || '1024x1024';
  const model = options.model || 'dall-e-3';
  const quality = options.quality || 'hd';

  console.log(`[OpenAI] Generating with DALL-E (${model}, ${quality}, ${size})...`);
  console.log(`[OpenAI] Prompt: ${prompt.slice(0, 100)}...`);

  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size,
      quality,
      response_format: 'b64_json',
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI API error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return Buffer.from(data.data[0].b64_json, 'base64');
}

// --- Stability AI Generation ---
async function generateWithStability(prompt, negativePrompt, options = {}) {
  const apiKey = getApiKey('stability');
  if (!apiKey) throw new Error('No Stability API key. Set in generator-config.json or STABILITY_API_KEY env var.');

  const width = options.width || 1024;
  const height = options.height || 1024;

  console.log(`[Stability] Generating (${width}x${height})...`);
  console.log(`[Stability] Prompt: ${prompt.slice(0, 100)}...`);

  const resp = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'image/*',
    },
    body: (() => {
      const form = new FormData();
      form.append('prompt', prompt);
      if (negativePrompt) form.append('negative_prompt', negativePrompt);
      form.append('output_format', 'png');
      form.append('aspect_ratio', '1:1');
      return form;
    })(),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Stability API error ${resp.status}: ${err}`);
  }

  return Buffer.from(await resp.arrayBuffer());
}

// --- Post-Processing with Sharp ---
async function processPattern(imageBuffer, options = {}) {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.log('[WARN] sharp not available, saving raw image.');
    return imageBuffer;
  }

  const targetWidth = options.width || 3600;  // 12" at 300 DPI
  const targetHeight = options.height || 3600;
  const dpi = options.dpi || 300;

  console.log(`[Process] Resizing to ${targetWidth}x${targetHeight} (${dpi} DPI)...`);

  let pipeline = sharp(imageBuffer);

  // Resize to target dimensions
  pipeline = pipeline.resize(targetWidth, targetHeight, {
    fit: 'cover',
    kernel: 'lanczos3',
  });

  // Set DPI metadata
  pipeline = pipeline.withMetadata({
    density: dpi,
  });

  // Make seamless by blending edges (mirror-tile technique)
  if (options.seamless) {
    console.log('[Process] Applying seamless tiling...');
    // Create a 2x2 tile grid, crop center to get seamless version
    const halfW = Math.floor(targetWidth / 2);
    const halfH = Math.floor(targetHeight / 2);

    const base = await pipeline.toBuffer();
    const img = sharp(base);
    const { width: w, height: h } = await img.metadata();

    // Extract quadrants and reassemble with shifted center
    const tl = await sharp(base).extract({ left: 0, top: 0, width: halfW, height: halfH }).toBuffer();
    const tr = await sharp(base).extract({ left: halfW, top: 0, width: w - halfW, height: halfH }).toBuffer();
    const bl = await sharp(base).extract({ left: 0, top: halfH, width: halfW, height: h - halfH }).toBuffer();
    const br = await sharp(base).extract({ left: halfW, top: halfH, width: w - halfW, height: h - halfH }).toBuffer();

    // Reassemble with quadrants swapped (center becomes edges)
    const seamless = await sharp({
      create: { width: targetWidth, height: targetHeight, channels: 3, background: { r: 255, g: 255, b: 255 } }
    })
      .composite([
        { input: br, left: 0, top: 0 },
        { input: bl, left: w - halfW, top: 0 },
        { input: tr, left: 0, top: h - halfH },
        { input: tl, left: w - halfW, top: h - halfH },
      ])
      .jpeg({ quality: 95 })
      .toBuffer();

    return seamless;
  }

  // Output as high-quality JPEG (smaller files for digital paper)
  return pipeline.jpeg({ quality: 95 }).toBuffer();
}

// --- Build Prompt ---
function buildPrompt(preset, colorName, customPrompt) {
  const presetData = STYLE_PRESETS[preset];
  const color = COLOR_PALETTES[colorName] || { name: colorName };

  let prompt = customPrompt || presetData?.prompt || 'seamless tileable pattern';

  // Add color instruction
  if (color.name) {
    prompt = `${prompt}, in ${color.name} color tones, ${color.hex ? `dominant color ${color.hex}` : ''}`;
  }

  // Add quality modifiers
  prompt += ', ultra high resolution, 4K, detailed, professional digital paper design';

  return {
    prompt,
    negativePrompt: presetData?.negativePrompt || 'text, watermark, logo, blurry, low quality, people, faces',
  };
}

// --- Generate Pattern ---
async function generatePattern(options) {
  const {
    preset = 'damask',
    color = 'gold',
    name,
    customPrompt,
    provider = 'openai',
    seamless = true,
    outputDir,
  } = options;

  const presetData = STYLE_PRESETS[preset] || STYLE_PRESETS.damask;
  const colorData = COLOR_PALETTES[color] || { name: color };

  const { prompt, negativePrompt } = buildPrompt(preset, color, customPrompt);
  const safeName = (name || `${presetData.name}-${colorData.name}`).replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-');
  const outDir = outputDir || path.join(OUTPUT_DIR, safeName);

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log(`\n=== Generating: ${safeName} ===`);
  console.log(`Preset: ${preset}, Color: ${color}, Provider: ${provider}`);

  // Generate raw image
  let rawImage;
  if (provider === 'openai') {
    rawImage = await generateWithOpenAI(prompt, { quality: 'hd' });
  } else if (provider === 'stability') {
    rawImage = await generateWithStability(prompt, negativePrompt);
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }

  // Save raw
  const rawPath = path.join(outDir, `${safeName}-raw.png`);
  fs.writeFileSync(rawPath, rawImage);
  console.log(`Raw saved: ${rawPath}`);

  // Process to 300 DPI 12x12"
  const processed = await processPattern(rawImage, {
    width: 3600,
    height: 3600,
    dpi: 300,
    seamless,
  });

  const finalPath = path.join(outDir, `${safeName}-300dpi.jpg`);
  fs.writeFileSync(finalPath, processed);
  console.log(`Final saved: ${finalPath} (${(processed.length / 1024 / 1024).toFixed(1)}MB)`);

  // Save metadata
  const meta = {
    name: safeName,
    preset,
    color,
    prompt,
    provider,
    generatedAt: new Date().toISOString(),
    files: {
      raw: rawPath,
      final: finalPath,
    },
    dimensions: { width: 3600, height: 3600, dpi: 300, inches: '12x12' },
  };
  fs.writeFileSync(path.join(outDir, 'metadata.json'), JSON.stringify(meta, null, 2));

  return meta;
}

// --- Batch Generate (Color Variations) ---
async function batchGenerate(options) {
  const {
    preset = 'damask',
    colors = ['gold', 'rose-gold', 'amethyst', 'sapphire', 'emerald'],
    baseName,
    provider = 'openai',
    seamless = true,
    delayMs = 2000,
  } = options;

  const results = [];
  const collectionName = baseName || STYLE_PRESETS[preset]?.name || preset;
  const collectionDir = path.join(OUTPUT_DIR, collectionName.replace(/\s+/g, '-'));

  console.log(`\n=== Batch Generate: ${collectionName} ===`);
  console.log(`Preset: ${preset}, Colors: ${colors.join(', ')}`);
  console.log(`Output: ${collectionDir}\n`);

  for (let i = 0; i < colors.length; i++) {
    const color = colors[i];
    console.log(`[${i + 1}/${colors.length}] Generating ${color}...`);

    try {
      const result = await generatePattern({
        preset,
        color,
        name: `${collectionName}-${COLOR_PALETTES[color]?.name || color}`,
        provider,
        seamless,
        outputDir: path.join(collectionDir, color),
      });
      results.push(result);
    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
      results.push({ color, error: e.message });
    }

    // Rate limit delay between generations
    if (i < colors.length - 1) {
      console.log(`  Waiting ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  // Save collection manifest
  const manifest = {
    collection: collectionName,
    preset,
    colors,
    provider,
    generatedAt: new Date().toISOString(),
    results,
  };
  fs.writeFileSync(path.join(collectionDir, 'collection.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nCollection manifest: ${collectionDir}/collection.json`);

  return manifest;
}

// --- CLI ---
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`
J4J Pattern Generator — AI-Powered Digital Paper Creation

Usage:
  node pattern-generator.js --preset <name> [--color <name>] [--name <name>]
  node pattern-generator.js --preset <name> --batch [--colors "gold,silver,amethyst"]
  node pattern-generator.js --prompt "custom prompt" [--color <name>]
  node pattern-generator.js --list-presets
  node pattern-generator.js --list-colors

Options:
  --preset <name>      Style preset (damask, metallic, watercolor, etc.)
  --color <name>       Color name from palette (gold, rose-gold, amethyst, etc.)
  --colors <list>      Comma-separated colors for batch generation
  --batch              Generate all default colors for a preset
  --name <name>        Output name
  --prompt <text>      Custom prompt (overrides preset)
  --provider <name>    openai (default) or stability
  --no-seamless        Skip seamless tiling post-process
  --list-presets       Show available presets
  --list-colors        Show available colors
`);
    return;
  }

  if (args.includes('--list-presets')) {
    console.log('\nAvailable Presets:');
    Object.entries(STYLE_PRESETS).forEach(([key, val]) => {
      console.log(`  ${key.padEnd(20)} ${val.name}`);
    });
    return;
  }

  if (args.includes('--list-colors')) {
    console.log('\nAvailable Colors:');
    Object.entries(COLOR_PALETTES).forEach(([key, val]) => {
      console.log(`  ${key.padEnd(16)} ${val.name.padEnd(20)} ${val.hex}`);
    });
    return;
  }

  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
  };

  const preset = getArg('--preset') || 'damask';
  const color = getArg('--color') || 'gold';
  const name = getArg('--name');
  const prompt = getArg('--prompt');
  const provider = getArg('--provider') || 'openai';
  const seamless = !args.includes('--no-seamless');
  const batch = args.includes('--batch');
  const colorsArg = getArg('--colors');

  if (args.includes('--config')) {
    const configPath = getArg('--config');
    if (configPath && fs.existsSync(configPath)) {
      const jobConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (jobConfig.batch) {
        await batchGenerate(jobConfig);
      } else {
        await generatePattern(jobConfig);
      }
      return;
    }
  }

  if (batch) {
    const colors = colorsArg
      ? colorsArg.split(',').map(c => c.trim())
      : ['gold', 'rose-gold', 'silver', 'amethyst', 'sapphire', 'emerald', 'ruby', 'opal', 'cotton-candy', 'black'];

    await batchGenerate({ preset, colors, baseName: name, provider, seamless });
  } else {
    await generatePattern({ preset, color, name, customPrompt: prompt, provider, seamless });
  }
}

// Export for use as module
export { STYLE_PRESETS, COLOR_PALETTES, generatePattern, batchGenerate, buildPrompt };

// Run CLI if called directly
main().catch(e => {
  console.error(`FATAL: ${e.message}`);
  process.exit(1);
});

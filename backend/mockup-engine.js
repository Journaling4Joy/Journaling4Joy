#!/usr/bin/env node
/* ============================================
   J4J MOCKUP ENGINE — Journal & Planner Mockups
   ============================================
   Generates realistic mockups showing digital papers
   applied to journals, planners, scrapbook pages.

   Usage:
     node mockup-engine.js --pattern damask.jpg --template journal-spread
     node mockup-engine.js --pattern damask.jpg --template all --output ./mockups
     node mockup-engine.js --batch ./variations/ --template journal-cover
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

// --- Mockup Template Definitions ---
// Each template defines where the pattern gets placed on a scene
const TEMPLATES = {
  'journal-cover': {
    name: 'Journal Cover',
    description: 'Pattern on a hardcover journal front, angled on a wood surface',
    category: 'journal',
    canvasWidth: 2400,
    canvasHeight: 2400,
    background: { r: 62, g: 47, b: 35 },  // Dark wood
    surfaces: [
      {
        // Journal cover - slightly angled rectangle
        x: 400, y: 250,
        width: 1600, height: 2000,
        patternFit: 'cover',
        cornerRadius: 20,
        shadow: { offsetX: 30, offsetY: 30, blur: 60, opacity: 0.5 },
        border: { width: 8, color: { r: 45, g: 35, b: 25 } }, // Leather spine
      },
    ],
    overlays: [
      // Subtle light reflection
      { type: 'gradient', x: 400, y: 250, width: 1600, height: 2000, angle: 135, opacity: 0.08 },
    ],
  },

  'journal-spread': {
    name: 'Journal Open Spread',
    description: 'Two-page spread showing pattern as journal pages',
    category: 'journal',
    canvasWidth: 3200,
    canvasHeight: 2200,
    background: { r: 240, g: 235, b: 225 }, // Cream desk
    surfaces: [
      // Left page
      {
        x: 150, y: 200,
        width: 1400, height: 1800,
        patternFit: 'cover',
        cornerRadius: 0,
        shadow: { offsetX: -5, offsetY: 10, blur: 40, opacity: 0.3 },
      },
      // Right page
      {
        x: 1650, y: 200,
        width: 1400, height: 1800,
        patternFit: 'cover',
        cornerRadius: 0,
        shadow: { offsetX: 5, offsetY: 10, blur: 40, opacity: 0.3 },
      },
    ],
    overlays: [
      // Center spine shadow
      { type: 'spine', x: 1525, y: 150, width: 150, height: 1900, opacity: 0.15 },
    ],
  },

  'planner-cover': {
    name: 'Planner Cover',
    description: 'Pattern as a spiral-bound planner cover with rings visible',
    category: 'planner',
    canvasWidth: 2400,
    canvasHeight: 3000,
    background: { r: 225, g: 220, b: 215 }, // Light gray desk
    surfaces: [
      {
        x: 350, y: 300,
        width: 1700, height: 2400,
        patternFit: 'cover',
        cornerRadius: 15,
        shadow: { offsetX: 20, offsetY: 25, blur: 50, opacity: 0.35 },
      },
    ],
    overlays: [
      // Spiral binding edge
      { type: 'spiral-binding', x: 300, y: 300, height: 2400, rings: 12 },
    ],
  },

  'scrapbook-page': {
    name: 'Scrapbook Page',
    description: 'Pattern as background of a scrapbook layout with decorative elements',
    category: 'scrapbook',
    canvasWidth: 2400,
    canvasHeight: 2400,
    background: { r: 248, g: 245, b: 240 }, // White craft mat
    surfaces: [
      // Main page background
      {
        x: 100, y: 100,
        width: 2200, height: 2200,
        patternFit: 'cover',
        cornerRadius: 0,
        shadow: { offsetX: 8, offsetY: 8, blur: 20, opacity: 0.2 },
      },
    ],
    overlays: [
      // Washi tape strip
      { type: 'washi-tape', x: 80, y: 150, width: 300, angle: -3, opacity: 0.7 },
      // Corner photo mat
      { type: 'photo-mat', x: 250, y: 250, width: 800, height: 600, opacity: 0.9 },
    ],
  },

  'flat-lay': {
    name: 'Flat Lay Craft Scene',
    description: 'Pattern papers in a styled flat-lay with craft supplies',
    category: 'lifestyle',
    canvasWidth: 3000,
    canvasHeight: 3000,
    background: { r: 250, g: 248, b: 244 }, // White marble
    surfaces: [
      // Main paper (center, slightly rotated effect via offset)
      {
        x: 600, y: 500,
        width: 1800, height: 2000,
        patternFit: 'cover',
        cornerRadius: 0,
        shadow: { offsetX: 10, offsetY: 15, blur: 35, opacity: 0.25 },
      },
      // Second paper peeking from behind (small strip)
      {
        x: 500, y: 450,
        width: 400, height: 2100,
        patternFit: 'cover',
        cornerRadius: 0,
        shadow: { offsetX: 5, offsetY: 8, blur: 20, opacity: 0.15 },
        tint: { r: 220, g: 210, b: 200, opacity: 0.3 }, // Slightly different tone
      },
    ],
    overlays: [
      // Scissors
      { type: 'craft-element', element: 'scissors', x: 2200, y: 200, opacity: 0.8 },
      // Pen
      { type: 'craft-element', element: 'pen', x: 150, y: 2400, opacity: 0.8 },
    ],
  },

  'card-making': {
    name: 'Greeting Card',
    description: 'Pattern as a greeting card front on a craft surface',
    category: 'card',
    canvasWidth: 2400,
    canvasHeight: 2400,
    background: { r: 235, g: 225, b: 215 }, // Kraft paper
    surfaces: [
      // Card front
      {
        x: 500, y: 350,
        width: 1400, height: 1700,
        patternFit: 'cover',
        cornerRadius: 10,
        shadow: { offsetX: 15, offsetY: 20, blur: 45, opacity: 0.3 },
        border: { width: 4, color: { r: 255, g: 255, b: 255 } }, // White border
      },
    ],
    overlays: [
      // Inner shadow for fold effect
      { type: 'fold-line', x: 500, y: 1200, width: 1400, opacity: 0.1 },
    ],
  },

  'digital-preview': {
    name: 'Digital Preview Grid',
    description: '4-up tile showing pattern repeated to demonstrate seamless tiling',
    category: 'preview',
    canvasWidth: 2400,
    canvasHeight: 2400,
    background: { r: 30, g: 30, b: 35 }, // Dark
    surfaces: [
      // 2x2 grid of the same pattern
      { x: 50, y: 50, width: 1150, height: 1150, patternFit: 'cover', cornerRadius: 0 },
      { x: 1200, y: 50, width: 1150, height: 1150, patternFit: 'cover', cornerRadius: 0 },
      { x: 50, y: 1200, width: 1150, height: 1150, patternFit: 'cover', cornerRadius: 0 },
      { x: 1200, y: 1200, width: 1150, height: 1150, patternFit: 'cover', cornerRadius: 0 },
    ],
    overlays: [],
  },

  'listing-hero': {
    name: 'Etsy Listing Hero',
    description: 'Clean product shot optimized for Etsy listing thumbnail (2700x2025)',
    category: 'listing',
    canvasWidth: 2700,
    canvasHeight: 2025,
    background: { r: 255, g: 255, b: 255 }, // White
    surfaces: [
      // Main large preview
      {
        x: 150, y: 150,
        width: 1500, height: 1725,
        patternFit: 'cover',
        cornerRadius: 12,
        shadow: { offsetX: 20, offsetY: 20, blur: 50, opacity: 0.2 },
      },
      // Small tile preview
      {
        x: 1800, y: 150,
        width: 750, height: 750,
        patternFit: 'cover',
        cornerRadius: 8,
        shadow: { offsetX: 10, offsetY: 10, blur: 30, opacity: 0.15 },
      },
      // Another small tile
      {
        x: 1800, y: 1050,
        width: 750, height: 750,
        patternFit: 'cover',
        cornerRadius: 8,
        shadow: { offsetX: 10, offsetY: 10, blur: 30, opacity: 0.15 },
        tint: { r: 200, g: 200, b: 200, opacity: 0.15 },
      },
    ],
    overlays: [],
  },
};

// --- Mockup Generation ---

/**
 * Create a drop shadow as a separate layer
 */
async function createShadow(width, height, shadow) {
  const { offsetX = 10, offsetY = 10, blur = 30, opacity = 0.3 } = shadow;
  const padded = blur * 3;

  const shadowLayer = await sharp({
    create: {
      width: width + padded * 2,
      height: height + padded * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{
      input: await sharp({
        create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: Math.round(255 * opacity) } }
      }).png().toBuffer(),
      left: padded,
      top: padded,
    }])
    .blur(Math.max(blur, 0.3))
    .png()
    .toBuffer();

  return { buffer: shadowLayer, left: -padded + offsetX, top: -padded + offsetY };
}

/**
 * Create a rounded rectangle mask
 */
async function createRoundedMask(width, height, radius) {
  if (radius <= 0) {
    return sharp({ create: { width, height, channels: 1, background: 255 } }).png().toBuffer();
  }

  const svg = `<svg width="${width}" height="${height}">
    <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="white"/>
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Add a border around the pattern
 */
async function addBorder(patternBuffer, width, height, border) {
  const { width: bw, color } = border;
  const totalW = width + bw * 2;
  const totalH = height + bw * 2;

  return sharp({
    create: { width: totalW, height: totalH, channels: 3, background: color }
  })
    .composite([{ input: patternBuffer, left: bw, top: bw }])
    .jpeg({ quality: 95 })
    .toBuffer();
}

/**
 * Create decorative overlays (spine shadow, washi tape, spiral binding, etc.)
 */
async function createOverlay(overlay, canvasWidth, canvasHeight) {
  const { type, x, y, width, height, opacity = 0.3 } = overlay;

  switch (type) {
    case 'spine': {
      // Vertical gradient shadow for book spine
      const w = width || 100;
      const h = height || canvasHeight;
      const svg = `<svg width="${w}" height="${h}">
        <defs>
          <linearGradient id="spine" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:black;stop-opacity:${opacity}"/>
            <stop offset="50%" style="stop-color:black;stop-opacity:${opacity * 2}"/>
            <stop offset="100%" style="stop-color:black;stop-opacity:${opacity}"/>
          </linearGradient>
        </defs>
        <rect width="${w}" height="${h}" fill="url(#spine)"/>
      </svg>`;
      return { buffer: await sharp(Buffer.from(svg)).png().toBuffer(), left: x, top: y };
    }

    case 'gradient': {
      // Light reflection gradient
      const w = width || 500;
      const h = height || 500;
      const svg = `<svg width="${w}" height="${h}">
        <defs>
          <linearGradient id="light" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:white;stop-opacity:${opacity}"/>
            <stop offset="100%" style="stop-color:white;stop-opacity:0"/>
          </linearGradient>
        </defs>
        <rect width="${w}" height="${h}" fill="url(#light)"/>
      </svg>`;
      return { buffer: await sharp(Buffer.from(svg)).png().toBuffer(), left: x, top: y };
    }

    case 'spiral-binding': {
      // Row of circles representing spiral rings
      const h = height || 2000;
      const rings = overlay.rings || 10;
      const ringSpacing = h / (rings + 1);
      const ringRadius = 18;
      const w = 80;

      let circles = '';
      for (let i = 1; i <= rings; i++) {
        const cy = Math.round(i * ringSpacing);
        circles += `<circle cx="${w / 2}" cy="${cy}" r="${ringRadius}" fill="none" stroke="#888" stroke-width="4"/>`;
        circles += `<circle cx="${w / 2}" cy="${cy}" r="${ringRadius - 6}" fill="none" stroke="#aaa" stroke-width="2"/>`;
      }

      const svg = `<svg width="${w}" height="${h}">${circles}</svg>`;
      return { buffer: await sharp(Buffer.from(svg)).png().toBuffer(), left: x, top: y };
    }

    case 'washi-tape': {
      // Decorative washi tape strip
      const w = width || 250;
      const h = 50;
      const svg = `<svg width="${w}" height="${h}">
        <rect width="${w}" height="${h}" fill="#E8D5C4" opacity="${opacity}" rx="2"/>
        <line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="#D4C0AF" stroke-width="1" stroke-dasharray="8,4"/>
      </svg>`;
      return { buffer: await sharp(Buffer.from(svg)).png().toBuffer(), left: x, top: y };
    }

    case 'photo-mat': {
      // White photo mat / frame placeholder
      const w = width || 600;
      const h = height || 400;
      const svg = `<svg width="${w}" height="${h}">
        <rect width="${w}" height="${h}" fill="white" opacity="${opacity}" rx="4"/>
        <rect x="15" y="15" width="${w - 30}" height="${h - 30}" fill="#f5f0eb" rx="2"/>
      </svg>`;
      return { buffer: await sharp(Buffer.from(svg)).png().toBuffer(), left: x, top: y };
    }

    case 'fold-line': {
      // Horizontal fold line for cards
      const w = width || 1000;
      const svg = `<svg width="${w}" height="4">
        <line x1="0" y1="2" x2="${w}" y2="2" stroke="black" stroke-width="1" opacity="${opacity}"/>
      </svg>`;
      return { buffer: await sharp(Buffer.from(svg)).png().toBuffer(), left: x, top: y };
    }

    default:
      return null;
  }
}

/**
 * Generate a single mockup from a pattern and template
 */
async function generateMockup(patternPath, templateId, options = {}) {
  const template = TEMPLATES[templateId];
  if (!template) throw new Error(`Unknown template: ${templateId}. Available: ${Object.keys(TEMPLATES).join(', ')}`);

  const { canvasWidth, canvasHeight, background, surfaces, overlays } = template;
  const patternBuffer = fs.readFileSync(patternPath);

  console.log(`  Generating mockup: ${template.name} (${canvasWidth}x${canvasHeight})`);

  // Start with background canvas
  const composites = [];

  // Process each surface (where the pattern goes)
  for (const surface of surfaces) {
    const { x, y, width, height, cornerRadius = 0, shadow, border, tint } = surface;

    // Resize pattern to fit surface
    let patternResized = await sharp(patternBuffer)
      .resize(width, height, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 95 })
      .toBuffer();

    // Apply tint if specified
    if (tint) {
      const { data, info } = await sharp(patternResized).raw().toBuffer({ resolveWithObject: true });
      const pixels = new Uint8Array(data);
      for (let i = 0; i < pixels.length; i += info.channels) {
        pixels[i] = Math.round(pixels[i] * (1 - tint.opacity) + tint.r * tint.opacity);
        pixels[i + 1] = Math.round(pixels[i + 1] * (1 - tint.opacity) + tint.g * tint.opacity);
        pixels[i + 2] = Math.round(pixels[i + 2] * (1 - tint.opacity) + tint.b * tint.opacity);
      }
      patternResized = await sharp(Buffer.from(pixels), {
        raw: { width: info.width, height: info.height, channels: info.channels }
      }).jpeg({ quality: 95 }).toBuffer();
    }

    // Apply rounded corners
    if (cornerRadius > 0) {
      const mask = await createRoundedMask(width, height, cornerRadius);
      patternResized = await sharp(patternResized)
        .ensureAlpha()
        .composite([{ input: mask, blend: 'dest-in' }])
        .png()
        .toBuffer();
    }

    // Add border
    if (border) {
      patternResized = await addBorder(patternResized, width, height, border);
    }

    // Add shadow
    if (shadow) {
      const shadowData = await createShadow(
        width + (border ? border.width * 2 : 0),
        height + (border ? border.width * 2 : 0),
        shadow
      );
      composites.push({
        input: shadowData.buffer,
        left: Math.max(0, x + shadowData.left),
        top: Math.max(0, y + shadowData.top),
      });
    }

    // Add pattern surface
    composites.push({
      input: patternResized,
      left: x,
      top: y,
    });
  }

  // Process overlays
  for (const overlay of overlays) {
    const overlayData = await createOverlay(overlay, canvasWidth, canvasHeight);
    if (overlayData) {
      composites.push({
        input: overlayData.buffer,
        left: overlayData.left,
        top: overlayData.top,
      });
    }
  }

  // Compose final mockup
  const mockup = await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 3,
      background,
    },
  })
    .composite(composites)
    .jpeg({ quality: 92 })
    .toBuffer();

  return mockup;
}

/**
 * Generate mockups for all templates
 */
async function generateAllMockups(patternPath, options = {}) {
  const { outputDir, baseName, templates: templateFilter } = options;
  const outDir = outputDir || path.join(path.dirname(patternPath), 'mockups');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const name = baseName || path.basename(patternPath, path.extname(patternPath));
  const templateIds = templateFilter || Object.keys(TEMPLATES);
  const results = [];

  console.log(`\n=== Mockup Generator ===`);
  console.log(`Pattern: ${patternPath}`);
  console.log(`Templates: ${templateIds.length}`);
  console.log(`Output: ${outDir}\n`);

  for (const templateId of templateIds) {
    try {
      const mockup = await generateMockup(patternPath, templateId);
      const fileName = `${name}-mockup-${templateId}.jpg`;
      const filePath = path.join(outDir, fileName);
      fs.writeFileSync(filePath, mockup);

      const sizeMB = (mockup.length / 1024 / 1024).toFixed(1);
      console.log(`  ${template(templateId).name}: ${fileName} (${sizeMB}MB)`);

      results.push({
        template: templateId,
        templateName: TEMPLATES[templateId].name,
        file: filePath,
        size: mockup.length,
      });
    } catch (e) {
      console.error(`  ERROR (${templateId}): ${e.message}`);
      results.push({ template: templateId, error: e.message });
    }
  }

  // Save manifest
  const manifest = {
    source: patternPath,
    baseName: name,
    generatedAt: new Date().toISOString(),
    mockups: results,
  };
  fs.writeFileSync(path.join(outDir, 'mockups.json'), JSON.stringify(manifest, null, 2));

  return manifest;
}

function template(id) {
  return TEMPLATES[id] || { name: id };
}

/**
 * Batch: generate mockups for every image in a folder
 */
async function batchMockups(inputDir, templateId, options = {}) {
  const { outputDir } = options;
  const files = fs.readdirSync(inputDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f));

  console.log(`\n=== Batch Mockups ===`);
  console.log(`Input: ${inputDir} (${files.length} images)`);
  console.log(`Template: ${templateId}\n`);

  const results = [];
  const outDir = outputDir || path.join(inputDir, 'mockups');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(inputDir, file);
    const baseName = path.basename(file, path.extname(file));

    console.log(`[${i + 1}/${files.length}] ${file}...`);

    try {
      const mockup = await generateMockup(filePath, templateId);
      const outPath = path.join(outDir, `${baseName}-mockup-${templateId}.jpg`);
      fs.writeFileSync(outPath, mockup);
      results.push({ source: file, mockup: outPath, size: mockup.length });
    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
      results.push({ source: file, error: e.message });
    }
  }

  const successCount = results.filter(r => !r.error).length;
  console.log(`\nDone: ${successCount}/${files.length} mockups generated.`);

  return { inputDir, template: templateId, results };
}

// --- Exports ---
export {
  TEMPLATES, generateMockup, generateAllMockups, batchMockups,
};

// --- CLI ---
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`
J4J Mockup Engine — Journal & Planner Mockup Generator

Usage:
  node mockup-engine.js --pattern <image> --template <name>
  node mockup-engine.js --pattern <image> --template all
  node mockup-engine.js --batch <folder> --template <name>
  node mockup-engine.js --list-templates

Options:
  --pattern <path>     Source pattern image
  --template <name>    Template name or "all" for all templates
  --batch <folder>     Generate mockups for all images in folder
  --output <dir>       Output directory
  --name <name>        Base name for output files
  --list-templates     Show available templates
`);
    return;
  }

  if (args.includes('--list-templates')) {
    console.log('\nAvailable Mockup Templates:');
    Object.entries(TEMPLATES).forEach(([key, val]) => {
      console.log(`  ${key.padEnd(20)} ${val.name.padEnd(25)} (${val.category})`);
      console.log(`  ${''.padEnd(20)} ${val.description}`);
    });
    return;
  }

  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
  };

  const patternPath = getArg('--pattern');
  const templateId = getArg('--template') || 'journal-cover';
  const batchDir = getArg('--batch');
  const outputDir = getArg('--output');
  const baseName = getArg('--name');

  if (batchDir) {
    await batchMockups(batchDir, templateId, { outputDir });
  } else if (patternPath) {
    if (templateId === 'all') {
      await generateAllMockups(patternPath, { outputDir, baseName });
    } else {
      const mockup = await generateMockup(patternPath, templateId);
      const name = baseName || path.basename(patternPath, path.extname(patternPath));
      const outPath = path.join(outputDir || path.dirname(patternPath), `${name}-mockup-${templateId}.jpg`);
      fs.writeFileSync(outPath, mockup);
      console.log(`Mockup saved: ${outPath} (${(mockup.length / 1024 / 1024).toFixed(1)}MB)`);
    }
  }
}

main().catch(e => {
  console.error(`FATAL: ${e.message}`);
  process.exit(1);
});

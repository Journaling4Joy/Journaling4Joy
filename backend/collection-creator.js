#!/usr/bin/env node
/* ============================================
   J4J COLLECTION CREATOR — End-to-End Pipeline
   ============================================
   One config → full Etsy-ready collection:
   1. Generate base pattern (AI)
   2. Create color variations
   3. Generate mockups for each variation
   4. Write SEO-optimized listings
   5. Package ZIP files
   6. Schedule Etsy drafts

   Usage:
     node collection-creator.js --config collection.json
     node collection-creator.js --preset damask --palette metallics-core --name "Vintage Damask"
   ============================================ */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generatePattern, STYLE_PRESETS, COLOR_PALETTES } from './pattern-generator.js';
import { generateVariations, PALETTES, COLORS } from './color-engine.js';
import { generateMockup, TEMPLATES } from './mockup-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_BASE = path.join(__dirname, '..', 'collections');

let archiver;
try {
  // ZIP support is optional — falls back to folder output
  archiver = null;
} catch { /* no archiver */ }

// --- SEO Listing Generator ---
const SEO = {
  // Etsy allows max 13 tags, 140 chars per tag
  generateTags(collectionName, colorName, preset, category) {
    const baseTags = [
      'digital paper', 'digital download', 'printable paper',
      'scrapbook paper', 'junk journal supply', 'instant download',
    ];

    const presetTags = {
      damask: ['damask pattern', 'damask digital paper', 'baroque pattern', 'ornate pattern'],
      'damask-pysanky': ['pysanky pattern', 'ukrainian folk art', 'egg art pattern'],
      'damask-mayan': ['mayan pattern', 'aztec design', 'tribal pattern'],
      metallic: ['metallic paper', 'foil texture', 'glitter paper', 'shiny paper'],
      'metallic-foil': ['foil paper', 'metallic foil', 'foil texture'],
      'metallic-glitter': ['glitter paper', 'glitter texture', 'sparkle paper'],
      watercolor: ['watercolor paper', 'watercolor texture', 'painted paper'],
      'watercolor-floral': ['watercolor floral', 'painted flowers', 'botanical watercolor'],
      vintage: ['vintage paper', 'distressed texture', 'aged paper', 'antique paper'],
      floral: ['floral pattern', 'flower pattern', 'botanical print'],
      geometric: ['geometric pattern', 'art deco pattern', 'modern pattern'],
      chevron: ['chevron pattern', 'zigzag pattern', 'striped paper'],
      stars: ['star pattern', 'celestial paper', 'night sky'],
      gothic: ['gothic paper', 'witchy paper', 'dark aesthetic'],
      'dark-academia': ['dark academia', 'scholarly aesthetic', 'vintage library'],
      'cottage-floral': ['cottagecore', 'wildflower pattern', 'meadow print'],
    };

    const colorTags = {
      'rose-gold': ['rose gold', 'pink gold'], gold: ['gold', 'golden'],
      silver: ['silver', 'metallic silver'], amethyst: ['purple', 'amethyst'],
      sapphire: ['blue', 'sapphire blue'], emerald: ['green', 'emerald'],
      ruby: ['red', 'ruby red'], cream: ['cream', 'ivory'],
      brown: ['brown', 'sepia'], navy: ['navy blue', 'dark blue'],
      burgundy: ['burgundy', 'wine red'], teal: ['teal', 'turquoise'],
    };

    const tags = [...baseTags];
    if (presetTags[preset]) tags.push(...presetTags[preset].slice(0, 2));
    if (colorTags[colorName]) tags.push(...colorTags[colorName]);

    // Deduplicate and limit to 13
    return [...new Set(tags)].slice(0, 13);
  },

  generateTitle(collectionName, colorName, count) {
    const colorDisplay = colorName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    // Etsy title max 140 chars — front-load keywords
    const title = `${collectionName} ${colorDisplay} Digital Paper Pack ${count} Papers 300 DPI 12x12 Printable Scrapbook Junk Journal`;
    return title.slice(0, 140);
  },

  generateDescription(collectionName, colorName, count, preset) {
    const colorDisplay = colorName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const presetDisplay = (STYLE_PRESETS[preset]?.name || preset).replace(/-/g, ' ');

    return `${collectionName} — ${colorDisplay}

A gorgeous set of ${count} ${presetDisplay.toLowerCase()} digital papers in stunning ${colorDisplay.toLowerCase()} tones. Perfect for junk journals, scrapbooking, card making, and all your paper craft projects!

WHAT YOU GET:
• ${count} unique digital paper designs
• High resolution 300 DPI
• 12 x 12 inches (3600 x 3600 pixels)
• JPG format — ready to print or use digitally
• Instant download after purchase

PERFECT FOR:
• Junk journal backgrounds & pages
• Scrapbook paper
• Card making & gift wrapping
• Planner decorating
• Mixed media art projects
• Digital planning (GoodNotes, Notability)
• Commercial use — small business OK!

HOW TO USE:
1. Download your files instantly after purchase
2. Print at home on cardstock or quality paper
3. Or import into your favorite digital planning app
4. Cut, fold, and create!

PRINTING TIPS:
• Use "Actual Size" or "100%" in your printer settings
• Cardstock (65-80lb) gives the best results
• For vibrant colors, choose "Best Quality" print setting

This is a DIGITAL DOWNLOAD — no physical item will be shipped.
Files are delivered instantly via Etsy after purchase.

© Journaling4Joy — All designs are original.
Personal and small commercial use permitted.`;
  },

  // Generate unique descriptions across a collection to avoid SEO self-competition
  generateUniqueDescriptions(collectionName, colors, preset) {
    const descriptions = {};
    const adjectives = [
      'gorgeous', 'stunning', 'beautiful', 'elegant', 'luxurious',
      'exquisite', 'captivating', 'enchanting', 'lovely', 'breathtaking',
      'magnificent', 'splendid', 'dazzling', 'radiant', 'delightful',
    ];

    colors.forEach((color, i) => {
      // Rotate adjective to make each description slightly unique
      const adj = adjectives[i % adjectives.length];
      let desc = SEO.generateDescription(collectionName, color, 10, preset);
      desc = desc.replace('A gorgeous', `A ${adj}`);
      descriptions[color] = desc;
    });

    return descriptions;
  },
};

// --- ZIP Packaging ---
async function createZipPackage(files, outputPath) {
  // Simple ZIP using Node's built-in zlib if archiver isn't available
  // For now, copy files to a folder that can be manually zipped
  const dir = outputPath.replace('.zip', '');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  for (const file of files) {
    if (fs.existsSync(file)) {
      const dest = path.join(dir, path.basename(file));
      fs.copyFileSync(file, dest);
    }
  }

  // Try to use PowerShell to create ZIP on Windows
  try {
    const { execSync } = await import('child_process');
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${dir}\\*' -DestinationPath '${outputPath}' -Force"`, { timeout: 30000 });
    // Clean up temp folder
    fs.rmSync(dir, { recursive: true, force: true });
    return outputPath;
  } catch {
    // If PowerShell fails, just keep the folder
    console.log(`  ZIP creation failed — files are in ${dir}/`);
    return dir;
  }
}

// --- Pipeline Steps ---
const STEPS = [
  { id: 'generate', name: 'Generate Base Pattern', icon: '🎨' },
  { id: 'variations', name: 'Create Color Variations', icon: '🌈' },
  { id: 'mockups', name: 'Generate Mockups', icon: '📸' },
  { id: 'seo', name: 'Write SEO Listings', icon: '📝' },
  { id: 'package', name: 'Package Files', icon: '📦' },
  { id: 'schedule', name: 'Prepare Schedule', icon: '📅' },
];

// --- Main Pipeline ---
async function createCollection(config) {
  const {
    name,
    preset = 'damask',
    palette = 'metallics-core',
    colors: customColors,
    provider = 'openai',
    mockupTemplates = ['listing-hero', 'journal-cover', 'flat-lay'],
    price = 3.79,
    scheduleStart,
    scheduleGap = 1,
    scheduleTime = '10:00',
    skipGenerate = false,
    basePatternPath,
  } = config;

  const collectionName = name || `${STYLE_PRESETS[preset]?.name || preset} Collection`;
  const safeName = collectionName.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-');
  const collectionDir = path.join(OUTPUT_BASE, safeName);

  // Resolve colors
  const colorList = customColors || PALETTES[palette]?.colors || ['gold', 'rose-gold', 'amethyst', 'sapphire', 'emerald'];

  if (!fs.existsSync(collectionDir)) fs.mkdirSync(collectionDir, { recursive: true });

  const progress = { steps: {}, currentStep: '', startedAt: new Date().toISOString() };
  const updateProgress = (stepId, status, detail) => {
    progress.steps[stepId] = { status, detail, updatedAt: new Date().toISOString() };
    progress.currentStep = stepId;
    // Save progress for frontend polling
    fs.writeFileSync(path.join(collectionDir, 'progress.json'), JSON.stringify(progress, null, 2));
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  J4J COLLECTION CREATOR`);
  console.log(`  ${collectionName}`);
  console.log(`  Preset: ${preset} | Colors: ${colorList.length} | Mockups: ${mockupTemplates.length}`);
  console.log(`${'='.repeat(60)}\n`);

  const results = {
    collection: collectionName,
    directory: collectionDir,
    preset,
    colors: colorList,
    createdAt: new Date().toISOString(),
    steps: {},
  };

  // ===== STEP 1: Generate Base Pattern =====
  updateProgress('generate', 'running', 'Generating base pattern with AI...');
  console.log('\n[STEP 1/6] Generate Base Pattern');

  let basePattern;
  if (skipGenerate && basePatternPath && fs.existsSync(basePatternPath)) {
    basePattern = basePatternPath;
    console.log(`  Using existing pattern: ${basePatternPath}`);
    updateProgress('generate', 'complete', 'Using existing pattern');
  } else {
    try {
      const genResult = await generatePattern({
        preset,
        color: colorList[0], // Generate in first color
        name: `${safeName}-base`,
        provider,
        seamless: true,
        outputDir: path.join(collectionDir, 'base'),
      });
      basePattern = genResult.files.final;
      results.steps.generate = { success: true, file: basePattern };
      updateProgress('generate', 'complete', `Base pattern: ${path.basename(basePattern)}`);
      console.log(`  Base pattern: ${basePattern}`);
    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
      results.steps.generate = { success: false, error: e.message };
      updateProgress('generate', 'failed', e.message);
      // Continue with basePatternPath if available
      if (basePatternPath && fs.existsSync(basePatternPath)) {
        basePattern = basePatternPath;
        console.log(`  Falling back to: ${basePatternPath}`);
      } else {
        throw new Error(`Pattern generation failed and no fallback: ${e.message}`);
      }
    }
  }

  // ===== STEP 2: Create Color Variations =====
  updateProgress('variations', 'running', `Creating ${colorList.length} color variations...`);
  console.log(`\n[STEP 2/6] Create ${colorList.length} Color Variations`);

  const variationsDir = path.join(collectionDir, 'variations');
  let variationFiles = {};

  try {
    const varResult = await generateVariations({
      inputPath: basePattern,
      colors: colorList,
      preset,
      outputDir: variationsDir,
      baseName: safeName,
    });

    varResult.variations.forEach(v => {
      if (!v.error && v.file) {
        variationFiles[v.color] = v.file;
      }
    });

    const successCount = Object.keys(variationFiles).length;
    results.steps.variations = { success: true, count: successCount, files: variationFiles };
    updateProgress('variations', 'complete', `${successCount}/${colorList.length} variations created`);
    console.log(`  ${successCount} variations created`);
  } catch (e) {
    console.error(`  ERROR: ${e.message}`);
    results.steps.variations = { success: false, error: e.message };
    updateProgress('variations', 'failed', e.message);
  }

  // ===== STEP 3: Generate Mockups =====
  updateProgress('mockups', 'running', 'Generating mockups...');
  console.log(`\n[STEP 3/6] Generate Mockups`);

  const mockupsDir = path.join(collectionDir, 'mockups');
  if (!fs.existsSync(mockupsDir)) fs.mkdirSync(mockupsDir, { recursive: true });
  const mockupFiles = {};

  const variationEntries = Object.entries(variationFiles);
  let mockupCount = 0;

  for (const [color, varFile] of variationEntries) {
    mockupFiles[color] = [];
    for (const templateId of mockupTemplates) {
      try {
        const mockup = await generateMockup(varFile, templateId);
        const fileName = `${safeName}-${color}-mockup-${templateId}.jpg`;
        const filePath = path.join(mockupsDir, fileName);
        fs.writeFileSync(filePath, mockup);
        mockupFiles[color].push({ template: templateId, file: filePath });
        mockupCount++;
      } catch (e) {
        console.error(`  ERROR (${color}/${templateId}): ${e.message}`);
      }
    }
    const detail = `${mockupCount} mockups (${variationEntries.indexOf([color, varFile]) + 1}/${variationEntries.length} colors)`;
    updateProgress('mockups', 'running', detail);
  }

  results.steps.mockups = { success: true, count: mockupCount, files: mockupFiles };
  updateProgress('mockups', 'complete', `${mockupCount} mockups generated`);
  console.log(`  ${mockupCount} mockups generated`);

  // ===== STEP 4: Write SEO Listings =====
  updateProgress('seo', 'running', 'Writing SEO-optimized listings...');
  console.log('\n[STEP 4/6] Write SEO Listings');

  const listings = {};
  const descriptions = SEO.generateUniqueDescriptions(collectionName, colorList, preset);

  for (const color of colorList) {
    const colorDisplay = color.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    listings[color] = {
      title: SEO.generateTitle(collectionName, color, 10),
      description: descriptions[color],
      tags: SEO.generateTags(collectionName, color, preset, 'digital-paper'),
      price,
      who_made: 'i_did',
      when_made: 'made_to_order',
      taxonomy_id: 2078,
      quantity: 999,
      type: 'download',
      colorName: colorDisplay,
    };
  }

  // Save listings data
  fs.writeFileSync(path.join(collectionDir, 'listings.json'), JSON.stringify(listings, null, 2));
  results.steps.seo = { success: true, count: Object.keys(listings).length };
  updateProgress('seo', 'complete', `${Object.keys(listings).length} unique listings written`);
  console.log(`  ${Object.keys(listings).length} unique SEO listings`);

  // ===== STEP 5: Package Files =====
  updateProgress('package', 'running', 'Packaging ZIP files...');
  console.log('\n[STEP 5/6] Package Files');

  const packagesDir = path.join(collectionDir, 'packages');
  if (!fs.existsSync(packagesDir)) fs.mkdirSync(packagesDir, { recursive: true });
  const packageFiles = {};

  for (const [color, varFile] of Object.entries(variationFiles)) {
    const zipName = `${safeName}-${color}.zip`;
    const zipPath = path.join(packagesDir, zipName);

    // Include variation file + any associated files
    const filesToPackage = [varFile];
    try {
      const result = await createZipPackage(filesToPackage, zipPath);
      packageFiles[color] = result;
      console.log(`  ${zipName}`);
    } catch (e) {
      console.error(`  ERROR packaging ${color}: ${e.message}`);
    }
  }

  results.steps.package = { success: true, files: packageFiles };
  updateProgress('package', 'complete', `${Object.keys(packageFiles).length} packages created`);

  // ===== STEP 6: Prepare Schedule =====
  updateProgress('schedule', 'running', 'Preparing listing schedule...');
  console.log('\n[STEP 6/6] Prepare Schedule');

  const scheduleItems = [];
  const startDate = scheduleStart ? new Date(scheduleStart) : new Date();
  // If no start date, begin tomorrow
  if (!scheduleStart) startDate.setDate(startDate.getDate() + 1);

  colorList.forEach((color, i) => {
    const publishDate = new Date(startDate);
    publishDate.setDate(publishDate.getDate() + (i * scheduleGap));
    const [hours, minutes] = scheduleTime.split(':').map(Number);
    publishDate.setHours(hours, minutes, 0, 0);

    const listing = listings[color];
    scheduleItems.push({
      id: crypto.randomUUID(),
      title: listing.title,
      publishAt: publishDate.toISOString(),
      status: 'scheduled',
      sourceType: 'collection',
      collectionName,
      color,
      price: listing.price,
      category: 'digital-paper',
      draftData: {
        title: listing.title,
        description: listing.description,
        tags: listing.tags.join(','),
        price: listing.price,
        who_made: listing.who_made,
        when_made: listing.when_made,
        taxonomy_id: listing.taxonomy_id,
        quantity: listing.quantity,
        type: listing.type,
      },
      images: (mockupFiles[color] || []).map(m => m.file),
      files: packageFiles[color] ? [packageFiles[color]] : (variationFiles[color] ? [variationFiles[color]] : []),
      createdAt: new Date().toISOString(),
    });
  });

  // Save schedule
  fs.writeFileSync(path.join(collectionDir, 'schedule.json'), JSON.stringify(scheduleItems, null, 2));
  results.steps.schedule = { success: true, count: scheduleItems.length, items: scheduleItems };
  updateProgress('schedule', 'complete', `${scheduleItems.length} listings scheduled`);

  const lastDate = new Date(startDate);
  lastDate.setDate(lastDate.getDate() + ((colorList.length - 1) * scheduleGap));
  console.log(`  ${scheduleItems.length} listings: ${startDate.toLocaleDateString()} → ${lastDate.toLocaleDateString()}`);

  // ===== COMPLETE =====
  results.completedAt = new Date().toISOString();
  fs.writeFileSync(path.join(collectionDir, 'collection-manifest.json'), JSON.stringify(results, null, 2));

  updateProgress('complete', 'complete', 'Collection ready!');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  COLLECTION COMPLETE: ${collectionName}`);
  console.log(`  Directory: ${collectionDir}`);
  console.log(`  Variations: ${Object.keys(variationFiles).length}`);
  console.log(`  Mockups: ${mockupCount}`);
  console.log(`  Listings: ${Object.keys(listings).length}`);
  console.log(`  Packages: ${Object.keys(packageFiles).length}`);
  console.log(`  Scheduled: ${scheduleItems.length} listings`);
  console.log(`${'='.repeat(60)}\n`);

  return results;
}

// --- List Collections ---
function listCollections() {
  if (!fs.existsSync(OUTPUT_BASE)) return [];

  return fs.readdirSync(OUTPUT_BASE, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const manifestPath = path.join(OUTPUT_BASE, d.name, 'collection-manifest.json');
      const progressPath = path.join(OUTPUT_BASE, d.name, 'progress.json');

      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        return { ...manifest, status: 'complete' };
      } else if (fs.existsSync(progressPath)) {
        const progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
        return { collection: d.name, directory: path.join(OUTPUT_BASE, d.name), progress, status: 'in-progress' };
      }
      return { collection: d.name, directory: path.join(OUTPUT_BASE, d.name), status: 'unknown' };
    })
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function getCollectionProgress(collectionName) {
  const safeName = collectionName.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-');
  const progressPath = path.join(OUTPUT_BASE, safeName, 'progress.json');
  if (fs.existsSync(progressPath)) {
    return JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
  }
  return null;
}

// --- Exports ---
export { createCollection, listCollections, getCollectionProgress, STEPS, SEO };

// --- CLI ---
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`
J4J Collection Creator — End-to-End Pipeline

Usage:
  node collection-creator.js --preset damask --palette metallics-core --name "Vintage Damask"
  node collection-creator.js --config collection.json
  node collection-creator.js --list

Options:
  --name <name>        Collection name
  --preset <name>      Pattern preset (damask, metallic, watercolor, etc.)
  --palette <name>     Color palette (metallics, jewel, earth, pastels, etc.)
  --colors <list>      Custom comma-separated colors
  --provider <name>    AI provider (openai, stability)
  --price <amount>     Listing price (default: 3.79)
  --start <date>       Schedule start date (YYYY-MM-DD)
  --gap <days>         Days between listings (default: 1)
  --time <HH:MM>       Publish time (default: 10:00)
  --skip-generate      Use --base-pattern instead of AI generation
  --base-pattern <path> Existing pattern to use as base
  --config <path>      JSON config file
  --list               List existing collections
`);
    return;
  }

  if (args.includes('--list')) {
    const collections = listCollections();
    if (collections.length === 0) {
      console.log('No collections yet.');
    } else {
      console.log('\nExisting Collections:');
      collections.forEach(c => {
        const colors = c.colors ? `(${c.colors.length} colors)` : '';
        console.log(`  ${c.collection} ${colors} — ${c.status} ${c.completedAt ? `[${new Date(c.completedAt).toLocaleDateString()}]` : ''}`);
      });
    }
    return;
  }

  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
  };

  let config;
  const configPath = getArg('--config');
  if (configPath && fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } else {
    config = {
      name: getArg('--name'),
      preset: getArg('--preset') || 'damask',
      palette: getArg('--palette') || 'metallics-core',
      colors: getArg('--colors')?.split(',').map(c => c.trim()),
      provider: getArg('--provider') || 'openai',
      price: parseFloat(getArg('--price') || '3.79'),
      scheduleStart: getArg('--start'),
      scheduleGap: parseInt(getArg('--gap') || '1'),
      scheduleTime: getArg('--time') || '10:00',
      skipGenerate: args.includes('--skip-generate'),
      basePatternPath: getArg('--base-pattern'),
    };
  }

  await createCollection(config);
}

main().catch(e => {
  console.error(`FATAL: ${e.message}`);
  process.exit(1);
});

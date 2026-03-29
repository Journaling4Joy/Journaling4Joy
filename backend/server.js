#!/usr/bin/env node
/* ============================================
   J4J LOCAL SERVER — API for Dashboard
   ============================================
   Provides endpoints for the frontend dashboard to trigger
   pattern generation, file operations, and scheduling.

   Start: node server.js
   Default: http://localhost:4444
   ============================================ */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generatePattern, batchGenerate, STYLE_PRESETS, COLOR_PALETTES } from './pattern-generator.js';
import { generateVariations, generatePreviewStrip, COLORS, PALETTES, METHODS, selectMethod } from './color-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.J4J_PORT || 4444;
const FRONTEND_DIR = path.join(__dirname, '..');

// --- CORS headers ---
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, data, status = 200) {
  setCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res, message, status = 500) {
  sendJson(res, { error: message }, status);
}

async function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

// --- Routes ---
const routes = {
  'GET /api/presets': (req, res) => {
    sendJson(res, {
      presets: Object.entries(STYLE_PRESETS).map(([key, val]) => ({
        id: key, name: val.name, style: val.style,
      })),
      colors: Object.entries(COLOR_PALETTES).map(([key, val]) => ({
        id: key, name: val.name, hex: val.hex, warmth: val.warmth,
      })),
    });
  },

  'POST /api/generate': async (req, res) => {
    const body = await readBody(req);
    const { preset, color, name, customPrompt, provider, seamless } = body;

    try {
      const result = await generatePattern({
        preset: preset || 'damask',
        color: color || 'gold',
        name,
        customPrompt,
        provider: provider || 'openai',
        seamless: seamless !== false,
      });
      sendJson(res, { success: true, result });
    } catch (e) {
      sendError(res, e.message);
    }
  },

  'POST /api/generate-batch': async (req, res) => {
    const body = await readBody(req);
    const { preset, colors, baseName, provider, seamless } = body;

    try {
      const result = await batchGenerate({
        preset: preset || 'damask',
        colors: colors || ['gold', 'rose-gold', 'amethyst', 'sapphire', 'emerald'],
        baseName,
        provider: provider || 'openai',
        seamless: seamless !== false,
      });
      sendJson(res, { success: true, result });
    } catch (e) {
      sendError(res, e.message);
    }
  },

  'GET /api/collections': (req, res) => {
    const assetsDir = path.join(FRONTEND_DIR, 'source-assets');
    if (!fs.existsSync(assetsDir)) {
      sendJson(res, { collections: [] });
      return;
    }

    const collections = [];
    const dirs = fs.readdirSync(assetsDir, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const dir of dirs) {
      const manifestPath = path.join(assetsDir, dir.name, 'collection.json');
      const metaPath = path.join(assetsDir, dir.name, 'metadata.json');

      if (fs.existsSync(manifestPath)) {
        collections.push(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')));
      } else if (fs.existsSync(metaPath)) {
        collections.push(JSON.parse(fs.readFileSync(metaPath, 'utf-8')));
      } else {
        // List files in directory
        const files = fs.readdirSync(path.join(assetsDir, dir.name));
        collections.push({ name: dir.name, files });
      }
    }

    sendJson(res, { collections });
  },

  'POST /api/save-schedule': async (req, res) => {
    const body = await readBody(req);
    const schedulePath = path.join(__dirname, 'schedule.json');
    fs.writeFileSync(schedulePath, JSON.stringify(body, null, 2));
    sendJson(res, { success: true, path: schedulePath });
  },

  'GET /api/palettes': (req, res) => {
    sendJson(res, {
      palettes: Object.entries(PALETTES).map(([key, val]) => ({
        id: key, name: val.name, description: val.description, colors: val.colors,
      })),
      colors: Object.entries(COLORS).map(([key, val]) => ({
        id: key, hex: val.hex, tint: val.tint,
      })),
      methods: Object.keys(METHODS),
    });
  },

  'POST /api/recolor': async (req, res) => {
    const body = await readBody(req);
    const { inputPath, palette, colors, method, preset, outputDir, baseName } = body;

    try {
      const result = await generateVariations({
        inputPath, palette, colors, method, preset, outputDir, baseName,
      });
      sendJson(res, { success: true, result });
    } catch (e) {
      sendError(res, e.message);
    }
  },

  'POST /api/recolor-preview': async (req, res) => {
    const body = await readBody(req);
    const { inputPath, palette, colors, method, preset } = body;

    try {
      const strip = await generatePreviewStrip({ inputPath, palette, colors, method, preset });
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(strip);
    } catch (e) {
      sendError(res, e.message);
    }
  },

  'GET /api/source-assets': (req, res) => {
    const assetsDir = path.join(FRONTEND_DIR, 'source-assets');
    if (!fs.existsSync(assetsDir)) {
      sendJson(res, { assets: [] });
      return;
    }

    const assets = [];
    function scanDir(dir, prefix = '') {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath, prefix ? `${prefix}/${entry.name}` : entry.name);
        } else if (/\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(entry.name)) {
          assets.push({
            name: entry.name,
            path: fullPath.replace(/\\/g, '/'),
            relativePath: prefix ? `${prefix}/${entry.name}` : entry.name,
            size: fs.statSync(fullPath).size,
          });
        }
      }
    }
    scanDir(assetsDir);
    sendJson(res, { assets });
  },

  'GET /api/health': (req, res) => {
    sendJson(res, {
      status: 'ok',
      version: '1.0.0',
      time: new Date().toISOString(),
    });
  },
};

// --- Server ---
const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const routeKey = `${req.method} ${req.url.split('?')[0]}`;
  const handler = routes[routeKey];

  if (handler) {
    try {
      await handler(req, res);
    } catch (e) {
      console.error(`Error in ${routeKey}:`, e);
      sendError(res, e.message);
    }
    return;
  }

  // Serve static frontend files
  if (req.method === 'GET' && !req.url.startsWith('/api/')) {
    let filePath = path.join(FRONTEND_DIR, req.url === '/' ? 'index.html' : req.url);
    filePath = path.normalize(filePath);

    // Security: prevent directory traversal
    if (!filePath.startsWith(FRONTEND_DIR)) {
      sendError(res, 'Forbidden', 403);
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
        '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
        '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
        '.pdf': 'application/pdf', '.zip': 'application/zip',
      };
      setCors(res);
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  sendError(res, 'Not Found', 404);
});

server.listen(PORT, () => {
  console.log(`\n  J4J Backend Server running at http://localhost:${PORT}`);
  console.log(`  Dashboard:  http://localhost:${PORT}/`);
  console.log(`  API:        http://localhost:${PORT}/api/presets`);
  console.log(`  Health:     http://localhost:${PORT}/api/health\n`);
});

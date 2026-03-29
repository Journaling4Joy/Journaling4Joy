#!/usr/bin/env node
/* ============================================
   J4J SCHEDULER — Publish Due Listings
   ============================================
   Run via Windows Task Scheduler every 5 minutes:
     node C:\Users\chris\Journaling4Joy\backend\scheduler.js

   Or check without publishing:
     node scheduler.js --check-only
   ============================================ */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEDULE_FILE = path.join(__dirname, 'schedule.json');
const LOG_FILE = path.join(__dirname, 'scheduler.log');
const CHECK_ONLY = process.argv.includes('--check-only');

const ETSY_BASE = 'https://openapi.etsy.com/v3';
const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';

// --- Logging ---
function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// --- Schedule File ---
function loadSchedule() {
  if (!fs.existsSync(SCHEDULE_FILE)) {
    log('No schedule.json found. Export from the dashboard first.');
    return null;
  }
  return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8'));
}

function saveSchedule(data) {
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2));
}

// --- Token Management ---
async function refreshToken(data) {
  const { keystring } = data.settings;
  const { refresh_token } = data.tokens;

  if (!keystring || !refresh_token) {
    throw new Error('Missing keystring or refresh_token in schedule.json');
  }

  log('Refreshing access token...');
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: keystring,
      refresh_token,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Token refresh failed: ${err}`);
  }

  const tokens = await resp.json();
  tokens.saved_at = Date.now();
  data.tokens = tokens;
  saveSchedule(data);
  log('Token refreshed successfully.');
  return tokens;
}

function isTokenExpired(tokens) {
  if (!tokens.saved_at || !tokens.expires_in) return true;
  return Date.now() > tokens.saved_at + (tokens.expires_in * 1000) - 60000;
}

async function ensureValidToken(data) {
  if (isTokenExpired(data.tokens)) {
    await refreshToken(data);
  }
  return data.tokens;
}

// --- Etsy API ---
async function etsyApi(endpoint, tokens, keystring, options = {}) {
  const resp = await fetch(`${ETSY_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`,
      'x-api-key': keystring,
      ...options.headers,
    },
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Etsy API ${resp.status}: ${err}`);
  }

  return resp.json();
}

async function createDraftListing(shopId, listingData, tokens, keystring) {
  return etsyApi(`/application/shops/${shopId}/listings`, tokens, keystring, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(listingData),
  });
}

async function activateListing(shopId, listingId, tokens, keystring) {
  return etsyApi(`/application/shops/${shopId}/listings/${listingId}`, tokens, keystring, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ state: 'active' }),
  });
}

async function uploadListingImage(shopId, listingId, imagePath, tokens, keystring) {
  const imageData = fs.readFileSync(imagePath);
  const blob = new Blob([imageData], { type: 'image/jpeg' });
  const formData = new FormData();
  formData.append('image', blob, path.basename(imagePath));

  return etsyApi(`/application/shops/${shopId}/listings/${listingId}/images`, tokens, keystring, {
    method: 'POST',
    body: formData,
  });
}

async function uploadListingFile(shopId, listingId, filePath, tokens, keystring) {
  const fileData = fs.readFileSync(filePath);
  const blob = new Blob([fileData]);
  const formData = new FormData();
  formData.append('file', blob, path.basename(filePath));

  return etsyApi(`/application/shops/${shopId}/listings/${listingId}/files`, tokens, keystring, {
    method: 'POST',
    body: formData,
  });
}

// --- Main ---
async function main() {
  log('=== J4J Scheduler Run ===');

  const data = loadSchedule();
  if (!data) return;

  const { settings, scheduled } = data;
  const now = new Date();

  // Find due items
  const dueItems = scheduled.filter(item =>
    item.status === 'scheduled' && new Date(item.publishAt) <= now
  );

  if (dueItems.length === 0) {
    log(`No listings due. ${scheduled.filter(s => s.status === 'scheduled').length} scheduled.`);
    const nextUp = scheduled
      .filter(s => s.status === 'scheduled')
      .sort((a, b) => new Date(a.publishAt) - new Date(b.publishAt))[0];
    if (nextUp) {
      log(`Next: "${nextUp.title}" at ${nextUp.publishAt}`);
    }
    return;
  }

  log(`Found ${dueItems.length} due listing(s).`);

  if (CHECK_ONLY) {
    dueItems.forEach(item => {
      log(`  DUE: "${item.title}" (scheduled ${item.publishAt})`);
    });
    return;
  }

  // Ensure valid token
  const tokens = await ensureValidToken(data);
  const { keystring, shopId } = settings;

  if (!shopId) {
    log('ERROR: No shopId in schedule.json. Set it in the dashboard settings.');
    return;
  }

  // Process each due item
  for (const item of dueItems) {
    try {
      log(`Processing: "${item.title}"`);

      if (item.listingId) {
        // Existing draft — activate it
        log(`  Activating draft listing #${item.listingId}...`);
        await activateListing(shopId, item.listingId, tokens, keystring);
        item.status = 'published';
        item.publishedAt = new Date().toISOString();
        log(`  Published listing #${item.listingId}`);
      } else if (item.draftData) {
        // Create new draft
        log(`  Creating draft listing...`);
        const draft = await createDraftListing(shopId, item.draftData, tokens, keystring);
        item.listingId = draft.listing_id;
        log(`  Draft created: #${draft.listing_id}`);

        // Upload images if specified
        if (item.images && item.images.length > 0) {
          for (const imgPath of item.images) {
            if (fs.existsSync(imgPath)) {
              log(`  Uploading image: ${path.basename(imgPath)}`);
              await uploadListingImage(shopId, draft.listing_id, imgPath, tokens, keystring);
            } else {
              log(`  WARN: Image not found: ${imgPath}`);
            }
          }
        }

        // Upload digital files if specified
        if (item.files && item.files.length > 0) {
          for (const filePath of item.files) {
            if (fs.existsSync(filePath)) {
              log(`  Uploading file: ${path.basename(filePath)}`);
              await uploadListingFile(shopId, draft.listing_id, filePath, tokens, keystring);
            } else {
              log(`  WARN: File not found: ${filePath}`);
            }
          }
        }

        // Activate if images were uploaded (Etsy requires at least 1 image)
        if (item.images && item.images.length > 0) {
          log(`  Activating listing #${draft.listing_id}...`);
          await activateListing(shopId, draft.listing_id, tokens, keystring);
          item.status = 'published';
          item.publishedAt = new Date().toISOString();
          log(`  Published listing #${draft.listing_id}`);
        } else {
          item.status = 'published';
          item.publishedAt = new Date().toISOString();
          log(`  Draft created (no images — will need manual activation)`);
        }
      } else {
        log(`  SKIP: No listingId or draftData for "${item.title}"`);
        item.status = 'failed';
        item.error = 'No listing data';
      }
    } catch (e) {
      log(`  ERROR: ${e.message}`);
      item.status = 'failed';
      item.error = e.message;
      item.failedAt = new Date().toISOString();
    }

    // Rate limit: small delay between API calls
    await new Promise(r => setTimeout(r, 1000));
  }

  // Save updated schedule
  saveSchedule(data);

  const published = dueItems.filter(i => i.status === 'published').length;
  const failed = dueItems.filter(i => i.status === 'failed').length;
  log(`Done. Published: ${published}, Failed: ${failed}`);
}

main().catch(e => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});

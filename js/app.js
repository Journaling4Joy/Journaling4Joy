/* ============================================
   JOURNALING4JOY — Main Application
   ============================================ */

// --- Global State ---
let shopData = null;
let listings = JSON.parse(localStorage.getItem('j4j-listings') || '[]');
let salesData = JSON.parse(localStorage.getItem('j4j-sales') || '[]');

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
  // Handle OAuth callback
  if (window.location.search.includes('code=')) {
    const success = await EtsyAPI.handleCallback();
    if (success) {
      toast('Connected to Etsy!', 'success');
      await syncShop();
    } else {
      toast('OAuth connection failed. Please try again.', 'error');
    }
  }

  initNavigation();
  updateConnectionStatus();
  renderDashboard();
  renderPipeline();
  renderEdits();
  renderTemplates();
  renderTrendingTags();
  populateProductSelects();
  initScheduler();
  initGenerator();
  initPalette();
  initMockups();
  initCollectionCreator();

  // Set redirect URI display
  const redirectUri = EtsyAPI.getRedirectUri();
  const callbackEl = document.getElementById('callback-url');
  const settingRedirect = document.getElementById('setting-redirect');
  if (callbackEl) callbackEl.textContent = redirectUri;
  if (settingRedirect) settingRedirect.value = redirectUri;

  // Load saved settings
  const settings = EtsyAPI.getSettings();
  if (settings.keystring) document.getElementById('setting-keystring').value = settings.keystring;
  if (settings.secret) document.getElementById('setting-secret').value = settings.secret;
  if (settings.shopId) document.getElementById('setting-shop-id').value = settings.shopId;

  // Toggle create form options
  document.querySelectorAll('input[name="create-type"]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('generate-options').style.display = r.value === 'generate' ? '' : 'none';
      document.getElementById('upload-options').style.display = r.value === 'upload' ? '' : 'none';
    });
  });
});

// --- Navigation ---
function initNavigation() {
  document.querySelectorAll('[data-view]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      switchView(view);
    });
  });
}

function switchView(view) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelectorAll(`.nav-link[data-view="${view}"]`).forEach(l => l.classList.add('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`view-${view}`);
  if (target) target.classList.add('active');

  const titles = {
    dashboard: 'Dashboard', listings: 'My Listings', pipeline: 'Pipeline',
    create: 'Create Product', edits: 'Edit Requests', generator: 'Pattern Generator',
    palette: 'Color Palettes', collection: 'Collection Creator',
    mockups: 'Mockup Generator', scheduler: 'Listing Scheduler',
    marketing: 'Marketing', analytics: 'Sales & Analytics', settings: 'Settings'
  };
  document.getElementById('page-title').textContent = titles[view] || view;
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// --- Connection ---
function updateConnectionStatus() {
  const connected = EtsyAPI.isConnected();
  const statusEl = document.getElementById('connection-status');
  const shopStatus = document.getElementById('shop-status');
  const connectBtn = document.getElementById('connect-btn');

  if (connected) {
    if (statusEl) statusEl.innerHTML = '<span class="status-dot connected"></span><span>Connected to Etsy</span>';
    if (shopStatus) shopStatus.textContent = 'Connected';
    if (connectBtn) connectBtn.textContent = 'Sync Shop';
    if (connectBtn) connectBtn.onclick = syncShop;
  } else {
    if (statusEl) statusEl.innerHTML = '<span class="status-dot disconnected"></span><span>Not connected</span>';
    if (shopStatus) shopStatus.textContent = 'Not connected';
    if (connectBtn) connectBtn.textContent = 'Connect Etsy';
    if (connectBtn) connectBtn.onclick = startOAuth;
  }
}

function saveSettings() {
  const settings = {
    keystring: document.getElementById('setting-keystring').value.trim(),
    secret: document.getElementById('setting-secret').value.trim(),
    shopId: document.getElementById('setting-shop-id').value.trim(),
  };
  localStorage.setItem('j4j-settings', JSON.stringify(settings));
  toast('Settings saved!', 'success');
}

function startOAuth() {
  const settings = EtsyAPI.getSettings();
  if (!settings.keystring) {
    switchView('settings');
    toast('Please enter your API Keystring first.', 'error');
    return;
  }
  EtsyAPI.startAuth();
}

async function testConnection() {
  try {
    const shop = await EtsyAPI.getShop();
    document.getElementById('setting-shop-id').value = shop.shop_id;
    toast(`Connected to shop: ${shop.shop_name}`, 'success');
  } catch (e) {
    toast(`Connection failed: ${e.message}`, 'error');
  }
}

// --- Sync Shop ---
async function syncShop() {
  if (!EtsyAPI.isConnected()) {
    toast('Not connected. Please connect to Etsy first.', 'error');
    return;
  }

  toast('Syncing with Etsy...', 'info');

  try {
    // Get shop info
    const shopResp = await EtsyAPI.getShop();
    if (shopResp.results && shopResp.results.length > 0) {
      shopData = shopResp.results[0];
      const settings = EtsyAPI.getSettings();
      settings.shopId = shopData.shop_id;
      localStorage.setItem('j4j-settings', JSON.stringify(settings));
      document.getElementById('setting-shop-id').value = shopData.shop_id;
    } else if (shopResp.shop_id) {
      shopData = shopResp;
    }

    const shopId = shopData?.shop_id || EtsyAPI.getSettings().shopId;
    if (!shopId) {
      toast('Could not find shop ID.', 'error');
      return;
    }

    // Get listings
    const listingsResp = await EtsyAPI.getShopListings(shopId, 'active');
    if (listingsResp.results) {
      listings = listingsResp.results;
      localStorage.setItem('j4j-listings', JSON.stringify(listings));
    }

    // Try to get draft listings too
    try {
      const drafts = await EtsyAPI.getShopListings(shopId, 'draft');
      if (drafts.results) {
        listings = [...listings, ...drafts.results];
        localStorage.setItem('j4j-listings', JSON.stringify(listings));
      }
    } catch (e) { /* drafts may not be accessible */ }

    // Get recent sales
    try {
      const receipts = await EtsyAPI.getShopReceipts(shopId);
      if (receipts.results) {
        salesData = receipts.results;
        localStorage.setItem('j4j-sales', JSON.stringify(salesData));
      }
    } catch (e) { /* sales may fail */ }

    localStorage.setItem('j4j-last-sync', new Date().toISOString());
    document.getElementById('last-sync').textContent = `Synced: ${new Date().toLocaleTimeString()}`;

    updateConnectionStatus();
    renderDashboard();
    renderListings();
    populateProductSelects();

    toast(`Synced! ${listings.length} listings loaded.`, 'success');
  } catch (e) {
    toast(`Sync failed: ${e.message}`, 'error');
    console.error('Sync error:', e);
  }
}

// --- Dashboard ---
function renderDashboard() {
  const activeListings = listings.filter(l => l.state === 'active');
  const pipeline = Products.getPipeline();
  const edits = Products.getEdits().filter(e => e.status === 'pending');

  document.getElementById('stat-active').textContent = activeListings.length || '--';
  document.getElementById('stat-pipeline').textContent = pipeline.length || '--';

  // Calculate sales stats
  let totalSales = 0;
  let totalRevenue = 0;
  let totalViews = 0;
  let totalFavorites = 0;

  listings.forEach(l => {
    totalSales += l.quantity_sold || 0;
    totalViews += l.views || 0;
    totalFavorites += l.num_favorers || 0;
  });

  salesData.forEach(s => {
    if (s.grandtotal) totalRevenue += parseFloat(s.grandtotal.amount) / s.grandtotal.divisor;
  });

  document.getElementById('stat-sales').textContent = totalSales || '--';
  document.getElementById('stat-revenue').textContent = totalRevenue > 0 ? `$${totalRevenue.toFixed(0)}` : '--';
  document.getElementById('stat-views').textContent = totalViews || '--';
  document.getElementById('stat-favorites').textContent = totalFavorites || '--';

  // Recent sales
  const recentSalesEl = document.getElementById('recent-sales');
  if (salesData.length > 0) {
    recentSalesEl.innerHTML = salesData.slice(0, 10).map(s => {
      const date = s.create_timestamp ? new Date(s.create_timestamp * 1000).toLocaleDateString() : '';
      const amount = s.grandtotal ? `$${(parseFloat(s.grandtotal.amount) / s.grandtotal.divisor).toFixed(2)}` : '';
      const buyer = s.buyer_email || 'Buyer';
      return `<div class="edit-item">
        <div class="edit-item-body">
          <h4>${amount} sale</h4>
          <p>${buyer} - ${date}</p>
        </div>
      </div>`;
    }).join('');
  }

  // Top listings
  const topEl = document.getElementById('top-listings');
  if (listings.length > 0) {
    const sorted = [...listings].sort((a, b) => (b.quantity_sold || 0) - (a.quantity_sold || 0));
    topEl.innerHTML = `<table class="data-table"><thead><tr><th>Product</th><th>Sales</th><th>Views</th><th>Favs</th><th>Price</th></tr></thead><tbody>` +
      sorted.slice(0, 5).map(l => `<tr>
        <td><strong>${truncate(l.title, 40)}</strong></td>
        <td>${l.quantity_sold || 0}</td>
        <td>${l.views || 0}</td>
        <td>${l.num_favorers || 0}</td>
        <td>$${l.price ? (parseFloat(l.price.amount) / l.price.divisor).toFixed(2) : '0.00'}</td>
      </tr>`).join('') +
      `</tbody></table>`;
  }

  // Dashboard edits preview
  const dashEdits = document.getElementById('dashboard-edits');
  if (edits.length > 0) {
    dashEdits.innerHTML = edits.slice(0, 3).map(e =>
      `<div class="edit-item">
        <div class="edit-item-body">
          <h4>${e.productName || 'Product'}</h4>
          <p>${truncate(e.notes, 80)}</p>
          <span class="badge badge-${e.priority}">${e.priority}</span>
        </div>
      </div>`
    ).join('');
  }
}

// --- Listings ---
function renderListings() {
  const grid = document.getElementById('listings-grid');
  if (listings.length === 0) {
    grid.innerHTML = '<p class="empty-state">No listings found. Connect your Etsy shop or create a new product.</p>';
    return;
  }

  grid.innerHTML = listings.map(l => {
    const price = l.price ? `$${(parseFloat(l.price.amount) / l.price.divisor).toFixed(2)}` : '';
    const state = l.state || 'active';
    return `<div class="listing-card" data-id="${l.listing_id}">
      <div class="listing-card-img">${l.images && l.images.length > 0 ? `<img src="${l.images[0].url_170x135}" alt="">` : '📄'}</div>
      <div class="listing-card-body">
        <h4>${l.title}</h4>
        <div class="listing-card-stats">
          <span>Sales: <strong>${l.quantity_sold || 0}</strong></span>
          <span>Views: <strong>${l.views || 0}</strong></span>
          <span>Favs: <strong>${l.num_favorers || 0}</strong></span>
        </div>
      </div>
      <div class="listing-card-footer">
        <span class="badge badge-${state}">${state}</span>
        <span style="font-weight:700;">${price}</span>
        <button class="btn btn-sm btn-outline" onclick="editListing('${l.listing_id}')">Edit</button>
      </div>
    </div>`;
  }).join('');
}

function filterListings() {
  const search = document.getElementById('listing-search').value.toLowerCase();
  const filter = document.getElementById('listing-filter').value;

  const filtered = listings.filter(l => {
    const matchSearch = !search || l.title.toLowerCase().includes(search);
    const matchFilter = filter === 'all' || l.state === filter;
    return matchSearch && matchFilter;
  });

  const grid = document.getElementById('listings-grid');
  if (filtered.length === 0) {
    grid.innerHTML = '<p class="empty-state">No matching listings.</p>';
    return;
  }

  grid.innerHTML = filtered.map(l => {
    const price = l.price ? `$${(parseFloat(l.price.amount) / l.price.divisor).toFixed(2)}` : '';
    return `<div class="listing-card">
      <div class="listing-card-img">${l.images && l.images.length > 0 ? `<img src="${l.images[0].url_170x135}" alt="">` : '📄'}</div>
      <div class="listing-card-body">
        <h4>${l.title}</h4>
        <div class="listing-card-stats">
          <span>Sales: <strong>${l.quantity_sold || 0}</strong></span>
          <span>Views: <strong>${l.views || 0}</strong></span>
          <span>Favs: <strong>${l.num_favorers || 0}</strong></span>
        </div>
      </div>
      <div class="listing-card-footer">
        <span class="badge badge-${l.state}">${l.state}</span>
        <span style="font-weight:700;">${price}</span>
        <button class="btn btn-sm btn-outline" onclick="editListing('${l.listing_id}')">Edit</button>
      </div>
    </div>`;
  }).join('');
}

function editListing(listingId) {
  const listing = listings.find(l => String(l.listing_id) === String(listingId));
  if (!listing) return;

  // Pre-fill edit request with this listing
  const select = document.getElementById('edit-product-select');
  select.value = listingId;
  switchView('edits');
  document.getElementById('edit-notes').focus();
}

// --- Pipeline ---
function renderPipeline() {
  const pipeline = Products.getPipeline();
  const stages = ['idea', 'creating', 'ready', 'listed'];

  stages.forEach(stage => {
    const items = pipeline.filter(p => p.stage === stage);
    document.getElementById(`count-${stage}`).textContent = items.length;
    document.getElementById(`items-${stage}`).innerHTML = items.map(p => `
      <div class="kanban-card" onclick="showPipelineDetail('${p.id}')">
        <h4>${p.name}</h4>
        <div class="meta">${p.category || ''} · $${p.price || '0.00'}</div>
        <div class="card-actions">
          ${stage !== 'listed' ? `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); advancePipeline('${p.id}')">Advance</button>` : ''}
          <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); removePipeline('${p.id}')">Remove</button>
        </div>
      </div>
    `).join('') || '<p style="color:var(--text-dim);font-size:0.75rem;text-align:center;padding:20px 0;">Empty</p>';
  });
}

function advancePipeline(id) {
  Products.advancePipelineItem(id);
  renderPipeline();
  renderDashboard();
  toast('Product advanced!', 'success');
}

function removePipeline(id) {
  if (!confirm('Remove this item from the pipeline?')) return;
  Products.removePipelineItem(id);
  renderPipeline();
  renderDashboard();
}

function showAddPipelineModal() {
  const html = `
    <div class="form-group">
      <label>Product Name</label>
      <input type="text" id="pipeline-name" placeholder="e.g., Botanical Calendar 2027">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Category</label>
        <select id="pipeline-category">
          <option value="junk-journal">Junk Journal</option>
          <option value="journal-pages">Journal Pages</option>
          <option value="calendar">Calendar</option>
          <option value="art-prints">Art Prints</option>
          <option value="stickers">Stickers</option>
          <option value="coloring">Coloring Pages</option>
          <option value="notebook">Notebook (KDP)</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="form-group">
        <label>Price ($)</label>
        <input type="number" id="pipeline-price" step="0.01" value="4.99">
      </div>
    </div>
    <div class="form-group">
      <label>Notes</label>
      <textarea id="pipeline-notes" rows="3" placeholder="Ideas, inspiration, target audience..."></textarea>
    </div>
    <button class="btn btn-primary" onclick="addPipelineItem()">Add to Pipeline</button>
  `;
  showModal('Add to Pipeline', html);
}

function addPipelineItem() {
  const name = document.getElementById('pipeline-name').value.trim();
  if (!name) { toast('Please enter a name.', 'error'); return; }

  Products.addToPipeline({
    name,
    category: document.getElementById('pipeline-category').value,
    price: parseFloat(document.getElementById('pipeline-price').value) || 4.99,
    notes: document.getElementById('pipeline-notes').value,
  });

  closeModal();
  renderPipeline();
  renderDashboard();
  toast('Added to pipeline!', 'success');
}

function showPipelineDetail(id) {
  const item = Products.getPipeline().find(p => p.id === id);
  if (!item) return;
  const html = `
    <p><strong>Category:</strong> ${item.category}</p>
    <p><strong>Price:</strong> $${item.price}</p>
    <p><strong>Stage:</strong> ${item.stage}</p>
    <p><strong>Created:</strong> ${new Date(item.created).toLocaleDateString()}</p>
    ${item.notes ? `<p><strong>Notes:</strong> ${item.notes}</p>` : ''}
    <div class="form-actions" style="margin-top:16px;">
      ${item.stage !== 'listed' ? `<button class="btn btn-primary" onclick="advancePipeline('${id}'); closeModal();">Advance</button>` : ''}
      <button class="btn btn-outline" onclick="removePipeline('${id}'); closeModal();">Remove</button>
    </div>
  `;
  showModal(item.name, html);
}

// --- Create Product ---
function createProduct() {
  const name = document.getElementById('create-name').value.trim();
  if (!name) { toast('Please enter a product name.', 'error'); return; }

  const item = {
    name,
    category: document.getElementById('create-category').value,
    price: parseFloat(document.getElementById('create-price').value) || 4.99,
    description: document.getElementById('create-desc').value,
    tags: document.getElementById('create-tags').value,
    pages: parseInt(document.getElementById('create-pages').value) || 10,
    style: document.getElementById('create-style').value,
    stage: 'creating',
  };

  Products.addToPipeline(item);
  renderPipeline();
  renderDashboard();
  toast('Product created and added to pipeline!', 'success');

  // Reset form
  document.getElementById('create-form').reset();
}

async function createAndList() {
  const name = document.getElementById('create-name').value.trim();
  if (!name) { toast('Please enter a product name.', 'error'); return; }
  if (!EtsyAPI.isConnected()) { toast('Connect to Etsy first.', 'error'); return; }

  const settings = EtsyAPI.getSettings();
  if (!settings.shopId) { toast('Shop ID not found. Please sync first.', 'error'); return; }

  const category = document.getElementById('create-category').value;
  const price = parseFloat(document.getElementById('create-price').value) || 4.99;
  const desc = document.getElementById('create-desc').value || Products.generateDescription(
    Products.templates.find(t => t.category === category) || Products.templates[0],
    { name, pages: document.getElementById('create-pages').value, style: document.getElementById('create-style').value }
  );
  const tags = document.getElementById('create-tags').value;

  try {
    toast('Creating draft listing on Etsy...', 'info');

    const listingData = {
      title: name,
      description: desc,
      price: price.toFixed(2),
      quantity: 999,
      who_made: 'i_did',
      when_made: 'made_to_order',
      taxonomy_id: 2078, // Craft Supplies & Tools > Paper > Journal & Planner
      type: 'download',
      is_digital: true,
    };

    if (tags) {
      listingData.tags = tags.split(',').map(t => t.trim()).slice(0, 13).join(',');
    }

    const result = await EtsyAPI.createDraftListing(settings.shopId, listingData);
    toast(`Draft listing created! ID: ${result.listing_id}`, 'success');

    // Add to pipeline as listed
    Products.addToPipeline({
      name,
      category,
      price,
      stage: 'listed',
      etsyListingId: result.listing_id,
    });

    renderPipeline();
    renderDashboard();
  } catch (e) {
    toast(`Failed to create listing: ${e.message}`, 'error');
    console.error(e);
  }
}

function previewListing() {
  const name = document.getElementById('create-name').value || 'Product Name';
  const category = document.getElementById('create-category').value;
  const price = document.getElementById('create-price').value || '4.99';
  const pages = document.getElementById('create-pages').value || '10';
  const style = document.getElementById('create-style').value;
  const userDesc = document.getElementById('create-desc').value;
  const tags = document.getElementById('create-tags').value;

  const template = Products.templates.find(t => t.category === category) || Products.templates[0];
  const desc = userDesc || Products.generateDescription(template, { name, pages, style });
  const suggestedTags = tags || template.tags;

  const panel = document.getElementById('listing-preview-panel');
  panel.style.display = '';

  document.getElementById('listing-preview').innerHTML = `
    <div style="border:1px solid var(--border);border-radius:var(--radius);padding:16px;background:var(--bg);">
      <h3 style="margin-bottom:8px;font-size:1rem;">${name}</h3>
      <p style="font-size:1.2rem;font-weight:700;color:var(--green);margin-bottom:12px;">$${parseFloat(price).toFixed(2)}</p>
      <pre style="white-space:pre-wrap;font-family:inherit;font-size:0.82rem;color:var(--text-muted);margin-bottom:12px;">${desc}</pre>
      <div style="margin-top:12px;">
        <strong style="font-size:0.75rem;color:var(--text-muted);">TAGS:</strong>
        <div class="features" style="margin-top:4px;">${suggestedTags.split(',').map(t => `<span class="trend-tag">${t.trim()}</span>`).join('')}</div>
      </div>
    </div>
  `;
}

function renderTemplates() {
  const grid = document.getElementById('template-grid');
  grid.innerHTML = Products.templates.map(t => `
    <div class="template-card" onclick="applyTemplate('${t.category}')">
      <h4>${t.name}</h4>
      <p>$${t.price} · Pre-filled tags & description</p>
    </div>
  `).join('');
}

function applyTemplate(category) {
  const t = Products.templates.find(x => x.category === category);
  if (!t) return;
  document.getElementById('create-category').value = t.category;
  document.getElementById('create-price').value = t.price;
  document.getElementById('create-tags').value = t.tags;
  toast(`Template "${t.name}" applied!`, 'info');
}

// --- Edit Requests ---
function renderEdits() {
  const edits = Products.getEdits();
  const pending = edits.filter(e => e.status === 'pending');
  const completed = edits.filter(e => e.status === 'completed');

  document.getElementById('pending-count').textContent = pending.length;

  const pendingEl = document.getElementById('pending-edits-list');
  if (pending.length === 0) {
    pendingEl.innerHTML = '<p class="empty-state">No pending edit requests.</p>';
  } else {
    pendingEl.innerHTML = pending.map(e => `
      <div class="edit-item">
        <div class="edit-item-body">
          <h4>${e.productName || 'Product'}</h4>
          <p>${e.notes}</p>
          <div class="edit-item-meta">
            <span class="badge badge-${e.priority}">${e.priority}</span>
            · ${new Date(e.created).toLocaleDateString()}
          </div>
        </div>
        <div class="edit-item-actions">
          <button class="btn btn-sm btn-success" onclick="markEditDone('${e.id}')">Done</button>
          <button class="btn btn-sm btn-outline" onclick="removeEdit('${e.id}')">Remove</button>
        </div>
      </div>
    `).join('');
  }

  const completedEl = document.getElementById('completed-edits-list');
  if (completed.length === 0) {
    completedEl.innerHTML = '<p class="empty-state">No completed edits yet.</p>';
  } else {
    completedEl.innerHTML = completed.slice(0, 20).map(e => `
      <div class="edit-item" style="opacity:0.7;">
        <div class="edit-item-body">
          <h4>${e.productName || 'Product'}</h4>
          <p style="text-decoration:line-through;">${e.notes}</p>
          <div class="edit-item-meta">${e.result || 'Done'} · ${new Date(e.completedAt).toLocaleDateString()}</div>
        </div>
      </div>
    `).join('');
  }
}

function submitEditRequest() {
  const productId = document.getElementById('edit-product-select').value;
  const notes = document.getElementById('edit-notes').value.trim();
  const priority = document.getElementById('edit-priority').value;

  if (!notes) { toast('Please describe what needs to change.', 'error'); return; }

  let productName = 'General';
  if (productId) {
    const listing = listings.find(l => String(l.listing_id) === productId);
    if (listing) productName = truncate(listing.title, 40);
    const pipeItem = Products.getPipeline().find(p => p.id === productId);
    if (pipeItem) productName = pipeItem.name;
  }

  Products.addEditRequest({
    productId,
    productName,
    notes,
    priority,
  });

  document.getElementById('edit-notes').value = '';
  document.getElementById('edit-product-select').value = '';
  renderEdits();
  renderDashboard();
  toast('Edit request submitted!', 'success');
}

function markEditDone(id) {
  Products.completeEditRequest(id);
  renderEdits();
  renderDashboard();
  toast('Edit marked as done!', 'success');
}

function removeEdit(id) {
  Products.removeEditRequest(id);
  renderEdits();
  renderDashboard();
}

// --- Marketing ---
function renderTrendingTags() {
  const { seasonal, evergreen } = Products.getSuggestedTags();
  const container = document.getElementById('trending-tags');
  if (!container) return;

  const allTags = [...seasonal.map(t => ({ tag: t, hot: true })), ...evergreen.map(t => ({ tag: t, hot: false }))];
  container.innerHTML = allTags.map(t =>
    `<span class="trend-tag ${t.hot ? 'hot' : ''}" onclick="copyTag('${t.tag}')">${t.tag}</span>`
  ).join('');
}

function copyTag(tag) {
  navigator.clipboard.writeText(tag).then(() => toast(`Copied: "${tag}"`, 'info'));
}

function generateSocialPost() {
  const listingId = document.getElementById('social-listing-select').value;
  const platform = document.getElementById('social-platform').value;

  let product = { title: 'My New Product', price: '4.99' };
  if (listingId) {
    const listing = listings.find(l => String(l.listing_id) === listingId);
    if (listing) {
      product = {
        title: listing.title,
        price: listing.price ? (parseFloat(listing.price.amount) / listing.price.divisor).toFixed(2) : '',
        url: listing.url || '',
      };
    }
  }

  const post = Products.generateSocialPost(product, platform);
  document.getElementById('social-output').innerHTML = `
    <div class="social-post-output">${post}</div>
    <button class="btn btn-sm btn-outline copy-btn" onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent); toast('Copied!', 'info');">Copy to Clipboard</button>
  `;
}

function analyzeSEO() {
  const listingId = document.getElementById('seo-listing-select').value;
  if (!listingId) return;

  const listing = listings.find(l => String(l.listing_id) === listingId);
  if (!listing) return;

  const results = document.getElementById('seo-results');
  const title = listing.title || '';
  const tags = listing.tags || [];
  const desc = listing.description || '';

  let score = 0;
  const tips = [];

  // Title checks
  if (title.length >= 60) { score += 20; } else { tips.push('Title should be 60+ characters for better Etsy SEO.'); }
  if (title.toLowerCase().includes('digital download') || title.toLowerCase().includes('printable')) { score += 15; } else { tips.push('Add "digital download" or "printable" to the title.'); }

  // Tags
  if (tags.length >= 10) { score += 20; } else { tips.push(`Only ${tags.length}/13 tags used. Fill all 13 for maximum visibility.`); }
  if (tags.length >= 13) { score += 10; }

  // Description
  if (desc.length >= 300) { score += 15; } else { tips.push('Description should be 300+ characters. More detail = better search ranking.'); }
  if (desc.toLowerCase().includes('instant download')) { score += 10; } else { tips.push('Mention "instant download" in the description.'); }
  if (desc.toLowerCase().includes('what') && desc.toLowerCase().includes('included')) { score += 10; } else { tips.push('Add a "WHAT\'S INCLUDED" section to the description.'); }

  const color = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--gold)' : 'var(--coral)';

  results.innerHTML = `
    <div style="margin-top:12px;">
      <div style="font-size:2rem;font-weight:800;color:${color};">${score}/100</div>
      <p style="color:var(--text-muted);font-size:0.82rem;margin-bottom:12px;">SEO Score</p>
      ${tips.length > 0 ? `<ul style="list-style:disc;padding-left:20px;">${tips.map(t => `<li style="font-size:0.82rem;color:var(--text-muted);margin-bottom:6px;">${t}</li>`).join('')}</ul>` : '<p style="color:var(--green);">Looks great! All checks passed.</p>'}
      <h4 style="margin-top:16px;font-size:0.82rem;">Current Tags:</h4>
      <div class="trending-tags" style="margin-top:6px;">${tags.map(t => `<span class="trend-tag">${t}</span>`).join('') || '<em style="color:var(--text-dim);">No tags</em>'}</div>
    </div>
  `;
}

function suggestRenewals() {
  const container = document.getElementById('renewal-list');
  if (listings.length === 0) {
    container.innerHTML = '<p class="empty-state">No listings to renew.</p>';
    return;
  }

  // Suggest renewing listings with low views but high favorites ratio
  const suggestions = [...listings]
    .filter(l => l.state === 'active')
    .sort((a, b) => (b.num_favorers || 0) / Math.max(b.views || 1, 1) - (a.num_favorers || 0) / Math.max(a.views || 1, 1))
    .slice(0, 5);

  container.innerHTML = suggestions.map(l => `
    <div class="edit-item">
      <div class="edit-item-body">
        <h4>${truncate(l.title, 50)}</h4>
        <p>Views: ${l.views || 0} · Favs: ${l.num_favorers || 0} · Sales: ${l.quantity_sold || 0}</p>
      </div>
      <div class="edit-item-actions">
        <span style="font-size:0.72rem;color:var(--text-dim);">$0.20 to renew</span>
      </div>
    </div>
  `).join('');
}

// --- Analytics ---
function loadAnalytics() {
  const period = parseInt(document.getElementById('analytics-period').value);
  const cutoff = Date.now() - (period * 24 * 60 * 60 * 1000);

  const periodSales = salesData.filter(s => s.create_timestamp && s.create_timestamp * 1000 > cutoff);

  let revenue = 0;
  periodSales.forEach(s => {
    if (s.grandtotal) revenue += parseFloat(s.grandtotal.amount) / s.grandtotal.divisor;
  });

  document.getElementById('ana-sales').textContent = periodSales.length;
  document.getElementById('ana-revenue').textContent = `$${revenue.toFixed(2)}`;
  document.getElementById('ana-orders').textContent = periodSales.length;

  const totalViews = listings.reduce((sum, l) => sum + (l.views || 0), 0);
  const totalSold = listings.reduce((sum, l) => sum + (l.quantity_sold || 0), 0);
  const conv = totalViews > 0 ? ((totalSold / totalViews) * 100).toFixed(1) : '0.0';
  document.getElementById('ana-conversion').textContent = `${conv}%`;

  // Sales by product table
  const tbody = document.getElementById('sales-tbody');
  if (listings.length > 0) {
    const sorted = [...listings].sort((a, b) => (b.quantity_sold || 0) - (a.quantity_sold || 0));
    tbody.innerHTML = sorted.map(l => {
      const price = l.price ? (parseFloat(l.price.amount) / l.price.divisor) : 0;
      const rev = price * (l.quantity_sold || 0);
      const views = l.views || 0;
      const convRate = views > 0 ? ((l.quantity_sold || 0) / views * 100).toFixed(1) : '0.0';
      return `<tr>
        <td><strong>${truncate(l.title, 45)}</strong></td>
        <td>${l.quantity_sold || 0}</td>
        <td>$${rev.toFixed(2)}</td>
        <td>${views}</td>
        <td>${l.num_favorers || 0}</td>
        <td>${convRate}%</td>
      </tr>`;
    }).join('');
  }

  // Simple bar chart
  renderRevenueChart(period);
}

function renderRevenueChart(days) {
  const chart = document.getElementById('revenue-chart');
  if (salesData.length === 0) return;

  const buckets = {};
  for (let i = 0; i < Math.min(days, 30); i++) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = 0;
  }

  salesData.forEach(s => {
    if (s.create_timestamp && s.grandtotal) {
      const key = new Date(s.create_timestamp * 1000).toISOString().slice(0, 10);
      if (buckets[key] !== undefined) {
        buckets[key] += parseFloat(s.grandtotal.amount) / s.grandtotal.divisor;
      }
    }
  });

  const values = Object.values(buckets).reverse();
  const max = Math.max(...values, 1);

  chart.innerHTML = `<div class="chart-bar-container">${values.map(v =>
    `<div class="chart-bar" style="height:${Math.max((v / max) * 100, 2)}%;" title="$${v.toFixed(2)}"></div>`
  ).join('')}</div>`;
}

// --- Product Selects ---
function populateProductSelects() {
  const selects = ['edit-product-select', 'seo-listing-select', 'social-listing-select'];
  const options = listings.map(l =>
    `<option value="${l.listing_id}">${truncate(l.title, 50)}</option>`
  ).join('');

  const pipelineOptions = Products.getPipeline().map(p =>
    `<option value="${p.id}">[Pipeline] ${truncate(p.name, 40)}</option>`
  ).join('');

  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const current = el.value;
    el.innerHTML = '<option value="">-- Select --</option>' + options + pipelineOptions;
    if (current) el.value = current;
  });
}

// --- Data Management ---
function exportData() {
  const data = {
    listings,
    sales: salesData,
    pipeline: Products.getPipeline(),
    edits: Products.getEdits(),
    settings: EtsyAPI.getSettings(),
    exported: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `j4j-export-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Data exported!', 'success');
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.listings) { listings = data.listings; localStorage.setItem('j4j-listings', JSON.stringify(listings)); }
      if (data.sales) { salesData = data.sales; localStorage.setItem('j4j-sales', JSON.stringify(salesData)); }
      if (data.pipeline) Products.savePipeline(data.pipeline);
      if (data.edits) Products.saveEdits(data.edits);
      if (data.settings) localStorage.setItem('j4j-settings', JSON.stringify(data.settings));
      renderDashboard();
      renderListings();
      renderPipeline();
      renderEdits();
      populateProductSelects();
      toast('Data imported!', 'success');
    } catch { toast('Invalid JSON file.', 'error'); }
  };
  reader.readAsText(file);
}

function clearAllData() {
  if (!confirm('This will erase ALL local data including settings, pipeline, and edit requests. Are you sure?')) return;
  localStorage.removeItem('j4j-settings');
  localStorage.removeItem('j4j-tokens');
  localStorage.removeItem('j4j-listings');
  localStorage.removeItem('j4j-sales');
  localStorage.removeItem('j4j-pipeline');
  localStorage.removeItem('j4j-edits');
  localStorage.removeItem('j4j-last-sync');
  localStorage.removeItem('j4j-pkce');
  listings = [];
  salesData = [];
  location.reload();
}

// --- Pattern Generator ---
const GEN_API = 'http://localhost:4444/api';
let selectedPreset = 'damask';
let selectedColor = 'gold';
let genPresets = [];
let genColors = [];

// Fallback presets if server is offline
const FALLBACK_PRESETS = [
  { id: 'damask', name: 'Damask Pattern', style: 'vintage' },
  { id: 'damask-pysanky', name: 'Pysanky Damask', style: 'folk' },
  { id: 'damask-mayan', name: 'Mayan Damask', style: 'ancient' },
  { id: 'metallic', name: 'Metallic Texture', style: 'luxury' },
  { id: 'metallic-foil', name: 'Metallic Foil', style: 'luxury' },
  { id: 'metallic-glitter', name: 'Metallic Glitter', style: 'luxury' },
  { id: 'watercolor', name: 'Watercolor Wash', style: 'artistic' },
  { id: 'watercolor-floral', name: 'Watercolor Floral', style: 'botanical' },
  { id: 'vintage', name: 'Vintage Distressed', style: 'aged' },
  { id: 'vintage-ephemera', name: 'Vintage Ephemera', style: 'collage' },
  { id: 'floral', name: 'Classic Floral', style: 'botanical' },
  { id: 'geometric', name: 'Geometric', style: 'modern' },
  { id: 'chevron', name: 'Chevron', style: 'graphic' },
  { id: 'stars', name: 'Stars', style: 'whimsical' },
  { id: 'mosaic', name: 'Mosaic / Rock', style: 'natural' },
  { id: 'cottage-floral', name: 'Cottagecore Floral', style: 'cottagecore' },
  { id: 'dark-academia', name: 'Dark Academia', style: 'scholarly' },
  { id: 'gothic', name: 'Gothic / Witchy', style: 'gothic' },
];

const FALLBACK_COLORS = [
  { id: 'rose-gold', name: 'Rose Gold', hex: '#B76E79' },
  { id: 'gold', name: 'Gold', hex: '#D4AF37' },
  { id: 'silver', name: 'Silver', hex: '#C0C0C0' },
  { id: 'amethyst', name: 'Amethyst Purple', hex: '#9966CC' },
  { id: 'sapphire', name: 'Sapphire Blue', hex: '#0F52BA' },
  { id: 'emerald', name: 'Emerald Green', hex: '#50C878' },
  { id: 'ruby', name: 'Ruby Red', hex: '#E0115F' },
  { id: 'opal', name: 'Opal', hex: '#A8C3BC' },
  { id: 'cotton-candy', name: 'Cotton Candy', hex: '#FFBCD9' },
  { id: 'black', name: 'Black/Onyx', hex: '#1C1C1C' },
  { id: 'steel-gray', name: 'Steel Gray', hex: '#71797E' },
  { id: 'cream', name: 'Cream', hex: '#FFFDD0' },
  { id: 'brown', name: 'Brown/Sepia', hex: '#8B4513' },
  { id: 'dusty-rose', name: 'Dusty Rose', hex: '#DCAE96' },
  { id: 'sage', name: 'Sage Green', hex: '#B2AC88' },
  { id: 'navy', name: 'Navy Blue', hex: '#000080' },
  { id: 'burgundy', name: 'Burgundy', hex: '#800020' },
  { id: 'teal', name: 'Teal', hex: '#008080' },
];

async function initGenerator() {
  // Check server status
  const statusEl = document.getElementById('gen-server-status');
  try {
    const resp = await fetch(`${GEN_API}/health`);
    if (resp.ok) {
      statusEl.textContent = 'Server: connected';
      statusEl.style.color = 'var(--green)';
      // Load presets from server
      const presetsResp = await fetch(`${GEN_API}/presets`);
      const data = await presetsResp.json();
      genPresets = data.presets;
      genColors = data.colors;
    } else {
      throw new Error('not ok');
    }
  } catch {
    statusEl.textContent = 'Server: offline (start with npm run server)';
    statusEl.style.color = 'var(--coral)';
    genPresets = FALLBACK_PRESETS;
    genColors = FALLBACK_COLORS;
  }

  renderPresetGrid();
  renderColorGrid();
  loadCollections();
}

function renderPresetGrid() {
  const grid = document.getElementById('preset-grid');
  if (!grid) return;

  const styleIcons = {
    vintage: '&#127979;', folk: '&#127928;', ancient: '&#127963;',
    luxury: '&#128142;', artistic: '&#127912;', botanical: '&#127804;',
    aged: '&#128220;', collage: '&#128444;', modern: '&#9670;',
    graphic: '&#9650;', whimsical: '&#11088;', natural: '&#129704;',
    cottagecore: '&#127803;', scholarly: '&#128218;', gothic: '&#127769;',
  };

  grid.innerHTML = genPresets.map(p => `
    <div class="preset-card ${p.id === selectedPreset ? 'selected' : ''}" onclick="selectPreset('${p.id}')">
      <span class="preset-icon">${styleIcons[p.style] || '&#9632;'}</span>
      <span class="preset-name">${p.name}</span>
    </div>
  `).join('');
}

function renderColorGrid() {
  const grid = document.getElementById('color-grid');
  if (!grid) return;

  grid.innerHTML = genColors.map(c => `
    <div class="color-swatch ${c.id === selectedColor ? 'selected' : ''}"
         style="background:${c.hex};"
         onclick="selectColor('${c.id}')"
         title="${c.name}">
    </div>
  `).join('');
}

function selectPreset(id) {
  selectedPreset = id;
  renderPresetGrid();
  updateGenName();
}

function selectColor(id) {
  selectedColor = id;
  renderColorGrid();
  updateGenName();
}

function updateGenName() {
  const nameEl = document.getElementById('gen-name');
  if (nameEl && !nameEl.value) {
    // Don't auto-fill if user typed something
  }
}

async function generateSinglePattern() {
  const statusEl = document.getElementById('gen-server-status');
  if (statusEl.textContent.includes('offline')) {
    toast('Start the backend server first: cd backend && npm run server', 'error');
    return;
  }

  const customPrompt = document.getElementById('gen-custom-prompt')?.value?.trim() || undefined;
  const provider = document.getElementById('gen-provider')?.value || 'openai';
  const seamless = document.getElementById('gen-seamless')?.value !== 'false';
  const name = document.getElementById('gen-name')?.value?.trim() || undefined;

  const progress = document.getElementById('gen-progress');
  const progressFill = document.getElementById('gen-progress-fill');
  const progressText = document.getElementById('gen-progress-text');

  progress.style.display = '';
  progressFill.style.width = '20%';
  progressText.textContent = `Generating ${selectedPreset} in ${selectedColor}...`;

  try {
    progressFill.style.width = '40%';
    const resp = await fetch(`${GEN_API}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preset: selectedPreset,
        color: selectedColor,
        name,
        customPrompt,
        provider,
        seamless,
      }),
    });

    progressFill.style.width = '80%';
    const data = await resp.json();

    if (data.error) {
      throw new Error(data.error);
    }

    progressFill.style.width = '100%';
    progressText.textContent = 'Done!';

    // Show preview
    showPatternPreview(data.result);
    loadCollections();
    toast(`Pattern generated: ${data.result.name}`, 'success');
  } catch (e) {
    progressText.textContent = `Error: ${e.message}`;
    progressFill.style.background = 'var(--coral)';
    toast(`Generation failed: ${e.message}`, 'error');
  }

  setTimeout(() => {
    progress.style.display = 'none';
    progressFill.style.width = '0%';
    progressFill.style.background = '';
  }, 5000);
}

function showPatternPreview(result) {
  const preview = document.getElementById('gen-preview');
  if (!preview) return;

  // Convert local path to URL served by backend
  const imagePath = result.files?.final || result.files?.raw;
  const relativePath = imagePath ? imagePath.replace(/\\/g, '/').split('source-assets/')[1] : null;
  const imageUrl = relativePath ? `${GEN_API.replace('/api', '')}/source-assets/${relativePath}` : null;

  preview.innerHTML = `
    <div class="gen-result">
      ${imageUrl ? `<img src="${imageUrl}" alt="${result.name}" class="gen-result-img" onclick="window.open('${imageUrl}', '_blank')">` : '<div class="gen-result-placeholder">Image generated (open source-assets folder to view)</div>'}
      <div class="gen-result-info">
        <h4>${result.name}</h4>
        <p>Preset: ${result.preset} | Color: ${result.color}</p>
        <p>${result.dimensions?.inches} at ${result.dimensions?.dpi} DPI (${result.dimensions?.width}x${result.dimensions?.height}px)</p>
        <p style="font-size:0.7rem;color:var(--text-dim);margin-top:4px;">Provider: ${result.provider} | ${new Date(result.generatedAt).toLocaleString()}</p>
        <div class="gen-result-actions" style="margin-top:12px;">
          <button class="btn btn-sm btn-primary" onclick="addPatternToSchedule('${result.name}')">Schedule Listing</button>
          <button class="btn btn-sm btn-outline" onclick="addPatternToPipeline('${result.name}')">Add to Pipeline</button>
        </div>
      </div>
    </div>
  `;
}

function showBatchGenerateModal() {
  const statusEl = document.getElementById('gen-server-status');
  if (statusEl.textContent.includes('offline')) {
    toast('Start the backend server first: cd backend && npm run server', 'error');
    return;
  }

  const colorCheckboxes = genColors.map(c => `
    <label class="color-check" style="display:inline-flex;align-items:center;gap:6px;margin:4px 8px;">
      <input type="checkbox" value="${c.id}" ${['gold', 'rose-gold', 'amethyst', 'sapphire', 'emerald'].includes(c.id) ? 'checked' : ''}>
      <span class="color-swatch-sm" style="background:${c.hex};width:16px;height:16px;border-radius:3px;display:inline-block;"></span>
      <span style="font-size:0.8rem;">${c.name}</span>
    </label>
  `).join('');

  const html = `
    <p style="margin-bottom:16px;color:var(--text-muted);">Generate a full collection: same pattern in multiple colors. Perfect for creating color-coordinated digital paper packs.</p>
    <div class="form-group">
      <label>Pattern Style: <strong>${genPresets.find(p => p.id === selectedPreset)?.name || selectedPreset}</strong></label>
    </div>
    <div class="form-group">
      <label>Collection Name</label>
      <input type="text" id="batch-gen-name" placeholder="e.g., Vintage Damask Collection" value="${genPresets.find(p => p.id === selectedPreset)?.name || selectedPreset} Collection">
    </div>
    <div class="form-group">
      <label>Select Colors</label>
      <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:8px;">
        ${colorCheckboxes}
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>AI Provider</label>
        <select id="batch-gen-provider">
          <option value="openai">OpenAI (DALL-E 3)</option>
          <option value="stability">Stability AI (SD3)</option>
        </select>
      </div>
    </div>
    <div class="form-actions" style="margin-top:16px;">
      <button class="btn btn-primary" onclick="startBatchGenerate()">Generate Collection</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>
  `;

  showModal('Batch Generate Collection', html);
}

async function startBatchGenerate() {
  const baseName = document.getElementById('batch-gen-name')?.value?.trim() || 'Collection';
  const provider = document.getElementById('batch-gen-provider')?.value || 'openai';
  const checkboxes = document.querySelectorAll('#modal-body .color-check input:checked');
  const colors = Array.from(checkboxes).map(cb => cb.value);

  if (colors.length === 0) {
    toast('Select at least one color.', 'error');
    return;
  }

  closeModal();

  const progress = document.getElementById('gen-progress');
  const progressFill = document.getElementById('gen-progress-fill');
  const progressText = document.getElementById('gen-progress-text');

  progress.style.display = '';
  progressFill.style.width = '10%';
  progressText.textContent = `Generating ${colors.length} patterns... This may take a few minutes.`;

  try {
    const resp = await fetch(`${GEN_API}/generate-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preset: selectedPreset,
        colors,
        baseName,
        provider,
        seamless: true,
      }),
    });

    progressFill.style.width = '90%';
    const data = await resp.json();

    if (data.error) throw new Error(data.error);

    progressFill.style.width = '100%';
    const successCount = data.result.results.filter(r => !r.error).length;
    progressText.textContent = `Done! ${successCount}/${colors.length} patterns generated.`;

    loadCollections();
    toast(`Collection "${baseName}" generated: ${successCount} patterns`, 'success');
  } catch (e) {
    progressText.textContent = `Error: ${e.message}`;
    progressFill.style.background = 'var(--coral)';
    toast(`Batch generation failed: ${e.message}`, 'error');
  }

  setTimeout(() => {
    progress.style.display = 'none';
    progressFill.style.width = '0%';
    progressFill.style.background = '';
  }, 8000);
}

async function loadCollections() {
  const listEl = document.getElementById('collections-list');
  if (!listEl) return;

  try {
    const resp = await fetch(`${GEN_API}/collections`);
    const data = await resp.json();

    if (!data.collections || data.collections.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No generated collections yet.</p>';
      return;
    }

    listEl.innerHTML = data.collections.map(col => {
      const name = col.collection || col.name;
      const count = col.results ? col.results.length : col.files?.length || 0;
      const date = col.generatedAt ? new Date(col.generatedAt).toLocaleDateString() : '';
      return `<div class="queue-item">
        <div class="queue-item-info">
          <h4>${name}</h4>
          <p>${count} patterns ${col.preset ? `| ${col.preset}` : ''} ${date ? `| ${date}` : ''}</p>
        </div>
        <div class="queue-item-actions">
          <button class="btn btn-sm btn-primary" onclick="scheduleCollection('${name}')">Schedule All</button>
        </div>
      </div>`;
    }).join('');
  } catch {
    listEl.innerHTML = '<p class="empty-state">Start the backend server to view collections.</p>';
  }
}

function addPatternToSchedule(name) {
  switchView('scheduler');
  showScheduleModal();
  setTimeout(() => {
    const titleEl = document.getElementById('sched-title');
    if (titleEl) titleEl.value = name + ' - Digital Paper Pack';
  }, 100);
}

function addPatternToPipeline(name) {
  Products.addToPipeline({
    name: name + ' - Digital Paper Pack',
    category: 'digital-paper',
    stage: 'creating',
  });
  renderPipeline();
  toast(`Added "${name}" to pipeline.`, 'success');
}

function scheduleCollection(collectionName) {
  switchView('scheduler');
  showBatchModal();
  // Pre-fill the batch titles with collection name variations
  setTimeout(() => {
    const titlesEl = document.getElementById('batch-titles');
    if (titlesEl) {
      titlesEl.value = `${collectionName} - Digital Paper Pack\n${collectionName} - Mega Bundle`;
    }
  }, 100);
}

async function saveGeneratorKeys() {
  const openaiKey = document.getElementById('gen-openai-key')?.value?.trim();
  const stabilityKey = document.getElementById('gen-stability-key')?.value?.trim();

  try {
    const resp = await fetch(`${GEN_API}/health`);
    if (!resp.ok) throw new Error('Server offline');

    // Save to backend config file via the server
    const configResp = await fetch(`${GEN_API}/save-schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        openaiApiKey: openaiKey,
        stabilityApiKey: stabilityKey,
      }),
    });

    // Also save locally for reference
    localStorage.setItem('j4j-gen-keys', JSON.stringify({
      openai: openaiKey ? '***configured***' : '',
      stability: stabilityKey ? '***configured***' : '',
    }));

    toast('API keys saved to backend config.', 'success');
  } catch {
    toast('Server offline. Start it first: cd backend && npm run server', 'error');
  }
}

// --- Color Palette Engine ---
let palSelectedPalette = 'metallics';
let palSelectedColors = [];
let palSourcePath = '';
let palPalettes = {};
let palColors = {};
let palLastResults = null;

const PAL_FALLBACK_PALETTES = {
  metallics: { name: 'Metallics Collection', colors: ['gold', 'rose-gold', 'silver', 'amethyst', 'sapphire', 'emerald', 'ruby', 'opal', 'cotton-candy', 'black'] },
  'metallics-core': { name: 'Metallics Core', colors: ['gold', 'rose-gold', 'silver', 'amethyst', 'sapphire'] },
  jewel: { name: 'Jewel Tones', colors: ['amethyst', 'sapphire', 'emerald', 'ruby', 'teal', 'burgundy'] },
  earth: { name: 'Earth Tones', colors: ['brown', 'cream', 'dusty-rose', 'sage', 'opal', 'steel-gray'] },
  pastels: { name: 'Soft Pastels', colors: ['cotton-candy', 'dusty-rose', 'cream', 'opal', 'sage'] },
  dark: { name: 'Dark & Moody', colors: ['black', 'navy', 'burgundy', 'steel-gray', 'brown'] },
  'j4j-damask': { name: 'J4J Damask (Match Shop)', colors: ['sapphire', 'brown', 'cream', 'emerald', 'gold', 'amethyst', 'ruby', 'dusty-rose'] },
};

const PAL_FALLBACK_COLORS = {
  'rose-gold': '#B76E79', gold: '#D4AF37', silver: '#C0C0C0', amethyst: '#9966CC',
  sapphire: '#0F52BA', emerald: '#50C878', ruby: '#E0115F', opal: '#A8C3BC',
  'cotton-candy': '#FFBCD9', black: '#1C1C1C', 'steel-gray': '#71797E', cream: '#FFFDD0',
  brown: '#8B4513', 'dusty-rose': '#DCAE96', sage: '#B2AC88', navy: '#000080',
  burgundy: '#800020', teal: '#008080',
};

async function initPalette() {
  // Load palettes from server or fallback
  try {
    const resp = await fetch(`${GEN_API}/palettes`);
    if (resp.ok) {
      const data = await resp.json();
      palPalettes = {};
      data.palettes.forEach(p => palPalettes[p.id] = p);
      palColors = {};
      data.colors.forEach(c => palColors[c.id] = c.hex);
    } else throw new Error();
  } catch {
    palPalettes = PAL_FALLBACK_PALETTES;
    palColors = PAL_FALLBACK_COLORS;
  }

  renderPaletteList();
  renderPalColorPicker();
  loadSourceAssets();
}

function renderPaletteList() {
  const list = document.getElementById('palette-list');
  if (!list) return;

  const palettes = palPalettes;
  list.innerHTML = Object.entries(palettes).map(([key, pal]) => {
    const swatches = (pal.colors || []).map(c => {
      const hex = palColors[c] || PAL_FALLBACK_COLORS[c] || '#888';
      return `<span class="pal-mini-swatch" style="background:${hex}" title="${c}"></span>`;
    }).join('');

    return `<div class="palette-card ${key === palSelectedPalette ? 'selected' : ''}" onclick="selectPalette('${key}')">
      <div class="palette-card-name">${pal.name || key}</div>
      <div class="palette-card-swatches">${swatches}</div>
      <div class="palette-card-count">${(pal.colors || []).length} colors</div>
    </div>`;
  }).join('');
}

function renderPalColorPicker() {
  const grid = document.getElementById('pal-color-picker');
  if (!grid) return;

  const colors = Object.keys(palColors).length > 0 ? palColors : PAL_FALLBACK_COLORS;
  grid.innerHTML = Object.entries(colors).map(([id, hex]) => {
    const isSelected = palSelectedColors.includes(id);
    return `<label class="pal-color-check" title="${id}">
      <input type="checkbox" value="${id}" ${isSelected ? 'checked' : ''} onchange="togglePalColor('${id}')">
      <span class="color-swatch-sm" style="background:${typeof hex === 'string' ? hex : hex};width:24px;height:24px;border-radius:4px;display:inline-block;border:${isSelected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)'}"></span>
    </label>`;
  }).join('');
}

function selectPalette(id) {
  palSelectedPalette = id;
  const pal = palPalettes[id] || PAL_FALLBACK_PALETTES[id];
  if (pal) {
    palSelectedColors = [...(pal.colors || [])];
  }
  renderPaletteList();
  renderPalColorPicker();
}

function togglePalColor(id) {
  if (palSelectedColors.includes(id)) {
    palSelectedColors = palSelectedColors.filter(c => c !== id);
  } else {
    palSelectedColors.push(id);
  }
  palSelectedPalette = ''; // custom selection
  renderPaletteList();
  renderPalColorPicker();
}

async function loadSourceAssets() {
  const select = document.getElementById('pal-source');
  if (!select) return;

  try {
    const resp = await fetch(`${GEN_API}/source-assets`);
    if (resp.ok) {
      const data = await resp.json();
      select.innerHTML = '<option value="">-- Select a source pattern --</option>' +
        data.assets.map(a => `<option value="${a.path}">${a.relativePath} (${(a.size / 1024).toFixed(0)}KB)</option>`).join('');
    } else throw new Error();
  } catch {
    select.innerHTML = '<option value="">Server offline — start backend first</option>';
  }
}

function handlePaletteUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  // For uploaded files, we'd need to save to source-assets via server
  // For now, show a message
  toast('Upload support coming soon. For now, place files in source-assets/ folder.', 'info');
}

function updatePalettePreview() {
  const select = document.getElementById('pal-source');
  const preview = document.getElementById('pal-source-preview');
  if (!select || !preview) return;

  palSourcePath = select.value;
  if (palSourcePath) {
    const relativePath = palSourcePath.replace(/\\/g, '/').split('source-assets/')[1] || '';
    preview.innerHTML = `<img src="${GEN_API.replace('/api', '')}/source-assets/${relativePath}" alt="Source" class="pal-source-img">`;
  } else {
    preview.innerHTML = '';
  }
}

async function previewVariationsUI() {
  if (!palSourcePath) {
    toast('Select a source pattern first.', 'error');
    return;
  }

  const colors = palSelectedColors.length > 0 ? palSelectedColors : (palPalettes[palSelectedPalette]?.colors || ['gold', 'rose-gold', 'amethyst']);
  const method = document.getElementById('pal-method')?.value;
  const preset = document.getElementById('pal-preset-type')?.value;

  const stripEl = document.getElementById('pal-preview-strip');
  stripEl.innerHTML = '<p style="color:var(--text-muted)">Generating preview...</p>';

  try {
    const resp = await fetch(`${GEN_API}/recolor-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputPath: palSourcePath,
        colors,
        method: method === 'auto' ? undefined : method,
        preset,
      }),
    });

    if (!resp.ok) throw new Error(await resp.text());

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    stripEl.innerHTML = `<img src="${url}" alt="Preview Strip" class="pal-strip-img">
      <p style="font-size:0.75rem;color:var(--text-muted);margin-top:8px;">${colors.length} color variations previewed</p>`;
  } catch (e) {
    stripEl.innerHTML = `<p style="color:var(--coral)">Preview failed: ${e.message}</p>`;
  }
}

async function generateVariationsUI() {
  if (!palSourcePath) {
    toast('Select a source pattern first.', 'error');
    return;
  }

  const colors = palSelectedColors.length > 0 ? palSelectedColors : (palPalettes[palSelectedPalette]?.colors || ['gold', 'rose-gold', 'amethyst']);
  const method = document.getElementById('pal-method')?.value;
  const preset = document.getElementById('pal-preset-type')?.value;
  const baseName = document.getElementById('pal-collection-name')?.value?.trim() || undefined;

  const progress = document.getElementById('pal-progress');
  const progressFill = document.getElementById('pal-progress-fill');
  const progressText = document.getElementById('pal-progress-text');

  progress.style.display = '';
  progressFill.style.width = '20%';
  progressText.textContent = `Generating ${colors.length} color variations at 300 DPI...`;

  try {
    const resp = await fetch(`${GEN_API}/recolor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputPath: palSourcePath,
        colors,
        method: method === 'auto' ? undefined : method,
        preset,
        baseName,
      }),
    });

    progressFill.style.width = '80%';
    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    progressFill.style.width = '100%';
    palLastResults = data.result;

    const successCount = data.result.variations.filter(v => !v.error).length;
    progressText.textContent = `Done! ${successCount}/${colors.length} variations generated.`;

    // Show results
    renderVariationResults(data.result);
    loadCollections(); // Refresh collections
    toast(`${successCount} color variations generated!`, 'success');
  } catch (e) {
    progressText.textContent = `Error: ${e.message}`;
    progressFill.style.background = 'var(--coral)';
    toast(`Generation failed: ${e.message}`, 'error');
  }

  setTimeout(() => {
    progress.style.display = 'none';
    progressFill.style.width = '0%';
    progressFill.style.background = '';
  }, 5000);
}

function renderVariationResults(result) {
  const panel = document.getElementById('pal-results-panel');
  const grid = document.getElementById('pal-results-grid');
  if (!panel || !grid) return;

  panel.style.display = '';
  const serverBase = GEN_API.replace('/api', '');

  grid.innerHTML = result.variations.filter(v => !v.error).map(v => {
    const relativePath = v.file?.replace(/\\/g, '/').split('Journaling4Joy/')[1] || '';
    const imageUrl = `${serverBase}/${relativePath}`;
    return `<div class="variation-card">
      <img src="${imageUrl}" alt="${v.colorName}" class="variation-img" onclick="window.open('${imageUrl}', '_blank')">
      <div class="variation-info">
        <span class="color-swatch-sm" style="background:${v.hex};width:12px;height:12px;border-radius:2px;display:inline-block;"></span>
        <span>${v.colorName}</span>
      </div>
    </div>`;
  }).join('');
}

function scheduleVariations() {
  if (!palLastResults || !palLastResults.variations) {
    toast('Generate variations first.', 'error');
    return;
  }

  const variations = palLastResults.variations.filter(v => !v.error);
  switchView('scheduler');
  showBatchModal();

  setTimeout(() => {
    const titlesEl = document.getElementById('batch-titles');
    if (titlesEl) {
      const baseName = palLastResults.baseName || 'Digital Paper';
      titlesEl.value = variations.map(v =>
        `${baseName} - ${v.colorName} - Digital Paper Pack`
      ).join('\n');
    }
  }, 100);
}

// --- Collection Creator ---
const COL_STEPS = [
  { id: 'generate', name: 'Generate Pattern', icon: '&#127912;' },
  { id: 'variations', name: 'Color Variations', icon: '&#127752;' },
  { id: 'mockups', name: 'Mockups', icon: '&#128247;' },
  { id: 'seo', name: 'SEO Listings', icon: '&#128221;' },
  { id: 'package', name: 'Package Files', icon: '&#128230;' },
  { id: 'schedule', name: 'Schedule', icon: '&#128197;' },
];

let colPollingInterval = null;

async function initCollectionCreator() {
  // Set default start date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const startDateEl = document.getElementById('col-start-date');
  if (startDateEl) startDateEl.value = tomorrow.toISOString().slice(0, 10);

  // Load source assets for base pattern selector
  try {
    const resp = await fetch(`${GEN_API}/source-assets`);
    if (resp.ok) {
      const data = await resp.json();
      const select = document.getElementById('col-base-pattern');
      if (select) {
        select.innerHTML = '<option value="">Generate new with AI</option>' +
          data.assets.map(a => `<option value="${a.path}">${a.relativePath}</option>`).join('');
      }
    }
  } catch { /* server offline */ }

  loadExistingCollections();
}

function previewCollectionConfig() {
  const config = getCollectionConfig();
  showModal('Collection Config Preview', `
    <pre style="background:var(--surface2);padding:16px;border-radius:var(--radius);font-size:0.75rem;overflow-x:auto;max-height:400px;">${JSON.stringify(config, null, 2)}</pre>
    <p style="margin-top:12px;font-size:0.8rem;color:var(--text-muted);">
      This will generate <strong>${config.palette ? '5-10' : '?'}</strong> color variations,
      <strong>${config.mockupTemplates?.length || 3}</strong> mockup styles each,
      and schedule listings starting ${config.scheduleStart || 'tomorrow'}.
    </p>
  `);
}

function getCollectionConfig() {
  const mockupSelect = document.getElementById('col-mockups');
  const selectedMockups = mockupSelect ? Array.from(mockupSelect.selectedOptions).map(o => o.value) : ['listing-hero', 'journal-cover', 'flat-lay'];
  const basePattern = document.getElementById('col-base-pattern')?.value;

  return {
    name: document.getElementById('col-name')?.value?.trim() || undefined,
    preset: document.getElementById('col-preset')?.value || 'damask',
    palette: document.getElementById('col-palette')?.value || 'metallics-core',
    provider: document.getElementById('col-provider')?.value || 'openai',
    price: parseFloat(document.getElementById('col-price')?.value || '3.79'),
    mockupTemplates: selectedMockups,
    scheduleStart: document.getElementById('col-start-date')?.value || undefined,
    scheduleGap: parseInt(document.getElementById('col-gap')?.value || '1'),
    scheduleTime: document.getElementById('col-time')?.value || '10:00',
    skipGenerate: !!basePattern,
    basePatternPath: basePattern || undefined,
  };
}

async function startCollectionCreation() {
  const config = getCollectionConfig();

  if (!config.name) {
    // Auto-generate name from preset
    const presetNames = {
      damask: 'Vintage Damask', metallic: 'Metallic Shimmer', watercolor: 'Watercolor Wash',
      'metallic-foil': 'Metallic Foil', 'metallic-glitter': 'Glitter Sparkle',
      'watercolor-floral': 'Watercolor Floral', vintage: 'Vintage Distressed',
      floral: 'Classic Floral', geometric: 'Art Deco Geometric', gothic: 'Gothic Elegance',
      'dark-academia': 'Dark Academia', 'cottage-floral': 'Cottagecore Floral',
      'damask-pysanky': 'Pysanky Damask', 'damask-mayan': 'Mayan Damask',
      chevron: 'Chevron Stripes', stars: 'Celestial Stars',
    };
    config.name = (presetNames[config.preset] || config.preset) + ' Collection';
  }

  // Show progress panel
  const progressPanel = document.getElementById('col-progress-panel');
  progressPanel.style.display = '';
  renderPipelineSteps({});

  toast(`Creating collection: "${config.name}"...`, 'info');

  try {
    const resp = await fetch(`${GEN_API}/collection/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    // Start polling for progress
    startProgressPolling(config.name);
  } catch (e) {
    toast(`Failed to start collection: ${e.message}`, 'error');
  }
}

function startProgressPolling(collectionName) {
  if (colPollingInterval) clearInterval(colPollingInterval);

  const safeName = collectionName.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-');

  colPollingInterval = setInterval(async () => {
    try {
      const resp = await fetch(`${GEN_API}/collection/progress?name=${encodeURIComponent(safeName)}`);
      const data = await resp.json();

      if (data.progress) {
        renderPipelineSteps(data.progress.steps || {});

        // Check if complete
        if (data.progress.steps.complete || data.progress.steps.schedule?.status === 'complete') {
          clearInterval(colPollingInterval);
          colPollingInterval = null;
          toast(`Collection "${collectionName}" is ready!`, 'success');
          loadExistingCollections();

          // Offer to import schedule
          setTimeout(() => {
            showModal('Collection Complete!', `
              <p style="margin-bottom:16px;">"${collectionName}" has been created with all variations, mockups, SEO listings, and a publishing schedule.</p>
              <div class="form-actions">
                <button class="btn btn-primary" onclick="importCollectionSchedule('${safeName}'); closeModal();">Import Schedule to Dashboard</button>
                <button class="btn btn-outline" onclick="closeModal()">Close</button>
              </div>
            `);
          }, 500);
        }
      }
    } catch { /* server may be busy */ }
  }, 3000);
}

function renderPipelineSteps(stepData) {
  const container = document.getElementById('col-pipeline-steps');
  if (!container) return;

  container.innerHTML = COL_STEPS.map(step => {
    const data = stepData[step.id] || {};
    let statusClass = 'pending';
    let statusIcon = '&#9711;'; // empty circle

    if (data.status === 'running') {
      statusClass = 'running';
      statusIcon = '&#9881;'; // gear
    } else if (data.status === 'complete') {
      statusClass = 'complete';
      statusIcon = '&#10003;'; // check
    } else if (data.status === 'failed') {
      statusClass = 'failed';
      statusIcon = '&#10007;'; // x
    }

    return `<div class="pipeline-step ${statusClass}">
      <span class="pipeline-step-icon">${step.icon}</span>
      <div class="pipeline-step-info">
        <div class="pipeline-step-name">${step.name}</div>
        <div class="pipeline-step-detail">${data.detail || (statusClass === 'pending' ? 'Waiting...' : '')}</div>
      </div>
      <span class="pipeline-step-status">${statusIcon}</span>
    </div>`;
  }).join('');
}

async function loadExistingCollections() {
  const listEl = document.getElementById('col-existing-list');
  if (!listEl) return;

  try {
    const resp = await fetch(`${GEN_API}/collection/list`);
    const data = await resp.json();

    if (!data.collections || data.collections.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No collections yet. Create your first one above!</p>';
      return;
    }

    listEl.innerHTML = data.collections.map(col => {
      const name = col.collection || 'Unknown';
      const colorCount = col.colors?.length || '?';
      const date = col.createdAt ? new Date(col.createdAt).toLocaleDateString() : '';
      const statusBadge = col.status === 'complete'
        ? '<span class="badge" style="background:var(--green-bg);color:var(--green);">Complete</span>'
        : col.status === 'in-progress'
          ? '<span class="badge" style="background:var(--gold-bg);color:var(--gold);">In Progress</span>'
          : '<span class="badge">Unknown</span>';

      return `<div class="queue-item">
        <div class="queue-item-info">
          <h4>${name}</h4>
          <p>${colorCount} colors ${col.preset ? `| ${col.preset}` : ''} ${date ? `| ${date}` : ''}</p>
        </div>
        ${statusBadge}
        <div class="queue-item-actions">
          ${col.status === 'complete' ? `<button class="btn btn-sm btn-primary" onclick="importCollectionSchedule('${name.replace(/\s+/g, '-')}')">Import Schedule</button>` : ''}
        </div>
      </div>`;
    }).join('');
  } catch {
    listEl.innerHTML = '<p class="empty-state">Start the backend server to view collections.</p>';
  }
}

async function importCollectionSchedule(safeName) {
  // Load the collection's schedule.json and merge into the dashboard scheduler
  try {
    const resp = await fetch(`${GEN_API.replace('/api', '')}/collections/${safeName}/schedule.json`);
    if (!resp.ok) throw new Error('Could not load schedule');
    const scheduleItems = await resp.json();

    // Add each item to the dashboard scheduler
    let imported = 0;
    for (const item of scheduleItems) {
      Scheduler.addScheduledItem(item);
      imported++;
    }

    renderCalendar();
    renderScheduleQueue();
    updateScheduleStats();
    toast(`Imported ${imported} listings to scheduler!`, 'success');
    switchView('scheduler');
  } catch (e) {
    toast(`Import failed: ${e.message}`, 'error');
  }
}

// --- Mockup Generator ---
let mockTemplates = [];
let selectedMockTemplate = 'journal-cover';

const FALLBACK_MOCK_TEMPLATES = [
  { id: 'journal-cover', name: 'Journal Cover', description: 'Pattern on a hardcover journal', category: 'journal' },
  { id: 'journal-spread', name: 'Journal Open Spread', description: 'Two-page spread', category: 'journal' },
  { id: 'planner-cover', name: 'Planner Cover', description: 'Spiral-bound planner', category: 'planner' },
  { id: 'scrapbook-page', name: 'Scrapbook Page', description: 'Scrapbook layout background', category: 'scrapbook' },
  { id: 'flat-lay', name: 'Flat Lay Scene', description: 'Styled flat-lay with craft supplies', category: 'lifestyle' },
  { id: 'card-making', name: 'Greeting Card', description: 'Card front on craft surface', category: 'card' },
  { id: 'digital-preview', name: 'Digital Preview Grid', description: '4-up seamless tile preview', category: 'preview' },
  { id: 'listing-hero', name: 'Etsy Listing Hero', description: 'Clean product shot for thumbnail', category: 'listing' },
];

const MOCK_CATEGORY_ICONS = {
  journal: '&#128214;', planner: '&#128203;', scrapbook: '&#9986;',
  lifestyle: '&#127912;', card: '&#128140;', preview: '&#128444;', listing: '&#127979;',
};

async function initMockups() {
  try {
    const resp = await fetch(`${GEN_API}/mockup-templates`);
    if (resp.ok) {
      const data = await resp.json();
      mockTemplates = data.templates;
    } else throw new Error();
  } catch {
    mockTemplates = FALLBACK_MOCK_TEMPLATES;
  }

  renderMockupTemplateGrid();
  loadMockupSourceAssets();
}

function renderMockupTemplateGrid() {
  const grid = document.getElementById('mockup-template-grid');
  if (!grid) return;

  grid.innerHTML = mockTemplates.map(t => `
    <div class="mock-template-card ${t.id === selectedMockTemplate ? 'selected' : ''}"
         onclick="selectMockTemplate('${t.id}')">
      <span class="mock-template-icon">${MOCK_CATEGORY_ICONS[t.category] || '&#128247;'}</span>
      <div class="mock-template-info">
        <div class="mock-template-name">${t.name}</div>
        <div class="mock-template-desc">${t.description}</div>
      </div>
    </div>
  `).join('');
}

function selectMockTemplate(id) {
  selectedMockTemplate = id;
  renderMockupTemplateGrid();
}

async function loadMockupSourceAssets() {
  const select = document.getElementById('mock-source');
  if (!select) return;

  try {
    const resp = await fetch(`${GEN_API}/source-assets`);
    if (resp.ok) {
      const data = await resp.json();
      select.innerHTML = '<option value="">-- Select a pattern --</option>' +
        data.assets.map(a => `<option value="${a.path}">${a.relativePath}</option>`).join('');
    } else throw new Error();
  } catch {
    select.innerHTML = '<option value="">Server offline</option>';
  }
}

function updateMockupSourcePreview() {
  const select = document.getElementById('mock-source');
  const preview = document.getElementById('mock-source-preview');
  if (!select || !preview) return;

  const srcPath = select.value;
  if (srcPath) {
    const relativePath = srcPath.replace(/\\/g, '/').split('source-assets/')[1] || '';
    preview.innerHTML = `<img src="${GEN_API.replace('/api', '')}/source-assets/${relativePath}" alt="Source" class="pal-source-img">`;
  } else {
    preview.innerHTML = '';
  }
}

async function previewMockup() {
  const srcPath = document.getElementById('mock-source')?.value;
  if (!srcPath) { toast('Select a pattern first.', 'error'); return; }

  const results = document.getElementById('mock-results');
  results.innerHTML = '<p style="color:var(--text-muted)">Generating preview...</p>';

  try {
    const resp = await fetch(`${GEN_API}/mockup-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patternPath: srcPath, template: selectedMockTemplate }),
    });

    if (!resp.ok) throw new Error(await resp.text());
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    results.innerHTML = `
      <img src="${url}" alt="Mockup Preview" class="mock-preview-img" onclick="window.open('${url}', '_blank')">
      <p style="font-size:0.75rem;color:var(--text-muted);margin-top:8px;">
        ${mockTemplates.find(t => t.id === selectedMockTemplate)?.name || selectedMockTemplate} — preview (reduced size)
      </p>`;
  } catch (e) {
    results.innerHTML = `<p style="color:var(--coral)">Preview failed: ${e.message}</p>`;
  }
}

async function generateSingleMockup() {
  const srcPath = document.getElementById('mock-source')?.value;
  if (!srcPath) { toast('Select a pattern first.', 'error'); return; }
  const baseName = document.getElementById('mock-name')?.value?.trim() || undefined;

  const progress = document.getElementById('mock-progress');
  const progressFill = document.getElementById('mock-progress-fill');
  const progressText = document.getElementById('mock-progress-text');

  progress.style.display = '';
  progressFill.style.width = '30%';
  progressText.textContent = `Generating ${mockTemplates.find(t => t.id === selectedMockTemplate)?.name || selectedMockTemplate} mockup...`;

  try {
    const resp = await fetch(`${GEN_API}/mockup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patternPath: srcPath, template: selectedMockTemplate, baseName }),
    });

    progressFill.style.width = '90%';
    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    progressFill.style.width = '100%';
    progressText.textContent = 'Done!';

    showMockupResult(data.result);
    toast('Mockup generated!', 'success');
  } catch (e) {
    progressText.textContent = `Error: ${e.message}`;
    progressFill.style.background = 'var(--coral)';
    toast(`Mockup failed: ${e.message}`, 'error');
  }

  setTimeout(() => { progress.style.display = 'none'; progressFill.style.width = '0%'; progressFill.style.background = ''; }, 5000);
}

async function generateAllMockupsUI() {
  const srcPath = document.getElementById('mock-source')?.value;
  if (!srcPath) { toast('Select a pattern first.', 'error'); return; }
  const baseName = document.getElementById('mock-name')?.value?.trim() || undefined;

  const progress = document.getElementById('mock-progress');
  const progressFill = document.getElementById('mock-progress-fill');
  const progressText = document.getElementById('mock-progress-text');

  progress.style.display = '';
  progressFill.style.width = '10%';
  progressText.textContent = `Generating all ${mockTemplates.length} mockup styles...`;

  try {
    const resp = await fetch(`${GEN_API}/mockup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patternPath: srcPath, template: 'all', baseName }),
    });

    progressFill.style.width = '90%';
    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    progressFill.style.width = '100%';
    const successCount = data.result.mockups.filter(m => !m.error).length;
    progressText.textContent = `Done! ${successCount}/${mockTemplates.length} mockups generated.`;

    showMockupResults(data.result.mockups);
    toast(`${successCount} mockups generated!`, 'success');
  } catch (e) {
    progressText.textContent = `Error: ${e.message}`;
    progressFill.style.background = 'var(--coral)';
    toast(`Generation failed: ${e.message}`, 'error');
  }

  setTimeout(() => { progress.style.display = 'none'; progressFill.style.width = '0%'; progressFill.style.background = ''; }, 5000);
}

function showMockupResult(result) {
  const el = document.getElementById('mock-results');
  if (!el) return;

  const serverBase = GEN_API.replace('/api', '');
  const relativePath = result.file?.replace(/\\/g, '/').split('Journaling4Joy/')[1] || '';
  const imageUrl = `${serverBase}/${relativePath}`;

  el.innerHTML = `
    <div class="mock-result">
      <img src="${imageUrl}" alt="Mockup" class="mock-preview-img" onclick="window.open('${imageUrl}', '_blank')">
      <p style="font-size:0.8rem;color:var(--text-muted);margin-top:8px;">
        ${result.template} — ${(result.size / 1024 / 1024).toFixed(1)}MB
        <button class="btn btn-sm btn-outline" style="margin-left:8px;" onclick="window.open('${imageUrl}', '_blank')">Full Size</button>
      </p>
    </div>`;
}

function showMockupResults(mockups) {
  const el = document.getElementById('mock-results');
  if (!el) return;

  const serverBase = GEN_API.replace('/api', '');
  el.innerHTML = '<div class="mock-results-grid">' +
    mockups.filter(m => !m.error).map(m => {
      const relativePath = m.file?.replace(/\\/g, '/').split('Journaling4Joy/')[1] || '';
      const imageUrl = `${serverBase}/${relativePath}`;
      return `<div class="mock-result-card">
        <img src="${imageUrl}" alt="${m.templateName}" class="mock-result-thumb" onclick="window.open('${imageUrl}', '_blank')">
        <div class="mock-result-label">${m.templateName}</div>
      </div>`;
    }).join('') +
    '</div>';
}

function showBatchMockupModal() {
  const html = `
    <p style="margin-bottom:16px;color:var(--text-muted);">Generate mockups for all color variations in a folder. Select the folder containing your variations.</p>
    <div class="form-group">
      <label>Variations Folder Path</label>
      <input type="text" id="batch-mock-dir" placeholder="e.g., C:\\Users\\chris\\Journaling4Joy\\source-assets\\Damask\\variations">
    </div>
    <div class="form-group">
      <label>Mockup Template</label>
      <select id="batch-mock-template">
        ${mockTemplates.map(t => `<option value="${t.id}" ${t.id === 'listing-hero' ? 'selected' : ''}>${t.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-actions" style="margin-top:16px;">
      <button class="btn btn-primary" onclick="startBatchMockups()">Generate Batch</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>
  `;
  showModal('Batch Mockup Generation', html);
}

async function startBatchMockups() {
  const inputDir = document.getElementById('batch-mock-dir')?.value?.trim();
  const templateId = document.getElementById('batch-mock-template')?.value || 'listing-hero';

  if (!inputDir) { toast('Enter a folder path.', 'error'); return; }
  closeModal();

  const progress = document.getElementById('mock-progress');
  const progressFill = document.getElementById('mock-progress-fill');
  const progressText = document.getElementById('mock-progress-text');

  progress.style.display = '';
  progressFill.style.width = '20%';
  progressText.textContent = 'Generating batch mockups...';

  try {
    const resp = await fetch(`${GEN_API}/mockup-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputDir, template: templateId }),
    });

    progressFill.style.width = '90%';
    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    progressFill.style.width = '100%';
    const successCount = data.result.results.filter(r => !r.error).length;
    progressText.textContent = `Done! ${successCount} mockups from batch.`;
    toast(`Batch complete: ${successCount} mockups generated!`, 'success');
  } catch (e) {
    progressText.textContent = `Error: ${e.message}`;
    progressFill.style.background = 'var(--coral)';
    toast(`Batch failed: ${e.message}`, 'error');
  }

  setTimeout(() => { progress.style.display = 'none'; progressFill.style.width = '0%'; progressFill.style.background = ''; }, 5000);
}

// --- Scheduler ---
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth();

function initScheduler() {
  renderCalendar();
  renderScheduleQueue();
  renderPublishedHistory();
  updateScheduleStats();

  // Load scheduler settings into form
  const schedSettings = Scheduler.getSettings();
  const timeEl = document.getElementById('sched-default-time');
  const gapEl = document.getElementById('sched-batch-gap');
  if (timeEl) timeEl.value = schedSettings.defaultTime || '10:00';
  if (gapEl) gapEl.value = schedSettings.batchGap || 1;
}

function updateScheduleStats() {
  const stats = Scheduler.getStats();
  document.getElementById('sched-stat-pending').textContent = stats.scheduled;
  document.getElementById('sched-stat-published').textContent = stats.published;
  document.getElementById('sched-stat-failed').textContent = stats.failed;

  const nextEl = document.getElementById('sched-stat-next');
  if (stats.nextUp) {
    const d = new Date(stats.nextUp.publishAt);
    nextEl.textContent = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  } else {
    nextEl.textContent = '--';
  }

  document.getElementById('queue-count').textContent = stats.scheduled;
}

function renderCalendar() {
  const cal = Scheduler.getCalendarMonth(calendarYear, calendarMonth);
  const titleEl = document.getElementById('calendar-month-title');
  titleEl.textContent = `${cal.monthName} ${cal.year}`;

  const grid = document.getElementById('calendar-grid');
  const today = new Date().toISOString().slice(0, 10);

  // Day headers
  let html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    .map(d => `<div class="calendar-header">${d}</div>`).join('');

  // Day cells
  html += cal.days.map(d => {
    if (d.day === null) return '<div class="calendar-day empty"></div>';

    const isToday = d.date === today;
    const hasItems = d.items.length > 0;
    const classes = ['calendar-day'];
    if (isToday) classes.push('today');
    if (hasItems) classes.push('has-items');

    const itemsHtml = d.items.slice(0, 3).map(item =>
      `<div class="calendar-item ${item.status}" title="${item.title || 'Listing'}">${truncate(item.title || 'Listing', 18)}</div>`
    ).join('');

    const moreHtml = d.items.length > 3 ? `<div class="calendar-item" style="color:var(--text-muted)">+${d.items.length - 3} more</div>` : '';

    return `<div class="${classes.join(' ')}" onclick="showDayDetail('${d.date}')">
      <div class="calendar-day-num">${d.day}</div>
      ${itemsHtml}${moreHtml}
    </div>`;
  }).join('');

  grid.innerHTML = html;
}

function changeCalendarMonth(delta) {
  calendarMonth += delta;
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
  renderCalendar();
}

function showDayDetail(dateStr) {
  const items = Scheduler.getItemsForDate(dateStr);
  const d = new Date(dateStr + 'T12:00:00');
  const dateLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  let html = '';
  if (items.length === 0) {
    html = `<p class="empty-state">No listings scheduled for this day.</p>
      <button class="btn btn-primary" onclick="closeModal(); showScheduleModal('${dateStr}')">Schedule a Listing</button>`;
  } else {
    html = items.map(item => {
      const time = new Date(item.publishAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return `<div class="queue-item">
        <div class="queue-item-info">
          <h4>${item.title || 'Untitled Listing'}</h4>
          <p>${time} &middot; ${item.status}</p>
        </div>
        <div class="queue-item-actions">
          ${item.status === 'scheduled' ? `<button class="btn btn-sm btn-outline" onclick="cancelScheduleItem('${item.id}')">Cancel</button>` : ''}
          <button class="btn btn-sm btn-outline" onclick="removeScheduleItem('${item.id}')">Remove</button>
        </div>
      </div>`;
    }).join('');
    html += `<div style="margin-top:12px;">
      <button class="btn btn-primary" onclick="closeModal(); showScheduleModal('${dateStr}')">+ Add Another</button>
    </div>`;
  }

  showModal(dateLabel, html);
}

function renderScheduleQueue() {
  const queueEl = document.getElementById('schedule-queue');
  const items = Scheduler.getScheduledItems();

  if (items.length === 0) {
    queueEl.innerHTML = '<p class="empty-state">No scheduled listings. Click "Schedule Listing" to get started.</p>';
    return;
  }

  queueEl.innerHTML = items.map(item => {
    const d = new Date(item.publishAt);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const relative = getRelativeTime(d);

    return `<div class="queue-item">
      <div class="queue-item-info">
        <h4>${item.title || 'Untitled Listing'}</h4>
        <p>${item.category || 'digital-paper'} &middot; $${item.price || '0.00'}${item.batchId ? ` &middot; Batch ${item.batchId}` : ''}</p>
      </div>
      <div class="queue-item-time">${dateStr} ${timeStr}<br><small style="color:var(--text-muted)">${relative}</small></div>
      <div class="queue-item-actions">
        <button class="btn btn-sm btn-outline" onclick="editScheduleItem('${item.id}')">Edit</button>
        <button class="btn btn-sm btn-outline" onclick="publishNow('${item.id}')">Publish Now</button>
        <button class="btn btn-sm btn-outline" style="color:var(--coral)" onclick="cancelScheduleItem('${item.id}')">Cancel</button>
      </div>
    </div>`;
  }).join('');
}

function renderPublishedHistory() {
  const histEl = document.getElementById('published-history');
  const items = Scheduler.getPublishedItems();

  if (items.length === 0) {
    histEl.innerHTML = '<p class="empty-state">No published listings yet.</p>';
    return;
  }

  histEl.innerHTML = items.slice(0, 20).map(item => {
    const d = new Date(item.publishedAt || item.publishAt);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `<div class="queue-item">
      <div class="queue-item-info">
        <h4>${item.title || 'Untitled Listing'}</h4>
        <p>Published ${dateStr}${item.listingId ? ` &middot; #${item.listingId}` : ''}</p>
      </div>
      <span class="badge" style="background:var(--green-bg);color:var(--green);">Published</span>
    </div>`;
  }).join('');
}

function showScheduleModal(prefillDate) {
  const schedSettings = Scheduler.getSettings();
  const defaultDate = prefillDate || new Date().toISOString().slice(0, 10);
  const defaultTime = schedSettings.defaultTime || '10:00';

  // Build listing options from synced listings (drafts) and pipeline items
  const draftOptions = listings.filter(l => l.state === 'draft').map(l =>
    `<option value="existing:${l.listing_id}">${truncate(l.title, 50)} (Draft #${l.listing_id})</option>`
  ).join('');

  const pipelineOptions = Products.getPipeline().filter(p => p.stage === 'ready').map(p =>
    `<option value="pipeline:${p.id}">${truncate(p.name, 50)} (Pipeline)</option>`
  ).join('');

  const html = `
    <div class="form-group">
      <label>Listing Source</label>
      <select id="sched-source" onchange="toggleScheduleSource()">
        <option value="new">Create New Draft Listing</option>
        ${draftOptions ? '<optgroup label="Existing Drafts">' + draftOptions + '</optgroup>' : ''}
        ${pipelineOptions ? '<optgroup label="Pipeline - Ready">' + pipelineOptions + '</optgroup>' : ''}
      </select>
    </div>
    <div id="sched-new-fields">
      <div class="form-group">
        <label>Title</label>
        <input type="text" id="sched-title" placeholder="e.g., Vintage Damask Digital Paper - Rose Gold - 10 Pack">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Category</label>
          <select id="sched-category">
            <option value="digital-paper">Digital Paper</option>
            <option value="junk-journal">Junk Journal Kit</option>
            <option value="journal-pages">Journal Pages</option>
            <option value="ephemera">Ephemera Pack</option>
            <option value="stickers">Stickers</option>
            <option value="calendar">Calendar</option>
            <option value="art-prints">Art Prints</option>
            <option value="coloring">Coloring Pages</option>
          </select>
        </div>
        <div class="form-group">
          <label>Price ($)</label>
          <input type="number" id="sched-price" step="0.01" min="0.20" value="3.79">
        </div>
      </div>
      <div class="form-group">
        <label>Tags (comma-separated, max 13)</label>
        <input type="text" id="sched-tags" placeholder="digital paper, printable, junk journal, vintage, damask">
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea id="sched-desc" rows="4" placeholder="Listing description..."></textarea>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Publish Date</label>
        <input type="date" id="sched-date" value="${defaultDate}">
      </div>
      <div class="form-group">
        <label>Publish Time</label>
        <input type="time" id="sched-time" value="${defaultTime}">
      </div>
    </div>
    <div class="form-actions" style="margin-top:16px;">
      <button class="btn btn-primary" onclick="addToSchedule()">Add to Schedule</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>
  `;

  showModal('Schedule a Listing', html);
}

function toggleScheduleSource() {
  const source = document.getElementById('sched-source').value;
  document.getElementById('sched-new-fields').style.display = source === 'new' ? '' : 'none';
}

function addToSchedule() {
  const source = document.getElementById('sched-source').value;
  const date = document.getElementById('sched-date').value;
  const time = document.getElementById('sched-time').value;

  if (!date || !time) {
    toast('Please set a date and time.', 'error');
    return;
  }

  const publishAt = new Date(`${date}T${time}:00`).toISOString();
  let item = { publishAt };

  if (source === 'new') {
    item.title = document.getElementById('sched-title').value.trim();
    item.category = document.getElementById('sched-category').value;
    item.price = document.getElementById('sched-price').value;
    item.tags = document.getElementById('sched-tags').value;
    item.description = document.getElementById('sched-desc').value;
    item.sourceType = 'new';

    if (!item.title) {
      toast('Please enter a listing title.', 'error');
      return;
    }

    item.draftData = {
      title: item.title,
      description: item.description,
      price: Math.round(parseFloat(item.price) * 100) / 100,
      tags: item.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 13),
      who_made: 'i_did',
      when_made: 'made_to_order',
      taxonomy_id: 2078, // Craft Supplies & Tools > Paper & Party Supplies
      quantity: 999,
      type: 'download',
    };
  } else if (source.startsWith('existing:')) {
    const listingId = source.split(':')[1];
    const listing = listings.find(l => String(l.listing_id) === listingId);
    item.listingId = listingId;
    item.title = listing?.title || `Listing #${listingId}`;
    item.sourceType = 'existing';
  } else if (source.startsWith('pipeline:')) {
    const pipelineId = source.split(':')[1];
    const pipeItem = Products.getPipeline().find(p => p.id === pipelineId);
    item.title = pipeItem?.name || 'Pipeline Item';
    item.pipelineId = pipelineId;
    item.sourceType = 'pipeline';
  }

  Scheduler.addScheduledItem(item);
  closeModal();
  renderCalendar();
  renderScheduleQueue();
  updateScheduleStats();
  toast(`Scheduled: "${item.title}" for ${new Date(publishAt).toLocaleDateString()}`, 'success');
}

function showBatchModal() {
  const schedSettings = Scheduler.getSettings();
  const defaultDate = new Date().toISOString().slice(0, 10);

  const html = `
    <p style="margin-bottom:16px;color:var(--text-muted);">Schedule multiple listings to publish over several days. Add listing titles below (one per line), and they'll be spaced evenly starting from the chosen date.</p>
    <div class="form-group">
      <label>Listing Titles (one per line)</label>
      <textarea id="batch-titles" rows="8" placeholder="Vintage Damask - Rose Gold - 10 Pack
Vintage Damask - Sapphire Blue - 10 Pack
Vintage Damask - Emerald Green - 10 Pack
Vintage Damask - Amethyst Purple - 10 Pack"></textarea>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Category</label>
        <select id="batch-category">
          <option value="digital-paper">Digital Paper</option>
          <option value="junk-journal">Junk Journal Kit</option>
          <option value="journal-pages">Journal Pages</option>
          <option value="ephemera">Ephemera Pack</option>
          <option value="stickers">Stickers</option>
        </select>
      </div>
      <div class="form-group">
        <label>Price ($)</label>
        <input type="number" id="batch-price" step="0.01" min="0.20" value="3.79">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Start Date</label>
        <input type="date" id="batch-start" value="${defaultDate}">
      </div>
      <div class="form-group">
        <label>Days Between Listings</label>
        <input type="number" id="batch-gap" min="1" max="30" value="${schedSettings.batchGap || 1}">
      </div>
      <div class="form-group">
        <label>Publish Time</label>
        <input type="time" id="batch-time" value="${schedSettings.defaultTime || '10:00'}">
      </div>
    </div>
    <div id="batch-preview" style="margin:12px 0;"></div>
    <div class="form-actions">
      <button class="btn btn-outline" onclick="previewBatch()">Preview Schedule</button>
      <button class="btn btn-primary" onclick="submitBatch()">Schedule All</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>
  `;

  showModal('Batch Schedule', html);
}

function previewBatch() {
  const titles = document.getElementById('batch-titles').value.split('\n').map(t => t.trim()).filter(Boolean);
  const start = document.getElementById('batch-start').value;
  const gap = parseInt(document.getElementById('batch-gap').value) || 1;
  const time = document.getElementById('batch-time').value || '10:00';

  if (titles.length === 0) {
    toast('Enter at least one listing title.', 'error');
    return;
  }

  const previewEl = document.getElementById('batch-preview');
  const startDate = new Date(start);

  previewEl.innerHTML = '<h4 style="margin-bottom:8px;">Preview:</h4>' +
    titles.map((title, i) => {
      const pubDate = new Date(startDate);
      pubDate.setDate(pubDate.getDate() + (i * gap));
      return `<div style="padding:4px 0;font-size:0.8rem;">
        <span style="color:var(--gold)">${pubDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${time}</span>
        &mdash; ${title}
      </div>`;
    }).join('');
}

function submitBatch() {
  const titles = document.getElementById('batch-titles').value.split('\n').map(t => t.trim()).filter(Boolean);
  const category = document.getElementById('batch-category').value;
  const price = document.getElementById('batch-price').value;
  const start = document.getElementById('batch-start').value;
  const gap = parseInt(document.getElementById('batch-gap').value) || 1;
  const time = document.getElementById('batch-time').value || '10:00';

  if (titles.length === 0) {
    toast('Enter at least one listing title.', 'error');
    return;
  }

  const items = titles.map(title => ({
    title,
    category,
    price,
    sourceType: 'new',
    draftData: {
      title,
      who_made: 'i_did',
      when_made: 'made_to_order',
      taxonomy_id: 2078,
      quantity: 999,
      price: Math.round(parseFloat(price) * 100) / 100,
      type: 'download',
    },
  }));

  Scheduler.batchSchedule(items, start, gap, time);
  closeModal();
  renderCalendar();
  renderScheduleQueue();
  updateScheduleStats();
  toast(`Batch scheduled: ${items.length} listings over ${items.length * gap} days`, 'success');
}

function cancelScheduleItem(id) {
  Scheduler.cancelScheduledItem(id);
  renderCalendar();
  renderScheduleQueue();
  updateScheduleStats();
  toast('Listing cancelled.', 'info');
}

function removeScheduleItem(id) {
  Scheduler.removeScheduledItem(id);
  renderCalendar();
  renderScheduleQueue();
  renderPublishedHistory();
  updateScheduleStats();
  toast('Removed from schedule.', 'info');
}

function editScheduleItem(id) {
  const item = Scheduler.getSchedule().find(s => s.id === id);
  if (!item) return;

  const d = new Date(item.publishAt);
  const dateStr = d.toISOString().slice(0, 10);
  const timeStr = d.toTimeString().slice(0, 5);

  const html = `
    <div class="form-group">
      <label>Title</label>
      <input type="text" id="edit-sched-title" value="${item.title || ''}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Date</label>
        <input type="date" id="edit-sched-date" value="${dateStr}">
      </div>
      <div class="form-group">
        <label>Time</label>
        <input type="time" id="edit-sched-time" value="${timeStr}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Price ($)</label>
        <input type="number" id="edit-sched-price" step="0.01" value="${item.price || '3.79'}">
      </div>
      <div class="form-group">
        <label>Tags</label>
        <input type="text" id="edit-sched-tags" value="${item.tags || ''}">
      </div>
    </div>
    <div class="form-actions" style="margin-top:16px;">
      <button class="btn btn-primary" onclick="saveScheduleEdit('${id}')">Save Changes</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>
  `;

  showModal('Edit Scheduled Listing', html);
}

function saveScheduleEdit(id) {
  const title = document.getElementById('edit-sched-title').value.trim();
  const date = document.getElementById('edit-sched-date').value;
  const time = document.getElementById('edit-sched-time').value;
  const price = document.getElementById('edit-sched-price').value;
  const tags = document.getElementById('edit-sched-tags').value;

  const publishAt = new Date(`${date}T${time}:00`).toISOString();
  Scheduler.updateScheduledItem(id, { title, publishAt, price, tags });

  closeModal();
  renderCalendar();
  renderScheduleQueue();
  updateScheduleStats();
  toast('Schedule updated.', 'success');
}

async function publishNow(id) {
  const item = Scheduler.getSchedule().find(s => s.id === id);
  if (!item) return;

  if (!EtsyAPI.isConnected()) {
    toast('Connect to Etsy first to publish listings.', 'error');
    return;
  }

  try {
    toast(`Publishing "${item.title}"...`, 'info');
    const settings = EtsyAPI.getSettings();
    const shopId = settings.shopId;

    if (!shopId) {
      toast('No shop ID. Sync your shop first.', 'error');
      return;
    }

    if (item.sourceType === 'existing' && item.listingId) {
      // Activate existing draft
      await EtsyAPI.updateListing(shopId, item.listingId, { state: 'active' });
    } else if (item.draftData) {
      // Create draft then activate
      const draft = await EtsyAPI.createDraftListing(shopId, item.draftData);
      item.listingId = draft.listing_id;
      // Note: can't activate without images, mark as draft-created
      toast(`Draft created: #${draft.listing_id}. Add images to publish.`, 'info');
    }

    Scheduler.updateScheduledItem(id, {
      status: 'published',
      publishedAt: new Date().toISOString(),
      listingId: item.listingId,
    });

    renderCalendar();
    renderScheduleQueue();
    renderPublishedHistory();
    updateScheduleStats();
    toast(`Published: "${item.title}"`, 'success');
  } catch (e) {
    Scheduler.updateScheduledItem(id, { status: 'failed', error: e.message });
    renderScheduleQueue();
    updateScheduleStats();
    toast(`Publish failed: ${e.message}`, 'error');
  }
}

function saveSchedulerSettings() {
  const settings = {
    defaultTime: document.getElementById('sched-default-time').value,
    batchGap: parseInt(document.getElementById('sched-batch-gap').value) || 1,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  Scheduler.saveSettings(settings);
  toast('Scheduler settings saved.', 'success');
}

function getRelativeTime(date) {
  const now = new Date();
  const diff = date - now;
  const absDiff = Math.abs(diff);
  const isPast = diff < 0;

  if (absDiff < 60000) return isPast ? 'just now' : 'in < 1 min';
  if (absDiff < 3600000) {
    const mins = Math.round(absDiff / 60000);
    return isPast ? `${mins}m ago` : `in ${mins}m`;
  }
  if (absDiff < 86400000) {
    const hrs = Math.round(absDiff / 3600000);
    return isPast ? `${hrs}h ago` : `in ${hrs}h`;
  }
  const days = Math.round(absDiff / 86400000);
  return isPast ? `${days}d ago` : `in ${days}d`;
}

// --- Utilities ---
function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function showModal(title, bodyHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

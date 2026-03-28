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
    create: 'Create Product', edits: 'Edit Requests', marketing: 'Marketing',
    analytics: 'Sales & Analytics', settings: 'Settings'
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

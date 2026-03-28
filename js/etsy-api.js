/* ============================================
   ETSY API v3 — OAuth & API Integration
   ============================================ */

const EtsyAPI = (() => {
  const BASE = 'https://openapi.etsy.com/v3';
  const AUTH_URL = 'https://www.etsy.com/oauth/connect';
  const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';

  // --- PKCE Helpers ---
  function generateCodeVerifier() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return btoa(String.fromCharCode(...arr))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function generateCodeChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function getSettings() {
    return JSON.parse(localStorage.getItem('j4j-settings') || '{}');
  }

  function getTokens() {
    return JSON.parse(localStorage.getItem('j4j-tokens') || '{}');
  }

  function saveTokens(tokens) {
    tokens.saved_at = Date.now();
    localStorage.setItem('j4j-tokens', JSON.stringify(tokens));
  }

  // --- OAuth Flow ---
  async function startAuth() {
    const settings = getSettings();
    if (!settings.keystring) {
      throw new Error('Please set your Etsy API Keystring in Settings first.');
    }

    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = crypto.randomUUID();
    const redirectUri = getRedirectUri();

    // Save PKCE state for the callback
    localStorage.setItem('j4j-pkce', JSON.stringify({ verifier, state }));

    const scopes = [
      'listings_r', 'listings_w', 'listings_d',
      'transactions_r', 'profile_r', 'shops_r', 'shops_w'
    ].join('%20');

    const authUrl = `${AUTH_URL}?response_type=code` +
      `&client_id=${settings.keystring}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${scopes}` +
      `&state=${state}` +
      `&code_challenge=${challenge}` +
      `&code_challenge_method=S256`;

    window.location.href = authUrl;
  }

  async function handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (!code || !state) return false;

    const pkce = JSON.parse(localStorage.getItem('j4j-pkce') || '{}');
    if (state !== pkce.state) {
      console.error('OAuth state mismatch');
      return false;
    }

    const settings = getSettings();
    const redirectUri = getRedirectUri();

    try {
      const resp = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: settings.keystring,
          redirect_uri: redirectUri,
          code: code,
          code_verifier: pkce.verifier,
        }),
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Token exchange failed: ${err}`);
      }

      const tokens = await resp.json();
      saveTokens(tokens);
      localStorage.removeItem('j4j-pkce');

      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      return true;
    } catch (e) {
      console.error('OAuth callback error:', e);
      return false;
    }
  }

  async function refreshToken() {
    const tokens = getTokens();
    const settings = getSettings();

    if (!tokens.refresh_token || !settings.keystring) return false;

    try {
      const resp = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: settings.keystring,
          refresh_token: tokens.refresh_token,
        }),
      });

      if (!resp.ok) return false;

      const newTokens = await resp.json();
      saveTokens(newTokens);
      return true;
    } catch {
      return false;
    }
  }

  function isConnected() {
    const tokens = getTokens();
    return !!tokens.access_token;
  }

  function isTokenExpired() {
    const tokens = getTokens();
    if (!tokens.saved_at || !tokens.expires_in) return true;
    return Date.now() > tokens.saved_at + (tokens.expires_in * 1000) - 60000;
  }

  async function ensureValidToken() {
    if (!isConnected()) throw new Error('Not connected to Etsy.');
    if (isTokenExpired()) {
      const refreshed = await refreshToken();
      if (!refreshed) throw new Error('Session expired. Please reconnect.');
    }
  }

  function getRedirectUri() {
    return window.location.origin + window.location.pathname;
  }

  function getUserId() {
    const tokens = getTokens();
    if (tokens.access_token) {
      // Etsy access tokens are prefixed with user_id
      const parts = tokens.access_token.split('.');
      if (parts.length > 0) return parts[0];
    }
    return null;
  }

  // --- API Calls ---
  async function apiCall(endpoint, options = {}) {
    await ensureValidToken();
    const tokens = getTokens();
    const settings = getSettings();

    const headers = {
      'Authorization': `Bearer ${tokens.access_token}`,
      'x-api-key': settings.keystring,
      ...options.headers,
    };

    const resp = await fetch(`${BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (resp.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) return apiCall(endpoint, options);
      throw new Error('Authentication failed. Please reconnect.');
    }

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`API Error ${resp.status}: ${err}`);
    }

    return resp.json();
  }

  // --- Shop ---
  async function getShop() {
    const userId = getUserId();
    if (!userId) throw new Error('No user ID found.');
    return apiCall(`/application/users/${userId}/shops`);
  }

  async function getShopListings(shopId, state = 'active', limit = 100, offset = 0) {
    return apiCall(`/application/shops/${shopId}/listings?state=${state}&limit=${limit}&offset=${offset}`);
  }

  async function getListing(listingId) {
    return apiCall(`/application/listings/${listingId}`);
  }

  async function getListingImages(listingId) {
    const settings = getSettings();
    // This endpoint can use API key only (no OAuth needed)
    const resp = await fetch(`${BASE}/application/listings/${listingId}/images`, {
      headers: { 'x-api-key': settings.keystring }
    });
    if (!resp.ok) return { results: [] };
    return resp.json();
  }

  // --- Create Listing ---
  async function createDraftListing(shopId, listingData) {
    return apiCall(`/application/shops/${shopId}/listings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(listingData),
    });
  }

  async function uploadListingFile(shopId, listingId, file) {
    const formData = new FormData();
    formData.append('file', file);

    return apiCall(`/application/shops/${shopId}/listings/${listingId}/files`, {
      method: 'POST',
      body: formData,
    });
  }

  async function uploadListingImage(shopId, listingId, imageFile) {
    const formData = new FormData();
    formData.append('image', imageFile);

    return apiCall(`/application/shops/${shopId}/listings/${listingId}/images`, {
      method: 'POST',
      body: formData,
    });
  }

  // --- Transactions / Sales ---
  async function getShopReceipts(shopId, limit = 25, offset = 0) {
    return apiCall(`/application/shops/${shopId}/receipts?limit=${limit}&offset=${offset}&was_paid=true`);
  }

  async function getShopTransactions(shopId, limit = 25, offset = 0) {
    return apiCall(`/application/shops/${shopId}/transactions?limit=${limit}&offset=${offset}`);
  }

  // --- Reviews ---
  async function getShopReviews(shopId, limit = 25) {
    return apiCall(`/application/shops/${shopId}/reviews?limit=${limit}`);
  }

  // --- Update Listing ---
  async function updateListing(shopId, listingId, data) {
    return apiCall(`/application/shops/${shopId}/listings/${listingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data),
    });
  }

  // --- Delete Listing ---
  async function deleteListing(listingId) {
    return apiCall(`/application/listings/${listingId}`, {
      method: 'DELETE',
    });
  }

  return {
    startAuth,
    handleCallback,
    refreshToken,
    isConnected,
    isTokenExpired,
    getRedirectUri,
    getUserId,
    getShop,
    getShopListings,
    getListing,
    getListingImages,
    createDraftListing,
    uploadListingFile,
    uploadListingImage,
    getShopReceipts,
    getShopTransactions,
    getShopReviews,
    updateListing,
    deleteListing,
    getSettings,
    getTokens,
  };
})();

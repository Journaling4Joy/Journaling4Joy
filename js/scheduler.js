/* ============================================
   LISTING SCHEDULER — Schedule & Auto-Publish
   ============================================ */

const Scheduler = (() => {
  const SCHEDULE_KEY = 'j4j-schedule';
  const SCHEDULE_SETTINGS_KEY = 'j4j-schedule-settings';

  // --- Schedule CRUD ---
  function getSchedule() {
    return JSON.parse(localStorage.getItem(SCHEDULE_KEY) || '[]');
  }

  function saveSchedule(items) {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(items));
  }

  function getSettings() {
    return JSON.parse(localStorage.getItem(SCHEDULE_SETTINGS_KEY) || JSON.stringify({
      defaultTime: '10:00',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      batchGap: 1, // days between batch items
      autoRenew: false,
    }));
  }

  function saveSettings(settings) {
    localStorage.setItem(SCHEDULE_SETTINGS_KEY, JSON.stringify(settings));
  }

  // --- Add Scheduled Item ---
  function addScheduledItem(item) {
    const schedule = getSchedule();
    item.id = crypto.randomUUID();
    item.createdAt = new Date().toISOString();
    item.status = 'scheduled'; // scheduled | published | failed | cancelled
    schedule.push(item);
    saveSchedule(schedule);
    return item;
  }

  function updateScheduledItem(id, updates) {
    const schedule = getSchedule();
    const idx = schedule.findIndex(s => s.id === id);
    if (idx === -1) return null;
    Object.assign(schedule[idx], updates);
    saveSchedule(schedule);
    return schedule[idx];
  }

  function removeScheduledItem(id) {
    const schedule = getSchedule().filter(s => s.id !== id);
    saveSchedule(schedule);
  }

  function cancelScheduledItem(id) {
    return updateScheduledItem(id, { status: 'cancelled' });
  }

  // --- Batch Scheduling ---
  // Takes an array of listing configs and schedules them starting from a date,
  // spaced by N days apart
  function batchSchedule(items, startDate, gapDays = 1, timeOfDay = '10:00') {
    const scheduled = [];
    const start = new Date(startDate);

    items.forEach((item, i) => {
      const publishDate = new Date(start);
      publishDate.setDate(publishDate.getDate() + (i * gapDays));

      const [hours, minutes] = timeOfDay.split(':').map(Number);
      publishDate.setHours(hours, minutes, 0, 0);

      const scheduledItem = addScheduledItem({
        ...item,
        publishAt: publishDate.toISOString(),
        batchId: crypto.randomUUID().slice(0, 8),
      });
      scheduled.push(scheduledItem);
    });

    // Tag all items with the same batch ID
    const batchId = scheduled[0]?.batchId;
    if (batchId) {
      scheduled.forEach(s => updateScheduledItem(s.id, { batchId }));
    }

    return scheduled;
  }

  // --- Query Helpers ---
  function getScheduledItems() {
    return getSchedule().filter(s => s.status === 'scheduled')
      .sort((a, b) => new Date(a.publishAt) - new Date(b.publishAt));
  }

  function getPublishedItems() {
    return getSchedule().filter(s => s.status === 'published')
      .sort((a, b) => new Date(b.publishedAt || b.publishAt) - new Date(a.publishedAt || a.publishAt));
  }

  function getDueItems() {
    const now = new Date();
    return getScheduledItems().filter(s => new Date(s.publishAt) <= now);
  }

  function getItemsForDate(dateStr) {
    return getSchedule().filter(s => {
      const d = new Date(s.publishAt);
      return d.toISOString().slice(0, 10) === dateStr;
    });
  }

  function getItemsForMonth(year, month) {
    return getSchedule().filter(s => {
      const d = new Date(s.publishAt);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }

  // --- Calendar Data ---
  function getCalendarMonth(year, month) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay(); // 0=Sun
    const totalDays = lastDay.getDate();

    const items = getItemsForMonth(year, month);
    const days = [];

    // Padding for days before the 1st
    for (let i = 0; i < startPad; i++) {
      days.push({ day: null, items: [] });
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayItems = items.filter(s => {
        const sd = new Date(s.publishAt);
        return sd.getDate() === d;
      });
      days.push({ day: d, date: dateStr, items: dayItems });
    }

    return {
      year,
      month,
      monthName: firstDay.toLocaleString('default', { month: 'long' }),
      days,
      totalDays,
    };
  }

  // --- Export for Backend ---
  // Generates a JSON file the Node.js scheduler can read
  function exportForBackend() {
    const items = getScheduledItems();
    const tokens = JSON.parse(localStorage.getItem('j4j-tokens') || '{}');
    const settings = JSON.parse(localStorage.getItem('j4j-settings') || '{}');

    return {
      exportedAt: new Date().toISOString(),
      settings: {
        keystring: settings.keystring,
        shopId: settings.shopId,
      },
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
        saved_at: tokens.saved_at,
      },
      scheduled: items.map(s => ({
        id: s.id,
        publishAt: s.publishAt,
        listingId: s.listingId,
        title: s.title,
        status: s.status,
        // Draft listing data (if not yet created on Etsy)
        draftData: s.draftData || null,
        files: s.files || [],
        images: s.images || [],
      })),
    };
  }

  function downloadExport() {
    const data = exportForBackend();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `j4j-schedule-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Stats ---
  function getStats() {
    const all = getSchedule();
    return {
      total: all.length,
      scheduled: all.filter(s => s.status === 'scheduled').length,
      published: all.filter(s => s.status === 'published').length,
      failed: all.filter(s => s.status === 'failed').length,
      cancelled: all.filter(s => s.status === 'cancelled').length,
      nextUp: getScheduledItems()[0] || null,
    };
  }

  return {
    getSchedule,
    saveSchedule,
    getSettings,
    saveSettings,
    addScheduledItem,
    updateScheduledItem,
    removeScheduledItem,
    cancelScheduledItem,
    batchSchedule,
    getScheduledItems,
    getPublishedItems,
    getDueItems,
    getItemsForDate,
    getItemsForMonth,
    getCalendarMonth,
    exportForBackend,
    downloadExport,
    getStats,
  };
})();

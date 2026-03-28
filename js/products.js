/* ============================================
   PRODUCT CREATION & PIPELINE
   ============================================ */

const Products = (() => {
  const PIPELINE_KEY = 'j4j-pipeline';
  const EDITS_KEY = 'j4j-edits';

  function getPipeline() {
    return JSON.parse(localStorage.getItem(PIPELINE_KEY) || '[]');
  }

  function savePipeline(items) {
    localStorage.setItem(PIPELINE_KEY, JSON.stringify(items));
  }

  function getEdits() {
    return JSON.parse(localStorage.getItem(EDITS_KEY) || '[]');
  }

  function saveEdits(edits) {
    localStorage.setItem(EDITS_KEY, JSON.stringify(edits));
  }

  // --- Pipeline Operations ---
  function addToPipeline(item) {
    const pipeline = getPipeline();
    item.id = crypto.randomUUID();
    item.created = new Date().toISOString();
    item.stage = item.stage || 'idea';
    pipeline.push(item);
    savePipeline(pipeline);
    return item;
  }

  function updatePipelineItem(id, updates) {
    const pipeline = getPipeline();
    const idx = pipeline.findIndex(p => p.id === id);
    if (idx === -1) return null;
    Object.assign(pipeline[idx], updates);
    savePipeline(pipeline);
    return pipeline[idx];
  }

  function advancePipelineItem(id) {
    const flow = { idea: 'creating', creating: 'ready', ready: 'listed' };
    const pipeline = getPipeline();
    const item = pipeline.find(p => p.id === id);
    if (!item || !flow[item.stage]) return null;
    item.stage = flow[item.stage];
    item.updatedAt = new Date().toISOString();
    savePipeline(pipeline);
    return item;
  }

  function removePipelineItem(id) {
    const pipeline = getPipeline().filter(p => p.id !== id);
    savePipeline(pipeline);
  }

  // --- Edit Requests ---
  function addEditRequest(edit) {
    const edits = getEdits();
    edit.id = crypto.randomUUID();
    edit.created = new Date().toISOString();
    edit.status = 'pending';
    edits.push(edit);
    saveEdits(edits);
    return edit;
  }

  function completeEditRequest(id, result) {
    const edits = getEdits();
    const edit = edits.find(e => e.id === id);
    if (!edit) return null;
    edit.status = 'completed';
    edit.completedAt = new Date().toISOString();
    edit.result = result || 'Done';
    saveEdits(edits);
    return edit;
  }

  function removeEditRequest(id) {
    const edits = getEdits().filter(e => e.id !== id);
    saveEdits(edits);
  }

  // --- Listing Templates ---
  const templates = [
    {
      name: 'Junk Journal',
      category: 'junk-journal',
      price: 4.99,
      tags: 'junk journal, digital download, printable, vintage, ephemera, scrapbook, journal pages, paper craft, instant download',
      descTemplate: `{NAME}

A beautifully designed digital junk journal, ready to print at home or use digitally!

WHAT'S INCLUDED:
- {PAGES} unique pages (PDF format)
- High resolution (300 DPI)
- US Letter size (8.5 x 11 inches)
- A4 version included
- Instant download after purchase

HOW TO USE:
1. Download your files after purchase
2. Print at home on cardstock or regular paper
3. Cut, fold, and assemble
4. Or import into GoodNotes, Notability, etc.

PERFECT FOR:
- Junk journaling & scrapbooking
- Art journaling & mixed media
- Gifts & party favors

This is a DIGITAL product. No physical item will be shipped.`
    },
    {
      name: 'Journal Pages Pack',
      category: 'journal-pages',
      price: 2.99,
      tags: 'journal pages, digital download, printable, decorative paper, scrapbook paper, junk journal supply',
      descTemplate: `{NAME}

{PAGES} beautifully designed journal pages for your creative projects!

INCLUDED:
- {PAGES} unique page designs (PDF + individual JPG files)
- 300 DPI high resolution
- US Letter (8.5 x 11") + A4 sizes
- Print-ready with crop marks
- Instant digital download

USE THESE FOR:
- Junk journal backgrounds
- Scrapbook pages
- Planner dividers
- Card making
- Mixed media art

Digital download - no physical product shipped.`
    },
    {
      name: 'Calendar',
      category: 'calendar',
      price: 5.99,
      tags: 'printable calendar, 2027 calendar, digital download, wall calendar, monthly planner, art calendar',
      descTemplate: `{NAME}

A stunning printable calendar featuring original artwork for each month!

INCLUDES:
- 12 monthly pages + cover (13 pages total)
- 300 DPI high resolution
- US Letter size (8.5 x 11") — prints beautifully at home
- Sunday start (Monday start version also included)
- Space for notes and appointments
- Instant download (PDF)

Each month features a unique {STYLE} design.

Perfect as a gift or to brighten your own wall!

Digital product - instant download after purchase.`
    },
    {
      name: 'Art Print Set',
      category: 'art-prints',
      price: 6.99,
      tags: 'art print, printable wall art, digital download, home decor, gallery wall, botanical print',
      descTemplate: `{NAME}

A curated set of {PAGES} printable art prints for your home, office, or studio.

WHAT YOU GET:
- {PAGES} high-resolution art prints
- Multiple sizes included: 5x7, 8x10, 11x14, 16x20
- 300 DPI print-ready files
- PDF + JPG formats
- Instant download

PRINT OPTIONS:
- Print at home on quality paper
- Send to a local print shop
- Upload to an online printing service

Frame not included. Digital download only.`
    },
    {
      name: 'Sticker Sheet',
      category: 'stickers',
      price: 1.99,
      tags: 'printable stickers, digital stickers, planner stickers, sticker sheet, GoodNotes stickers, journal stickers',
      descTemplate: `{NAME}

Adorable printable stickers for planners, journals, and digital apps!

INCLUDED:
- {PAGES} sticker sheets
- PNG files with transparent background (for digital use)
- PDF print sheets with cut lines
- Compatible with GoodNotes, Notability, and other apps
- 300 DPI for crisp printing

HOW TO USE:
- Digital: Import PNGs into your favorite planning app
- Print: Print on sticker paper, cut along the lines

Perfect for planner addicts, journal lovers, and crafters!`
    },
    {
      name: 'Coloring Pages',
      category: 'coloring',
      price: 3.49,
      tags: 'coloring pages, adult coloring, digital download, printable, coloring book, relaxation, art therapy',
      descTemplate: `{NAME}

{PAGES} beautifully detailed coloring pages for adults and older children.

FEATURES:
- {PAGES} unique designs
- US Letter size (8.5 x 11")
- Single-sided printing (no bleed-through worries)
- PDF format - print as many times as you like
- Instant download

THEMES:
- {STYLE} inspired designs
- Intricate details for hours of relaxation
- Suitable for colored pencils, markers, and gel pens

Great gift for creative minds! Digital product - instant download.`
    },
  ];

  // --- Description Generator ---
  function generateDescription(template, data) {
    let desc = template.descTemplate || templates[0].descTemplate;
    desc = desc.replace(/\{NAME\}/g, data.name || 'Product');
    desc = desc.replace(/\{PAGES\}/g, data.pages || '10');
    desc = desc.replace(/\{STYLE\}/g, data.style || 'vintage');
    return desc;
  }

  // --- SEO Tag Suggestions ---
  const seasonalTags = {
    1: ['new year', 'winter', 'goal setting', 'planner 2027', 'resolution journal'],
    2: ['valentine', 'love journal', 'galentine', 'heart stickers', 'romantic'],
    3: ['spring', 'easter', 'botanical', 'garden', 'pastel', 'march madness'],
    4: ['spring cleaning', 'earth day', 'floral', 'garden planner', 'butterfly'],
    5: ['mothers day', 'memorial day', 'flower', 'gratitude journal', 'teacher gift'],
    6: ['summer', 'beach', 'ocean city', 'vacation journal', 'travel planner'],
    7: ['july 4th', 'patriotic', 'summer vibes', 'tropical', 'beach journal'],
    8: ['back to school', 'teacher planner', 'academic planner', 'study'],
    9: ['fall', 'autumn', 'pumpkin', 'cozy', 'september', 'harvest'],
    10: ['halloween', 'spooky', 'gothic', 'witchy', 'october', 'fall leaves'],
    11: ['thanksgiving', 'gratitude', 'holiday prep', 'black friday', 'autumn'],
    12: ['christmas', 'holiday', 'winter', 'gift', 'advent', 'new year prep'],
  };

  const everGreenTags = [
    'digital download', 'printable', 'instant download', 'junk journal',
    'journal pages', 'scrapbook', 'ephemera', 'vintage', 'cottagecore',
    'dark academia', 'botanical', 'minimalist', 'art print', 'wall art',
    'planner', 'stickers', 'coloring pages', 'handmade', 'unique gift',
  ];

  function getSuggestedTags() {
    const month = new Date().getMonth() + 1;
    const seasonal = seasonalTags[month] || [];
    return { seasonal, evergreen: everGreenTags };
  }

  // --- Social Media Post Generator ---
  function generateSocialPost(product, platform) {
    const name = product.title || product.name || 'New Product';
    const price = product.price ? `$${product.price}` : '';
    const url = product.url || '[link in bio]';

    const templates = {
      instagram: `New in the shop! ✨\n\n${name}\n\n${price ? `Only ${price}! ` : ''}Instant digital download — print at home or use in your favorite planning app.\n\nPerfect for junk journaling, scrapbooking, and creative projects!\n\n🔗 Link in bio\n\n#junkjournal #digitaldownload #printable #etsyshop #journaling #scrapbooking #papercraft #plannerlove #journalpages #handmade #etsyseller #craftlife #junkjournalsupply #ephemera #vintagejournal`,

      pinterest: `${name} | Digital Download | Printable\n\n${price ? `${price} — ` : ''}Instant download! Perfect for junk journals, scrapbooks, planners, and creative projects. Print at home on your favorite paper.\n\n${url}`,

      tiktok: `POV: You just found the cutest ${name.toLowerCase()} for your journal 📓✨\n\nInstant download — print at home!\n${price ? `Only ${price}` : ''}\n\nLink in bio 🔗\n\n#junkjournal #journaling #digitaldownload #etsyfinds #scrapbooking #aesthetic #printable #papercraft #fyp`,

      facebook: `Just listed! 🎉\n\n${name}\n${price ? `${price} — ` : ''}Instant digital download\n\nPrint at home or use digitally in GoodNotes, Notability, and more. Perfect for:\n📓 Junk journaling\n✂️ Scrapbooking\n📋 Planner decoration\n🎨 Mixed media art\n\nShop link: ${url}`,
    };

    return templates[platform] || templates.instagram;
  }

  return {
    getPipeline,
    savePipeline,
    addToPipeline,
    updatePipelineItem,
    advancePipelineItem,
    removePipelineItem,
    getEdits,
    saveEdits,
    addEditRequest,
    completeEditRequest,
    removeEditRequest,
    templates,
    generateDescription,
    getSuggestedTags,
    generateSocialPost,
  };
})();

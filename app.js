(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const CATEGORIES = ['Education', 'Technology', 'Experience', 'Achievement'];
  const rawPublished = window.PORTFOLIO && typeof window.PORTFOLIO === 'object' ? window.PORTFOLIO : {};
  const published = {
    ownerHash: typeof rawPublished.ownerHash === 'string' ? rawPublished.ownerHash : null,
    certificates: Array.isArray(rawPublished.certificates)
      ? rawPublished.certificates.filter((item) => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.title === 'string')
      : []
  };

  let items = published.certificates.slice(); // what the page is showing
  let hasLocal = false;                       // unpublished edits saved in this browser
  let filter = 'All';
  let viewerList = [];
  let viewerIndex = 0;
  let editingId = null;
  let serverMode = false;                     // true when the Vercel server functions are set up
  let apiMissing = null;                      // names of missing Vercel settings, if any
  const getToken = () => sessionStorage.getItem('kzt-token') || '';
  const urls = new Map();                     // id -> { thumb, full } object URLs for locally added images

  /* ---------- small helpers ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.forEach((c) => c && el.append(c));
    return el;
  }
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 4200);
  }
  const isOwner = () => document.body.classList.contains('owner');

  /* ---------- local storage of edits (IndexedDB, so images fit) ---------- */
  const db = {
    _open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open('kzt-portfolio', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    async get(key) {
      const d = await this._open();
      return new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    },
    async set(key, val) {
      const d = await this._open();
      return new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    },
    async del(key) {
      const d = await this._open();
      return new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    }
  };

  const toBase64 = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

  async function saveToServer() {
    const payload = await Promise.all(items.map(async (it) => {
      const rec = { id: it.id, title: it.title, issuer: it.issuer || '', detail: it.detail || '', category: it.category, year: it.year || '', thumb: it.thumb, full: it.full };
      if (it.pdf) rec.pdf = it.pdf;
      if (it.fullBlob) {
        delete rec.thumb; delete rec.full;
        rec.fullData = await toBase64(it.fullBlob);
        rec.thumbData = await toBase64(it.thumbBlob);
      }
      return rec;
    }));
    let res;
    try {
      res = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() }, body: JSON.stringify({ certificates: payload }) });
    } catch (e) { throw new Error('Could not reach the server. Check your connection and try again.'); }
    if (res.status === 401) { exitOwner(); throw new Error('Your session ended. Sign in again, then repeat the change.'); }
    if (res.status === 413) throw new Error('That image is too large. Try a smaller one.');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'The server could not save this. Try again.');
    [...urls.keys()].forEach(dropUrls);
    items = data.certificates;
  }

  /** Saves the current list. Throws an Error with a plain message if it fails. */
  async function persist() {
    if (serverMode) return saveToServer();
    try {
      await db.set('state', { certificates: items });
      hasLocal = true;
      updateOwnerBar();
    } catch (e) {
      throw new Error('This browser could not save your changes.');
    }
  }

  function src(item, kind) {
    const blob = item[kind + 'Blob'];
    if (blob) {
      let u = urls.get(item.id) || {};
      if (!u[kind]) { u[kind] = URL.createObjectURL(blob); urls.set(item.id, u); }
      return u[kind];
    }
    return item[kind];
  }
  function dropUrls(id) {
    const u = urls.get(id);
    if (u) { Object.values(u).forEach((x) => URL.revokeObjectURL(x)); urls.delete(id); }
  }

  /* ---------- gallery ---------- */
  function renderFilters() {
    const present = CATEGORIES.filter((c) => items.some((i) => i.category === c));
    if (filter !== 'All' && !present.includes(filter)) filter = 'All';
    const box = $('filters');
    box.replaceChildren(...['All', ...present].map((c) =>
      h('button', { type: 'button', 'aria-pressed': String(c === filter), text: c, 'data-filter': c })));
  }

  function shown() { return items.filter((i) => filter === 'All' || i.category === filter); }

  function renderGrid() {
    const list = shown();
    $('count').textContent = list.length + (list.length === 1 ? ' document' : ' documents');
    const grid = $('grid');
    if (!list.length) { grid.replaceChildren(h('li', { class: 'empty', text: 'No certificates here yet.' })); return; }
    grid.replaceChildren(...list.map((c) => {
      const when = c.year ? c.category + ', ' + c.year : c.category;
      const card = h('button', { type: 'button', class: 'card', 'data-id': c.id, 'aria-label': 'View ' + c.title },
        h('div', { class: 'frame' }, h('img', { src: src(c, 'thumb'), alt: c.title + ', scanned certificate', loading: 'lazy', decoding: 'async' })),
        h('h3', { text: c.title }),
        c.issuer ? h('span', { class: 'by', text: c.issuer }) : null,
        h('span', { class: 'when', text: when }));
      return h('li', {}, card, h('button', { type: 'button', class: 'card-edit', 'data-edit': c.id, 'aria-label': 'Edit ' + c.title, text: 'Edit' }));
    }));
  }

  function renderAll() { renderFilters(); renderGrid(); }

  $('filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    filter = b.dataset.filter;
    renderAll();
  });

  $('grid').addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit]');
    if (edit) { openEditor(items.find((i) => i.id === edit.dataset.edit)); return; }
    const card = e.target.closest('[data-id]');
    if (card) openViewer(shown(), card.dataset.id);
  });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (b) openViewer(items, b.dataset.open);
  });

  /* ---------- viewer ---------- */
  const viewer = $('viewer');

  function openViewer(list, id) {
    viewerList = list;
    viewerIndex = Math.max(0, list.findIndex((i) => i.id === id));
    if (!list.length) return;
    paintViewer();
    if (!viewer.open) viewer.showModal();
  }
  // Ask supported browser PDF viewers to fit the complete page in the window.
  function fitPdfUrl(url) {
    const clean = String(url || '').split('#')[0];
    return clean + '#view=Fit&zoom=page-fit';
  }

  function paintViewer() {
    const c = viewerList[viewerIndex];
    const img = $('vImg');
    img.src = src(c, 'full');
    img.alt = c.title + ', scanned certificate';
    $('vTitle').textContent = c.title;
    $('vIssuer').textContent = c.issuer || '';
    $('vDetail').textContent = c.detail || '';
    $('vOpen').href = src(c, 'full');
    const pdf = $('vPdf');
    pdf.hidden = !c.pdf;
    if (c.pdf) pdf.href = fitPdfUrl(c.pdf);
    $('vEdit').hidden = !isOwner();
    const many = viewerList.length > 1;
    $('vPrev').hidden = !many; $('vNext').hidden = !many;
  }
  function step(d) {
    viewerIndex = (viewerIndex + d + viewerList.length) % viewerList.length;
    paintViewer();
  }
  $('vPrev').addEventListener('click', () => step(-1));
  $('vNext').addEventListener('click', () => step(1));
  $('vClose').addEventListener('click', () => viewer.close());
  $('vEdit').addEventListener('click', () => { const c = viewerList[viewerIndex]; viewer.close(); openEditor(c); });
  viewer.addEventListener('click', (e) => { if (e.target === viewer) viewer.close(); });
  document.addEventListener('keydown', (e) => {
    if (!viewer.open || viewerList.length < 2) return;
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });

  /* ---------- owner sign-in ---------- */
  function cyrb53(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }
  async function hashPass(p) {
    const text = 'kzt-portfolio:' + p;
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return 'sha256:' + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return 'basic:' + cyrb53(text);
  }
  const storedHash = () => published.ownerHash || localStorage.getItem('kzt-owner-hash');

  const gate = $('gate');
  let gateMode = 'signin';

  function openGate() {
    gateMode = serverMode ? 'server' : storedHash() ? 'signin' : 'create';
    $('gateTitle').textContent = gateMode === 'create' ? 'Create an owner passcode' : 'Owner sign in';
    $('gateText').textContent = gateMode === 'create'
      ? 'Choose a passcode of at least 6 characters. It is saved in this browser and goes with your site when you publish your changes.'
      : gateMode === 'server'
        ? 'Enter the owner passcode you set in Vercel. Changes you save go live for every visitor.'
        : 'Enter your passcode to add and edit certificates.';
    $('gConfirmWrap').hidden = gateMode !== 'create';
    $('gSubmit').textContent = gateMode === 'create' ? 'Create and sign in' : 'Sign in';
    $('gPass').autocomplete = gateMode === 'create' ? 'new-password' : 'current-password';
    $('gPass').value = ''; $('gConfirm').value = ''; $('gError').hidden = true;
    gate.showModal();
    $('gPass').focus();
  }
  function gateError(msg) { const e = $('gError'); e.textContent = msg; e.hidden = false; }

  $('gateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = $('gPass').value;
    if (gateMode === 'server') {
      $('gSubmit').disabled = true;
      try {
        const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passcode: p }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return gateError(data.error || 'Sign-in failed. Try again.');
        sessionStorage.setItem('kzt-token', data.token);
      } catch (err) {
        return gateError('Could not reach the server. Check your connection.');
      } finally { $('gSubmit').disabled = false; }
    } else if (gateMode === 'create') {
      if (p.length < 6) return gateError('Use at least 6 characters.');
      if (p !== $('gConfirm').value) return gateError('The two passcodes do not match.');
      localStorage.setItem('kzt-owner-hash', await hashPass(p));
    } else if ((await hashPass(p)) !== storedHash()) {
      return gateError('That passcode is not correct. Try again.');
    }
    gate.close();
    enterOwner();
    toast(apiMissing && apiMissing.length
      ? 'Server storage is not set up yet (missing ' + apiMissing.join(', ') + '). Changes will only be saved in this browser.'
      : 'Owner mode is on.');
  });
  $('gCancel').addEventListener('click', () => gate.close());

  function enterOwner() {
    sessionStorage.setItem('kzt-owner', '1');
    document.body.classList.add('owner');
    $('ownerBar').hidden = false;
    updateOwnerBar();
  }
  function exitOwner() {
    sessionStorage.removeItem('kzt-owner');
    sessionStorage.removeItem('kzt-token');
    document.body.classList.remove('owner');
    $('ownerBar').hidden = true;
  }
  function updateOwnerBar() {
    $('ownerStatus').textContent = serverMode
      ? 'Changes you save go live for every visitor right away.'
      : hasLocal
        ? 'You have unpublished changes saved in this browser. Export them to publish.'
        : 'You are viewing the published version.';
    $('discardBtn').hidden = serverMode || !hasLocal;
    $('exportBtn').hidden = serverMode;
  }

  $('ownerBtn').addEventListener('click', () => {
    if (isOwner()) { $('certificates').scrollIntoView(); $('addBtn').focus(); } else openGate();
  });
  $('signOutBtn').addEventListener('click', () => { exitOwner(); toast('Signed out.'); });

  $('discardBtn').addEventListener('click', async () => {
    if (!confirm('Discard every change saved in this browser and go back to the published version?')) return;
    try { await db.del('state'); } catch (e) { /* nothing to clear */ }
    [...urls.keys()].forEach(dropUrls);
    items = published.certificates.slice();
    hasLocal = false;
    renderAll(); updateOwnerBar();
    toast('Local changes discarded.');
  });

  /* ---------- add / edit ---------- */
  const editor = $('editor');
  let pendingFile = null;

  function openEditor(item) {
    editingId = item ? item.id : null;
    pendingFile = null;
    $('editorTitle').textContent = item ? 'Edit certificate' : 'Add certificate';
    $('fSave').textContent = item ? 'Save changes' : 'Save certificate';
    $('fImage').value = '';
    $('fImageHelp').textContent = item
      ? 'Leave empty to keep the current image.'
      : 'JPG, PNG or WebP. Large photos are resized automatically. For a PDF, save a page as an image first.';
    $('fTitle').value = item ? item.title : '';
    $('fIssuer').value = item ? item.issuer || '' : '';
    $('fCategory').value = item ? item.category : 'Education';
    $('fYear').value = item ? item.year || '' : '';
    $('fDetail').value = item ? item.detail || '' : '';
    $('fDelete').hidden = !item;
    $('fError').hidden = true;
    const prev = $('fPreview');
    prev.hidden = !item;
    if (item) prev.firstElementChild.src = src(item, 'thumb');
    editor.showModal();
    $('fTitle').focus();
  }

  $('addBtn').addEventListener('click', () => openEditor(null));
  $('fCancel').addEventListener('click', () => editor.close());

  $('fImage').addEventListener('change', (e) => {
    const f = e.target.files[0];
    pendingFile = f || null;
    const prev = $('fPreview');
    if (f) {
      prev.firstElementChild.src = URL.createObjectURL(f);
      prev.hidden = false;
      if (!$('fTitle').value) $('fTitle').value = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
    } else if (!editingId) prev.hidden = true;
  });

  function formError(msg) { const e = $('fError'); e.textContent = msg; e.hidden = false; }

  async function processImage(file) {
    const bmp = await createImageBitmap(file);
    const make = (maxW, maxH, q) => {
      const s = Math.min(1, maxW / bmp.width, maxH / bmp.height);
      const w = Math.round(bmp.width * s), hgt = Math.round(bmp.height * s);
      const c = document.createElement('canvas'); c.width = w; c.height = hgt;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, hgt); x.drawImage(bmp, 0, 0, w, hgt);
      return new Promise((res) => c.toBlob(res, 'image/jpeg', q));
    };
    // Keep a single serverless request comfortably below Vercel's request-body limit.
    let q = 0.82, fullBlob = await make(1500, 2120, q);
    while (fullBlob.size > 1.05 * 1024 * 1024 && q > 0.42) { q -= 0.08; fullBlob = await make(1500, 2120, q); }
    const thumbBlob = await make(480, 680, 0.72);
    if (!fullBlob || fullBlob.size > 1.2 * 1024 * 1024 || !thumbBlob) throw new Error('Image could not be compressed enough for upload.');
    return { fullBlob, thumbBlob };
  }

  $('editorForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('fTitle').value.trim();
    const year = $('fYear').value.trim();
    if (!title) return formError('Enter a title for the certificate.');
    if (year && !/^\d{4}$/.test(year)) return formError('Enter the year as four digits, for example 2026, or leave it empty.');
    if (!editingId && !pendingFile) return formError('Choose an image of the certificate.');
    if (pendingFile && pendingFile.size > 25 * 1024 * 1024) return formError('That image is larger than 25 MB. Choose a smaller one.');

    const fields = { title, issuer: $('fIssuer').value.trim(), category: $('fCategory').value, year, detail: $('fDetail').value.trim() };
    const before = items;
    const label = $('fSave').textContent;
    $('fSave').disabled = true; $('fSave').textContent = 'Saving...';
    try {
      let imgs = null;
      if (pendingFile) {
        try { imgs = await processImage(pendingFile); }
        catch (err) { return formError('That file could not be read as an image. Try a JPG or PNG.'); }
      }
      const wasEditing = !!editingId;
      if (wasEditing) {
        const i = items.findIndex((x) => x.id === editingId);
        const old = items[i];
        const next = { ...old, ...fields };
        if (imgs) { delete next.thumb; delete next.full; delete next.pdf; Object.assign(next, imgs); }
        items = items.map((x, n) => (n === i ? next : x));
      } else {
        items = [{ id: 'c' + Date.now().toString(36), ...fields, ...imgs }, ...items];
      }
      try { await persist(); }
      catch (err) { items = before; renderAll(); if (!isOwner()) editor.close(); return formError(err.message); }
      editor.close();
      renderAll();
      toast(serverMode ? 'Saved. Visitors can see it now.' : wasEditing ? 'Changes saved in this browser. Export them to publish.' : 'Certificate added in this browser. Export to publish it.');
    } finally {
      $('fSave').disabled = false; $('fSave').textContent = label;
    }
  });

  $('fDelete').addEventListener('click', async () => {
    const c = items.find((x) => x.id === editingId);
    if (!c || !confirm('Delete "' + c.title + '" from the site?')) return;
    const before = items;
    items = items.filter((x) => x.id !== c.id);
    $('fDelete').disabled = true;
    try { await persist(); }
    catch (err) { items = before; renderAll(); if (!isOwner()) editor.close(); return formError(err.message); }
    finally { $('fDelete').disabled = false; }
    dropUrls(c.id);
    editor.close();
    renderAll();
    toast(serverMode ? 'Deleted. Visitors no longer see it.' : 'Certificate deleted in this browser. Export to publish.');
  });

  /* ---------- export (zip with data.js + new images) ---------- */
  const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

  function makeZip(files) {
    const enc = new TextEncoder();
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const chunks = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      chunks.push(new Uint8Array(lh.buffer), name, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + size;
    }
    const cdSize = central.reduce((n, c) => n + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  $('exportBtn').addEventListener('click', async () => {
    if (!hasLocal) return toast('Nothing to export yet. Add or edit a certificate first.');
    const files = [];
    const out = [];
    for (const it of items) {
      const safe = String(it.id).replace(/[^a-z0-9_-]/gi, '');
      const rec = { id: it.id, title: it.title, issuer: it.issuer || '', detail: it.detail || '', category: it.category, year: it.year || '' };
      if (it.fullBlob) {
        rec.thumb = 'assets/certificates/thumbs/' + safe + '.jpg';
        rec.full = 'assets/certificates/full/' + safe + '.jpg';
        files.push({ name: rec.thumb, data: new Uint8Array(await it.thumbBlob.arrayBuffer()) });
        files.push({ name: rec.full, data: new Uint8Array(await it.fullBlob.arrayBuffer()) });
      } else { rec.thumb = it.thumb; rec.full = it.full; if (it.pdf) rec.pdf = it.pdf; }
      out.push(rec);
    }
    const js = '/* Published certificate data. Exported from the owner editor. */\nwindow.PORTFOLIO = ' +
      JSON.stringify({ ownerHash: storedHash() || null, certificates: out }, null, 2) + ';\n';
    files.unshift({ name: 'data.js', data: new TextEncoder().encode(js) });
    const a = h('a', { href: URL.createObjectURL(makeZip(files)), download: 'kyaw-zin-thu-site-update.zip' });
    document.body.append(a); a.click(); a.remove();
    toast('Exported. Unzip it into the site folder, replace the existing files, then deploy.');
  });

  /* ---------- start ---------- */
  async function init() {
    renderAll();                              // show the published list straight away
    const owner = sessionStorage.getItem('kzt-owner') === '1';
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 8000);
      try {
        const res = await fetch('/api/certificates', { cache: 'no-store', signal: ctl.signal, headers: { Accept: 'application/json' } });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          serverMode = data && data.serverMode === true;
          apiMissing = Array.isArray(data && data.missing) ? data.missing : null;
          if (serverMode && Array.isArray(data.certificates)) items = data.certificates;
        }
      } finally { clearTimeout(timer); }
    } catch (e) { /* no server functions here (for example a local preview) */ }
    if (!serverMode) {
      try {
        const local = await db.get('state');
        if (local && Array.isArray(local.certificates)) { items = local.certificates; hasLocal = true; }
      } catch (e) { /* storage blocked: show the published version */ }
    }
    renderAll();
    if (owner && (!serverMode || getToken())) enterOwner();
  }
  init();
})();

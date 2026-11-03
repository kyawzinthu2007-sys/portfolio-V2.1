import { tokenIsValid, missingSettings } from '../lib/auth.js';
import { readData, writeData, saveImage, removeFiles } from '../lib/store.js';

const CATEGORIES = ['Education', 'Technology', 'Experience', 'Achievement'];
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const text = (v, max) => String(v ?? '').trim().slice(0, max);

function isBlobUrl(u) {
  try { const x = new URL(u); return x.protocol === 'https:' && x.hostname.endsWith('.blob.vercel-storage.com'); }
  catch { return false; }
}
// Images must be a file that ships with the site, or one stored in this project's Blob storage.
function safeImage(u) {
  return typeof u === 'string' && ((u.startsWith('assets/certificates/') && !u.includes('..')) || isBlobUrl(u));
}
function safePdf(u) {
  return typeof u === 'string' && u.startsWith('assets/documents/') && !u.includes('..') && u.endsWith('.pdf');
}

function cleanId(id) {
  return String(id ?? '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'c' + Date.now().toString(36);
}

function decodeJpeg(data) {
  const base64 = String(data).replace(/^data:image\/jpeg;base64,/, '');
  const buf = Buffer.from(base64, 'base64');
  if (buf.length < 4 || buf.length > MAX_IMAGE_BYTES) throw new Error('An image is empty or larger than 3 MB.');
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) throw new Error('Images must be JPEG files.');
  return buf;
}

const urlsOf = (list) => new Set((list || []).flatMap((c) => [c.thumb, c.full]).filter(isBlobUrl));

// Owner only: saves the whole certificate list. New images arrive as base64 in fullData / thumbData.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  const missing = missingSettings();
  if (missing.length) return res.status(503).json({ error: 'Vercel settings are missing: ' + missing.join(', ') });

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!tokenIsValid(token)) return res.status(401).json({ error: 'Sign in again.' });

  const incoming = req.body && req.body.certificates;
  if (!Array.isArray(incoming) || incoming.length > 300) return res.status(400).json({ error: 'The certificate list is not valid.' });

  try {
    const previous = await readData();
    const out = [];
    for (const raw of incoming) {
      if (!raw || typeof raw !== 'object') return res.status(400).json({ error: 'The certificate list is not valid.' });
      const id = cleanId(raw.id);
      const year = text(raw.year, 4);
      const cert = {
        id,
        title: text(raw.title, 120),
        issuer: text(raw.issuer, 140),
        detail: text(raw.detail, 400),
        category: CATEGORIES.includes(raw.category) ? raw.category : 'Education',
        year: /^\d{4}$/.test(year) ? year : '',
        thumb: raw.thumb,
        full: raw.full
      };
      if (!cert.title) return res.status(400).json({ error: 'Every certificate needs a title.' });
      if (raw.pdf && safePdf(raw.pdf)) cert.pdf = raw.pdf;
      if (raw.fullData) cert.full = await saveImage(decodeJpeg(raw.fullData), id + '-full');
      if (raw.thumbData) cert.thumb = await saveImage(decodeJpeg(raw.thumbData), id + '-thumb');
      if (!safeImage(cert.full) || !safeImage(cert.thumb)) return res.status(400).json({ error: 'A certificate has no valid image.' });
      out.push(cert);
    }

    await writeData({ certificates: out, updated: new Date().toISOString() });

    // Remove images that no certificate uses any more.
    const keep = urlsOf(out);
    await removeFiles([...urlsOf(previous && previous.certificates)].filter((u) => !keep.has(u))).catch((e) => console.error('cleanup:', e));

    return res.status(200).json({ certificates: out });
  } catch (err) {
    console.error('save:', err);
    return res.status(500).json({ error: err.message || 'The server could not save this.' });
  }
}

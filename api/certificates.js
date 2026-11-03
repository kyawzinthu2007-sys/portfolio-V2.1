import { readData } from '../lib/store.js';
import { missingSettings } from '../lib/auth.js';

// Public: the page calls this to get the current certificate list.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const missing = missingSettings();
  if (missing.length) return res.status(200).json({ serverMode: false, missing });
  try {
    const data = await readData();
    return res.status(200).json({ serverMode: true, certificates: data ? data.certificates : null });
  } catch (err) {
    console.error('certificates:', err);
    return res.status(500).json({ serverMode: false, error: 'Storage could not be read.' });
  }
}

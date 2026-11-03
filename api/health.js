import { missingSettings } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Use GET.' });
  const missing = missingSettings();
  return res.status(missing.length ? 503 : 200).json({
    ok: missing.length === 0,
    runtime: process.version,
    storageConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    ownerPasscodeConfigured: Boolean(process.env.OWNER_PASSCODE),
    missing
  });
}

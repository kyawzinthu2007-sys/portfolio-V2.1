import { passcodeMatches, makeToken, missingSettings } from '../lib/auth.js';

// Owner sign-in: exchanges the passcode for a 12-hour token.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (missingSettings().includes('OWNER_PASSCODE')) return res.status(503).json({ error: 'OWNER_PASSCODE is not set in Vercel.' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  await new Promise((r) => setTimeout(r, 700)); // slows down guessing
  if (!passcodeMatches(body.passcode)) return res.status(401).json({ error: 'That passcode is not correct.' });
  return res.status(200).json({ token: makeToken() });
}

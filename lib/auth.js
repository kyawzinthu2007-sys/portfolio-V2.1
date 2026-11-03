import crypto from 'node:crypto';

const secret = () => process.env.OWNER_SECRET || process.env.OWNER_PASSCODE || '';
const sign = (value) => crypto.createHmac('sha256', secret()).update(value).digest('hex');

/** Check a typed passcode against the OWNER_PASSCODE setting without leaking timing. */
export function passcodeMatches(input) {
  const real = process.env.OWNER_PASSCODE || '';
  if (!real) return false;
  const a = crypto.createHash('sha256').update(String(input ?? '')).digest();
  const b = crypto.createHash('sha256').update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

/** A signed token that proves the owner signed in. It expires after 12 hours. */
export function makeToken(hours = 12) {
  const exp = String(Date.now() + hours * 3600 * 1000);
  return exp + '.' + sign(exp);
}

export function tokenIsValid(token) {
  if (!token || !secret()) return false;
  const [exp, sig] = String(token).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function missingSettings() {
  const missing = [];
  if (!process.env.BLOB_READ_WRITE_TOKEN) missing.push('BLOB_READ_WRITE_TOKEN');
  if (!process.env.OWNER_PASSCODE) missing.push('OWNER_PASSCODE');
  return missing;
}

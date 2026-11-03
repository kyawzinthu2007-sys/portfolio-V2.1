import { list, put, del } from '@vercel/blob';

const DATA_PATH = 'site/data.json';

/** Read the saved certificate list. Returns null if nothing has been saved yet. */
export async function readData() {
  const { blobs } = await list({ prefix: DATA_PATH, limit: 5 });
  const file = blobs.find((b) => b.pathname === DATA_PATH);
  if (!file) return null;
  // The query string skips any cached copy of the file.
  const res = await fetch(file.url + '?v=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not read saved data (' + res.status + ')');
  return res.json();
}

export async function writeData(data) {
  await put(DATA_PATH, JSON.stringify(data), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60
  });
}

export async function saveImage(buffer, name) {
  const result = await put('site/certs/' + name + '.jpg', buffer, {
    access: 'public',
    addRandomSuffix: true,
    contentType: 'image/jpeg'
  });
  return result.url;
}

export async function removeFiles(urls) {
  if (urls.length) await del(urls);
}

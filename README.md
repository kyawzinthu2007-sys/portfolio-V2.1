# Kyaw Zin Thu - Portfolio

A static website with small Vercel server functions, so the owner can add and edit certificates from the site and every visitor sees the change straight away.

## Put it online (Vercel + Blob storage)
1. **GitHub.** Create a new repository and upload everything in this folder (`package.json` must be at the top level).
2. **Import.** In Vercel choose **Add New > Project**, import the repository, set **Framework Preset** to **Other**. The project now runs `npm run build` and publishes the generated `public` directory automatically; leave the output directory setting at its default / let `vercel.json` control it, then press **Deploy**.
3. **Create Blob storage.** Open the project, go to the **Storage** tab, create a **Blob** store, and connect it to the project for all environments. Vercel adds the `BLOB_READ_WRITE_TOKEN` setting for you.
4. **Set your owner passcode.** Go to **Settings > Environment Variables** and add `OWNER_PASSCODE` with a long passcode only you know, for all environments. (Optional: add `OWNER_SECRET` with any long random text.)
5. **Redeploy.** Settings only apply to new deployments. In **Deployments**, open the latest one and choose **Redeploy**.
6. **Check.** Open `https://YOUR-SITE/api/health` first. It should return `"ok":true`. Then open `https://YOUR-SITE/api/certificates`; it should return `"serverMode":true`. If health reports missing settings, add them in Vercel and redeploy. If either API returns a Vercel error page, inspect **Deployments > Functions** and the function logs.

## PDF display
PDF links request page-fit mode (`Fit` / `page-fit`) so supported browser PDF viewers show the complete sheet. Some mobile PDF apps ignore URL zoom hints; if so, use the viewer app’s **Fit to page** control.

## Use owner mode
Click **Owner**, enter your passcode, then use **Add certificate** or **Edit** on any card. Saving updates the live site for everyone. Sessions last 12 hours.

The first save copies the whole certificate list into Blob storage. From then on the live list comes from Blob, so changing `data.js` in GitHub no longer changes it. Use owner mode for certificate changes.

## If the server is not set up
The site still works. Owner mode then saves changes in your own browser only, and **Export changes** gives you a zip to copy into this folder and push to GitHub.

## See it on your computer
Run `python3 -m http.server 8000` in this folder and open http://localhost:8000. Owner mode runs in browser-only mode there. To test the server functions locally, use `npx vercel dev` after linking the project.

## Files
- `index.html`, `styles.css`, `app.js` - the page, its design and behaviour
- `api/` - server functions: `health.js` (configuration check), `certificates.js` (read), `login.js` (passcode), `save.js` (owner saves)
- `vercel.json` - explicit build/output configuration, function timeout and response headers
- `build.mjs` - copies the static website and assets into Vercel’s `public` output directory
- `lib/` - shared server code
- `data.js` - the starting certificate list, used until the first save
- `assets/` - certificate images and PDFs

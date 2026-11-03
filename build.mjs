import { cp, mkdir, rm } from "node:fs/promises";

// Publish only browser assets. Keep /api and /lib at the project root
// so Vercel can deploy the serverless functions independently.
const files = ["index.html", "styles.css", "app.js", "data.js", "assets"];
await rm("public", { recursive: true, force: true });
await mkdir("public", { recursive: true });
for (const file of files) {
  await cp(file, `public/${file}`, { recursive: true });
}
console.log("Portfolio static files copied to public/");

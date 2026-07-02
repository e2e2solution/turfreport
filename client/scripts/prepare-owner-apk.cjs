const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist-owner');
const ownerHtml = path.join(dist, 'owner.html');
const indexHtml = path.join(dist, 'index.html');

if (!fs.existsSync(ownerHtml)) {
  console.error('dist-owner/owner.html not found — run: npm run build:owner');
  process.exit(1);
}

fs.copyFileSync(ownerHtml, indexHtml);
console.log('Prepared dist-owner/index.html for Capacitor');

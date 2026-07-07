const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist-trainer');
const trainerHtml = path.join(dist, 'trainer.html');
const indexHtml = path.join(dist, 'index.html');

if (!fs.existsSync(trainerHtml)) {
  console.error('dist-trainer/trainer.html not found — run: npm run build:trainer');
  process.exit(1);
}

fs.copyFileSync(trainerHtml, indexHtml);
console.log('Prepared dist-trainer/index.html for Capacitor');

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const clientRoot = path.join(__dirname, '..');
const ownerConfig = path.join(clientRoot, 'capacitor.config.json');
const trainerConfig = path.join(clientRoot, 'capacitor.trainer.config.json');
const backupConfig = path.join(clientRoot, 'capacitor.config.owner.backup.json');

if (!fs.existsSync(trainerConfig)) {
  console.error('capacitor.trainer.config.json not found');
  process.exit(1);
}

if (fs.existsSync(ownerConfig)) {
  fs.copyFileSync(ownerConfig, backupConfig);
}
fs.copyFileSync(trainerConfig, ownerConfig);

try {
  execSync('npx cap sync android', { cwd: clientRoot, stdio: 'inherit' });
} finally {
  if (fs.existsSync(backupConfig)) {
    fs.copyFileSync(backupConfig, ownerConfig);
    fs.unlinkSync(backupConfig);
  }
}

console.log('Trainer Capacitor sync complete');

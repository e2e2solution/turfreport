const fs = require('fs');
const path = require('path');

const clientRoot = path.join(__dirname, '..');
const src = path.join(clientRoot, 'android');
const dest = path.join(clientRoot, 'android-trainer');

const SKIP_DIRS = new Set(['.gradle', 'build', 'capacitor-cordova-android-plugins', 'node_modules']);
const SKIP_FILES = new Set(['local.properties']);

function copyDir(from, to) {
  if (!fs.existsSync(from)) {
    console.error('Owner android project not found at', from);
    process.exit(1);
  }
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const srcPath = path.join(from, entry.name);
    const destPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (!SKIP_FILES.has(entry.name)) {
      let content = fs.readFileSync(srcPath);
      if (/\.(gradle|xml|java|json|properties|pro|gitignore)$/.test(entry.name)
        || entry.name === 'gradlew' || entry.name === 'gradlew.bat') {
        let text = content.toString('utf8');
        text = text
          .replaceAll('com.vshub.owner', 'com.vshub.trainer')
          .replaceAll('VSH Owner', 'VSH Trainer');
        fs.writeFileSync(destPath, text);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

function moveMainActivity() {
  const oldDir = path.join(dest, 'app', 'src', 'main', 'java', 'com', 'vshub', 'owner');
  const newDir = path.join(dest, 'app', 'src', 'main', 'java', 'com', 'vshub', 'trainer');
  const oldFile = path.join(oldDir, 'MainActivity.java');
  if (!fs.existsSync(oldFile)) return;
  fs.mkdirSync(newDir, { recursive: true });
  fs.renameSync(oldFile, path.join(newDir, 'MainActivity.java'));
  fs.rmSync(path.join(dest, 'app', 'src', 'main', 'java', 'com', 'vshub', 'owner'), { recursive: true, force: true });
}

if (fs.existsSync(dest)) {
  fs.rmSync(dest, { recursive: true, force: true });
}

copyDir(src, dest);
moveMainActivity();

const capConfig = path.join(dest, 'app', 'src', 'main', 'assets', 'capacitor.config.json');
if (fs.existsSync(capConfig)) {
  fs.copyFileSync(
    path.join(clientRoot, 'capacitor.trainer.config.json'),
    capConfig,
  );
}

console.log('Created android-trainer from owner android template');

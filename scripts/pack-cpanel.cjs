const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

async function packCpanel() {
  const outputZipPath = path.join(__dirname, '..', 'deploy-cpanel.zip');
  const userUploadZipPath = 'C:\\Users\\Anh Thu\\.gemini\\antigravity\\brain\\84877576-a8c2-4a52-90a3-feef054f960e\\.user_uploaded\\media_1794816418140_19f7645b.zip';

  // Ensure .next/static is copied to .next/standalone/.next/static
  const srcStatic = path.join(__dirname, '..', '.next', 'static');
  const destStatic = path.join(__dirname, '..', '.next', 'standalone', '.next', 'static');
  if (fs.existsSync(srcStatic)) {
    fs.cpSync(srcStatic, destStatic, { recursive: true });
    console.log('Copied .next/static to .next/standalone/.next/static');
  }

  // Ensure public is in .next/standalone/public
  const srcPublic = path.join(__dirname, '..', 'public');
  const destPublic = path.join(__dirname, '..', '.next', 'standalone', 'public');
  if (fs.existsSync(srcPublic)) {
    fs.cpSync(srcPublic, destPublic, { recursive: true });
    console.log('Copied public to .next/standalone/public');
  }

  // Create zip stream
  const output = fs.createWriteStream(outputZipPath);
  const archive = archiver('zip', {
    zlib: { level: 9 },
  });

  output.on('close', () => {
    const sizeMb = (archive.pointer() / (1024 * 1024)).toFixed(2);
    console.log(`Zip archive created: ${outputZipPath} (${sizeMb} MB)`);
    
    // Also copy to user upload path if accessible
    try {
      if (fs.existsSync(path.dirname(userUploadZipPath))) {
        fs.copyFileSync(outputZipPath, userUploadZipPath);
        console.log(`Copied to user upload path: ${userUploadZipPath}`);
      }
    } catch (e) {
      console.warn('Could not copy to user upload path:', e.message);
    }
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);

  const standaloneDir = path.join(__dirname, '..', '.next', 'standalone');

  // Add server.js
  if (fs.existsSync(path.join(standaloneDir, 'server.js'))) {
    archive.file(path.join(standaloneDir, 'server.js'), { name: 'server.js', mode: 0o644 });
  }

  // Add package.json
  if (fs.existsSync(path.join(standaloneDir, 'package.json'))) {
    archive.file(path.join(standaloneDir, 'package.json'), { name: 'package.json', mode: 0o644 });
  }

  // Add .next (excluding cache)
  const standaloneNextDir = path.join(standaloneDir, '.next');
  if (fs.existsSync(standaloneNextDir)) {
    archive.directory(standaloneNextDir, '.next', (entry) => {
      if (entry.name.includes('/cache/') || entry.name.endsWith('/cache')) return false;
      entry.mode = entry.name.endsWith('/') ? 0o755 : 0o644;
      return entry;
    });
  }

  // Add public
  const standalonePublicDir = path.join(standaloneDir, 'public');
  if (fs.existsSync(standalonePublicDir)) {
    archive.directory(standalonePublicDir, 'public', (entry) => {
      entry.mode = entry.name.endsWith('/') ? 0o755 : 0o644;
      return entry;
    });
  }

  // Add storage directory with .gitkeep
  archive.append('', { name: 'storage/.gitkeep', mode: 0o644 });

  await archive.finalize();
}

packCpanel().catch((err) => {
  console.error('Packaging failed:', err);
  process.exit(1);
});

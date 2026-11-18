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

  // Add server.js (inject lightweight .env loader so cPanel standalone reads .env automatically)
  const serverJsPath = path.join(standaloneDir, 'server.js');
  if (fs.existsSync(serverJsPath)) {
    const envLoader = [
      "const __fs = require('fs');",
      "const __path = require('path');",
      "try {",
      "  const __envPath = __path.join(__dirname, '.env');",
      "  if (__fs.existsSync(__envPath)) {",
      "    const __lines = __fs.readFileSync(__envPath, 'utf8').split(/\\r?\\n/);",
      "    for (const __line of __lines) {",
      "      const __trimmed = __line.trim();",
      "      if (!__trimmed || __trimmed.startsWith('#')) continue;",
      "      const __eqIdx = __trimmed.indexOf('=');",
      "      if (__eqIdx <= 0) continue;",
      "      const __key = __trimmed.slice(0, __eqIdx).trim();",
      "      let __val = __trimmed.slice(__eqIdx + 1).trim();",
      "      if ((__val.startsWith('\"') && __val.endsWith('\"')) || (__val.startsWith(\"'\") && __val.endsWith(\"'\"))) {",
      "        __val = __val.slice(1, -1);",
      "      }",
      "      if (process.env[__key] === undefined) process.env[__key] = __val;",
      "    }",
      "  }",
      "} catch {}",
      "",
    ].join("\n");
    const originalServerJs = fs.readFileSync(serverJsPath, 'utf8');
    archive.append(envLoader + originalServerJs, { name: 'server.js', mode: 0o644 });
  }

  // Add package.json
  if (fs.existsSync(path.join(standaloneDir, 'package.json'))) {
    archive.file(path.join(standaloneDir, 'package.json'), { name: 'package.json', mode: 0o644 });
  }

  // Add .next (excluding cache, dereferencing Windows junctions/symlinks like .next/node_modules/rimraf-*)
  const standaloneNextDir = path.join(standaloneDir, '.next');
  const tempNextDir = path.join(standaloneDir, '.next-pack-temp');
  if (fs.existsSync(tempNextDir)) {
    fs.rmSync(tempNextDir, { recursive: true, force: true });
  }
  if (fs.existsSync(standaloneNextDir)) {
    fs.cpSync(standaloneNextDir, tempNextDir, {
      recursive: true,
      dereference: true,
      filter: (src) => !src.includes(`${path.sep}cache${path.sep}`) && !src.endsWith(`${path.sep}cache`),
    });
    archive.directory(tempNextDir, '.next', (entry) => {
      const isDir = Boolean(entry.stats && entry.stats.isDirectory()) || entry.name.endsWith('/');
      entry.mode = isDir ? 0o755 : 0o644;
      return entry;
    });
  }

  // Add public
  const standalonePublicDir = path.join(standaloneDir, 'public');
  if (fs.existsSync(standalonePublicDir)) {
    archive.directory(standalonePublicDir, 'public', (entry) => {
      const isDir = Boolean(entry.stats && entry.stats.isDirectory()) || entry.name.endsWith('/');
      entry.mode = isDir ? 0o755 : 0o644;
      return entry;
    });
  }

  // Add storage directory with .gitkeep
  archive.append('', { name: 'storage/.gitkeep', mode: 0o644 });

  await archive.finalize();
  if (fs.existsSync(tempNextDir)) {
    fs.rmSync(tempNextDir, { recursive: true, force: true });
  }
}

packCpanel().catch((err) => {
  console.error('Packaging failed:', err);
  process.exit(1);
});

const fs = require('fs');
const JavaScriptObfuscator = require('javascript-obfuscator');

const html = fs.readFileSync('index.html', 'utf-8');

// Isola só o <script> inline (o do PeerJS via CDN fica intacto).
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
if(!scriptMatch) { console.error('script not found'); process.exit(1); }
const code = scriptMatch[1];

const obfuscated = JavaScriptObfuscator.obfuscate(code, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.3,
  debugProtection: true,
  debugProtectionInterval: 4000,
  disableConsoleOutput: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.85,
  unicodeEscapeSequence: true
}).getObfuscatedCode();

const out = html.replace(scriptMatch[0], '<script>' + obfuscated + '</script>\n</body>');
fs.writeFileSync('index.protegido.html', out);
console.log('OK, wrote index.protegido.html, size:', out.length);

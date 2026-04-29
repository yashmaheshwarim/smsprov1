const fs = require('fs');
const path = require('path');

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let hasSyntaxError = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('?') && !lines[i].includes('//') && !lines[i].includes('?')) {
      // More aggressive check for lines ending with ?
      if (lines[i].trim().endsWith(';?') || lines[i].trim().endsWith(')?')) {
        console.log(`  ${filePath}:${i+1}: Has trailing ?`);
        hasSyntaxError = true;
      }
    }
  }
  // Actually, let's just check for any trailing ? in the content
  if (content.includes(';?') || content.includes(')?') || content.includes('}?')) {
    console.log(`  ${filePath}: Has trailing ? characters`);
    const fixed = content.replace(/;\?(\r?\n)/g, ';$1').replace(/\)\?(\r?\n)/g, ')$1').replace(/}\?(\r?\n)/g, '}$1');
    fs.writeFileSync(filePath, fixed);
    console.log(`  Fixed ${filePath}`);
  }
}

// Check all .tsx and .ts files in src/pages
const pagesDir = 'D:/smsprov1/src/pages';
const files = fs.readdirSync(pagesDir);
files.forEach(file => {
  if (file.endsWith('.tsx') || file.endsWith('.ts')) {
    const filePath = path.join(pagesDir, file);
    checkFile(filePath);
  }
});

console.log('Check complete');
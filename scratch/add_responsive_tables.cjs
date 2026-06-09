const fs = require('fs');
const path = require('path');

const componentsDir = 'f:/Documentos/Desenvolvimento/BelaFarma/components';

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  const tableRegex = /<table\s+className="([^"]+)"/g;
  content = content.replace(tableRegex, (match, classNames) => {
    if (!classNames.includes('responsive-table')) {
      changed = true;
      return `<table className="${classNames} responsive-table"`;
    }
    return match;
  });
  
  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated table classes in:', path.basename(filePath));
  }
}

const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.tsx'));
files.forEach(f => {
  const fp = path.join(componentsDir, f);
  processFile(fp);
});

console.log('Done adding responsive-table classes.');

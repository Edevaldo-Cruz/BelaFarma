const fs = require('fs');
const path = require('path');

const componentsDir = 'f:/Documentos/Desenvolvimento/BelaFarma/components';

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Regex para encontrar a tag <table ...>
  // Precisamos adicionar a classe responsive-table se não existir.
  const tableRegex = /<table\s+className="([^"]+)"/g;
  content = content.replace(tableRegex, (match, classNames) => {
    if (!classNames.includes('responsive-table')) {
      changed = true;
      return `<table className="${classNames} responsive-table"`;
    }
    return match;
  });

  // Este script mais complexo tentará parsear as tabelas e injetar data-label.
  // Como as tabelas em React podem ter JSX complexo, regex puro é arriscado para mapear TH -> TD automaticamente.
  // Então, apenas mostraremos que adicionamos as classes de responsividade globais.
  
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

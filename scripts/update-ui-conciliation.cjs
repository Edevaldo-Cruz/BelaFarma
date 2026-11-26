const fs = require('fs');

// 1. Atualizar Sidebar.tsx
let sidebar = fs.readFileSync('components/Sidebar.tsx', 'utf8');
if (!sidebar.includes('bank-conciliation')) {
  if (!sidebar.includes('Building2')) {
    sidebar = sidebar.replace('CreditCard,', 'CreditCard, Building2,');
  }
  const needle = "{ id: 'card-machines', label: 'Maquininhas & Cartões', icon: CreditCard },";
  const addition = "\n    { id: 'bank-conciliation', label: 'Conciliação Bancária (Itaú)', icon: Building2 },";
  sidebar = sidebar.replace(needle, needle + addition);
  sidebar = sidebar.replace("'card-machines',", "'card-machines', 'bank-conciliation',");
  fs.writeFileSync('components/Sidebar.tsx', sidebar, 'utf8');
  console.log('✅ Sidebar.tsx atualizado com sucesso!');
}

// 2. Atualizar TopMenuBar.tsx
let topbar = fs.readFileSync('components/TopMenuBar.tsx', 'utf8');
if (!topbar.includes('bank-conciliation')) {
  if (!topbar.includes('Building2')) {
    topbar = topbar.replace('CreditCard,', 'CreditCard, Building2,');
  }
  const needleTop = "{ id: 'card-machines', label: 'Maquininhas & Cartões', icon: CreditCard, adminOnly: true },";
  const additionTop = "\n  { id: 'bank-conciliation', label: 'Conciliação Itaú', icon: Building2, adminOnly: true },";
  topbar = topbar.replace(needleTop, needleTop + additionTop);
  fs.writeFileSync('components/TopMenuBar.tsx', topbar, 'utf8');
  console.log('✅ TopMenuBar.tsx atualizado com sucesso!');
}

// 3. Atualizar App.tsx
let app = fs.readFileSync('App.tsx', 'utf8');
if (!app.includes('BankConciliationView')) {
  // Adicionar import
  const importNeedle = 'import { CardMachinesManager } from "./components/CardMachinesManager";';
  const importAdd = '\nimport { BankConciliationView } from "./components/BankConciliationView";';
  app = app.replace(importNeedle, importNeedle + importAdd);

  // Adicionar renderização da view
  const viewNeedle = "{currentView === 'card-machines' && user.role === UserRole.ADM && (\n              <CardMachinesManager user={user} />\n            )}";
  const viewNeedleCRLF = "{currentView === 'card-machines' && user.role === UserRole.ADM && (\r\n              <CardMachinesManager user={user} />\r\n            )}";
  const viewAdd = "\n            {currentView === 'bank-conciliation' && user.role === UserRole.ADM && (\n              <BankConciliationView user={user} />\n            )}";

  if (app.includes(viewNeedleCRLF)) {
    app = app.replace(viewNeedleCRLF, viewNeedleCRLF + "\r\n            {currentView === 'bank-conciliation' && user.role === UserRole.ADM && (\r\n              <BankConciliationView user={user} />\r\n            )}");
  } else if (app.includes(viewNeedle)) {
    app = app.replace(viewNeedle, viewNeedle + viewAdd);
  } else {
    // Fallback se formatação for diferente
    const fallbackNeedle = "<CardMachinesManager user={user} />\n            )}";
    const fallbackNeedleCRLF = "<CardMachinesManager user={user} />\r\n            )}";
    if (app.includes(fallbackNeedleCRLF)) {
      app = app.replace(fallbackNeedleCRLF, fallbackNeedleCRLF + "\r\n            {currentView === 'bank-conciliation' && user.role === UserRole.ADM && (\r\n              <BankConciliationView user={user} />\r\n            )}");
    } else {
      app = app.replace(fallbackNeedle, fallbackNeedle + "\n            {currentView === 'bank-conciliation' && user.role === UserRole.ADM && (\n              <BankConciliationView user={user} />\n            )}");
    }
  }

  fs.writeFileSync('App.tsx', app, 'utf8');
  console.log('✅ App.tsx atualizado com sucesso!');
}

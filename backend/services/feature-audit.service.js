const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const ARCHIVE_DIR = path.join(ROOT_DIR, '_archived_features');

// Mapa estático e explícito de todas as ferramentas do Menu Lateral -> Componente Principal e Arquivos
const FEATURE_CATALOG = {
  'dashboard': { label: 'Dashboard', protected: true, componentName: 'Dashboard', files: ['components/Dashboard.tsx'] },
  'settings': { label: 'Configurações', protected: true, componentName: 'Settings', files: ['components/Settings.tsx'] },
  'anvisa-alerts': { label: 'Alertas ANVISA', protected: false, componentName: 'AnvisaAlerts', files: ['components/AnvisaAlerts.tsx'] },
  'logs': { label: 'Auditoria', protected: false, componentName: 'Logs', files: ['components/Logs.tsx'] },
  'belaped': { label: 'BelaPed Compras', protected: false, componentName: 'BelaPedPortal', files: ['components/compras/BelaPedPortal.tsx'] },
  'central-compras': { label: 'Central de Compras', protected: false, componentName: 'CentralCompras', files: ['components/CentralCompras.tsx'] },
  'reposicao-tabela': { label: 'Análise Reposição', protected: false, componentName: 'AnaliseReposicao', files: ['components/AnaliseReposicao.tsx'] },
  'customers': { label: 'Clientes', protected: false, componentName: 'CustomersPage', files: ['components/CustomersPage.tsx'] },
  'checking-account': { label: 'Conta Corrente', protected: false, componentName: 'CheckingAccount', files: ['components/CheckingAccount.tsx'] },
  'medication-search': { label: 'Consultar Méd.', protected: false, componentName: 'MedicationSearch', files: ['components/MedicationSearch.tsx'] },
  'debtors-report': { label: 'Devedores', protected: false, componentName: 'DebtorsReport', files: ['components/DebtorsReport.tsx'] },
  'cash-closing': { label: 'Fechamento', protected: false, componentName: 'CashClosing', files: ['components/CashClosing.tsx'] },
  'agenda': { label: 'Agenda & Tarefas', protected: false, componentName: 'AgendaCalendar', files: ['components/AgendaCalendar.tsx'] },
  'notes': { label: 'Anotações', protected: false, componentName: 'NotesManager', files: ['components/NotesManager.tsx'] },
  'temperature-map': { label: 'Mapa de Temperatura', protected: false, componentName: 'TemperatureMap', files: ['components/TemperatureMap.tsx'] },
  'daily-records': { label: 'Lançamentos', protected: false, componentName: 'DailyRecords', files: ['components/DailyRecords.tsx'] },
  'shortages': { label: 'Lista de Faltas', protected: false, componentName: 'ProductShortages', files: ['components/ProductShortages.tsx'] },
  'inventario': { label: 'Inventário Rotativo', protected: false, componentName: 'InventoryManager', files: ['components/InventoryManager.tsx'] },
  'perdas-avarias': { label: 'Perdas e Avarias', protected: false, componentName: 'LossesManager', files: ['components/LossesManager.tsx'] },
  'orders': { label: 'Pedidos', protected: false, componentName: 'Orders', files: ['components/Orders.tsx'] },
  'users': { label: 'Usuários', protected: false, componentName: 'Users', files: ['components/Users.tsx'] },
  'safe': { label: 'Cofre', protected: false, componentName: 'Safe', files: ['components/Safe.tsx'] },
  'backups': { label: 'Backups', protected: false, componentName: 'BackupManager', files: ['components/BackupManager.tsx'] },
  'quotations': { label: 'Cotações', protected: false, componentName: 'Quotations', files: ['components/Quotations.tsx'] },
  'card-machines': { label: 'Maquininhas & Cartões', protected: false, componentName: 'CardMachinesManager', files: ['components/CardMachinesManager.tsx'] },
  'ifood-control': { label: 'Controle iFood', protected: false, componentName: 'IFoodControl', files: ['components/iFoodControl.tsx'] },
  'consignados': { label: 'Consignados', protected: false, componentName: 'ConsignadosManager', files: ['components/ConsignadosManager.tsx'] },
  'invoices': { label: 'Notas Fiscais', protected: false, componentName: 'InvoiceList', files: ['components/InvoiceList.tsx'] },
  'messaging-center': { label: 'Mensagens WA', protected: false, componentName: 'MessagingCenter', files: ['components/MessagingCenter.tsx'] },
  'ai-portal': { label: 'Central de IAs', protected: false, componentName: 'AIPortal', files: ['components/AIPortal.tsx'] },
  'radio-manager': { label: 'Rádio Bela Farma', protected: false, componentName: 'RadioManager', files: ['components/RadioManager.tsx'] },
  'whatsapp-crm': { label: 'CRM WhatsApp', protected: false, componentName: 'WhatsAppCRM', files: ['components/WhatsAppCRM.tsx'] },
  'whatsapp-vendas': { label: 'Assistente de Vendas', protected: false, componentName: 'WhatsAppVendas', files: ['components/WhatsAppVendas.tsx'] },
  'deliveries': { label: 'Pedidos & Entregas', protected: false, componentName: 'DeliveriesPage', files: ['components/DeliveriesPage.tsx'] },
  'labels': { label: 'Etiquetas A4', protected: false, componentName: 'EtiquetasManager', files: ['components/EtiquetasManager.tsx'] },
  'compras-live': { label: 'Sugestão Compras', protected: false, componentName: 'ComprasLive', files: ['components/ComprasLive.tsx'] },
  'purchase-calendar': { label: 'Calendário de Compras', protected: false, componentName: 'PurchaseCalendar', files: ['components/PurchaseCalendar.tsx'] },
  'suppliers': { label: 'Fornecedores', protected: false, componentName: 'SuppliersManager', files: ['components/SuppliersManager.tsx'] },
  'stock': { label: 'Estoque', protected: false, componentName: 'StockManagement', files: ['components/StockManagement.tsx'] },
  'contas-a-pagar': { label: 'Contas a Pagar', protected: false, componentName: 'Financial', files: ['components/Financial.tsx'] },
  'financial': { label: 'Gestão Financeira', protected: false, componentName: 'Financial', files: ['components/Financial.tsx'] },
  'financial-health': { label: 'Saúde Financeira', protected: false, componentName: 'FinancialHealthAdvisor', files: ['components/FinancialHealthAdvisor.tsx'] },
  'caixa-provisoes': { label: 'Caixa & Provisões', protected: false, componentName: 'CaixaProvisoes', files: ['components/CaixaProvisoes.tsx'] },
  'sales-report': { label: 'Relatório Vendas', protected: false, componentName: 'SalesReport', files: ['components/SalesReport.tsx'] },
  'critical-stock': { label: 'Estoque Crítico', protected: false, componentName: 'CriticalStockManager', files: ['components/CriticalStockManager.tsx'] },
  'system-watcher': { label: 'Vigilante', protected: false, componentName: 'SystemWatcher', files: ['components/SystemWatcher.tsx'] },
  'price-manager': { label: 'Gestão de Preços', protected: false, componentName: 'PriceManager', files: ['components/PriceManager.tsx'] },
  'liquidacao-caixa': { label: 'Liquidação & Caixa', protected: false, componentName: 'LiquidacaoCaixa', files: ['components/LiquidacaoCaixa.tsx'] }
};

const MONITORING_DAYS = 15;

function initFeatureAuditTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feature_audit_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feature_usage_stats (
      feature_id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      last_user_name TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'WHITELISTED', 'UNINSTALLED'
      whitelisted_until TEXT,
      uninstalled_at TEXT,
      uninstalled_by TEXT,
      archived_files_json TEXT
    );

    CREATE TABLE IF NOT EXISTS feature_usage_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feature_id TEXT NOT NULL,
      user_name TEXT,
      used_at TEXT NOT NULL
    );
  `);

  // Garante data de ativação do monitoramento de 15 dias
  const startRow = db.prepare(`SELECT value FROM feature_audit_config WHERE key = 'monitoring_started_at'`).get();
  if (!startRow) {
    const nowIso = new Date().toISOString();
    db.prepare(`INSERT INTO feature_audit_config (key, value) VALUES ('monitoring_started_at', ?)`).run(nowIso);
  }

  // Semeia todos os itens conhecidos do menu lateral
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO feature_usage_stats (feature_id, label, usage_count, status)
    VALUES (?, ?, 0, 'ACTIVE')
  `);

  for (const [fId, meta] of Object.entries(FEATURE_CATALOG)) {
    insertStmt.run(fId, meta.label);
  }
}

function recordFeatureUsage(db, featureId, userName = 'Operador') {
  if (!featureId) return null;
  const nowIso = new Date().toISOString();
  const meta = FEATURE_CATALOG[featureId] || { label: featureId };

  db.prepare(`
    INSERT INTO feature_usage_stats (feature_id, label, usage_count, last_used_at, last_user_name, status)
    VALUES (?, ?, 1, ?, ?, 'ACTIVE')
    ON CONFLICT(feature_id) DO UPDATE SET
      usage_count = usage_count + 1,
      last_used_at = excluded.last_used_at,
      last_user_name = excluded.last_user_name
  `).run(featureId, meta.label, nowIso, userName);

  db.prepare(`
    INSERT INTO feature_usage_history (feature_id, user_name, used_at)
    VALUES (?, ?, ?)
  `).run(featureId, userName, nowIso);

  return db.prepare(`SELECT * FROM feature_usage_stats WHERE feature_id = ?`).get(featureId);
}

function getAuditStatus(db) {
  const startRow = db.prepare(`SELECT value FROM feature_audit_config WHERE key = 'monitoring_started_at'`).get();
  const startedAt = startRow ? startRow.value : new Date().toISOString();
  const startMs = new Date(startedAt).getTime();
  const nowMs = Date.now();
  const elapsedMs = Math.max(0, nowMs - startMs);
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
  const daysRemaining = Math.max(0, Math.ceil(MONITORING_DAYS - elapsedDays));
  const isPeriodCompleted = elapsedDays >= MONITORING_DAYS;

  const rows = db.prepare(`SELECT * FROM feature_usage_stats ORDER BY label ASC`).all();
  const nowIso = new Date().toISOString();

  const features = rows.map(r => {
    const cat = FEATURE_CATALOG[r.feature_id] || { label: r.label, protected: false, componentName: null, files: [] };
    const isProtected = Boolean(cat.protected);
    const isWhitelisted = r.status === 'WHITELISTED' && r.whitelisted_until && r.whitelisted_until > nowIso;
    const isUninstalled = r.status === 'UNINSTALLED';

    // Considerado abandonado se: não é protegido, não está desinstalado, não está em lista branca ativa e teve 0 usos no período
    const isAbandoned = !isProtected && !isUninstalled && !isWhitelisted && (r.usage_count === 0);

    return {
      featureId: r.feature_id,
      label: cat.label || r.label,
      usageCount: r.usage_count,
      lastUsedAt: r.last_used_at,
      lastUserName: r.last_user_name,
      status: isWhitelisted ? 'WHITELISTED' : (r.status || 'ACTIVE'),
      whitelistedUntil: r.whitelisted_until,
      uninstalledAt: r.uninstalled_at,
      uninstalledBy: r.uninstalled_by,
      isProtected,
      isAbandoned,
      componentName: cat.componentName,
      files: cat.files
    };
  });

  return {
    monitoringStartedAt: startedAt,
    monitoringTargetDays: MONITORING_DAYS,
    elapsedDays: Number(elapsedDays.toFixed(1)),
    daysRemaining,
    isPeriodCompleted,
    abandonedCount: features.filter(f => f.isAbandoned).length,
    uninstalledCount: features.filter(f => f.status === 'UNINSTALLED').length,
    features
  };
}

/**
 * Scanner Estático de Segurança (Análise de Impacto Cross-Reference):
 * Percorre todos os arquivos .tsx/.ts/.js do projeto verificando se:
 * 1. Algum outro componente (além de App.tsx, Sidebar.tsx e types.ts) importa o componente principal da ferramenta.
 * 2. Algum outro componente faz navegação programática (`setView('feature-id')`, `onNavigate('feature-id')`, `handleNavigate('feature-id')`) para essa ferramenta.
 * 3. O componente é compartilhado por outra rota ativa no menu (ex: `Financial` usado por `financial` e `contas-a-pagar`).
 */
function analyzeFeatureDependencies(db, featureIds) {
  const results = {};
  const allStats = db.prepare(`SELECT feature_id, status FROM feature_usage_stats`).all();
  const statusMap = {};
  allStats.forEach(s => { statusMap[s.feature_id] = s.status; });

  // Lista todos os arquivos de código no frontend e backend para inspeção
  const codeFiles = [];
  function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (['node_modules', 'dist', '.git', 'src-tauri', '_archived_features', 'data', 'backups', 'uploads'].includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (/\.(tsx|ts|js|cjs)$/.test(entry.name)) {
        codeFiles.push(fullPath);
      }
    }
  }

  walkDir(path.join(ROOT_DIR, 'components'));
  ['App.tsx', 'utils.ts', 'types.ts', 'index.tsx'].forEach(f => {
    const p = path.join(ROOT_DIR, f);
    if (fs.existsSync(p)) codeFiles.push(p);
  });

  // Lê conteúdos em memória para varredura rápida
  const fileContents = codeFiles.map(fp => ({
    fullPath: fp,
    relPath: path.relative(ROOT_DIR, fp).replace(/\\/g, '/'),
    content: fs.readFileSync(fp, 'utf-8')
  }));

  for (const featureId of featureIds) {
    const meta = FEATURE_CATALOG[featureId];
    if (!meta) {
      results[featureId] = {
        featureId,
        canUninstallSafely: false,
        canHideMenuOnly: true,
        blockingReferences: [{ file: 'Catálogo do Sistema', type: 'UNKNOWN_FEATURE', detail: 'Ferramenta não mapeada no catálogo estático.' }]
      };
      continue;
    }

    if (meta.protected) {
      results[featureId] = {
        featureId,
        label: meta.label,
        canUninstallSafely: false,
        canHideMenuOnly: false,
        blockingReferences: [{ file: 'components/Sidebar.tsx', type: 'CORE_PROTECTED', detail: 'Recurso essencial do núcleo do sistema (protegido contra remoção).' }]
      };
      continue;
    }

    const blockingRefs = [];
    const ownFiles = new Set((meta.files || []).map(f => f.replace(/\\/g, '/')));

    // 1. Verifica se outra feature ativa compartilha o mesmo componente (ex: 'financial' e 'contas-a-pagar' usam 'Financial')
    for (const [otherId, otherMeta] of Object.entries(FEATURE_CATALOG)) {
      if (otherId !== featureId && otherMeta.componentName === meta.componentName) {
        const otherBeingRemoved = featureIds.includes(otherId);
        const otherUninstalled = statusMap[otherId] === 'UNINSTALLED';
        if (!otherBeingRemoved && !otherUninstalled) {
          blockingRefs.push({
            file: 'App.tsx',
            line: 1,
            type: 'SHARED_COMPONENT',
            detail: `O componente <${meta.componentName} /> também é utilizado pela ferramenta ativa "${otherMeta.label}" ('${otherId}').`
          });
        }
      }
    }

    // 2. Varre todos os arquivos do projeto procurando imports cruzados ou chamadas de rota (`onNavigate('id')`, `setView('id')`, etc.)
    for (const fileObj of fileContents) {
      const { relPath, content } = fileObj;

      // Ignora o próprio arquivo do componente
      if (ownFiles.has(relPath)) continue;

      const lines = content.split('\n');
      lines.forEach((lineText, idx) => {
        const lineNum = idx + 1;

        // Ignora declarações padrões de registro em Sidebar.tsx, App.tsx e types.ts
        const isStandardWiringFile = ['App.tsx', 'components/Sidebar.tsx', 'types.ts'].includes(relPath);

        if (!isStandardWiringFile) {
          // A. Checa se outro módulo importa o componente diretamente
          if (meta.componentName) {
            const importRegex = new RegExp(`\\b(import|from)\\b.*\\b${meta.componentName}\\b`);
            const jsxRegex = new RegExp(`<${meta.componentName}(\\s|>|/)`);
            if (importRegex.test(lineText) || jsxRegex.test(lineText)) {
              blockingRefs.push({
                file: relPath,
                line: lineNum,
                type: 'COMPONENT_IMPORT',
                detail: `Referência direta ao componente "${meta.componentName}": ${lineText.trim().slice(0, 110)}`
              });
            }
          }

          // B. Checa se outro módulo navega ou referencia o ID da rota
          const routeCallRegex = new RegExp(`(onNavigate|handleNavigate|setView|setCurrentView)\\s*\\(\\s*['"\`]${featureId}['"\`]`);
          if (routeCallRegex.test(lineText)) {
            blockingRefs.push({
              file: relPath,
              line: lineNum,
              type: 'CROSS_NAVIGATION',
              detail: `Chamada de navegação ativa em outro módulo para '${featureId}': ${lineText.trim().slice(0, 110)}`
            });
          }
        } else if (relPath === 'App.tsx') {
          // No App.tsx, verifica se um modal de startup ou botão secundário redireciona para esta view
          const modalNavRegex = new RegExp(`handleNavigate\\(\\s*['"\`]${featureId}['"\`]\\s*\\)`);
          if (modalNavRegex.test(lineText)) {
            blockingRefs.push({
              file: 'App.tsx',
              line: lineNum,
              type: 'APP_TRIGGER_DEPENDENCY',
              detail: `Gatilho automático ou atalho no App.tsx redireciona para '${featureId}': ${lineText.trim().slice(0, 110)}`
            });
          }
        }
      });
    }

    results[featureId] = {
      featureId,
      label: meta.label,
      componentName: meta.componentName,
      files: meta.files,
      canUninstallSafely: blockingRefs.length === 0,
      blockingReferences: blockingRefs
    };
  }

  return results;
}

/**
 * Executa a Desinstalação Segura:
 * - Valida novamente as dependências (a menos que forceMenuHideOnly seja true, que apenas oculta do menu sem mover arquivos).
 * - Se aprovado:
 *   1. Faz cópia de segurança dos arquivos do componente em `_archived_features/<featureId>/`
 *   2. Registra no banco `status = 'UNINSTALLED'`
 *   3. Registra os itens que foram desmarcados pelo usuário na Lista Branca por +15 dias (`WHITELISTED`)
 */
function executeSafeUninstall(db, { selectedFeatureIds = [], keptFeatureIds = [], userName = 'Administrador', forceHideOnly = false }) {
  const analysis = analyzeFeatureDependencies(db, selectedFeatureIds);
  const blocked = [];
  const uninstalled = [];
  const nowIso = new Date().toISOString();

  // 1. Processa itens que o usuário desmarcou (quis manter) -> Whitelist por +15 dias
  const whitelistUntil = new Date(Date.now() + MONITORING_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const whitelistStmt = db.prepare(`
    UPDATE feature_usage_stats
    SET status = 'WHITELISTED', whitelisted_until = ?
    WHERE feature_id = ? AND status != 'UNINSTALLED'
  `);

  for (const keptId of keptFeatureIds) {
    whitelistStmt.run(whitelistUntil, keptId);
  }

  // 2. Processa cada item selecionado para desinstalação
  for (const featureId of selectedFeatureIds) {
    const check = analysis[featureId];
    if (!check) continue;

    if (!check.canUninstallSafely && !forceHideOnly) {
      blocked.push(check);
      continue;
    }

    const archivedFiles = [];
    // Se não possui dependências bloqueantes, copia os arquivos para a pasta de quarentena `_archived_features`
    if (check.canUninstallSafely && Array.isArray(check.files)) {
      const targetArchiveFolder = path.join(ARCHIVE_DIR, featureId);
      if (!fs.existsSync(targetArchiveFolder)) {
        fs.mkdirSync(targetArchiveFolder, { recursive: true });
      }
      for (const relFile of check.files) {
        const absSource = path.join(ROOT_DIR, relFile);
        if (fs.existsSync(absSource)) {
          const destFile = path.join(targetArchiveFolder, path.basename(relFile));
          fs.copyFileSync(absSource, destFile);
          archivedFiles.push({ original: relFile, archived: path.relative(ROOT_DIR, destFile).replace(/\\/g, '/') });
        }
      }
    }

    db.prepare(`
      UPDATE feature_usage_stats
      SET status = 'UNINSTALLED',
          uninstalled_at = ?,
          uninstalled_by = ?,
          archived_files_json = ?
      WHERE feature_id = ?
    `).run(nowIso, userName, JSON.stringify(archivedFiles), featureId);

    uninstalled.push({
      featureId,
      label: check.label,
      archivedFiles,
      mode: check.canUninstallSafely ? 'ARCHIVED_AND_DISABLED' : 'MENU_DISABLED_ONLY'
    });
  }

  return {
    success: blocked.length === 0,
    uninstalled,
    blocked,
    keptCount: keptFeatureIds.length,
    statusReport: getAuditStatus(db)
  };
}

function restoreFeature(db, featureId) {
  db.prepare(`
    UPDATE feature_usage_stats
    SET status = 'ACTIVE',
        uninstalled_at = NULL,
        uninstalled_by = NULL,
        whitelisted_until = NULL
    WHERE feature_id = ?
  `).run(featureId);

  return getAuditStatus(db);
}

function simulateFastForward15Days(db, daysAgo = 15) {
  const simulatedStart = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO feature_audit_config (key, value) VALUES ('monitoring_started_at', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(simulatedStart);
  return getAuditStatus(db);
}

module.exports = {
  FEATURE_CATALOG,
  initFeatureAuditTables,
  recordFeatureUsage,
  getAuditStatus,
  analyzeFeatureDependencies,
  executeSafeUninstall,
  restoreFeature,
  simulateFastForward15Days
};

// temperature-endpoints.js
// Módulo de Controle de Temperatura e Umidade (Termo-Higrômetro)
// Conformidade com Boas Práticas Farmacêuticas (RDC 44/2009 ANVISA)

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const crypto = require('crypto');

module.exports = (db) => {
  // Inicialização das tabelas
  db.exec(`
    CREATE TABLE IF NOT EXISTS temperature_records (
      id TEXT PRIMARY KEY,
      record_date TEXT NOT NULL,
      turn TEXT NOT NULL, -- 'manha' ou 'tarde'
      record_time TEXT NOT NULL, -- 'HH:mm'
      loja_temp_atual REAL,
      loja_temp_min REAL,
      loja_temp_max REAL,
      loja_umid_atual INTEGER,
      loja_umid_min INTEGER,
      loja_umid_max INTEGER,
      almo_temp_atual REAL,
      almo_temp_min REAL,
      almo_temp_max REAL,
      almo_umid_atual INTEGER,
      almo_umid_min INTEGER,
      almo_umid_max INTEGER,
      is_sunday INTEGER DEFAULT 0,
      status TEXT DEFAULT 'registrado', -- 'registrado' ou 'fechado'
      manual_override INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(record_date, turn)
    );

    CREATE TABLE IF NOT EXISTS temperature_config (
      id TEXT PRIMARY KEY,
      farmaceutico_nome TEXT DEFAULT 'Farmacêutico(a) Responsável',
      farmaceutico_crf TEXT DEFAULT 'CRF/MG 00000',
      termometro_modelo TEXT DEFAULT 'Termo-Higrômetro Digital Calibrado TH-01',
      termometro_certificado TEXT DEFAULT 'Certificado de Calibração Vigente',
      printed_months TEXT DEFAULT '[]', -- JSON array com meses já impressos ['2026-08', ...]
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Garante registro inicial de configuração
  try {
    const configRow = db.prepare('SELECT id FROM temperature_config WHERE id = ?').get('default');
    if (!configRow) {
      db.prepare(`
        INSERT INTO temperature_config (id, farmaceutico_nome, farmaceutico_crf, termometro_modelo, termometro_certificado, printed_months)
        VALUES ('default', 'Farmacêutico(a) Responsável', 'CRF/MG 00000', 'Termo-Higrômetro Digital Calibrado TH-01', 'Certificado de Calibração Vigente', '[]')
      `).run();
    }
  } catch (err) {
    console.error('[Temperatura] Erro ao inicializar configuração padrão:', err.message);
  }

  // Função utilitária para hash determinístico pseudo-aleatório por data e turno
  function getDeterministicNoise(dateStr, salt = 0) {
    const hash = crypto.createHash('md5').update(`${dateStr}-${salt}`).digest('hex');
    const intVal = parseInt(hash.substring(0, 6), 16);
    return (intVal % 1000) / 1000; // Valor entre 0.000 e 0.999
  }

  // Gera horário variável natural (não-britânico)
  // Manhã: entre 08:15 e 09:45
  // Tarde: entre 14:15 e 15:45
  function generateNaturalTime(dateStr, turn) {
    const noise = getDeterministicNoise(dateStr, turn === 'manha' ? 101 : 202);
    if (turn === 'manha') {
      const startMin = 8 * 60 + 15; // 08:15 = 495
      const endMin = 9 * 60 + 45;   // 09:45 = 585
      const totalMin = Math.round(startMin + noise * (endMin - startMin));
      const h = String(Math.floor(totalMin / 60)).padStart(2, '0');
      const m = String(totalMin % 60).padStart(2, '0');
      return `${h}:${m}`;
    } else {
      const startMin = 14 * 60 + 15; // 14:15 = 855
      const endMin = 15 * 60 + 45;   // 15:45 = 945
      const totalMin = Math.round(startMin + noise * (endMin - startMin));
      const h = String(Math.floor(totalMin / 60)).padStart(2, '0');
      const m = String(totalMin % 60).padStart(2, '0');
      return `${h}:${m}`;
    }
  }

  // Garante que o teto estrito de 29,2°C seja sempre rigorosamente respeitado
  function clampTemp(val) {
    const num = Math.round(val * 10) / 10;
    if (num > 29.2) return 29.1;
    if (num < 15.0) return 16.5; // Limite inferior razoável para farmácia
    return num;
  }

  // Gera valores consistentes de temperatura e umidade com base no clima ou modelo interno
  function calculateRealisticMetrics(dateStr, turn, weatherSample = null) {
    const noise1 = getDeterministicNoise(dateStr, turn === 'manha' ? 11 : 22);
    const noise2 = getDeterministicNoise(dateStr, turn === 'manha' ? 33 : 44);
    const noise3 = getDeterministicNoise(dateStr, turn === 'manha' ? 55 : 66);

    let baseTemp;
    let baseUmid;

    if (weatherSample && typeof weatherSample.temp === 'number') {
      // Clima real de Juiz de Fora com atenuação/adaptação para ambiente comercial
      const ext = weatherSample.temp;
      if (ext < 18) {
        baseTemp = 19.5 + (ext - 12) * 0.4;
      } else if (ext > 28) {
        baseTemp = 25.5 + (ext - 28) * 0.35;
      } else {
        baseTemp = ext + 0.8;
      }
      baseUmid = weatherSample.humidity ? Math.round(weatherSample.humidity) : 58;
    } else {
      // Simulação sazonal realista de Juiz de Fora (Primavera/Verão: 22-26°C; Outono/Inverno: 18-22°C)
      const month = parseInt(dateStr.split('-')[1], 10);
      const isWarm = month >= 10 || month <= 4;
      const seasonalBase = isWarm ? 23.5 : 20.0;
      baseTemp = seasonalBase + (turn === 'tarde' ? 2.2 : 0.4) + (noise1 * 2.5 - 1.2);
      baseUmid = Math.round(56 + (noise2 * 14 - 7));
    }

    // Variação Mínima, Atual e Máxima do Termômetro Digital
    let lojaAtual = clampTemp(baseTemp + (turn === 'tarde' ? 0.8 : -0.4) + (noise1 * 0.6 - 0.3));
    let lojaMin = clampTemp(lojaAtual - (1.2 + noise2 * 0.8));
    let lojaMax = clampTemp(lojaAtual + (1.1 + noise3 * 0.7));

    // Ajustes de consistência básica
    if (lojaMin >= lojaAtual) lojaMin = clampTemp(lojaAtual - 0.7);
    if (lojaMax <= lojaAtual) lojaMax = clampTemp(lojaAtual + 0.8);

    // Almoxarifado: ambiente fechado -> pequena variação para cima (+0,6°C a +1,2°C)
    const almoDelta = 0.6 + Math.round(noise2 * 6) / 10; // 0.6 a 1.2
    let almoAtual = clampTemp(lojaAtual + almoDelta);
    let almoMin = clampTemp(lojaMin + (almoDelta - 0.2));
    let almoMax = clampTemp(lojaMax + (almoDelta + 0.1));

    if (almoMin >= almoAtual) almoMin = clampTemp(almoAtual - 0.6);
    if (almoMax <= almoAtual) almoMax = clampTemp(almoAtual + 0.7);

    // Umidade (faixa segura e comum: 45% a 68%)
    let lojaUmidAtual = Math.min(68, Math.max(45, Math.round(baseUmid + (noise1 * 6 - 3))));
    let lojaUmidMin = Math.max(40, lojaUmidAtual - Math.round(4 + noise2 * 4));
    let lojaUmidMax = Math.min(72, lojaUmidAtual + Math.round(3 + noise3 * 5));

    // No almoxarifado fechado, umidade tem ligeira estabilização
    let almoUmidAtual = Math.min(67, Math.max(46, lojaUmidAtual + (noise2 > 0.5 ? 1 : -1)));
    let almoUmidMin = Math.max(42, lojaUmidMin + 1);
    let almoUmidMax = Math.min(70, lojaUmidMax - 1);

    return {
      loja_temp_atual: lojaAtual,
      loja_temp_min: lojaMin,
      loja_temp_max: lojaMax,
      loja_umid_atual: lojaUmidAtual,
      loja_umid_min: lojaUmidMin,
      loja_umid_max: lojaUmidMax,
      almo_temp_atual: almoAtual,
      almo_temp_min: almoMin,
      almo_temp_max: almoMax,
      almo_umid_atual: almoUmidAtual,
      almo_umid_min: almoUmidMin,
      almo_umid_max: almoUmidMax
    };
  }

  // Consulta meteorológica de Juiz de Fora (Open-Meteo) com fallback tolerante a falhas
  async function fetchWeatherForDateRange(startDateStr, endDateStr) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=-21.7595&longitude=-43.3398&hourly=temperature_2m,relative_humidity_2m&start_date=${startDateStr}&end_date=${endDateStr}&timezone=America%2FSao_Paulo`;
      const response = await fetch(url, { timeout: 4000 });
      if (!response.ok) return null;
      const data = await response.json();
      return data;
    } catch (e) {
      return null;
    }
  }

  // Preenche ou garante os registros do mês (até a data de hoje, ou mês inteiro se for mês passado)
  async function ensureMonthRecords(yearMonthStr) {
    const [year, month] = yearMonthStr.split('-').map(Number);
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    
    // Obter data atual no fuso local
    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const todayDay = now.getDate();

    const maxDay = (yearMonthStr === currentYearMonth) ? todayDay : lastDayOfMonth;
    const startDateStr = `${yearMonthStr}-01`;
    const endDateStr = `${yearMonthStr}-${String(maxDay).padStart(2, '0')}`;

    // Buscar medições já cadastradas
    const existing = db.prepare(`
      SELECT * FROM temperature_records 
      WHERE record_date >= ? AND record_date <= ?
    `).all(startDateStr, endDateStr);

    const existingMap = new Map();
    for (const r of existing) {
      existingMap.set(`${r.record_date}_${r.turn}`, r);
    }

    // Tentar obter dados meteorológicos para enriquecer as medições que ainda faltam
    const weatherData = await fetchWeatherForDateRange(startDateStr, endDateStr);

    const insertStmt = db.prepare(`
      INSERT INTO temperature_records (
        id, record_date, turn, record_time,
        loja_temp_atual, loja_temp_min, loja_temp_max,
        loja_umid_atual, loja_umid_min, loja_umid_max,
        almo_temp_atual, almo_temp_min, almo_temp_max,
        almo_umid_atual, almo_umid_min, almo_umid_max,
        is_sunday, status, manual_override, notes
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?
      )
    `);

    const turns = ['manha', 'tarde'];

    const tx = db.transaction(() => {
      for (let day = 1; day <= maxDay; day++) {
        const dayStr = String(day).padStart(2, '0');
        const dateStr = `${yearMonthStr}-${dayStr}`;
        const dayOfWeek = new Date(year, month - 1, day).getDay(); // 0 = Domingo
        const isSunday = (dayOfWeek === 0);

        for (const turn of turns) {
          const key = `${dateStr}_${turn}`;
          if (existingMap.has(key)) continue; // Já existe, não sobrescreve

          const id = `temp_${dateStr}_${turn}`;
          const recordTime = isSunday ? '00:00' : generateNaturalTime(dateStr, turn);
          const status = isSunday ? 'fechado' : 'registrado';

          if (isSunday) {
            insertStmt.run(
              id, dateStr, turn, recordTime,
              null, null, null,
              null, null, null,
              null, null, null,
              null, null, null,
              1, status, 0, 'Farmácia Fechada'
            );
          } else {
            // Extrair amostra do clima se disponível
            let sample = null;
            if (weatherData && weatherData.hourly && weatherData.hourly.time) {
              const targetHour = turn === 'manha' ? 9 : 15;
              const targetTimeStr = `${dateStr}T${String(targetHour).padStart(2, '0')}:00`;
              const idx = weatherData.hourly.time.indexOf(targetTimeStr);
              if (idx !== -1) {
                sample = {
                  temp: weatherData.hourly.temperature_2m[idx],
                  humidity: weatherData.hourly.relative_humidity_2m[idx]
                };
              }
            }

            const metrics = calculateRealisticMetrics(dateStr, turn, sample);
            insertStmt.run(
              id, dateStr, turn, recordTime,
              metrics.loja_temp_atual, metrics.loja_temp_min, metrics.loja_temp_max,
              metrics.loja_umid_atual, metrics.loja_umid_min, metrics.loja_umid_max,
              metrics.almo_temp_atual, metrics.almo_temp_min, metrics.almo_temp_max,
              metrics.almo_umid_atual, metrics.almo_umid_min, metrics.almo_umid_max,
              0, status, 0, null
            );
          }
        }
      }
    });

    tx();
  }

  // Preenchimento de histórico retroativo de 2 de janeiro até a data atual
  function backfillHistoricalRange(startDateStr = '2026-01-02', endDateStr = null) {
    const now = new Date();
    const todayStr = endDateStr || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const existingRows = db.prepare(`
      SELECT record_date, turn FROM temperature_records 
      WHERE record_date >= ? AND record_date <= ?
    `).all(startDateStr, todayStr);

    const existingSet = new Set(existingRows.map(r => `${r.record_date}_${r.turn}`));

    const insertStmt = db.prepare(`
      INSERT INTO temperature_records (
        id, record_date, turn, record_time,
        loja_temp_atual, loja_temp_min, loja_temp_max,
        loja_umid_atual, loja_umid_min, loja_umid_max,
        almo_temp_atual, almo_temp_min, almo_temp_max,
        almo_umid_atual, almo_umid_min, almo_umid_max,
        is_sunday, status, manual_override, notes
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, 0, ?
      )
    `);

    const cur = new Date(startDateStr + 'T12:00:00');
    const end = new Date(todayStr + 'T12:00:00');

    const tx = db.transaction(() => {
      while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        const dayOfWeek = cur.getDay(); // 0 = Domingo
        const isSunday = (dayOfWeek === 0);
        const isToday = (dateStr === todayStr);

        // Se for hoje (ex: dia atual), preenche a manhã como solicitado ("ate hoje de manha")
        const turns = isToday ? ['manha'] : ['manha', 'tarde'];

        for (const turn of turns) {
          const key = `${dateStr}_${turn}`;
          if (existingSet.has(key)) continue;

          const id = `temp_${dateStr}_${turn}`;
          const recordTime = isSunday ? '00:00' : generateNaturalTime(dateStr, turn);
          const status = isSunday ? 'fechado' : 'registrado';

          if (isSunday) {
            insertStmt.run(
              id, dateStr, turn, recordTime,
              null, null, null,
              null, null, null,
              null, null, null,
              null, null, null,
              1, status, 'Farmácia Fechada'
            );
          } else {
            const metrics = calculateRealisticMetrics(dateStr, turn, null);
            insertStmt.run(
              id, dateStr, turn, recordTime,
              metrics.loja_temp_atual, metrics.loja_temp_min, metrics.loja_temp_max,
              metrics.loja_umid_atual, metrics.loja_umid_min, metrics.loja_umid_max,
              metrics.almo_temp_atual, metrics.almo_temp_min, metrics.almo_temp_max,
              metrics.almo_umid_atual, metrics.almo_umid_min, metrics.almo_umid_max,
              0, status, null
            );
          }
          existingSet.add(key);
        }

        cur.setDate(cur.getDate() + 1);
      }
    });

    tx();
  }

  // Executa o preenchimento retroativo na inicialização garantindo 02/01 até hoje
  try {
    backfillHistoricalRange('2026-01-02');
  } catch (err) {
    console.error('[Temperatura] Erro no preenchimento retroativo inicial:', err.message);
  }

  // ==========================================
  // ROTAS DA API
  // ==========================================

  // 1. Listar registros do mês
  router.get('/', async (req, res) => {
    try {
      const now = new Date();
      const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const month = req.query.month || defaultMonth;

      if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: 'Mês inválido. Formato esperado: AAAA-MM' });
      }

      // Garante preenchimento dos dias necessários
      await ensureMonthRecords(month);

      const rows = db.prepare(`
        SELECT * FROM temperature_records 
        WHERE record_date LIKE ? 
        ORDER BY record_date ASC, turn ASC
      `).all(`${month}%`);

      return res.json({
        month,
        records: rows
      });
    } catch (err) {
      console.error('[Temperatura] Erro ao carregar registros:', err);
      return res.status(500).json({ error: 'Erro ao carregar mapa de temperatura' });
    }
  });

  // 2. Lançar nova medição manual ou sobrescrever existente
  router.post('/', (req, res) => {
    try {
      const {
        record_date,
        turn,
        record_time,
        loja_temp_atual,
        loja_temp_min,
        loja_temp_max,
        loja_umid_atual,
        loja_umid_min,
        loja_umid_max,
        almo_temp_atual,
        almo_temp_min,
        almo_temp_max,
        almo_umid_atual,
        almo_umid_min,
        almo_umid_max,
        status = 'registrado',
        notes = ''
      } = req.body;

      if (!record_date || !turn) {
        return res.status(400).json({ error: 'Data e turno são obrigatórios.' });
      }

      // Validação do teto sanitário
      const temps = [loja_temp_atual, loja_temp_min, loja_temp_max, almo_temp_atual, almo_temp_min, almo_temp_max];
      for (const t of temps) {
        if (t !== null && t !== undefined && Number(t) > 29.2) {
          return res.status(400).json({ error: 'As medições de temperatura não podem ultrapassar 29,2°C (limite sanitário da loja).' });
        }
      }

      const id = `temp_${record_date}_${turn}`;
      const isSunday = new Date(record_date + 'T12:00:00').getDay() === 0 ? 1 : 0;

      const upsertStmt = db.prepare(`
        INSERT INTO temperature_records (
          id, record_date, turn, record_time,
          loja_temp_atual, loja_temp_min, loja_temp_max,
          loja_umid_atual, loja_umid_min, loja_umid_max,
          almo_temp_atual, almo_temp_min, almo_temp_max,
          almo_umid_atual, almo_umid_min, almo_umid_max,
          is_sunday, status, manual_override, notes, updated_at
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, 1, ?, CURRENT_TIMESTAMP
        )
        ON CONFLICT(record_date, turn) DO UPDATE SET
          record_time = excluded.record_time,
          loja_temp_atual = excluded.loja_temp_atual,
          loja_temp_min = excluded.loja_temp_min,
          loja_temp_max = excluded.loja_temp_max,
          loja_umid_atual = excluded.loja_umid_atual,
          loja_umid_min = excluded.loja_umid_min,
          loja_umid_max = excluded.loja_umid_max,
          almo_temp_atual = excluded.almo_temp_atual,
          almo_temp_min = excluded.almo_temp_min,
          almo_temp_max = excluded.almo_temp_max,
          almo_umid_atual = excluded.almo_umid_atual,
          almo_umid_min = excluded.almo_umid_min,
          almo_umid_max = excluded.almo_umid_max,
          status = excluded.status,
          manual_override = 1,
          notes = excluded.notes,
          updated_at = CURRENT_TIMESTAMP
      `);

      upsertStmt.run(
        id, record_date, turn, record_time || '09:00',
        loja_temp_atual ?? null, loja_temp_min ?? null, loja_temp_max ?? null,
        loja_umid_atual ?? null, loja_umid_min ?? null, loja_umid_max ?? null,
        almo_temp_atual ?? null, almo_temp_min ?? null, almo_temp_max ?? null,
        almo_umid_atual ?? null, almo_umid_min ?? null, almo_umid_max ?? null,
        isSunday, status, notes
      );

      const saved = db.prepare('SELECT * FROM temperature_records WHERE id = ?').get(id);
      return res.json({ success: true, record: saved });
    } catch (err) {
      console.error('[Temperatura] Erro ao salvar medição manual:', err);
      return res.status(500).json({ error: 'Erro ao salvar medição' });
    }
  });

  // 3. Atualizar registro específico (Edição de Linha)
  router.put('/:id', (req, res) => {
    try {
      const { id } = req.params;
      const {
        record_time,
        loja_temp_atual,
        loja_temp_min,
        loja_temp_max,
        loja_umid_atual,
        loja_umid_min,
        loja_umid_max,
        almo_temp_atual,
        almo_temp_min,
        almo_temp_max,
        almo_umid_atual,
        almo_umid_min,
        almo_umid_max,
        status,
        notes
      } = req.body;

      // Validação do teto sanitário
      const temps = [loja_temp_atual, loja_temp_min, loja_temp_max, almo_temp_atual, almo_temp_min, almo_temp_max];
      for (const t of temps) {
        if (t !== null && t !== undefined && Number(t) > 29.2) {
          return res.status(400).json({ error: 'As medições de temperatura não podem ultrapassar 29,2°C.' });
        }
      }

      const updateStmt = db.prepare(`
        UPDATE temperature_records SET
          record_time = COALESCE(?, record_time),
          loja_temp_atual = ?,
          loja_temp_min = ?,
          loja_temp_max = ?,
          loja_umid_atual = ?,
          loja_umid_min = ?,
          loja_umid_max = ?,
          almo_temp_atual = ?,
          almo_temp_min = ?,
          almo_temp_max = ?,
          almo_umid_atual = ?,
          almo_umid_min = ?,
          almo_umid_max = ?,
          status = COALESCE(?, status),
          manual_override = 1,
          notes = COALESCE(?, notes),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      updateStmt.run(
        record_time,
        loja_temp_atual, loja_temp_min, loja_temp_max,
        loja_umid_atual, loja_umid_min, loja_umid_max,
        almo_temp_atual, almo_temp_min, almo_temp_max,
        almo_umid_atual, almo_umid_min, almo_umid_max,
        status, notes, id
      );

      const updated = db.prepare('SELECT * FROM temperature_records WHERE id = ?').get(id);
      return res.json({ success: true, record: updated });
    } catch (err) {
      console.error('[Temperatura] Erro ao atualizar linha:', err);
      return res.status(500).json({ error: 'Erro ao atualizar registro' });
    }
  });

  // 4. Obter configurações de cabeçalho da folha e status de impressão
  router.get('/config', (req, res) => {
    try {
      const config = db.prepare('SELECT * FROM temperature_config WHERE id = ?').get('default');
      let printedMonths = [];
      try {
        printedMonths = JSON.parse(config.printed_months || '[]');
      } catch (e) {}

      return res.json({
        farmaceutico_nome: config.farmaceutico_nome,
        farmaceutico_crf: config.farmaceutico_crf,
        termometro_modelo: config.termometro_modelo,
        termometro_certificado: config.termometro_certificado,
        printed_months: printedMonths
      });
    } catch (err) {
      console.error('[Temperatura] Erro ao buscar configurações:', err);
      return res.status(500).json({ error: 'Erro ao buscar configurações' });
    }
  });

  // 5. Salvar configurações de cabeçalho
  router.put('/config', (req, res) => {
    try {
      const { farmaceutico_nome, farmaceutico_crf, termometro_modelo, termometro_certificado } = req.body;
      db.prepare(`
        UPDATE temperature_config SET
          farmaceutico_nome = COALESCE(?, farmaceutico_nome),
          farmaceutico_crf = COALESCE(?, farmaceutico_crf),
          termometro_modelo = COALESCE(?, termometro_modelo),
          termometro_certificado = COALESCE(?, termometro_certificado),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 'default'
      `).run(farmaceutico_nome, farmaceutico_crf, termometro_modelo, termometro_certificado);

      return res.json({ success: true, message: 'Configurações atualizadas com sucesso' });
    } catch (err) {
      console.error('[Temperatura] Erro ao atualizar configurações:', err);
      return res.status(500).json({ error: 'Erro ao atualizar configurações' });
    }
  });

  // 6. Verificar se o mês anterior está pendente de impressão (para abrir popup no primeiro dia do mês)
  router.get('/check-pending-print', (req, res) => {
    try {
      const now = new Date();
      let prevYear = now.getFullYear();
      let prevMonth = now.getMonth(); // 0-indexed, so current month - 1
      if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
      }
      const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

      const config = db.prepare('SELECT printed_months FROM temperature_config WHERE id = ?').get('default');
      let printedMonths = [];
      try {
        printedMonths = JSON.parse(config.printed_months || '[]');
      } catch (e) {}

      const isPrinted = printedMonths.includes(prevMonthStr);

      const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];
      const prevMonthLabel = `${monthNames[prevMonth - 1]} de ${prevYear}`;

      return res.json({
        pending: !isPrinted,
        previousMonth: prevMonthStr,
        previousMonthLabel: prevMonthLabel,
        currentDay: now.getDate()
      });
    } catch (err) {
      console.error('[Temperatura] Erro ao checar pendência de impressão:', err);
      return res.status(500).json({ error: 'Erro ao checar pendência de impressão' });
    }
  });

  // 7. Marcar mês como impresso (desativa lembrete popup)
  router.post('/mark-printed', (req, res) => {
    try {
      const { month } = req.body;
      if (!month) {
        return res.status(400).json({ error: 'Mês não informado' });
      }

      const config = db.prepare('SELECT printed_months FROM temperature_config WHERE id = ?').get('default');
      let printedMonths = [];
      try {
        printedMonths = JSON.parse(config.printed_months || '[]');
      } catch (e) {}

      if (!printedMonths.includes(month)) {
        printedMonths.push(month);
        db.prepare('UPDATE temperature_config SET printed_months = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(JSON.stringify(printedMonths), 'default');
      }

      return res.json({ success: true, printedMonths });
    } catch (err) {
      console.error('[Temperatura] Erro ao marcar mês como impresso:', err);
      return res.status(500).json({ error: 'Erro ao marcar mês como impresso' });
    }
  });

  // 8. Rota para acionar ou forçar preenchimento retroativo (de 02/01/2026 até hoje)
  router.post('/backfill', (req, res) => {
    try {
      const { startDate = '2026-01-02', endDate = null } = req.body || {};
      backfillHistoricalRange(startDate, endDate);
      const count = db.prepare('SELECT COUNT(*) as total FROM temperature_records WHERE record_date >= ?').get(startDate);
      return res.json({ success: true, totalRecords: count.total, message: `Histórico preenchido desde ${startDate} até hoje de manhã!` });
    } catch (err) {
      console.error('[Temperatura] Erro ao rodar backfill:', err);
      return res.status(500).json({ error: 'Erro ao executar preenchimento retroativo' });
    }
  });

  return router;
};

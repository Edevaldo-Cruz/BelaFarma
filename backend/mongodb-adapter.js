/**
 * MongoDB Atlas Adapter
 * 
 * Este módulo implementa todas as operações de banco de dados usando
 * a MongoDB Atlas Data API, mantendo a mesma interface do SQLite.
 */

const ATLAS_CONFIG = {
  endpoint: process.env.MONGODB_ENDPOINT || 'https://sa-east-1.aws.data.mongodb-api.com/app/data-bhzrbfe/endpoint/data/v1',
  apiKey: process.env.MONGODB_API_KEY || 'mdb_sa_sk_rXt_BACYUMGw1ZIHduNx1TVF4eXoANI08qTrLKT4',
  dataSource: process.env.MONGODB_DATASOURCE || 'BancoBela',
  database: process.env.MONGODB_DATABASE || 'belafarma'
};

/**
 * Faz uma requisição para a MongoDB Atlas Data API
 */
async function atlasRequest(action, collection, body = {}) {
  try {
    const response = await fetch(`${ATLAS_CONFIG.endpoint}/action/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': ATLAS_CONFIG.apiKey,
      },
      body: JSON.stringify({
        dataSource: ATLAS_CONFIG.dataSource,
        database: ATLAS_CONFIG.database,
        collection: collection,
        ...body
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MongoDB API Error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`[MongoDB] Error in ${action} on ${collection}:`, error.message);
    throw error;
  }
}

/**
 * Gera um ID único (compatível com o formato usado no SQLite)
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * MongoDB Adapter - Interface compatível com SQLite
 */
class MongoDBAdapter {
  constructor() {
    console.log('[MongoDB] Adapter initialized');
    console.log(`[MongoDB] Database: ${ATLAS_CONFIG.database}`);
    console.log(`[MongoDB] DataSource: ${ATLAS_CONFIG.dataSource}`);
  }

  /**
   * Prepara uma "query" (simula o prepare do SQLite)
   * Retorna um objeto com métodos all(), get(), run()
   */
  prepare(query) {
    // Analisa a query SQL para determinar a operação e coleção
    const parsed = this._parseQuery(query);
    
    return {
      all: async (...params) => {
        return await this._executeQuery(parsed, 'all', params);
      },
      get: async (...params) => {
        const results = await this._executeQuery(parsed, 'get', params);
        return results.length > 0 ? results[0] : null;
      },
      run: async (...params) => {
        return await this._executeQuery(parsed, 'run', params);
      }
    };
  }

  /**
   * Executa comandos SQL diretos (usado para CREATE TABLE, etc.)
   */
  exec(sql) {
    // No MongoDB, não precisamos criar tabelas/coleções explicitamente
    // Elas são criadas automaticamente quando inserimos o primeiro documento
    console.log('[MongoDB] exec() called - collections are created automatically');
    return;
  }

  /**
   * Pragma (configurações do SQLite) - não aplicável ao MongoDB
   */
  pragma(setting) {
    console.log(`[MongoDB] pragma('${setting}') - ignored (SQLite specific)`);
    return;
  }

  /**
   * Transações - MongoDB Atlas Data API não suporta transações multi-documento
   * Retornamos uma função que executa o callback imediatamente
   */
  transaction(callback) {
    return () => {
      console.log('[MongoDB] transaction() - executing callback immediately (no transaction support in Data API)');
      return callback();
    };
  }

  /**
   * Analisa uma query SQL e extrai informações relevantes
   */
  _parseQuery(query) {
    const normalized = query.trim().toUpperCase();
    
    // Detectar tipo de operação
    let operation = null;
    if (normalized.startsWith('SELECT')) operation = 'SELECT';
    else if (normalized.startsWith('INSERT')) operation = 'INSERT';
    else if (normalized.startsWith('UPDATE')) operation = 'UPDATE';
    else if (normalized.startsWith('DELETE')) operation = 'DELETE';
    
    // Detectar coleção (nome da tabela)
    const collection = this._extractCollection(query);
    
    return {
      original: query,
      operation,
      collection,
      query: query
    };
  }

  /**
   * Extrai o nome da coleção/tabela da query SQL
   */
  _extractCollection(query) {
    const patterns = [
      /FROM\s+(\w+)/i,
      /INTO\s+(\w+)/i,
      /UPDATE\s+(\w+)/i,
      /TABLE\s+(\w+)/i
    ];
    
    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match) return match[1];
    }
    
    return 'unknown';
  }

  /**
   * Executa a query convertendo SQL para operações MongoDB
   */
  async _executeQuery(parsed, method, params) {
    const { operation, collection, query } = parsed;
    
    try {
      switch (operation) {
        case 'SELECT':
          return await this._handleSelect(collection, query, params, method);
        case 'INSERT':
          return await this._handleInsert(collection, query, params);
        case 'UPDATE':
          return await this._handleUpdate(collection, query, params);
        case 'DELETE':
          return await this._handleDelete(collection, query, params);
        default:
          console.warn(`[MongoDB] Unsupported operation: ${operation}`);
          return method === 'all' ? [] : null;
      }
    } catch (error) {
      console.error(`[MongoDB] Query execution error:`, error);
      throw error;
    }
  }

  /**
   * Manipula queries SELECT
   */
  async _handleSelect(collection, query, params, method) {
    // Construir filtro MongoDB a partir dos parâmetros
    const filter = this._buildFilter(query, params);
    
    const result = await atlasRequest('find', collection, {
      filter: filter || {}
    });
    
    const documents = result.documents || [];
    
    // Aplicar ORDER BY se presente na query
    if (query.includes('ORDER BY')) {
      const sortedDocs = this._applySort(documents, query);
      return method === 'get' ? sortedDocs : sortedDocs;
    }
    
    // Aplicar LIMIT se presente na query
    if (query.includes('LIMIT')) {
      const limitMatch = query.match(/LIMIT\s+(\d+)/i);
      if (limitMatch) {
        const limit = parseInt(limitMatch[1]);
        return documents.slice(0, limit);
      }
    }
    
    return documents;
  }

  /**
   * Manipula queries INSERT
   */
  async _handleInsert(collection, query, params) {
    // Extrair nomes de campos e valores
    const document = this._buildDocument(query, params);
    
    const result = await atlasRequest('insertOne', collection, {
      document
    });
    
    return {
      changes: result.insertedId ? 1 : 0,
      lastInsertRowid: result.insertedId
    };
  }

  /**
   * Manipula queries UPDATE
   */
  async _handleUpdate(collection, query, params) {
    const filter = this._buildFilter(query, params);
    const update = this._buildUpdate(query, params);
    
    const result = await atlasRequest('updateMany', collection, {
      filter,
      update: { $set: update }
    });
    
    return {
      changes: result.modifiedCount || 0
    };
  }

  /**
   * Manipula queries DELETE
   */
  async _handleDelete(collection, query, params) {
    const filter = this._buildFilter(query, params);
    
    const result = await atlasRequest('deleteMany', collection, {
      filter
    });
    
    return {
      changes: result.deletedCount || 0
    };
  }

  /**
   * Constrói um filtro MongoDB a partir de uma query SQL
   */
  _buildFilter(query, params) {
    // Procurar por WHERE clause
    const whereMatch = query.match(/WHERE\s+(.+?)(?:ORDER BY|LIMIT|$)/i);
    if (!whereMatch) return {};
    
    const whereClause = whereMatch[1].trim();
    
    // Casos simples: WHERE id = ?
    if (whereClause.includes('=') && params.length > 0) {
      const fieldMatch = whereClause.match(/(\w+)\s*=\s*\?/);
      if (fieldMatch) {
        return { [fieldMatch[1]]: params[0] };
      }
    }
    
    // WHERE id IN (?, ?, ?)
    if (whereClause.includes('IN (')) {
      const fieldMatch = whereClause.match(/(\w+)\s+IN\s*\(/);
      if (fieldMatch && params.length > 0) {
        return { [fieldMatch[1]]: { $in: params } };
      }
    }
    
    // WHERE accessKey = ?
    if (whereClause.includes('accessKey')) {
      return { accessKey: params[0] };
    }
    
    return {};
  }

  /**
   * Constrói um documento MongoDB a partir de uma query INSERT
   */
  _buildDocument(query, params) {
    // Extrair campos: INSERT INTO table (field1, field2) VALUES (?, ?)
    const fieldsMatch = query.match(/\(([^)]+)\)\s*VALUES/i);
    if (!fieldsMatch) return {};
    
    const fields = fieldsMatch[1].split(',').map(f => f.trim());
    
    const document = {};
    
    // Se params é um objeto (named parameters)
    if (params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])) {
      return params[0];
    }
    
    // Se params é um array
    fields.forEach((field, index) => {
      if (params[index] !== undefined) {
        document[field] = params[index];
      }
    });
    
    return document;
  }

  /**
   * Constrói um objeto de update MongoDB a partir de uma query UPDATE
   */
  _buildUpdate(query, params) {
    // Extrair SET clause
    const setMatch = query.match(/SET\s+(.+?)\s+WHERE/i);
    if (!setMatch) return {};
    
    const setClause = setMatch[1];
    const updates = {};
    
    // Se params é um objeto (named parameters)
    if (params.length === 1 && typeof params[0] === 'object') {
      const obj = params[0];
      // Extrair campos do SET clause
      const fields = setClause.match(/(\w+)\s*=/g);
      if (fields) {
        fields.forEach(field => {
          const fieldName = field.replace(/\s*=\s*/, '').trim();
          if (obj[fieldName] !== undefined) {
            updates[fieldName] = obj[fieldName];
          }
        });
      }
    }
    
    return updates;
  }

  /**
   * Aplica ordenação aos documentos
   */
  _applySort(documents, query) {
    const orderMatch = query.match(/ORDER BY\s+(\w+)\s*(ASC|DESC)?/i);
    if (!orderMatch) return documents;
    
    const field = orderMatch[1];
    const direction = orderMatch[2]?.toUpperCase() === 'DESC' ? -1 : 1;
    
    return documents.sort((a, b) => {
      if (a[field] < b[field]) return -1 * direction;
      if (a[field] > b[field]) return 1 * direction;
      return 0;
    });
  }
}

module.exports = new MongoDBAdapter();

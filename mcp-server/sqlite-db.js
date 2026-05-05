/**
 * SQLite 数据库连接管理模块
 * 使用 sql.js (纯 JavaScript 实现) 支持连接 SQLite 数据库
 */

import initSqlJs from 'sql.js'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let SQL

class DatabaseManager {
  constructor() {
    this.connections = new Map()
    this.currentDb = null
    this.dbData = new Map()
    this.initialized = false
  }

  async init() {
    if (this.initialized) return
    SQL = await initSqlJs()
    this.initialized = true
    console.log('✅ SQL.js 初始化完成')
  }

  async connect(dbPath) {
    try {
      if (!this.initialized) {
        await this.init()
      }

      const absolutePath = path.isAbsolute(dbPath)
        ? dbPath
        : path.join(__dirname, dbPath)

      let db
      if (fs.existsSync(absolutePath)) {
        const fileBuffer = fs.readFileSync(absolutePath)
        db = new SQL.Database(fileBuffer)
      } else {
        const dir = path.dirname(absolutePath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        db = new SQL.Database()
      }

      const connId = `conn_${Date.now()}`

      this.connections.set(connId, {
        db,
        path: absolutePath,
        createdAt: new Date().toISOString(),
      })

      this.dbData.set(connId, [])
      this.currentDb = connId

      return {
        success: true,
        connId,
        path: absolutePath,
        message: `✅ 成功连接到数据库: ${path.basename(absolutePath)}`,
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: `❌ 数据库连接失败: ${error.message}`,
      }
    }
  }

  async connectToMemory(name = 'memory') {
    try {
      if (!this.initialized) {
        await this.init()
      }

      const db = new SQL.Database()
      const connId = `mem_${Date.now()}`

      this.connections.set(connId, {
        db,
        path: ':memory:',
        createdAt: new Date().toISOString(),
        isMemory: true,
      })

      this.dbData.set(connId, [])
      this.currentDb = connId

      return {
        success: true,
        connId,
        path: ':memory:',
        message: '✅ 已创建内存数据库',
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: `❌ 创建内存数据库失败: ${error.message}`,
      }
    }
  }

  disconnect(connId) {
    const targetConnId = connId || this.currentDb
    const conn = this.connections.get(targetConnId)

    if (!conn) {
      return { success: false, message: '没有活动的数据库连接' }
    }

    if (!conn.isMemory) {
      const data = conn.db.export()
      const buffer = Buffer.from(data)
      fs.writeFileSync(conn.path, buffer)
    }

    conn.db.close()
    this.connections.delete(targetConnId)
    this.dbData.delete(targetConnId)

    if (this.currentDb === targetConnId) {
      this.currentDb = this.connections.keys().next().value || null
    }

    return { success: true, message: '✅ 数据库连接已关闭' }
  }

  execute(sql, params = []) {
    const conn = this.currentDb ? this.connections.get(this.currentDb) : null

    if (!conn) {
      return {
        success: false,
        message: '❌ 没有活动的数据库连接，请先连接数据库',
        error: 'NO_CONNECTION',
      }
    }

    try {
      const trimmedSql = sql.trim().toLowerCase()

      if (trimmedSql.startsWith('select') || trimmedSql.startsWith('pragma')) {
        const stmt = conn.db.prepare(sql)
        if (params.length > 0) {
          stmt.bind(params)
        }

        const results = []
        while (stmt.step()) {
          const row = stmt.getAsObject()
          results.push(row)
        }
        stmt.free()

        return {
          success: true,
          type: 'query',
          data: results,
          rowCount: results.length,
          message: `✅ 查询成功，返回 ${results.length} 条记录`,
        }
      } else if (
        trimmedSql.startsWith('insert') ||
        trimmedSql.startsWith('update') ||
        trimmedSql.startsWith('delete') ||
        trimmedSql.startsWith('create')
      ) {
        if (params.length > 0) {
          conn.db.run(sql, params)
        } else {
          conn.db.run(sql)
        }

        const changes = conn.db.getRowsModified()

        if (!conn.isMemory) {
          const data = conn.db.export()
          const buffer = Buffer.from(data)
          fs.writeFileSync(conn.path, buffer)
        }

        return {
          success: true,
          type: 'run',
          changes: changes,
          message: `✅ 操作成功，影响 ${changes} 行`,
        }
      } else {
        conn.db.exec(sql)
        return {
          success: true,
          type: 'exec',
          message: '✅ SQL 语句执行成功',
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: `❌ SQL 执行失败: ${error.message}`,
      }
    }
  }

  getTables() {
    const conn = this.currentDb ? this.connections.get(this.currentDb) : null

    if (!conn) {
      return { success: false, message: '没有活动的数据库连接' }
    }

    try {
      const stmt = conn.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      const tables = []
      while (stmt.step()) {
        tables.push(stmt.getAsObject())
      }
      stmt.free()

      return {
        success: true,
        tables: tables.map((t) => t.name),
        message: `📋 数据库中有 ${tables.length} 个表`,
      }
    } catch (error) {
      return { success: false, message: error.message }
    }
  }

  getTableInfo(tableName) {
    const conn = this.currentDb ? this.connections.get(this.currentDb) : null

    if (!conn) {
      return { success: false, message: '没有活动的数据库连接' }
    }

    try {
      const stmt = conn.db.prepare(`PRAGMA table_info(${tableName})`)
      const columns = []
      while (stmt.step()) {
        columns.push(stmt.getAsObject())
      }
      stmt.free()

      return {
        success: true,
        tableName,
        columns,
        message: `📊 表 ${tableName} 有 ${columns.length} 个字段`,
      }
    } catch (error) {
      return { success: false, message: error.message }
    }
  }

  getConnectionStatus() {
    if (!this.currentDb || !this.connections.has(this.currentDb)) {
      return {
        connected: false,
        message: '🔴 未连接到任何数据库',
      }
    }

    const conn = this.connections.get(this.currentDb)
    return {
      connected: true,
      connId: this.currentDb,
      path: conn.path,
      isMemory: conn.isMemory || false,
      createdAt: conn.createdAt,
      activeConnections: this.connections.size,
      message: conn.isMemory
        ? '🟢 已连接到: 内存数据库'
        : `🟢 已连接到: ${path.basename(conn.path)}`,
    }
  }

  listAllConnections() {
    const list = []
    for (const [connId, conn] of this.connections) {
      list.push({
        connId,
        path: conn.path,
        isMemory: conn.isMemory || false,
        createdAt: conn.createdAt,
      })
    }
    return list
  }
}

export default new DatabaseManager()

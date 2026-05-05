/**
 * 初始化示例数据库
 * 运行此脚本创建示例数据库: node init-sample-db.js
 */

import initSqlJs from 'sql.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DB_DIR = path.join(__dirname, 'data')
const DB_PATH = path.join(DB_DIR, 'sample.db')

async function init() {
  // 确保目录存在
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true })
  }

  console.log('📦 初始化 SQL.js...')
  const SQL = await initSqlJs()

  console.log('📦 创建示例数据库...')
  const db = new SQL.Database()

  // 创建表
  db.run(`
    CREATE TABLE IF NOT EXISTS models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        file_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS analysis_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id INTEGER,
        analysis_type TEXT NOT NULL,
        result_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS sensors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        location TEXT,
        type TEXT,
        status TEXT DEFAULT 'active',
        last_reading REAL,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  console.log('✅ 表创建完成')

  // 插入模型数据
  const models = [
    [
      '办公楼A',
      '建筑',
      '位于园区东侧的办公楼，共12层',
      '/models/building_a.s3m',
    ],
    ['教学楼B', '建筑', '主要用于教学，共5层', '/models/building_b.s3m'],
    ['图书馆', '建筑', '校园中心位置的图书馆', '/models/library.s3m'],
    ['体育场', '设施', '标准400米跑道体育场', '/models/stadium.s3m'],
    ['停车场', '设施', '地下两层停车场，可容纳500辆车', '/models/parking.s3m'],
  ]
  models.forEach((m) => {
    db.run(
      'INSERT INTO models (name, category, description, file_path) VALUES (?, ?, ?, ?)',
      m,
    )
  })
  console.log('✅ 模型数据插入完成')

  // 插入用户数据
  const users = [
    ['admin', 'admin@school.edu', 'admin'],
    ['teacher1', 'teacher1@school.edu', 'teacher'],
    ['student1', 'student1@school.edu', 'student'],
    ['researcher', 'researcher@school.edu', 'researcher'],
  ]
  users.forEach((u) => {
    db.run('INSERT INTO users (username, email, role) VALUES (?, ?, ?)', u)
  })
  console.log('✅ 用户数据插入完成')

  // 插入传感器数据
  const sensors = [
    ['温度传感器A1', '办公楼A-1层', 'temperature', 'active', 22.5],
    ['温度传感器A2', '办公楼A-5层', 'temperature', 'active', 23.1],
    ['湿度传感器B1', '教学楼B-2层', 'humidity', 'active', 45.2],
    ['光照传感器C1', '图书馆-大厅', 'light', 'active', 850],
    ['PM2.5传感器', '园区中心', 'air_quality', 'active', 35],
    ['噪声传感器', '体育场入口', 'noise', 'active', 65.3],
  ]
  sensors.forEach((s) => {
    db.run(
      'INSERT INTO sensors (name, location, type, status, last_reading) VALUES (?, ?, ?, ?, ?)',
      s,
    )
  })
  console.log('✅ 传感器数据插入完成')

  // 保存数据库文件
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(DB_PATH, buffer)
  db.close()

  console.log(`\n🎉 示例数据库创建成功！`)
  console.log(`📁 数据库路径: ${DB_PATH}`)
  console.log(`\n📋 包含以下表:`)
  console.log(`   - models (模型信息, 5条记录)`)
  console.log(`   - users (用户, 4条记录)`)
  console.log(`   - sensors (传感器, 6条记录)`)
  console.log(`   - analysis_results (分析结果)`)
}

init().catch(console.error)

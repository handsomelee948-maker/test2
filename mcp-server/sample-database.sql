-- 创建模型信息表
CREATE TABLE IF NOT EXISTS models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    file_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建分析结果表
CREATE TABLE IF NOT EXISTS analysis_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id INTEGER,
    analysis_type TEXT NOT NULL,
    result_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (model_id) REFERENCES models(id)
);

-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建传感器数据表
CREATE TABLE IF NOT EXISTS sensors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT,
    type TEXT,
    status TEXT DEFAULT 'active',
    last_reading REAL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 插入示例模型数据
INSERT INTO models (name, category, description, file_path) VALUES 
('办公楼A', '建筑', '位于园区东侧的办公楼，共12层', '/models/building_a.s3m'),
('教学楼B', '建筑', '主要用于教学，共5层', '/models/building_b.s3m'),
('图书馆', '建筑', '校园中心位置的图书馆', '/models/library.s3m'),
('体育场', '设施', '标准400米跑道体育场', '/models/stadium.s3m'),
('停车场', '设施', '地下两层停车场，可容纳500辆车', '/models/parking.s3m');

-- 插入示例分析结果
INSERT INTO analysis_results (model_id, analysis_type, result_data) VALUES 
(1, '可视域', '{"viewDistance": 500, "visibleArea": 12500}'),
(1, '阴影', '{"shadowLength": 45, "shadowDirection": "NW"}'),
(2, '通视', '{"lineOfSight": true, "distance": 320}'),
(3, '天际线', '{"peakHeight": 85, "buildingCount": 12}');

-- 插入示例用户
INSERT INTO users (username, email, role) VALUES 
('admin', 'admin@school.edu', 'admin'),
('teacher1', 'teacher1@school.edu', 'teacher'),
('student1', 'student1@school.edu', 'student'),
('researcher', 'researcher@school.edu', 'researcher');

-- 插入示例传感器数据
INSERT INTO sensors (name, location, type, status, last_reading) VALUES 
('温度传感器A1', '办公楼A-1层', 'temperature', 'active', 22.5),
('温度传感器A2', '办公楼A-5层', 'temperature', 'active', 23.1),
('湿度传感器B1', '教学楼B-2层', 'humidity', 'active', 45.2),
('光照传感器C1', '图书馆-大厅', 'light', 'active', 850),
('PM2.5传感器', '园区中心', 'air_quality', 'active', 35),
('噪声传感器', '体育场入口', 'noise', 'active', 65.3);

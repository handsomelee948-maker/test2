import express from 'express'
import cors from 'cors'
import { WebSocketServer } from 'ws'
import { v4 as uuidv4 } from 'uuid'
import dotenv from 'dotenv'
import ModelInfoTools from './model-info-tools.js'
import ModelDatabase from './model-database.js'
import DatabaseManager from './sqlite-db.js'

// 为 Node.js 16 兼容性导入 fetch polyfill
import fetch from 'node-fetch'
// 注意：Node.js 18+ 已内置 fetch，但导入不会冲突

// 加载环境变量
dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// 中间件
app.use(cors())
app.use(express.json())

// 配置本地Ollama API
const ollamaURL = 'http://127.0.0.1:11434/api/generate'
const model = 'qwen2.5:1.5b'

// Ollama API调用函数
async function callOllamaAPI(prompt) {
  try {
    const response = await fetch(ollamaURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: false,
      }),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    return data.response
  } catch (error) {
    console.error('Ollama API调用错误:', error)
    throw error
  }
}

// 存储活跃的SSE连接
const sseConnections = new Map()

// 存储活跃的WebSocket连接
const wsConnections = new Map()

// 初始化模型信息管理工具
const modelInfoTools = new ModelInfoTools()

// MCP协议消息类型
const MCP_MESSAGE_TYPES = {
  INITIALIZE: 'initialize',
  TOOLS_CALL: 'tools/call',
  TOOLS_RESULT: 'tools/result',
  NOTIFICATION: 'notification',
  ERROR: 'error',
}

// 系统功能工具定义 - 基于实际开发完成的功能
const SYSTEM_TOOLS = {
  // 基础操作工具
  LOAD_MODEL: {
    name: 'load_model',
    description: '加载三维模型到场景中',
    parameters: {
      type: 'object',
      properties: {
        model_path: { type: 'string', description: '模型文件路径' },
        model_name: { type: 'string', description: '模型名称' },
      },
      required: ['model_path'],
    },
  },
  FLY_TO_MODEL: {
    name: 'fly_to_model',
    description: '飞行到指定模型位置',
    parameters: {
      type: 'object',
      properties: {
        model_id: { type: 'string', description: '模型ID' },
        duration: { type: 'number', description: '飞行时间（秒）' },
      },
    },
  },

  // 导航与漫游工具
  INDOOR_NAVIGATION: {
    name: 'indoor_navigation',
    description: '室内导航功能，提供路径规划和导航指引',
    parameters: {
      type: 'object',
      properties: {
        start_point: {
          type: 'object',
          properties: {
            longitude: { type: 'number', description: '起点经度' },
            latitude: { type: 'number', description: '起点纬度' },
            floor: { type: 'number', description: '起点楼层' },
          },
        },
        end_point: {
          type: 'object',
          properties: {
            longitude: { type: 'number', description: '终点经度' },
            latitude: { type: 'number', description: '终点纬度' },
            floor: { type: 'number', description: '终点楼层' },
          },
        },
      },
      required: ['start_point', 'end_point'],
    },
  },
  ROAMING: {
    name: 'roaming',
    description: '漫游功能，自由浏览三维场景',
    parameters: {
      type: 'object',
      properties: {
        roaming_mode: {
          type: 'string',
          enum: ['free', 'path', 'guided'],
          description: '漫游模式',
        },
        speed: { type: 'number', description: '漫游速度' },
      },
    },
  },

  // 空间分析工具
  PROFILE_ANALYSIS: {
    name: 'profile_analysis',
    description: '剖面分析，分析地形或建筑物的剖面特征',
    parameters: {
      type: 'object',
      properties: {
        start_point: {
          type: 'object',
          properties: {
            longitude: { type: 'number', description: '起点经度' },
            latitude: { type: 'number', description: '起点纬度' },
          },
        },
        end_point: {
          type: 'object',
          properties: {
            longitude: { type: 'number', description: '终点经度' },
            latitude: { type: 'number', description: '终点纬度' },
          },
        },
      },
      required: ['start_point', 'end_point'],
    },
  },
  VIEWSHED_ANALYSIS: {
    name: 'viewshed_analysis',
    description: '可视域分析，分析从观察点可见的区域范围',
    parameters: {
      type: 'object',
      properties: {
        observer_position: {
          type: 'object',
          properties: {
            longitude: { type: 'number', description: '观察点经度' },
            latitude: { type: 'number', description: '观察点纬度' },
            height: { type: 'number', description: '观察点高度' },
          },
        },
        radius: { type: 'number', description: '分析半径（米）' },
        observer_height: { type: 'number', description: '观察者高度（米）' },
      },
      required: ['observer_position'],
    },
  },
  SIGHTLINE_ANALYSIS: {
    name: 'sightline_analysis',
    description: '通视分析，分析两点之间的视线通视情况',
    parameters: {
      type: 'object',
      properties: {
        start_point: {
          type: 'object',
          properties: {
            longitude: { type: 'number', description: '起点经度' },
            latitude: { type: 'number', description: '起点纬度' },
            height: { type: 'number', description: '起点高度' },
          },
        },
        end_point: {
          type: 'object',
          properties: {
            longitude: { type: 'number', description: '终点经度' },
            latitude: { type: 'number', description: '终点纬度' },
            height: { type: 'number', description: '终点高度' },
          },
        },
      },
      required: ['start_point', 'end_point'],
    },
  },
  SHADOW_ANALYSIS: {
    name: 'shadow_analysis',
    description:
      '阴影分析，分析建筑物或地形的阴影分布，支持自然语言时间设置（如"下午3点"、"上午8点到下午6点"）',
    parameters: {
      type: 'object',
      properties: {
        analysis_time: {
          type: 'string',
          description:
            '分析时间（支持格式：YYYY-MM-DD HH:mm:ss、下午3点、15:00等）',
        },
        start_time: {
          type: 'string',
          description: '开始时间（支持自然语言格式，如"上午8点"、"08:00"）',
        },
        end_time: {
          type: 'string',
          description: '结束时间（支持自然语言格式，如"下午6点"、"18:00"）',
        },
        duration: { type: 'number', description: '分析时长（小时）' },
        date: {
          type: 'string',
          description: '分析日期（YYYY-MM-DD格式，默认为今天）',
        },
      },
    },
  },
  SKYLINE_ANALYSIS: {
    name: 'skyline_analysis',
    description: '天际线分析，分析城市或建筑物的天际线轮廓',
    parameters: {
      type: 'object',
      properties: {
        observer_position: {
          type: 'object',
          properties: {
            longitude: { type: 'number', description: '观察点经度' },
            latitude: { type: 'number', description: '观察点纬度' },
            height: { type: 'number', description: '观察点高度' },
          },
        },
        direction: { type: 'string', description: '观察方向' },
      },
    },
  },

  // 测量分析工具
  DISTANCE_MEASURE: {
    name: 'distance_measure',
    description: '距离测量，测量两点或多点之间的空间距离',
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['point_to_point', 'point_to_multipoint'],
          description: '测量模式',
          default: 'point_to_point',
        },
        start_point: {
          type: 'object',
          properties: {
            longitude: { type: 'number', description: '起点经度' },
            latitude: { type: 'number', description: '起点纬度' },
            height: { type: 'number', description: '起点高度' },
          },
        },
        end_point: {
          type: 'object',
          properties: {
            longitude: { type: 'number', description: '终点经度' },
            latitude: { type: 'number', description: '终点纬度' },
            height: { type: 'number', description: '终点高度' },
          },
        },
      },
    },
  },
  AREA_MEASURE: {
    name: 'area_measure',
    description: '面积测量，测量封闭区域的表面积或投影面积',
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['surface', 'projection'],
          description: '测量模式：表面面积或投影面积',
          default: 'surface',
        },
        positions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              longitude: { type: 'number', description: '经度' },
              latitude: { type: 'number', description: '纬度' },
              height: { type: 'number', description: '高度' },
            },
          },
          description: '测量区域的顶点坐标数组',
        },
      },
    },
  },
  HEIGHT_MEASURE: {
    name: 'height_measure',
    description: '高度测量，测量两点之间的高差或垂直高度',
    parameters: {
      type: 'object',
      properties: {
        start_point: {
          type: 'object',
          properties: {
            longitude: { type: 'number', description: '起点经度' },
            latitude: { type: 'number', description: '起点纬度' },
            height: { type: 'number', description: '起点高度' },
          },
        },
        end_point: {
          type: 'object',
          properties: {
            longitude: { type: 'number', description: '终点经度' },
            latitude: { type: 'number', description: '终点纬度' },
            height: { type: 'number', description: '终点高度' },
          },
        },
      },
    },
  },
  CLEAR_MEASURE: {
    name: 'clear_measure',
    description: '清除所有测量结果',
    parameters: {
      type: 'object',
      properties: {
        measure_type: {
          type: 'string',
          enum: ['all', 'distance', 'area', 'height'],
          description: '清除类型',
          default: 'all',
        },
      },
    },
  },

  // 基础操作工具 - 新增
  TRANSLATE_MODEL: {
    name: 'translate_model',
    description: '平移模型，在三维空间中移动模型位置',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X轴方向移动距离（米）' },
        y: { type: 'number', description: 'Y轴方向移动距离（米）' },
        z: { type: 'number', description: 'Z轴方向移动距离（米）' },
        model_id: {
          type: 'string',
          description: '模型ID（可选，默认为当前模型）',
        },
      },
    },
  },
  ROTATE_MODEL: {
    name: 'rotate_model',
    description: '旋转模型，改变模型的方向角度',
    parameters: {
      type: 'object',
      properties: {
        x_angle: { type: 'number', description: 'X轴旋转角度（度）' },
        y_angle: { type: 'number', description: 'Y轴旋转角度（度）' },
        z_angle: { type: 'number', description: 'Z轴旋转角度（度）' },
        model_id: {
          type: 'string',
          description: '模型ID（可选，默认为当前模型）',
        },
      },
    },
  },
  SCALE_MODEL: {
    name: 'scale_model',
    description: '缩放模型，改变模型的大小比例',
    parameters: {
      type: 'object',
      properties: {
        scale_factor: {
          type: 'number',
          description: '缩放比例（如2表示放大2倍，0.5表示缩小一半）',
        },
        model_id: {
          type: 'string',
          description: '模型ID（可选，默认为当前模型）',
        },
      },
    },
  },

  // 系统控制工具
  CLEAR_ANALYSIS: {
    name: 'clear_analysis',
    description: '清除所有分析结果和临时对象',
    parameters: {
      type: 'object',
      properties: {
        clear_type: {
          type: 'string',
          enum: [
            'all',
            'viewshed',
            'sightline',
            'profile',
            'shadow',
            'skyline',
          ],
          description: '清除类型',
        },
      },
    },
  },
  LIGHTING_SETTINGS: {
    name: 'lighting_settings',
    description: '光照设置，调整场景光照效果',
    parameters: {
      type: 'object',
      properties: {
        lighting_type: {
          type: 'string',
          enum: ['sun', 'moon', 'artificial', 'custom'],
          description: '光照类型',
        },
        intensity: { type: 'number', description: '光照强度' },
        color: { type: 'string', description: '光照颜色' },
      },
    },
  },
  BLOOM_EFFECT: {
    name: 'bloom_effect',
    description: '泛光效果，增强场景视觉效果',
    parameters: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: '是否启用' },
        intensity: { type: 'number', description: '泛光强度' },
        threshold: { type: 'number', description: '阈值' },
      },
    },
  },

  // 可视域分析工具（简化版本）
  VIEWSHED_ANALYSIS: {
    name: 'viewshed_analysis',
    description: '可视域分析，分析从指定观察点能够看到的区域范围',
    parameters: {
      type: 'object',
      properties: {
        observer_position: {
          type: 'object',
          properties: {
            longitude: { type: 'number', description: '观察点经度' },
            latitude: { type: 'number', description: '观察点纬度' },
            height: { type: 'number', description: '观察点高度（米）' },
          },
          required: ['longitude', 'latitude', 'height'],
        },
        radius: {
          type: 'number',
          description: '分析半径（米）',
          default: 1000,
        },
        observer_height: {
          type: 'number',
          description: '观察者高度（米）',
          default: 1.7,
        },
      },
      required: ['observer_position'],
    },
  },

  // 可视域属性编辑工具
  VIEWSHED_PROPERTY_EDIT: {
    name: 'viewshed_property_edit',
    description:
      '可视域分析属性编辑，修改可视域分析的参数，如方向角、俯仰角、观察距离、视场角等',
    parameters: {
      type: 'object',
      properties: {
        heading: { type: 'number', description: '方向角（度），0-360度' },
        pitch: { type: 'number', description: '俯仰角（度），-90到90度' },
        distance: { type: 'number', description: '观察距离（米）' },
        horizontal_fov: { type: 'number', description: '水平视场角（度）' },
        vertical_fov: { type: 'number', description: '垂直视场角（度）' },
        visible_color: {
          type: 'string',
          description: '可见区域颜色（CSS颜色值）',
        },
        hidden_color: {
          type: 'string',
          description: '不可见区域颜色（CSS颜色值）',
        },
      },
    },
  },

  // 日照效果工具
  SUNLIGHT_EFFECT: {
    name: 'sunlight_effect',
    description:
      '日照效果演示，模拟太阳在指定时间范围内的运动轨迹和光照变化，支持自然语言时间设置（如"上午8点到下午6点"）',
    parameters: {
      type: 'object',
      properties: {
        start_time: {
          type: 'string',
          description: '开始时间（支持自然语言格式，如"上午8点"、"08:00"）',
        },
        end_time: {
          type: 'string',
          description: '结束时间（支持自然语言格式，如"下午6点"、"18:00"）',
        },
        time_range: {
          type: 'string',
          description: '时间范围（如"上午8点到下午6点"）',
        },
        date: {
          type: 'string',
          description: '分析日期（YYYY-MM-DD格式，默认为今天）',
        },
        animation_speed: {
          type: 'number',
          description: '动画速度（1-10，默认为5）',
        },
      },
    },
  },

  // 二维天际线查看工具
  SKYLINE_2D_VIEW: {
    name: 'skyline_2d_view',
    description: '查看已提取的二维天际线图表，显示天际线的高度分布和角度信息',
    parameters: {
      type: 'object',
      properties: {},
    },
  },

  // 模型信息管理工具
  GET_MODEL_INFO: {
    name: 'get_model_info',
    description: '获取指定模型的详细信息，包括属性、分类、标签等元数据',
    parameters: {
      type: 'object',
      properties: {
        model_id: { type: 'string', description: '模型ID' },
      },
      required: ['model_id'],
    },
  },
  SEARCH_MODELS: {
    name: 'search_models',
    description: '智能搜索模型，支持按名称、属性、标签等进行模糊匹配和高级筛选',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索查询词' },
        options: {
          type: 'object',
          properties: {
            category: { type: 'string', description: '分类过滤' },
            limit: { type: 'number', description: '结果数量限制' },
          },
        },
      },
      required: ['query'],
    },
  },
  UPDATE_MODEL_INFO: {
    name: 'update_model_info',
    description: '更新模型信息，包括属性、描述、标签等元数据',
    parameters: {
      type: 'object',
      properties: {
        model_id: { type: 'string', description: '模型ID' },
        updates: {
          type: 'object',
          properties: {
            properties: { type: 'object', description: '要更新的属性' },
            description: { type: 'string', description: '新的描述' },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: '标签数组',
            },
          },
        },
      },
      required: ['model_id', 'updates'],
    },
  },
  GET_MODEL_STATISTICS: {
    name: 'get_model_statistics',
    description: '获取模型数据库的统计信息，包括总数、分类分布、属性分布等',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  GET_MODELS_BY_CATEGORY: {
    name: 'get_models_by_category',
    description: '按分类获取模型列表，支持建筑、设备、植被等分类',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: '分类名称' },
      },
      required: ['category'],
    },
  },
  REGISTER_MODEL: {
    name: 'register_model',
    description: '注册新模型到数据库，支持建筑、设备、植被等多种类型',
    parameters: {
      type: 'object',
      properties: {
        model_id: { type: 'string', description: '模型ID' },
        model_info: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            category: { type: 'string' },
            description: { type: 'string' },
            properties: { type: 'object' },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      required: ['model_id', 'model_info'],
    },
  },

  // 数据库管理工具
  DB_GET_ALL_MODELS: {
    name: 'db_get_all_models',
    description: '获取数据库中所有模型列表',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  DB_GET_MODEL: {
    name: 'db_get_model',
    description: '根据ID获取单个模型的详细信息',
    parameters: {
      type: 'object',
      properties: {
        model_id: { type: 'string', description: '模型ID' },
      },
      required: ['model_id'],
    },
  },
  DB_SEARCH_MODELS: {
    name: 'db_search_models',
    description: '搜索模型，支持按名称、描述、分类、标签等进行模糊匹配',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
      },
      required: ['query'],
    },
  },
  DB_ADD_MODEL: {
    name: 'db_add_model',
    description: '添加新模型到数据库',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '模型名称' },
        category: { type: 'string', description: '模型分类' },
        description: { type: 'string', description: '模型描述' },
        file_path: { type: 'string', description: '模型文件路径' },
        properties: { type: 'object', description: '模型属性' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签' },
        color: { type: 'string', description: '模型颜色（用于高亮）' },
      },
      required: ['name', 'category'],
    },
  },
  DB_UPDATE_MODEL: {
    name: 'db_update_model',
    description: '更新模型信息',
    parameters: {
      type: 'object',
      properties: {
        model_id: { type: 'string', description: '模型ID' },
        updates: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            category: { type: 'string' },
            description: { type: 'string' },
            properties: { type: 'object' },
            tags: { type: 'array', items: { type: 'string' } },
            color: { type: 'string' },
          },
        },
      },
      required: ['model_id', 'updates'],
    },
  },
  DB_DELETE_MODEL: {
    name: 'db_delete_model',
    description: '从数据库删除模型',
    parameters: {
      type: 'object',
      properties: {
        model_id: { type: 'string', description: '模型ID' },
      },
      required: ['model_id'],
    },
  },
  DB_GET_BY_CATEGORY: {
    name: 'db_get_by_category',
    description: '按分类获取模型列表',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: '模型分类' },
      },
      required: ['category'],
    },
  },
  DB_GET_STATISTICS: {
    name: 'db_get_statistics',
    description: '获取模型数据库统计信息',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  HIGHLIGHT_MODEL: {
    name: 'highlight_model',
    description: '高亮显示指定模型，可设置高亮颜色和闪烁效果',
    parameters: {
      type: 'object',
      properties: {
        model_id: { type: 'string', description: '模型ID' },
        color: { type: 'string', description: '高亮颜色，如 #FF0000 或 red' },
        intensity: { type: 'number', description: '高亮强度 0-1，默认1' },
        blinking: { type: 'boolean', description: '是否闪烁效果，默认false' },
      },
      required: ['model_id'],
    },
  },
  CLEAR_HIGHLIGHT: {
    name: 'clear_highlight',
    description: '清除模型高亮效果',
    parameters: {
      type: 'object',
      properties: {
        model_id: { type: 'string', description: '模型ID，不传则清除所有高亮' },
      },
    },
  },

  // SQLite 数据库连接工具
  SQL_CONNECT: {
    name: 'sql_connect',
    description: '连接SQLite数据库文件',
    parameters: {
      type: 'object',
      properties: {
        db_path: {
          type: 'string',
          description: '数据库文件路径，如 data/myapp.db',
        },
      },
      required: ['db_path'],
    },
  },
  SQL_CONNECT_MEMORY: {
    name: 'sql_connect_memory',
    description: '创建内存数据库（临时使用，关闭后数据丢失）',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '数据库名称（可选）' },
      },
    },
  },
  SQL_DISCONNECT: {
    name: 'sql_disconnect',
    description: '断开数据库连接',
    parameters: {
      type: 'object',
      properties: {
        conn_id: {
          type: 'string',
          description: '连接ID（可选，不传则断开当前连接）',
        },
      },
    },
  },
  SQL_EXECUTE: {
    name: 'sql_execute',
    description: '执行SQL语句（支持SELECT、INSERT、UPDATE、DELETE、CREATE等）',
    parameters: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL语句' },
        params: { type: 'array', description: '参数数组（可选）' },
      },
      required: ['sql'],
    },
  },
  SQL_GET_TABLES: {
    name: 'sql_get_tables',
    description: '获取当前数据库中的所有表',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  SQL_GET_TABLE_INFO: {
    name: 'sql_get_table_info',
    description: '获取指定表的结构信息',
    parameters: {
      type: 'object',
      properties: {
        table_name: { type: 'string', description: '表名' },
      },
      required: ['table_name'],
    },
  },
  SQL_STATUS: {
    name: 'sql_status',
    description: '获取数据库连接状态',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
}

// SSE端点 - 用于实时通信
app.get('/mcp/sse', (req, res) => {
  const clientId = uuidv4()

  // 设置SSE响应头
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  })

  // 发送连接确认
  res.write(
    `event: connected\ndata: ${JSON.stringify({ clientId, timestamp: Date.now() })}\n\n`,
  )

  // 存储连接
  sseConnections.set(clientId, res)

  // 客户端断开连接处理
  req.on('close', () => {
    sseConnections.delete(clientId)
    console.log(`SSE客户端 ${clientId} 断开连接`)
  })

  console.log(`SSE客户端 ${clientId} 已连接`)
})

// WebSocket端点 - 监听所有网络接口以支持离线环境
const wss = new WebSocketServer({
  port: 3002,
  host: '0.0.0.0', // 监听所有网络接口
})

wss.on('connection', (ws, req) => {
  const clientId = uuidv4()
  wsConnections.set(clientId, ws)

  console.log(`WebSocket客户端 ${clientId} 已连接`)

  // 发送欢迎消息
  ws.send(
    JSON.stringify({
      type: MCP_MESSAGE_TYPES.INITIALIZE,
      clientId,
      timestamp: Date.now(),
      tools: Object.values(SYSTEM_TOOLS),
    }),
  )

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message)
      await handleWebSocketMessage(clientId, data, ws)
    } catch (error) {
      console.error('WebSocket消息处理错误:', error)
      ws.send(
        JSON.stringify({
          type: MCP_MESSAGE_TYPES.ERROR,
          error: error.message,
        }),
      )
    }
  })

  ws.on('close', () => {
    wsConnections.delete(clientId)
    console.log(`WebSocket客户端 ${clientId} 断开连接`)
  })

  ws.on('error', (error) => {
    console.error(`WebSocket客户端 ${clientId} 错误:`, error)
    wsConnections.delete(clientId)
  })
})

// 处理WebSocket消息
async function handleWebSocketMessage(clientId, data, ws) {
  const { type, tool, parameters, message } = data

  switch (type) {
    case MCP_MESSAGE_TYPES.TOOLS_CALL:
      await handleToolCall(clientId, tool, parameters, ws)
      break

    case 'chat':
      await handleChatMessage(clientId, message, ws)
      break

    default:
      ws.send(
        JSON.stringify({
          type: MCP_MESSAGE_TYPES.ERROR,
          error: `未知的消息类型: ${type}`,
        }),
      )
  }
}

// 处理工具调用
async function handleToolCall(clientId, toolName, parameters, ws) {
  // 查找匹配的工具
  const tool = Object.values(SYSTEM_TOOLS).find((t) => t.name === toolName)

  if (!tool) {
    ws.send(
      JSON.stringify({
        type: MCP_MESSAGE_TYPES.ERROR,
        error: `未知的工具: ${toolName}`,
      }),
    )
    return
  }

  try {
    // 调用相应的工具处理函数
    const result = await executeTool(toolName, parameters)

    ws.send(
      JSON.stringify({
        type: MCP_MESSAGE_TYPES.TOOLS_RESULT,
        tool: toolName,
        result,
        timestamp: Date.now(),
      }),
    )

    // 通过SSE广播结果
    broadcastSSEMessage({
      type: 'tool_result',
      tool: toolName,
      result,
      clientId,
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error(`工具调用错误 (${toolName}):`, error)

    ws.send(
      JSON.stringify({
        type: MCP_MESSAGE_TYPES.ERROR,
        error: error.message,
        tool: toolName,
      }),
    )
  }
}

// 处理聊天消息
async function handleChatMessage(clientId, message, ws) {
  try {
    // 首先检查用户意图，判断是否需要调用工具
    const intent = await analyzeUserIntent(message)
    const viewshedIntent = analyzeViewshedIntent(message)

    // 处理可视域分析请求 - 直接调用工具，不再请求交互
    if (viewshedIntent.isViewshedRequest) {
      const toolStartingMessage =
        '您想进行可视域分析，我将为您调用空间分析功能来完成这项任务。\n\n正在启动可视域分析工具...'

      ws.send(
        JSON.stringify({
          type: 'chat_response',
          response: toolStartingMessage,
          timestamp: Date.now(),
        }),
      )

      // 通过SSE广播聊天响应
      broadcastSSEMessage({
        type: 'chat_response',
        response: toolStartingMessage,
        clientId,
        timestamp: Date.now(),
      })

      // 延迟一下，然后调用可视域分析工具
      setTimeout(async () => {
        await handleToolCall(
          clientId,
          'viewshed_analysis',
          viewshedIntent.parameters || {},
          ws,
        )
      }, 1000)

      return
    }

    if (intent.shouldCallTool) {
      console.log(
        `🔧 检测到用户意图，调用工具: ${intent.toolName}`,
        intent.parameters,
      )

      // 先发送一个聊天响应，告知用户正在启动工具
      const toolStartingMessage = `您想对当前模型进行${getToolDisplayName(intent.toolName)}，我将为您调用空间分析功能来完成这项任务。\n\n正在启动${getToolDisplayName(intent.toolName)}工具...`

      ws.send(
        JSON.stringify({
          type: 'chat_response',
          response: toolStartingMessage,
          timestamp: Date.now(),
        }),
      )

      // 通过SSE广播聊天响应
      broadcastSSEMessage({
        type: 'chat_response',
        response: toolStartingMessage,
        clientId,
        timestamp: Date.now(),
      })

      // 延迟一下，然后调用相应的工具
      setTimeout(async () => {
        await handleToolCall(clientId, intent.toolName, intent.parameters, ws)
      }, 1000)

      return
    }

    // 使用AI生成响应
    const systemPrompt = `你是一个专业的实景三维时空分析智能助手，能够理解用户在三维地理空间环境中的操作意图，并调用相应的分析工具完成任务。

## 核心能力概述

你具备以下专业能力，能够帮助用户完成复杂的三维空间分析任务：

### 1. 三维模型管理
- **模型加载与显示**：支持加载各种格式的三维模型到场景中
- **模型定位与查看**：快速定位到特定模型进行详细观察

### 2. 高级空间分析
- **可视域分析**：分析从特定观察点能够看到的区域范围
- **通视分析**：判断两点之间是否存在视线遮挡
- **剖面分析**：沿指定路径生成地形或建筑的垂直剖面
- **阴影分析**：基于时间计算建筑物或地形的阴影分布
- **天际线分析**：分析城市轮廓和建筑高度分布

### 3. 导航与漫游
- **室内导航**：在建筑内部规划最优路径
- **场景漫游**：提供自由浏览和探索功能

### 4. 视觉效果调整
- **光照设置**：调整场景的光照强度和色温
- **特效控制**：管理泛光等视觉特效

## 详细工具说明

以下是你可以调用的具体工具，每个工具都有详细的功能描述和使用场景：

### 模型管理工具
1. **load_model(model_id: str)**
   - **功能**：加载指定ID的三维模型到当前场景
   - **使用场景**：当用户需要查看特定建筑或对象时
   - **示例**：用户说"加载教学楼模型"或"打开体育馆"

2. **fly_to_model(model_id: str)**
   - **功能**：将视角平滑飞行到指定模型位置
   - **使用场景**：快速定位到感兴趣的模型进行观察
   - **示例**：用户说"飞到图书馆"或"定位到行政楼"

### 导航与漫游工具
3. **indoor_navigation(start: str, end: str)**
   - **功能**：在室内环境中规划并引导从起点到终点的路径
   - **使用场景**：帮助用户在建筑内部找到路线
   - **示例**：用户说"从一楼大厅到三楼会议室怎么走"

4. **roaming(enable: bool)**
   - **功能**：开启或关闭自由漫游模式
   - **使用场景**：让用户自由探索三维场景
   - **示例**：用户说"开始漫游"或"自由浏览"

### 空间分析工具
5. **profile_analysis(line_coords: List[Tuple[float, float]])**
   - **功能**：沿指定线段进行地形或建筑剖面分析
   - **使用场景**：分析地形起伏或建筑内部结构
   - **示例**：用户说"做一条从A到B的剖面分析"

6. **viewshed_analysis(observer: Tuple[float, float, float])**
   - **功能**：以指定观察点进行可视域分析
   - **使用场景**：分析监控视野或观景点效果
   - **示例**：用户说"分析这个点的可视范围"

7. **sightline_analysis(point_a: Tuple[float, float, float], point_b: Tuple[float, float, float])**
   - **功能**：分析两点间是否通视
   - **使用场景**：判断视线是否被遮挡
   - **示例**：用户说"检查A点和B点是否通视"

8. **shadow_analysis(datetime: str, geometry_id: str)**
   - **功能**：基于指定时间与对象计算阴影分布
   - **使用场景**：分析日照影响或阴影变化
   - **示例**：用户说"分析下午3点的阴影情况"

9. **skyline_analysis(viewpoint: Tuple[float, float, float], direction: float)**
   - **功能**：从指定视点与方向分析城市天际线
   - **使用场景**：城市规划或景观设计分析
   - **示例**：用户说"分析这个方向的城市轮廓"

### 系统控制工具
10. **clear_analysis()**
    - **功能**：清除当前所有分析结果与临时图层
    - **使用场景**：清理场景，准备新的分析
    - **示例**：用户说"清除所有分析结果"

11. **lighting_settings(intensity: float, color_temp: int)**
    - **功能**：调整场景光照强度与色温
    - **使用场景**：优化场景视觉效果
    - **示例**：用户说"调亮一点"或"调整光照"

12. **bloom_effect(enabled: bool, intensity: float)**
   - **功能**：启用/关闭泛光效果并调节强度
   - **使用场景**：增强场景的视觉表现力
   - **示例**：用户说"开启泛光效果"

### 数据库管理工具
13. **db_get_all_models()**
   - **功能**：获取数据库中所有模型的列表
   - **使用场景**：用户想查看所有已管理的模型
   - **示例**：用户说"列出所有模型"或"查看模型列表"

14. **db_get_model(model_id: str)**
   - **功能**：获取指定ID模型的详细信息
   - **使用场景**：用户想查看某个模型的详细属性
   - **示例**：用户说"查看模型A的详细信息"

15. **db_search_models(query: str)**
   - **功能**：根据关键词搜索模型
   - **使用场景**：用户想查找特定名称或描述的模型
   - **示例**：用户说"搜索建筑模型"或"找找办公楼"

16. **db_add_model(name: str, category: str, description: str, file_path: str, properties: object, tags: list, color: str)**
   - **功能**：添加新模型到数据库
   - **使用场景**：用户想将新模型信息添加到管理系统
   - **示例**：用户说"添加一个教学楼模型"

17. **db_update_model(model_id: str, updates: object)**
   - **功能**：更新已有模型的信息
   - **使用场景**：用户想修改模型的名称、描述等属性
   - **示例**：用户说"更新模型A的信息"

18. **db_delete_model(model_id: str)**
   - **功能**：从数据库删除指定模型
   - **使用场景**：用户想删除某个模型记录
   - **示例**：用户说"删除模型A"

19. **db_get_by_category(category: str)**
   - **功能**：按分类获取模型列表
   - **使用场景**：用户想查看某一类别的所有模型
   - **示例**：用户说"查看所有建筑模型"

20. **db_get_statistics()**
   - **功能**：获取模型数据库的统计信息
   - **使用场景**：用户想了解数据库中有多少模型及分类情况
   - **示例**：用户说"查看统计信息"

21. **highlight_model(model_id: str, color: str, intensity: float, blinking: bool)**
   - **功能**：高亮显示指定模型
   - **使用场景**：用户想突出显示某个模型便于识别
   - **示例**：用户说"高亮显示教学楼"

22. **clear_highlight(model_id: str)**
   - **功能**：清除模型的高亮显示效果
   - **使用场景**：用户想取消高亮显示
   - **示例**：用户说"取消高亮"

### SQLite 数据库操作工具
23. **sql_connect(db_path: str)**
   - **功能**：连接SQLite数据库文件
   - **使用场景**：用户想连接已有的SQLite数据库进行操作
   - **示例**：用户说"连接数据库 data/app.db"

24. **sql_connect_memory(name: str)**
   - **功能**：创建内存数据库（临时使用）
   - **使用场景**：用户想创建临时数据库进行测试或缓存数据
   - **示例**：用户说"创建内存数据库"

25. **sql_disconnect(conn_id: str)**
   - **功能**：断开数据库连接
   - **使用场景**：用户想断开当前数据库连接
   - **示例**：用户说"断开数据库连接"

26. **sql_execute(sql: str, params: list)**
   - **功能**：执行SQL语句
   - **使用场景**：用户想执行SQL查询或更新操作
   - **示例**：用户说"执行 SELECT * FROM users"

27. **sql_get_tables()**
   - **功能**：获取数据库中所有表
   - **使用场景**：用户想查看数据库中有哪些表
   - **示例**：用户说"查看所有表"

28. **sql_get_table_info(table_name: str)**
   - **功能**：获取指定表的结构信息
   - **使用场景**：用户想查看表有哪些字段
   - **示例**：用户说"查看users表结构"

29. **sql_status()**
   - **功能**：获取数据库连接状态
   - **使用场景**：用户想查看当前数据库连接情况
   - **示例**：用户说"查看数据库状态"

## 交互规则

1. **工具调用原则**：若用户请求明确对应某个工具，请直接生成符合MCP协议格式的工具调用
2. **意图澄清**：若用户意图模糊，请先澄清需求（例如："请问您想分析哪个区域的可视范围？"）
3. **参数准确性**：不要自行执行未提供的工具，也不要编造参数
4. **结果解释**：在完成分析后，可简要解释结果含义，但优先确保工具调用准确
5. **智能判断**：请根据用户输入，智能判断并执行最合适的操作

## 响应格式示例

当用户说"飞到图书馆"时，你应该响应：
{"tool": "fly_to_model", "arguments": {"model_id": "library"}}

当用户说"分析这个点的可视范围"时，你应该响应：
{"tool": "viewshed_analysis", "arguments": {"observer": [经度, 纬度, 高度]}}

请根据用户的具体需求，选择最合适的工具并提供准确的参数。

用户消息：${message}`

    const response = await callOllamaAPI(systemPrompt)

    ws.send(
      JSON.stringify({
        type: 'chat_response',
        response,
        timestamp: Date.now(),
      }),
    )

    // 通过SSE广播聊天响应
    broadcastSSEMessage({
      type: 'chat_response',
      response,
      clientId,
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error('聊天消息处理错误:', error)

    ws.send(
      JSON.stringify({
        type: MCP_MESSAGE_TYPES.ERROR,
        error: 'AI服务暂时不可用',
      }),
    )
  }
}

// 获取工具显示名称
function getToolDisplayName(toolName) {
  const toolNames = {
    load_model: '加载模型',
    fly_to_model: '飞行到模型',
    indoor_navigation: '室内导航',
    roaming: '漫游',
    profile_analysis: '剖面分析',
    viewshed_analysis: '可视域分析',
    sightline_analysis: '通视分析',
    shadow_analysis: '阴影分析',
    skyline_analysis: '天际线分析',
    clear_analysis: '清除分析',
    lighting_settings: '光照设置',
    bloom_effect: '泛光效果',
  }
  return toolNames[toolName] || toolName
}

// 处理可视域分析交互
async function handleViewshedInteraction(message) {
  try {
    console.log('处理可视域分析交互:', message)

    return {
      type: 'interactive_analysis',
      analysis_type: 'viewshed',
      message:
        '检测到您需要进行可视域分析交互操作。请在地图上点击选择观察点位置，我将为您进行可视域分析。\n\n正在启动可视域分析交互模式...',
      requires_interaction: true,
      interaction_type: 'viewshed_selection',
      parameters: {
        observer_height: 1.7,
        radius: 1000,
        pitch: -30,
        heading: 0,
      },
      instructions: [
        '1. 点击地图上的任意位置设置观察点',
        '2. 系统将自动计算该点的可视范围',
        '3. 您可以在分析完成后调整参数或结束分析',
      ],
      timestamp: Date.now(),
    }
  } catch (error) {
    console.error('处理可视域分析交互失败:', error)
    return {
      error: true,
      message: '处理可视域分析交互时发生错误',
      details: error.message,
    }
  }
}

// 处理空间分析
async function handleSpatialAnalysis(message, analysisType) {
  try {
    console.log('处理空间分析:', { analysisType, message })

    // 根据分析类型返回不同的响应
    switch (analysisType) {
      case 'viewshed':
        return {
          type: 'spatial_analysis',
          analysis_type: 'viewshed',
          message: '正在启动可视域分析，请点击设置观察点',
          requires_interaction: true,
          timestamp: Date.now(),
        }
      case 'sightline':
        return {
          type: 'spatial_analysis',
          analysis_type: 'sightline',
          message: '正在启动通视分析，请依次点击设置起点和终点',
          requires_interaction: true,
          timestamp: Date.now(),
        }
      case 'profile':
        return {
          type: 'spatial_analysis',
          analysis_type: 'profile',
          message: '正在启动剖面分析，请点击设置剖面线路径',
          requires_interaction: true,
          timestamp: Date.now(),
        }
      case 'shadow':
        return {
          type: 'spatial_analysis',
          analysis_type: 'shadow',
          message: '阴影分析功能开发中，敬请期待',
          timestamp: Date.now(),
        }
      case 'skyline':
        return {
          type: 'spatial_analysis',
          analysis_type: 'skyline',
          message: '天际线分析功能开发中，敬请期待',
          timestamp: Date.now(),
        }
      default:
        return {
          type: 'spatial_analysis',
          analysis_type: 'unknown',
          message: '未知的空间分析类型',
          timestamp: Date.now(),
        }
    }
  } catch (error) {
    console.error('处理空间分析失败:', error)
    return {
      error: true,
      message: '处理空间分析时发生错误',
      details: error.message,
    }
  }
}

// 分析用户意图
async function analyzeUserIntent(message) {
  const lowerMessage = message.toLowerCase()

  // 首先检查是否为询问类问题（不应触发工具调用）
  const inquiryKeywords = [
    '什么是',
    '什么是',
    '原理',
    '原理是什么',
    '基本原理',
    '基本思想',
    '概念',
    '定义',
    '介绍',
    '解释',
    '说明',
    '如何工作',
    '怎么工作',
    '工作机制',
    '工作流程',
  ]
  const questionPatterns = [
    /什么是/i,
    /什么是/i,
    /原理.*什么/i,
    /如何.*工作/i,
    /怎么.*工作/i,
    /介绍.*一下/i,
    /解释.*一下/i,
  ]

  // 如果检测到是询问类问题，直接返回不调用工具
  if (
    inquiryKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
    questionPatterns.some((pattern) => pattern.test(message))
  ) {
    return { shouldCallTool: false }
  }

  // 基础操作关键词
  const loadKeywords = ['加载', '导入', '打开']
  const loadModelSpecificKeywords = [
    '加载模型',
    '导入模型',
    '打开模型',
    '载入模型',
    '显示模型',
  ]
  const flyKeywords = ['飞行', '飞到', '定位']
  const translateKeywords = [
    '平移',
    '移动',
    '位移',
    '位置调整',
    'translate',
    'move',
  ]
  const rotateKeywords = ['旋转', '转动', '方向调整', '角度', 'rotate', 'turn']
  const scaleKeywords = [
    '缩放',
    '大小调整',
    '比例',
    'scale',
    'resize',
    '放大',
    '缩小',
    '调整大小',
    '调整模型大小',
    '放大缩小',
    '缩放比例',
    'scale_factor',
    '放大倍数',
    '缩小倍数',
  ]

  // 导航与漫游关键词
  const navigationKeywords = ['导航', '路线', '规划', '指引', '室内', '楼层']
  const roamingKeywords = ['漫游', '浏览', '自由', '行走', '移动']

  // 执行意图关键词（表示用户想要执行操作）
  const executionKeywords = [
    '执行',
    '进行',
    '开始',
    '启动',
    '做',
    '完成',
    '实现',
    '分析',
    '计算',
    '生成',
    '绘制',
    '显示',
    '展示',
    '调用',
    '使用',
    '应用',
  ]

  // 询问意图关键词（表示用户想要获取信息）
  const inquiryIntentKeywords = [
    '了解',
    '学习',
    '知道',
    '懂得',
    '明白',
    '理解',
    '掌握',
    '熟悉',
    '认识',
    '清楚',
    '明白',
    '懂',
    '想了解',
    '想知道',
    '想学习',
    '想掌握',
  ]

  // 空间分析关键词
  const profileKeywords = ['剖面', '断面', '切面', '剖面图']
  const viewshedKeywords = ['可视域', '视野', '可视范围', '可见范围']
  const sightlineKeywords = ['通视', '视线', '通视分析', '视线分析']
  const shadowKeywords = ['阴影', '影子', '阴影分析']
  const sunlightKeywords = [
    '日照效果',
    '日照模拟',
    '太阳轨迹',
    '光照变化',
    '日照分析',
    '太阳运动',
    '日照',
  ]
  const skylineKeywords = ['天际线', '轮廓', '天际线分析']

  // 测量分析关键词
  const distanceMeasureKeywords = [
    '距离测量',
    '测距',
    '测量距离',
    '量距离',
    '长度测量',
    '测量长度',
  ]
  const areaMeasureKeywords = ['面积测量', '测面积', '测量面积', '量面积']
  const heightMeasureKeywords = [
    '高度测量',
    '测高',
    '测量高度',
    '量高度',
    '高差测量',
  ]
  const clearMeasureKeywords = [
    '清除测量',
    '清除所有测量',
    '清理测量',
    '删除测量',
  ]

  // 系统控制关键词
  const clearKeywords = ['清除', '清理', '重置', '删除']
  const lightingKeywords = ['光照', '灯光', '照明', '亮度']
  const bloomKeywords = ['泛光', '光晕', '辉光', '特效']

  // 可视域分析增强工具关键词
  const clipPlaneKeywords = ['裁剪面', '裁剪', , , 'clip', 'plane']
  const propertyEditKeywords = [
    '属性',
    '参数',
    '设置',
    '修改',
    '调整',
    '改为',
    '改成',
    'property',
    'edit',
    'parameter',
  ]

  // 检查基础操作关键词 - 模型加载（精确匹配）
  if (
    loadModelSpecificKeywords.some((keyword) => lowerMessage.includes(keyword))
  ) {
    return {
      shouldCallTool: true,
      toolName: 'load_model',
      parameters: {
        model_path: getModelPath(lowerMessage),
        model_name: getModelName(lowerMessage),
      },
    }
  }

  // 检查基础操作关键词 - 包含"加载"和"模型"的组合
  if (
    lowerMessage.includes('加载') &&
    lowerMessage.includes('模型') &&
    !lowerMessage.includes('什么是') &&
    !lowerMessage.includes('定义') &&
    !lowerMessage.includes('介绍') &&
    !lowerMessage.includes('解释')
  ) {
    return {
      shouldCallTool: true,
      toolName: 'load_model',
      parameters: {
        model_path: getModelPath(lowerMessage),
        model_name: getModelName(lowerMessage),
      },
    }
  }

  // 检查基础操作关键词 - 普通加载（不包含模型相关词汇）
  if (
    loadKeywords.some((keyword) => lowerMessage.includes(keyword)) &&
    !lowerMessage.includes('模型') &&
    !lowerMessage.includes('什么是') &&
    !lowerMessage.includes('三维') &&
    !lowerMessage.includes('3d')
  ) {
    return {
      shouldCallTool: true,
      toolName: 'load_model',
      parameters: {
        model_path: getModelPath(lowerMessage),
        model_name: getModelName(lowerMessage),
      },
    }
  }

  if (flyKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    return {
      shouldCallTool: true,
      toolName: 'fly_to_model',
      parameters: {
        model_id: 'current',
        duration: 3,
      },
    }
  }

  // 检查基础操作关键词 - 平移 - 智能判断执行意图
  if (translateKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    // 如果包含询问类关键词，不触发工具调用
    if (
      inquiryKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return { shouldCallTool: false }
    }

    // 如果包含执行意图关键词，或者明确请求执行平移
    const hasExecutionIntent =
      executionKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      /平移.*模型|移动.*模型|调整.*位置/i.test(message)

    if (
      hasExecutionIntent ||
      !inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      const translation = extractTranslationFromMessage(message)
      return {
        shouldCallTool: true,
        toolName: 'translate_model',
        parameters: {
          model_id: 'default',
          x: translation.x || 0,
          y: translation.y || 0,
          z: translation.z || 0,
        },
      }
    }

    return { shouldCallTool: false }
  }

  // 检查基础操作关键词 - 旋转 - 智能判断执行意图
  if (rotateKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    // 如果包含询问类关键词，不触发工具调用
    if (
      inquiryKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return { shouldCallTool: false }
    }

    // 如果包含执行意图关键词，或者明确请求执行旋转
    const hasExecutionIntent =
      executionKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      /旋转.*模型|转动.*模型|调整.*角度/i.test(message)

    if (
      hasExecutionIntent ||
      !inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      const rotation = extractRotationFromMessage(message)
      return {
        shouldCallTool: true,
        toolName: 'rotate_model',
        parameters: {
          model_id: 'default',
          x: rotation.x || 0,
          y: rotation.y || 0,
          z: rotation.z || 0,
        },
      }
    }

    return { shouldCallTool: false }
  }

  // 检查基础操作关键词 - 缩放 - 智能判断执行意图
  if (scaleKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    // 如果包含询问类关键词，不触发工具调用
    if (
      inquiryKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return { shouldCallTool: false }
    }

    // 如果包含执行意图关键词，或者明确请求执行缩放
    const hasExecutionIntent =
      executionKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      /缩放.*模型|调整.*大小|放大.*模型|缩小.*模型/i.test(message)

    if (
      hasExecutionIntent ||
      !inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      const scaleFactor = extractScaleFromMessage(message)
      return {
        shouldCallTool: true,
        toolName: 'scale_model',
        parameters: {
          model_id: 'default',
          scale_factor: scaleFactor || 1.0,
        },
      }
    }

    return { shouldCallTool: false }
  }

  // 检查导航与漫游关键词 - 智能判断执行意图
  if (navigationKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    // 如果包含询问类关键词，不触发工具调用
    if (
      inquiryKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return { shouldCallTool: false }
    }

    // 如果包含执行意图关键词，或者明确请求执行导航
    const hasExecutionIntent =
      executionKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      /导航.*规划|规划.*导航|做.*导航|进行.*导航|开始.*导航/i.test(message)

    if (
      hasExecutionIntent ||
      !inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return {
        shouldCallTool: true,
        toolName: 'indoor_navigation',
        parameters: {
          start_point: getDefaultPosition(),
          end_point: getDefaultPosition(),
        },
      }
    }

    return { shouldCallTool: false }
  }

  // 漫游 - 智能判断执行意图
  if (roamingKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    // 如果包含询问类关键词，不触发工具调用
    if (
      inquiryKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return { shouldCallTool: false }
    }

    // 如果包含执行意图关键词，或者明确请求执行漫游
    const hasExecutionIntent =
      executionKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      /开始.*漫游|启动.*漫游|进行.*漫游/i.test(message)

    if (
      hasExecutionIntent ||
      !inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return {
        shouldCallTool: true,
        toolName: 'roaming',
        parameters: {
          roaming_mode: 'free',
          speed: 1,
        },
      }
    }

    return { shouldCallTool: false }
  }

  // 剖面分析 - 智能判断执行意图
  if (profileKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    // 如果包含询问类关键词，不触发工具调用
    if (
      inquiryKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return { shouldCallTool: false }
    }

    // 如果包含执行意图关键词，或者明确请求执行分析
    const hasExecutionIntent =
      executionKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      /分析.*剖面|剖面.*分析|做.*剖面|进行.*剖面/i.test(message)

    if (
      hasExecutionIntent ||
      !inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return {
        shouldCallTool: true,
        toolName: 'profile_analysis',
        parameters: {
          start_point: getDefaultPosition(),
          end_point: getDefaultPosition(),
        },
      }
    }

    return { shouldCallTool: false }
  }

  // 可视域分析 - 智能判断执行意图
  if (viewshedKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    // 如果包含询问类关键词，不触发工具调用
    if (
      inquiryKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return { shouldCallTool: false }
    }

    // 检查是否包含属性编辑关键词，如果是则优先处理属性编辑
    const hasPropertyEditIntent = propertyEditKeywords.some((keyword) =>
      lowerMessage.includes(keyword),
    )
    if (hasPropertyEditIntent) {
      return { shouldCallTool: false }
    }

    // 如果包含执行意图关键词，或者明确请求执行分析
    const hasExecutionIntent =
      executionKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      /分析.*可视域|可视域.*分析|做.*可视域|进行.*可视域|执行.*可视域|开始.*可视域/i.test(
        message,
      )

    if (
      hasExecutionIntent ||
      !inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return {
        shouldCallTool: true,
        toolName: 'viewshed_analysis',
        parameters: {
          observer_position: getDefaultPosition(),
          radius: 1000,
          observer_height: 1.7,
        },
      }
    }

    return { shouldCallTool: false }
  }

  // 通视分析 - 智能判断执行意图
  if (sightlineKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    // 如果包含询问类关键词，不触发工具调用
    if (
      inquiryKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return { shouldCallTool: false }
    }

    // 如果包含执行意图关键词，或者明确请求执行分析
    const hasExecutionIntent =
      executionKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      /分析.*通视|通视.*分析|做.*通视|进行.*通视/i.test(message)

    if (
      hasExecutionIntent ||
      !inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return {
        shouldCallTool: true,
        toolName: 'sightline_analysis',
        parameters: {
          start_point: getDefaultPosition(),
          end_point: getDefaultPosition(),
        },
      }
    }

    return { shouldCallTool: false }
  }

  // 阴影分析 - 智能判断执行意图
  if (shadowKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    // 如果包含询问类关键词，不触发工具调用
    if (
      inquiryKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return { shouldCallTool: false }
    }

    // 如果包含执行意图关键词，或者明确请求执行分析
    const hasExecutionIntent =
      executionKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      /分析.*阴影|阴影.*分析|做.*阴影|进行.*阴影/i.test(message)

    if (
      hasExecutionIntent ||
      !inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      // 提取时间信息
      const timeInfo = extractTimeFromMessage(message)

      return {
        shouldCallTool: true,
        toolName: 'shadow_analysis',
        parameters: {
          analysis_time: timeInfo.time || getCurrentTime(),
          duration: timeInfo.duration || 2,
        },
      }
    }

    return { shouldCallTool: false }
  }

  // 日照分析 - 智能判断执行意图
  if (sunlightKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    // 如果包含询问类关键词，不触发工具调用
    if (
      inquiryKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return { shouldCallTool: false }
    }

    // 如果包含执行意图关键词，或者明确请求执行分析
    const hasExecutionIntent =
      executionKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      /分析.*日照|日照.*分析|做.*日照|进行.*日照/i.test(message)

    if (
      hasExecutionIntent ||
      !inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      // 提取时间范围信息
      const timeRangeInfo = extractTimeRangeFromMessage(message)

      return {
        shouldCallTool: true,
        toolName: 'sunlight_effect',
        parameters: {
          start_time: timeRangeInfo.startTime || '08:00',
          end_time: timeRangeInfo.endTime || '18:00',
          time_range: timeRangeInfo.timeRange || '10小时',
          date: new Date().toISOString().split('T')[0],
          animation_speed: 1,
        },
      }
    }

    return { shouldCallTool: false }
  }

  // 可视域属性编辑工具 - 优先级高于天际线分析
  if (propertyEditKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    // 检查是否包含可视域相关参数关键词
    const hasViewshedParams =
      /(方向|方向角|方位角|heading|direction|距离|观察距离|可视距离|distance|radius|俯仰|俯仰角|pitch|仰角|水平|水平视角|水平视场角|horizontal|hfov|垂直|垂直视角|垂直视场角|vertical|vfov)/i.test(
        lowerMessage,
      )

    // 如果包含可视域相关参数关键词，或者明确提到可视域
    if (
      hasViewshedParams ||
      lowerMessage.includes('可视域') ||
      lowerMessage.includes('viewshed')
    ) {
      // 提取属性修改参数
      const params = extractViewshedPropertyParameters(lowerMessage)

      // 只有当成功提取到参数时才调用工具
      if (Object.keys(params).length > 0) {
        return {
          shouldCallTool: true,
          toolName: 'viewshed_property_edit',
          parameters: params,
        }
      }
    }
  }

  // 天际线分析 - 智能判断执行意图
  if (skylineKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    // 如果包含询问类关键词，不触发工具调用
    if (
      inquiryKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return { shouldCallTool: false }
    }

    // 检查是否是查看二维天际线的请求
    const isView2DRequest =
      /查看.*二维天际线|显示.*二维天际线|二维天际线.*查看|二维天际线.*显示/i.test(
        message,
      )

    if (isView2DRequest) {
      // 如果是查看二维天际线的请求
      return {
        shouldCallTool: true,
        toolName: 'skyline_2d_view',
        parameters: {},
      }
    }

    // 如果包含执行意图关键词，或者明确请求执行分析
    const hasExecutionIntent =
      executionKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      /分析.*天际线|天际线.*分析|做.*天际线|进行.*天际线/i.test(message)

    if (
      hasExecutionIntent ||
      !inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      // 提取天际线分析参数
      const parameters = extractSkylineParameters(message)
      return {
        shouldCallTool: true,
        toolName: 'skyline_analysis',
        parameters: parameters,
      }
    }

    return { shouldCallTool: false }
  }

  // 测量分析关键词匹配 - 距离测量
  if (
    distanceMeasureKeywords.some((keyword) => lowerMessage.includes(keyword))
  ) {
    return {
      shouldCallTool: true,
      toolName: 'distance_measure',
      parameters: {
        mode: 'point_to_point',
      },
    }
  }

  // 测量分析关键词匹配 - 面积测量
  if (areaMeasureKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    return {
      shouldCallTool: true,
      toolName: 'area_measure',
      parameters: {
        mode: 'surface',
      },
    }
  }

  // 测量分析关键词匹配 - 高度测量
  if (heightMeasureKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    return {
      shouldCallTool: true,
      toolName: 'height_measure',
      parameters: {},
    }
  }

  // 测量分析关键词匹配 - 清除测量
  if (clearMeasureKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    return {
      shouldCallTool: true,
      toolName: 'clear_measure',
      parameters: {
        measure_type: 'all',
      },
    }
  }

  // 检查系统控制关键词 - 智能判断执行意图
  if (clearKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    // 如果包含询问类关键词，不触发工具调用
    if (
      inquiryKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return { shouldCallTool: false }
    }

    // 如果包含执行意图关键词，或者明确请求执行清除
    const hasExecutionIntent =
      executionKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      /清除.*分析|清理.*分析|清空.*分析/i.test(message)

    if (
      hasExecutionIntent ||
      !inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return {
        shouldCallTool: true,
        toolName: 'clear_analysis',
        parameters: {
          clear_type: 'all',
        },
      }
    }

    return { shouldCallTool: false }
  }

  if (lightingKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    // 如果包含询问类关键词，不触发工具调用
    if (
      inquiryKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return { shouldCallTool: false }
    }

    // 如果包含执行意图关键词，或者明确请求设置光照
    const hasExecutionIntent =
      executionKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      /设置.*光照|调整.*光照|修改.*光照/i.test(message)

    if (
      hasExecutionIntent ||
      !inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return {
        shouldCallTool: true,
        toolName: 'lighting_settings',
        parameters: {
          lighting_type: 'sun',
          intensity: 1,
          color: '#ffffff',
        },
      }
    }

    return { shouldCallTool: false }
  }

  if (bloomKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    // 如果包含询问类关键词，不触发工具调用
    if (
      inquiryKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return { shouldCallTool: false }
    }

    // 如果包含执行意图关键词，或者明确请求设置bloom效果
    const hasExecutionIntent =
      executionKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
      /设置.*bloom|调整.*bloom|开启.*bloom|关闭.*bloom/i.test(message)

    if (
      hasExecutionIntent ||
      !inquiryIntentKeywords.some((keyword) => lowerMessage.includes(keyword))
    ) {
      return {
        shouldCallTool: true,
        toolName: 'bloom_effect',
        parameters: {
          enabled: true,
          intensity: 0.5,
          threshold: 0.8,
        },
      }
    }

    return { shouldCallTool: false }
  }

  // 检查可视域分析增强工具关键词
  // 裁剪面绘制工具
  if (
    clipPlaneKeywords.some((keyword) => lowerMessage.includes(keyword)) &&
    (lowerMessage.includes('可视域') || lowerMessage.includes('viewshed'))
  ) {
    return {
      shouldCallTool: true,
      toolName: 'viewshed_clip_plane',
      parameters: {
        clip_mode: 'custom',
        clip_plane_enabled: true,
      },
    }
  }

  // 数据库管理关键词
  const dbListKeywords = [
    '列出所有模型',
    '查看模型列表',
    '所有模型',
    '模型列表',
    '查看所有',
  ]
  const dbSearchKeywords = ['搜索', '查找', '找找', '查询']
  const dbAddKeywords = ['添加模型', '新增模型', '加入模型']
  const dbDeleteKeywords = ['删除模型', '移除模型']
  const dbUpdateKeywords = ['更新模型', '修改模型', '编辑模型']
  const dbCategoryKeywords = ['分类', '类别', '类型']
  const dbStatsKeywords = ['统计', '统计信息', '数据库统计', '模型统计']
  const highlightKeywords = ['高亮', '高亮显示', '突出显示', '标红']
  const clearHighlightKeywords = ['清除高亮', '取消高亮', '取消显示']

  // 检查数据库管理功能
  if (dbListKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    return {
      shouldCallTool: true,
      toolName: 'db_get_all_models',
      parameters: {},
    }
  }

  if (dbSearchKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    const query = message.replace(/.*搜索|.*查找|.*找找|.*查询/, '').trim()
    return {
      shouldCallTool: true,
      toolName: 'db_search_models',
      parameters: { query: query || message },
    }
  }

  if (dbStatsKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    return {
      shouldCallTool: true,
      toolName: 'db_get_statistics',
      parameters: {},
    }
  }

  if (dbCategoryKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    const category = message.replace(/.*分类|.*类别|.*类型/, '').trim()
    return {
      shouldCallTool: true,
      toolName: 'db_get_by_category',
      parameters: { category: category || '建筑' },
    }
  }

  // 添加模型
  if (dbAddKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    const params = extractModelParamsFromMessage(message)
    return {
      shouldCallTool: true,
      toolName: 'db_add_model',
      parameters: params,
    }
  }

  // 删除模型
  if (dbDeleteKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    const modelIdOrName = message
      .replace(/.*删除|.*移除/, '')
      .replace(/模型/, '')
      .trim()
    return {
      shouldCallTool: true,
      toolName: 'db_delete_model',
      parameters: { model_id: modelIdOrName || '1' },
    }
  }

  // 更新模型
  if (dbUpdateKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    const { model_id, updates } = extractModelUpdateParamsFromMessage(message)
    return {
      shouldCallTool: true,
      toolName: 'db_update_model',
      parameters: { model_id, updates },
    }
  }

  if (highlightKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    return {
      shouldCallTool: true,
      toolName: 'highlight_model',
      parameters: {
        model_id: 'model_1',
        color: '#FF0000',
        intensity: 1,
        blinking: false,
      },
    }
  }

  if (
    clearHighlightKeywords.some((keyword) => lowerMessage.includes(keyword))
  ) {
    return {
      shouldCallTool: true,
      toolName: 'clear_highlight',
      parameters: { model_id: '' },
    }
  }

  // SQLite 数据库操作关键词
  const sqlConnectKeywords = [
    '连接数据库',
    '连接sqlite',
    '打开数据库',
    '连接sql',
  ]
  const sqlMemoryKeywords = ['内存数据库', '临时数据库', '创建数据库']
  const sqlDisconnectKeywords = ['断开数据库', '关闭数据库', '断开连接']
  const sqlExecuteKeywords = [
    '执行sql',
    '执行sql语句',
    '运行sql',
    '查询数据库',
    'sql查询',
  ]
  const sqlTablesKeywords = ['查看表', '查看所有表', '表列表', '有哪些表']
  const sqlStatusKeywords = ['数据库状态', '连接状态', '查看连接']

  // SQLite 数据库操作
  if (sqlConnectKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    const dbPath =
      message
        .replace(/.*连接.*数据库|.*打开.*数据库|.*连接.*sqlite|.*连接.*sql/, '')
        .trim() || 'data/app.db'
    return {
      shouldCallTool: true,
      toolName: 'sql_connect',
      parameters: { db_path: dbPath },
    }
  }

  if (sqlMemoryKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    return {
      shouldCallTool: true,
      toolName: 'sql_connect_memory',
      parameters: { name: 'temp_db' },
    }
  }

  if (sqlDisconnectKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    return {
      shouldCallTool: true,
      toolName: 'sql_disconnect',
      parameters: {},
    }
  }

  if (sqlStatusKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    return {
      shouldCallTool: true,
      toolName: 'sql_status',
      parameters: {},
    }
  }

  if (sqlTablesKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    return {
      shouldCallTool: true,
      toolName: 'sql_get_tables',
      parameters: {},
    }
  }

  if (sqlExecuteKeywords.some((keyword) => lowerMessage.includes(keyword))) {
    const sqlMatch = message.match(/(?:执行|运行|查询)(?:sql|SQL)?\s*(.+)/i)
    const sql = sqlMatch ? sqlMatch[1].trim() : 'SELECT * FROM users LIMIT 10'
    return {
      shouldCallTool: true,
      toolName: 'sql_execute',
      parameters: { sql },
    }
  }

  return { shouldCallTool: false }
}

// 从消息中提取模型参数
function extractModelParamsFromMessage(message) {
  const result = {
    name: '',
    category: '建筑',
    description: '',
    file_path: '',
  }

  // 提取名称
  const nameMatch = message.match(/名称[=:=]([^,，]+)/i)
  if (nameMatch) {
    result.name = nameMatch[1].trim()
  } else {
    const namePattern = /(?:添加|新增|加入)\s*(?:一个?\s*)?(.+?)(?:模型|到|$)/
    const namePatternMatch = message.match(namePattern)
    if (namePatternMatch) {
      result.name = namePatternMatch[1].trim()
    }
  }

  // 提取分类
  const categoryMatch = message.match(/分类[=:=]([^,，]+)/i)
  if (categoryMatch) {
    result.category = categoryMatch[1].trim()
  } else if (message.includes('设施')) {
    result.category = '设施'
  } else if (message.includes('建筑')) {
    result.category = '建筑'
  }

  // 提取描述
  const descMatch = message.match(/描述[=:=]([^,，]+)/i)
  if (descMatch) {
    result.description = descMatch[1].trim()
  }

  // 提取文件路径
  const pathMatch = message.match(/文件路径[=:=]([^,，]+)/i)
  if (pathMatch) {
    result.file_path = pathMatch[1].trim()
  }

  return result
}

// 从消息中提取模型更新参数
function extractModelUpdateParamsFromMessage(message) {
  const result = {
    model_id: '',
    updates: {},
  }

  // 提取模型ID或名称
  const idMatch = message.match(
    /(?:更新|修改|编辑)\s*(?:模型\s*)?(.+?)(?:[:：]|$)/i,
  )
  if (idMatch) {
    result.model_id = idMatch[1].trim()
  }

  // 提取更新内容
  const descMatch = message.match(/描述[=:=]([^,，]+)/i)
  if (descMatch) {
    result.updates.description = descMatch[1].trim()
  }

  const nameMatch = message.match(/名称[=:=]([^,，]+)/i)
  if (nameMatch) {
    result.updates.name = nameMatch[1].trim()
  }

  const categoryMatch = message.match(/分类[=:=]([^,，]+)/i)
  if (categoryMatch) {
    result.updates.category = categoryMatch[1].trim()
  }

  const pathMatch = message.match(/文件路径[=:=]([^,，]+)/i)
  if (pathMatch) {
    result.updates.file_path = pathMatch[1].trim()
  }

  // 如果没有提取到ID，尝试从消息中获取
  if (!result.model_id) {
    const simpleIdMatch = message.match(/(?:更新|修改|编辑)\s*(.+)$/i)
    if (simpleIdMatch) {
      result.model_id = simpleIdMatch[1].replace(/[:：].*$/, '').trim()
    }
  }

  return result
}

// 中文数字转换函数
function convertChineseNumber(chineseNum) {
  const chineseNumbers = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
    十一: 11,
    十二: 12,
    十三: 13,
    十四: 14,
    十五: 15,
    十六: 16,
    十七: 17,
    十八: 18,
    十九: 19,
    二十: 20,
    二十一: 21,
    二十二: 22,
    二十三: 23,
    二十四: 24,
    二十五: 25,
    二十六: 26,
    二十七: 27,
    二十八: 28,
    二十九: 29,
    三十: 30,
    三十一: 31,
    三十二: 32,
    三十三: 33,
    三十四: 34,
    三十五: 35,
    三十六: 36,
    三十七: 37,
    三十八: 38,
    三十九: 39,
    四十: 40,
    四十一: 41,
    四十二: 42,
    四十三: 43,
    四十四: 44,
    四十五: 45,
    四十六: 46,
    四十七: 47,
    四十八: 48,
    四十九: 49,
    五十: 50,
    五十一: 51,
    五十二: 52,
    五十三: 53,
    五十四: 54,
    五十五: 55,
    五十六: 56,
    五十七: 57,
    五十八: 58,
    五十九: 59,
    六十: 60,
    六十一: 61,
    六十二: 62,
    六十三: 63,
    六十四: 64,
    六十五: 65,
    六十六: 66,
    六十七: 67,
    六十八: 68,
    六十九: 69,
    七十: 70,
    七十一: 71,
    七十二: 72,
    七十三: 73,
    七十四: 74,
    七十五: 75,
    七十六: 76,
    七十七: 77,
    七十八: 78,
    七十九: 79,
    八十: 80,
    八十一: 81,
    八十二: 82,
    八十三: 83,
    八十四: 84,
    八十五: 85,
    八十六: 86,
    八十七: 87,
    八十八: 88,
    八十九: 89,
    九十: 90,
    九十一: 91,
    九十二: 92,
    九十三: 93,
    九十四: 94,
    九十五: 95,
    九十六: 96,
    九十七: 97,
    九十八: 98,
    九十九: 99,
    一百: 100,
    两百: 200,
    三百: 300,
    四百: 400,
    五百: 500,
    六百: 600,
    七百: 700,
    八百: 800,
    九百: 900,
    一千: 1000,
  }

  return chineseNumbers[chineseNum] || parseInt(chineseNum)
}

// 提取可视域属性参数
function extractViewshedPropertyParameters(message) {
  const params = {}

  // 提取距离参数 - 支持中文数字和阿拉伯数字
  const distanceMatch = message.match(
    /(距离|观察距离|可视距离|distance|radius).*?(?:改为|调整到|设置为|修改为|改成)?\s*([零一二两三四五六七八九十百千\d]+)\s*(米|m|meter)?/i,
  )
  if (distanceMatch) {
    params.distance = convertChineseNumber(distanceMatch[2])
  }

  // 提取方向参数 - 支持中文数字和阿拉伯数字
  const directionMatch = message.match(
    /(方向|方向角|方位角|heading|direction).*?(?:改为|调整到|设置为|修改为|改成)?\s*([零一二两三四五六七八九十百千\d]+)(?:\s*(度|°|u))?/i,
  )
  if (directionMatch) {
    params.heading = convertChineseNumber(directionMatch[2])
  }

  // 提取俯仰角参数 - 支持中文数字和阿拉伯数字
  const pitchMatch = message.match(
    /(俯仰|俯仰角|pitch|仰角).*?(?:改为|调整到|设置为|修改为|改成)?\s*([零一二两三四五六七八九十百千-\d]+)\s*(度|°)?/i,
  )
  if (pitchMatch) {
    params.pitch = convertChineseNumber(pitchMatch[2])
  }

  // 提取水平视角参数 - 支持中文数字和阿拉伯数字
  const hfovMatch = message.match(
    /(水平|水平视角|水平视场角|horizontal|hfov).*?(?:改为|调整到|设置为|修改为|改成)?\s*([零一二两三四五六七八九十百千\d]+)\s*(度|°)?/i,
  )
  if (hfovMatch) {
    params.horizontal_fov = convertChineseNumber(hfovMatch[2])
  }

  // 提取垂直视角参数 - 支持中文数字和阿拉伯数字
  const vfovMatch = message.match(
    /(垂直|垂直视角|垂直视场角|vertical|vfov).*?(?:改为|调整到|设置为|修改为|改成)?\s*([零一二两三四五六七八九十百千\d]+)\s*(度|°)?/i,
  )
  if (vfovMatch) {
    params.vertical_fov = convertChineseNumber(vfovMatch[2])
  }

  // 提取颜色参数
  if (message.includes('颜色') || message.includes('color')) {
    if (message.includes('绿色') || message.includes('green')) {
      params.visible_color = 'rgba(0, 1, 0, 0.8)'
    }
    if (message.includes('红色') || message.includes('red')) {
      params.hidden_color = 'rgba(1, 0, 0, 0.8)'
    }
  }

  return params
}

// 提取天际线分析参数
function extractSkylineParameters(message) {
  const parameters = {}

  // 默认使用当前位置作为观察点
  parameters.observer_position = getDefaultPosition()

  // 默认方向
  parameters.direction = 0

  // 尝试提取半径参数（支持"1000米"、"半径1000米"、"分析半径1000米"等格式） - 支持中文数字
  const radiusMatch = message.match(
    /(?:半径|分析半径|radius)[\s：:]*?([零一二两三四五六七八九十百千\d]+)米?/i,
  )
  if (radiusMatch) {
    parameters.radius = convertChineseNumber(radiusMatch[1])
  }

  // 尝试提取观察点高度参数 - 支持中文数字
  const heightMatch = message.match(
    /(?:观察点高度|视点高度|height)[\s：:]*?([零一二两三四五六七八九十百千\d]+(?:\.\d+)?)/i,
  )
  if (heightMatch) {
    parameters.observer_height = convertChineseNumber(heightMatch[1])
  }

  // 尝试提取方向参数 - 支持中文数字
  const directionMatch = message.match(
    /(?:方向|direction|观察方向)[\s：:]*?([零一二两三四五六七八九十百千\d]+(?:\.\d+)?)/i,
  )
  if (directionMatch) {
    parameters.direction = convertChineseNumber(directionMatch[1])
  }

  return parameters
}

// 从用户消息中提取时间信息（阴影分析：向前推2小时）
function extractTimeFromMessage(message) {
  const result = {
    time: null,
    duration: null,
  }

  try {
    // 处理"上午10点"、"下午3点"格式 - 支持中文数字
    const timePointMatch = message.match(
      /(上午|下午)?([零一二两三四五六七八九十百千\d]+)点/,
    )
    if (timePointMatch) {
      const period = timePointMatch[1] || ''
      let endHour = convertChineseNumber(timePointMatch[2]) // 输入的时间是结束时间

      // 处理上午/下午
      if (period === '下午' && endHour < 12) {
        endHour += 12
      }

      const startHour = Math.max(0, endHour - 2) // 向前推2小时，确保不小于0

      result.time = `${startHour.toString().padStart(2, '0')}:00` // 开始时间
      result.duration = 2 // 2小时范围
      return result
    }

    // 处理"10点到12点"格式的时间范围 - 支持中文数字
    const timeRangeMatch = message.match(
      /(上午|下午)?([零一二两三四五六七八九十百千\d]+)点到(上午|下午)?([零一二两三四五六七八九十百千\d]+)点/,
    )
    if (timeRangeMatch) {
      const startPeriod = timeRangeMatch[1] || ''
      let startHour = convertChineseNumber(timeRangeMatch[2])
      const endPeriod = timeRangeMatch[3] || ''
      let endHour = convertChineseNumber(timeRangeMatch[4])

      // 处理上午/下午
      if (startPeriod === '下午' && startHour < 12) {
        startHour += 12
      }
      if (endPeriod === '下午' && endHour < 12) {
        endHour += 12
      }

      result.time = `${startHour.toString().padStart(2, '0')}:00`
      result.duration = Math.max(1, endHour - startHour)
      return result
    }

    // 处理"15:00"格式
    const standardTimeMatch = message.match(/(\d{1,2}):(\d{2})/)
    if (standardTimeMatch) {
      const hour = parseInt(standardTimeMatch[1])
      const minute = parseInt(standardTimeMatch[2])
      result.time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
      result.duration = 2 // 默认2小时范围
      return result
    }

    // 处理纯数字格式（如"10点"） - 支持中文数字
    const simpleHourMatch = message.match(
      /([零一二两三四五六七八九十百千\d]{1,2})点/,
    )
    if (simpleHourMatch) {
      const hour = convertChineseNumber(simpleHourMatch[1])
      result.time = `${hour.toString().padStart(2, '0')}:00`
      result.duration = 2 // 默认2小时范围
      return result
    }
  } catch (error) {
    console.error('提取时间信息失败:', error)
  }

  return result
}

// 从用户消息中提取时间范围信息（用于日照效果）
function extractTimeRangeFromMessage(message) {
  const result = {
    startTime: null,
    endTime: null,
    timeRange: null,
  }

  try {
    // 处理"10点到下午4点"格式 - 支持中文数字
    const timeRangeMatch = message.match(
      /(上午|下午)?([零一二两三四五六七八九十百千\d]+)点到(上午|下午)?([零一二两三四五六七八九十百千\d]+)点/,
    )
    if (timeRangeMatch) {
      const startPeriod = timeRangeMatch[1] || ''
      let startHour = convertChineseNumber(timeRangeMatch[2])
      const endPeriod = timeRangeMatch[3] || ''
      let endHour = convertChineseNumber(timeRangeMatch[4])

      // 处理上午/下午
      if (startPeriod === '下午' && startHour < 12) {
        startHour += 12
      }
      if (endPeriod === '下午' && endHour < 12) {
        endHour += 12
      }

      result.startTime = `${startHour.toString().padStart(2, '0')}:00`
      result.endTime = `${endHour.toString().padStart(2, '0')}:00`
      result.timeRange = `${endHour - startHour}小时`
      return result
    }

    // 处理"8-18"格式 - 支持中文数字
    const dashRangeMatch = message.match(
      /([零一二两三四五六七八九十百千\d]+)[-到]([零一二两三四五六七八九十百千\d]+)/,
    )
    if (dashRangeMatch) {
      const startHour = convertChineseNumber(dashRangeMatch[1])
      const endHour = convertChineseNumber(dashRangeMatch[2])

      result.startTime = `${startHour.toString().padStart(2, '0')}:00`
      result.endTime = `${endHour.toString().padStart(2, '0')}:00`
      result.timeRange = `${endHour - startHour}小时`
      return result
    }

    // 处理单个时间点（如"下午3点"），默认2小时范围 - 支持中文数字
    const timePointMatch = message.match(
      /(上午|下午)?([零一二两三四五六七八九十百千\d]+)点/,
    )
    if (timePointMatch) {
      const period = timePointMatch[1] || ''
      let hour = convertChineseNumber(timePointMatch[2])

      // 处理上午/下午
      if (period === '下午' && hour < 12) {
        hour += 12
      }

      result.startTime = `${hour.toString().padStart(2, '0')}:00`
      result.endTime = `${(hour + 2).toString().padStart(2, '0')}:00`
      result.timeRange = '2小时'
      return result
    }
  } catch (error) {
    console.error('提取时间范围信息失败:', error)
  }

  return result
}

// 从用户消息中提取平移参数
function extractTranslationFromMessage(message) {
  const result = {
    x: 0,
    y: 0,
    z: 0,
  }

  try {
    // 处理"向右移动10米"格式 - 支持中文数字
    const directionMatch = message.match(
      /(向左|向右|向前|向后|向上|向下|往左|往右|往前|往后|往上|往下)(移动|平移)?([零一二两三四五六七八九十百千\d]+)(米|m)?/,
    )
    if (directionMatch) {
      const direction = directionMatch[1]
      const distance = convertChineseNumber(directionMatch[3])

      switch (direction) {
        case '向右':
        case '往右':
          result.x = distance
          break
        case '向左':
        case '往左':
          result.x = -distance
          break
        case '向前':
        case '往前':
          result.y = distance
          break
        case '向后':
        case '往后':
          result.y = -distance
          break
        case '向上':
        case '往上':
          result.z = distance
          break
        case '向下':
        case '往下':
          result.z = -distance
          break
      }
      return result
    }

    // 处理"X轴移动10米"格式 - 支持中文数字
    const axisMatch = message.match(
      /([xyzXYZ]轴?)(移动|平移)?([零一二两三四五六七八九十百千\d]+)(米|m)?/,
    )
    if (axisMatch) {
      const axis = axisMatch[1].toLowerCase()
      const distance = convertChineseNumber(axisMatch[3])

      if (axis === 'x' || axis === 'x轴') {
        result.x = distance
      } else if (axis === 'y' || axis === 'y轴') {
        result.y = distance
      } else if (axis === 'z' || axis === 'z轴') {
        result.z = distance
      }
      return result
    }

    // 处理数字提取（简单模式）
    const numberMatch = message.match(/([零一二两三四五六七八九十百千\d]+)/)
    if (numberMatch) {
      const distance = convertChineseNumber(numberMatch[1])
      // 默认X轴移动
      result.x = distance
      return result
    }
  } catch (error) {
    console.error('提取平移参数失败:', error)
  }

  return result
}

// 从用户消息中提取旋转参数
function extractRotationFromMessage(message) {
  const result = {
    x: 0,
    y: 0,
    z: 0,
  }

  try {
    // 处理"绕X轴旋转30度"格式 - 支持中文数字
    const axisMatch = message.match(
      /(绕)?([xyzXYZ]轴?)(旋转|转动)?([零一二两三四五六七八九十百千\d]+)(度|°)?/,
    )
    if (axisMatch) {
      const axis = axisMatch[2].toLowerCase()
      const angle = convertChineseNumber(axisMatch[4])

      if (axis === 'x' || axis === 'x轴') {
        result.x = angle
      } else if (axis === 'y' || axis === 'y轴') {
        result.y = angle
      } else if (axis === 'z' || axis === 'z轴') {
        result.z = angle
      }
      console.log('🔄 提取旋转参数（轴模式）:', { axis, angle, result })
      return result
    }

    // 处理"旋转30度"格式（默认绕Z轴） - 支持中文数字
    const simpleMatch = message.match(
      /(旋转|转动)([零一二两三四五六七八九十百千\d]+)(度|°)?/,
    )
    if (simpleMatch) {
      const angle = convertChineseNumber(simpleMatch[2])
      result.z = angle // 默认绕Z轴旋转
      console.log('🔄 提取旋转参数（简单模式）:', { angle, result })
      return result
    }

    // 处理数字提取（简单模式）
    const numberMatch = message.match(/([零一二两三四五六七八九十百千\d]+)/)
    if (numberMatch) {
      const angle = convertChineseNumber(numberMatch[1])
      result.z = angle // 默认绕Z轴旋转
      console.log('🔄 提取旋转参数（数字模式）:', { angle, result })
      return result
    }
  } catch (error) {
    console.error('提取旋转参数失败:', error)
  }

  console.log('🔄 未提取到旋转参数，使用默认值:', result)
  return result
}

// 从用户消息中提取缩放参数
function extractScaleFromMessage(message) {
  let scaleFactor = 1.0

  try {
    // 处理"放大2倍"格式 - 支持中文数字
    const scaleMatch = message.match(
      /(放大|缩小)([零一二两三四五六七八九十百千\d]+(\.\d+)?)(倍)?/,
    )
    if (scaleMatch) {
      const operation = scaleMatch[1]
      const factor = convertChineseNumber(scaleMatch[2])

      if (operation === '放大') {
        scaleFactor = factor
      } else if (operation === '缩小') {
        scaleFactor = 1 / factor
      }
      console.log('📏 提取缩放参数:', { operation, factor, scaleFactor })
      return scaleFactor
    }

    // 处理"缩小到原来的一半"格式 - 支持中文数字
    const halfMatch = message.match(
      /缩小到原来的([零一二两三四五六七八九十百千\d]+(\.\d+)?)(半|分之一)?/,
    )
    if (halfMatch) {
      const factor = convertChineseNumber(halfMatch[1])
      scaleFactor = 1 / factor
      return scaleFactor
    }

    // 处理"放大到原来的2倍"格式 - 支持中文数字
    const doubleMatch = message.match(
      /放大到原来的([零一二两三四五六七八九十百千\d]+(\.\d+)?)倍/,
    )
    if (doubleMatch) {
      const factor = convertChineseNumber(doubleMatch[1])
      scaleFactor = factor
      return scaleFactor
    }

    // 处理"缩放为原来的50%"格式
    const percentMatch = message.match(
      /(缩放为)?([零一二两三四五六七八九十百千\d]+)(%|百分比)/,
    )
    if (percentMatch) {
      const percent = convertChineseNumber(percentMatch[2])
      scaleFactor = percent / 100
      return scaleFactor
    }

    // 处理"一半"、"两倍"等常见表达
    if (message.includes('一半') || message.includes('半倍')) {
      scaleFactor = 0.5
      return scaleFactor
    }

    if (message.includes('两倍') || message.includes('2倍')) {
      scaleFactor = 2.0
      return scaleFactor
    }

    if (message.includes('三倍') || message.includes('3倍')) {
      scaleFactor = 3.0
      return scaleFactor
    }

    // 处理数字提取（简单模式）
    const numberMatch = message.match(
      /([零一二两三四五六七八九十百千\d]+(\.\d+)?)/,
    )
    if (numberMatch) {
      scaleFactor = convertChineseNumber(numberMatch[1])
      return scaleFactor
    }
  } catch (error) {
    console.error('提取缩放参数失败:', error)
  }

  return scaleFactor
}

// 获取空间分析类型
function getSpatialAnalysisType(message) {
  // 优先检查日照效果相关关键词
  if (
    message.includes('日照效果') ||
    message.includes('日照模拟') ||
    message.includes('太阳轨迹') ||
    message.includes('光照变化') ||
    message.includes('日照分析') ||
    message.includes('太阳运动')
  ) {
    return 'sunlight'
  }

  if (
    message.includes('可视域') ||
    message.includes('视野') ||
    message.includes('可视范围') ||
    message.includes('视线分析') ||
    message.includes('可见性') ||
    message.includes('观察范围')
  ) {
    return 'viewshed'
  }
  if (
    message.includes('通视') ||
    message.includes('视线') ||
    message.includes('两点通视')
  ) {
    return 'sightline'
  }
  if (
    message.includes('阴影') ||
    message.includes('影子') ||
    message.includes('阴影分析')
  ) {
    return 'shadow'
  }
  if (
    message.includes('剖面') ||
    message.includes('断面') ||
    message.includes('切割')
  ) {
    return 'profile'
  }
  if (
    message.includes('天际线') ||
    message.includes('轮廓') ||
    message.includes('城市轮廓')
  ) {
    return 'skyline'
  }
  return 'viewshed' // 默认可视域分析
}

// 分析用户意图，判断是否需要进行可视域分析
function analyzeViewshedIntent(message) {
  const viewshedKeywords = [
    '可视域',
    '视野',
    '可视范围',
    '视线分析',
    '可见性',
    '观察范围',
    'viewshed',
    'visibility',
    'line of sight',
    'sight analysis',
  ]

  const hasViewshedIntent = viewshedKeywords.some((keyword) =>
    message.toLowerCase().includes(keyword.toLowerCase()),
  )

  // 提取参数
  const parameters = {}

  // 默认使用当前位置作为观察点
  parameters.observer_position = getDefaultPosition()

  // 尝试提取半径参数 - 支持中文数字
  const radiusMatch = message.match(/([零一二两三四五六七八九十百千\d]+)米/)
  if (radiusMatch) {
    parameters.radius = convertChineseNumber(radiusMatch[1])
  }

  // 尝试提取观察者高度 - 支持中文数字
  const heightMatch = message.match(
    /观察者高度[:：]\s*([零一二两三四五六七八九十百千\d]+(?:\.\d+)?)/,
  )
  if (heightMatch) {
    parameters.observer_height = convertChineseNumber(heightMatch[1])
  }

  return {
    isViewshedRequest: hasViewshedIntent,
    requiresInteraction: true, // 需要用户交互设置观察点
    intentType: hasViewshedIntent ? 'viewshed' : 'other',
    parameters: parameters,
  }
}

// 获取查询类型
function getQueryType(message) {
  if (message.includes('属性')) {
    return 'property'
  }
  if (message.includes('空间')) {
    return 'spatial'
  }
  if (message.includes('统计')) {
    return 'statistical'
  }
  return 'property' // 默认属性查询
}

// 获取可视化类型
function getVisualizationType(message) {
  if (message.includes('热力图')) {
    return 'heatmap'
  }
  if (message.includes('图表')) {
    return 'chart'
  }
  return '3d' // 默认三维可视化
}

// 获取默认位置（当前视图中心）
function getDefaultPosition() {
  return {
    longitude: 116.3974,
    latitude: 39.9093,
    height: 50,
  }
}

// 获取模型路径
function getModelPath(message) {
  // 首先尝试从消息中提取文件路径
  const pathPatterns = [
    // Windows路径: D:\path\to\file.glb 或 D:/path/to/file.glb
    /[a-zA-Z]:[\\\/][\w\-\+\.\\\/]+\.\w+/g,
    // Unix路径: /path/to/file.glb
    /\/[\w\-\+\.\/]+\.\w+/g,
    // URL路径: http://example.com/model.glb
    /https?:\/\/[\w\-\.\/]+\.\w+/g,
    // file://路径
    /file:\/\/[\w\-\+\.\/]+\.\w+/g,
    // 相对路径: ./models/file.glb 或 ../models/file.glb
    /\.\.?[\\\/][\w\-\+\.\\\/]+\.\w+/g,
  ]

  for (const pattern of pathPatterns) {
    const matches = message.match(pattern)
    if (matches && matches.length > 0) {
      const path = matches[0]
      // 返回路径但标记为需要用户确认
      return {
        path: path,
        requires_user_confirmation: true,
        is_direct_file_path: true,
      }
    }
  }

  // 如果没有找到路径，回退到关键词匹配
  if (message.includes('建筑') || message.includes('房屋')) {
    return './models/building.glb'
  }
  if (message.includes('地形') || message.includes('地貌')) {
    return './models/terrain.glb'
  }
  return './models/default.glb'
}

// 获取模型名称
function getModelName(message) {
  if (message.includes('建筑') || message.includes('房屋')) {
    return '建筑模型'
  }
  if (message.includes('地形') || message.includes('地貌')) {
    return '地形模型'
  }
  return '默认模型'
}

// 获取当前时间
function getCurrentTime() {
  const now = new Date()
  return now.toISOString().slice(0, 19).replace('T', ' ')
}

// 执行工具
async function executeTool(toolName, parameters) {
  switch (toolName) {
    // 基础操作工具
    case 'load_model':
      return await executeLoadModel(parameters)
    case 'fly_to_model':
      return await executeFlyToModel(parameters)
    case 'translate_model':
      return await executeTranslateModel(parameters)
    case 'rotate_model':
      return await executeRotateModel(parameters)
    case 'scale_model':
      return await executeScaleModel(parameters)

    // 导航与漫游工具
    case 'indoor_navigation':
      return await executeIndoorNavigation(parameters)
    case 'roaming':
      return await executeRoaming(parameters)

    // 空间分析工具
    case 'profile_analysis':
      return await executeProfileAnalysis(parameters)
    case 'viewshed_analysis':
      return await executeViewshedAnalysis(parameters)
    case 'viewshed_property_edit':
      return await executeViewshedPropertyEdit(parameters)
    case 'sightline_analysis':
      return await executeSightlineAnalysis(parameters)
    case 'shadow_analysis':
      return await executeShadowAnalysis(parameters)
    case 'skyline_analysis':
      return await executeSkylineAnalysis(parameters)
    case 'skyline_2d_view':
      return await executeSkyline2DView(parameters)

    // 测量分析工具
    case 'distance_measure':
      return await executeDistanceMeasure(parameters)
    case 'area_measure':
      return await executeAreaMeasure(parameters)
    case 'height_measure':
      return await executeHeightMeasure(parameters)
    case 'clear_measure':
      return await executeClearMeasure(parameters)

    // 系统控制工具
    case 'clear_analysis':
      return await executeClearAnalysis(parameters)
    case 'lighting_settings':
      return await executeLightingSettings(parameters)
    case 'bloom_effect':
      return await executeBloomEffect(parameters)
    case 'sunlight_effect':
      return await executeSunlightEffect(parameters)

    // 可视域分析增强工具已移除

    // 模型信息管理工具
    case 'get_model_info':
      return await executeGetModelInfo(parameters)
    case 'search_models':
      return await executeSearchModels(parameters)
    case 'update_model_info':
      return await executeUpdateModelInfo(parameters)
    case 'get_model_statistics':
      return await executeGetModelStatistics(parameters)
    case 'get_models_by_category':
      return await executeGetModelsByCategory(parameters)
    case 'register_model':
      return await executeRegisterModel(parameters)

    // 数据库管理工具
    case 'db_get_all_models':
      return await executeDbGetAllModels(parameters)
    case 'db_get_model':
      return await executeDbGetModel(parameters)
    case 'db_search_models':
      return await executeDbSearchModels(parameters)
    case 'db_add_model':
      return await executeDbAddModel(parameters)
    case 'db_update_model':
      return await executeDbUpdateModel(parameters)
    case 'db_delete_model':
      return await executeDbDeleteModel(parameters)
    case 'db_get_by_category':
      return await executeDbGetByCategory(parameters)
    case 'db_get_statistics':
      return await executeDbGetStatistics(parameters)
    case 'highlight_model':
      return await executeHighlightModel(parameters)
    case 'clear_highlight':
      return await executeClearHighlight(parameters)

    // SQLite 数据库工具
    case 'sql_connect':
      return await executeSqlConnect(parameters)
    case 'sql_connect_memory':
      return await executeSqlConnectMemory(parameters)
    case 'sql_disconnect':
      return await executeSqlDisconnect(parameters)
    case 'sql_execute':
      return await executeSqlExecute(parameters)
    case 'sql_get_tables':
      return await executeSqlGetTables(parameters)
    case 'sql_get_table_info':
      return await executeSqlGetTableInfo(parameters)
    case 'sql_status':
      return await executeSqlStatus(parameters)

    default:
      throw new Error(`未实现的工具: ${toolName}`)
  }
}

// 执行加载模型
async function executeLoadModel(parameters) {
  const { model_path, model_name } = parameters

  // 检查是否为需要用户确认的直接文件路径
  if (typeof model_path === 'object' && model_path.requires_user_confirmation) {
    const result = {
      tool: 'load_model',
      status: 'requires_confirmation',
      message: `检测到文件路径: ${model_path.path}，请确认是否加载此文件`,
      data: {
        model_path: model_path.path,
        model_name: model_name || '用户指定文件',
        requires_user_confirmation: true,
        is_direct_file_path: true,
        load_mode: 'user_confirmation_required',
        file_info: {
          path: model_path.path,
          suggested_name:
            model_name || this.extractFileNameFromPath(model_path.path),
        },
      },
      timestamp: Date.now(),
    }
    return result
  }

  // 常规模型库加载
  const result = {
    tool: 'load_model',
    status: 'success',
    message: `模型 ${model_name || model_path} 加载成功`,
    data: {
      model_path,
      model_name,
    },
    timestamp: Date.now(),
  }

  return result
}

// 从路径中提取文件名（辅助函数）
function extractFileNameFromPath(filePath) {
  if (!filePath) return 'unknown'

  try {
    // 处理URL和路径
    const url = new URL(filePath, 'file:///')
    const pathname = url.pathname

    // 提取文件名
    const fileName =
      pathname.split('/').pop() || pathname.split('\\').pop() || 'unknown'
    return decodeURIComponent(fileName)
  } catch (error) {
    // 如果URL解析失败，直接处理字符串
    const parts = filePath.split(/[\\\/]/)
    return parts.pop() || 'unknown'
  }
}

// 执行飞行到模型
async function executeFlyToModel(parameters) {
  const { model_id, duration } = parameters

  const result = {
    tool: 'fly_to_model',
    status: 'success',
    message: `飞行到模型 ${model_id} 完成`,
    data: {
      model_id,
      duration,
    },
    timestamp: Date.now(),
  }

  return result
}

// 执行室内导航
async function executeIndoorNavigation(parameters) {
  const { start_point, end_point } = parameters

  const result = {
    tool: 'indoor_navigation',
    status: 'success',
    message: '室内导航路径规划完成',
    data: {
      start_point,
      end_point,
      route: {
        distance: 150,
        duration: 2,
        path: [start_point, end_point],
      },
    },
    timestamp: Date.now(),
  }

  return result
}

// 执行漫游
async function executeRoaming(parameters) {
  const { roaming_mode, speed } = parameters

  const result = {
    tool: 'roaming',
    status: 'success',
    message: `漫游模式 ${roaming_mode} 已启动`,
    data: {
      roaming_mode,
      speed,
    },
    timestamp: Date.now(),
  }

  return result
}

// 执行剖面分析
async function executeProfileAnalysis(parameters) {
  const { start_point, end_point } = parameters

  const result = {
    tool: 'profile_analysis',
    status: 'success',
    message: '剖面分析完成',
    data: {
      start_point,
      end_point,
      profile_data: {
        length: 200,
        max_height: 50,
        min_height: 10,
      },
    },
    timestamp: Date.now(),
  }

  return result
}

// 执行可视域分析
async function executeViewshedAnalysis(parameters) {
  const { observer_position, radius, observer_height } = parameters

  const result = {
    tool: 'viewshed_analysis',
    status: 'success',
    message: '可视域分析完成',
    data: {
      observer_position,
      radius,
      observer_height,
      visible_area: 0.75,
      analysis_result: '大部分区域可见',
    },
    timestamp: Date.now(),
  }

  return result
}

// 执行可视域属性编辑
async function executeViewshedPropertyEdit(parameters) {
  const {
    heading,
    pitch,
    distance,
    horizontal_fov,
    vertical_fov,
    visible_color,
    hidden_color,
  } = parameters

  // 构建属性更新消息
  let updateMessage = '可视域分析属性已更新：'
  const updates = []

  if (heading !== undefined) updates.push(`方向角: ${heading}°`)
  if (pitch !== undefined) updates.push(`俯仰角: ${pitch}°`)
  if (distance !== undefined) updates.push(`观察距离: ${distance}米`)
  if (horizontal_fov !== undefined)
    updates.push(`水平视场角: ${horizontal_fov}°`)
  if (vertical_fov !== undefined) updates.push(`垂直视场角: ${vertical_fov}°`)
  if (visible_color !== undefined)
    updates.push(`可见区域颜色: ${visible_color}`)
  if (hidden_color !== undefined)
    updates.push(`不可见区域颜色: ${hidden_color}`)

  if (updates.length > 0) {
    updateMessage += updates.join(', ')
  } else {
    updateMessage = '未检测到有效的属性修改参数'
  }

  const result = {
    tool: 'viewshed_property_edit',
    status: 'success',
    message: updateMessage,
    data: {
      heading,
      pitch,
      distance,
      horizontal_fov,
      vertical_fov,
      visible_color,
      hidden_color,
      requires_interaction: false,
      action: 'update_viewshed_properties',
      instructions: '属性已更新，请查看可视域分析结果',
    },
    timestamp: Date.now(),
  }

  return result
}

// 执行通视分析
async function executeSightlineAnalysis(parameters) {
  const { start_point, end_point } = parameters

  const result = {
    tool: 'sightline_analysis',
    status: 'success',
    message: '通视分析完成',
    data: {
      start_point,
      end_point,
      is_visible: true,
      obstacles: [],
      distance: 300,
    },
    timestamp: Date.now(),
  }

  return result
}

// 执行阴影分析
async function executeShadowAnalysis(parameters) {
  const { analysis_time, start_time, end_time, duration, date } = parameters

  // 解析时间参数
  const timeParams = parseShadowTimeParameters(
    analysis_time,
    start_time,
    end_time,
    duration,
    date,
  )

  const result = {
    tool: 'shadow_analysis',
    status: 'success',
    message: `阴影分析已启动，时间范围：${timeParams.startTime} - ${timeParams.endTime}`,
    data: {
      analysis_time: timeParams.analysisTime,
      start_time: timeParams.startTime,
      end_time: timeParams.endTime,
      duration: timeParams.duration,
      date: timeParams.date,
      shadow_coverage: 0.3,
      shadow_direction: '东南方向',
      requires_interaction: true,
      interaction_type: 'shadow_selection',
      instructions: '请在地图上绘制阴影分析区域',
    },
    timestamp: Date.now(),
  }

  return result
}

// 解析阴影分析时间参数
function parseShadowTimeParameters(
  analysis_time,
  start_time,
  end_time,
  duration,
  date,
) {
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  // 默认值
  let analysisDate = date || today
  let startTime = '10:00'
  let endTime = '14:00'
  let analysisDuration = duration || 4

  console.log('🔍 解析阴影分析时间参数:', {
    analysis_time,
    start_time,
    end_time,
    duration,
    date,
  })

  // 如果提供了analysis_time，优先使用
  if (analysis_time) {
    console.log('🔍 解析analysis_time:', analysis_time)

    // 首先检查是否包含"点"字，处理"下午3点"格式（向前推2小时）
    if (analysis_time.includes('点')) {
      const hourMatch = analysis_time.match(
        /(上午|下午)?([零一二两三四五六七八九十百千\d]+)点/,
      )
      if (hourMatch) {
        const period = hourMatch[1] || ''
        let endHour = convertChineseNumber(hourMatch[2]) // 输入的时间是结束时间

        // 处理上午/下午
        if (period === '下午' && endHour < 12) {
          endHour += 12
        }

        const startHour = Math.max(0, endHour - 2) // 向前推2小时，确保不小于0
        startTime = `${startHour.toString().padStart(2, '0')}:00` // 开始时间
        endTime = `${endHour.toString().padStart(2, '0')}:00` // 结束时间
        analysisDuration = 2
        console.log('✅ 解析"点"格式时间成功（向前推2小时）:', {
          period,
          endHour,
          startTime,
          endTime,
        })
      }
    } else if (
      analysis_time.includes('下午') ||
      analysis_time.includes('PM') ||
      analysis_time.includes('pm')
    ) {
      // 解析下午时间（向前推2小时）
      const hourMatch = analysis_time.match(
        /([零一二两三四五六七八九十百千\d]+)/,
      )
      if (hourMatch) {
        let endHour = convertChineseNumber(hourMatch[1])
        if (endHour < 12) endHour += 12 // 下午时间转换为24小时制
        const startHour = Math.max(0, endHour - 2) // 向前推2小时，确保不小于0
        startTime = `${startHour.toString().padStart(2, '0')}:00` // 开始时间
        endTime = `${endHour.toString().padStart(2, '0')}:00` // 结束时间
        analysisDuration = 2
        console.log('✅ 解析下午时间成功（向前推2小时）:', {
          endHour,
          startTime,
          endTime,
        })
      }
    } else if (
      analysis_time.includes('上午') ||
      analysis_time.includes('AM') ||
      analysis_time.includes('am')
    ) {
      // 解析上午时间（向前推2小时）
      const hourMatch = analysis_time.match(
        /([零一二两三四五六七八九十百千\d]+)/,
      )
      if (hourMatch) {
        const endHour = convertChineseNumber(hourMatch[1])
        const startHour = Math.max(0, endHour - 2) // 向前推2小时，确保不小于0
        startTime = `${startHour.toString().padStart(2, '0')}:00` // 开始时间
        endTime = `${endHour.toString().padStart(2, '0')}:00` // 结束时间
        analysisDuration = 2
        console.log('✅ 解析上午时间成功（向前推2小时）:', {
          endHour,
          startTime,
          endTime,
        })
      }
    } else if (analysis_time.includes(':') && analysis_time.length <= 8) {
      // 简单时间格式，如"15:00"
      startTime = analysis_time
      const hour = parseInt(analysis_time.split(':')[0])
      endTime = `${(hour + 2).toString().padStart(2, '0')}:00`
      analysisDuration = 2
      console.log('✅ 解析标准时间格式成功:', { startTime, endTime })
    } else {
      // 标准时间格式
      startTime = analysis_time.split(' ')[1] || '10:00'
      console.log('✅ 使用标准时间格式:', startTime)
    }
  }

  // 如果提供了开始时间和结束时间
  if (start_time && end_time) {
    console.log('🔍 解析开始和结束时间:', { start_time, end_time })
    startTime = parseNaturalTime(start_time)
    endTime = parseNaturalTime(end_time)

    // 计算持续时间
    const startHour = parseInt(startTime.split(':')[0])
    const endHour = parseInt(endTime.split(':')[0])
    analysisDuration = Math.max(1, endHour - startHour)

    console.log('✅ 解析开始结束时间成功:', {
      startTime,
      endTime,
      analysisDuration,
    })
  }

  // 如果只提供了开始时间
  if (start_time && !end_time) {
    startTime = parseNaturalTime(start_time)
    const startHour = parseInt(startTime.split(':')[0])
    endTime = `${(startHour + (duration || 2)).toString().padStart(2, '0')}:00`
    console.log('✅ 解析开始时间成功:', { startTime, endTime })
  }

  // 如果只提供了结束时间
  if (end_time && !start_time) {
    endTime = parseNaturalTime(end_time)
    const endHour = parseInt(endTime.split(':')[0])
    startTime = `${(endHour - (duration || 2)).toString().padStart(2, '0')}:00`
    console.log('✅ 解析结束时间成功:', { startTime, endTime })
  }

  const result = {
    analysisTime: `${analysisDate} ${startTime}`,
    startTime: `${analysisDate} ${startTime}`,
    endTime: `${analysisDate} ${endTime}`,
    duration: analysisDuration,
    date: analysisDate,
  }

  console.log('✅ 阴影分析时间参数解析完成:', result)
  return result
}

// 解析自然语言时间
function parseNaturalTime(timeStr) {
  if (!timeStr) return '10:00'

  console.log('🔍 解析自然语言时间:', timeStr)

  // 如果是标准时间格式
  if (timeStr.includes(':') && timeStr.length <= 8) {
    return timeStr
  }

  // 处理"点"格式（如"3点"、"下午3点"） - 支持中文数字
  if (timeStr.includes('点')) {
    const hourMatch = timeStr.match(
      /(上午|下午)?([零一二两三四五六七八九十百千\d]+)点/,
    )
    if (hourMatch) {
      const period = hourMatch[1] || ''
      let hour = convertChineseNumber(hourMatch[2])

      // 处理上午/下午
      if (period === '下午' && hour < 12) {
        hour += 12
      }

      console.log('✅ 解析"点"格式时间成功:', { period, hour })
      return `${hour.toString().padStart(2, '0')}:00`
    }
  }

  // 解析自然语言时间 - 支持中文数字
  if (
    timeStr.includes('下午') ||
    timeStr.includes('PM') ||
    timeStr.includes('pm')
  ) {
    const hourMatch = timeStr.match(/([零一二两三四五六七八九十百千\d]+)/)
    if (hourMatch) {
      let hour = convertChineseNumber(hourMatch[1])
      if (hour < 12) hour += 12 // 下午时间转换为24小时制
      console.log('✅ 解析下午时间成功:', { hour })
      return `${hour.toString().padStart(2, '0')}:00`
    }
  } else if (
    timeStr.includes('上午') ||
    timeStr.includes('AM') ||
    timeStr.includes('am')
  ) {
    const hourMatch = timeStr.match(/([零一二两三四五六七八九十百千\d]+)/)
    if (hourMatch) {
      const hour = convertChineseNumber(hourMatch[1])
      console.log('✅ 解析上午时间成功:', { hour })
      return `${hour.toString().padStart(2, '0')}:00`
    }
  }

  // 处理纯数字格式（如"15"表示15点） - 支持中文数字
  const pureNumberMatch = timeStr.match(
    /^([零一二两三四五六七八九十百千\d]{1,2})$/,
  )
  if (pureNumberMatch) {
    let hour = convertChineseNumber(pureNumberMatch[1])
    if (hour >= 0 && hour <= 23) {
      console.log('✅ 解析纯数字时间成功:', { hour })
      return `${hour.toString().padStart(2, '0')}:00`
    }
  }

  console.log('⚠️ 无法解析时间格式，使用默认值')
  // 默认返回
  return '10:00'
}

// 执行天际线分析
async function executeSkylineAnalysis(parameters) {
  const { observer_position, direction, radius, observer_height } = parameters

  // 构建分析结果，包含提取的参数
  const result = {
    tool: 'skyline_analysis',
    status: 'success',
    message: '天际线分析完成',
    data: {
      observer_position: observer_position || getDefaultPosition(),
      direction: direction || 0,
      radius: radius || 10000, // 默认半径10000米
      observer_height: observer_height || 50, // 默认观察点高度50米
      skyline_points: 25,
      max_height: 120,
      complexity: '中等',
      analysis_mode: '自动分析',
      timestamp: Date.now(),
    },
    timestamp: Date.now(),
  }

  // 如果有自定义参数，更新消息以反映使用的参数
  if (radius || observer_height || direction) {
    const params = []
    if (radius) params.push(`半径${radius}米`)
    if (observer_height) params.push(`观察点高度${observer_height}米`)
    if (direction) params.push(`方向${direction}度`)

    result.message = `天际线分析完成（${params.join('，')}）`
  }

  return result
}

// 执行二维天际线查看
async function executeSkyline2DView(parameters) {
  const result = {
    tool: 'skyline_2d_view',
    status: 'success',
    message: '二维天际线查看已启动',
    data: {
      action: 'view_2d_skyline',
      requires_interaction: false,
      instructions: '正在显示二维天际线图表，包含天际线的高度分布和角度信息',
    },
    timestamp: Date.now(),
  }

  return result
}

// 执行距离测量
async function executeDistanceMeasure(parameters) {
  const { mode, start_point, end_point } = parameters

  const result = {
    tool: 'distance_measure',
    status: 'success',
    message: '距离测量已启动',
    data: {
      mode,
      start_point,
      end_point,
      instructions: '请在场景中点击测量起点和终点，系统将计算并显示空间距离',
    },
    timestamp: Date.now(),
  }

  return result
}

// 执行面积测量
async function executeAreaMeasure(parameters) {
  const { mode, positions } = parameters

  const result = {
    tool: 'area_measure',
    status: 'success',
    message: '面积测量已启动',
    data: {
      mode,
      positions,
      instructions: '请在场景中点击测量区域的各个顶点，系统将计算并显示面积',
    },
    timestamp: Date.now(),
  }

  return result
}

// 执行高度测量
async function executeHeightMeasure(parameters) {
  const { start_point, end_point } = parameters

  const result = {
    tool: 'height_measure',
    status: 'success',
    message: '高度测量已启动',
    data: {
      start_point,
      end_point,
      instructions: '请在场景中点击测量起点和终点，系统将计算并显示高差',
    },
    timestamp: Date.now(),
  }

  return result
}

// 执行清除测量
async function executeClearMeasure(parameters) {
  const { measure_type } = parameters

  const result = {
    tool: 'clear_measure',
    status: 'success',
    message: `清除 ${measure_type} 测量结果完成`,
    data: {
      measure_type,
    },
    timestamp: Date.now(),
  }

  return result
}

// 执行清除分析
async function executeClearAnalysis(parameters) {
  const { clear_type } = parameters

  const result = {
    tool: 'clear_analysis',
    status: 'success',
    message: `清除 ${clear_type} 分析结果完成`,
    data: {
      clear_type,
    },
    timestamp: Date.now(),
  }

  return result
}

// 执行光照设置
async function executeLightingSettings(parameters) {
  const { lighting_type, intensity, color } = parameters

  const result = {
    tool: 'lighting_settings',
    status: 'success',
    message: `光照设置 ${lighting_type} 已应用`,
    data: {
      lighting_type,
      intensity,
      color,
    },
    timestamp: Date.now(),
  }

  return result
}

// 执行泛光效果
async function executeBloomEffect(parameters) {
  const { enabled, intensity, threshold } = parameters

  const result = {
    tool: 'bloom_effect',
    status: 'success',
    message: `泛光效果 ${enabled ? '已启用' : '已禁用'}`,
    data: {
      enabled,
      intensity,
      threshold,
    },
    timestamp: Date.now(),
  }

  return result
}

// 执行日照效果
async function executeSunlightEffect(parameters) {
  const { start_time, end_time, time_range, date, animation_speed } = parameters

  // 解析时间参数
  const timeParams = parseSunlightTimeParameters(
    start_time,
    end_time,
    time_range,
    date,
    animation_speed,
  )

  const result = {
    tool: 'sunlight_effect',
    status: 'success',
    message: `日照效果已启动，时间范围：${timeParams.startTime} - ${timeParams.endTime}，日期：${timeParams.date}`,
    data: {
      start_time: timeParams.startTime,
      end_time: timeParams.endTime,
      time_range: timeParams.timeRange,
      date: timeParams.date,
      animation_speed: timeParams.animationSpeed,
      sunlight_coverage: 0.8,
      sunlight_direction: '东南方向',
      requires_interaction: false,
      instructions: '正在模拟太阳运动轨迹和光照变化',
    },
    timestamp: Date.now(),
  }

  return result
}

// 解析日照效果时间参数
function parseSunlightTimeParameters(
  start_time,
  end_time,
  time_range,
  date,
  animation_speed,
) {
  const now = new Date()
  const today = now.toISOString().split('T')[0]

  // 默认值
  let analysisDate = date || today
  let startTime = '08:00'
  let endTime = '18:00'
  let timeRange = time_range || '10小时'
  let animationSpeed = animation_speed || 1

  console.log('🔍 解析日照效果时间参数:', {
    start_time,
    end_time,
    time_range,
    date,
    animation_speed,
  })

  // 首先处理自然语言时间范围（如"上午10点到下午4点"）
  if (
    time_range &&
    (time_range.includes('上午') ||
      time_range.includes('下午') ||
      time_range.includes('点到'))
  ) {
    console.log('🔍 解析自然语言时间范围:', time_range)

    // 处理"上午10点到下午4点"格式 - 支持中文数字
    const rangeMatch = time_range.match(
      /(上午|下午)?([零一二两三四五六七八九十百千\d]+)点到(上午|下午)?([零一二两三四五六七八九十百千\d]+)点/,
    )
    if (rangeMatch) {
      const startPeriod = rangeMatch[1] || ''
      const startHour = convertChineseNumber(rangeMatch[2])
      const endPeriod = rangeMatch[3] || ''
      const endHour = convertChineseNumber(rangeMatch[4])

      let parsedStartHour = startHour
      let parsedEndHour = endHour

      // 处理上午/下午
      if (startPeriod === '下午' && startHour < 12) {
        parsedStartHour += 12
      }
      if (endPeriod === '下午' && endHour < 12) {
        parsedEndHour += 12
      }

      // 如果结束时间小于开始时间，假设是跨天
      if (parsedEndHour <= parsedStartHour) {
        parsedEndHour += 12 // 假设结束时间是下午
      }

      startTime = `${parsedStartHour.toString().padStart(2, '0')}:00`
      endTime = `${parsedEndHour.toString().padStart(2, '0')}:00`
      const hours = Math.max(1, parsedEndHour - parsedStartHour)
      timeRange = `${hours}小时`

      console.log('✅ 解析自然语言时间范围成功:', {
        startTime,
        endTime,
        timeRange,
      })
    }
  }

  // 如果提供了开始时间和结束时间，优先解析
  if (start_time && end_time) {
    console.log('🔍 解析开始和结束时间:', { start_time, end_time })
    startTime = parseNaturalTime(start_time)
    endTime = parseNaturalTime(end_time)

    // 计算时间范围
    const startHour = parseInt(startTime.split(':')[0])
    const endHour = parseInt(endTime.split(':')[0])
    const hours = Math.max(1, endHour - startHour)
    timeRange = `${hours}小时`

    console.log('✅ 解析开始结束时间成功:', { startTime, endTime, timeRange })
  } else if (start_time && !end_time) {
    // 如果只提供了开始时间
    startTime = parseNaturalTime(start_time)
    const startHour = parseInt(startTime.split(':')[0])
    endTime = `${(startHour + 6).toString().padStart(2, '0')}:00` // 默认6小时范围
    const hours = 6
    timeRange = `${hours}小时`
    console.log('✅ 解析开始时间成功:', { startTime, endTime, timeRange })
  } else if (end_time && !start_time) {
    // 如果只提供了结束时间
    endTime = parseNaturalTime(end_time)
    const endHour = parseInt(endTime.split(':')[0])
    startTime = `${(endHour - 6).toString().padStart(2, '0')}:00` // 默认6小时范围
    const hours = 6
    timeRange = `${hours}小时`
    console.log('✅ 解析结束时间成功:', { startTime, endTime, timeRange })
  } else if (time_range && time_range.includes('小时')) {
    // 如果提供了时间范围 - 支持中文数字
    const hourMatch = time_range.match(/([零一二两三四五六七八九十百千\d]+)/)
    if (hourMatch) {
      const hours = convertChineseNumber(hourMatch[1])
      startTime = '08:00'
      const startHour = 8
      const endHour = startHour + hours
      endTime = `${endHour.toString().padStart(2, '0')}:00`
      timeRange = `${hours}小时`
      console.log('✅ 解析时间范围成功:', { hours, startTime, endTime })
    }
  }

  // 验证时间格式
  if (!isValidTime(startTime)) {
    startTime = '08:00'
    console.log('⚠️ 开始时间格式无效，使用默认值:', startTime)
  }

  if (!isValidTime(endTime)) {
    endTime = '18:00'
    console.log('⚠️ 结束时间格式无效，使用默认值:', endTime)
  }

  // 验证日期格式
  if (!isValidDate(analysisDate)) {
    analysisDate = today
    console.log('⚠️ 日期格式无效，使用默认值:', analysisDate)
  }

  return {
    startTime,
    endTime,
    timeRange,
    date: analysisDate,
    animationSpeed,
  }
}

// 验证时间格式 (HH:MM)
function isValidTime(time) {
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
  return timeRegex.test(time)
}

// 验证日期格式 (YYYY-MM-DD)
function isValidDate(date) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  return dateRegex.test(date)
}

// 可视域裁剪面绘制功能已移除
// 可视域属性编辑功能已移除

// 执行模型平移
async function executeTranslateModel(parameters) {
  const { x, y, z, model_id } = parameters

  const result = {
    tool: 'translate_model',
    status: 'success',
    message: `模型 ${model_id} 已平移: X=${x}米, Y=${y}米, Z=${z}米`,
    data: {
      model_id,
      translation: { x, y, z },
      operation: 'translate',
    },
    timestamp: Date.now(),
  }

  return result
}

// 执行模型旋转
async function executeRotateModel(parameters) {
  const { x, y, z, model_id } = parameters

  const result = {
    tool: 'rotate_model',
    status: 'success',
    message: `模型 ${model_id} 已旋转: X轴=${x}度, Y轴=${y}度, Z轴=${z}度`,
    data: {
      model_id,
      rotation: { x, y, z },
      operation: 'rotate',
    },
    timestamp: Date.now(),
  }

  return result
}

// 执行模型缩放
async function executeScaleModel(parameters) {
  const { scale_factor, model_id } = parameters

  const result = {
    tool: 'scale_model',
    status: 'success',
    message: `模型 ${model_id} 已缩放: 缩放因子=${scale_factor}`,
    data: {
      model_id,
      scale_factor,
      operation: 'scale',
    },
    timestamp: Date.now(),
  }

  return result
}

// 广播SSE消息
function broadcastSSEMessage(message) {
  sseConnections.forEach((res, clientId) => {
    try {
      res.write(`data: ${JSON.stringify(message)}\n\n`)
    } catch (error) {
      console.error(`向SSE客户端 ${clientId} 发送消息失败:`, error)
      sseConnections.delete(clientId)
    }
  })
}

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    connections: {
      sse: sseConnections.size,
      websocket: wsConnections.size,
    },
  })
})

// 获取可用工具列表
app.get('/mcp/tools', (req, res) => {
  res.json({
    tools: Object.values(SYSTEM_TOOLS),
  })
})

// 启动服务器 - 监听所有网络接口以支持局域网访问
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 MCP服务器运行在端口 ${PORT}`)
  console.log(`📡 SSE端点: http://localhost:${PORT}/mcp/sse`)
  console.log(`📡 局域网访问: http://<本机IP>:${PORT}/mcp/sse`)
  console.log(`🔗 WebSocket端点: ws://localhost:3002`)
  console.log(`🔗 局域网WebSocket: ws://<本机IP>:3002`)
  console.log(`❤️  健康检查: http://localhost:${PORT}/health`)
  console.log(`🛠️  工具列表: http://localhost:${PORT}/mcp/tools`)

  // 自动连接示例数据库
  try {
    const sampleDbPath = path.join(__dirname, 'data', 'sample.db')
    if (fs.existsSync(sampleDbPath)) {
      const connectResult = await DatabaseManager.connect('data/sample.db')
      if (connectResult.success) {
        console.log(`🗄️ 已自动连接示例数据库: data/sample.db`)
      }
    }
  } catch (error) {
    console.log(`⚠️ 自动连接示例数据库失败: ${error.message}`)
  }
})

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...')

  // 关闭所有SSE连接
  sseConnections.forEach((res) => {
    res.end()
  })

  // 关闭所有WebSocket连接
  wsConnections.forEach((ws) => {
    ws.close()
  })

  process.exit(0)
})

// 模型信息管理工具执行函数

// 执行获取模型信息
async function executeGetModelInfo(parameters) {
  try {
    const result = await modelInfoTools.getModelInfo(parameters)
    return {
      tool: 'get_model_info',
      status: result.success ? 'success' : 'error',
      message: result.success ? '模型信息获取成功' : result.error,
      data: result,
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'get_model_info',
      status: 'error',
      message: '获取模型信息失败',
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 执行搜索模型
async function executeSearchModels(parameters) {
  try {
    const result = await modelInfoTools.searchModels(parameters)
    return {
      tool: 'search_models',
      status: result.success ? 'success' : 'error',
      message: result.success
        ? `搜索完成，找到 ${result.total} 个模型`
        : result.error,
      data: result,
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'search_models',
      status: 'error',
      message: '搜索模型失败',
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 执行更新模型信息
async function executeUpdateModelInfo(parameters) {
  try {
    const result = await modelInfoTools.updateModelInfo(parameters)
    return {
      tool: 'update_model_info',
      status: result.success ? 'success' : 'error',
      message: result.success ? result.message : result.error,
      data: result,
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'update_model_info',
      status: 'error',
      message: '更新模型信息失败',
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 执行获取模型统计信息
async function executeGetModelStatistics(parameters) {
  try {
    const result = await modelInfoTools.getModelStatistics(parameters)
    return {
      tool: 'get_model_statistics',
      status: result.success ? 'success' : 'error',
      message: result.success ? '统计信息获取成功' : result.error,
      data: result,
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'get_model_statistics',
      status: 'error',
      message: '获取统计信息失败',
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 执行按分类获取模型
async function executeGetModelsByCategory(parameters) {
  try {
    const result = await modelInfoTools.getModelsByCategory(parameters)
    return {
      tool: 'get_models_by_category',
      status: result.success ? 'success' : 'error',
      message: result.success
        ? `获取 ${result.category} 分类的 ${result.total} 个模型`
        : result.error,
      data: result,
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'get_models_by_category',
      status: 'error',
      message: '按分类获取模型失败',
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 执行注册模型
async function executeRegisterModel(parameters) {
  try {
    const result = await modelInfoTools.registerModel(parameters)
    return {
      tool: 'register_model',
      status: result.success ? 'success' : 'error',
      message: result.success ? result.message : result.error,
      data: result,
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'register_model',
      status: 'error',
      message: '注册模型失败',
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 执行获取所有模型
async function executeDbGetAllModels(parameters) {
  try {
    // 优先从 SQLite 数据库获取
    const dbStatus = DatabaseManager.getConnectionStatus()
    if (dbStatus.connected) {
      const result = DatabaseManager.execute('SELECT * FROM models')
      if (result.success && result.data) {
        const models = result.data.map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category,
          description: row.description,
          file_path: row.file_path,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }))
        return {
          tool: 'db_get_all_models',
          status: 'success',
          message: `从SQLite数据库获取到 ${models.length} 个模型`,
          data: { models, count: models.length, source: 'sqlite' },
          timestamp: Date.now(),
        }
      }
    }

    // 回退到 JSON 数据库
    const models = ModelDatabase.getAll()
    return {
      tool: 'db_get_all_models',
      status: 'success',
      message: `从JSON数据库获取到 ${models.length} 个模型`,
      data: { models, count: models.length, source: 'json' },
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'db_get_all_models',
      status: 'error',
      message: '获取模型列表失败: ' + error.message,
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 执行获取单个模型
async function executeDbGetModel(parameters) {
  try {
    const { model_id } = parameters

    // 优先从 SQLite 数据库获取
    const dbStatus = DatabaseManager.getConnectionStatus()
    if (dbStatus.connected) {
      const result = DatabaseManager.execute(
        'SELECT * FROM models WHERE id = ? OR name = ?',
        [model_id, model_id],
      )
      if (result.success && result.data && result.data.length > 0) {
        const row = result.data[0]
        const model = {
          id: row.id,
          name: row.name,
          category: row.category,
          description: row.description,
          file_path: row.file_path,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }
        return {
          tool: 'db_get_model',
          status: 'success',
          message: '从SQLite获取模型成功',
          data: { model, source: 'sqlite' },
          timestamp: Date.now(),
        }
      }
    }

    // 回退到 JSON 数据库
    const model = ModelDatabase.getById(model_id)
    if (!model) {
      return {
        tool: 'db_get_model',
        status: 'error',
        message: `未找到ID为 ${model_id} 的模型`,
        data: { model_id },
        timestamp: Date.now(),
      }
    }
    return {
      tool: 'db_get_model',
      status: 'success',
      message: '从JSON数据库获取模型成功',
      data: { model, source: 'json' },
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'db_get_model',
      status: 'error',
      message: '获取模型失败: ' + error.message,
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 执行搜索模型
async function executeDbSearchModels(parameters) {
  try {
    const { query } = parameters

    // 优先从 SQLite 数据库搜索
    const dbStatus = DatabaseManager.getConnectionStatus()
    if (dbStatus.connected) {
      const result = DatabaseManager.execute(
        'SELECT * FROM models WHERE name LIKE ? OR description LIKE ? OR category LIKE ?',
        [`%${query}%`, `%${query}%`, `%${query}%`],
      )
      if (result.success && result.data) {
        const models = result.data.map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category,
          description: row.description,
          file_path: row.file_path,
        }))
        return {
          tool: 'db_search_models',
          status: 'success',
          message: `从SQLite找到 ${models.length} 个匹配模型`,
          data: { models, count: models.length, query, source: 'sqlite' },
          timestamp: Date.now(),
        }
      }
    }

    // 回退到 JSON 数据库
    const models = ModelDatabase.search(query)
    return {
      tool: 'db_search_models',
      status: 'success',
      message: `从JSON数据库找到 ${models.length} 个匹配模型`,
      data: { models, count: models.length, query, source: 'json' },
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'db_search_models',
      status: 'error',
      message: '搜索模型失败: ' + error.message,
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 执行添加模型
async function executeDbAddModel(parameters) {
  try {
    const { name, category, description, file_path, properties, tags, color } =
      parameters

    // 优先添加到 SQLite 数据库
    const dbStatus = DatabaseManager.getConnectionStatus()
    if (dbStatus.connected) {
      const result = DatabaseManager.execute(
        'INSERT INTO models (name, category, description, file_path) VALUES (?, ?, ?, ?)',
        [name, category, description || '', file_path || ''],
      )
      if (result.success) {
        const newModel = { name, category, description, file_path }
        return {
          tool: 'db_add_model',
          status: 'success',
          message: '模型添加到SQLite成功',
          data: { model: newModel, source: 'sqlite' },
          timestamp: Date.now(),
        }
      }
    }

    // 回退到 JSON 数据库
    const newModel = ModelDatabase.add({
      name,
      category,
      description,
      file_path,
      properties,
      tags,
      color,
    })
    return {
      tool: 'db_add_model',
      status: 'success',
      message: '模型添加到JSON数据库成功',
      data: { model: newModel, source: 'json' },
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'db_add_model',
      status: 'error',
      message: '添加模型失败: ' + error.message,
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 执行更新模型
async function executeDbUpdateModel(parameters) {
  try {
    const { model_id, updates } = parameters

    // 优先更新 SQLite 数据库
    const dbStatus = DatabaseManager.getConnectionStatus()
    if (dbStatus.connected) {
      const setClauses = []
      const values = []
      if (updates.name) {
        setClauses.push('name = ?')
        values.push(updates.name)
      }
      if (updates.category) {
        setClauses.push('category = ?')
        values.push(updates.category)
      }
      if (updates.description !== undefined) {
        setClauses.push('description = ?')
        values.push(updates.description)
      }
      if (updates.file_path) {
        setClauses.push('file_path = ?')
        values.push(updates.file_path)
      }

      if (setClauses.length > 0) {
        values.push(model_id)
        const sql = `UPDATE models SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? OR name = ?`
        const result = DatabaseManager.execute(sql, values)
        if (result.success && result.data?.changes > 0) {
          return {
            tool: 'db_update_model',
            status: 'success',
            message: '模型在SQLite中更新成功',
            data: { model_id, updates, source: 'sqlite' },
            timestamp: Date.now(),
          }
        }
      }
    }

    // 回退到 JSON 数据库
    const updated = ModelDatabase.update(model_id, updates)
    if (!updated) {
      return {
        tool: 'db_update_model',
        status: 'error',
        message: `未找到ID为 ${model_id} 的模型`,
        data: { model_id },
        timestamp: Date.now(),
      }
    }
    return {
      tool: 'db_update_model',
      status: 'success',
      message: '模型在JSON数据库中更新成功',
      data: { model: updated, source: 'json' },
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'db_update_model',
      status: 'error',
      message: '更新模型失败: ' + error.message,
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 执行删除模型
async function executeDbDeleteModel(parameters) {
  try {
    const { model_id } = parameters

    // 优先从 SQLite 删除
    const dbStatus = DatabaseManager.getConnectionStatus()
    if (dbStatus.connected) {
      const result = DatabaseManager.execute(
        'DELETE FROM models WHERE id = ? OR name = ?',
        [model_id, model_id],
      )
      if (result.success && result.data?.changes > 0) {
        return {
          tool: 'db_delete_model',
          status: 'success',
          message: '模型从SQLite删除成功',
          data: { model_id, source: 'sqlite' },
          timestamp: Date.now(),
        }
      }
    }

    // 回退到 JSON 数据库
    const deleted = ModelDatabase.delete(model_id)
    if (!deleted) {
      return {
        tool: 'db_delete_model',
        status: 'error',
        message: `未找到ID为 ${model_id} 的模型`,
        data: { model_id },
        timestamp: Date.now(),
      }
    }
    return {
      tool: 'db_delete_model',
      status: 'success',
      message: '模型从JSON数据库删除成功',
      data: { model_id, source: 'json' },
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'db_delete_model',
      status: 'error',
      message: '删除模型失败: ' + error.message,
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 执行按分类获取模型
async function executeDbGetByCategory(parameters) {
  try {
    const { category } = parameters

    // 优先从 SQLite 获取
    const dbStatus = DatabaseManager.getConnectionStatus()
    if (dbStatus.connected) {
      const result = DatabaseManager.execute(
        'SELECT * FROM models WHERE category = ?',
        [category],
      )
      if (result.success && result.data) {
        const models = result.data.map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category,
          description: row.description,
          file_path: row.file_path,
        }))
        return {
          tool: 'db_get_by_category',
          status: 'success',
          message: `从SQLite获取分类 "${category}" 下 ${models.length} 个模型`,
          data: { models, count: models.length, category, source: 'sqlite' },
          timestamp: Date.now(),
        }
      }
    }

    // 回退到 JSON 数据库
    const models = ModelDatabase.getByCategory(category)
    return {
      tool: 'db_get_by_category',
      status: 'success',
      message: `从JSON数据库获取分类 "${category}" 下 ${models.length} 个模型`,
      data: { models, count: models.length, category, source: 'json' },
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'db_get_by_category',
      status: 'error',
      message: '按分类获取模型失败: ' + error.message,
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 执行获取统计信息
async function executeDbGetStatistics(parameters) {
  try {
    let stats = {}
    let source = 'json'

    // 优先从 SQLite 获取统计
    const dbStatus = DatabaseManager.getConnectionStatus()
    if (dbStatus.connected) {
      // 获取总模型数
      let result = DatabaseManager.execute(
        'SELECT COUNT(*) as count FROM models',
      )
      const totalModels = result.success ? result.data[0]?.count || 0 : 0

      // 获取分类统计
      result = DatabaseManager.execute(
        'SELECT category, COUNT(*) as count FROM models GROUP BY category',
      )
      const categoryStats = result.success ? result.data : []

      // 获取用户数
      result = DatabaseManager.execute('SELECT COUNT(*) as count FROM users')
      const totalUsers = result.success ? result.data[0]?.count || 0 : 0

      // 获取传感器数
      result = DatabaseManager.execute('SELECT COUNT(*) as count FROM sensors')
      const totalSensors = result.success ? result.data[0]?.count || 0 : 0

      stats = {
        totalModels,
        totalUsers,
        totalSensors,
        categoryStats,
        tables: ['models', 'users', 'sensors', 'analysis_results'],
      }
      source = 'sqlite'
    } else {
      stats = ModelDatabase.getStatistics()
    }

    return {
      tool: 'db_get_statistics',
      status: 'success',
      message: `从${source === 'sqlite' ? 'SQLite' : 'JSON'}数据库获取统计信息成功`,
      data: { ...stats, source },
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'db_get_statistics',
      status: 'error',
      message: '获取统计信息失败',
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 执行高亮模型
async function executeHighlightModel(parameters) {
  try {
    const {
      model_id,
      color = '#FF0000',
      intensity = 1,
      blinking = false,
    } = parameters
    return {
      tool: 'highlight_model',
      status: 'success',
      message: `模型 ${model_id} 高亮成功`,
      data: { model_id, color, intensity, blinking },
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'highlight_model',
      status: 'error',
      message: '高亮模型失败',
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 执行清除高亮
async function executeClearHighlight(parameters) {
  try {
    const { model_id } = parameters
    return {
      tool: 'clear_highlight',
      status: 'success',
      message: model_id ? `已清除模型 ${model_id} 的高亮` : '已清除所有高亮',
      data: { model_id },
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'clear_highlight',
      status: 'error',
      message: '清除高亮失败',
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 执行SQLite数据库连接
async function executeSqlConnect(parameters) {
  try {
    const { db_path } = parameters
    const result = await DatabaseManager.connect(db_path)
    return {
      tool: 'sql_connect',
      status: result.success ? 'success' : 'error',
      message: result.message,
      data: { connId: result.connId, path: result.path },
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'sql_connect',
      status: 'error',
      message: '连接数据库失败: ' + error.message,
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 执行创建内存数据库
async function executeSqlConnectMemory(parameters) {
  try {
    const { name } = parameters
    const result = await DatabaseManager.connectToMemory(name)
    return {
      tool: 'sql_connect_memory',
      status: result.success ? 'success' : 'error',
      message: result.message,
      data: { connId: result.connId },
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'sql_connect_memory',
      status: 'error',
      message: '创建内存数据库失败: ' + error.message,
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 执行断开数据库连接
async function executeSqlDisconnect(parameters) {
  try {
    const { conn_id } = parameters
    const result = DatabaseManager.disconnect(conn_id)
    return {
      tool: 'sql_disconnect',
      status: result.success ? 'success' : 'error',
      message: result.message,
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'sql_disconnect',
      status: 'error',
      message: '断开连接失败: ' + error.message,
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 执行SQL语句
async function executeSqlExecute(parameters) {
  try {
    const { sql, params } = parameters
    const result = DatabaseManager.execute(sql, params || [])
    return {
      tool: 'sql_execute',
      status: result.success ? 'success' : 'error',
      message: result.message,
      data: {
        type: result.type,
        rows: result.data || [],
        changes: result.changes,
        rowCount: result.rowCount,
      },
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'sql_execute',
      status: 'error',
      message: 'SQL执行失败: ' + error.message,
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 获取数据库表列表
async function executeSqlGetTables(parameters) {
  try {
    const result = DatabaseManager.getTables()
    return {
      tool: 'sql_get_tables',
      status: result.success ? 'success' : 'error',
      message: result.message,
      data: { tables: result.tables || [] },
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'sql_get_tables',
      status: 'error',
      message: '获取表列表失败: ' + error.message,
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 获取表结构信息
async function executeSqlGetTableInfo(parameters) {
  try {
    const { table_name } = parameters
    const result = DatabaseManager.getTableInfo(table_name)
    return {
      tool: 'sql_get_table_info',
      status: result.success ? 'success' : 'error',
      message: result.message,
      data: {
        tableName: result.tableName,
        columns: result.columns || [],
      },
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'sql_get_table_info',
      status: 'error',
      message: '获取表结构失败: ' + error.message,
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

// 获取数据库连接状态
async function executeSqlStatus(parameters) {
  try {
    const result = DatabaseManager.getConnectionStatus()
    const connections = DatabaseManager.listAllConnections()
    return {
      tool: 'sql_status',
      status: 'success',
      message: result.message,
      data: {
        connected: result.connected,
        currentPath: result.path,
        isMemory: result.isMemory,
        activeConnections: connections.length,
        connections: connections,
      },
      timestamp: Date.now(),
    }
  } catch (error) {
    return {
      tool: 'sql_status',
      status: 'error',
      message: '获取状态失败: ' + error.message,
      data: { error: error.message },
      timestamp: Date.now(),
    }
  }
}

/**
 * MCP模型信息管理工具
 * 提供模型信息查询、搜索、更新等功能的MCP工具接口
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录路径 (ES模块中的 __dirname 替代方案)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ModelInfoTools {
    constructor() {
        this.modelDatabasePath = path.join(__dirname, 'data', 'model-database.json');
        this.modelDatabase = new Map();
        this.propertyIndex = new Map();
        this.categoryIndex = new Map();
        
        this.initDatabase();
        console.log('📋 MCP模型信息管理工具初始化完成');
    }
    
    /**
     * 初始化数据库
     */
    initDatabase() {
        try {
            // 确保数据目录存在
            const dataDir = path.dirname(this.modelDatabasePath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }
            
            // 加载现有数据库
            if (fs.existsSync(this.modelDatabasePath)) {
                const data = JSON.parse(fs.readFileSync(this.modelDatabasePath, 'utf8'));
                this.importDatabase(data);
                console.log('✅ 模型数据库加载完成:', this.modelDatabase.size);
            } else {
                console.log('ℹ️ 未找到现有数据库，创建新数据库');
                this.createSampleData();
            }
        } catch (error) {
            console.error('❌ 数据库初始化失败:', error);
            this.createSampleData();
        }
    }
    
    /**
     * 创建示例数据
     */
    createSampleData() {
        const sampleModels = [
            {
                modelId: 'building_001',
                name: '行政办公楼',
                category: 'building',
                description: '现代化的行政办公建筑，地上12层，地下2层',
                properties: {
                    height: 48.5,
                    floorArea: 12500,
                    floors: 12,
                    constructionYear: 2020,
                    buildingType: '办公楼',
                    material: '钢筋混凝土',
                    structuralSystem: '框架剪力墙结构'
                },
                tags: ['办公', '现代建筑', '高层建筑'],
                metadata: {
                    created: '2024-01-15T10:00:00Z',
                    updated: '2024-01-15T10:00:00Z',
                    source: 'BIM导入',
                    version: '1.0'
                }
            },
            {
                modelId: 'equipment_001',
                name: '空调机组',
                category: 'equipment',
                description: '中央空调系统主机组',
                properties: {
                    manufacturer: '大金',
                    modelNumber: 'VRV-450',
                    power: 45.5,
                    efficiency: 85.2,
                    installationDate: '2023-06-15'
                },
                tags: ['暖通', '设备', '空调'],
                metadata: {
                    created: '2024-01-16T14:30:00Z',
                    updated: '2024-01-16T14:30:00Z',
                    source: '设备管理系统',
                    version: '1.0'
                }
            },
            {
                modelId: 'vegetation_001',
                name: '银杏树',
                category: 'vegetation',
                description: '成年银杏树，秋季叶色金黄',
                properties: {
                    species: '银杏',
                    age: 25,
                    height: 12.5,
                    crownDiameter: 8.2,
                    ecologicalValue: '高'
                },
                tags: ['乔木', '观赏植物', '秋季景观'],
                metadata: {
                    created: '2024-01-17T09:15:00Z',
                    updated: '2024-01-17T09:15:00Z',
                    source: '景观设计',
                    version: '1.0'
                }
            }
        ];
        
        // 注册示例模型
        for (const model of sampleModels) {
            this.registerModel(model.modelId, model);
        }
        
        console.log('✅ 示例数据创建完成');
    }
    
    /**
     * MCP工具：获取模型信息
     */
    async getModelInfo(params) {
        try {
            const { model_id: modelId } = params;
            
            if (!modelId) {
                return {
                    success: false,
                    error: '缺少模型ID参数'
                };
            }
            
            const modelInfo = this.modelDatabase.get(modelId);
            if (!modelInfo) {
                return {
                    success: false,
                    error: `未找到模型: ${modelId}`
                };
            }
            
            return {
                success: true,
                model: modelInfo
            };
            
        } catch (error) {
            console.error('❌ 获取模型信息失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * MCP工具：搜索模型
     */
    async searchModels(params) {
        try {
            const { query, options = {} } = params;
            
            if (!query) {
                return {
                    success: false,
                    error: '缺少搜索查询参数'
                };
            }
            
            const results = this.performSearch(query, options);
            
            return {
                success: true,
                models: results,
                total: results.length,
                query: query
            };
            
        } catch (error) {
            console.error('❌ 搜索模型失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * MCP工具：更新模型信息
     */
    async updateModelInfo(params) {
        try {
            const { model_id: modelId, updates } = params;
            
            if (!modelId || !updates) {
                return {
                    success: false,
                    error: '缺少必要参数'
                };
            }
            
            const success = this.updateModel(modelId, updates);
            
            if (success) {
                this.saveDatabase();
                return {
                    success: true,
                    message: `模型 ${modelId} 更新成功`
                };
            } else {
                return {
                    success: false,
                    error: '模型更新失败'
                };
            }
            
        } catch (error) {
            console.error('❌ 更新模型信息失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * MCP工具：获取模型统计信息
     */
    async getModelStatistics(params) {
        try {
            const stats = this.getStatistics();
            
            return {
                success: true,
                statistics: stats
            };
            
        } catch (error) {
            console.error('❌ 获取模型统计失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * MCP工具：按分类获取模型
     */
    async getModelsByCategory(params) {
        try {
            const { category } = params;
            
            if (!category) {
                return {
                    success: false,
                    error: '缺少分类参数'
                };
            }
            
            const models = this.getModelsInCategory(category);
            
            return {
                success: true,
                category: category,
                models: models,
                total: models.length
            };
            
        } catch (error) {
            console.error('❌ 按分类获取模型失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * MCP工具：注册新模型
     */
    async registerModel(params) {
        try {
            const { model_id: modelId, model_info: modelInfo } = params;
            
            if (!modelId || !modelInfo) {
                return {
                    success: false,
                    error: '缺少必要参数'
                };
            }
            
            const success = this.registerModelInDatabase(modelId, modelInfo);
            
            if (success) {
                this.saveDatabase();
                return {
                    success: true,
                    message: `模型 ${modelId} 注册成功`
                };
            } else {
                return {
                    success: false,
                    error: '模型注册失败'
                };
            }
            
        } catch (error) {
            console.error('❌ 注册模型失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * 注册模型到数据库
     */
    registerModelInDatabase(modelId, modelInfo) {
        try {
            console.log('📝 注册模型:', modelId);
            
            // 标准化模型信息
            const standardizedInfo = this.standardizeModelInfo(modelId, modelInfo);
            
            // 存储到数据库
            this.modelDatabase.set(modelId, standardizedInfo);
            
            // 建立索引
            this.buildIndexes(modelId, standardizedInfo);
            
            console.log('✅ 模型注册完成:', modelId);
            return true;
            
        } catch (error) {
            console.error('❌ 模型注册失败:', error);
            return false;
        }
    }
    
    /**
     * 标准化模型信息
     */
    standardizeModelInfo(modelId, modelInfo) {
        const templates = {
            building: {
                name: '建筑模型',
                category: 'building',
                properties: {
                    height: { type: 'number', unit: '米', description: '建筑高度' },
                    floorArea: { type: 'number', unit: '平方米', description: '建筑面积' },
                    floors: { type: 'number', unit: '层', description: '楼层数' },
                    constructionYear: { type: 'number', unit: '年', description: '建造年份' },
                    buildingType: { type: 'string', description: '建筑类型' },
                    material: { type: 'string', description: '主要材料' },
                    structuralSystem: { type: 'string', description: '结构系统' }
                }
            },
            infrastructure: {
                name: '基础设施模型',
                category: 'infrastructure',
                properties: {
                    length: { type: 'number', unit: '米', description: '长度' },
                    width: { type: 'number', unit: '米', description: '宽度' },
                    material: { type: 'string', description: '材料' },
                    serviceLife: { type: 'number', unit: '年', description: '使用年限' },
                    maintenanceLevel: { type: 'string', description: '维护等级' }
                }
            },
            equipment: {
                name: '设备模型',
                category: 'equipment',
                properties: {
                    manufacturer: { type: 'string', description: '制造商' },
                    modelNumber: { type: 'string', description: '型号' },
                    power: { type: 'number', unit: '千瓦', description: '功率' },
                    efficiency: { type: 'number', unit: '%', description: '效率' },
                    installationDate: { type: 'date', description: '安装日期' }
                }
            },
            vegetation: {
                name: '植被模型',
                category: 'vegetation',
                properties: {
                    species: { type: 'string', description: '物种' },
                    age: { type: 'number', unit: '年', description: '树龄' },
                    height: { type: 'number', unit: '米', description: '高度' },
                    crownDiameter: { type: 'number', unit: '米', description: '冠幅' },
                    ecologicalValue: { type: 'string', description: '生态价值' }
                }
            }
        };
        
        const template = templates[modelInfo.category] || templates.building;
        
        return {
            id: modelId,
            name: modelInfo.name || template.name,
            category: modelInfo.category || 'building',
            description: modelInfo.description || '',
            properties: { ...template.properties, ...modelInfo.properties },
            tags: modelInfo.tags || [],
            metadata: {
                created: modelInfo.created || new Date().toISOString(),
                updated: new Date().toISOString(),
                source: modelInfo.source || 'unknown',
                version: modelInfo.version || '1.0'
            }
        };
    }
    
    /**
     * 建立索引
     */
    buildIndexes(modelId, modelInfo) {
        // 属性索引
        for (const [key, value] of Object.entries(modelInfo.properties)) {
            if (!this.propertyIndex.has(key)) {
                this.propertyIndex.set(key, new Set());
            }
            this.propertyIndex.get(key).add(modelId);
        }
        
        // 分类索引
        if (!this.categoryIndex.has(modelInfo.category)) {
            this.categoryIndex.set(modelInfo.category, new Set());
        }
        this.categoryIndex.get(modelInfo.category).add(modelId);
        
        // 标签索引
        if (modelInfo.tags) {
            for (const tag of modelInfo.tags) {
                if (!this.propertyIndex.has(tag)) {
                    this.propertyIndex.set(tag, new Set());
                }
                this.propertyIndex.get(tag).add(modelId);
            }
        }
    }
    
    /**
     * 执行搜索
     */
    performSearch(query, options = {}) {
        const results = [];
        const queryLower = query.toLowerCase();
        
        for (const [modelId, modelInfo] of this.modelDatabase) {
            let score = 0;
            
            // 名称匹配
            if (modelInfo.name.toLowerCase().includes(queryLower)) {
                score += 10;
            }
            
            // 描述匹配
            if (modelInfo.description.toLowerCase().includes(queryLower)) {
                score += 5;
            }
            
            // 属性匹配
            for (const [propKey, propValue] of Object.entries(modelInfo.properties)) {
                if (propKey.toLowerCase().includes(queryLower) || 
                    String(propValue).toLowerCase().includes(queryLower)) {
                    score += 3;
                }
            }
            
            // 标签匹配
            if (modelInfo.tags.some(tag => tag.toLowerCase().includes(queryLower))) {
                score += 7;
            }
            
            if (score > 0) {
                results.push({
                    modelId,
                    modelInfo,
                    score
                });
            }
        }
        
        // 按分数排序
        results.sort((a, b) => b.score - a.score);
        
        // 应用过滤
        if (options.limit) {
            return results.slice(0, options.limit);
        }
        
        return results;
    }
    
    /**
     * 更新模型
     */
    updateModel(modelId, updates) {
        try {
            const modelInfo = this.modelDatabase.get(modelId);
            if (!modelInfo) {
                return false;
            }
            
            // 更新属性
            if (updates.properties) {
                Object.assign(modelInfo.properties, updates.properties);
            }
            
            // 更新标签
            if (updates.tags) {
                modelInfo.tags = [...new Set([...modelInfo.tags, ...updates.tags])];
            }
            
            // 更新描述
            if (updates.description) {
                modelInfo.description = updates.description;
            }
            
            // 更新元数据
            modelInfo.metadata.updated = new Date().toISOString();
            
            return true;
            
        } catch (error) {
            console.error('❌ 更新模型失败:', error);
            return false;
        }
    }
    
    /**
     * 获取统计信息
     */
    getStatistics() {
        const stats = {
            totalModels: this.modelDatabase.size,
            categories: {},
            properties: {},
            tags: {}
        };
        
        // 分类统计
        for (const [category, modelIds] of this.categoryIndex) {
            stats.categories[category] = modelIds.size;
        }
        
        // 属性统计
        for (const [property, modelIds] of this.propertyIndex) {
            stats.properties[property] = modelIds.size;
        }
        
        // 标签统计
        for (const [modelId, modelInfo] of this.modelDatabase) {
            if (modelInfo.tags) {
                for (const tag of modelInfo.tags) {
                    stats.tags[tag] = (stats.tags[tag] || 0) + 1;
                }
            }
        }
        
        return stats;
    }
    
    /**
     * 按分类获取模型
     */
    getModelsInCategory(category) {
        const modelIds = this.categoryIndex.get(category);
        if (!modelIds) {
            return [];
        }
        
        return Array.from(modelIds).map(modelId => ({
            modelId,
            modelInfo: this.modelDatabase.get(modelId)
        }));
    }
    
    /**
     * 保存数据库
     */
    saveDatabase() {
        try {
            const data = {
                version: '1.0',
                exportTime: new Date().toISOString(),
                models: Array.from(this.modelDatabase.entries()).map(([modelId, modelInfo]) => ({
                    modelId,
                    ...modelInfo
                })),
                statistics: this.getStatistics()
            };
            
            fs.writeFileSync(this.modelDatabasePath, JSON.stringify(data, null, 2));
            console.log('💾 数据库保存完成');
            
        } catch (error) {
            console.error('❌ 数据库保存失败:', error);
        }
    }
    
    /**
     * 导入数据库
     */
    importDatabase(data) {
        try {
            for (const modelData of data.models) {
                const { modelId, ...modelInfo } = modelData;
                this.modelDatabase.set(modelId, modelInfo);
                this.buildIndexes(modelId, modelInfo);
            }
            console.log('📥 数据库导入完成:', this.modelDatabase.size);
            
        } catch (error) {
            console.error('❌ 数据库导入失败:', error);
        }
    }
    
    /**
     * 获取工具列表
     */
    getTools() {
        return [
            {
                name: 'get_model_info',
                description: '获取指定模型的详细信息，包括属性、分类、标签等',
                inputSchema: {
                    type: 'object',
                    properties: {
                        model_id: {
                            type: 'string',
                            description: '模型ID'
                        }
                    },
                    required: ['model_id']
                }
            },
            {
                name: 'search_models',
                description: '智能搜索模型，支持按名称、属性、标签等进行模糊匹配',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: '搜索查询词'
                        },
                        options: {
                            type: 'object',
                            properties: {
                                category: {
                                    type: 'string',
                                    description: '分类过滤'
                                },
                                limit: {
                                    type: 'number',
                                    description: '结果数量限制'
                                }
                            }
                        }
                    },
                    required: ['query']
                }
            },
            {
                name: 'update_model_info',
                description: '更新模型信息，包括属性、描述、标签等',
                inputSchema: {
                    type: 'object',
                    properties: {
                        model_id: {
                            type: 'string',
                            description: '模型ID'
                        },
                        updates: {
                            type: 'object',
                            properties: {
                                properties: {
                                    type: 'object',
                                    description: '要更新的属性'
                                },
                                description: {
                                    type: 'string',
                                    description: '新的描述'
                                },
                                tags: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: '标签数组'
                                }
                            }
                        }
                    },
                    required: ['model_id', 'updates']
                }
            },
            {
                name: 'get_model_statistics',
                description: '获取模型数据库的统计信息，包括总数、分类分布等',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            },
            {
                name: 'get_models_by_category',
                description: '按分类获取模型列表',
                inputSchema: {
                    type: 'object',
                    properties: {
                        category: {
                            type: 'string',
                            description: '分类名称'
                        }
                    },
                    required: ['category']
                }
            },
            {
                name: 'register_model',
                description: '注册新模型到数据库',
                inputSchema: {
                    type: 'object',
                    properties: {
                        model_id: {
                            type: 'string',
                            description: '模型ID'
                        },
                        model_info: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                category: { type: 'string' },
                                description: { type: 'string' },
                                properties: { type: 'object' },
                                tags: {
                                    type: 'array',
                                    items: { type: 'string' }
                                }
                            }
                        }
                    },
                    required: ['model_id', 'model_info']
                }
            }
        ];
    }
}

export default ModelInfoTools;
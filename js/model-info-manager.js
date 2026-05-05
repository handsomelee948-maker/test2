/**
 * 模型信息管理系统
 * 提供模型属性查询、数据库信息管理以及智能化检索功能
 * 支持通过MCP调用进行模型管理
 */
class ModelInfoManager {
    constructor(viewer, mcpClient) {
        this.viewer = viewer;
        this.mcpClient = mcpClient;
        this.modelDatabase = new Map(); // 模型数据库
        this.propertyIndex = new Map(); // 属性索引
        this.categoryIndex = new Map(); // 分类索引
        this.spatialIndex = new Map(); // 空间索引
        
        // 初始化默认模型属性模板
        this.initDefaultTemplates();
        
        console.log('📋 模型信息管理系统初始化完成');
    }
    
    /**
     * 初始化默认模型属性模板
     */
    initDefaultTemplates() {
        this.propertyTemplates = {
            building: {
                name: '建筑模型',
                category: 'architecture',
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
    }
    
    /**
     * 注册模型信息
     * @param {string} modelId 模型ID
     * @param {Object} modelInfo 模型信息
     */
    registerModel(modelId, modelInfo) {
        try {
            console.log('📝 注册模型信息:', modelId);
            
            // 标准化模型信息
            const standardizedInfo = this.standardizeModelInfo(modelId, modelInfo);
            
            // 存储到数据库
            this.modelDatabase.set(modelId, standardizedInfo);
            
            // 建立索引
            this.buildIndexes(modelId, standardizedInfo);
            
            console.log('✅ 模型信息注册完成:', {
                modelId,
                name: standardizedInfo.name,
                category: standardizedInfo.category,
                propertyCount: Object.keys(standardizedInfo.properties).length
            });
            
            return true;
            
        } catch (error) {
            console.error('❌ 模型信息注册失败:', error);
            return false;
        }
    }
    
    /**
     * 标准化模型信息
     */
    standardizeModelInfo(modelId, modelInfo) {
        const template = this.propertyTemplates[modelInfo.category] || this.propertyTemplates.building;
        
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
     * 查询模型信息
     * @param {string} modelId 模型ID
     * @returns {Object|null} 模型信息
     */
    getModelInfo(modelId) {
        const modelInfo = this.modelDatabase.get(modelId);
        if (!modelInfo) {
            // 尝试从场景实体中提取信息
            return this.extractModelInfoFromScene(modelId);
        }
        return modelInfo;
    }
    
    /**
     * 从场景实体中提取模型信息
     */
    extractModelInfoFromScene(modelId) {
        try {
            const entity = this.findModelEntity(modelId);
            if (!entity) {
                return null;
            }
            
            const position = entity.position?.getValue(SuperMap3D.JulianDate.now());
            const bounds = this.calculateEntityBounds(entity);
            
            return {
                id: entity.id,
                name: entity.name || '未命名模型',
                category: this.inferCategoryFromEntity(entity),
                description: entity.description || '',
                properties: {
                    position: position ? {
                        longitude: SuperMap3D.Math.toDegrees(position.x),
                        latitude: SuperMap3D.Math.toDegrees(position.y),
                        height: position.z
                    } : null,
                    bounds: bounds,
                    visible: entity.show !== false,
                    modelUri: entity.model?.uri?.getValue(),
                    scale: entity.model?.scale?.getValue() || 1.0
                },
                tags: [],
                metadata: {
                    created: new Date().toISOString(),
                    updated: new Date().toISOString(),
                    source: 'scene_extraction',
                    version: '1.0'
                }
            };
            
        } catch (error) {
            console.error('从场景提取模型信息失败:', error);
            return null;
        }
    }
    
    /**
     * 智能搜索模型
     * @param {string} query 搜索查询
     * @param {Object} options 搜索选项
     * @returns {Array} 搜索结果
     */
    searchModels(query, options = {}) {
        try {
            console.log('🔍 智能搜索模型:', { query, options });
            
            const results = [];
            const queryLower = query.toLowerCase();
            
            // 关键词匹配
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
                        score,
                        matchType: this.determineMatchType(queryLower, modelInfo)
                    });
                }
            }
            
            // 按分数排序
            results.sort((a, b) => b.score - a.score);
            
            // 应用过滤选项
            const filteredResults = this.applySearchFilters(results, options);
            
            console.log('✅ 搜索完成:', {
                query,
                totalResults: filteredResults.length,
                topScore: filteredResults[0]?.score || 0
            });
            
            return filteredResults;
            
        } catch (error) {
            console.error('❌ 模型搜索失败:', error);
            return [];
        }
    }
    
    /**
     * 确定匹配类型
     */
    determineMatchType(query, modelInfo) {
        if (modelInfo.name.toLowerCase().includes(query)) {
            return 'name';
        } else if (modelInfo.tags.some(tag => tag.toLowerCase().includes(query))) {
            return 'tag';
        } else if (modelInfo.description.toLowerCase().includes(query)) {
            return 'description';
        } else {
            return 'property';
        }
    }
    
    /**
     * 应用搜索过滤器
     */
    applySearchFilters(results, options) {
        let filtered = [...results];
        
        // 分类过滤
        if (options.category) {
            filtered = filtered.filter(result => 
                result.modelInfo.category === options.category
            );
        }
        
        // 分数阈值
        if (options.minScore) {
            filtered = filtered.filter(result => 
                result.score >= options.minScore
            );
        }
        
        // 结果数量限制
        if (options.limit) {
            filtered = filtered.slice(0, options.limit);
        }
        
        return filtered;
    }
    
    /**
     * 按分类获取模型
     */
    getModelsByCategory(category) {
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
     * 获取模型统计信息
     */
    getModelStatistics() {
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
     * 更新模型信息
     */
    updateModelInfo(modelId, updates) {
        try {
            const modelInfo = this.modelDatabase.get(modelId);
            if (!modelInfo) {
                console.warn('⚠️ 模型不存在:', modelId);
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
            if (updates.version) {
                modelInfo.metadata.version = updates.version;
            }
            
            // 重建索引
            this.rebuildIndexes(modelId);
            
            console.log('✅ 模型信息更新完成:', modelId);
            return true;
            
        } catch (error) {
            console.error('❌ 模型信息更新失败:', error);
            return false;
        }
    }
    
    /**
     * 重建索引
     */
    rebuildIndexes(modelId) {
        // 清除旧索引
        this.clearModelIndexes(modelId);
        
        // 重新建立索引
        const modelInfo = this.modelDatabase.get(modelId);
        if (modelInfo) {
            this.buildIndexes(modelId, modelInfo);
        }
    }
    
    /**
     * 清除模型索引
     */
    clearModelIndexes(modelId) {
        // 从属性索引中移除
        for (const [property, modelIds] of this.propertyIndex) {
            modelIds.delete(modelId);
            if (modelIds.size === 0) {
                this.propertyIndex.delete(property);
            }
        }
        
        // 从分类索引中移除
        for (const [category, modelIds] of this.categoryIndex) {
            modelIds.delete(modelId);
            if (modelIds.size === 0) {
                this.categoryIndex.delete(category);
            }
        }
    }
    
    /**
     * 导出模型数据库
     */
    exportDatabase() {
        const exportData = {
            version: '1.0',
            exportTime: new Date().toISOString(),
            models: Array.from(this.modelDatabase.entries()).map(([modelId, modelInfo]) => ({
                modelId,
                ...modelInfo
            })),
            statistics: this.getModelStatistics()
        };
        
        return exportData;
    }
    
    /**
     * 导入模型数据库
     */
    importDatabase(data) {
        try {
            console.log('📥 导入模型数据库:', data.version);
            
            // 清空现有数据
            this.modelDatabase.clear();
            this.propertyIndex.clear();
            this.categoryIndex.clear();
            this.spatialIndex.clear();
            
            // 导入模型数据
            for (const modelData of data.models) {
                const { modelId, ...modelInfo } = modelData;
                this.modelDatabase.set(modelId, modelInfo);
                this.buildIndexes(modelId, modelInfo);
            }
            
            console.log('✅ 模型数据库导入完成:', this.modelDatabase.size);
            return true;
            
        } catch (error) {
            console.error('❌ 模型数据库导入失败:', error);
            return false;
        }
    }
    
    /**
     * 查找模型实体
     */
    findModelEntity(modelId) {
        const entities = this.viewer.entities.values;
        
        // 处理默认模型ID
        if (modelId === 'default' || modelId === 'current') {
            for (const entity of entities) {
                if (entity.model) {
                    return entity;
                }
            }
            return entities.length > 0 ? entities[0] : null;
        }
        
        for (const entity of entities) {
            if (entity.model && entity.id === modelId) {
                return entity;
            }
            if ((entity.name && entity.name.includes(modelId)) || 
                (entity.description && entity.description.includes(modelId))) {
                return entity;
            }
        }
        
        return entities.length > 0 ? entities[0] : null;
    }
    
    /**
     * 计算实体边界
     */
    calculateEntityBounds(entity) {
        // 简化的边界计算，实际应用中需要更精确的计算
        const position = entity.position?.getValue(SuperMap3D.JulianDate.now());
        if (!position) {
            return null;
        }
        
        return {
            center: position,
            radius: 100 // 默认半径，实际应根据模型大小计算
        };
    }
    
    /**
     * 推断实体分类
     */
    inferCategoryFromEntity(entity) {
        if (entity.name) {
            const name = entity.name.toLowerCase();
            if (name.includes('建筑') || name.includes('楼') || name.includes('house')) {
                return 'building';
            } else if (name.includes('树') || name.includes('绿化') || name.includes('plant')) {
                return 'vegetation';
            } else if (name.includes('设备') || name.includes('equipment')) {
                return 'equipment';
            } else if (name.includes('道路') || name.includes('桥梁') || name.includes('road')) {
                return 'infrastructure';
            }
        }
        return 'unknown';
    }
    
    /**
     * 通过MCP获取模型信息
     */
    async getModelInfoViaMCP(modelId) {
        if (!this.mcpClient) {
            console.warn('⚠️ MCP客户端未连接');
            return null;
        }
        
        try {
            const result = await this.mcpClient.callTool('get_model_info', {
                model_id: modelId
            });
            
            return result;
        } catch (error) {
            console.error('❌ MCP获取模型信息失败:', error);
            return null;
        }
    }
    
    /**
     * 通过MCP搜索模型
     */
    async searchModelsViaMCP(query, options = {}) {
        if (!this.mcpClient) {
            console.warn('⚠️ MCP客户端未连接，使用本地搜索');
            return this.searchModels(query, options);
        }
        
        try {
            const result = await this.mcpClient.callTool('search_models', {
                query: query,
                options: options
            });
            
            return result.models || [];
        } catch (error) {
            console.error('❌ MCP搜索模型失败:', error);
            return this.searchModels(query, options);
        }
    }
    
    /**
     * 通过MCP更新模型信息
     */
    async updateModelInfoViaMCP(modelId, updates) {
        if (!this.mcpClient) {
            console.warn('⚠️ MCP客户端未连接，使用本地更新');
            return this.updateModelInfo(modelId, updates);
        }
        
        try {
            const result = await this.mcpClient.callTool('update_model_info', {
                model_id: modelId,
                updates: updates
            });
            
            // 同时更新本地数据库
            this.updateModelInfo(modelId, updates);
            
            return result.success || false;
        } catch (error) {
            console.error('❌ MCP更新模型信息失败:', error);
            return this.updateModelInfo(modelId, updates);
        }
    }
    
    /**
     * 获取模型数据库状态
     */
    getDatabaseStatus() {
        return {
            totalModels: this.modelDatabase.size,
            totalProperties: this.propertyIndex.size,
            totalCategories: this.categoryIndex.size,
            memoryUsage: {
                database: this.getObjectSize(this.modelDatabase),
                indexes: this.getObjectSize(this.propertyIndex) + this.getObjectSize(this.categoryIndex)
            }
        };
    }
    
    /**
     * 获取对象大小（估算）
     */
    getObjectSize(obj) {
        return JSON.stringify(obj).length;
    }
}

// 导出类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ModelInfoManager;
}
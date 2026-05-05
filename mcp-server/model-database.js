/**
 * 模型数据库管理模块
 * 提供模型的增删改查功能，使用JSON文件存储
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILE = path.join(__dirname, 'model-database.json');

class ModelDatabase {
    constructor() {
        this.models = [];
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(DB_FILE)) {
                const data = fs.readFileSync(DB_FILE, 'utf-8');
                this.models = JSON.parse(data);
            } else {
                this.models = [];
                this.save();
            }
        } catch (error) {
            console.error('加载模型数据库失败:', error);
            this.models = [];
        }
    }

    save() {
        try {
            fs.writeFileSync(DB_FILE, JSON.stringify(this.models, null, 2), 'utf-8');
        } catch (error) {
            console.error('保存模型数据库失败:', error);
        }
    }

    // 获取所有模型
    getAll() {
        return this.models;
    }

    // 根据ID获取模型
    getById(id) {
        return this.models.find(m => m.id === id);
    }

    // 根据名称搜索模型
    search(query) {
        const lowerQuery = query.toLowerCase();
        return this.models.filter(m => 
            m.name.toLowerCase().includes(lowerQuery) ||
            (m.description && m.description.toLowerCase().includes(lowerQuery)) ||
            (m.category && m.category.toLowerCase().includes(lowerQuery))
        );
    }

    // 添加模型
    add(model) {
        const newModel = {
            id: 'model_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...model
        };
        this.models.push(newModel);
        this.save();
        return newModel;
    }

    // 更新模型
    update(id, updates) {
        const index = this.models.findIndex(m => m.id === id);
        if (index === -1) return null;
        
        this.models[index] = {
            ...this.models[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        this.save();
        return this.models[index];
    }

    // 删除模型
    delete(id) {
        const index = this.models.findIndex(m => m.id === id);
        if (index === -1) return false;
        
        this.models.splice(index, 1);
        this.save();
        return true;
    }

    // 按分类获取模型
    getByCategory(category) {
        return this.models.filter(m => m.category === category);
    }

    // 获取所有分类
    getCategories() {
        const categories = new Set();
        this.models.forEach(m => {
            if (m.category) categories.add(m.category);
        });
        return Array.from(categories);
    }

    // 获取统计信息
    getStatistics() {
        return {
            total: this.models.length,
            categories: this.getCategories().length,
            byCategory: this.getCategories().map(cat => ({
                category: cat,
                count: this.getByCategory(cat).length
            }))
        };
    }

    // 批量导入模型
    bulkAdd(models) {
        const newModels = models.map(model => ({
            id: 'model_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...model
        }));
        this.models.push(...newModels);
        this.save();
        return newModels;
    }

    // 清除所有模型
    clear() {
        this.models = [];
        this.save();
    }
}

export default new ModelDatabase();

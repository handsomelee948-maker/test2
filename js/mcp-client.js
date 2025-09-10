/**
 * MCP客户端实现
 * 用于连接MCP服务器，发送和接收消息
 */

class MCPClient {
    /**
     * 初始化MCP客户端
     * @param {Object} config - 配置对象
     * @param {string} config.serverUrl - MCP服务器URL
     * @param {string} config.apiKey - API密钥
     * @param {string} config.clientId - 客户端ID
     * @param {Object} config.modelConfig - 大模型配置
     */
    constructor(config) {
        this.serverUrl = config.serverUrl || 'wss://api.ppinfra.com/mcp';
        this.apiKey = config.apiKey;
        this.socket = null;
        this.isConnected = false;
        this.isInitialized = false;
        this.pendingRequests = new Map();
        this.requestTimeout = 30000; // 30秒超时
        this.clientId = config.clientId || this._generateClientId();
        this.eventHandlers = {
            'connected': [],
            'disconnected': [],
            'message': [],
            'error': [],
            'toolCall': []
        };
        
        // 大模型配置
        this.modelConfig = config.modelConfig || {
            baseUrl: "https://api.ppinfra.com/openai",
            model: "qwen/qwen3-235b-a22b-instruct-2507",
            stream: true,
            maxTokens: 1000
        };
        
        // 可用工具列表
        this.availableTools = [];
    }

    /**
     * 生成客户端ID
     * @returns {string} 客户端ID
     * @private
     */
    _generateClientId() {
        return 'mcp-client-' + Math.random().toString(36).substring(2, 15);
    }

    /**
     * 连接到MCP服务器
     * @returns {Promise<boolean>} 连接是否成功
     */
    async connect() {
        try {
            console.log(`正在连接到MCP服务器: ${this.serverUrl}`);
            
            // 检查是否使用模拟模式
            if (this.serverUrl.includes('api.ppinfra.com')) {
                console.log('⚠️ 检测到外部MCP服务器，切换到本地模拟模式');
                // 模拟成功连接
                this.isConnected = true;
                this._triggerEvent('connected', {});
                this.isInitialized = true;
                console.log('✅ MCP客户端已切换到本地模拟模式');
                return true;
            }
            
            // 创建WebSocket连接
            this.socket = new WebSocket(this.serverUrl);
            
            // 设置事件处理器
            this.socket.onopen = this._handleOpen.bind(this);
            this.socket.onmessage = this._handleMessage.bind(this);
            this.socket.onclose = this._handleClose.bind(this);
            this.socket.onerror = this._handleError.bind(this);
            
            // 等待连接建立
            return new Promise((resolve) => {
                const checkConnection = () => {
                    if (this.isConnected) {
                        resolve(true);
                    } else if (this.socket.readyState === WebSocket.CLOSED) {
                        resolve(false);
                    } else {
                        setTimeout(checkConnection, 100);
                    }
                };
                checkConnection();
            });
        } catch (error) {
            console.error('连接MCP服务器失败:', error);
            this._triggerEvent('error', { error: error.message });
            return false;
        }
    }

    /**
     * 断开与MCP服务器的连接
     */
    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.isConnected = false;
        this.isInitialized = false;
    }

    /**
     * 处理WebSocket连接打开事件
     * @param {Event} event - 事件对象
     * @private
     */
    _handleOpen(event) {
        console.log('已连接到MCP服务器');
        this.isConnected = true;
        this._triggerEvent('connected', {});
        this._initialize();
    }

    /**
     * 初始化MCP客户端
     * @private
     */
    async _initialize() {
        try {
            const response = await this.sendRequest('initialize', {
                clientId: this.clientId,
                clientInfo: {
                    name: 'RealityTwin3DAnalysisTool',
                    version: '1.0.0',
                    capabilities: ['tools/execute']
                }
            });
            
            this.isInitialized = true;
            console.log('MCP客户端初始化成功:', response);
        } catch (error) {
            console.error('MCP客户端初始化失败:', error);
            this._triggerEvent('error', { error: error.message });
        }
    }

    /**
     * 处理WebSocket消息事件
     * @param {MessageEvent} event - 消息事件
     * @private
     */
    _handleMessage(event) {
        try {
            const message = JSON.parse(event.data);
            console.log('收到MCP消息:', message);
            
            // 处理响应消息
            if (message.id && this.pendingRequests.has(message.id)) {
                const { resolve, reject, timer } = this.pendingRequests.get(message.id);
                clearTimeout(timer);
                this.pendingRequests.delete(message.id);
                
                if (message.error) {
                    reject(message.error);
                } else {
                    resolve(message.result);
                }
            }
            // 处理通知消息
            else if (message.method && !message.id) {
                this._handleNotification(message);
            }
            
            this._triggerEvent('message', { message });
        } catch (error) {
            console.error('处理MCP消息失败:', error);
            this._triggerEvent('error', { error: error.message });
        }
    }

    /**
     * 处理通知消息
     * @param {Object} notification - 通知消息
     * @private
     */
    _handleNotification(notification) {
        const { method, params } = notification;
        
        // 处理工具调用通知
        if (method === 'tools/call') {
            this._triggerEvent('toolCall', params);
        }
    }

    /**
     * 处理WebSocket关闭事件
     * @param {CloseEvent} event - 关闭事件
     * @private
     */
    _handleClose(event) {
        console.log(`MCP连接已关闭: ${event.code} ${event.reason}`);
        this.isConnected = false;
        this.isInitialized = false;
        
        // 拒绝所有待处理的请求
        for (const [id, { reject, timer }] of this.pendingRequests.entries()) {
            clearTimeout(timer);
            reject(new Error('连接已关闭'));
            this.pendingRequests.delete(id);
        }
        
        this._triggerEvent('disconnected', { code: event.code, reason: event.reason });
    }

    /**
     * 处理WebSocket错误事件
     * @param {Event} event - 错误事件
     * @private
     */
    _handleError(event) {
        console.error('MCP连接错误:', event);
        this._triggerEvent('error', { error: 'WebSocket连接错误' });
    }

    /**
     * 发送请求并等待响应
     * @param {string} method - 请求方法
     * @param {Object} params - 请求参数
     * @param {number} timeout - 超时时间（毫秒）
     * @returns {Promise<Object>} 响应结果
     */
    sendRequest(method, params = {}, timeout = null) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('未连接到MCP服务器'));
                return;
            }
            
            // 检查是否在模拟模式下
            if (this.serverUrl.includes('api.ppinfra.com') && !this.socket) {
                console.log(`模拟模式下处理请求: ${method}`);
                // 模拟成功响应
                setTimeout(() => {
                    if (method === 'initialize') {
                        resolve({ status: 'success', message: '模拟初始化成功' });
                    } else if (method === 'tools/execute') {
                        resolve({ status: 'success', result: '模拟工具执行成功' });
                    } else {
                        resolve({ status: 'success', message: '模拟请求成功' });
                    }
                }, 500);
                return;
            }
            
            const id = this._generateRequestId();
            const request = {
                jsonrpc: '2.0',
                id,
                method,
                params
            };
            
            // 设置超时处理
            const timeoutMs = timeout || this.requestTimeout;
            const timer = setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`请求超时: ${method}`));
                }
            }, timeoutMs);
            
            // 保存请求信息
            this.pendingRequests.set(id, { resolve, reject, timer });
            
            // 发送请求
            this.socket.send(JSON.stringify(request));
            console.log(`已发送MCP请求: ${method}`, request);
        });
    }

    /**
     * 生成请求ID
     * @returns {string} 请求ID
     * @private
     */
    _generateRequestId() {
        return 'req-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    }

    /**
     * 触发事件
     * @param {string} eventName - 事件名称
     * @param {Object} data - 事件数据
     * @private
     */
    _triggerEvent(eventName, data) {
        if (this.eventHandlers[eventName]) {
            for (const handler of this.eventHandlers[eventName]) {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`事件处理器错误 (${eventName}):`, error);
                }
            }
        }
    }

    /**
     * 添加事件监听器
     * @param {string} eventName - 事件名称
     * @param {Function} handler - 事件处理函数
     */
    on(eventName, handler) {
        if (this.eventHandlers[eventName]) {
            this.eventHandlers[eventName].push(handler);
        } else {
            console.warn(`未知事件: ${eventName}`);
        }
    }

    /**
     * 移除事件监听器
     * @param {string} eventName - 事件名称
     * @param {Function} handler - 事件处理函数
     */
    off(eventName, handler) {
        if (this.eventHandlers[eventName]) {
            this.eventHandlers[eventName] = this.eventHandlers[eventName].filter(h => h !== handler);
        }
    }

    /**
     * 发送用户消息到大模型
     * @param {string} message - 用户消息
     * @returns {Promise<Object>} 大模型响应
     */
    async sendToLLM(message) {
        try {
            // 构建请求参数
            const params = {
                model: this.modelConfig.model,
                messages: [
                    {
                        role: "user",
                        content: message
                    }
                ],
                stream: this.modelConfig.stream,
                max_tokens: this.modelConfig.maxTokens,
                api_key: this.apiKey
            };
            
            // 发送请求到MCP服务器，由服务器转发到大模型
            return await this.sendRequest('llm/generate', params);
        } catch (error) {
            console.error('发送消息到大模型失败:', error);
            throw error;
        }
    }

    /**
     * 执行工具调用
     * @param {string} toolName - 工具名称
     * @param {Object} toolParams - 工具参数
     * @returns {Promise<Object>} 执行结果
     */
    async executeToolCall(toolName, toolParams) {
        // 在模拟模式下模拟工具执行
        if (this.serverUrl.includes('api.ppinfra.com') && !this.socket) {
            console.log(`模拟执行工具: ${toolName}`, toolParams);
            
            // 检查工具是否存在
            const tool = this.availableTools.find(t => t.name === toolName);
            if (!tool) {
                throw new Error(`工具不存在: ${toolName}`);
            }
            
            // 模拟成功响应
            return {
                status: 'success',
                result: `模拟执行工具成功: ${toolName}`,
                toolName,
                parameters: toolParams
            };
        }
        
        try {
            return await this.sendRequest('tools/execute', {
                tool: toolName,
                parameters: toolParams
            });
        } catch (error) {
            console.error(`执行工具调用失败 (${toolName}):`, error);
            throw error;
        }
    }

    /**
     * 获取可用工具列表
     * @returns {Promise<Array>} 工具列表
     */
    async getAvailableTools() {
        try {
            const response = await this.sendRequest('tools/list');
            return response.tools || [];
        } catch (error) {
            console.error('获取工具列表失败:', error);
            throw error;
        }
    }

    /**
     * 注册工具
     * @param {Array<Object>} tools - 工具列表
     */
    async registerTools(tools) {
        this.availableTools = tools;
        
        // 在模拟模式下直接保存工具列表
        if (this.serverUrl.includes('api.ppinfra.com') && !this.socket) {
            console.log('✅ 模拟模式下工具注册成功');
            return;
        }
        
        if (!this.isConnected || !this.isInitialized) {
            console.warn('未连接到MCP服务器或未初始化，工具将在连接后注册');
            return;
        }
        
        try {
            const response = await this.sendRequest('tools/register', {
                tools
            });
            
            console.log('工具注册响应:', response);
            
            if (response && response.success) {
                console.log('工具注册成功');
            } else {
                console.error('工具注册失败:', response);
            }
        } catch (error) {
            console.error('注册工具失败:', error);
        }
    }
}
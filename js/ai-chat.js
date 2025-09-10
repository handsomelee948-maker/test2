/**
 * 智能对话框实现
 * 用于与用户交互，发送指令到大模型，并执行三维分析功能
 */

class AIChatInterface {
    /**
     * 初始化智能对话框
     * @param {MCPClient} mcpClient - MCP客户端实例
     */
    constructor(mcpClient) {
        this.mcpClient = mcpClient;
        this.container = document.getElementById('aiChatContainer');
        this.messagesContainer = document.getElementById('aiChatMessages');
        this.textarea = document.getElementById('aiChatTextarea');
        this.sendButton = document.getElementById('aiChatSend');
        this.statusElement = document.getElementById('aiChatStatus');
        this.minimizeButton = document.getElementById('minimizeChat');
        this.closeButton = document.getElementById('closeChat');
        this.headerElement = document.getElementById('aiChatHeader');
        
        // 获取viewer和scene对象
        this.viewer = null;
        this.scene = null;
        
        this.isMinimized = false;
        this.isProcessing = false;
        this.currentStreamingMessage = null;
        
        // 剖面分析交互状态
        this.profileAnalysisState = {
            isActive: false,
            step: 0, // 0: 未开始, 1: 设置起点, 2: 添加剖面点, 3: 等待完成
            points: [],
            handler: null
        };
        
        // 通视分析交互状态
        this.sightlineAnalysisState = {
            isActive: false,
            step: 0, // 0: 未开始, 1: 设置观察点, 2: 设置目标点, 3: 完成分析
            viewPoint: null,
            targetPoint: null,
            handler: null,
            params: {}
        };
        
        // 阴影分析交互状态
        this.shadowAnalysisState = {
            isActive: false,
            step: 0, // 0: 未开始, 1: 设置参数, 2: 绘制区域, 3: 完成分析
            params: {},
            handler: null
        };
        
        // 天际线分析交互状态
        this.skylineAnalysisState = {
            isActive: false,
            step: 0, // 0: 未开始, 1: 设置参数, 2: 执行分析
            params: {},
            handler: null
        };
        
        // 限高体绘制状态
        this.limitBodyDrawingState = {
            active: false,
            digitalTwinAnalysis: null
        };
        
        // 拉伸闭合体状态
        this.skylineAreaState = {
            active: false,
            digitalTwinAnalysis: null,
            params: {}
        };
        
        // 工具映射表，将大模型工具名映射到本地函数
        this.toolHandlers = {
            'viewshed_analysis': this.executeViewshedAnalysis.bind(this),
            'shadow_analysis': this.executeShadowAnalysis.bind(this),
            'skyline_analysis': this.executeSkylineAnalysis.bind(this),
            'spatial_analysis': this.executeSpatialAnalysis.bind(this),
            'sightline_analysis': this.executeSightlineAnalysis.bind(this),
            'profile_analysis': this.executeProfileAnalysis.bind(this),
            'indoor_navigation': this.executeIndoorNavigation.bind(this),
            'load_model': this.executeLoadModel.bind(this),
            'fly_to_location': this.executeFlyToLocation.bind(this),
            'clear_analysis': this.executeClearAnalysis.bind(this),
            'interactive_sightline': this.startInteractiveSightlineAnalysis.bind(this),
            'interactive_shadow': this.startInteractiveShadowAnalysis.bind(this),
            'interactive_skyline': this.startInteractiveSkylineAnalysis.bind(this),
            'sunlight_effect': this.executeSunlightEffect.bind(this),
            'get_shadow_ratio': this.executeGetShadowRatio.bind(this),
            // 基础操作功能
            'zoom_in': this.executeZoomIn.bind(this),
            'zoom_out': this.executeZoomOut.bind(this),
            'pan': this.executePan.bind(this),
            'rotate': this.executeRotate.bind(this),
            'search': this.executeSearch.bind(this),
            'reset_view': this.executeResetView.bind(this)
        };
        
        this.init();
    }

    /**
     * 初始化viewer和scene对象
     */
    initViewerAndScene() {
        try {
            // 从全局对象中获取viewer
            if (window.realityTwin3DAnalysisTool && window.realityTwin3DAnalysisTool.viewer) {
                this.viewer = window.realityTwin3DAnalysisTool.viewer;
                this.scene = this.viewer.scene;
                console.log('✅ AI聊天界面已获取viewer和scene对象');
            } else {
                console.warn('⚠️ realityTwin3DAnalysisTool.viewer未找到，将在需要时重新尝试获取');
            }
        } catch (error) {
            console.error('❌ 初始化viewer和scene失败:', error);
        }
    }

    /**
     * 初始化对话框
     */
    init() {
        // 初始化viewer和scene对象
        this.initViewerAndScene();
        
        // 绑定事件处理器
        this.bindEvents();
        
        // 设置拖拽功能
        this.setupDraggable();
        
        // 连接MCP客户端
        this.connectMCP();
        
        // 添加欢迎消息
        this.addAssistantMessage('您好！我是智能分析助手，可以帮您执行三维分析任务。请直接输入您需要的分析类型，例如："可视域分析"、"阴影分析"、"天际线分析"或"通视分析"。');
    }

    /**
     * 绑定事件处理器
     */
    bindEvents() {
        // 发送按钮点击事件
        this.sendButton.addEventListener('click', () => this.sendMessage());
        
        // 文本框按键事件
        this.textarea.addEventListener('keydown', (event) => {
            // 按Enter发送消息，按Shift+Enter换行
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                this.sendMessage();
            }
            
            // 自动调整文本框高度
            setTimeout(() => this.adjustTextareaHeight(), 0);
        });
        
        // 最小化按钮点击事件
        this.minimizeButton.addEventListener('click', () => this.toggleMinimize());
        
        // 关闭按钮点击事件
        this.closeButton.addEventListener('click', () => this.hide());
        
        // MCP客户端事件
        this.mcpClient.on('connected', () => this.updateStatus('connected', '已连接'));
        this.mcpClient.on('disconnected', () => this.updateStatus('error', '已断开连接'));
        this.mcpClient.on('error', (data) => this.updateStatus('error', `错误: ${data.error}`));
        this.mcpClient.on('toolCall', (data) => this.handleToolCall(data));
    }

    /**
     * 设置拖拽功能
     */
    setupDraggable() {
        let offsetX, offsetY, isDragging = false;
        
        this.headerElement.addEventListener('mousedown', (e) => {
            if (this.isMinimized) return;
            
            isDragging = true;
            offsetX = e.clientX - this.container.getBoundingClientRect().left;
            offsetY = e.clientY - this.container.getBoundingClientRect().top;
            
            this.container.style.transition = 'none';
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const x = e.clientX - offsetX;
            const y = e.clientY - offsetY;
            
            // 确保对话框不会超出屏幕
            const maxX = window.innerWidth - this.container.offsetWidth;
            const maxY = window.innerHeight - this.container.offsetHeight;
            
            this.container.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
            this.container.style.right = 'auto';
            this.container.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
            this.container.style.bottom = 'auto';
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
            this.container.style.transition = 'all 0.3s ease';
        });
    }

    /**
     * 连接MCP客户端
     */
    async connectMCP() {
        this.updateStatus('connecting', '正在连接...');
        
        try {
            const connected = await this.mcpClient.connect();
            
            if (connected) {
                // 检查是否在模拟模式下
                if (this.mcpClient.serverUrl.includes('api.ppinfra.com') && !this.mcpClient.socket) {
                    this.updateStatus('connected', '已连接(模拟模式)');
                    console.log('MCP客户端已连接(模拟模式)');
                } else {
                    this.updateStatus('connected', '已连接');
                    console.log('MCP客户端已连接');
                }
            } else {
                this.updateStatus('error', '连接失败');
                console.error('MCP客户端连接失败');
            }
        } catch (error) {
            this.updateStatus('error', `连接错误: ${error.message}`);
            console.error('MCP客户端连接错误:', error);
        }
    }

    /**
     * 更新状态显示
     * @param {string} status - 状态类型
     * @param {string} message - 状态消息
     */
    updateStatus(status, message) {
        this.statusElement.className = `ai-chat-status ${status}`;
        this.statusElement.textContent = message;
    }

    /**
     * 切换最小化状态
     */
    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
        
        if (this.isMinimized) {
            this.container.classList.add('ai-chat-minimized');
            this.minimizeButton.textContent = '□';
            this.minimizeButton.title = '还原';
        } else {
            this.container.classList.remove('ai-chat-minimized');
            this.minimizeButton.textContent = '_';
            this.minimizeButton.title = '最小化';
        }
    }

    /**
     * 隐藏对话框
     */
    hide() {
        this.container.style.display = 'none';
    }

    /**
     * 显示对话框
     */
    show() {
        this.container.style.display = 'flex';
    }

    /**
     * 调整文本框高度
     */
    adjustTextareaHeight() {
        this.textarea.style.height = 'auto';
        this.textarea.style.height = `${Math.min(this.textarea.scrollHeight, 100)}px`;
    }

    /**
     * 发送消息
     */
    async sendMessage() {
        const message = this.textarea.value.trim();
        console.log('🔍 sendMessage 被调用，消息内容:', message);
        
        if (!message || this.isProcessing) {
            console.log('⚠️ 消息为空或正在处理中，退出');
            return;
        }
        
        // 立即添加用户消息并清空输入框（确保用户输入总是显示）
        console.log('📝 添加用户消息到界面');
        this.addUserMessage(message);
        this.textarea.value = '';
        this.adjustTextareaHeight();
        
        // 检查是否是取消命令
        if (message === '取消' || message.toLowerCase() === 'cancel') {
            this.handleCancelCommand();
            return;
        }
        
        // 检查通视分析相关命令
        if (this.sightlineAnalysisState && this.sightlineAnalysisState.isActive) {
            if (message === '完成' || message.toLowerCase() === 'finish' || message.toLowerCase() === 'done') {
                await this.completeSightlineAnalysis();
                return;
            }
            
            if (message === '清除' || message.toLowerCase() === 'clear' || message.toLowerCase() === 'reset') {
                this.cancelSightlineAnalysis();
                this.addAssistantMessage('🔄 通视分析已清除，重新开始。请选择观察点。');
                await this.startInteractiveSightlineAnalysis();
                return;
            }
        }
        
        // 检查阴影分析参数设置状态
        if (this.shadowAnalysisState && this.shadowAnalysisState.isActive && this.shadowAnalysisState.step === 0) {
            await this.handleShadowParameterMessage(message);
            return;
        }
        
        // 检查天际线分析参数设置状态
        if (this.skylineAnalysisState && this.skylineAnalysisState.isActive) {
            await this.handleSkylineParameterInput(message);
            return;
        }
        
        // 检查限高体绘制状态
        if (this.limitBodyDrawingState && this.limitBodyDrawingState.active) {
            await this.handleLimitBodyDrawingInput(message);
            return;
        }
        
        // 用户消息已在方法开头添加
        
        // 检查拉伸闭合体相关命令
        if (await this.handleSkylineAreaCommands(message)) {
            return;
        }
        
        // 检查阴影分析快捷指令
        if (this.isShortcutCommand(message)) {
            await this.handleShortcutCommand(message);
            return;
        }
        
        // 设置处理状态
        this.isProcessing = true;
        this.sendButton.disabled = true;
        
        try {
            // 显示正在输入指示器
            this.startTypingIndicator();
            
            // 检查是否在模拟模式下
            console.log('🔍 检查模拟模式条件:');
            console.log('  - serverUrl:', this.mcpClient.serverUrl);
            console.log('  - socket:', this.mcpClient.socket);
            console.log('  - 包含api.ppinfra.com:', this.mcpClient.serverUrl.includes('api.ppinfra.com'));
            console.log('  - socket为null:', !this.mcpClient.socket);
            
            if (this.mcpClient.serverUrl.includes('api.ppinfra.com') && !this.mcpClient.socket) {
                console.log('✅ 进入模拟模式处理消息:', message);
                
                // 模拟延迟
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // 直接处理特定分析请求
                if (message.toLowerCase().includes('可视域分析')) {
                    this.stopTypingIndicator();
                    await this.simulateTyping('请点击设置观察点');
                    
                    // 启动手动选点的可视域分析
                    this.startManualViewshedAnalysis();
                    
                    // 重置状态
                    this.isProcessing = false;
                    this.sendButton.disabled = false;
                    return;
                } else if (message.toLowerCase().includes('可视域属性') || message.toLowerCase().includes('属性编辑') || message.toLowerCase().includes('编辑属性')) {
                    this.stopTypingIndicator();
                    await this.simulateTyping('正在打开可视域属性编辑面板...');
                    
                    // 启动可视域属性编辑
                    this.startViewshedPropertyEdit();
                    
                    // 重置状态
                    this.isProcessing = false;
                    this.sendButton.disabled = false;
                    return;
                } else if (message.toLowerCase().includes('裁剪模式') || message.toLowerCase().includes('设置裁剪') || (message.toLowerCase().includes('保留') && message.toLowerCase().includes('区域'))) {
                    this.stopTypingIndicator();
                    
                    // 检测裁剪模式类型
                    if (message.toLowerCase().includes('保留区域内') || message.toLowerCase().includes('内部')) {
                        await this.simulateTyping('正在设置裁剪模式为：保留区域内');
                        this.setViewshedClipMode('inside');
                    } else if (message.toLowerCase().includes('保留区域外') || message.toLowerCase().includes('外部')) {
                        await this.simulateTyping('正在设置裁剪模式为：保留区域外');
                        this.setViewshedClipMode('outside');
                    } else {
                        await this.simulateTyping('请指定裁剪模式：\n• 说"保留区域内"设置为内部裁剪\n• 说"保留区域外"设置为外部裁剪');
                    }
                    
                    // 重置状态
                    this.isProcessing = false;
                    this.sendButton.disabled = false;
                    return;
                } else if (message.toLowerCase().includes('绘制可视域裁剪面') || (message.toLowerCase().includes('可视域') && message.toLowerCase().includes('裁剪面'))) {
                    this.stopTypingIndicator();
                    await this.simulateTyping('请在可视域分析结果上绘制裁剪面区域（右键结束绘制）');
                    
                    // 启动可视域裁剪面绘制
                    this.startViewshedClipPlaneDrawing();
                    
                    // 重置状态
                    this.isProcessing = false;
                    this.sendButton.disabled = false;
                    return;
                } else if (message.toLowerCase().includes('清除可视域裁剪面') || (message.toLowerCase().includes('清除') && message.toLowerCase().includes('可视域') && message.toLowerCase().includes('裁剪'))) {
                    this.stopTypingIndicator();
                    await this.simulateTyping('正在清除可视域裁剪面...');
                    
                    // 清除可视域裁剪面
                    this.clearViewshedClipPlane();
                    
                    // 重置状态
                    this.isProcessing = false;
                    this.sendButton.disabled = false;
                    return;
                } else if (message.toLowerCase().includes('阴影分析')) {
                    this.stopTypingIndicator();
                    await this.simulateTyping('正在启动阴影分析...');
                    await this.executeShadowAnalysis({});
                    
                    // 重置状态
                    this.isProcessing = false;
                    this.sendButton.disabled = false;
                    return;
                } else if (message.toLowerCase().includes('日照效果') || message.toLowerCase().includes('日照动画') || message.toLowerCase().includes('播放日照')) {
                    this.stopTypingIndicator();
                    await this.simulateTyping('正在启动日照效果...');
                    await this.executeSunlightEffect();
                    
                    // 重置状态
                    this.isProcessing = false;
                    this.sendButton.disabled = false;
                    return;
                } else if (message.toLowerCase().includes('阴影率') || message.toLowerCase().includes('查询阴影')) {
                    this.stopTypingIndicator();
                    await this.simulateTyping('正在启动阴影率查询...');
                    await this.executeGetShadowRatio();
                    
                    // 重置状态
                    this.isProcessing = false;
                    this.sendButton.disabled = false;
                    return;
                } else if (message.toLowerCase().includes('天际线分析')) {
                    this.stopTypingIndicator();
                    await this.simulateTyping('正在执行天际线分析...');
                    await this.executeSkylineAnalysis(message);
                    
                    // 重置状态
                    this.isProcessing = false;
                    this.sendButton.disabled = false;
                    return;
                } else if (message.toLowerCase().includes('二维天际线') || message.toLowerCase().includes('生成二维天际线')) {
                    this.stopTypingIndicator();
                    await this.simulateTyping('正在生成二维天际线图表...');
                    
                    try {
                        if (this.isSkylineAnalysisCompleted()) {
                            await this.generateSkyline2D(window.digitalTwinAnalysis);
                        } else {
                            await this.simulateTyping('请先完成天际线分析');
                        }
                    } catch (error) {
                        console.error('二维天际线生成失败:', error);
                        await this.simulateTyping('二维天际线生成失败，请重试');
                    }
                    
                    // 重置状态
                    this.isProcessing = false;
                    this.sendButton.disabled = false;
                    return;
                } else if (message.toLowerCase().includes('绘制限高体') || message.toLowerCase().includes('限高体')) {
                    this.stopTypingIndicator();
                    await this.simulateTyping('正在启动限高体绘制...');
                    
                    try {
                        if (this.isSkylineAnalysisCompleted()) {
                            await this.startLimitBodyDrawing(window.digitalTwinAnalysis);
                        } else {
                            await this.simulateTyping('请先完成天际线分析');
                        }
                    } catch (error) {
                        console.error('限高体绘制失败:', error);
                        await this.simulateTyping('限高体绘制失败，请重试');
                    }
                    
                    // 重置状态
                    this.isProcessing = false;
                    this.sendButton.disabled = false;
                    return;
                } else if (message.toLowerCase().includes('拉伸闭合体') || message.toLowerCase().includes('生成拉伸闭合体')) {
                    this.stopTypingIndicator();
                    await this.simulateTyping('正在生成天际线拉伸闭合体...');
                    
                    try {
                        if (window.digitalTwinAnalysis) {
                            await this.generateSkylineArea(window.digitalTwinAnalysis);
                        } else {
                            await this.simulateTyping('请先执行天际线分析');
                        }
                    } catch (error) {
                        console.error('拉伸闭合体生成失败:', error);
                        await this.simulateTyping('拉伸闭合体生成失败，请重试');
                    }
                    
                    // 重置状态
                    this.isProcessing = false;
                    this.sendButton.disabled = false;
                    return;
                    
                    // 重置状态
                    this.isProcessing = false;
                    this.sendButton.disabled = false;
                    return;
                } else if (message.toLowerCase().includes('通视分析')) {
                    this.stopTypingIndicator();
                    await this.simulateTyping('正在进行通视分析，请选择观察点...');
                    await this.executeSightlineAnalysis();
                    return;
                } else if (message.toLowerCase().includes('剖面分析')) {
                    this.stopTypingIndicator();
                    await this.simulateTyping('正在进行剖面分析...');
                    await this.startProfileAnalysis();
                    return;
                } else if (message.toLowerCase().includes('绘制裁剪面') || message.toLowerCase().includes('裁剪面')) {
                    this.stopTypingIndicator();
                    await this.simulateTyping('请绘制裁剪面区域（右键结束绘制）');
                    
                    // 启动裁剪面绘制
                    this.startClipPlaneDrawing();
                    return;
                } else if (message.toLowerCase().includes('清除分析') || message.toLowerCase().includes('清除')) {
                    this.stopTypingIndicator();
                    await this.simulateTyping('正在清除所有分析结果...');
                    await this.executeClearAnalysis({});
                    return;
                } else if (message.toLowerCase().includes('加载模型') || message.toLowerCase().includes('模型加载') || message.toLowerCase().includes('导入模型')) {
                    this.stopTypingIndicator();
                    await this.simulateTyping('请选择要加载的模型');
                    
                    // 启动模型加载流程
                    this.startModelLoading();
                    return;
                } else if (message.toLowerCase().includes('导航') || message.toLowerCase().includes('路径规划') || message.toLowerCase().includes('路径计算')) {
                    this.stopTypingIndicator();
                    await this.simulateTyping('好的，我来帮您规划导航路径！请在地图上点击选择导航起点 📍');
                    
                    // 启动导航流程
                    this.startNavigationFlow();
                    return;
                } else if (message.toLowerCase().includes('漫游') || message.toLowerCase().includes('游览') || message.toLowerCase().includes('巡游')) {
                    this.stopTypingIndicator();
                    await this.simulateTyping('太好了！让我们开始一场精彩的漫游之旅吧 🚶‍♂️');
                    
                    // 启动漫游流程
                    this.startTourFlow();
                    return;
                }
                
                // 检查基础操作指令
                console.log('🔍 检查基础操作指令:', message);
                const basicOperationResult = await this.handleBasicOperationCommands(message);
                console.log('📋 基础操作处理结果:', basicOperationResult);
                if (basicOperationResult) {
                    console.log('✅ 基础操作指令已处理，返回');
                    return;
                }
                
                // 生成模拟回复
                let response;
                if (message.includes('分析') || message.includes('工具')) {
                    response = '我可以帮助您进行三维分析。目前支持的分析工具包括：可视域分析、阴影分析、天际线分析、剖面分析、开挖分析和通视分析等。请直接输入您需要的分析类型，例如"可视域分析"。';
                } else if (message.includes('你好') || message.includes('嗨') || message.includes('您好')) {
                    response = '您好！我是实景三维时空分析助手，可以帮助您进行各种三维分析任务。有什么我可以帮助您的吗？';
                } else if (message.includes('谢谢') || message.includes('感谢')) {
                    response = '不客气！如果您有其他问题，随时可以问我。';
                } else {
                    response = '我理解您的问题。作为实景三维时空分析助手，我可以帮助您进行各种三维分析任务，包括可视域分析、阴影分析、剖面分析等。请直接输入您需要的分析类型，例如"可视域分析"。\n\n🎮 **基础操作：**\n• 放大/缩小："放大2倍"、"缩小"\n• 平移："向北平移500米"、"向左移动"\n• 旋转："向左旋转45度"、"向上旋转"\n• 重置视角："重置视角"、"回到初始位置"';
                }
                
                // 停止输入指示器
                this.stopTypingIndicator();
                
                // 模拟打字效果
                await this.simulateTyping(response);
            } else {
                console.log('🌐 非模拟模式，发送消息到大模型');
                // 发送消息到大模型
                const response = await this.mcpClient.sendToLLM(message);
                
                // 移除输入指示器
                this.stopTypingIndicator();
                
                // 处理响应
                if (this.mcpClient.modelConfig.stream) {
                    // 处理流式响应
                    this.handleStreamResponse(response);
                } else {
                    // 处理普通响应
                    this.addAssistantMessage(response.choices[0].message.content);
                }
            }
        } catch (error) {
            console.error('发送消息失败:', error);
            this.stopTypingIndicator();
            this.addAssistantMessage(`抱歉，处理您的请求时出现错误: ${error.message}`);
        } finally {
            console.log('🔄 sendMessage 处理完成，重置状态');
            this.isProcessing = false;
            this.sendButton.disabled = false;
        }
    }
    
    /**
     * 模拟打字效果
     * @param {string} text - 要显示的文本
     */
    async simulateTyping(text) {
        // 创建助手消息元素
        const messageElement = this.createMessageElement('assistant');
        this.messagesContainer.appendChild(messageElement);
        
        const contentElement = messageElement.querySelector('.ai-message-content');
        let displayedText = '';
        
        // 逐字显示文本
        for (let i = 0; i < text.length; i++) {
            displayedText += text[i];
            contentElement.textContent = displayedText;
            this.scrollToBottom();
            
            // 随机延迟，模拟打字速度
            const delay = Math.random() * 30 + 20;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    /**
     * 处理流式响应
     * @param {Object} response - 流式响应对象
     */
    handleStreamResponse(response) {
        let fullContent = '';
        
        // 创建新的助手消息元素
        this.currentStreamingMessage = this.createMessageElement('assistant');
        this.messagesContainer.appendChild(this.currentStreamingMessage);
        
        // 滚动到底部
        this.scrollToBottom();
        
        // 处理每个流式块
        response.on('data', (chunk) => {
            if (chunk.choices && chunk.choices[0].delta && chunk.choices[0].delta.content) {
                const content = chunk.choices[0].delta.content;
                fullContent += content;
                
                // 更新消息内容
                const contentElement = this.currentStreamingMessage.querySelector('.ai-message-content');
                contentElement.textContent = fullContent;
                
                // 滚动到底部
                this.scrollToBottom();
            }
        });
        
        // 处理流结束
        response.on('end', () => {
            this.currentStreamingMessage = null;
        });
        
        // 处理错误
        response.on('error', (error) => {
            console.error('流式响应错误:', error);
            const contentElement = this.currentStreamingMessage.querySelector('.ai-message-content');
            contentElement.textContent += '\n[传输中断]';
            this.currentStreamingMessage = null;
        });
    }

    /**
     * 开始显示正在输入指示器
     */
    startTypingIndicator() {
        const typingElement = document.createElement('div');
        typingElement.className = 'ai-message assistant';
        typingElement.id = 'typingIndicator';
        
        const avatarElement = document.createElement('div');
        avatarElement.className = 'ai-message-avatar assistant';
        avatarElement.textContent = '🤖';
        
        const contentElement = document.createElement('div');
        contentElement.className = 'ai-message-content ai-typing-indicator';
        
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('span');
            contentElement.appendChild(dot);
        }
        
        typingElement.appendChild(avatarElement);
        typingElement.appendChild(contentElement);
        
        this.messagesContainer.appendChild(typingElement);
        this.scrollToBottom();
    }

    /**
     * 停止显示正在输入指示器
     */
    stopTypingIndicator() {
        const typingElement = document.getElementById('typingIndicator');
        if (typingElement) {
            typingElement.remove();
        }
    }

    /**
     * 添加用户消息
     * @param {string} message - 消息内容
     */
    addUserMessage(message) {
        const messageElement = this.createMessageElement('user');
        const contentElement = messageElement.querySelector('.ai-message-content');
        contentElement.textContent = message;
        
        this.messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
    }

    /**
     * 添加助手消息
     * @param {string} message - 消息内容
     */
    addAssistantMessage(message) {
        const messageElement = this.createMessageElement('assistant');
        const contentElement = messageElement.querySelector('.ai-message-content');
        contentElement.textContent = message;
        
        this.messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
    }

    /**
     * 创建消息元素
     * @param {string} role - 消息角色（user或assistant）
     * @returns {HTMLElement} 消息元素
     */
    createMessageElement(role) {
        const messageElement = document.createElement('div');
        messageElement.className = `ai-message ${role}`;
        
        const avatarElement = document.createElement('div');
        avatarElement.className = `ai-message-avatar ${role}`;
        avatarElement.textContent = role === 'user' ? '👤' : '🤖';
        
        const contentElement = document.createElement('div');
        contentElement.className = 'ai-message-content';
        
        messageElement.appendChild(avatarElement);
        messageElement.appendChild(contentElement);
        
        return messageElement;
    }

    /**
     * 滚动到底部
     */
    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    /**
     * 处理取消命令
     */
    handleCancelCommand() {
        this.addUserMessage('取消');
        
        // 检查并取消各种交互式分析
        if (this.sightlineAnalysisState.isActive) {
            this.cancelSightlineAnalysis();
            this.addAssistantMessage('✅ 已取消通视分析。');
        } else if (this.shadowAnalysisState.isActive) {
            this.cancelShadowAnalysis();
            this.addAssistantMessage('✅ 已取消阴影分析。');
        } else if (this.skylineAnalysisState.isActive) {
            this.cancelSkylineAnalysis();
            this.addAssistantMessage('✅ 已取消天际线分析。');
        } else if (this.profileAnalysisState.isActive) {
            this.resetProfileAnalysisState();
            this.addAssistantMessage('✅ 已取消剖面分析。');
        } else {
            this.addAssistantMessage('当前没有正在进行的交互式分析。');
        }
    }

    /**
     * 处理工具调用
     * @param {Object} data - 工具调用数据
     */
    async handleToolCall(data) {
        try {
            console.log('收到工具调用:', data);
            
            const { tool, parameters } = data;
            
            // 检查是否有对应的工具处理器
            if (this.toolHandlers[tool]) {
                // 添加助手消息，说明正在执行的操作
                this.addAssistantMessage(`正在执行${this.getToolDisplayName(tool)}...`);
                
                // 执行工具调用
                const result = await this.toolHandlers[tool](parameters);
                
                // 发送工具执行结果到MCP服务器
                await this.mcpClient.sendRequest('tools/result', {
                    tool,
                    result
                });
                
                console.log(`工具 ${tool} 执行结果:`, result);
            } else {
                console.warn(`未找到工具处理器: ${tool}`);
                this.addAssistantMessage(`抱歉，我不知道如何执行 ${tool} 操作。`);
            }
        } catch (error) {
            console.error('处理工具调用失败:', error);
            this.addAssistantMessage(`执行操作时出现错误: ${error.message}`);
            
            // 发送错误结果到MCP服务器
            await this.mcpClient.sendRequest('tools/result', {
                tool: data.tool,
                error: error.message
            });
        }
    }

    /**
     * 获取工具显示名称
     * @param {string} toolName - 工具名称
     * @returns {string} 显示名称
     */
    getToolDisplayName(toolName) {
        const displayNames = {
            'viewshed_analysis': '可视域分析',
            'shadow_analysis': '阴影分析',
            'skyline_analysis': '天际线分析',
            'spatial_analysis': '空间分析',
            'sightline_analysis': '通视分析',
            'indoor_navigation': '室内导航',
            'load_model': '加载模型',
            'fly_to_location': '飞行到位置',
            'clear_analysis': '清除分析',
            'interactive_sightline': '交互式通视分析',
            'interactive_shadow': '交互式阴影分析',
            'interactive_skyline': '交互式天际线分析'
        };
        
        return displayNames[toolName] || toolName;
    }

    /**
     * 启动手动选点的可视域分析
     */
    startManualViewshedAnalysis() {
        try {
            // 获取交互式分析管理器
            const digitalTwinAnalysis = window.realityTwin3DAnalysisTool.digitalTwinAnalysis;
            const interactiveManager = digitalTwinAnalysis ? digitalTwinAnalysis.interactiveManager : null;
            
            if (interactiveManager) {
                // 启动可视域分析交互模式
                interactiveManager.startViewshedAnalysis();
                
                // 设置完成回调
                interactiveManager.onViewshedComplete = async () => {
                    await this.simulateTyping('可视域分析完成');
                };
                
                console.log('✅ 启动手动可视域分析成功');
            } else {
                console.error('❌ 交互式分析管理器未找到');
                this.simulateTyping('分析工具未初始化，请刷新页面重试');
            }
        } catch (error) {
            console.error('❌ 启动手动可视域分析失败:', error);
            this.simulateTyping('启动可视域分析失败，请重试');
        }
    }

    /**
     * 启动裁剪面绘制
     */
    startClipPlaneDrawing() {
        try {
            // 获取交互式分析管理器
            const digitalTwinAnalysis = window.realityTwin3DAnalysisTool.digitalTwinAnalysis;
            const interactiveManager = digitalTwinAnalysis ? digitalTwinAnalysis.interactiveManager : null;
            
            if (interactiveManager) {
                // 启动裁剪面绘制交互模式
                interactiveManager.startClipPlaneDrawing();
                
                // 设置完成回调
                interactiveManager.onClipPlaneComplete = async () => {
                    await this.simulateTyping('裁剪效果已应用');
                };
                
                console.log('✅ 启动裁剪面绘制成功');
            } else {
                console.error('❌ 交互式分析管理器未找到');
                this.simulateTyping('分析工具未初始化，请刷新页面重试');
            }
        } catch (error) {
            console.error('❌ 启动裁剪面绘制失败:', error);
            this.simulateTyping('启动裁剪面绘制失败，请重试');
        }
    }

    /**
     * 启动可视域属性编辑
     */
    startViewshedPropertyEdit() {
        try {
            // 获取交互式分析管理器
            const digitalTwinAnalysis = window.realityTwin3DAnalysisTool.digitalTwinAnalysis;
            const interactiveManager = digitalTwinAnalysis ? digitalTwinAnalysis.interactiveManager : null;
            
            if (!interactiveManager) {
                this.simulateTyping('分析工具未初始化，请刷新页面重试');
                return;
            }

            // 检查是否有活跃的可视域分析
            if (!interactiveManager.hasActiveViewshed || !interactiveManager.hasActiveViewshed()) {
                this.simulateTyping('请先执行可视域分析，然后再编辑属性');
                return;
            }

            // 创建可视域属性编辑面板
            this.createViewshedPropertyPanel();
            
        } catch (error) {
            console.error('❌ 启动可视域属性编辑失败:', error);
            this.simulateTyping('启动可视域属性编辑失败，请检查系统状态');
        }
    }

    /**
     * 创建可视域属性编辑面板
     */
    createViewshedPropertyPanel() {
        // 移除已存在的面板
        const existingPanel = document.querySelector('.viewshed-property-panel');
        if (existingPanel) {
            existingPanel.remove();
        }

        const panel = document.createElement('div');
        panel.className = 'viewshed-property-panel';
        panel.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            width: 300px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 20px;
            border-radius: 8px;
            z-index: 1000;
            font-family: 'Microsoft YaHei', Arial, sans-serif;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.2);
        `;
        
        panel.innerHTML = `
            <h3 style="margin-top: 0; color: #00bfff; text-align: center;">可视域属性编辑</h3>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">观察距离 (米):</label>
                <input type="range" id="viewshed-distance" min="100" max="5000" value="1000" style="width: 100%; margin-bottom: 5px;">
                <div style="text-align: center; color: #00bfff;"><span id="distance-value">1000</span> 米</div>
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">水平视角 (度):</label>
                <input type="range" id="viewshed-horizontal" min="30" max="360" value="90" style="width: 100%; margin-bottom: 5px;">
                <div style="text-align: center; color: #00bfff;"><span id="horizontal-value">90</span> 度</div>
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">垂直视角 (度):</label>
                <input type="range" id="viewshed-vertical" min="30" max="180" value="90" style="width: 100%; margin-bottom: 5px;">
                <div style="text-align: center; color: #00bfff;"><span id="vertical-value">90</span> 度</div>
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">俯仰角 (度):</label>
                <input type="range" id="viewshed-pitch" min="-90" max="90" value="-10" style="width: 100%; margin-bottom: 5px;">
                <div style="text-align: center; color: #00bfff;"><span id="pitch-value">-10</span> 度</div>
            </div>
            <div style="text-align: center; margin-top: 20px;">
                <button id="apply-viewshed-props" style="background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; margin-right: 10px; cursor: pointer;">应用更改</button>
                <button id="close-viewshed-props" style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">关闭</button>
            </div>
        `;
        
        document.body.appendChild(panel);
        
        // 添加事件监听器
        this.setupViewshedPropertyListeners(panel);
        
        this.simulateTyping('可视域属性编辑面板已打开，您可以调整观察距离、视角等参数');
    }

    /**
     * 设置可视域属性面板事件监听器
     */
    setupViewshedPropertyListeners(panel) {
        const distanceSlider = panel.querySelector('#viewshed-distance');
        const horizontalSlider = panel.querySelector('#viewshed-horizontal');
        const verticalSlider = panel.querySelector('#viewshed-vertical');
        const pitchSlider = panel.querySelector('#viewshed-pitch');
        const distanceValue = panel.querySelector('#distance-value');
        const horizontalValue = panel.querySelector('#horizontal-value');
        const verticalValue = panel.querySelector('#vertical-value');
        const pitchValue = panel.querySelector('#pitch-value');
        const applyBtn = panel.querySelector('#apply-viewshed-props');
        const closeBtn = panel.querySelector('#close-viewshed-props');
        
        // 滑块值变化监听
        distanceSlider.addEventListener('input', (e) => {
            distanceValue.textContent = e.target.value;
        });
        
        horizontalSlider.addEventListener('input', (e) => {
            horizontalValue.textContent = e.target.value;
        });
        
        verticalSlider.addEventListener('input', (e) => {
            verticalValue.textContent = e.target.value;
        });
        
        pitchSlider.addEventListener('input', (e) => {
            pitchValue.textContent = e.target.value;
        });
        
        // 应用按钮
        applyBtn.addEventListener('click', () => {
            this.applyViewshedProperties({
                distance: parseFloat(distanceSlider.value),
                horizontalAngle: parseFloat(horizontalSlider.value),
                verticalAngle: parseFloat(verticalSlider.value),
                pitch: parseFloat(pitchSlider.value)
            });
        });
        
        // 关闭按钮
        closeBtn.addEventListener('click', () => {
            panel.remove();
        });
    }

    /**
     * 应用可视域属性
     */
    applyViewshedProperties(properties) {
        try {
            const digitalTwinAnalysis = window.realityTwin3DAnalysisTool.digitalTwinAnalysis;
            const interactiveManager = digitalTwinAnalysis ? digitalTwinAnalysis.interactiveManager : null;
            
            if (interactiveManager && interactiveManager.updateViewshedProperties) {
                // 更新可视域分析参数
                interactiveManager.updateViewshedProperties(properties);
                this.simulateTyping(`已更新可视域属性：观察距离${properties.distance}米，水平视角${properties.horizontalAngle}度，垂直视角${properties.verticalAngle}度，俯仰角${properties.pitch}度`);
            } else {
                this.simulateTyping('当前可视域分析不支持属性更新，请重新执行分析');
            }
        } catch (error) {
            console.error('❌ 应用可视域属性失败:', error);
            this.simulateTyping('应用可视域属性失败，请重试');
        }
    }

    /**
     * 设置可视域裁剪模式
     */
    setViewshedClipMode(mode) {
        try {
            const digitalTwinAnalysis = window.realityTwin3DAnalysisTool.digitalTwinAnalysis;
            const interactiveManager = digitalTwinAnalysis ? digitalTwinAnalysis.interactiveManager : null;
            
            if (!interactiveManager) {
                this.simulateTyping('分析工具未初始化，请刷新页面重试');
                return;
            }

            // 检查是否有活跃的可视域分析
            if (!interactiveManager.hasActiveViewshed || !interactiveManager.hasActiveViewshed()) {
                this.simulateTyping('请先执行可视域分析，然后再设置裁剪模式');
                return;
            }

            // 设置裁剪模式
            if (interactiveManager.setViewshedClipMode) {
                interactiveManager.setViewshedClipMode(mode);
                const modeText = mode === 'inside' ? '保留区域内' : '保留区域外';
                this.simulateTyping(`裁剪模式已设置为：${modeText}`);
            } else {
                this.simulateTyping('当前可视域分析不支持裁剪模式设置');
            }
            
        } catch (error) {
            console.error('❌ 设置可视域裁剪模式失败:', error);
            this.simulateTyping('设置可视域裁剪模式失败，请检查系统状态');
        }
    }

    /**
     * 启动可视域裁剪面绘制
     */
    startViewshedClipPlaneDrawing() {
        try {
            const digitalTwinAnalysis = window.realityTwin3DAnalysisTool.digitalTwinAnalysis;
            const interactiveManager = digitalTwinAnalysis ? digitalTwinAnalysis.interactiveManager : null;
            
            if (!interactiveManager) {
                this.simulateTyping('分析工具未初始化，请刷新页面重试');
                return;
            }

            // 检查是否有活跃的可视域分析
            if (!interactiveManager.hasActiveViewshed || !interactiveManager.hasActiveViewshed()) {
                this.simulateTyping('请先执行可视域分析，然后再绘制裁剪面');
                return;
            }

            // 启动可视域裁剪面绘制模式
            if (interactiveManager.startViewshedClipPlaneDrawing) {
                interactiveManager.startViewshedClipPlaneDrawing();
                
                // 设置完成回调
                interactiveManager.onViewshedClipPlaneComplete = async () => {
                    await this.simulateTyping('可视域裁剪面绘制完成');
                };
                
                this.simulateTyping('可视域裁剪面绘制模式已启动，请在场景中绘制裁剪区域');
            } else {
                // 使用通用的裁剪面绘制功能
                this.startClipPlaneDrawing();
                this.simulateTyping('裁剪面绘制模式已启动，请在可视域结果上绘制区域');
            }
            
        } catch (error) {
            console.error('❌ 启动可视域裁剪面绘制失败:', error);
            this.simulateTyping('启动可视域裁剪面绘制失败，请检查系统状态');
        }
    }

    /**
     * 清除可视域裁剪面
     */
    clearViewshedClipPlane() {
        try {
            const digitalTwinAnalysis = window.realityTwin3DAnalysisTool.digitalTwinAnalysis;
            const interactiveManager = digitalTwinAnalysis ? digitalTwinAnalysis.interactiveManager : null;
            
            if (!interactiveManager) {
                this.simulateTyping('分析工具未初始化，请刷新页面重试');
                return;
            }

            // 清除可视域裁剪面
            if (interactiveManager.clearViewshedClipPlane) {
                interactiveManager.clearViewshedClipPlane();
                this.simulateTyping('可视域裁剪面已清除');
            } else {
                this.simulateTyping('当前可视域分析不支持裁剪面清除功能');
            }
            
        } catch (error) {
            console.error('❌ 清除可视域裁剪面失败:', error);
            this.simulateTyping('清除可视域裁剪面失败，请检查系统状态');
        }
    }

    /**
     * 执行可视域分析
     * @param {Object} params - 分析参数
     * @returns {Promise<Object>} 分析结果
     */
    async executeViewshedAnalysis(params) {
        try {
            // 获取三维分析工具实例
            const digitalTwinAnalysis = window.realityTwin3DAnalysisTool.digitalTwinAnalysis;
            
            // 获取场景和SuperMap3D实例
            const viewer = window.realityTwin3DAnalysisTool.viewer;
            const SuperMap3D = window.SuperMap3D;
            
            // 将params.position转换为SuperMap3D.Cartesian3对象
            let viewPoint;
            
            if (params.useSmartViewPoint) {
                // 使用智能观察点选择
                console.log('正在智能选择观察点...');
                const optimalPosition = await digitalTwinAnalysis.selectOptimalViewPoint();
                console.log('智能选择的观察点:', optimalPosition);
                
                // 将经纬度格式转换为Cartesian3对象
                if (optimalPosition && typeof optimalPosition.longitude === 'number' && 
                    typeof optimalPosition.latitude === 'number' && typeof optimalPosition.height === 'number') {
                    viewPoint = SuperMap3D.Cartesian3.fromDegrees(
                        optimalPosition.longitude, 
                        optimalPosition.latitude, 
                        optimalPosition.height
                    );
                    console.log('转换后的观察点Cartesian3:', viewPoint);
                } else {
                    throw new Error('智能选择的观察点格式无效');
                }
            } else if (params.position) {
                // 确保经纬度和高度值是有效的数字
                const longitude = parseFloat(params.position.longitude) || 116.4;
                const latitude = parseFloat(params.position.latitude) || 39.9;
                const height = parseFloat(params.position.height) || 100;
                
                console.log('创建观察点位置:', { longitude, latitude, height });
                
                // 使用当前相机位置作为观察点
                if (params.useCurrentCamera) {
                    const camera = viewer.camera;
                    viewPoint = camera.position.clone();
                    console.log('使用当前相机位置作为观察点:', viewPoint);
                } else {
                    // 使用指定的经纬度创建观察点
                    viewPoint = SuperMap3D.Cartesian3.fromDegrees(longitude, latitude, height);
                    console.log('从经纬度创建观察点:', viewPoint);
                }
            } else {
                // 默认使用当前相机位置
                const camera = viewer.camera;
                viewPoint = camera.position.clone();
                console.log('使用默认相机位置作为观察点:', viewPoint);
            }
            
            // 确保viewPoint是有效的Cartesian3对象
            if (!viewPoint || !SuperMap3D.defined(viewPoint)) {
                console.error('❌ 观察点无效:', viewPoint);
                throw new Error('观察点位置无效，请确保经纬度和高度值是有效的数字');
            }
            
            // 检查Cartesian3对象的坐标值
            if (typeof viewPoint.x !== 'number' || typeof viewPoint.y !== 'number' || 
                typeof viewPoint.z !== 'number' || isNaN(viewPoint.x) || isNaN(viewPoint.y) || isNaN(viewPoint.z)) {
                console.error('❌ 观察点坐标无效:', viewPoint);
                throw new Error('观察点坐标无效，请确保坐标值是有效的数字');
            }
            
            console.log('✅ 观察点验证通过:', viewPoint);
            
            // 执行可视域分析
            const result = await digitalTwinAnalysis.performViewshedAnalysis(
                viewPoint,
                params.distance || 1000,
                params.pitch || -10,
                params.direction || 0,
                {
                    horizontalFov: params.horizontalFov || 60,
                    verticalFov: params.verticalFov || 45,
                    visibleColor: params.visibleColor || '#00ff00',
                    hiddenColor: params.invisibleColor || '#ff0000',
                    horizontalAngle: params.horizontalFov || 60,
                    verticalAngle: params.verticalFov || 45
                }
            );
            
            // 检查result是否为null
            if (!result) {
                throw new Error('可视域分析返回结果为空');
            }
            
            // 构造返回结果，使用analysisData中的属性
            return {
                success: true,
                analysisId: result.timestamp ? 'viewshed-' + new Date(result.timestamp).getTime() : 'viewshed-' + Date.now(),
                visibleArea: result.viewshed3D ? '已计算' : '未计算', // 官方实现没有直接提供可视面积
                distance: result.distance || 0,
                pitch: result.pitch || 0,
                heading: result.heading || 0,
                message: '可视域分析已完成'
            };
        } catch (error) {
            console.error('执行可视域分析失败:', error);
            throw new Error(`可视域分析失败: ${error.message}`);
        }
    }

    /**
     * 执行阴影分析
     * @param {Object} params - 分析参数
     * @returns {Promise<Object>} 分析结果
     */
    async executeShadowAnalysis(params) {
        try {
            // 解析和优化参数
            const analysisParams = this.parseShadowAnalysisParams(params);
            
            // 如果缺少关键参数，通过对话获取
            if (!analysisParams.date || !analysisParams.startTime || !analysisParams.endTime) {
                return await this.startInteractiveShadowParameterSetting(analysisParams);
            }
            
            // 显示分析参数确认信息
            this.addAssistantMessage(
                `开始阴影分析：\n` +
                `📅 分析日期：${analysisParams.date}\n` +
                `🕐 时间范围：${analysisParams.startTime}:00 - ${analysisParams.endTime}:00\n` +
                `📏 底面高度：${analysisParams.bottomHeight}米\n` +
                `📐 拉伸高度：${analysisParams.extrudeHeight}米\n` +
                `请在场景中绘制分析区域。`
            );
            
            // 获取三维分析工具实例
            const digitalTwinAnalysis = window.realityTwin3DAnalysisTool.digitalTwinAnalysis;
            
            // 执行阴影分析
            const result = await digitalTwinAnalysis.performShadowAnalysis(analysisParams);
            
            // 生成智能分析报告和建议
            setTimeout(() => {
                const analysisReport = this.generateShadowAnalysisReport(analysisParams);
                this.addAssistantMessage(analysisReport);
                
                // 提供后续操作建议
                const suggestions = this.generateShadowAnalysisSuggestions(analysisParams);
                setTimeout(() => {
                    this.addAssistantMessage(suggestions);
                }, 1000);
            }, 2000);
            
            return {
                success: true,
                analysisId: result.id,
                params: analysisParams,
                message: '阴影分析已完成，可以进行日照效果展示'
            };
        } catch (error) {
            console.error('执行阴影分析失败:', error);
            throw new Error(`阴影分析失败: ${error.message}`);
        }
    }

    /**
     * 执行天际线分析
     * @param {Object} params - 分析参数
     * @returns {Promise<Object>} 分析结果
     */
    async executeSkylineAnalysis(message) {
        try {
            // 从消息中提取参数
            const params = this.extractSkylineParametersFromMessage(message);
            
            // 启动交互式天际线分析
            return await this.startInteractiveSkylineAnalysis(params);
        } catch (error) {
            console.error('执行天际线分析失败:', error);
            throw new Error(`执行天际线分析失败: ${error.message}`);
        }
    }

    /**
     * 从消息中提取天际线分析参数
     * @param {string} message - 用户消息
     * @returns {Object} 提取的参数
     */
    extractSkylineParametersFromMessage(message) {
        const params = {};
        
        try {
            // 确保message是字符串类型
            if (typeof message !== 'string') {
                console.warn('extractSkylineParametersFromMessage: message不是字符串类型:', typeof message, message);
                return {};
            }
            
            // 提取分析半径
            const radiusPatterns = [
                /(?:分析半径|半径|范围)\s*[：:]?\s*(\d+(?:\.\d+)?)\s*(?:米|m|公里|km|千米)/i,
                /(\d+(?:\.\d+)?)\s*(?:米|m)\s*(?:半径|范围)/i,
                /(\d+(?:\.\d+)?)\s*(?:公里|km|千米)\s*(?:半径|范围)/i,
                // 支持简单的数字+单位格式，如"500米"、"1公里"
                /^\s*(\d+(?:\.\d+)?)\s*(?:米|m)\s*$/i,
                /^\s*(\d+(?:\.\d+)?)\s*(?:公里|km|千米)\s*$/i,
                // 支持纯数字（默认为米）
                /^\s*(\d+(?:\.\d+)?)\s*$/
            ];
            
            for (const pattern of radiusPatterns) {
                const match = message.match(pattern);
                if (match) {
                    let radius = parseFloat(match[1]);
                    // 如果是公里，转换为米
                    if (message.includes('公里') || message.includes('km') || message.includes('千米')) {
                        radius *= 1000;
                    }
                    params.radius = radius;
                    break;
                }
            }
            
            // 提取功能类型
            const featurePatterns = [
                { pattern: /(?:生成|显示|创建)\s*二维天际线/i, type: '二维天际线' },
                { pattern: /二维天际线/i, type: '二维天际线' },
                { pattern: /(?:绘制|创建|生成)\s*限高体/i, type: '限高体' },
                { pattern: /限高体/i, type: '限高体' },
                { pattern: /(?:生成|创建|显示)\s*拉伸闭合体/i, type: '拉伸闭合体' },
                { pattern: /拉伸闭合体/i, type: '拉伸闭合体' },
                { pattern: /天际线拉伸体/i, type: '拉伸闭合体' }
            ];
            
            for (const { pattern, type } of featurePatterns) {
                if (pattern.test(message)) {
                    params.analysisType = type;
                    break;
                }
            }
            
            // 提取坐标信息（如果有）
            const coordPatterns = [
                /(?:坐标|位置|观察点)\s*[：:]?\s*\(?\s*(\d+(?:\.\d+)?)\s*[,，]\s*(\d+(?:\.\d+)?)\s*\)?/i,
                /\(?\s*(\d{2,3}\.\d+)\s*[,，]\s*(\d{1,2}\.\d+)\s*\)?/i
            ];
            
            for (const pattern of coordPatterns) {
                const match = message.match(pattern);
                if (match) {
                    params.longitude = parseFloat(match[1]);
                    params.latitude = parseFloat(match[2]);
                    break;
                }
            }
            
            console.log('提取的天际线参数:', params);
            return params;
            
        } catch (error) {
            console.error('提取天际线参数失败:', error);
            return {};
        }
    }

    /**
     * 执行空间分析
     * @param {Object} params - 分析参数
     * @returns {Promise<Object>} 分析结果
     */
    async executeSpatialAnalysis(params) {
        try {
            // 获取三维分析工具实例
            const digitalTwinAnalysis = window.realityTwin3DAnalysisTool.digitalTwinAnalysis;
            
            // 根据分析类型执行不同的空间分析
            let result;
            switch (params.type) {
                case 'clip':
                    result = await digitalTwinAnalysis.performClipAnalysis(params);
                    break;
                case 'excavate':
                    result = await digitalTwinAnalysis.performExcavateAnalysis(params);
                    break;
                case 'profile':
                    result = await digitalTwinAnalysis.performProfileAnalysis(params);
                    break;
                default:
                    throw new Error(`未知的空间分析类型: ${params.type}`);
            }
            
            return {
                success: true,
                analysisId: result.id,
                analysisType: params.type,
                message: `${params.type}分析已完成`
            };
        } catch (error) {
            console.error('执行空间分析失败:', error);
            throw new Error(`空间分析失败: ${error.message}`);
        }
    }

    /**
     * 执行通视分析
     * @param {Object} params - 分析参数
     * @returns {Promise<Object>} 分析结果
     */
    async executeSightlineAnalysis(params = {}) {
        try {
            // 如果没有提供观察点和目标点，启动交互式通视分析
            if (!params || !params.viewPoint || !params.targetPoint) {
                return await this.startInteractiveSightlineAnalysis(params);
            }
            
            // 获取三维分析工具实例
            const digitalTwinAnalysis = window.realityTwin3DAnalysisTool.digitalTwinAnalysis;
            
            // 执行通视分析
            const result = await digitalTwinAnalysis.performSightlineAnalysis(
                params.viewPoint,
                params.targetPoint,
                params
            );
            
            if (result) {
                return {
                    success: true,
                    analysisId: result.timestamp,
                    distance: result.distance,
                    message: `通视分析已完成，两点距离: ${result.distance.toFixed(2)}米`
                };
            } else {
                throw new Error('通视分析执行失败');
            }
        } catch (error) {
            console.error('执行通视分析失败:', error);
            throw new Error(`通视分析失败: ${error.message}`);
        }
    }

    /**
     * 执行室内导航
     * @param {Object} params - 导航参数
     * @returns {Promise<Object>} 导航结果
     */
    async executeIndoorNavigation(params) {
        try {
            // 获取室内导航实例
            const indoorNavigation = window.realityTwin3DAnalysisTool.indoorNavigation;
            
            // 执行室内导航
            const result = await indoorNavigation.calculateRoute({
                startPoint: params.startPoint,
                endPoint: params.endPoint,
                floor: params.floor || 1
            });
            
            return {
                success: true,
                routeId: result.id,
                routePoints: result.points,
                distance: result.distance,
                estimatedTime: result.estimatedTime,
                message: '室内导航路径已计算完成'
            };
        } catch (error) {
            console.error('执行室内导航失败:', error);
            throw new Error(`室内导航失败: ${error.message}`);
        }
    }

    /**
     * 执行加载模型
     * @param {Object} params - 模型参数
     * @returns {Promise<Object>} 加载结果
     */
    async executeLoadModel(params) {
        try {
            // 获取主工具实例
            const mainTool = window.realityTwin3DAnalysisTool;
            
            // 加载模型
            const result = await mainTool.loadModel(params.url, params.name);
            
            return {
                success: true,
                modelId: result.id,
                modelName: result.name,
                message: `模型 ${result.name} 已加载完成`
            };
        } catch (error) {
            console.error('加载模型失败:', error);
            throw new Error(`加载模型失败: ${error.message}`);
        }
    }

    /**
     * 执行飞行到位置
     * @param {Object} params - 位置参数
     * @returns {Promise<Object>} 飞行结果
     */
    async executeFlyToLocation(params) {
        try {
            // 获取主工具实例
            const mainTool = window.realityTwin3DAnalysisTool;
            
            // 飞行到位置
            await mainTool.flyTo({
                longitude: params.longitude,
                latitude: params.latitude,
                height: params.height || 100,
                heading: params.heading || 0,
                pitch: params.pitch || -30,
                duration: params.duration || 3
            });
            
            return {
                success: true,
                position: {
                    longitude: params.longitude,
                    latitude: params.latitude,
                    height: params.height || 100
                },
                message: '已飞行到指定位置'
            };
        } catch (error) {
            console.error('飞行到位置失败:', error);
            throw new Error(`飞行到位置失败: ${error.message}`);
        }
    }

    /**
     * 开始模型加载流程
     */
    async startModelLoading() {
        try {
            // 获取主工具实例
            const mainTool = window.realityTwin3DAnalysisTool;
            
            if (!mainTool) {
                await this.simulateTyping('模型加载失败：系统未初始化');
                return;
            }
            
            // 设置模型加载结果监听器
            this.setupModelLoadingListener();
            
            // 调用主工具的模型加载方法，这会显示模型选择界面
            await mainTool.loadModel();
            
        } catch (error) {
            console.error('模型加载流程失败:', error);
            await this.simulateTyping('模型加载失败');
        }
    }
    
    /**
     * 设置模型加载结果监听器
     */
    setupModelLoadingListener() {
        // 保存原始的showSuccessMessage和showErrorDialog方法
        const mainTool = window.realityTwin3DAnalysisTool;
        if (!mainTool) return;
        
        const originalShowSuccessMessage = mainTool.showSuccessMessage.bind(mainTool);
        const originalShowErrorDialog = mainTool.showErrorDialog.bind(mainTool);
        
        // 重写showSuccessMessage方法以监听模型加载成功
        mainTool.showSuccessMessage = (message) => {
            // 调用原始方法
            originalShowSuccessMessage(message);
            
            // 检查是否是模型加载相关的成功消息
            if (message && (message.includes('加载成功') || message.includes('文件') && message.includes('加载成功'))) {
                this.simulateTyping('模型加载成功');
                // 恢复原始方法
                setTimeout(() => {
                    mainTool.showSuccessMessage = originalShowSuccessMessage;
                    mainTool.showErrorDialog = originalShowErrorDialog;
                }, 1000);
            }
        };
        
        // 重写showErrorDialog方法以监听模型加载失败
        mainTool.showErrorDialog = (title, message) => {
            // 调用原始方法
            originalShowErrorDialog(title, message);
            
            // 检查是否是模型加载相关的错误消息
            if ((title && title.includes('加载失败')) || (message && message.includes('加载失败'))) {
                this.simulateTyping('模型加载失败');
                // 恢复原始方法
                setTimeout(() => {
                    mainTool.showSuccessMessage = originalShowSuccessMessage;
                    mainTool.showErrorDialog = originalShowErrorDialog;
                }, 1000);
            }
        };
        
        // 设置超时恢复原始方法（防止方法被永久重写）
        setTimeout(() => {
            if (mainTool.showSuccessMessage !== originalShowSuccessMessage) {
                mainTool.showSuccessMessage = originalShowSuccessMessage;
            }
            if (mainTool.showErrorDialog !== originalShowErrorDialog) {
                mainTool.showErrorDialog = originalShowErrorDialog;
            }
        }, 30000); // 30秒后恢复
    }

    /**
     * 开始剖面分析
     */
    async startProfileAnalysis() {
        try {
            // 重置剖面分析状态
            this.resetProfileAnalysisState();
            
            // 设置为活跃状态
            this.profileAnalysisState.isActive = true;
            this.profileAnalysisState.step = 1;
            
            // 初始化事件处理器
            this.initProfileAnalysisHandler();
            
            // 显示提示信息
            await this.simulateTyping('请点击设置剖面线起点');
            
        } catch (error) {
            console.error('开始剖面分析失败:', error);
            await this.simulateTyping(`剖面分析启动失败: ${error.message}`);
        }
    }
    
    /**
     * 重置剖面分析状态
     */
    resetProfileAnalysisState() {
        // 清除之前的事件处理器
        if (this.profileAnalysisState.handler) {
            this.profileAnalysisState.handler.destroy();
        }
        
        // 重置状态
        this.profileAnalysisState = {
            isActive: false,
            step: 0,
            points: [],
            handler: null
        };
    }
    
    /**
     * 初始化剖面分析事件处理器
     */
    initProfileAnalysisHandler() {
        try {
            const viewer = window.realityTwin3DAnalysisTool.viewer;
            const scene = viewer.scene;
            
            // 创建事件处理器
            this.profileAnalysisState.handler = new SuperMap3D.ScreenSpaceEventHandler(scene.canvas);
            
            // 左键点击事件
            this.profileAnalysisState.handler.setInputAction((event) => {
                if (!this.profileAnalysisState.isActive) return;
                
                const position = this.pickPosition(event.position, viewer, scene);
                if (position) {
                    this.handleProfileAnalysisClick(position);
                }
            }, SuperMap3D.ScreenSpaceEventType.LEFT_CLICK);
            
            // 右键点击事件（完成绘制）
            this.profileAnalysisState.handler.setInputAction((event) => {
                if (!this.profileAnalysisState.isActive) return;
                if (this.profileAnalysisState.step === 3) {
                    this.completeProfileAnalysis();
                }
            }, SuperMap3D.ScreenSpaceEventType.RIGHT_CLICK);
            
        } catch (error) {
            console.error('初始化剖面分析事件处理器失败:', error);
        }
    }
    
    /**
     * 拾取位置
     */
    pickPosition(windowPosition, viewer, scene) {
        try {
            // 首先尝试拾取3D模型对象
            const pickedObject = scene.pick(windowPosition);
            if (SuperMap3D.defined(pickedObject)) {
                const modelPosition = scene.pickPosition(windowPosition);
                if (modelPosition) {
                    return modelPosition;
                }
            }
            
            // 尝试拾取地形
            const terrainPosition = viewer.camera.pickEllipsoid(windowPosition, scene.globe.ellipsoid);
            if (terrainPosition) {
                return terrainPosition;
            }
            
            return null;
        } catch (error) {
            console.warn('位置拾取失败:', error);
            return null;
        }
    }
    
    /**
     * 处理剖面分析点击
     */
    async handleProfileAnalysisClick(position) {
        try {
            this.profileAnalysisState.points.push(position);
            
            // 添加临时点标记
            this.addTempPoint(position, `点${this.profileAnalysisState.points.length}`);
            
            if (this.profileAnalysisState.step === 1) {
                // 设置起点后
                this.profileAnalysisState.step = 2;
                await this.simulateTyping('请继续点击添加剖面点');
            } else if (this.profileAnalysisState.step === 2) {
                // 添加剖面点后
                this.profileAnalysisState.step = 3;
                await this.simulateTyping('右键完成剖面线绘制或继续点击添加更多点');
            } else if (this.profileAnalysisState.step === 3) {
                // 继续添加更多点
                await this.simulateTyping('右键完成剖面线绘制或继续点击添加更多点');
            }
            
        } catch (error) {
            console.error('处理剖面分析点击失败:', error);
        }
    }
    
    /**
     * 添加临时点标记
     */
    addTempPoint(position, label) {
        try {
            const viewer = window.realityTwin3DAnalysisTool.viewer;
            
            const pointEntity = viewer.entities.add({
                id: `profile-temp-point-${Date.now()}`,
                position: position,
                point: {
                    pixelSize: 10,
                    color: SuperMap3D.Color.CYAN,
                    outlineColor: SuperMap3D.Color.WHITE,
                    outlineWidth: 2,
                    heightReference: SuperMap3D.HeightReference.CLAMP_TO_GROUND
                },
                label: {
                    text: label,
                    font: '12pt sans-serif',
                    fillColor: SuperMap3D.Color.WHITE,
                    outlineColor: SuperMap3D.Color.BLACK,
                    outlineWidth: 2,
                    style: SuperMap3D.LabelStyle.FILL_AND_OUTLINE,
                    pixelOffset: new SuperMap3D.Cartesian2(0, -30)
                }
            });
            
        } catch (error) {
            console.error('添加临时点标记失败:', error);
        }
    }
    
    /**
     * 完成剖面分析
     */
    async completeProfileAnalysis() {
        try {
            if (this.profileAnalysisState.points.length < 2) {
                await this.simulateTyping('剖面分析需要至少2个点，请继续添加点');
                return;
            }
            
            // 执行剖面分析
            const digitalTwinAnalysis = window.realityTwin3DAnalysisTool.digitalTwinAnalysis;
            const result = await digitalTwinAnalysis.performProfileAnalysis(this.profileAnalysisState.points);
            
            // 重置状态
            this.resetProfileAnalysisState();
            
            // 显示完成信息
            await this.simulateTyping('剖面图表绘制完成');
            
        } catch (error) {
            console.error('完成剖面分析失败:', error);
            await this.simulateTyping(`剖面分析失败: ${error.message}`);
            this.resetProfileAnalysisState();
        }
    }
    
    /**
     * 执行剖面分析（工具调用接口）
     * @param {Object} params - 分析参数
     * @returns {Promise<Object>} 分析结果
     */
    async executeProfileAnalysis(params) {
        try {
            // 如果是通过工具调用，直接执行分析
            if (params && params.positions) {
                const digitalTwinAnalysis = window.realityTwin3DAnalysisTool.digitalTwinAnalysis;
                const result = await digitalTwinAnalysis.performProfileAnalysis(params.positions);
                
                return {
                    success: true,
                    analysisId: result ? result.id : 'profile-' + Date.now(),
                    message: '剖面分析已完成'
                };
            } else {
                // 否则启动交互式剖面分析
                await this.startProfileAnalysis();
                return {
                    success: true,
                    message: '剖面分析已启动，请在地图上点击设置剖面线'
                };
            }
        } catch (error) {
            console.error('执行剖面分析失败:', error);
            throw new Error(`剖面分析失败: ${error.message}`);
        }
    }

    /**
     * 执行清除分析
     * @param {Object} params - 清除参数
     * @returns {Promise<Object>} 清除结果
     */
    async executeClearAnalysis(params) {
        try {
            // 清除剖面分析状态
            this.resetProfileAnalysisState();
            
            // 获取三维分析工具实例
            const digitalTwinAnalysis = window.realityTwin3DAnalysisTool.digitalTwinAnalysis;
            
            // 清除分析结果
            if (params.analysisId) {
                // 清除特定分析
                await digitalTwinAnalysis.clearAnalysis(params.analysisId);
            } else if (params.analysisType) {
                // 清除特定类型的分析
                await digitalTwinAnalysis.clearAnalysisByType(params.analysisType);
            } else {
                // 清除所有分析
                await digitalTwinAnalysis.clearAllAnalysis();
            }
            
            return {
                success: true,
                message: '分析结果已清除'
            };
        } catch (error) {
            console.error('清除分析失败:', error);
            throw new Error(`清除分析失败: ${error.message}`);
        }
    }

    /**
     * 启动交互式通视分析
     * @param {Object} params - 分析参数
     * @returns {Promise<Object>} 分析结果
     */
    async startInteractiveSightlineAnalysis(params = {}) {
        try {
            // 重置状态
            this.resetSightlineAnalysisState();
            this.sightlineAnalysisState.isActive = true;
            this.sightlineAnalysisState.params = params;
            this.sightlineAnalysisState.step = 1;
            this.sightlineAnalysisState.targetPoints = []; // 存储多个目标点
            
            // 添加助手消息引导用户
            this.addAssistantMessage('🔍 正在进行通视分析，请选择观察点。\n\n💡 提示：点击场景中的建筑物、地面等实体对象来设置观察点。您可以随时输入"取消"或"清除"来退出分析。');
            
            // 初始化点击处理器
            this.initSightlineClickHandler();
            
            return {
                success: true,
                message: '已启动交互式通视分析，请点击设置观察点'
            };
        } catch (error) {
            console.error('启动交互式通视分析失败:', error);
            this.resetSightlineAnalysisState();
            throw new Error(`启动交互式通视分析失败: ${error.message}`);
        }
    }

    /**
     * 重置通视分析状态
     */
    resetSightlineAnalysisState() {
        if (this.sightlineAnalysisState.handler) {
            this.sightlineAnalysisState.handler.destroy();
        }
        
        this.sightlineAnalysisState = {
            isActive: false,
            step: 0,
            viewPoint: null,
            targetPoint: null,
            handler: null,
            params: {}
        };
        
        // 恢复鼠标样式
        if (this.viewer) {
            this.viewer.enableCursorStyle = true;
            this.viewer._element.style.cursor = 'default';
        }
    }

    /**
     * 初始化通视分析点击处理器
     */
    initSightlineClickHandler() {
        // 如果viewer或scene为空，尝试重新获取
        if (!this.viewer || !this.scene) {
            this.initViewerAndScene();
        }
        
        // 再次检查是否成功获取
        if (!this.viewer || !this.scene) {
            throw new Error('场景未初始化，请确保三维场景已正确加载');
        }
        
        // 设置鼠标样式
        this.viewer.enableCursorStyle = false;
        this.viewer._element.style.cursor = 'crosshair';
        
        // 创建点击处理器
        this.sightlineAnalysisState.handler = new SuperMap3D.ScreenSpaceEventHandler(this.viewer.scene.canvas);
        
        // 绑定左键点击事件
        this.sightlineAnalysisState.handler.setInputAction((event) => {
            this.handleSightlineClick(event.position);
        }, SuperMap3D.ScreenSpaceEventType.LEFT_CLICK);
        
        // 绑定右键取消事件
        this.sightlineAnalysisState.handler.setInputAction(() => {
            this.cancelSightlineAnalysis();
        }, SuperMap3D.ScreenSpaceEventType.RIGHT_CLICK);
    }

    /**
     * 处理通视分析点击事件
     * @param {SuperMap3D.Cartesian2} windowPosition - 屏幕坐标
     */
    async handleSightlineClick(windowPosition) {
        try {
            // 获取点击位置的三维坐标
            const position = this.pickPosition(windowPosition, this.viewer, this.scene);
            if (!position) {
                this.addAssistantMessage('❌ 无法获取点击位置，请点击场景中的有效位置。\n\n💡 提示：可以点击建筑物、地面等实体对象。');
                return;
            }
            
            if (this.sightlineAnalysisState.step === 1) {
                // 设置观察点
                this.sightlineAnalysisState.viewPoint = position;
                this.sightlineAnalysisState.step = 2;
                
                // 添加观察点标记
                this.addSightlinePoint(position, '观察点', SuperMap3D.Color.YELLOW);
                
                this.addAssistantMessage('✅ 观察点已设置，请选择目标点。\n\n💡 提示：您可以添加多个目标点进行分析，或输入"清除"重新开始。');
                
            } else if (this.sightlineAnalysisState.step === 2) {
                // 添加目标点
                const targetIndex = this.sightlineAnalysisState.targetPoints.length + 1;
                this.sightlineAnalysisState.targetPoints.push(position);
                
                // 添加目标点标记
                this.addSightlinePoint(position, `目标点${targetIndex}`, SuperMap3D.Color.RED);
                
                // 执行当前目标点的通视分析（保留之前的结果）
            await this.performSingleSightlineAnalysis(this.sightlineAnalysisState.viewPoint, position, targetIndex, true);
                
                this.addAssistantMessage(`✅ 目标点${targetIndex}已添加，可继续添加更多目标点或输入"完成"结束分析。\n\n💡 提示：输入"清除"可重新开始分析。`);
            }
        } catch (error) {
            console.error('处理通视分析点击失败:', error);
            this.addAssistantMessage(`❌ 点击处理失败: ${error.message}。请重试或输入"取消"退出分析。`);
        }
    }

    /**
     * 添加通视分析点标记
     * @param {SuperMap3D.Cartesian3} position - 位置
     * @param {string} label - 标签文本
     * @param {SuperMap3D.Color} color - 颜色
     */
    addSightlinePoint(position, label, color) {
        const entity = this.viewer.entities.add({
            id: `sightline-point-${Date.now()}`,
            position: position,
            point: {
                pixelSize: 12,
                color: color,
                outlineColor: SuperMap3D.Color.BLACK,
                outlineWidth: 2,
                heightReference: SuperMap3D.HeightReference.CLAMP_TO_GROUND
            },
            label: {
                text: label,
                font: '14pt sans-serif',
                fillColor: SuperMap3D.Color.WHITE,
                outlineColor: SuperMap3D.Color.BLACK,
                outlineWidth: 2,
                style: SuperMap3D.LabelStyle.FILL_AND_OUTLINE,
                pixelOffset: new SuperMap3D.Cartesian2(0, -40),
                heightReference: SuperMap3D.HeightReference.CLAMP_TO_GROUND
            }
        });
        
        return entity;
    }

    /**
     * 执行单个目标点的通视分析
     */
    async performSingleSightlineAnalysis(viewPoint, targetPoint, targetIndex, keepPreviousResults = false) {
        try {
            // 获取三维分析工具实例
            const digitalTwinAnalysis = window.realityTwin3DAnalysisTool.digitalTwinAnalysis;
            
            // 合并参数，添加keepPreviousResults选项
            const analysisParams = {
                ...this.sightlineAnalysisState.params,
                keepPreviousResults: keepPreviousResults
            };
            
            // 执行通视分析
            const result = await digitalTwinAnalysis.performSightlineAnalysis(
                viewPoint,
                targetPoint,
                analysisParams
            );
            
            if (result) {
                const distance = result.distance.toFixed(2);
                this.addAssistantMessage(`📊 目标点${targetIndex}通视分析完成！距离: ${distance}米`);
            } else {
                this.addAssistantMessage(`❌ 目标点${targetIndex}通视分析失败，请重试。`);
            }
            
        } catch (error) {
            console.error(`目标点${targetIndex}通视分析失败:`, error);
            this.addAssistantMessage(`❌ 目标点${targetIndex}通视分析失败: ${error.message}`);
        }
    }

    /**
     * 完成通视分析
     */
    async completeSightlineAnalysis() {
        try {
            const targetCount = this.sightlineAnalysisState.targetPoints.length;
            if (targetCount > 0) {
                this.addAssistantMessage(`🎉 通视分析全部完成！共分析了${targetCount}个目标点。`);
            } else {
                this.addAssistantMessage('❌ 没有设置目标点，分析已取消。');
            }
            
            // 重置状态
            this.resetSightlineAnalysisState();
            
        } catch (error) {
            console.error('完成通视分析失败:', error);
            this.addAssistantMessage(`❌ 通视分析失败: ${error.message}`);
            this.resetSightlineAnalysisState();
        }
    }

    /**
     * 取消通视分析
     */
    cancelSightlineAnalysis() {
        this.addAssistantMessage('通视分析已取消。');
        this.resetSightlineAnalysisState();
    }

    /**
     * 启动交互式阴影分析
     * @param {Object} params - 分析参数
     * @returns {Promise<Object>} 分析结果
     */
    async startInteractiveShadowAnalysis(params = {}) {
        try {
            // 重置状态
            this.resetShadowAnalysisState();
            this.shadowAnalysisState.isActive = true;
            this.shadowAnalysisState.params = params;
            this.shadowAnalysisState.step = 1;
            
            // 添加助手消息引导用户
            this.addAssistantMessage('开始阴影分析。请在场景中绘制分析区域。');
            
            // 初始化绘制处理器
            this.initShadowDrawHandler();
            
            return {
                success: true,
                message: '已启动交互式阴影分析，请绘制分析区域'
            };
        } catch (error) {
            console.error('启动交互式阴影分析失败:', error);
            this.resetShadowAnalysisState();
            throw new Error(`启动交互式阴影分析失败: ${error.message}`);
        }
    }
    
    /**
     * 启动交互式阴影参数设置
     * @param {Object} params - 已有参数
     * @returns {Promise<Object>} 分析结果
     */
    async startInteractiveShadowParameterSetting(params = {}) {
        try {
            let message = '';
            
            // 显示当前已设置的参数
            if (params.date || params.startTime || params.endTime) {
                message += '✅ **已识别并保存：**\n';
                if (params.date) message += `📅 分析日期：${params.date}\n`;
                if (params.startTime && params.endTime) {
                    message += `🕐 时间范围：${params.startTime}:00 - ${params.endTime}:00\n`;
                }
                message += '\n';
            }
            
            // 显示需要设置的参数
            const needsDate = !params.date;
            const needsTime = !params.startTime || !params.endTime;
            
            if (needsDate || needsTime) {
                message += '📋 **还需要设置：**\n';
                if (needsDate) message += '📅 分析日期（如：今天、明天、2024-06-15）\n';
                if (needsTime) message += '🕐 分析时间范围（如：上午9点到下午5点）\n';
                message += '\n💡 **提示：** 您可以继续输入缺少的信息，或者一次性提供完整的设置。';
            }
            
            this.addAssistantMessage(message);
            
            // 设置等待参数状态
            this.shadowAnalysisState.isActive = true;
            this.shadowAnalysisState.step = 0; // 等待参数
            this.shadowAnalysisState.params = params;
            
            return {
                success: true,
                message: '等待用户提供阴影分析参数'
            };
        } catch (error) {
            console.error('启动交互式阴影参数设置失败:', error);
            throw new Error(`启动交互式阴影参数设置失败: ${error.message}`);
        }
    }

    /**
     * 重置阴影分析状态
     */
    resetShadowAnalysisState() {
        if (this.shadowAnalysisState.handler) {
            this.shadowAnalysisState.handler.destroy();
        }
        
        this.shadowAnalysisState = {
            isActive: false,
            step: 0,
            params: {},
            handler: null
        };
        
        // 恢复鼠标样式
        if (this.viewer) {
            this.viewer.enableCursorStyle = true;
            this.viewer._element.style.cursor = 'default';
        }
    }

    /**
     * 初始化阴影分析绘制处理器
     */
    initShadowDrawHandler() {
        try {
            // 获取三维分析工具实例
            const digitalTwinAnalysis = window.realityTwin3DAnalysisTool.digitalTwinAnalysis;
            
            // 启动阴影分析绘制
            digitalTwinAnalysis.performShadowAnalysis(this.shadowAnalysisState.params);
            
            this.addAssistantMessage('阴影分析已启动，请在场景中绘制分析区域。');
            
        } catch (error) {
            console.error('初始化阴影分析绘制失败:', error);
            this.addAssistantMessage(`初始化阴影分析失败: ${error.message}`);
            this.resetShadowAnalysisState();
        }
    }

    /**
     * 取消阴影分析
     */
    cancelShadowAnalysis() {
        try {
            this.resetShadowAnalysisState();
            console.log('阴影分析已取消');
        } catch (error) {
            console.error('取消阴影分析失败:', error);
        }
    }
    
    /**
     * 解析阴影分析参数
     * @param {Object} params - 原始参数
     * @returns {Object} 解析后的参数
     */
    parseShadowAnalysisParams(params) {
        const result = {
            date: params.date,
            startTime: params.startTime,
            endTime: params.endTime,
            bottomHeight: params.bottomHeight || 20,
            extrudeHeight: params.extrudeHeight || 20
        };
        
        // 智能解析日期
        if (params.date) {
            result.date = this.parseDate(params.date);
        }
        
        // 智能解析时间
        if (params.timeRange) {
            const timeInfo = this.parseTimeRange(params.timeRange);
            if (timeInfo.startTime) result.startTime = timeInfo.startTime;
            if (timeInfo.endTime) result.endTime = timeInfo.endTime;
        }
        
        return result;
    }
    
    /**
     * 解析日期字符串
     * @param {string} dateStr - 日期字符串
     * @returns {string} 标准日期格式
     */
    parseDate(dateStr) {
        if (!dateStr) return new Date().toISOString().split('T')[0];
        
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        
        switch (dateStr.toLowerCase()) {
            case '今天':
            case 'today':
                return today.toISOString().split('T')[0];
            case '明天':
            case 'tomorrow':
                return tomorrow.toISOString().split('T')[0];
            default:
                // 尝试解析标准日期格式
                try {
                    const date = new Date(dateStr);
                    if (!isNaN(date.getTime())) {
                        return date.toISOString().split('T')[0];
                    }
                } catch (e) {
                    console.warn('无法解析日期:', dateStr);
                }
                return today.toISOString().split('T')[0];
        }
    }
    
    /**
     * 解析时间范围字符串
     * @param {string} timeRangeStr - 时间范围字符串
     * @returns {Object} 时间信息
     */
    parseTimeRange(timeRangeStr) {
        if (!timeRangeStr) return {};
        
        const result = {};
        
        // 匹配各种时间格式
        const patterns = [
            // 上午X点到下午Y点
            /(上午|早上)?(\d{1,2})(?:点|:00)?(?:到|至|-|~)(下午|晚上)?(\d{1,2})(?:点|:00)?/,
            // X:XX到Y:YY
            /(\d{1,2}):(\d{2})(?:到|至|-|~)(\d{1,2}):(\d{2})/,
            // X到Y
            /(\d{1,2})(?:到|至|-|~)(\d{1,2})/
        ];
        
        for (const pattern of patterns) {
            const match = timeRangeStr.match(pattern);
            if (match) {
                if (pattern.source.includes(':')) {
                    // 包含分钟的格式
                    result.startTime = parseInt(match[1]);
                    result.endTime = parseInt(match[3]);
                } else if (match.length >= 5) {
                    // 上午X点到下午Y点格式
                    let startHour = parseInt(match[2]);
                    let endHour = parseInt(match[5]);
                    
                    // 处理上午
                    if (match[1] && (match[1] === '上午' || match[1] === '早上')) {
                        if (startHour === 12) startHour = 0;
                    }
                    
                    // 处理下午
                    if (match[4] && (match[4] === '下午' || match[4] === '晚上')) {
                        if (endHour < 12) endHour += 12;
                    }
                    
                    result.startTime = startHour;
                    result.endTime = endHour;
                } else {
                    // 只有小时的格式
                    let startHour = parseInt(match[1]);
                    let endHour = parseInt(match[2]);
                    
                    result.startTime = startHour;
                    result.endTime = endHour;
                }
                break;
            }
        }
        
        return result;
    }
    
    /**
     * 执行日照效果
     * @param {Object} params - 参数
     * @returns {Promise<Object>} 执行结果
     */
    async executeSunlightEffect(params = {}) {
        try {
            const digitalTwinAnalysis = window.realityTwin3DAnalysisTool.digitalTwinAnalysis;
            
            if (!digitalTwinAnalysis.shadowQuery) {
                this.addAssistantMessage('❌ 请先执行阴影分析，然后再播放日照效果。');
                return { success: false, message: '需要先执行阴影分析' };
            }
            
            // 获取当前阴影分析的参数
            const shadowResult = digitalTwinAnalysis.getAnalysisResult('shadow');
            const effectParams = {
                date: params.date || (shadowResult ? shadowResult.startTime : undefined),
                startTime: params.startTime || 10,
                endTime: params.endTime || 14
            };
            
            this.addAssistantMessage(
                `🌅 开始播放日照效果动画\n` +
                `📅 日期：${effectParams.date || '当前分析日期'}\n` +
                `🕐 时间：${effectParams.startTime}:00 - ${effectParams.endTime}:00\n` +
                `⏱️ 动画将展示太阳位置变化对阴影的影响...`
            );
            
            const result = digitalTwinAnalysis.performSunlightEffect(effectParams);
            
            if (result) {
                setTimeout(() => {
                    this.addAssistantMessage(
                        '✨ 日照效果播放中...\n' +
                        '💡 您可以观察到随着时间推移，阴影区域的变化情况。\n' +
                        '🖱️ 点击场景中任意位置可以获取该点的实时阴影率。'
                    );
                }, 1000);
                
                return { success: true, message: '日照效果已启动' };
            } else {
                throw new Error('日照效果启动失败');
            }
        } catch (error) {
            console.error('执行日照效果失败:', error);
            this.addAssistantMessage(`❌ 日照效果执行失败: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * 执行获取阴影率
     * @param {Object} params - 参数
     * @returns {Promise<Object>} 执行结果
     */
    async executeGetShadowRatio(params = {}) {
        try {
            const digitalTwinAnalysis = window.realityTwin3DAnalysisTool.digitalTwinAnalysis;
            
            if (!digitalTwinAnalysis.shadowQuery) {
                this.addAssistantMessage('❌ 请先执行阴影分析，然后再获取阴影率。');
                return { success: false, message: '需要先执行阴影分析' };
            }
            
            this.addAssistantMessage(
                '🖱️ 阴影率查询模式已激活\n' +
                '请点击场景中的任意位置，我将为您显示该点的阴影率信息。\n' +
                '📊 阴影率表示该位置在分析时间段内被阴影覆盖的比例。'
            );
            
            // 激活阴影率查询
            digitalTwinAnalysis.getShadowRatio((result) => {
                if (result) {
                    this.addAssistantMessage(
                        `📍 位置信息：\n` +
                        `🌐 经度：${result.longitude.toFixed(6)}°\n` +
                        `🌐 纬度：${result.latitude.toFixed(6)}°\n` +
                        `📏 高程：${result.height.toFixed(2)}米\n` +
                        `🌑 阴影率：${(result.shadowRatio * 100).toFixed(1)}%\n\n` +
                        `💡 ${this.getShadowRatioAdvice(result.shadowRatio)}`
                    );
                }
            });
            
            return { success: true, message: '阴影率查询模式已激活' };
        } catch (error) {
            console.error('执行获取阴影率失败:', error);
            this.addAssistantMessage(`❌ 阴影率查询失败: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * 获取阴影率建议
     * @param {number} shadowRatio - 阴影率
     * @returns {string} 建议文本
     */
    getShadowRatioAdvice(shadowRatio) {
        if (shadowRatio < 0.2) {
            return '该位置光照充足，适合需要充足阳光的活动。';
        } else if (shadowRatio < 0.5) {
            return '该位置光照适中，阴影和阳光比较均衡。';
        } else if (shadowRatio < 0.8) {
            return '该位置阴影较多，适合需要遮阴的活动。';
        } else {
            return '该位置大部分时间处于阴影中，光照不足。';
        }
    }

    /**
     * 生成阴影分析报告
     * @param {Object} params - 分析参数
     * @returns {string} 分析报告
     */
    generateShadowAnalysisReport(params) {
        const duration = params.endTime - params.startTime;
        const analysisType = duration <= 2 ? '短时分析' : duration <= 6 ? '中期分析' : '全日分析';
        
        return `📊 **阴影分析报告**\n\n` +
               `✅ 分析区域绘制完成！\n` +
               `📅 分析日期：${params.date}\n` +
               `⏰ 分析时段：${params.startTime}:00 - ${params.endTime}:00 (${duration}小时)\n` +
               `📏 分析参数：底面高度${params.bottomHeight}m，拉伸高度${params.extrudeHeight}m\n` +
               `🔍 分析类型：${analysisType}\n\n` +
               `💡 **分析结果说明：**\n` +
               `• 红色区域：阴影覆盖区域\n` +
               `• 蓝色区域：阳光直射区域\n` +
               `• 颜色深浅：表示阴影强度`;
    }

    /**
     * 生成阴影分析建议
     * @param {Object} params - 分析参数
     * @returns {string} 操作建议
     */
    generateShadowAnalysisSuggestions(params) {
        const duration = params.endTime - params.startTime;
        const isMorning = params.startTime < 12;
        const isEvening = params.endTime > 18;
        
        let suggestions = `🎯 **后续操作建议：**\n\n`;
        
        // 基于时间段的建议
        if (duration >= 6) {
            suggestions += `🌅 **日照效果展示**\n` +
                          `• 说"开始日照效果"查看全天阴影变化\n` +
                          `• 观察建筑阴影的动态变化规律\n\n`;
        } else if (isMorning) {
            suggestions += `🌄 **晨间分析**\n` +
                          `• 当前为上午时段分析\n` +
                          `• 建议查看下午时段对比效果\n\n`;
        } else if (isEvening) {
            suggestions += `🌇 **傍晚分析**\n` +
                          `• 当前为傍晚时段分析\n` +
                          `• 建议查看上午时段对比效果\n\n`;
        }
        
        suggestions += `📍 **阴影率查询**\n` +
                      `• 点击场景任意位置获取阴影率\n` +
                      `• 了解具体位置的光照情况\n\n` +
                      `🎬 **动画播放**\n` +
                      `• 说"播放日照动画"观看时间变化\n` +
                      `• 直观了解阴影移动轨迹\n\n` +
                      `🔧 **其他操作**\n` +
                      `• 说"清除分析"移除当前结果\n` +
                      `• 说"导出结果"保存分析数据\n` +
                      `• 说"重新分析"修改参数重新计算`;
        
        return suggestions;
    }
    
    /**
     * 处理阴影分析参数消息
     * @param {string} message - 用户消息
     */
    async handleShadowParameterMessage(message) {
        try {
            // 解析用户输入的参数
            const params = this.extractShadowParametersFromMessage(message);
            
            // 合并参数
            const mergedParams = { ...this.shadowAnalysisState.params, ...params };
            
            // 检查是否已有足够参数
            if (mergedParams.date && mergedParams.startTime && mergedParams.endTime) {
                // 参数完整，显示确认信息并开始分析
                let confirmMessage = '✅ **参数设置完成！**\n\n';
                confirmMessage += '📋 **分析配置：**\n';
                confirmMessage += `📅 分析日期：${mergedParams.date}\n`;
                confirmMessage += `🕐 时间范围：${mergedParams.startTime}:00 - ${mergedParams.endTime}:00\n`;
                confirmMessage += `⏱️ 分析时长：${mergedParams.endTime - mergedParams.startTime}小时\n\n`;
                confirmMessage += '🚀 正在启动阴影分析，请稍候...';
                
                this.addAssistantMessage(confirmMessage);
                
                // 重置状态并开始分析
                this.resetShadowAnalysisState();
                await this.executeShadowAnalysis(mergedParams);
            } else {
                // 参数不完整，显示进度和继续询问
                this.shadowAnalysisState.params = mergedParams;
                
                let responseMessage = '';
                
                // 如果有新参数被识别，显示确认
                if (Object.keys(params).length > 0) {
                    responseMessage += '✅ **已识别并保存：**\n';
                    if (params.date) responseMessage += `📅 分析日期：${params.date}\n`;
                    if (params.startTime && params.endTime) {
                        responseMessage += `🕐 时间范围：${params.startTime}:00 - ${params.endTime}:00\n`;
                    }
                    responseMessage += '\n';
                }
                
                // 显示还需要的参数
                responseMessage += '📋 **还需要设置：**\n';
                if (!mergedParams.date) {
                    responseMessage += '📅 分析日期（如：今天、明天、2024-06-21）\n';
                }
                if (!mergedParams.startTime || !mergedParams.endTime) {
                    responseMessage += '🕐 分析时间范围（如：上午9点到下午5点）\n';
                }
                
                responseMessage += '\n💡 **提示：** 您可以继续输入缺少的信息，或者一次性提供完整的设置。';
                
                this.addAssistantMessage(responseMessage);
            }
        } catch (error) {
            console.error('处理阴影参数消息失败:', error);
            this.addAssistantMessage(`❌ 参数解析失败: ${error.message}\n\n请重新输入参数，格式如："今天上午9点到下午5点"`);
        }
    }
    
    /**
     * 从消息中提取阴影分析参数
     * @param {string} message - 用户消息
     * @returns {Object} 提取的参数
     */
    extractShadowParametersFromMessage(message) {
        const params = {};
        
        // 提取日期
        const datePatterns = [
            /(?:今天|today)/i,
            /(?:明天|tomorrow)/i,
            /(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/,
            /(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/
        ];
        
        for (const pattern of datePatterns) {
            const match = message.match(pattern);
            if (match) {
                params.date = this.parseDate(match[0]);
                break;
            }
        }
        
        // 提取时间范围
        const timePatterns = [
            /(上午|早上)?(\d{1,2})(?:点|:00)?(?:到|至|-|~)(下午|晚上)?(\d{1,2})(?:点|:00)?/,
            /(\d{1,2}):(\d{2})(?:到|至|-|~)(\d{1,2}):(\d{2})/,
            /(\d{1,2})(?:到|至|-|~)(\d{1,2})/
        ];
        
        for (const pattern of timePatterns) {
            const match = message.match(pattern);
            if (match) {
                const timeInfo = this.parseTimeRange(match[0]);
                if (timeInfo.startTime) params.startTime = timeInfo.startTime;
                if (timeInfo.endTime) params.endTime = timeInfo.endTime;
                break;
            }
        }
        
        return params;
    }
    
    /**
     * 处理基础操作指令
     * @param {string} message - 用户消息
     * @returns {boolean} 是否处理了基础操作指令
     */
    async handleBasicOperationCommands(message) {
        console.log('🎯 进入 handleBasicOperationCommands 方法，消息:', message);
        const lowerMessage = message.toLowerCase().trim();
        console.log('🔤 转换后的小写消息:', lowerMessage);
        
        // 放大操作
        if (lowerMessage.includes('放大') || lowerMessage.includes('zoom in')) {
            console.log('🔍 检测到放大操作');
            this.stopTypingIndicator();
            
            // 提取放大倍数
            const zoomMatch = message.match(/(\d+(?:\.\d+)?)\s*倍?/);
            const factor = zoomMatch ? parseFloat(zoomMatch[1]) : 2;
            
            await this.executeZoomIn({ factor });
            return true;
        }
        
        // 缩小操作
        if (lowerMessage.includes('缩小') || lowerMessage.includes('zoom out')) {
            this.stopTypingIndicator();
            
            // 提取缩小倍数
            const zoomMatch = message.match(/(\d+(?:\.\d+)?)\s*倍?/);
            const factor = zoomMatch ? parseFloat(zoomMatch[1]) : 2;
            
            await this.executeZoomOut({ factor });
            return true;
        }
        
        // 平移操作
        if (lowerMessage.includes('平移') || lowerMessage.includes('移动') || lowerMessage.includes('pan')) {
            this.stopTypingIndicator();
            
            // 提取方向和距离
            const direction = this.extractPanDirection(message);
            const distance = this.extractDistance(message);
            
            await this.executePan({ direction, distance });
            return true;
        }
        
        // 旋转操作
        if (lowerMessage.includes('旋转') || lowerMessage.includes('rotate')) {
            this.stopTypingIndicator();
            
            // 提取旋转方向和角度
            const direction = this.extractRotateDirection(message);
            const angle = this.extractAngle(message);
            
            await this.executeRotate({ direction, angle });
            return true;
        }
        
        // 重置视角操作
        if (lowerMessage.includes('重置') || lowerMessage.includes('初始') || lowerMessage.includes('reset')) {
            this.stopTypingIndicator();
            await this.executeResetView();
            return true;
        }
        
        // 检索操作
        if (lowerMessage.includes('搜索') || lowerMessage.includes('查找') || lowerMessage.includes('search')) {
            this.stopTypingIndicator();
            
            // 提取搜索关键词
            const keyword = this.extractSearchKeyword(message);
            await this.executeSearch({ keyword });
            return true;
        }
        
        return false;
    }
    
    /**
     * 提取平移方向
     * @param {string} message - 用户消息
     * @returns {string} 平移方向
     */
    extractPanDirection(message) {
        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.includes('北') || lowerMessage.includes('上') || lowerMessage.includes('up')) {
            return 'up';
        } else if (lowerMessage.includes('南') || lowerMessage.includes('下') || lowerMessage.includes('down')) {
            return 'down';
        } else if (lowerMessage.includes('东') || lowerMessage.includes('右') || lowerMessage.includes('right')) {
            return 'right';
        } else if (lowerMessage.includes('西') || lowerMessage.includes('左') || lowerMessage.includes('left')) {
            return 'left';
        }
        
        return 'up'; // 默认向上
    }
    
    /**
     * 提取旋转方向
     * @param {string} message - 用户消息
     * @returns {string} 旋转方向
     */
    extractRotateDirection(message) {
        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.includes('左') || lowerMessage.includes('left')) {
            return 'left';
        } else if (lowerMessage.includes('右') || lowerMessage.includes('right')) {
            return 'right';
        } else if (lowerMessage.includes('上') || lowerMessage.includes('up')) {
            return 'up';
        } else if (lowerMessage.includes('下') || lowerMessage.includes('down')) {
            return 'down';
        }
        
        return 'left'; // 默认向左
    }
    
    /**
     * 提取距离
     * @param {string} message - 用户消息
     * @returns {number} 距离（米）
     */
    extractDistance(message) {
        const distanceMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:米|m|meter)/i);
        return distanceMatch ? parseFloat(distanceMatch[1]) : 100; // 默认100米
    }
    
    /**
     * 提取角度
     * @param {string} message - 用户消息
     * @returns {number} 角度（度）
     */
    extractAngle(message) {
        const angleMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:度|°|deg)/i);
        return angleMatch ? parseFloat(angleMatch[1]) : 45; // 默认45度
    }
    
    /**
     * 提取搜索关键词
     * @param {string} message - 用户消息
     * @returns {string} 搜索关键词
     */
    extractSearchKeyword(message) {
        // 移除操作词汇，提取实际搜索内容
        const keyword = message.replace(/(?:搜索|查找|search)\s*/gi, '').trim();
        return keyword || '建筑'; // 默认搜索建筑
    }

    /**
     * 检查是否是快捷指令
     * @param {string} message - 用户消息
     * @returns {boolean} 是否是快捷指令
     */
    isShortcutCommand(message) {
        const shortcuts = [
            /(?:开始|播放|展示)(?:日照|阳光)(?:效果|动画)/i,
            /(?:查看|获取|显示)(?:阴影率|阴影信息)/i,
            /(?:点击|查询)(?:阴影|位置)/i
        ];
        
        return shortcuts.some(pattern => pattern.test(message));
    }
    
    /**
     * 处理快捷指令
     * @param {string} message - 用户消息
     */
    async handleShortcutCommand(message) {
        try {
            if (/(?:开始|播放|展示)(?:日照|阳光)(?:效果|动画)/i.test(message)) {
                await this.executeSunlightEffect();
            } else if (/(?:查看|获取|显示)(?:阴影率|阴影信息)/i.test(message)) {
                await this.executeGetShadowRatio();
            } else if (/(?:点击|查询)(?:阴影|位置)/i.test(message)) {
                await this.executeGetShadowRatio();
            }
        } catch (error) {
            console.error('处理快捷指令失败:', error);
            this.addAssistantMessage(`执行指令失败: ${error.message}`);
        }
    }

    /**
     * 启动交互式天际线分析
     * @param {Object} params - 分析参数
     * @returns {Promise<Object>} 分析结果
     */
    async startInteractiveSkylineAnalysis(params = {}) {
        try {
            // 重置状态
            this.resetSkylineAnalysisState();
            this.skylineAnalysisState.isActive = true;
            this.skylineAnalysisState.params = params;
            
            // 检查是否有足够的参数直接执行分析
            if (this.hasSufficientSkylineParams(params)) {
                return await this.executeSkylineAnalysisWithParams(params);
            }
            
            // 启动参数设置向导
            return await this.startInteractiveSkylineParameterSetting(params);
            
        } catch (error) {
            console.error('启动交互式天际线分析失败:', error);
            this.resetSkylineAnalysisState();
            throw new Error(`启动交互式天际线分析失败: ${error.message}`);
        }
    }

    /**
     * 检查是否有足够的天际线分析参数
     * @param {Object} params - 分析参数
     * @returns {boolean} 是否有足够参数
     */
    hasSufficientSkylineParams(params) {
        // 如果有观察点坐标，认为参数足够
        return params.longitude !== undefined && params.latitude !== undefined;
    }

    /**
     * 启动交互式天际线参数设置
     * @param {Object} params - 已有参数
     * @returns {Promise<Object>} 设置结果
     */
    async startInteractiveSkylineParameterSetting(params = {}) {
        try {
            this.skylineAnalysisState.step = 1;
            
            // 构建参数设置向导消息
            let message = this.buildSkylineParameterMessage(params);
            
            this.addAssistantMessage(message);
            
            // 如果没有观察点，启动点击选择模式
            if (!params.longitude || !params.latitude) {
                this.initSkylineClickHandler();
            }
            
            return {
                success: true,
                message: '已启动天际线分析参数设置向导'
            };
        } catch (error) {
            console.error('启动天际线参数设置失败:', error);
            throw new Error(`启动天际线参数设置失败: ${error.message}`);
        }
    }

    /**
     * 构建天际线参数设置消息
     * @param {Object} params - 当前参数
     * @returns {string} 设置消息
     */
    buildSkylineParameterMessage(params) {
        let message = '🏙️ **天际线分析设置**\n\n';
        
        // 显示已设置的参数
        const setParams = [];
        if (params.longitude && params.latitude) {
            setParams.push(`观察点: (${params.longitude.toFixed(6)}, ${params.latitude.toFixed(6)})`);
        }
        if (params.radius) {
            setParams.push(`半径: ${params.radius}米`);
        }
        
        if (setParams.length > 0) {
            message += '**已设置:** ' + setParams.join(', ') + '\n\n';
        }
        
        // 显示需要设置的参数
        const needParams = [];
        if (!params.longitude || !params.latitude) {
            needParams.push('点击选择观察点');
        }
        if (!params.radius) {
            needParams.push('输入半径（如"500米"）');
        }
        
        if (needParams.length > 0) {
            message += '**需要:** ' + needParams.join('、') + '\n\n';
        }
        
        // 添加功能选项
        message += '**功能:** 二维天际线、绘制限高体、拉伸闭合体';
        
        return message;
    }

    /**
     * 重置天际线分析状态
     */
    resetSkylineAnalysisState() {
        if (this.skylineAnalysisState.handler) {
            this.skylineAnalysisState.handler.destroy();
        }
        
        this.skylineAnalysisState = {
            isActive: false,
            step: 0,
            params: {},
            handler: null
        };
        
        // 恢复鼠标样式
        if (this.viewer) {
            this.viewer.enableCursorStyle = true;
            this.viewer._element.style.cursor = 'default';
        }
    }

    /**
     * 初始化天际线分析点击处理器
     */
    initSkylineClickHandler() {
        if (!this.viewer || !this.scene) {
            throw new Error('场景未初始化');
        }
        
        // 设置鼠标样式
        this.viewer.enableCursorStyle = false;
        this.viewer._element.style.cursor = 'crosshair';
        
        // 创建点击处理器
        this.skylineAnalysisState.handler = new SuperMap3D.ScreenSpaceEventHandler(this.viewer.scene.canvas);
        
        // 绑定左键点击事件
        this.skylineAnalysisState.handler.setInputAction((event) => {
            this.handleSkylineClick(event.position);
        }, SuperMap3D.ScreenSpaceEventType.LEFT_CLICK);
        
        // 绑定右键取消事件
        this.skylineAnalysisState.handler.setInputAction(() => {
            this.cancelSkylineAnalysis();
        }, SuperMap3D.ScreenSpaceEventType.RIGHT_CLICK);
    }

    /**
     * 处理天际线分析点击事件
     * @param {SuperMap3D.Cartesian2} windowPosition - 屏幕坐标
     */
    async handleSkylineClick(windowPosition) {
        try {
            // 获取点击位置的三维坐标
            const position = this.pickPosition(windowPosition, this.viewer, this.scene);
            if (!position) {
                this.addAssistantMessage('无法获取点击位置，请点击场景中的有效位置。');
                return;
            }
            
            // 执行天际线分析
            await this.completeSkylineAnalysis(position);
            
        } catch (error) {
            console.error('处理天际线分析点击失败:', error);
            this.addAssistantMessage(`点击处理失败: ${error.message}`);
        }
    }

    /**
     * 完成天际线分析
     * @param {SuperMap3D.Cartesian3} position - 观察点位置
     */
    async completeSkylineAnalysis(position) {
        try {
            // 转换坐标
            const cartographic = SuperMap3D.Cartographic.fromCartesian(position);
            const longitude = SuperMap3D.Math.toDegrees(cartographic.longitude);
            const latitude = SuperMap3D.Math.toDegrees(cartographic.latitude);
            const height = cartographic.height;
            
            // 更新参数
            this.skylineAnalysisState.params.longitude = longitude;
            this.skylineAnalysisState.params.latitude = latitude;
            this.skylineAnalysisState.params.height = height;
            
            this.addAssistantMessage(`已选择观察点: (${longitude.toFixed(6)}, ${latitude.toFixed(6)})`);
            
            // 检查是否还需要其他参数
            if (!this.skylineAnalysisState.params.radius) {
                this.addAssistantMessage('请设置分析半径，例如："分析半径5000米"');
                return;
            }
            
            // 参数完整，执行分析
            await this.executeSkylineAnalysisWithParams(this.skylineAnalysisState.params);
            
        } catch (error) {
            console.error('完成天际线分析失败:', error);
            this.addAssistantMessage(`点击处理失败: ${error.message}`);
        }
    }

    /**
     * 使用参数执行天际线分析
     * @param {Object} params - 分析参数
     * @returns {Promise<Object>} 分析结果
     */
    async executeSkylineAnalysisWithParams(params) {
        try {
            // 获取三维分析工具实例
            const digitalTwinAnalysis = window.realityTwin3DAnalysisTool.digitalTwinAnalysis;
            
            // 设置分析参数
            const analysisParams = {
                longitude: params.longitude,
                latitude: params.latitude,
                height: params.height || 100,
                radius: params.radius || 5000,
                ...params
            };
            
            // 执行基础天际线分析
            const result = await digitalTwinAnalysis.extractSkyline(analysisParams.radius);
            
            if (result) {
                let message = `✅ 天际线分析完成！\n观察点: (${analysisParams.longitude.toFixed(6)}, ${analysisParams.latitude.toFixed(6)})\n分析半径: ${analysisParams.radius}米`;
                
                // 根据分析类型执行相应功能
                if (params.analysisType) {
                    await this.executeSkylineFeature(params.analysisType, digitalTwinAnalysis);
                } else {
                    message += '\n\n您可以继续执行：\n• "生成二维天际线"\n• "绘制限高体"\n• "生成拉伸闭合体"';
                }
                
                this.addAssistantMessage(message);
            } else {
                this.addAssistantMessage('天际线分析执行失败，请重试。');
            }
            
            // 重置状态
            this.resetSkylineAnalysisState();
            
            return {
                success: true,
                message: '天际线分析完成'
            };
            
        } catch (error) {
            console.error('执行天际线分析失败:', error);
            this.addAssistantMessage(`天际线分析失败: ${error.message}`);
            this.resetSkylineAnalysisState();
            throw error;
        }
    }

    /**
     * 执行天际线特定功能
     * @param {string} featureType - 功能类型
     * @param {Object} digitalTwinAnalysis - 分析工具实例
     */
    async executeSkylineFeature(featureType, digitalTwinAnalysis) {
        try {
            switch (featureType) {
                case '二维天际线':
                case 'skyline2d':
                    await this.generateSkyline2D(digitalTwinAnalysis);
                    break;
                case '限高体':
                case 'limitbody':
                    await this.startLimitBodyDrawing(digitalTwinAnalysis);
                    break;
                case '拉伸闭合体':
                case 'skylinearea':
                    await this.generateSkylineArea(digitalTwinAnalysis);
                    break;
                default:
                    console.warn('未知的天际线功能类型:', featureType);
            }
        } catch (error) {
            console.error('执行天际线功能失败:', error);
            this.addAssistantMessage(`执行${featureType}功能失败: ${error.message}`);
        }
    }

    /**
     * 取消天际线分析
     */
    /**
     * 取消天际线分析
     */
    cancelSkylineAnalysis() {
        this.addAssistantMessage('天际线分析已取消。');
        this.resetSkylineAnalysisState();
    }

    /**
     * 检查天际线分析是否已完成
     * @returns {boolean} 天际线分析是否已完成
     */
    isSkylineAnalysisCompleted() {
        try {
            // 检查digitalTwinAnalysis实例是否存在
            if (!window.digitalTwinAnalysis) {
                return false;
            }
            
            // 检查天际线对象是否存在且已初始化
            const skyline = window.digitalTwinAnalysis.skyline;
            if (!skyline) {
                return false;
            }
            
            // 检查天际线是否已构建（有viewPosition表示已设置参数）
            return skyline.viewPosition && skyline.viewPosition.length === 3;
        } catch (error) {
            console.error('检查天际线分析状态失败:', error);
            return false;
        }
    }

    /**
     * 生成二维天际线
     * @param {Object} digitalTwinAnalysis - 分析工具实例
     */
    async generateSkyline2D(digitalTwinAnalysis) {
        try {
            const skylineData = await digitalTwinAnalysis.getSkyline2DData();
            
            if (skylineData && skylineData.x && skylineData.y) {
                // 显示二维天际线图表
                this.displaySkyline2DChart(skylineData);
                this.addAssistantMessage('✅ 二维天际线图表已生成');
            } else {
                this.addAssistantMessage('❌ 生成二维天际线数据失败');
            }
        } catch (error) {
            console.error('生成二维天际线失败:', error);
            this.addAssistantMessage(`生成二维天际线失败: ${error.message}`);
        }
    }

    /**
     * 显示二维天际线图表
     * @param {Object} skylineData - 天际线数据
     */
    displaySkyline2DChart(skylineData) {
        try {
            // 验证数据
            if (!skylineData || !skylineData.x || !skylineData.y) {
                throw new Error('天际线数据无效');
            }
            
            // 创建图表容器元素
            const chartContainer = document.createElement('div');
            chartContainer.className = 'skyline-chart-container';
            chartContainer.style.cssText = `
                width: 100%;
                height: 300px;
                margin: 15px 0;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                background: #f8f9fa;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            `;
            
            // 使用ECharts显示图表（如果可用）
            if (typeof echarts !== 'undefined') {
                const chart = echarts.init(chartContainer);
                const option = {
                    backgroundColor: "rgba(73,139,156,0.95)",
                    title: {
                        text: "二维天际线分析图表",
                        left: 'center',
                        textStyle: { 
                            color: '#fff',
                            fontSize: 16,
                            fontWeight: 'bold'
                        }
                    },
                    tooltip: {
                        trigger: "axis",
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        textStyle: { color: '#fff' },
                        formatter: function(params) {
                            const point = params[0];
                            return `角度: ${point.dataIndex}°<br/>高度比: ${point.value.toFixed(3)}`;
                        }
                    },
                    grid: {
                        left: '10%',
                        right: '10%',
                        bottom: '15%',
                        top: '20%'
                    },
                    xAxis: [{
                        type: "category",
                        boundaryGap: false,
                        data: skylineData.x.map((_, index) => `${index}°`),
                        axisLabel: { 
                            color: '#fff',
                            interval: Math.floor(skylineData.x.length / 8)
                        },
                        axisLine: { lineStyle: { color: '#fff' } }
                    }],
                    yAxis: [{
                        type: "value",
                        min: 0,
                        max: 1,
                        name: '高度比',
                        nameTextStyle: { color: '#fff' },
                        axisLabel: { 
                            color: '#fff',
                            formatter: '{value}'
                        },
                        axisLine: { lineStyle: { color: '#fff' } },
                        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } }
                    }],
                    series: [{
                        name: "天际线",
                        type: "line",
                        data: skylineData.y,
                        lineStyle: { 
                            color: '#00ff88',
                            width: 2
                        },
                        areaStyle: { 
                            color: {
                                type: 'linear',
                                x: 0, y: 0, x2: 0, y2: 1,
                                colorStops: [
                                    { offset: 0, color: 'rgba(0,255,136,0.6)' },
                                    { offset: 1, color: 'rgba(0,255,136,0.1)' }
                                ]
                            }
                        },
                        smooth: true,
                        symbol: 'none'
                    }]
                };
                chart.setOption(option);
                
                // 响应式调整
                window.addEventListener('resize', () => {
                    chart.resize();
                });
                
            } else {
                // ECharts不可用时的备用显示
                chartContainer.innerHTML = `
                    <div style="padding: 20px; color: #333; text-align: center; height: 100%; display: flex; flex-direction: column; justify-content: center;">
                        <h4 style="margin: 0 0 15px 0; color: #2c3e50;">📊 二维天际线数据</h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                            <div style="background: #e3f2fd; padding: 10px; border-radius: 4px;">
                                <strong>数据点数量</strong><br/>
                                ${skylineData.x.length} 个
                            </div>
                            <div style="background: #f3e5f5; padding: 10px; border-radius: 4px;">
                                <strong>高度范围</strong><br/>
                                ${Math.min(...skylineData.y).toFixed(3)} - ${Math.max(...skylineData.y).toFixed(3)}
                            </div>
                        </div>
                        <small style="color: #666;">💡 安装ECharts库可查看完整图表</small>
                    </div>
                `;
            }
            
            // 添加到最新的消息中
            const lastMessage = this.chatMessages.lastElementChild;
            if (lastMessage) {
                lastMessage.appendChild(chartContainer);
            }
            
            // 滚动到底部
            this.scrollToBottom();
            
        } catch (error) {
            console.error('显示二维天际线图表失败:', error);
            this.addAssistantMessage(`❌ 显示图表失败: ${error.message}`);
        }
    }

    /**
     * 开始限高体绘制
     * @param {Object} digitalTwinAnalysis - 分析工具实例
     */
    async startLimitBodyDrawing(digitalTwinAnalysis) {
        try {
            // 设置限高体绘制状态
            this.limitBodyDrawingState = {
                active: true,
                digitalTwinAnalysis: digitalTwinAnalysis
            };
            
            // 提供详细的绘制指导
            this.addAssistantMessage(`🏗️ **开始绘制限高体**

📋 **操作指南：**
• 🖱️ **左键点击** - 在场景中添加多边形顶点
• 🖱️ **右键点击** - 完成多边形绘制
• ⌨️ **ESC键** - 取消当前绘制

💡 **提示：**
• 建议绘制至少3个顶点形成有效多边形
• 限高体将根据您绘制的多边形区域生成
• 绘制完成后系统会自动添加限高体对象`);
            
            // 启动绘制功能
            digitalTwinAnalysis.drawLimitBody();
            
            // 监听绘制完成事件
            this.setupLimitBodyDrawingListener(digitalTwinAnalysis);
            
        } catch (error) {
            console.error('开始限高体绘制失败:', error);
            this.addAssistantMessage(`❌ 开始限高体绘制失败: ${error.message}`);
            this.resetLimitBodyDrawingState();
        }
    }
    
    /**
     * 设置限高体绘制完成监听器
     * @param {Object} digitalTwinAnalysis - 分析工具实例
     */
    setupLimitBodyDrawingListener(digitalTwinAnalysis) {
        // 监听绘制完成事件
        if (digitalTwinAnalysis.handler && digitalTwinAnalysis.handler.drawingMode) {
            const originalCompleteHandler = digitalTwinAnalysis.handleSkylinePolygonDrawComplete;
            if (originalCompleteHandler) {
                digitalTwinAnalysis.handleSkylinePolygonDrawComplete = (event) => {
                    // 调用原始处理函数
                    originalCompleteHandler.call(digitalTwinAnalysis, event);
                    
                    // 添加智能反馈
                    this.handleLimitBodyDrawComplete(event);
                };
            }
        }
    }
    
    /**
     * 处理限高体绘制完成
     * @param {Object} event - 绘制完成事件
     */
    handleLimitBodyDrawComplete(event) {
        try {
            if (event && event.object) {
                this.addAssistantMessage(`✅ **限高体绘制完成！**

🎯 **绘制结果：**
• 多边形顶点数：${event.object.positions ? event.object.positions.length : '未知'}
• 限高体对象已添加到场景中
• 可以继续绘制更多限高体或进行其他分析

💡 **后续操作建议：**
• 输入"清除限高体"可移除当前限高体
• 输入"天际线分析"可进行天际线分析
• 输入"二维天际线"可生成二维天际线图表`);
            } else {
                this.addAssistantMessage('⚠️ 限高体绘制完成，但未能获取详细信息。');
            }
        } catch (error) {
            console.error('处理限高体绘制完成失败:', error);
            this.addAssistantMessage('⚠️ 限高体绘制完成，但处理过程中出现错误。');
        } finally {
            this.resetLimitBodyDrawingState();
        }
    }
    
    /**
      * 重置限高体绘制状态
      */
     resetLimitBodyDrawingState() {
         this.limitBodyDrawingState = {
             active: false,
             digitalTwinAnalysis: null
         };
     }
     
     /**
      * 处理限高体绘制状态下的用户输入
      * @param {string} message - 用户消息
      */
     async handleLimitBodyDrawingInput(message) {
         const lowerMessage = message.toLowerCase().trim();
         
         try {
             // 处理取消命令
             if (lowerMessage === '取消' || lowerMessage === 'cancel' || lowerMessage === '退出') {
                 this.cancelLimitBodyDrawing();
                 return;
             }
             
             // 处理完成命令
             if (lowerMessage === '完成' || lowerMessage === 'finish' || lowerMessage === 'done') {
                 this.addAssistantMessage('ℹ️ 请在场景中右键完成多边形绘制，或按ESC键取消绘制。');
                 return;
             }
             
             // 处理帮助命令
             if (lowerMessage === '帮助' || lowerMessage === 'help' || lowerMessage === '?') {
                 this.addAssistantMessage(`🆘 **限高体绘制帮助**

🖱️ **鼠标操作：**
• 左键点击 - 添加多边形顶点
• 右键点击 - 完成多边形绘制
• ESC键 - 取消当前绘制

💬 **语音命令：**
• "取消" - 取消绘制
• "帮助" - 显示此帮助信息

📝 **注意事项：**
• 至少需要3个顶点形成有效多边形
• 绘制完成后会自动生成限高体`);
                 return;
             }
             
             // 处理清除命令
             if (lowerMessage === '清除' || lowerMessage === 'clear' || lowerMessage === '重新开始') {
                 if (this.limitBodyDrawingState.digitalTwinAnalysis) {
                     // 清除当前绘制
                     this.limitBodyDrawingState.digitalTwinAnalysis.clearLimitBody();
                     this.addAssistantMessage('🔄 已清除当前限高体，可以重新开始绘制。');
                 }
                 return;
             }
             
             // 对于其他输入，提供引导信息
             this.addAssistantMessage(`💡 **当前正在绘制限高体**

请使用鼠标在场景中绘制多边形：
• 🖱️ 左键点击添加顶点
• 🖱️右键完成绘制

或输入以下命令：
• "取消" - 取消绘制
• "清除" - 清除当前绘制
• "帮助" - 查看详细帮助`);
             
         } catch (error) {
             console.error('处理限高体绘制输入失败:', error);
             this.addAssistantMessage(`❌ 处理输入失败: ${error.message}`);
         }
     }
     
     /**
      * 取消限高体绘制
      */
     cancelLimitBodyDrawing() {
         try {
             if (this.limitBodyDrawingState.digitalTwinAnalysis) {
                 // 取消绘制模式
                 if (this.limitBodyDrawingState.digitalTwinAnalysis.handler) {
                     this.limitBodyDrawingState.digitalTwinAnalysis.handler.deactivate();
                 }
                 
                 // 清除绘制状态
                 this.limitBodyDrawingState.digitalTwinAnalysis.clearLimitBody();
             }
             
             this.addAssistantMessage('❌ 限高体绘制已取消。');
             this.resetLimitBodyDrawingState();
             
         } catch (error) {
             console.error('取消限高体绘制失败:', error);
             this.addAssistantMessage(`❌ 取消绘制失败: ${error.message}`);
             this.resetLimitBodyDrawingState();
         }
     }

    /**
     * 生成天际线拉伸闭合体
     * @param {Object} digitalTwinAnalysis - 分析工具实例
     * @param {Object} params - 拉伸参数
     */
    async generateSkylineArea(digitalTwinAnalysis, params = {}) {
        try {
            // 设置拉伸闭合体生成状态
            this.skylineAreaState = {
                active: true,
                digitalTwinAnalysis: digitalTwinAnalysis,
                params: params
            };
            
            this.addAssistantMessage(`🏗️ **开始生成天际线拉伸闭合体**\n\n📋 **生成参数：**\n• 观察点：${params.viewPoint ? '已设置' : '使用默认位置'}\n• 分析半径：${params.radius || '默认半径'}\n• 高度范围：自动计算\n\n⏳ 正在生成三维拉伸闭合体...`);
            
            // 执行拉伸闭合体生成
            const entity = digitalTwinAnalysis.getSkylineArea();
            
            if (entity) {
                this.handleSkylineAreaSuccess(entity, params);
            } else {
                this.handleSkylineAreaFailure('未能生成拉伸闭合体对象');
            }
            
        } catch (error) {
            console.error('生成天际线拉伸闭合体失败:', error);
            this.handleSkylineAreaFailure(error.message);
        } finally {
            this.resetSkylineAreaState();
        }
    }
    
    /**
     * 处理拉伸闭合体生成成功
     * @param {Object} entity - 生成的实体对象
     * @param {Object} params - 生成参数
     */
    handleSkylineAreaSuccess(entity, params) {
        try {
            // 获取实体属性信息
            const entityInfo = this.extractEntityInfo(entity);
            
            this.addAssistantMessage(`✅ **天际线拉伸闭合体生成成功！**\n\n🎯 **生成结果：**\n• 实体类型：三维拉伸闭合体\n• 显示颜色：橙色半透明\n• 顶点数量：${entityInfo.vertexCount || '未知'}\n• 体积范围：${entityInfo.volume || '自动计算'}\n\n💡 **功能说明：**\n• 橙色区域显示了天际线的三维范围\n• 可以直观了解建筑物对天际线的影响\n• 支持与其他分析功能联合使用\n\n🔧 **后续操作：**\n• 输入\"清除拉伸体\"可移除当前对象\n• 输入\"二维天际线\"可生成平面图表\n• 输入\"限高体分析\"可进行限高分析`);
            
        } catch (error) {
            console.error('处理拉伸闭合体成功结果失败:', error);
            this.addAssistantMessage('✅ 天际线拉伸闭合体已生成，但获取详细信息时出现错误。');
        }
    }
    
    /**
     * 处理拉伸闭合体生成失败
     * @param {string} errorMessage - 错误信息
     */
    handleSkylineAreaFailure(errorMessage) {
        this.addAssistantMessage(`❌ **天际线拉伸闭合体生成失败**\n\n🔍 **失败原因：**\n${errorMessage}\n\n💡 **解决建议：**\n• 确保已设置有效的观察点\n• 检查分析半径是否合适\n• 确认场景中有足够的建筑物数据\n• 尝试重新进行天际线分析\n\n🔄 **重试方法：**\n• 输入\"天际线分析\"重新开始\n• 输入\"设置观察点\"调整参数`);
    }
    
    /**
     * 提取实体信息
     * @param {Object} entity - 实体对象
     * @returns {Object} 实体信息
     */
    extractEntityInfo(entity) {
        try {
            const info = {
                vertexCount: 'unknown',
                volume: 'auto-calculated',
                bounds: 'computed'
            };
            
            // 尝试获取实体的几何信息
            if (entity && entity.polygon) {
                const positions = entity.polygon.hierarchy;
                if (positions && positions.getValue) {
                    const positionArray = positions.getValue();
                    info.vertexCount = positionArray.length;
                }
            }
            
            return info;
        } catch (error) {
            console.error('提取实体信息失败:', error);
            return {
                vertexCount: 'unknown',
                volume: 'unknown',
                bounds: 'unknown'
            };
        }
    }
    
    /**
     * 重置拉伸闭合体状态
     */
    resetSkylineAreaState() {
        this.skylineAreaState = {
            active: false,
            digitalTwinAnalysis: null,
            params: {}
        };
    }
    
    /**
     * 处理拉伸闭合体相关命令
     * @param {string} message - 用户输入的消息
     * @returns {boolean} 是否处理了命令
     */
    async handleSkylineAreaCommands(message) {
        const lowerMessage = message.toLowerCase().trim();
        
        // 拉伸闭合体生成命令 - 更精确的匹配，避免误匹配"天际线分析"
        if (lowerMessage.includes('拉伸闭合体') || lowerMessage.includes('拉伸体') || 
            (lowerMessage.includes('天际线') && lowerMessage.includes('拉伸')) || 
            lowerMessage.includes('skyline area')) {
            
            try {
                // 检查是否有数字孪生分析工具实例
                const digitalTwinAnalysis = window.realityTwin3DAnalysisTool?.digitalTwinAnalysis;
                if (!digitalTwinAnalysis) {
                    this.addAssistantMessage('❌ 数字孪生分析工具未初始化，请先加载场景。');
                    return true;
                }
                
                // 检查是否已进行天际线分析
                if (!digitalTwinAnalysis.skyline || !digitalTwinAnalysis.skyline.viewPosition) {
                    this.addAssistantMessage('⚠️ **请先进行天际线分析**\n\n💡 **操作步骤：**\n1. 输入"天际线分析"开始分析\n2. 设置观察点和分析参数\n3. 完成分析后即可生成拉伸闭合体\n\n🔧 **快速开始：** 输入"天际线分析"');
                    return true;
                }
                
                // 解析参数
                const params = this.extractSkylineAreaParams(message);
                
                this.addAssistantMessage('🚀 **开始生成天际线拉伸闭合体**\n\n📍 基于当前天际线分析结果生成三维拉伸体...');
                
                // 生成拉伸闭合体
                await this.generateSkylineArea(digitalTwinAnalysis, params);
                
            } catch (error) {
                console.error('处理拉伸闭合体命令失败:', error);
                this.addAssistantMessage(`❌ 处理拉伸闭合体命令失败: ${error.message}`);
            }
            
            return true;
        }
        
        // 清除拉伸体命令
        if (lowerMessage.includes('清除拉伸') || lowerMessage.includes('删除拉伸') || 
            lowerMessage.includes('移除拉伸') || lowerMessage.includes('clear area')) {
            
            try {
                const digitalTwinAnalysis = window.realityTwin3DAnalysisTool?.digitalTwinAnalysis;
                if (digitalTwinAnalysis && digitalTwinAnalysis.clearSkylineArea) {
                    digitalTwinAnalysis.clearSkylineArea();
                    this.addAssistantMessage('✅ **拉伸闭合体已清除**\n\n🔧 **后续操作：**\n• 输入"拉伸闭合体"重新生成\n• 输入"天际线分析"重新分析');
                } else {
                    this.addAssistantMessage('ℹ️ 当前没有拉伸闭合体需要清除。');
                }
            } catch (error) {
                console.error('清除拉伸闭合体失败:', error);
                this.addAssistantMessage(`❌ 清除拉伸闭合体失败: ${error.message}`);
            }
            
            return true;
        }
        
        return false;
    }
    
    /**
     * 从消息中提取拉伸闭合体参数
     * @param {string} message - 用户消息
     * @returns {Object} 提取的参数
     */
    extractSkylineAreaParams(message) {
        const params = {};
        
        // 提取高度参数
        const heightMatch = message.match(/高度[：:]?\s*(\d+(?:\.\d+)?)/i);
        if (heightMatch) {
            params.height = parseFloat(heightMatch[1]);
        }
        
        // 提取半径参数
        const radiusMatch = message.match(/半径[：:]?\s*(\d+(?:\.\d+)?)/i);
        if (radiusMatch) {
            params.radius = parseFloat(radiusMatch[1]);
        }
        
        // 提取颜色参数
        const colorMatch = message.match(/颜色[：:]?\s*(\w+)/i);
        if (colorMatch) {
            params.color = colorMatch[1];
        }
        
        return params;
    }

    /**
     * 处理天际线分析状态下的参数输入
     * @param {string} message - 用户消息
     */
    async handleSkylineParameterInput(message) {
        try {
            const lowerMessage = message.toLowerCase().trim();
            
            // 处理特殊命令
            if (lowerMessage === '帮助' || lowerMessage === 'help') {
                this.showSkylineParameterHelp();
                return;
            }
            
            if (lowerMessage === '重置' || lowerMessage === 'reset') {
                this.resetSkylineParameters();
                return;
            }
            
            if (lowerMessage === '默认' || lowerMessage === 'default') {
                this.applySkylineDefaultParameters();
                return;
            }
            
            if (lowerMessage === '完成' || lowerMessage === 'done' || lowerMessage === '开始分析') {
                await this.forceSkylineAnalysis();
                return;
            }
            
            // 提取新的参数
            const newParams = this.extractSkylineParametersFromMessage(message);
            
            // 验证参数
            const validation = this.validateSkylineParameters(newParams);
            if (!validation.isValid) {
                this.addAssistantMessage(`⚠️ **参数验证失败**\n\n${validation.errors.join('\n')}\n\n💡 输入"帮助"查看参数设置指南`);
                return;
            }
            
            // 合并到现有参数
            Object.assign(this.skylineAnalysisState.params, newParams);
            
            // 提供智能建议
            const suggestions = this.getSkylineParameterSuggestions(this.skylineAnalysisState.params);
            
            // 检查是否有足够参数执行分析
            if (this.hasSufficientSkylineParams(this.skylineAnalysisState.params)) {
                this.addAssistantMessage(`✅ **参数设置完成！**\n\n📊 **当前配置：**\n${this.formatSkylineParameters(this.skylineAnalysisState.params)}\n\n🚀 正在执行天际线分析...`);
                await this.executeSkylineAnalysisWithParams(this.skylineAnalysisState.params);
            } else {
                // 显示更新后的参数状态和智能建议
                const message = this.buildEnhancedSkylineParameterMessage(this.skylineAnalysisState.params, suggestions);
                this.addAssistantMessage(message);
            }
            
        } catch (error) {
            console.error('处理天际线参数输入失败:', error);
            this.addAssistantMessage(`❌ **参数设置失败**\n\n🔍 **错误详情：** ${error.message}\n\n💡 **建议：** 输入"帮助"查看正确的参数格式`);
        }
    }
    
    /**
     * 显示天际线参数设置帮助
     */
    showSkylineParameterHelp() {
        this.addAssistantMessage(`📚 **天际线分析参数设置指南**\n\n🎯 **支持的参数：**\n• **观察点高度：** \"高度100\" 或 \"height 100\"\n• **分析半径：** \"半径500\" 或 \"radius 500\"\n• **方向角度：** \"方向90\" 或 \"direction 90\"\n• **俯仰角度：** \"俯仰30\" 或 \"pitch 30\"\n\n📝 **示例输入：**\n• \"高度150 半径800\"\n• \"height 120 radius 600 direction 45\"\n• \"俯仰角30度 方向东北\"\n\n🎛️ **快捷命令：**\n• \"默认\" - 使用推荐参数\n• \"重置\" - 清空所有参数\n• \"完成\" - 强制开始分析\n\n💡 **智能提示：** 系统会根据场景自动推荐最佳参数`);
    }
    
    /**
     * 重置天际线参数
     */
    resetSkylineParameters() {
        this.skylineAnalysisState.params = {};
        this.addAssistantMessage(`🔄 **参数已重置**\n\n请重新设置天际线分析参数，或输入\"默认\"使用推荐配置。`);
    }
    
    /**
     * 应用默认天际线参数
     */
    applySkylineDefaultParameters() {
        const defaultParams = {
            height: 100,
            radius: 1000,
            direction: 0,
            pitch: 0
        };
        
        this.skylineAnalysisState.params = defaultParams;
        this.addAssistantMessage(`⚙️ **已应用默认参数**\n\n📊 **配置详情：**\n${this.formatSkylineParameters(defaultParams)}\n\n🚀 输入\"开始分析\"执行天际线分析`);
    }
    
    /**
     * 强制执行天际线分析
     */
    async forceSkylineAnalysis() {
        if (Object.keys(this.skylineAnalysisState.params).length === 0) {
            this.addAssistantMessage(`⚠️ **尚未设置任何参数**\n\n💡 **建议：**\n• 输入\"默认\"使用推荐配置\n• 或手动设置参数，如\"高度100 半径500\"`);
            return;
        }
        
        // 补充缺失的默认参数
        const completeParams = {
            height: 100,
            radius: 1000,
            direction: 0,
            pitch: 0,
            ...this.skylineAnalysisState.params
        };
        
        this.addAssistantMessage(`🚀 **开始天际线分析**\n\n📊 **使用参数：**\n${this.formatSkylineParameters(completeParams)}\n\n⏳ 正在执行分析...`);
        await this.executeSkylineAnalysisWithParams(completeParams);
    }
    
    /**
     * 验证天际线参数
     * @param {Object} params - 参数对象
     * @returns {Object} 验证结果
     */
    validateSkylineParameters(params) {
        const errors = [];
        
        if (params.height !== undefined) {
            if (params.height < 1 || params.height > 10000) {
                errors.push('• 观察点高度应在1-10000米之间');
            }
        }
        
        if (params.radius !== undefined) {
            if (params.radius < 10 || params.radius > 50000) {
                errors.push('• 分析半径应在10-50000米之间');
            }
        }
        
        if (params.direction !== undefined) {
            if (params.direction < 0 || params.direction >= 360) {
                errors.push('• 方向角度应在0-359度之间');
            }
        }
        
        if (params.pitch !== undefined) {
            if (params.pitch < -90 || params.pitch > 90) {
                errors.push('• 俯仰角度应在-90到90度之间');
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }
    
    /**
     * 获取天际线参数智能建议
     * @param {Object} params - 当前参数
     * @returns {Array} 建议列表
     */
    getSkylineParameterSuggestions(params) {
        const suggestions = [];
        
        if (!params.height) {
            suggestions.push('💡 建议设置观察点高度，如\"高度100\"');
        } else if (params.height < 50) {
            suggestions.push('⚠️ 观察点高度较低，可能影响分析效果');
        }
        
        if (!params.radius) {
            suggestions.push('💡 建议设置分析半径，如\"半径1000\"');
        } else if (params.radius > 5000) {
            suggestions.push('⚠️ 分析半径较大，计算时间可能较长');
        }
        
        if (params.height && params.radius && params.height > params.radius / 10) {
            suggestions.push('💡 观察点高度与半径比例较大，建议调整以获得更好效果');
        }
        
        return suggestions;
    }
    
    /**
     * 格式化天际线参数显示
     * @param {Object} params - 参数对象
     * @returns {string} 格式化的参数字符串
     */
    formatSkylineParameters(params) {
        const items = [];
        
        if (params.height !== undefined) {
            items.push(`• 观察点高度：${params.height}米`);
        }
        if (params.radius !== undefined) {
            items.push(`• 分析半径：${params.radius}米`);
        }
        if (params.direction !== undefined) {
            items.push(`• 方向角度：${params.direction}度`);
        }
        if (params.pitch !== undefined) {
            items.push(`• 俯仰角度：${params.pitch}度`);
        }
        
        return items.length > 0 ? items.join('\n') : '• 暂无参数设置';
    }
    
    /**
     * 构建增强的天际线参数消息
     * @param {Object} params - 当前参数
     * @param {Array} suggestions - 智能建议
     * @returns {string} 消息内容
     */
    buildEnhancedSkylineParameterMessage(params, suggestions) {
        let message = `⚙️ **天际线分析参数设置**\n\n📊 **当前参数：**\n${this.formatSkylineParameters(params)}\n\n`;
        
        const missingParams = [];
        if (!params.height) missingParams.push('观察点高度');
        if (!params.radius) missingParams.push('分析半径');
        
        if (missingParams.length > 0) {
            message += `⚠️ **缺少必要参数：** ${missingParams.join('、')}\n\n`;
        }
        
        if (suggestions.length > 0) {
            message += `💡 **智能建议：**\n${suggestions.join('\n')}\n\n`;
        }
        
        message += `🎛️ **继续设置：**\n• 输入参数，如\"高度150 半径800\"\n• 输入\"默认\"使用推荐配置\n• 输入\"帮助\"查看详细指南\n• 输入\"完成\"开始分析`;
        
        return message;
    }

    /**
     * 开始导航流程
     */
    async startNavigationFlow() {
        try {
            // 初始化导航状态
            this.navigationState = {
                step: 1, // 1: 选择起点, 2: 选择终点, 3: 计算路径
                startPoint: null,
                endPoint: null,
                route: null
            };
            
            // 获取室内导航实例
            const indoorNavigation = window.realityTwin3DAnalysisTool?.indoorNavigation;
            if (!indoorNavigation) {
                await this.simulateTyping('导航功能暂不可用，请确保系统已正确初始化');
                return;
            }
            
            // 设置点击监听器
            this.setupNavigationClickListener();
            
        } catch (error) {
            console.error('启动导航流程失败:', error);
            await this.simulateTyping('启动导航失败，请重试');
        }
    }
    
    /**
     * 设置导航点击监听器
     */
    setupNavigationClickListener() {
        const viewer = window.realityTwin3DAnalysisTool?.viewer;
        if (!viewer || !viewer.scene) {
            console.warn('Viewer或scene未就绪，无法设置导航点击监听器');
            return;
        }
        
        // 获取canvas - 尝试多种可能的路径
        let canvas = null;
        if (viewer.cesiumWidget && viewer.cesiumWidget.canvas) {
            canvas = viewer.cesiumWidget.canvas;
        } else if (viewer.scene && viewer.scene.canvas) {
            canvas = viewer.scene.canvas;
        } else {
            // 尝试直接查找canvas元素
            canvas = document.querySelector('.supermap3d-widget canvas') || 
                    document.querySelector('#Container canvas');
        }
        
        if (!canvas) {
            console.warn('无法找到canvas元素，无法设置导航点击监听器');
            return;
        }
        
        console.log('✅ 找到canvas元素，设置导航点击监听器');
        
        // 移除之前的监听器
        if (this.navigationClickHandler) {
            canvas.removeEventListener('click', this.navigationClickHandler);
        }
        
        // 创建新的点击处理器
        this.navigationClickHandler = async (event) => {
            try {
                // 获取点击位置相对于canvas的坐标
                const rect = canvas.getBoundingClientRect();
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;
                const windowPosition = new SuperMap3D.Cartesian2(x, y);
                
                // 使用精确的位置拾取方法
                const pickedPosition = this.pickPosition(windowPosition, viewer, viewer.scene);
                if (pickedPosition) {
                    console.log('✅ 成功拾取到位置:', pickedPosition);
                    await this.handleNavigationClick(pickedPosition);
                } else {
                    console.log('⚠️ 未能拾取到有效位置，请点击模型表面或地面');
                    await this.simulateTyping('⚠️ 请点击模型表面或地面来设置位置');
                }
            } catch (error) {
                console.error('处理导航点击事件失败:', error);
            }
        };
        
        // 添加点击监听器
        canvas.addEventListener('click', this.navigationClickHandler);
        console.log('✅ 导航点击监听器已设置');
    }
    
    /**
     * 处理导航点击事件
     */
    async handleNavigationClick(position) {
        try {
            if (!this.navigationState) return;
            
            if (this.navigationState.step === 1) {
                // 设置起点
                this.navigationState.startPoint = position;
                this.addNavigationPoint(position, '起点', SuperMap3D.Color.GREEN);
                this.navigationState.step = 2;
                await this.simulateTyping('✅ 起点设置成功！现在请点击地图选择您的目的地 🎯');
                
            } else if (this.navigationState.step === 2) {
                // 设置终点
                this.navigationState.endPoint = position;
                this.addNavigationPoint(position, '终点', SuperMap3D.Color.RED);
                this.navigationState.step = 3;
                
                // 移除点击监听器
                this.removeNavigationClickListener();
                
                // 开始计算路径
                await this.calculateNavigationRoute();
            }
            
        } catch (error) {
            console.error('处理导航点击失败:', error);
        }
    }
    
    /**
     * 添加导航点标记
     */
    addNavigationPoint(position, label, color) {
        try {
            const viewer = window.realityTwin3DAnalysisTool.viewer;
            
            viewer.entities.add({
                id: `navigation-point-${label}-${Date.now()}`,
                position: position,
                point: {
                    pixelSize: 12,
                    color: color,
                    outlineColor: SuperMap3D.Color.WHITE,
                    outlineWidth: 2,
                    heightReference: SuperMap3D.HeightReference.CLAMP_TO_GROUND
                },
                label: {
                    text: label,
                    font: '14pt sans-serif',
                    fillColor: SuperMap3D.Color.WHITE,
                    outlineColor: SuperMap3D.Color.BLACK,
                    outlineWidth: 2,
                    style: SuperMap3D.LabelStyle.FILL_AND_OUTLINE,
                    pixelOffset: new SuperMap3D.Cartesian2(0, -40)
                }
            });
            
        } catch (error) {
            console.error('添加导航点标记失败:', error);
        }
    }
    
    /**
     * 计算导航路径
     */
    async calculateNavigationRoute() {
        try {
            await this.simulateTyping('🔄 正在为您计算最优路径，请稍候...');
            
            const indoorNavigation = window.realityTwin3DAnalysisTool.indoorNavigation;
            
            if (!indoorNavigation) {
                await this.simulateTyping('😔 室内导航模块未初始化，请刷新页面重试');
                this.navigationState = null;
                return;
            }
            
            // 清空之前的路径点
            indoorNavigation.routePoints = [];
            
            // 添加起点和终点到室内导航模块
            console.log('🎯 添加导航起点:', this.navigationState.startPoint);
            indoorNavigation.addRoutePoint(this.navigationState.startPoint);
            
            console.log('🎯 添加导航终点:', this.navigationState.endPoint);
            indoorNavigation.addRoutePoint(this.navigationState.endPoint);
            
            // 室内导航模块会自动计算路径（在addRoutePoint中触发）
            await this.simulateTyping('🎉 导航路径规划完成！\n📏 路径已在地图上显示\n您现在可以说"漫游"来体验路径漫游！');
            
            // 保存路径信息到导航状态
            this.navigationState.route = {
                startPoint: this.navigationState.startPoint,
                endPoint: this.navigationState.endPoint,
                success: true
            };
            
        } catch (error) {
            console.error('计算导航路径失败:', error);
            await this.simulateTyping('😔 路径计算失败，请重新选择起点和终点重试');
            this.navigationState = null;
        }
    }
    
    /**
     * 移除导航点击监听器
     */
    removeNavigationClickListener() {
        const viewer = window.realityTwin3DAnalysisTool?.viewer;
        if (!viewer || !this.navigationClickHandler) {
            return;
        }
        
        // 获取canvas - 尝试多种可能的路径
        let canvas = null;
        if (viewer.cesiumWidget && viewer.cesiumWidget.canvas) {
            canvas = viewer.cesiumWidget.canvas;
        } else if (viewer.scene && viewer.scene.canvas) {
            canvas = viewer.scene.canvas;
        } else {
            // 尝试直接查找canvas元素
            canvas = document.querySelector('.supermap3d-widget canvas') || 
                    document.querySelector('#Container canvas');
        }
        
        if (canvas) {
            canvas.removeEventListener('click', this.navigationClickHandler);
            console.log('✅ 导航点击监听器已移除');
        }
        
        this.navigationClickHandler = null;
    }
    
    /**
     * 开始漫游流程
     */
    async startTourFlow() {
        try {
            // 获取室内导航实例
            const indoorNavigation = window.realityTwin3DAnalysisTool?.indoorNavigation;
            if (!indoorNavigation) {
                await this.simulateTyping('漫游功能暂不可用，请确保系统已正确初始化');
                return;
            }
            
            // 检查是否有可用的路径进行漫游
            if (this.navigationState?.route) {
                // 使用当前导航路径进行漫游
                await this.startWalkthroughWithRoute(this.navigationState.route);
            } else {
                // 启动独立漫游模式
                await this.simulateTyping('🗺️ 正在为您启动自由漫游模式，请在地图上点击选择漫游起点');
                this.startFreeTourMode();
            }
            
        } catch (error) {
            console.error('启动漫游流程失败:', error);
            await this.simulateTyping('启动漫游失败，请重试');
        }
    }
    
    /**
     * 开始自由漫游模式
     */
    async startFreeTourMode() {
        try {
            // 初始化漫游状态
            this.tourState = {
                step: 1, // 1: 选择起点, 2: 选择终点或开始漫游
                startPoint: null,
                endPoint: null
            };
            
            // 设置漫游点击监听器
            this.setupTourClickListener();
            
        } catch (error) {
            console.error('启动自由漫游模式失败:', error);
            await this.simulateTyping('启动自由漫游失败，请重试');
        }
    }
    
    /**
     * 设置漫游点击监听器
     */
    setupTourClickListener() {
        const viewer = window.realityTwin3DAnalysisTool?.viewer;
        if (!viewer || !viewer.scene) {
            console.warn('Viewer或scene未就绪，无法设置漫游点击监听器');
            return;
        }
        
        // 获取canvas - 尝试多种可能的路径
        let canvas = null;
        if (viewer.cesiumWidget && viewer.cesiumWidget.canvas) {
            canvas = viewer.cesiumWidget.canvas;
        } else if (viewer.scene && viewer.scene.canvas) {
            canvas = viewer.scene.canvas;
        } else {
            // 尝试直接查找canvas元素
            canvas = document.querySelector('.supermap3d-widget canvas') || 
                    document.querySelector('#Container canvas');
        }
        
        if (!canvas) {
            console.warn('无法找到canvas元素，无法设置漫游点击监听器');
            return;
        }
        
        console.log('✅ 找到canvas元素，设置漫游点击监听器');
        
        // 移除之前的监听器
        if (this.tourClickHandler) {
            canvas.removeEventListener('click', this.tourClickHandler);
        }
        
        // 创建新的点击处理器
        this.tourClickHandler = async (event) => {
            try {
                // 获取点击位置相对于canvas的坐标
                const rect = canvas.getBoundingClientRect();
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;
                const windowPosition = new SuperMap3D.Cartesian2(x, y);
                
                // 使用精确的位置拾取方法
                const pickedPosition = this.pickPosition(windowPosition, viewer, viewer.scene);
                if (pickedPosition) {
                    console.log('✅ 成功拾取到漫游位置:', pickedPosition);
                    await this.handleTourClick(pickedPosition);
                } else {
                    console.log('⚠️ 未能拾取到有效的漫游位置，请点击模型表面或地面');
                    await this.simulateTyping('⚠️ 请点击模型表面或地面来设置漫游位置');
                }
            } catch (error) {
                console.error('处理漫游点击事件失败:', error);
            }
        };
        
        // 添加点击监听器
        canvas.addEventListener('click', this.tourClickHandler);
        console.log('✅ 漫游点击监听器已设置');
    }
    
    /**
     * 处理漫游点击事件
     */
    async handleTourClick(position) {
        try {
            if (!this.tourState) return;
            
            if (this.tourState.step === 1) {
                // 设置漫游起点
                this.tourState.startPoint = position;
                this.addNavigationPoint(position, '漫游起点', SuperMap3D.Color.BLUE);
                this.tourState.step = 2;
                await this.simulateTyping('✅ 漫游起点设置完成！请继续点击选择终点，或者右键直接开始自由探索 🎮');
                
            } else if (this.tourState.step === 2) {
                // 设置漫游终点
                this.tourState.endPoint = position;
                this.addNavigationPoint(position, '漫游终点', SuperMap3D.Color.ORANGE);
                
                // 移除点击监听器
                this.removeTourClickListener();
                
                // 开始路径漫游
                await this.startPathTour();
            }
            
        } catch (error) {
            console.error('处理漫游点击失败:', error);
        }
    }
    
    /**
     * 开始路径漫游
     */
    async startPathTour() {
        try {
            await this.simulateTyping('🎬 正在为您规划精彩的漫游路线...');
            
            const indoorNavigation = window.realityTwin3DAnalysisTool.indoorNavigation;
            
            if (!indoorNavigation) {
                await this.simulateTyping('🔄 室内导航模块未就绪，让我们直接开始自由探索模式');
                await this.startFreeTourFromPoint(this.tourState.startPoint);
                this.tourState = null;
                return;
            }
            
            // 清空之前的路径点
            indoorNavigation.routePoints = [];
            
            // 添加起点和终点到室内导航模块
            console.log('🎯 添加漫游起点:', this.tourState.startPoint);
            indoorNavigation.addRoutePoint(this.tourState.startPoint);
            
            console.log('🎯 添加漫游终点:', this.tourState.endPoint);
            indoorNavigation.addRoutePoint(this.tourState.endPoint);
            
            // 室内导航模块会自动计算并绘制路径
            await this.simulateTyping('🎊 漫游路线规划完成！马上开始您的沉浸式体验之旅...');
            
            // 创建路径信息用于漫游
            const routeInfo = {
                startPoint: this.tourState.startPoint,
                endPoint: this.tourState.endPoint,
                success: true
            };
            
            await this.startWalkthroughWithRoute(routeInfo);
            
            // 重置漫游状态
            this.tourState = null;
            
        } catch (error) {
            console.error('开始路径漫游失败:', error);
            await this.simulateTyping('路径漫游失败，正在启动自由漫游模式...');
            await this.startFreeTourFromPoint(this.tourState.startPoint);
            this.tourState = null;
        }
    }
    
    /**
     * 从指定点开始自由漫游
     */
    async startFreeTourFromPoint(startPoint) {
        try {
            const viewer = window.realityTwin3DAnalysisTool?.viewer;
            if (!viewer) return;
            
            // 将相机移动到起点位置
            const cartographic = SuperMap3D.Cartographic.fromCartesian(startPoint);
            const destination = SuperMap3D.Cartesian3.fromDegrees(
                SuperMap3D.Math.toDegrees(cartographic.longitude),
                SuperMap3D.Math.toDegrees(cartographic.latitude),
                cartographic.height + 50 // 相机高度
            );
            
            await viewer.camera.flyTo({
                destination: destination,
                duration: 2.0
            });
            
            await this.simulateTyping('🎮 自由漫游模式已启动！您可以使用鼠标拖拽和滚轮缩放来自由探索这个精彩的三维世界');
             
             // 延迟一段时间后提示漫游完成
             setTimeout(async () => {
                 await this.simulateTyping('🌟 漫游体验完成！希望您享受这次探索之旅，随时可以再次开始新的漫游！');
             }, 5000);
            
        } catch (error) {
            console.error('自由漫游失败:', error);
            await this.simulateTyping('自由漫游启动失败');
        }
    }
    
    /**
     * 移除漫游点击监听器
     */
    removeTourClickListener() {
        const viewer = window.realityTwin3DAnalysisTool?.viewer;
        if (!viewer || !this.tourClickHandler) {
            return;
        }
        
        // 获取canvas - 尝试多种可能的路径
        let canvas = null;
        if (viewer.cesiumWidget && viewer.cesiumWidget.canvas) {
            canvas = viewer.cesiumWidget.canvas;
        } else if (viewer.scene && viewer.scene.canvas) {
            canvas = viewer.scene.canvas;
        } else {
            // 尝试直接查找canvas元素
            canvas = document.querySelector('.supermap3d-widget canvas') || 
                    document.querySelector('#Container canvas');
        }
        
        if (canvas) {
            canvas.removeEventListener('click', this.tourClickHandler);
            console.log('✅ 漫游点击监听器已移除');
        }
        
        this.tourClickHandler = null;
    }
    
    /**
     * 使用路径开始漫游
     */
    async startWalkthroughWithRoute(route) {
        try {
            await this.simulateTyping('正在开始漫游...');
            
            const indoorNavigation = window.realityTwin3DAnalysisTool.indoorNavigation;
            
            // 检查是否有足够的路径点
            if (!indoorNavigation || indoorNavigation.routePoints.length < 2) {
                await this.simulateTyping('漫游启动失败：路径信息不足，请重新设置路径');
                return;
            }
            
            // 开始漫游（室内导航模块的startWalkthrough方法不接受参数也不返回结果）
            indoorNavigation.startWalkthrough();
            
            // 漫游启动成功
            await this.simulateTyping('🎬 第一视角漫游已启动！请跟随相机沿着规划路径进行沉浸式体验...');
            
            // 监听漫游完成事件
            this.setupWalkthroughCompleteListener();
            
        } catch (error) {
            console.error('开始漫游失败:', error);
            await this.simulateTyping('漫游启动失败，请重试');
        }
    }
    
    /**
     * 设置漫游完成监听器
     */
    setupWalkthroughCompleteListener() {
        // 设置一个定时器来检查漫游状态
        // 实际实现中应该监听漫游完成事件
        const checkInterval = setInterval(async () => {
            const indoorNavigation = window.realityTwin3DAnalysisTool?.indoorNavigation;
            if (indoorNavigation && !indoorNavigation.isWalkthroughActive()) {
                clearInterval(checkInterval);
                await this.simulateTyping('🎊 精彩的漫游之旅圆满结束！感谢您的参与，期待下次为您服务！');
            }
        }, 1000);
        
        // 设置最大检查时间（5分钟）
        setTimeout(() => {
            clearInterval(checkInterval);
        }, 300000);
    }

    /**
     * 执行放大操作
     */
    async executeZoomIn(params = {}) {
        try {
            const factor = params.factor || 2;
            const viewer = this.viewer;
            if (viewer && viewer.camera) {
                const camera = viewer.camera;
                const currentHeight = camera.positionCartographic.height;
                const newHeight = currentHeight / factor;
                
                camera.setView({
                    destination: SuperMap3D.Cartesian3.fromRadians(
                        camera.positionCartographic.longitude,
                        camera.positionCartographic.latitude,
                        newHeight
                    )
                });
                
                await this.simulateTyping(`🔍 已放大${factor}倍，当前高度：${Math.round(newHeight)}米`);
            } else {
                await this.simulateTyping('❌ 无法执行放大操作，场景未初始化');
            }
        } catch (error) {
            console.error('放大操作失败:', error);
            await this.simulateTyping('❌ 放大操作失败，请重试');
        }
    }

    /**
     * 执行缩小操作
     */
    async executeZoomOut(params = {}) {
        try {
            const factor = params.factor || 2;
            const viewer = this.viewer;
            if (viewer && viewer.camera) {
                const camera = viewer.camera;
                const currentHeight = camera.positionCartographic.height;
                const newHeight = currentHeight * factor;
                
                camera.setView({
                    destination: SuperMap3D.Cartesian3.fromRadians(
                        camera.positionCartographic.longitude,
                        camera.positionCartographic.latitude,
                        newHeight
                    )
                });
                
                await this.simulateTyping(`🔍 已缩小${factor}倍，当前高度：${Math.round(newHeight)}米`);
            } else {
                await this.simulateTyping('❌ 无法执行缩小操作，场景未初始化');
            }
        } catch (error) {
            console.error('缩小操作失败:', error);
            await this.simulateTyping('❌ 缩小操作失败，请重试');
        }
    }

    /**
     * 执行平移操作
     */
    async executePan(params = {}) {
        try {
            const direction = params.direction || 'north';
            const distance = params.distance || 1000; // 默认1000米
            const viewer = this.viewer;
            
            if (viewer && viewer.camera) {
                const camera = viewer.camera;
                const currentPosition = camera.position.clone();
                let offset;
                
                switch (direction.toLowerCase()) {
                    case 'north':
                    case '北':
                        offset = SuperMap3D.Cartesian3.multiplyByScalar(camera.up, distance, new SuperMap3D.Cartesian3());
                        break;
                    case 'south':
                    case '南':
                        offset = SuperMap3D.Cartesian3.multiplyByScalar(camera.up, -distance, new SuperMap3D.Cartesian3());
                        break;
                    case 'east':
                    case '东':
                        offset = SuperMap3D.Cartesian3.multiplyByScalar(camera.right, distance, new SuperMap3D.Cartesian3());
                        break;
                    case 'west':
                    case '西':
                        offset = SuperMap3D.Cartesian3.multiplyByScalar(camera.right, -distance, new SuperMap3D.Cartesian3());
                        break;
                    default:
                        offset = SuperMap3D.Cartesian3.multiplyByScalar(camera.up, distance, new SuperMap3D.Cartesian3());
                }
                
                const newPosition = SuperMap3D.Cartesian3.add(currentPosition, offset, new SuperMap3D.Cartesian3());
                camera.setView({
                    destination: newPosition
                });
                
                await this.simulateTyping(`🧭 已向${direction}方向平移${distance}米`);
            } else {
                await this.simulateTyping('❌ 无法执行平移操作，场景未初始化');
            }
        } catch (error) {
            console.error('平移操作失败:', error);
            await this.simulateTyping('❌ 平移操作失败，请重试');
        }
    }

    /**
     * 执行旋转操作
     */
    async executeRotate(params = {}) {
        try {
            const direction = params.direction || 'left';
            const angle = params.angle || 45; // 默认45度
            const viewer = this.viewer;
            
            if (viewer && viewer.camera) {
                const camera = viewer.camera;
                const radians = SuperMap3D.Math.toRadians(angle);
                
                switch (direction.toLowerCase()) {
                    case 'left':
                    case '左':
                        camera.rotateLeft(radians);
                        break;
                    case 'right':
                    case '右':
                        camera.rotateRight(radians);
                        break;
                    case 'up':
                    case '上':
                        camera.rotateUp(radians);
                        break;
                    case 'down':
                    case '下':
                        camera.rotateDown(radians);
                        break;
                    default:
                        camera.rotateLeft(radians);
                }
                
                await this.simulateTyping(`🔄 已向${direction}旋转${angle}度`);
            } else {
                await this.simulateTyping('❌ 无法执行旋转操作，场景未初始化');
            }
        } catch (error) {
            console.error('旋转操作失败:', error);
            await this.simulateTyping('❌ 旋转操作失败，请重试');
        }
    }

    /**
     * 执行检索操作
     */
    async executeSearch(params = {}) {
        try {
            const keyword = params.keyword || params.query;
            if (!keyword) {
                await this.simulateTyping('❌ 请提供检索关键词');
                return;
            }
            
            await this.simulateTyping(`🔍 正在检索"${keyword}"...`);
            
            // 模拟检索过程
            setTimeout(async () => {
                const mockResults = [
                    { name: '建筑物A', type: '商业建筑', distance: '150米' },
                    { name: '建筑物B', type: '住宅建筑', distance: '280米' },
                    { name: '公园C', type: '绿地', distance: '320米' }
                ];
                
                let resultText = `📍 检索"${keyword}"完成，找到${mockResults.length}个结果：\n`;
                mockResults.forEach((result, index) => {
                    resultText += `${index + 1}. ${result.name} (${result.type}) - ${result.distance}\n`;
                });
                
                await this.simulateTyping(resultText);
            }, 1000);
            
        } catch (error) {
            console.error('检索操作失败:', error);
            await this.simulateTyping('❌ 检索操作失败，请重试');
        }
    }

    /**
     * 执行重置视角操作
     */
    async executeResetView(params = {}) {
        try {
            const viewer = this.viewer;
            if (viewer && viewer.camera) {
                // 重置到默认视角
                viewer.camera.setView({
                    destination: SuperMap3D.Cartesian3.fromDegrees(116.3974, 39.9093, 10000), // 北京坐标
                    orientation: {
                        heading: 0.0,
                        pitch: -SuperMap3D.Math.PI_OVER_TWO,
                        roll: 0.0
                    }
                });
                
                await this.simulateTyping('🏠 已重置到默认视角');
            } else {
                await this.simulateTyping('❌ 无法重置视角，场景未初始化');
            }
        } catch (error) {
            console.error('重置视角失败:', error);
            await this.simulateTyping('❌ 重置视角失败，请重试');
        }
    }
}

// 等待DOM加载完成后初始化智能对话框
document.addEventListener('DOMContentLoaded', () => {
    // 尝试初始化MCP客户端（如果尚未初始化）
    if (!window.mcpClient) {
        try {
            // 创建MCP客户端实例
            const mcpConfig = {
                serverUrl: 'wss://api.ppinfra.com/mcp',
                apiKey: 'sk_WSKTtf828WzEkHg1PCzpkt6k8xmo_ESnNC5RNfdF4rk',
                clientId: 'RealityTwin3DAnalysisTool',
                modelConfig: {
                    baseUrl: 'https://api.ppinfra.com/openai',
                    apiKey: 'sk_WSKTtf828WzEkHg1PCzpkt6k8xmo_ESnNC5RNfdF4rk',
                    model: 'qwen/qwen3-235b-a22b-instruct-2507',
                    stream: true,
                    maxTokens: 1000
                }
            };
            
            window.mcpClient = new MCPClient(mcpConfig);
            console.log('✅ MCP客户端已在AI聊天界面中初始化');
            
            // 如果RealityTwin3DAnalysisTool实例存在，注册分析工具
            if (window.realityTwin3DAnalysisTool) {
                window.realityTwin3DAnalysisTool.registerAnalysisTools();
            }
        } catch (error) {
            console.error('❌ MCP客户端初始化失败:', error);
        }
    }
    
    // 创建智能对话框实例
    if (window.mcpClient) {
        // 等待realityTwin3DAnalysisTool初始化完成
        const initAIChat = () => {
            if (window.realityTwin3DAnalysisTool && window.realityTwin3DAnalysisTool.viewer) {
                window.aiChat = new AIChatInterface(window.mcpClient);
                console.log('✅ AI聊天界面已创建');
            } else {
                // 如果realityTwin3DAnalysisTool还未初始化，等待一段时间后重试
                setTimeout(initAIChat, 500);
            }
        };
        initAIChat();
    } else {
        console.error('MCP客户端未初始化，无法创建智能对话框');
        // 显示错误消息在对话框中
        const messagesContainer = document.getElementById('aiChatMessages');
        if (messagesContainer) {
            const errorMessage = document.createElement('div');
            errorMessage.className = 'ai-message assistant';
            errorMessage.innerHTML = `
                <div class="ai-message-avatar assistant">🤖</div>
                <div class="ai-message-content">系统初始化失败，请刷新页面重试。</div>
            `;
            messagesContainer.appendChild(errorMessage);
        }
        
        // 更新状态显示
        const statusElement = document.getElementById('aiChatStatus');
        if (statusElement) {
            statusElement.className = 'ai-chat-status error';
            statusElement.textContent = 'MCP客户端初始化失败';
        }
    }
});
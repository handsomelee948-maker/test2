/**
 * MCP客户端 - 智能分析大模型集成
 * 提供与MCP服务器的通信功能，支持SSE和WebSocket协议
 */

class MCPClient {
  constructor() {
    // 动态获取服务器地址，支持局域网访问
    const hostname = window.location.hostname
    this.serverUrl = `http://${hostname}:3001`
    this.wsUrl = `ws://${hostname}:3002`
    this.sseConnection = null
    this.wsConnection = null
    this.clientId = null
    this.isConnected = false

    // 语音识别相关状态
    this.isRecording = false
    this.preventAutoRestart = false
    this.speechRecognition = null
    this.speechText = ''
    this.cursorPosition = 0
    this.tempTextStart = 0
    this.tempTextLength = 0

    // 事件监听器
    this.eventListeners = {
      connected: [],
      disconnected: [],
      message: [],
      tool_result: [],
      chat_response: [],
      error: [],
    }

    this.init()
  }

  /**
   * 初始化MCP客户端
   */
  init() {
    this.generateClientId()
    this.setupEventListeners()
  }

  /**
   * 生成客户端ID
   */
  generateClientId() {
    this.clientId =
      'mcp_client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 页面卸载时断开连接
    window.addEventListener('beforeunload', () => {
      this.disconnect()
    })
  }

  /**
   * 连接到MCP服务器
   */
  async connect() {
    try {
      // 先尝试WebSocket连接
      await this.connectWebSocket()

      // 然后建立SSE连接
      await this.connectSSE()

      this.isConnected = true
      this.emit('connected', { clientId: this.clientId })

      console.log('✅ MCP客户端连接成功')
    } catch (error) {
      console.error('❌ MCP客户端连接失败:', error)
      this.emit('error', { error: error.message })

      // 尝试重新连接
      setTimeout(() => {
        this.reconnect()
      }, 5000)
    }
  }

  /**
   * 连接WebSocket
   */
  connectWebSocket() {
    return new Promise((resolve, reject) => {
      this.wsConnection = new WebSocket(this.wsUrl)

      this.wsConnection.onopen = () => {
        console.log('✅ WebSocket连接已建立')
        resolve()
      }

      this.wsConnection.onmessage = (event) => {
        this.handleWebSocketMessage(event)
      }

      this.wsConnection.onclose = (event) => {
        console.log('🔌 WebSocket连接已关闭:', event.code, event.reason)
        this.handleDisconnection()
      }

      this.wsConnection.onerror = (error) => {
        console.error('❌ WebSocket连接错误:', error)
        reject(error)
      }

      // 设置超时
      setTimeout(() => {
        if (this.wsConnection.readyState !== WebSocket.OPEN) {
          reject(new Error('WebSocket连接超时'))
        }
      }, 10000)
    })
  }

  /**
   * 连接SSE
   */
  connectSSE() {
    return new Promise((resolve, reject) => {
      this.sseConnection = new EventSource(`${this.serverUrl}/mcp/sse`)

      this.sseConnection.onopen = () => {
        console.log('✅ SSE连接已建立')
        resolve()
      }

      this.sseConnection.onmessage = (event) => {
        this.handleSSEMessage(event)
      }

      this.sseConnection.onerror = (error) => {
        console.error('❌ SSE连接错误:', error)
        reject(error)
      }

      // 监听连接事件
      this.sseConnection.addEventListener('connected', (event) => {
        const data = JSON.parse(event.data)
        this.clientId = data.clientId
        console.log('✅ SSE客户端ID:', this.clientId)
      })
    })
  }

  /**
   * 处理WebSocket消息
   */
  handleWebSocketMessage(event) {
    try {
      const data = JSON.parse(event.data)
      this.emit('message', data)

      // 根据消息类型分发到特定事件
      if (data.type) {
        this.emit(data.type, data)
      }
    } catch (error) {
      console.error('❌ WebSocket消息解析错误:', error)
      this.emit('error', { error: '消息解析失败' })
    }
  }

  /**
   * 处理SSE消息
   */
  handleSSEMessage(event) {
    try {
      const data = JSON.parse(event.data)
      this.emit('message', data)

      // 根据消息类型分发到特定事件
      if (data.type) {
        this.emit(data.type, data)
      }
    } catch (error) {
      console.error('❌ SSE消息解析错误:', error)
      this.emit('error', { error: '消息解析失败' })
    }
  }

  /**
   * 处理断开连接
   */
  handleDisconnection() {
    this.isConnected = false
    this.emit('disconnected', { clientId: this.clientId })

    // 尝试重新连接
    this.reconnect()
  }

  /**
   * 重新连接
   */
  async reconnect() {
    if (this.isConnected) return

    console.log('🔄 尝试重新连接...')

    try {
      await this.connect()
    } catch (error) {
      console.error('❌ 重新连接失败:', error)

      // 指数退避重连
      setTimeout(() => {
        this.reconnect()
      }, 10000)
    }
  }

  /**
   * 发送工具调用请求
   */
  callTool(toolName, parameters) {
    if (!this.isConnected || !this.wsConnection) {
      throw new Error('MCP客户端未连接')
    }

    const message = {
      type: 'tools/call',
      tool: toolName,
      parameters: parameters,
      clientId: this.clientId,
      timestamp: Date.now(),
    }

    this.wsConnection.send(JSON.stringify(message))

    console.log(`🛠️ 调用工具: ${toolName}`, parameters)
  }

  /**
   * 发送聊天消息
   */
  sendChatMessage(message) {
    if (!this.isConnected || !this.wsConnection) {
      console.warn('⚠️ MCP客户端未连接，消息未能发送')
      return false
    }

    const chatMessage = {
      type: 'chat',
      message: message,
      clientId: this.clientId,
      timestamp: Date.now(),
    }

    this.wsConnection.send(JSON.stringify(chatMessage))

    console.log(`💬 发送聊天消息: ${message}`)
    return true
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.sseConnection) {
      this.sseConnection.close()
      this.sseConnection = null
    }

    if (this.wsConnection) {
      this.wsConnection.close()
      this.wsConnection = null
    }

    this.isConnected = false
    this.emit('disconnected', { clientId: this.clientId })

    console.log('🔌 MCP客户端已断开连接')
  }

  /**
   * 添加事件监听器
   */
  on(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].push(callback)
    }
  }

  /**
   * 移除事件监听器
   */
  off(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(
        (cb) => cb !== callback,
      )
    }
  }

  /**
   * 触发事件
   */
  emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach((callback) => {
        try {
          callback(data)
        } catch (error) {
          console.error(`事件监听器错误 (${event}):`, error)
        }
      })
    }
  }

  /**
   * 获取连接状态
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      clientId: this.clientId,
      sseReadyState: this.sseConnection ? this.sseConnection.readyState : null,
      wsReadyState: this.wsConnection ? this.wsConnection.readyState : null,
    }
  }
}

// 智能分析助手类 - 集成到现有系统
class IntelligentAnalysisAssistant {
  constructor(viewer, scene) {
    this.viewer = viewer
    this.scene = scene
    this.mcpClient = new MCPClient()
    this.isAssistantActive = false

    // 分析结果缓存
    this.analysisCache = new Map()

    // Web Speech API语音识别相关属性
    this.speechRecognition = null
    this.isRecording = false
    this.speechText = ''
    this.cursorPosition = 0
    this.tempTextStart = 0
    this.tempTextLength = 0

    this.init()
  }

  /**
   * 初始化智能助手
   */
  init() {
    this.setupMCPClient()
    this.createAssistantUI()
    this.bindEvents()
    this.initSpeechRecognition()

    console.log('[IntelligentAnalysisAssistant] 智能分析助手初始化完成')
  }

  /**
   * 设置MCP客户端
   */
  setupMCPClient() {
    // 监听连接事件
    this.mcpClient.on('connected', (data) => {
      console.log('✅ 智能助手已连接到MCP服务器')
      this.updateAssistantStatus('connected')
    })

    this.mcpClient.on('disconnected', (data) => {
      console.log('🔌 智能助手与MCP服务器断开连接')
      this.updateAssistantStatus('disconnected')
    })

    this.mcpClient.on('tool_result', (data) => {
      this.handleToolResult(data)
    })

    this.mcpClient.on('chat_response', (data) => {
      this.handleChatResponse(data)
    })

    this.mcpClient.on('error', (data) => {
      this.showError(data.error)
    })

    // 启动连接
    this.mcpClient.connect()
  }

  /**
   * 创建助手UI界面
   */
  createAssistantUI() {
    // 获取页面中已存在的助手面板
    this.assistantPanel = document.getElementById('intelligentAssistantPanel')

    if (!this.assistantPanel) {
      console.error(
        '❌ 未找到智能助手面板元素，请检查 index.html 中是否包含 id="intelligentAssistantPanel" 的元素',
      )
      return
    }

    console.log('✅ 智能助手面板已加载')
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 切换助手状态
    document.getElementById('toggleAssistant').addEventListener('click', () => {
      this.toggleAssistant()
    })

    // 发送消息
    document.getElementById('sendMessage').addEventListener('click', () => {
      this.sendChatMessage()
    })

    // 回车发送消息
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendChatMessage()
      }
    })

    // 语音按钮事件
    document.getElementById('voiceButton').addEventListener('click', () => {
      this.toggleVoiceRecording()
    })

    // 输入框光标位置跟踪
    document.getElementById('chatInput').addEventListener('click', (e) => {
      this.cursorPosition = e.target.selectionStart
    })

    document.getElementById('chatInput').addEventListener('keyup', (e) => {
      this.cursorPosition = e.target.selectionStart
    })
  }

  /**
   * 切换助手状态
   */
  toggleAssistant() {
    this.isAssistantActive = !this.isAssistantActive
    const content = document.querySelector('.assistant-content')
    const toggleBtn = document.getElementById('toggleAssistant')

    if (this.isAssistantActive) {
      content.style.display = 'block'
      toggleBtn.textContent = '关闭助手'
      toggleBtn.classList.remove('btn-primary')
      toggleBtn.classList.add('btn-danger')
    } else {
      content.style.display = 'none'
      toggleBtn.textContent = '开启助手'
      toggleBtn.classList.remove('btn-danger')
      toggleBtn.classList.add('btn-primary')
    }
  }

  /**
   * 发送聊天消息
   */
  sendChatMessage() {
    const input = document.getElementById('chatInput')
    const message = input.value.trim()

    if (!message) return

    // 显示用户消息
    this.addChatMessage('user', message)

    // 发送到MCP服务器
    const sent = this.mcpClient.sendChatMessage(message)
    if (!sent) {
      this.addChatMessage(
        'system',
        '⚠️ MCP服务器未连接，请确保MCP服务器正在运行',
      )
    }

    // 清空输入框
    input.value = ''
  }

  /**
   * 处理工具结果 - 执行真实的页面操作
   */
  handleToolResult(data) {
    // 避免重复记录：只记录一次工具结果
    if (!data.clientId || data.clientId === this.mcpClient.clientId) {
      console.log('🛠️ 收到工具结果:', data)
    }

    // 根据工具类型处理结果并执行真实的页面操作
    switch (data.tool) {
      // 基础操作工具
      case 'load_model':
        this.executeLoadModel(data.result)
        break
      case 'fly_to_model':
        this.executeFlyToModel(data.result)
        break
      case 'translate_model':
        this.executeTranslateModel(data.result)
        break
      case 'rotate_model':
        this.executeRotateModel(data.result)
        break
      case 'scale_model':
        this.executeScaleModel(data.result)
        break

      // 导航与漫游工具
      case 'indoor_navigation':
        this.executeIndoorNavigation(data.result)
        break
      case 'roaming':
        this.executeRoaming(data.result)
        break

      // 空间分析工具
      case 'profile_analysis':
        this.executeProfileAnalysis(data.result)
        break
      case 'viewshed_analysis':
        this.executeViewshedAnalysis(data.result)
        break
      case 'sightline_analysis':
        this.executeSightlineAnalysis(data.result)
        break
      case 'shadow_analysis':
        this.executeShadowAnalysis(data.result)
        break
      case 'skyline_analysis':
        this.executeSkylineAnalysis(data.result)
        break
      case 'skyline_2d_view':
        this.executeSkyline2DView(data.result)
        break

      // 测量分析工具
      case 'distance_measure':
        this.executeDistanceMeasure(data.result)
        break
      case 'area_measure':
        this.executeAreaMeasure(data.result)
        break
      case 'height_measure':
        this.executeHeightMeasure(data.result)
        break
      case 'clear_measure':
        this.executeClearMeasure(data.result)
        break

      // 系统控制工具
      case 'clear_analysis':
        this.executeClearAnalysis(data.result)
        break
      case 'lighting_settings':
        this.executeLightingSettings(data.result)
        break
      case 'bloom_effect':
        this.executeBloomEffect(data.result)
        break

      // 可视域分析增强工具
      case 'viewshed_clip_plane':
        this.executeViewshedClipPlane(data.result)
        break
      case 'viewshed_property_edit':
        this.executeViewshedPropertyEdit(data.result)
        break

      // 日照效果工具
      case 'sunlight_effect':
        this.executeSunlightEffect(data.result)
        break

      // 模型信息管理工具
      case 'get_model_info':
        this.executeGetModelInfo(data.result)
        break
      case 'search_models':
        this.executeSearchModels(data.result)
        break
      case 'update_model_info':
        this.executeUpdateModelInfo(data.result)
        break
      case 'get_model_statistics':
        this.executeGetModelStatistics(data.result)
        break
      case 'get_models_by_category':
        this.executeGetModelsByCategory(data.result)
        break
      case 'register_model':
        this.executeRegisterModel(data.result)
        break

      // 数据库管理工具
      case 'db_get_all_models':
        this.executeDbGetAllModels(data.result)
        break
      case 'db_get_model':
        this.executeDbGetModel(data.result)
        break
      case 'db_search_models':
        this.executeDbSearchModels(data.result)
        break
      case 'db_add_model':
        this.executeDbAddModel(data.result)
        break
      case 'db_update_model':
        this.executeDbUpdateModel(data.result)
        break
      case 'db_delete_model':
        this.executeDbDeleteModel(data.result)
        break
      case 'db_get_by_category':
        this.executeDbGetByCategory(data.result)
        break
      case 'db_get_statistics':
        this.executeDbGetStatistics(data.result)
        break
      case 'highlight_model':
        this.executeHighlightModel(data.result)
        break
      case 'clear_highlight':
        this.executeClearHighlight(data.result)
        break

      // SQLite 数据库工具
      case 'sql_connect':
        this.executeSqlConnect(data.result)
        break
      case 'sql_connect_memory':
        this.executeSqlConnectMemory(data.result)
        break
      case 'sql_disconnect':
        this.executeSqlDisconnect(data.result)
        break
      case 'sql_execute':
        this.executeSqlExecute(data.result)
        break
      case 'sql_get_tables':
        this.executeSqlGetTables(data.result)
        break
      case 'sql_get_table_info':
        this.executeSqlGetTableInfo(data.result)
        break
      case 'sql_status':
        this.executeSqlStatus(data.result)
        break

      // 旧版工具名称（向后兼容）
      case 'spatial_analysis':
        this.handleSpatialAnalysisResult(data.result)
        break
      case 'model_query':
        this.handleModelQueryResult(data.result)
        break
      case 'navigation_assist':
        this.handleNavigationResult(data.result)
        break
      case 'data_visualization':
        this.handleVisualizationResult(data.result)
        break

      default:
        console.warn(`⚠️ 未知的工具类型: ${data.tool}`)
        this.addChatMessage('system', `收到未知工具调用: ${data.tool}`)
    }

    // 如果工具结果中没有消息，则显示默认完成消息
    if (!data.result.message) {
      this.addChatMessage('assistant', '操作完成')
    }
  }

  /**
   * 处理聊天响应
   */
  handleChatResponse(data) {
    try {
      // 检查是否来自当前客户端
      if (data.clientId && data.clientId !== this.mcpClient.clientId) {
        console.log('📨 忽略其他客户端的消息')
        return
      }

      console.log('💬 处理聊天响应:', data)

      // 添加聊天消息到界面
      this.addChatMessage('assistant', data.response)

      // 检查是否需要交互操作
      if (data.requiresInteraction) {
        this.handleInteractionRequest(data)
      }
    } catch (error) {
      console.error('❌ 处理聊天响应失败:', error)
    }
  }

  /**
   * 处理交互请求
   */
  handleInteractionRequest(data) {
    try {
      console.log('🔄 处理交互请求:', data)

      // 根据交互类型处理不同的交互请求
      switch (data.interactionType) {
        case 'sightline_selection':
          this.startSightlineInteraction(data)
          break
        case 'profile_selection':
          this.startProfileInteraction(data)
          break
        case 'shadow_selection':
          this.startShadowInteraction(data)
          break
        case 'skyline_selection':
          this.startSkylineInteraction(data)
          break
        default:
          console.warn('⚠️ 未知的交互类型:', data.interactionType)
          this.addChatMessage(
            'system',
            `未知的交互类型: ${data.interactionType}`,
          )
      }
    } catch (error) {
      console.error('❌ 处理交互请求失败:', error)
      this.addChatMessage('system', `交互请求处理失败: ${error.message}`)
    }
  }

  /**
   * 启动通视分析交互
   */
  startSightlineInteraction(data) {
    console.log('👁️ 启动通视分析交互（功能开发中）')
    this.addChatMessage('system', '通视分析功能正在开发中，敬请期待！')
  }

  /**
   * 启动剖面分析交互
   */
  startProfileInteraction(data) {
    console.log('📏 启动剖面分析交互（功能开发中）')
    this.addChatMessage('system', '剖面分析功能正在开发中，敬请期待！')
  }

  /**
   * 启动阴影分析交互
   */
  startShadowInteraction(data) {
    console.log('🌑 启动阴影分析交互（功能开发中）')
    this.addChatMessage('system', '阴影分析功能正在开发中，敬请期待！')
  }

  /**
   * 启动天际线分析交互
   */
  startSkylineInteraction(data) {
    console.log('🏙️ 启动天际线分析交互（功能开发中）')
    this.addChatMessage('system', '天际线分析功能正在开发中，敬请期待！')
  }

  /**
   * 添加聊天消息
   */
  addChatMessage(sender, content) {
    const messagesContainer = document.getElementById('chatMessages')
    const messageDiv = document.createElement('div')
    messageDiv.className = `message ${sender}`
    messageDiv.textContent = content

    messagesContainer.appendChild(messageDiv)
    messagesContainer.scrollTop = messagesContainer.scrollHeight
  }

  /**
   * 更新助手状态
   */
  updateAssistantStatus(status) {
    const indicator = document.getElementById('assistantStatus')

    switch (status) {
      case 'connected':
        indicator.textContent = '🟢'
        indicator.title = '已连接'
        break
      case 'disconnected':
        indicator.textContent = '🔴'
        indicator.title = '未连接'
        break
      case 'connecting':
        indicator.textContent = '🟡'
        indicator.title = '连接中'
        break
    }
  }

  /**
   * 获取当前相机位置
   */
  getCurrentCameraPosition() {
    if (!this.viewer || !this.viewer.camera) {
      return { longitude: 0, latitude: 0, height: 0 }
    }

    const cameraPosition = this.viewer.camera.position
    const cartographic = SuperMap3D.Cartographic.fromCartesian(cameraPosition)

    return {
      longitude: SuperMap3D.Math.toDegrees(cartographic.longitude),
      latitude: SuperMap3D.Math.toDegrees(cartographic.latitude),
      height: cartographic.height,
    }
  }

  /**
   * 显示错误信息
   */
  showError(message) {
    this.addChatMessage('system', `错误: ${message}`)

    // 可以添加更复杂的错误处理逻辑
    console.error('❌ 智能助手错误:', message)
  }

  /**
   * 处理空间分析结果
   */
  handleSpatialAnalysisResult(result) {
    // 这里可以集成现有的空间分析功能
    console.log('📍 处理空间分析结果:', result)

    // 根据分析类型启动相应的交互式分析工具
    switch (result.analysis_type) {
      case 'viewshed':
        this.startViewshedAnalysis(result)
        break
      case 'sightline':
        this.startSightlineAnalysis(result)
        break
      case 'profile':
        this.startProfileAnalysis(result)
        break
      case 'shadow':
        this.startShadowAnalysis(result)
        break
      case 'skyline':
        this.startSkylineAnalysis(result)
        break
      default:
        console.log(`📊 其他类型的空间分析: ${result.analysis_type}`)
        this.addChatMessage(
          'system',
          `空间分析类型: ${result.analysis_type} - 功能开发中`,
        )
    }
  }

  /**
   * 添加可视域分析控制界面
   */

  /**
   * 启动可视域分析
   */
  startViewshedAnalysis(result) {
    try {
      if (
        window.realityTwin3DAnalysisTool &&
        window.realityTwin3DAnalysisTool.interactiveAnalysisManager
      ) {
        // 启动可视域分析交互模式
        window.realityTwin3DAnalysisTool.interactiveAnalysisManager.startInteraction(
          'viewshed',
        )

        this.addChatMessage(
          'assistant',
          '可视域分析已启动，请点击设置观察点\\n提示：左键点击设置观察点，可在属性面板中调整参数',
        )

        console.log('✅ 可视域分析交互模式已启动')
      } else {
        console.warn('⚠️ 未找到交互式分析管理器，使用默认分析')
        this.addChatMessage('assistant', '可视域分析功能暂不可用')
      }
    } catch (error) {
      console.error('❌ 启动可视域分析失败:', error)
      this.addChatMessage('system', `可视域分析启动失败: ${error.message}`)
    }
  }

  /**
   * 启动通视分析
   */
  startSightlineAnalysis(result) {
    try {
      if (
        window.realityTwin3DAnalysisTool &&
        window.realityTwin3DAnalysisTool.interactiveAnalysisManager
      ) {
        // 启动通视分析交互模式
        window.realityTwin3DAnalysisTool.interactiveAnalysisManager.startInteraction(
          'sightline',
        )

        this.addChatMessage(
          'assistant',
          '通视分析已启动，请依次点击设置起点和终点\n提示：左键点击设置点，右键点击完成操作',
        )

        console.log('✅ 通视分析交互模式已启动')
      } else {
        console.warn('⚠️ 未找到交互式分析管理器，使用默认分析')
        this.addChatMessage('assistant', '通视分析功能暂不可用')
      }
    } catch (error) {
      console.error('❌ 启动通视分析失败:', error)
      this.addChatMessage('system', `通视分析启动失败: ${error.message}`)
    }
  }

  /**
   * 启动剖面分析
   */
  startProfileAnalysis(result) {
    try {
      if (
        window.realityTwin3DAnalysisTool &&
        window.realityTwin3DAnalysisTool.interactiveAnalysisManager
      ) {
        // 启动剖面分析交互模式
        window.realityTwin3DAnalysisTool.interactiveAnalysisManager.startInteraction(
          'profile',
        )

        this.addChatMessage(
          'assistant',
          '剖面分析已启动，请点击设置剖面线路径\n提示：左键点击添加剖面点，右键点击完成绘制',
        )

        console.log('✅ 剖面分析交互模式已启动')
      } else {
        console.warn('⚠️ 未找到交互式分析管理器，使用默认分析')
        this.addChatMessage('assistant', '剖面分析功能暂不可用')
      }
    } catch (error) {
      console.error('❌ 启动剖面分析失败:', error)
      this.addChatMessage('system', `剖面分析启动失败: ${error.message}`)
    }
  }

  /**
   * 启动阴影分析
   */
  startShadowAnalysis(result) {
    try {
      console.log('🌞 启动阴影分析:', result)

      // 检查主应用是否已初始化
      if (!window.realityTwinTool) {
        this.addChatMessage('system', '应用未正确初始化，请刷新页面重试')
        return
      }

      // 调用主应用的阴影分析功能
      if (window.realityTwinTool.startShadowAnalysis) {
        window.realityTwinTool.startShadowAnalysis()
        this.addChatMessage(
          'assistant',
          '阴影分析已自动启动，请在地图上绘制分析区域\n提示：左键点击添加分析区域点，右键点击完成绘制',
        )
      } else {
        this.addChatMessage('system', '请点击阴影分析面板中的"开始分析"按钮')
      }
    } catch (error) {
      console.error('❌ 启动阴影分析失败:', error)
      this.addChatMessage('system', `阴影分析启动失败: ${error.message}`)
    }
  }

  /**
   * 启动天际线分析
   */
  startSkylineAnalysis(result) {
    try {
      console.log('🏔️ 启动天际线分析:', result)

      // 检查主应用是否已初始化
      if (!window.realityTwinTool) {
        this.addChatMessage('system', '应用未正确初始化，请刷新页面重试')
        return
      }

      // 解析参数
      let radius = 10000 // 默认半径

      if (result && result.data) {
        // 优先使用MCP服务器返回的radius参数
        if (result.data.radius) {
          radius = result.data.radius
        } else {
          // 从自然语言中提取半径参数（向后兼容）
          const radiusMatch =
            result.data.radius ||
            result.data.analysis_radius ||
            result.data.半径
          if (radiusMatch) {
            // 提取数字部分（支持"1000米"、"1000m"等格式）
            const radiusNumber = parseInt(
              radiusMatch.toString().replace(/[^\d]/g, ''),
            )
            if (!isNaN(radiusNumber) && radiusNumber > 0) {
              radius = radiusNumber
            }
          }
        }
      }

      // 调用主应用的天际线分析功能
      if (window.realityTwinTool.extractSkyline) {
        window.realityTwinTool.extractSkyline(radius)

        // 构建参数提示信息
        const paramMessages = []
        if (result.data.radius)
          paramMessages.push(`半径: ${result.data.radius}米`)
        if (result.data.observer_height)
          paramMessages.push(`观察点高度: ${result.data.observer_height}米`)
        if (result.data.direction !== undefined)
          paramMessages.push(`方向: ${result.data.direction}度`)

        const paramInfo =
          paramMessages.length > 0 ? `（${paramMessages.join('，')}）` : ''
        this.addChatMessage(
          'assistant',
          `天际线分析已启动${paramInfo}\n提示：天际线提取完成后，可以查看二维天际线`,
        )
      } else {
        this.addChatMessage(
          'system',
          '天际线分析功能暂不可用，请手动使用天际线分析面板',
        )
      }
    } catch (error) {
      console.error('❌ 启动天际线分析失败:', error)
      this.addChatMessage('system', `天际线分析启动失败: ${error.message}`)
    }
  }

  /**
   * 执行加载模型
   */
  executeLoadModel(result) {
    try {
      console.log('📦 执行加载模型:', result)

      if (window.realityTwinTool) {
        const {
          model_path,
          model_name,
          requires_user_confirmation,
          is_direct_file_path,
          load_mode,
          file_info,
        } = result.data

        // 检查是否需要用户确认的直接文件路径
        if (requires_user_confirmation && is_direct_file_path) {
          this.addChatMessage('assistant', result.message)

          // 显示文件确认对话框
          this.showFileConfirmationDialog(file_info, model_path, model_name)
          return
        }

        // 模型库加载
        this.addChatMessage(
          'assistant',
          `正在加载模型: ${model_name || model_path}`,
        )

        if (window.realityTwinTool.loadModel) {
          window.realityTwinTool.loadModel(model_path, model_name)
        } else {
          this.addChatMessage('system', '请点击"加载模型"按钮手动加载')
        }
      }
    } catch (error) {
      console.error('❌ 执行加载模型失败:', error)
      this.addChatMessage('system', `加载模型失败: ${error.message}`)
    }
  }

  /**
   * 处理文件选择
   */
  handleFileSelection(filePath, suggestedName) {
    // 创建隐藏的文件输入元素
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.glb,.gltf,.obj,.3ds,.dae,.fbx,.ply,.stl,.x3d,.wrl,.s3m'
    fileInput.style.display = 'none'

    fileInput.onchange = (event) => {
      const file = event.target.files[0]
      if (file) {
        this.addChatMessage('user', `确认加载文件: ${file.name}`)
        this.showSuccessMessage(`已选择文件: ${file.name}`)

        try {
          // 使用主应用的批量加载功能来加载选中的文件
          if (
            window.realityTwinTool &&
            window.realityTwinTool.loadSelectedFile
          ) {
            window.realityTwinTool.loadSelectedFile(file, suggestedName)
            this.showSuccessMessage(`文件 ${file.name} 加载成功！`)
          } else if (
            window.realityTwinTool &&
            window.realityTwinTool.batchLoadModels
          ) {
            // 回退到批量加载功能
            this.addChatMessage('assistant', '正在通过批量加载功能处理文件...')
            this.showInfoMessage('正在批量加载模型文件...')
            window.realityTwinTool.batchLoadModels()
          } else {
            this.addChatMessage(
              'system',
              '文件加载功能暂不可用，请使用手动加载功能',
            )
            this.showErrorDialog(
              '功能不可用',
              '文件加载功能暂不可用，请使用手动加载功能',
            )
          }
        } catch (error) {
          console.error('❌ 文件加载失败:', error)
          this.addChatMessage('system', `文件加载失败: ${error.message}`)
          this.showErrorDialog(
            '文件加载失败',
            `无法加载文件 ${file.name}: ${error.message}`,
          )
        }
      } else {
        this.showInfoMessage('未选择文件，加载已取消')
      }
    }

    fileInput.oncancel = () => {
      this.showInfoMessage('文件选择已取消')
    }

    document.body.appendChild(fileInput)
    fileInput.click()
    document.body.removeChild(fileInput)
  }

  /**
   * 显示错误对话框
   */
  showErrorDialog(title, message) {
    try {
      if (window.showErrorDialog) {
        window.showErrorDialog(title, message)
      } else {
        // 备用错误显示
        console.error(`❌ ${title}: ${message}`)
        alert(`${title}: ${message}`)
      }
    } catch (error) {
      console.error('❌ 显示错误对话框失败:', error)
    }
  }

  /**
   * 显示成功消息
   */
  showSuccessMessage(message) {
    try {
      if (window.showSuccessMessage) {
        window.showSuccessMessage(message)
      } else {
        // 备用成功消息显示
        console.log(`✅ ${message}`)
      }
    } catch (error) {
      console.error('❌ 显示成功消息失败:', error)
    }
  }

  /**
   * 显示信息消息
   */
  showInfoMessage(message) {
    try {
      if (window.showInfoMessage) {
        window.showInfoMessage(message)
      } else {
        // 备用信息消息显示
        console.log(`ℹ️ ${message}`)
      }
    } catch (error) {
      console.error('❌ 显示信息消息失败:', error)
    }
  }

  /**
   * 执行飞行到模型
   */
  executeFlyToModel(result) {
    try {
      console.log('🚁 执行飞行到模型:', result)

      if (window.realityTwinTool) {
        this.addChatMessage('assistant', '正在飞行到模型位置...')
        this.showInfoMessage('正在飞行到模型位置...')

        if (window.realityTwinTool.flyToAllModels) {
          window.realityTwinTool.flyToAllModels()
          this.showSuccessMessage('飞行到模型位置完成！')
        } else {
          this.addChatMessage('system', '请点击"飞行到模型"按钮')
          this.showErrorDialog(
            '功能不可用',
            '飞行到模型功能暂不可用，请使用手动操作',
          )
        }
      } else {
        this.addChatMessage('system', '应用未正确初始化，请刷新页面重试')
        this.showErrorDialog(
          '应用未初始化',
          '三维分析工具未正确初始化，请刷新页面重试',
        )
      }
    } catch (error) {
      console.error('❌ 执行飞行失败:', error)
      this.addChatMessage('system', `飞行到模型失败: ${error.message}`)
      this.showErrorDialog(
        '飞行失败',
        `执行飞行到模型时发生错误: ${error.message}`,
      )
    }
  }

  /**
   * 执行室内导航
   */
  executeIndoorNavigation(result) {
    try {
      console.log('🧭 执行室内导航:', result)

      this.addChatMessage('assistant', '正在启动室内导航功能...')
      this.showInfoMessage('正在启动室内导航功能...')

      // 检查主应用是否已初始化
      if (!window.realityTwinTool) {
        this.addChatMessage('system', '应用未正确初始化，请刷新页面重试')
        this.showErrorDialog(
          '应用未初始化',
          '三维分析工具未正确初始化，请刷新页面重试',
        )
        return
      }

      // 打开导航面板
      const navPanel = document.getElementById('navigationPanel')
      if (navPanel) {
        navPanel.style.display = 'block'
        this.showSuccessMessage('导航面板已打开')
      } else {
        this.showInfoMessage('导航面板未找到，将使用默认导航模式')
      }

      // 自动进入导航模式，支持地图交互选点
      if (window.realityTwinTool.setNavigationMode) {
        window.realityTwinTool.setNavigationMode()
        this.addChatMessage(
          'assistant',
          '室内导航已启动，请在地图上点击设置起点和终点\n提示：点击模型表面或地面设置路径点，设置完起点和终点后会自动计算路径',
        )
        this.showSuccessMessage('室内导航已启动，请在地图上设置起点和终点')
      } else {
        this.addChatMessage('system', '请使用顶部菜单栏的"室内导航"功能')
        this.showErrorDialog(
          '功能不可用',
          '室内导航功能暂不可用，请使用手动操作',
        )
      }
    } catch (error) {
      console.error('❌ 执行室内导航失败:', error)
      this.addChatMessage('system', `室内导航启动失败: ${error.message}`)
      this.showErrorDialog(
        '导航失败',
        `启动室内导航时发生错误: ${error.message}`,
      )
    }
  }

  /**
   * 执行漫游
   */
  executeRoaming(result) {
    try {
      console.log('🚶 执行漫游:', result)

      this.addChatMessage('assistant', '正在启动漫游功能...')
      this.showInfoMessage('正在启动漫游功能...')

      // 检查主应用是否已初始化
      if (!window.realityTwinTool) {
        this.addChatMessage('system', '应用未正确初始化，请刷新页面重试')
        this.showErrorDialog(
          '应用未初始化',
          '三维分析工具未正确初始化，请刷新页面重试',
        )
        return
      }

      // 检查是否有已计算的导航路径
      if (
        window.realityTwinTool.indoorNavigation &&
        window.realityTwinTool.indoorNavigation.routePoints &&
        window.realityTwinTool.indoorNavigation.routePoints.length >= 2
      ) {
        // 如果有导航路径，启动沿路径漫游
        if (window.realityTwinTool.startWalkthrough) {
          window.realityTwinTool.startWalkthrough()
          this.addChatMessage(
            'assistant',
            '开始沿导航路径漫游\n提示：系统将自动沿预设路径移动，您可以使用鼠标调整视角',
          )
          this.showSuccessMessage('沿导航路径漫游已启动')
        } else {
          this.addChatMessage(
            'system',
            '导航路径漫游功能不可用，请检查路径设置',
          )
          this.showErrorDialog(
            '功能不可用',
            '导航路径漫游功能暂不可用，请检查路径设置',
          )
        }
      } else {
        // 如果没有导航路径，启动自由漫游
        this.addChatMessage(
          'assistant',
          '自由漫游功能已启动，您可以使用鼠标自由浏览场景\n提示：左键拖动旋转，右键拖动平移，滚轮缩放',
        )
        this.showSuccessMessage('自由漫游功能已启动')
      }
    } catch (error) {
      console.error('❌ 执行漫游失败:', error)
      this.addChatMessage('system', `漫游功能启动失败: ${error.message}`)
      this.showErrorDialog(
        '漫游失败',
        `启动漫游功能时发生错误: ${error.message}`,
      )
    }
  }

  /**
   * 执行剖面分析
   */
  executeProfileAnalysis(result) {
    try {
      console.log('📊 执行剖面分析:', result)

      this.addChatMessage('assistant', '正在启动剖面分析工具...')

      const clipPanel = document.getElementById('clipPanel')
      if (clipPanel) {
        clipPanel.style.display = 'block'
      }

      if (
        window.realityTwinTool &&
        window.realityTwinTool.interactiveAnalysisManager
      ) {
        window.realityTwinTool.interactiveAnalysisManager.startInteraction(
          'profile',
        )
        this.addChatMessage(
          'assistant',
          '剖面分析已启动，请在场景中绘制剖面线\n提示：左键点击添加剖面点，右键点击完成绘制',
        )
      } else {
        this.addChatMessage('system', '请点击"剖面分析"面板中的"开始分析"按钮')
      }
    } catch (error) {
      console.error('❌ 执行剖面分析失败:', error)
    }
  }

  /**
   * 执行可视域分析
   */
  executeViewshedAnalysis(result) {
    try {
      console.log('👁️ 执行可视域分析:', result)

      this.addChatMessage('assistant', '正在启动可视域分析工具...')

      const viewshedPanel = document.getElementById('viewshedPanel')
      if (viewshedPanel) {
        viewshedPanel.style.display = 'block'
      }

      if (
        window.realityTwinTool &&
        window.realityTwinTool.interactiveAnalysisManager
      ) {
        // 启动可视域分析交互模式，与通视分析保持一致
        window.realityTwinTool.interactiveAnalysisManager.startInteraction(
          'viewshed',
        )
        this.addChatMessage(
          'assistant',
          '可视域分析已启动，请点击设置观察点\n提示：左键点击设置观察点，可在属性面板中调整参数',
        )
      } else {
        this.addChatMessage(
          'system',
          '请点击"可视域分析"面板中的"绘制可视域"按钮',
        )
      }
    } catch (error) {
      console.error('❌ 执行可视域分析失败:', error)
    }
  }

  /**
   * 执行通视分析
   */
  executeSightlineAnalysis(result) {
    try {
      console.log('🔍 执行通视分析:', result)

      this.addChatMessage('assistant', '正在启动通视分析工具...')

      const sightlinePanel = document.getElementById('sightlinePanel')
      if (sightlinePanel) {
        sightlinePanel.style.display = 'block'
      }

      if (
        window.realityTwinTool &&
        window.realityTwinTool.interactiveAnalysisManager
      ) {
        // 启动多点通视分析模式，支持添加多个目标点
        window.realityTwinTool.interactiveAnalysisManager.startInteraction(
          'sightline-multi',
        )
        this.addChatMessage(
          'assistant',
          '多点通视分析已启动，请依次点击设置观察点和多个目标点\n提示：左键点击设置点位，右键点击完成操作',
        )
      } else {
        this.addChatMessage('system', '请使用"通视分析"面板中的功能按钮')
      }
    } catch (error) {
      console.error('❌ 执行通视分析失败:', error)
    }
  }

  /**
   * 执行阴影分析
   */
  executeShadowAnalysis(result) {
    try {
      console.log('🌞 执行阴影分析:', result)

      this.addChatMessage('assistant', '正在启动阴影分析工具...')

      const shadowPanel = document.getElementById('shadowPanel')
      if (shadowPanel) {
        shadowPanel.style.display = 'block'
      }

      // 处理时间参数并自动填充到面板
      this.processShadowTimeParameters(result)

      // 延迟一小段时间后自动启动阴影分析，确保参数已正确填充
      setTimeout(() => {
        this.startShadowAnalysis(result)
      }, 500)
    } catch (error) {
      console.error('❌ 执行阴影分析失败:', error)
    }
  }

  /**
   * 处理日照效果时间参数
   */
  processSunlightTimeParameters(result) {
    try {
      console.log('⏰ 处理日照效果时间参数:', result)

      // 获取当前日期作为默认值
      const currentDate = new Date()
      const defaultDate = currentDate.toISOString().split('T')[0]

      // 解析时间参数
      let date = defaultDate
      let startTime = '08' // 默认上午8点
      let endTime = '18' // 默认下午6点

      // 首先检查MCP服务器返回的数据中是否已经解析了时间参数
      if (result.data) {
        const data = result.data

        // 优先使用服务器解析后的时间参数
        if (data.start_time) {
          // 处理服务器返回的HH:MM格式时间
          if (data.start_time.includes(':')) {
            // 从HH:MM格式提取小时部分
            startTime = data.start_time.split(':')[0]
          } else {
            // 处理其他格式
            const timeMatch = data.start_time.match(
              /\d{4}-\d{2}-\d{2} (\d{2}):\d{2}/,
            )
            if (timeMatch) {
              startTime = timeMatch[1]
              date = data.start_time.split(' ')[0]
            }
          }
        }

        if (data.end_time) {
          // 处理服务器返回的HH:MM格式时间
          if (data.end_time.includes(':')) {
            // 从HH:MM格式提取小时部分
            endTime = data.end_time.split(':')[0]
          } else {
            // 处理其他格式
            const timeMatch = data.end_time.match(
              /\d{4}-\d{2}-\d{2} (\d{2}):\d{2}/,
            )
            if (timeMatch) {
              endTime = timeMatch[1]
              if (!date) date = data.end_time.split(' ')[0]
            }
          }
        }

        if (data.date) {
          date = data.date
        }

        // 如果服务器已经提供了有效的时间参数，直接使用
        if (startTime !== '08' || endTime !== '18') {
          console.log('✅ 使用服务器解析的时间参数:', {
            date,
            startTime,
            endTime,
          })
          // 同时填充到面板参数，确保主应用使用正确的时间
          this.fillSunlightPanelParameters(date, startTime, endTime)
          return { date, startTime, endTime }
        }
      }

      // 如果服务器没有提供时间参数，则使用客户端解析逻辑

      // 处理日期参数
      if (result.date) {
        date = result.date
      } else if (result.analysis_time) {
        // 从analysis_time中提取日期部分
        const timeMatch = result.analysis_time.match(/^(\d{4}-\d{2}-\d{2})/)
        if (timeMatch) {
          date = timeMatch[1]
        }
      }

      // 处理自然语言时间范围（如"上午10点到下午4点"）
      if (result.time_range) {
        const timeRange = this.parseNaturalTimeRange(result.time_range)
        if (timeRange) {
          startTime = timeRange.startTime
          endTime = timeRange.endTime
          console.log('✅ 解析自然语言时间范围成功:', { startTime, endTime })
        }
      }

      // 处理开始时间参数
      if (result.start_time) {
        const parsedTime = this.parseNaturalTime(result.start_time)
        if (parsedTime) {
          startTime = parsedTime.hour.toString().padStart(2, '0')
        }
      }

      // 处理结束时间参数
      if (result.end_time) {
        const parsedTime = this.parseNaturalTime(result.end_time)
        if (parsedTime) {
          endTime = parsedTime.hour.toString().padStart(2, '0')
        }
      }

      // 处理动画速度
      let animationSpeed = 5 // 默认速度
      if (result.animation_speed) {
        animationSpeed = Math.min(Math.max(result.animation_speed, 1), 10)
      }

      console.log('✅ 日照效果参数已设置:', {
        date,
        startTime,
        endTime,
        animationSpeed,
      })

      // 填充到面板参数，确保主应用使用正确的时间
      this.fillSunlightPanelParameters(date, startTime, endTime)

      return { date, startTime, endTime, animationSpeed }
    } catch (error) {
      console.error('❌ 处理日照效果时间参数失败:', error)
      // 返回默认参数
      return {
        date: new Date().toISOString().split('T')[0],
        startTime: '08',
        endTime: '18',
        animationSpeed: 5,
      }
    }
  }

  /**
   * 处理阴影分析时间参数
   */
  processShadowTimeParameters(result) {
    try {
      console.log('⏰ 处理阴影分析时间参数:', result)

      // 获取当前日期作为默认值
      const currentDate = new Date()
      const defaultDate = currentDate.toISOString().split('T')[0]

      // 解析时间参数
      let date = defaultDate
      let startTime = '10' // 默认上午10点
      let endTime = '14' // 默认下午2点

      // 首先检查MCP服务器返回的数据中是否已经解析了时间参数
      if (result.data) {
        const data = result.data

        // 优先使用服务器解析后的时间参数
        if (data.start_time) {
          const timeMatch = data.start_time.match(
            /\d{4}-\d{2}-\d{2} (\d{2}):\d{2}/,
          )
          if (timeMatch) {
            startTime = timeMatch[1]
            date = data.start_time.split(' ')[0]
          }
        }

        if (data.end_time) {
          const timeMatch = data.end_time.match(
            /\d{4}-\d{2}-\d{2} (\d{2}):\d{2}/,
          )
          if (timeMatch) {
            endTime = timeMatch[1]
            if (!date) date = data.end_time.split(' ')[0]
          }
        }

        if (data.date) {
          date = data.date
        }

        // 如果服务器已经提供了有效的时间参数，直接使用
        if (startTime !== '10' || endTime !== '14') {
          console.log('✅ 使用服务器解析的时间参数:', {
            date,
            startTime,
            endTime,
          })
          this.fillShadowPanelParameters(date, startTime, endTime)
          return
        }
      }

      // 如果服务器没有提供时间参数，则使用客户端解析逻辑

      // 处理日期参数
      if (result.date) {
        date = result.date
      } else if (result.analysis_time) {
        // 从analysis_time中提取日期部分
        const timeMatch = result.analysis_time.match(/^(\d{4}-\d{2}-\d{2})/)
        if (timeMatch) {
          date = timeMatch[1]
        }
      }

      // 处理自然语言时间范围（如"上午8点到下午6点"）
      if (result.time_range) {
        const timeRange = this.parseNaturalTimeRange(result.time_range)
        if (timeRange) {
          startTime = timeRange.startTime
          endTime = timeRange.endTime
        }
      }

      // 处理开始时间和结束时间
      if (result.start_time && result.end_time) {
        // 直接使用提供的开始和结束时间
        startTime = this.extractHourFromTime(result.start_time)
        endTime = this.extractHourFromTime(result.end_time)
      } else if (result.analysis_time && result.duration) {
        // 从analysis_time和duration计算时间范围
        const baseTime = this.parseTimeString(result.analysis_time)
        startTime = baseTime.getHours().toString()
        endTime = (baseTime.getHours() + parseInt(result.duration)).toString()
      } else if (result.analysis_time) {
        // 只有analysis_time，使用默认时长2小时
        const baseTime = this.parseTimeString(result.analysis_time)
        startTime = baseTime.getHours().toString()
        endTime = (baseTime.getHours() + 2).toString()
      }

      // 确保时间在合理范围内
      startTime = Math.max(0, Math.min(23, parseInt(startTime))).toString()
      endTime = Math.max(0, Math.min(23, parseInt(endTime))).toString()

      // 确保结束时间大于开始时间
      if (parseInt(endTime) <= parseInt(startTime)) {
        endTime = (parseInt(startTime) + 2).toString()
        if (parseInt(endTime) > 23) {
          endTime = '23'
        }
      }

      // 自动填充到阴影分析面板
      this.fillShadowPanelParameters(date, startTime, endTime)

      console.log('✅ 阴影分析参数已设置:', { date, startTime, endTime })
    } catch (error) {
      console.error('❌ 处理阴影分析时间参数失败:', error)
    }
  }

  /**
   * 解析自然语言时间范围
   */
  parseNaturalTimeRange(timeRangeString) {
    try {
      if (typeof timeRangeString !== 'string') return null

      console.log('🔍 解析自然语言时间范围:', timeRangeString)

      // 处理"上午8点到下午6点"格式
      const rangeMatch = timeRangeString.match(
        /(上午|下午)?(\d+)点到(上午|下午)?(\d+)点/,
      )
      if (rangeMatch) {
        const startPeriod = rangeMatch[1] || ''
        const startHour = parseInt(rangeMatch[2])
        const endPeriod = rangeMatch[3] || ''
        const endHour = parseInt(rangeMatch[4])

        let startTime = startHour
        let endTime = endHour

        // 处理上午/下午
        if (startPeriod === '下午' && startHour < 12) {
          startTime += 12
        }
        if (endPeriod === '下午' && endHour < 12) {
          endTime += 12
        }

        // 如果结束时间小于开始时间，假设是跨天
        if (endTime <= startTime) {
          endTime += 12 // 假设结束时间是下午
        }

        return {
          startTime: startTime.toString(),
          endTime: endTime.toString(),
        }
      }

      // 处理"8点到18点"格式
      const simpleRangeMatch = timeRangeString.match(/(\d+)点到(\d+)点/)
      if (simpleRangeMatch) {
        const startHour = parseInt(simpleRangeMatch[1])
        const endHour = parseInt(simpleRangeMatch[2])

        return {
          startTime: startHour.toString(),
          endTime: endHour.toString(),
        }
      }

      // 处理"8-18"格式
      const dashRangeMatch = timeRangeString.match(/(\d+)[-到](\d+)/)
      if (dashRangeMatch) {
        const startHour = parseInt(dashRangeMatch[1])
        const endHour = parseInt(dashRangeMatch[2])

        return {
          startTime: startHour.toString(),
          endTime: endHour.toString(),
        }
      }

      return null
    } catch (error) {
      console.error('❌ 解析自然语言时间范围失败:', error)
      return null
    }
  }

  /**
   * 从时间字符串中提取小时数
   */
  extractHourFromTime(timeString) {
    try {
      if (typeof timeString === 'string') {
        // 处理自然语言时间格式
        if (timeString.includes('下午')) {
          const hourMatch = timeString.match(/下午(\d+)/)
          if (hourMatch) {
            return (parseInt(hourMatch[1]) + 12).toString()
          }
        } else if (timeString.includes('上午')) {
          const hourMatch = timeString.match(/上午(\d+)/)
          if (hourMatch) {
            return hourMatch[1]
          }
        } else if (timeString.includes('点')) {
          const hourMatch = timeString.match(/(\d+)点/)
          if (hourMatch) {
            let hour = parseInt(hourMatch[1])
            if (timeString.includes('下午') && hour < 12) {
              hour += 12
            }
            return hour.toString()
          }
        }

        // 处理标准时间格式
        const timeMatch = timeString.match(/(\d{1,2}):?\d{0,2}/)
        if (timeMatch) {
          return timeMatch[1]
        }

        // 直接返回数字
        const hour = parseInt(timeString)
        if (!isNaN(hour)) {
          return hour.toString()
        }
      }

      return '10' // 默认值
    } catch (error) {
      console.error('❌ 提取小时数失败:', error)
      return '10'
    }
  }

  /**
   * 解析时间字符串
   */
  parseTimeString(timeString) {
    try {
      if (typeof timeString === 'string') {
        // 处理自然语言时间格式
        if (timeString.includes('下午')) {
          const hourMatch = timeString.match(/下午(\d+)/)
          if (hourMatch) {
            const hour = parseInt(hourMatch[1]) + 12
            return new Date(new Date().setHours(hour, 0, 0, 0))
          }
        } else if (timeString.includes('上午')) {
          const hourMatch = timeString.match(/上午(\d+)/)
          if (hourMatch) {
            const hour = parseInt(hourMatch[1])
            return new Date(new Date().setHours(hour, 0, 0, 0))
          }
        } else if (timeString.includes('点')) {
          const hourMatch = timeString.match(/(\d+)点/)
          if (hourMatch) {
            let hour = parseInt(hourMatch[1])
            if (timeString.includes('下午') && hour < 12) {
              hour += 12
            }
            return new Date(new Date().setHours(hour, 0, 0, 0))
          }
        }

        // 处理标准时间格式
        const timeMatch = timeString.match(/(\d{1,2}):?(\d{0,2})/)
        if (timeMatch) {
          const hour = parseInt(timeMatch[1])
          const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0
          return new Date(new Date().setHours(hour, minute, 0, 0))
        }

        // 处理纯数字（小时）
        const hour = parseInt(timeString)
        if (!isNaN(hour)) {
          return new Date(new Date().setHours(hour, 0, 0, 0))
        }
      }

      // 默认返回当前时间
      return new Date()
    } catch (error) {
      console.error('❌ 解析时间字符串失败:', error)
      return new Date()
    }
  }

  /**
   * 填充阴影分析面板参数
   */
  fillShadowPanelParameters(date, startTime, endTime) {
    try {
      // 填充日期
      const dateInput = document.getElementById('shadowDate')
      if (dateInput) {
        dateInput.value = date
      }

      // 填充开始时间
      const startTimeInput = document.getElementById('shadowStartTime')
      if (startTimeInput) {
        startTimeInput.value = startTime
      }

      // 填充结束时间
      const endTimeInput = document.getElementById('shadowEndTime')
      if (endTimeInput) {
        endTimeInput.value = endTime
      }

      console.log('✅ 阴影分析面板参数已填充:', { date, startTime, endTime })
    } catch (error) {
      console.error('❌ 填充阴影分析面板参数失败:', error)
    }
  }

  /**
   * 填充日照效果面板参数
   */
  fillSunlightPanelParameters(date, startTime, endTime) {
    try {
      // 填充日期
      const dateInput = document.getElementById('shadowDate')
      if (dateInput) {
        dateInput.value = date
      }

      // 填充开始时间
      const startTimeInput = document.getElementById('shadowStartTime')
      if (startTimeInput) {
        startTimeInput.value = startTime
      }

      // 填充结束时间
      const endTimeInput = document.getElementById('shadowEndTime')
      if (endTimeInput) {
        endTimeInput.value = endTime
      }

      console.log('✅ 日照效果面板参数已填充:', { date, startTime, endTime })
    } catch (error) {
      console.error('❌ 填充日照效果面板参数失败:', error)
    }
  }

  /**
   * 执行天际线分析
   */
  executeSkylineAnalysis(result) {
    try {
      console.log('🏙️ 执行天际线分析:', result)

      // 直接调用startSkylineAnalysis来执行实际的天际线分析
      this.startSkylineAnalysis(result)
    } catch (error) {
      console.error('❌ 执行天际线分析失败:', error)
    }
  }

  /**
   * 执行二维天际线查看
   */
  executeSkyline2DView(result) {
    try {
      console.log('📊 执行二维天际线查看:', result)

      // 确保天际线分析面板被显示
      const skylinePanel = document.getElementById('skylinePanel')
      if (skylinePanel) {
        skylinePanel.style.display = 'block'
        console.log('✅ 天际线分析面板已显示')
      }

      // 确保图表容器被显示
      const chartContainer = document.getElementById('skylineChart')
      if (chartContainer) {
        chartContainer.style.display = 'block'
        console.log('✅ 图表容器已显示')
      }

      // 调用主应用的二维天际线查看功能
      if (window.realityTwinTool && window.realityTwinTool.getSkyline2D) {
        window.realityTwinTool.getSkyline2D()
        this.addChatMessage('assistant', '正在显示二维天际线图表...')
      } else if (
        window.realityTwin3DAnalysisTool &&
        window.realityTwin3DAnalysisTool.digitalTwinAnalysis
      ) {
        const analysisTool =
          window.realityTwin3DAnalysisTool.digitalTwinAnalysis
        if (analysisTool.getSkyline2DData) {
          // 获取二维天际线数据并显示
          const skylineData = analysisTool.getSkyline2DData()
          if (skylineData && skylineData.xAxis && skylineData.yAxis) {
            // 调用主应用的二维天际线显示功能
            if (
              window.realityTwinTool &&
              window.realityTwinTool.showSimpleSkylineChart
            ) {
              window.realityTwinTool.showSimpleSkylineChart(skylineData)
              this.addChatMessage('assistant', '二维天际线图表已显示')
            } else {
              this.addChatMessage('system', '二维天际线显示功能暂不可用')
            }
          } else {
            this.addChatMessage(
              'system',
              '没有找到天际线分析数据，请先执行天际线分析',
            )
          }
        } else {
          this.addChatMessage('system', '二维天际线数据获取功能暂不可用')
        }
      } else {
        this.addChatMessage(
          'system',
          '请先执行天际线分析，然后使用界面上的"二维天际线"按钮查看结果',
        )
      }
    } catch (error) {
      console.error('❌ 执行二维天际线查看失败:', error)
      this.addChatMessage('system', `二维天际线查看失败: ${error.message}`)
    }
  }

  /**
   * 执行距离测量
   */
  executeDistanceMeasure(result) {
    try {
      console.log('📏 执行距离测量:', result)

      this.addChatMessage('assistant', '正在启动距离测量工具...')

      // 优先调用主应用的测量方法
      if (
        window.realityTwinTool &&
        window.realityTwinTool.performDistanceMeasure
      ) {
        window.realityTwinTool.performDistanceMeasure()
        this.addChatMessage(
          'assistant',
          '距离测量已启动，请在场景中点击测量起点和终点\n提示：左键点击添加点，右键点击完成测量',
        )
      } else if (
        window.realityTwin3DAnalysisTool &&
        window.realityTwin3DAnalysisTool.performDistanceMeasure
      ) {
        window.realityTwin3DAnalysisTool.performDistanceMeasure()
        this.addChatMessage(
          'assistant',
          '距离测量已启动，请在场景中点击测量起点和终点\n提示：左键点击添加点，右键点击完成测量',
        )
      } else if (
        window.realityTwinTool &&
        window.realityTwinTool.digitalTwinAnalysis &&
        window.realityTwinTool.digitalTwinAnalysis.performDistanceMeasure
      ) {
        window.realityTwinTool.digitalTwinAnalysis.performDistanceMeasure(0)
        this.addChatMessage(
          'assistant',
          '距离测量已启动，请在场景中点击测量起点和终点\n提示：左键点击添加点，右键点击完成测量',
        )
      } else {
        this.addChatMessage(
          'system',
          '测量功能暂不可用，请确保已加载数字孪生分析模块',
        )
      }
    } catch (error) {
      console.error('❌ 执行距离测量失败:', error)
      this.addChatMessage('system', `距离测量失败: ${error.message}`)
    }
  }

  /**
   * 执行面积测量
   */
  executeAreaMeasure(result) {
    try {
      console.log('📐 执行面积测量:', result)

      this.addChatMessage('assistant', '正在启动面积测量工具...')

      // 优先调用主应用的测量方法
      if (window.realityTwinTool && window.realityTwinTool.performAreaMeasure) {
        window.realityTwinTool.performAreaMeasure()
        this.addChatMessage(
          'assistant',
          '面积测量已启动，请在场景中点击测量区域的各个顶点\n提示：左键点击添加顶点，右键点击完成测量',
        )
      } else if (
        window.realityTwin3DAnalysisTool &&
        window.realityTwin3DAnalysisTool.performAreaMeasure
      ) {
        window.realityTwin3DAnalysisTool.performAreaMeasure()
        this.addChatMessage(
          'assistant',
          '面积测量已启动，请在场景中点击测量区域的各个顶点\n提示：左键点击添加顶点，右键点击完成测量',
        )
      } else if (
        window.realityTwinTool &&
        window.realityTwinTool.digitalTwinAnalysis &&
        window.realityTwinTool.digitalTwinAnalysis.performAreaMeasure
      ) {
        window.realityTwinTool.digitalTwinAnalysis.performAreaMeasure(0)
        this.addChatMessage(
          'assistant',
          '面积测量已启动，请在场景中点击测量区域的各个顶点\n提示：左键点击添加顶点，右键点击完成测量',
        )
      } else {
        this.addChatMessage(
          'system',
          '测量功能暂不可用，请确保已加载数字孪生分析模块',
        )
      }
    } catch (error) {
      console.error('❌ 执行面积测量失败:', error)
      this.addChatMessage('system', `面积测量失败: ${error.message}`)
    }
  }

  /**
   * 执行高度测量
   */
  executeHeightMeasure(result) {
    try {
      console.log('📊 执行高度测量:', result)

      this.addChatMessage('assistant', '正在启动高度测量工具...')

      // 优先调用主应用的测量方法
      if (
        window.realityTwinTool &&
        window.realityTwinTool.performHeightMeasure
      ) {
        window.realityTwinTool.performHeightMeasure()
        this.addChatMessage(
          'assistant',
          '高度测量已启动，请在场景中点击测量起点和终点\n提示：左键点击添加点，右键点击完成测量',
        )
      } else if (
        window.realityTwin3DAnalysisTool &&
        window.realityTwin3DAnalysisTool.performHeightMeasure
      ) {
        window.realityTwin3DAnalysisTool.performHeightMeasure()
        this.addChatMessage(
          'assistant',
          '高度测量已启动，请在场景中点击测量起点和终点\n提示：左键点击添加点，右键点击完成测量',
        )
      } else if (
        window.realityTwinTool &&
        window.realityTwinTool.digitalTwinAnalysis &&
        window.realityTwinTool.digitalTwinAnalysis.performHeightMeasure
      ) {
        window.realityTwinTool.digitalTwinAnalysis.performHeightMeasure()
        this.addChatMessage(
          'assistant',
          '高度测量已启动，请在场景中点击测量起点和终点\n提示：左键点击添加点，右键点击完成测量',
        )
      } else {
        this.addChatMessage(
          'system',
          '测量功能暂不可用，请确保已加载数字孪生分析模块',
        )
      }
    } catch (error) {
      console.error('❌ 执行高度测量失败:', error)
      this.addChatMessage('system', `高度测量失败: ${error.message}`)
    }
  }

  /**
   * 执行清除测量
   */
  executeClearMeasure(result) {
    try {
      console.log('🗑️ 执行清除测量:', result)

      this.addChatMessage('assistant', '正在清除测量结果...')

      if (window.realityTwinTool) {
        if (window.realityTwinTool.clearMeasurements) {
          window.realityTwinTool.clearMeasurements(result.data.measure_type)
          this.addChatMessage('assistant', '测量结果已清除')
        } else if (
          window.realityTwinTool.digitalTwinAnalysis &&
          window.realityTwinTool.digitalTwinAnalysis.clearMeasurements
        ) {
          window.realityTwinTool.digitalTwinAnalysis.clearMeasurements(
            result.data.measure_type,
          )
          this.addChatMessage('assistant', '测量结果已清除')
        }
      } else if (
        window.realityTwin3DAnalysisTool &&
        window.realityTwin3DAnalysisTool.digitalTwinAnalysis
      ) {
        if (
          window.realityTwin3DAnalysisTool.digitalTwinAnalysis.clearMeasurements
        ) {
          window.realityTwin3DAnalysisTool.digitalTwinAnalysis.clearMeasurements(
            result.data.measure_type,
          )
          this.addChatMessage('assistant', '测量结果已清除')
        }
      }
    } catch (error) {
      console.error('❌ 执行清除测量失败:', error)
      this.addChatMessage('system', `清除测量失败: ${error.message}`)
    }
  }

  /**
   * 执行清除分析
   */
  executeClearAnalysis(result) {
    try {
      console.log('🗑️ 执行清除分析:', result)

      this.addChatMessage('assistant', '正在清除分析结果...')

      if (window.realityTwinTool) {
        if (window.realityTwinTool.clearAllAnalysis) {
          window.realityTwinTool.clearAllAnalysis()
          this.addChatMessage('assistant', '所有分析结果已清除')
        } else if (window.realityTwinTool.digitalTwinAnalysis) {
          window.realityTwinTool.digitalTwinAnalysis.clearAllAnalysis()
          this.addChatMessage('assistant', '所有分析结果已清除')
        }
      }
    } catch (error) {
      console.error('❌ 执行清除分析失败:', error)
    }
  }

  /**
   * 执行光照设置
   */
  executeLightingSettings(result) {
    try {
      console.log('💡 执行光照设置:', result)

      this.addChatMessage('assistant', '正在调整场景光照...')

      if (window.realityTwinTool && window.realityTwinTool.adjustLighting) {
        window.realityTwinTool.adjustLighting()
        this.addChatMessage('assistant', '光照设置已更新')
      } else {
        this.addChatMessage('system', '请使用顶部菜单栏的"光照设置"按钮')
      }
    } catch (error) {
      console.error('❌ 执行光照设置失败:', error)
    }
  }

  /**
   * 执行泛光效果
   */
  executeBloomEffect(result) {
    try {
      console.log('✨ 执行泛光效果:', result)

      this.addChatMessage('assistant', '正在调整泛光效果...')

      if (window.realityTwinTool && window.realityTwinTool.toggleBloom) {
        window.realityTwinTool.toggleBloom()
        this.addChatMessage('assistant', '泛光效果已切换')
      } else {
        this.addChatMessage('system', '请使用顶部菜单栏的"泛光效果"按钮')
      }
    } catch (error) {
      console.error('❌ 执行泛光效果失败:', error)
    }
  }

  /**
   * 执行日照效果
   */
  executeSunlightEffect(result) {
    try {
      console.log('☀️ 执行日照效果:', result)

      this.addChatMessage('assistant', '正在启动日照效果演示...')

      // 检查主应用是否已初始化
      if (!window.realityTwinTool) {
        this.addChatMessage('system', '应用未正确初始化，请刷新页面重试')
        return
      }

      // 处理时间参数
      const timeParams = this.processSunlightTimeParameters(result)

      // 调用主应用的日照效果功能
      if (window.realityTwinTool.performSunlightEffect) {
        window.realityTwinTool.performSunlightEffect(timeParams)
        this.addChatMessage(
          'assistant',
          `日照效果演示已启动：${timeParams.startTime} 到 ${timeParams.endTime}`,
        )
      } else {
        // 如果主应用没有日照效果功能，使用阴影分析作为替代
        this.executeShadowAnalysis(result)
        this.addChatMessage(
          'assistant',
          '日照效果功能暂不可用，已启动阴影分析作为替代',
        )
      }
    } catch (error) {
      console.error('❌ 执行日照效果失败:', error)
      this.addChatMessage('system', `日照效果启动失败: ${error.message}`)
    }
  }

  /**
   * 执行可视域裁剪面绘制
   */
  executeViewshedClipPlane(result) {
    try {
      console.log('✂️ 执行可视域裁剪面绘制:', result)

      this.addChatMessage('assistant', '正在启动裁剪面绘制工具...')

      this.addChatMessage('system', '可视域分析功能已移除')
    } catch (error) {
      console.error('❌ 执行可视域裁剪面绘制失败:', error)
      this.addChatMessage(
        'system',
        '裁剪面绘制失败，请检查可视域分析是否已启动',
      )
    }
  }

  /**
   * 执行可视域属性编辑
   */
  executeViewshedPropertyEdit(result) {
    try {
      console.log('⚙️ 执行可视域属性编辑:', result)

      this.addChatMessage('assistant', '正在更新可视域分析参数...')

      // 检查是否有可视域分析结果
      if (
        !window.realityTwin3DAnalysisTool ||
        !window.realityTwin3DAnalysisTool.digitalTwinAnalysis
      ) {
        this.addChatMessage(
          'system',
          '数字孪生分析工具未加载，无法更新可视域属性',
        )
        return
      }

      const analysisTool = window.realityTwin3DAnalysisTool.digitalTwinAnalysis

      // 检查是否有可视域分析结果
      const viewshedResult = analysisTool.analysisResults?.get('viewshed')
      if (!viewshedResult) {
        this.addChatMessage(
          'system',
          '没有找到可视域分析结果，请先执行可视域分析',
        )
        return
      }

      // 提取属性参数
      const {
        heading,
        pitch,
        distance,
        horizontal_fov,
        vertical_fov,
        visible_color,
        hidden_color,
      } = result.data || {}

      let updatedProperties = []

      // 更新方向角
      if (heading !== undefined) {
        if (analysisTool.updateViewshedProperty('direction', heading)) {
          updatedProperties.push(`方向角: ${heading}°`)
        }
      }

      // 更新俯仰角
      if (pitch !== undefined) {
        if (analysisTool.updateViewshedProperty('pitch', pitch)) {
          updatedProperties.push(`俯仰角: ${pitch}°`)
        }
      }

      // 更新观察距离
      if (distance !== undefined) {
        if (analysisTool.updateViewshedProperty('distance', distance)) {
          updatedProperties.push(`观察距离: ${distance}米`)
        }
      }

      // 更新水平视场角
      if (horizontal_fov !== undefined) {
        if (
          analysisTool.updateViewshedProperty('horizontalFov', horizontal_fov)
        ) {
          updatedProperties.push(`水平视场角: ${horizontal_fov}°`)
        }
      }

      // 更新垂直视场角
      if (vertical_fov !== undefined) {
        if (analysisTool.updateViewshedProperty('verticalFov', vertical_fov)) {
          updatedProperties.push(`垂直视场角: ${vertical_fov}°`)
        }
      }

      // 更新可见区域颜色
      if (visible_color !== undefined) {
        if (
          analysisTool.updateViewshedProperty('visibleColor', visible_color)
        ) {
          updatedProperties.push(`可见区域颜色: ${visible_color}`)
        }
      }

      // 更新不可见区域颜色
      if (hidden_color !== undefined) {
        if (
          analysisTool.updateViewshedProperty('invisibleColor', hidden_color)
        ) {
          updatedProperties.push(`不可见区域颜色: ${hidden_color}`)
        }
      }

      if (updatedProperties.length > 0) {
        const successMessage = `可视域分析属性更新成功：${updatedProperties.join(', ')}`
        this.addChatMessage('assistant', successMessage)
        console.log('✅ 可视域属性编辑完成:', updatedProperties)
      } else {
        this.addChatMessage('system', '未检测到有效的属性修改参数')
      }
    } catch (error) {
      console.error('❌ 执行可视域属性编辑失败:', error)
      this.addChatMessage('system', '属性编辑失败，请检查参数是否正确')
    }
  }

  /**
   * 执行模型平移
   */
  executeTranslateModel(result) {
    try {
      console.log('🚀 执行模型平移:', result)

      this.addChatMessage('assistant', '正在执行模型平移操作...')

      // 调用前端数字孪生分析工具执行平移操作
      if (
        window.realityTwin3DAnalysisTool &&
        window.realityTwin3DAnalysisTool.digitalTwinAnalysis
      ) {
        const analysisTool =
          window.realityTwin3DAnalysisTool.digitalTwinAnalysis

        if (analysisTool.translateModel) {
          // 修复参数传递问题：服务器返回的是result.data，客户端期望的是result
          const modelId = result.data?.model_id || result.model_id || 'default'
          const translation = result.data?.translation ||
            result.translation || { x: 0, y: 0, z: 0 }

          analysisTool.translateModel(modelId, translation)
          this.addChatMessage('assistant', result.message || '模型平移操作完成')
        } else {
          this.addChatMessage('system', '模型平移功能暂不可用，请检查前端实现')
        }
      } else {
        this.addChatMessage(
          'system',
          '数字孪生分析工具未加载，无法执行平移操作',
        )
      }
    } catch (error) {
      console.error('❌ 执行模型平移失败:', error)
      this.addChatMessage('system', '模型平移操作失败，请检查参数是否正确')
    }
  }

  /**
   * 执行模型旋转
   */
  executeRotateModel(result) {
    try {
      console.log('🔄 执行模型旋转:', result)

      this.addChatMessage('assistant', '正在执行模型旋转操作...')

      // 调用前端数字孪生分析工具执行旋转操作
      if (
        window.realityTwin3DAnalysisTool &&
        window.realityTwin3DAnalysisTool.digitalTwinAnalysis
      ) {
        const analysisTool =
          window.realityTwin3DAnalysisTool.digitalTwinAnalysis

        if (analysisTool.rotateModel) {
          // 修复参数传递问题：服务器返回的是result.data，客户端期望的是result
          const modelId = result.data?.model_id || result.model_id || 'default'
          const rotation = result.data?.rotation ||
            result.rotation || { x: 0, y: 0, z: 0 }

          // 检查旋转参数是否有效
          if (rotation.x === 0 && rotation.y === 0 && rotation.z === 0) {
            // 如果所有旋转角度都是0，尝试从消息中提取角度
            const angleMatch = result.message?.match(/(\d+)/)
            if (angleMatch) {
              rotation.z = parseInt(angleMatch[1]) // 默认绕Z轴旋转
            }
          }

          const success = analysisTool.rotateModel(modelId, rotation)
          if (success) {
            this.addChatMessage(
              'assistant',
              result.message || '模型旋转操作完成',
            )
          } else {
            this.addChatMessage(
              'system',
              '模型旋转操作失败，请检查模型是否存在',
            )
          }
        } else {
          this.addChatMessage('system', '模型旋转功能暂不可用，请检查前端实现')
        }
      } else {
        this.addChatMessage(
          'system',
          '数字孪生分析工具未加载，无法执行旋转操作',
        )
      }
    } catch (error) {
      console.error('❌ 执行模型旋转失败:', error)
      this.addChatMessage('system', '模型旋转操作失败，请检查参数是否正确')
    }
  }

  /**
   * 执行模型缩放
   */
  executeScaleModel(result) {
    try {
      console.log('📏 执行模型缩放:', result)

      this.addChatMessage('assistant', '正在执行模型缩放操作...')

      // 调用前端数字孪生分析工具执行缩放操作
      if (
        window.realityTwin3DAnalysisTool &&
        window.realityTwin3DAnalysisTool.digitalTwinAnalysis
      ) {
        const analysisTool =
          window.realityTwin3DAnalysisTool.digitalTwinAnalysis

        if (analysisTool.scaleModel) {
          // 修复参数传递问题：服务器返回的是result.data，客户端期望的是result
          const modelId = result.data?.model_id || result.model_id || 'default'
          const scaleFactor =
            result.data?.scale_factor || result.scale_factor || 1.0

          // 检查缩放因子是否有效
          if (scaleFactor <= 0) {
            this.addChatMessage('system', '缩放因子必须大于0')
            return
          }

          const success = analysisTool.scaleModel(modelId, scaleFactor)
          if (success) {
            this.addChatMessage(
              'assistant',
              result.message || `模型缩放操作完成，缩放因子: ${scaleFactor}`,
            )
          } else {
            this.addChatMessage(
              'system',
              '模型缩放操作失败，请检查模型是否存在',
            )
          }
        } else {
          this.addChatMessage('system', '模型缩放功能暂不可用，请检查前端实现')
        }
      } else {
        this.addChatMessage(
          'system',
          '数字孪生分析工具未加载，无法执行缩放操作',
        )
      }
    } catch (error) {
      console.error('❌ 执行模型缩放失败:', error)
      this.addChatMessage('system', '模型缩放操作失败，请检查参数是否正确')
    }
  }

  /**
   * 应用可视域属性更新
   */
  applyViewshedPropertyUpdates() {
    try {
      console.log('可视域分析功能已移除')
    } catch (error) {
      console.error('❌ 应用可视域属性更新失败:', error)
    }
  }

  /**
   * 处理模型查询结果
   */
  handleModelQueryResult(result) {
    console.log('🏗️ 处理模型查询结果:', result)
    // 集成现有的模型查询功能
  }

  /**
   * 处理导航结果
   */
  handleNavigationResult(result) {
    console.log('🧭 处理导航结果:', result)
    // 集成现有的导航功能
  }

  /**
   * 处理可视化结果
   */
  handleVisualizationResult(result) {
    console.log('📊 处理可视化结果:', result)
    // 集成现有的可视化功能
  }

  /**
   * 开始裁剪面绘制
   */
  startClipPlaneDrawing() {
    try {
      this.addChatMessage('system', '可视域分析功能已移除')
      console.log('可视域分析功能已移除')
    } catch (error) {
      console.error('❌ 开始裁剪面绘制失败:', error)
    }
  }

  /**
   * 处理裁剪面绘制完成
   */
  handleClipPlaneDrawn(clipPlaneData) {
    try {
      this.addChatMessage('system', '可视域分析功能已移除')
      console.log('可视域分析功能已移除')
    } catch (error) {
      console.error('❌ 处理裁剪面绘制完成失败:', error)
    }
  }

  /**
   * 销毁助手
   */
  destroy() {
    this.mcpClient.disconnect()

    if (this.assistantPanel && this.assistantPanel.parentNode) {
      this.assistantPanel.parentNode.removeChild(this.assistantPanel)
    }

    console.log('🗑️ 智能分析助手已销毁')
  }

  /**
   * 执行获取模型信息
   */
  executeGetModelInfo(result) {
    try {
      console.log('📋 执行获取模型信息:', result)

      if (result.status === 'success' && result.data) {
        const modelInfo = result.data
        const message =
          `模型信息获取成功：\n` +
          `名称: ${modelInfo.name}\n` +
          `ID: ${modelInfo.id}\n` +
          `类型: ${modelInfo.type}\n` +
          `分类: ${modelInfo.category}\n` +
          `版本: ${modelInfo.version}\n` +
          `描述: ${modelInfo.description || '无'}\n` +
          `属性数量: ${modelInfo.attributes ? Object.keys(modelInfo.attributes).length : 0}`

        this.addChatMessage('assistant', message)

        // 如果有详细信息，显示在控制台
        if (modelInfo.attributes) {
          console.log('模型属性详情:', modelInfo.attributes)
        }
        if (modelInfo.metadata) {
          console.log('模型元数据:', modelInfo.metadata)
        }
      } else {
        this.addChatMessage('system', result.message || '获取模型信息失败')
      }
    } catch (error) {
      console.error('❌ 执行获取模型信息失败:', error)
      this.addChatMessage('system', '获取模型信息时发生错误')
    }
  }

  /**
   * 执行搜索模型
   */
  executeSearchModels(result) {
    try {
      console.log('🔍 执行搜索模型:', result)

      if (result.status === 'success' && result.data) {
        const models = result.data.models || []
        const totalCount = result.data.totalCount || models.length

        if (models.length === 0) {
          this.addChatMessage('assistant', '未找到匹配的模型')
        } else {
          let message = `搜索到 ${totalCount} 个模型（显示前 ${models.length} 个）：\n\n`

          models.forEach((model, index) => {
            message += `${index + 1}. ${model.name} (${model.id})\n`
            message += `   类型: ${model.type} | 分类: ${model.category}\n`
            message += `   版本: ${model.version} | 匹配度: ${(model.score * 100).toFixed(1)}%\n`
            if (model.description) {
              message += `   描述: ${model.description}\n`
            }
            message += '\n'
          })

          this.addChatMessage('assistant', message)
        }

        console.log('搜索到的模型详情:', models)
      } else {
        this.addChatMessage('system', result.message || '搜索模型失败')
      }
    } catch (error) {
      console.error('❌ 执行搜索模型失败:', error)
      this.addChatMessage('system', '搜索模型时发生错误')
    }
  }

  /**
   * 执行更新模型信息
   */
  executeUpdateModelInfo(result) {
    try {
      console.log('✏️ 执行更新模型信息:', result)

      if (result.status === 'success') {
        const message = result.message || '模型信息更新成功'
        this.addChatMessage('assistant', message)

        // 如果返回了更新后的模型信息，显示详细信息
        if (result.data) {
          console.log('更新后的模型信息:', result.data)
        }
      } else {
        this.addChatMessage('system', result.message || '更新模型信息失败')
      }
    } catch (error) {
      console.error('❌ 执行更新模型信息失败:', error)
      this.addChatMessage('system', '更新模型信息时发生错误')
    }
  }

  /**
   * 执行获取模型统计信息
   */
  executeGetModelStatistics(result) {
    try {
      console.log('📊 执行获取模型统计信息:', result)

      if (result.status === 'success' && result.data) {
        const stats = result.data
        const message =
          `模型统计信息：\n` +
          `总模型数: ${stats.totalModels}\n` +
          `按类型分布:\n` +
          Object.entries(stats.byType || {})
            .map(([type, count]) => `  ${type}: ${count}个`)
            .join('\n') +
          '\n' +
          `按分类分布:\n` +
          Object.entries(stats.byCategory || {})
            .map(([category, count]) => `  ${category}: ${count}个`)
            .join('\n') +
          '\n' +
          `版本统计:\n` +
          Object.entries(stats.byVersion || {})
            .map(([version, count]) => `  ${version}: ${count}个`)
            .join('\n')

        this.addChatMessage('assistant', message)
        console.log('模型统计详情:', stats)
      } else {
        this.addChatMessage('system', result.message || '获取模型统计信息失败')
      }
    } catch (error) {
      console.error('❌ 执行获取模型统计信息失败:', error)
      this.addChatMessage('system', '获取模型统计信息时发生错误')
    }
  }

  /**
   * 执行按分类获取模型
   */
  executeGetModelsByCategory(result) {
    try {
      console.log('📂 执行按分类获取模型:', result)

      if (result.status === 'success' && result.data) {
        const models = result.data.models || []
        const category = result.data.category || '未知分类'

        if (models.length === 0) {
          this.addChatMessage('assistant', `分类 "${category}" 中没有找到模型`)
        } else {
          let message = `分类 "${category}" 中的模型（共 ${models.length} 个）：\n\n`

          models.forEach((model, index) => {
            message += `${index + 1}. ${model.name} (${model.id})\n`
            message += `   类型: ${model.type} | 版本: ${model.version}\n`
            if (model.description) {
              message += `   描述: ${model.description}\n`
            }
            message += '\n'
          })

          this.addChatMessage('assistant', message)
        }

        console.log('分类模型详情:', { category, models })
      } else {
        this.addChatMessage('system', result.message || '按分类获取模型失败')
      }
    } catch (error) {
      console.error('❌ 执行按分类获取模型失败:', error)
      this.addChatMessage('system', '按分类获取模型时发生错误')
    }
  }

  /**
   * 执行注册模型
   */
  executeRegisterModel(result) {
    try {
      console.log('📝 执行注册模型:', result)

      if (result.status === 'success') {
        const message = result.message || '模型注册成功'
        this.addChatMessage('assistant', message)

        // 如果返回了注册的模型信息，显示详细信息
        if (result.data) {
          const modelInfo = result.data
          console.log('注册的模型信息:', modelInfo)

          const detailMessage =
            `注册详情：\n` +
            `名称: ${modelInfo.name}\n` +
            `ID: ${modelInfo.id}\n` +
            `类型: ${modelInfo.type}\n` +
            `分类: ${modelInfo.category}`

          this.addChatMessage('assistant', detailMessage)
        }
      } else {
        this.addChatMessage('system', result.message || '注册模型失败')
      }
    } catch (error) {
      console.error('❌ 执行注册模型失败:', error)
      this.addChatMessage('system', '注册模型时发生错误')
    }
  }

  // ==================== 数据库管理工具执行函数 ====================

  /**
   * 执行获取所有模型
   */
  executeDbGetAllModels(result) {
    try {
      console.log('📋 获取所有模型:', result)
      if (result.status === 'success') {
        const models = result.data.models || []
        const count = result.data.count || 0

        let message = `📋 数据库共有 ${count} 个模型：\n\n`
        models.forEach((model, index) => {
          message += `${index + 1}. ${model.name} (${model.category})\n`
          message += `   ID: ${model.id}\n`
          if (model.description) {
            message += `   描述: ${model.description}\n`
          }
          message += '\n'
        })

        this.addChatMessage('assistant', message)
      } else {
        this.addChatMessage('system', result.message || '获取模型列表失败')
      }
    } catch (error) {
      console.error('❌ 获取所有模型失败:', error)
      this.addChatMessage('system', '获取模型列表时发生错误')
    }
  }

  /**
   * 执行获取单个模型
   */
  executeDbGetModel(result) {
    try {
      console.log('🔍 获取模型详情:', result)
      if (result.status === 'success' && result.data.model) {
        const model = result.data.model
        let message = `📋 模型详情：\n\n`
        message += `名称: ${model.name}\n`
        message += `ID: ${model.id}\n`
        message += `分类: ${model.category}\n`
        if (model.description) message += `描述: ${model.description}\n`
        if (model.file_path) message += `文件路径: ${model.file_path}\n`
        if (model.tags && model.tags.length)
          message += `标签: ${model.tags.join(', ')}\n`
        if (model.properties) {
          message += `属性: ${JSON.stringify(model.properties, null, 2)}\n`
        }
        message += `创建时间: ${model.createdAt}\n`
        message += `更新时间: ${model.updatedAt}`

        this.addChatMessage('assistant', message)
      } else {
        this.addChatMessage('system', result.message || '未找到该模型')
      }
    } catch (error) {
      console.error('❌ 获取模型详情失败:', error)
      this.addChatMessage('system', '获取模型详情时发生错误')
    }
  }

  /**
   * 执行搜索模型
   */
  executeDbSearchModels(result) {
    try {
      console.log('🔎 搜索模型:', result)
      if (result.status === 'success') {
        const models = result.data.models || []
        const query = result.data.query || ''

        let message = `🔍 搜索 "${query}" 找到 ${models.length} 个结果：\n\n`
        models.forEach((model, index) => {
          message += `${index + 1}. ${model.name} (${model.category})\n`
          message += `   ID: ${model.id}\n`
          if (model.description) message += `   描述: ${model.description}\n`
          message += '\n'
        })

        this.addChatMessage('assistant', message)
      } else {
        this.addChatMessage('system', result.message || '搜索模型失败')
      }
    } catch (error) {
      console.error('❌ 搜索模型失败:', error)
      this.addChatMessage('system', '搜索模型时发生错误')
    }
  }

  /**
   * 执行添加模型
   */
  executeDbAddModel(result) {
    try {
      console.log('➕ 添加模型:', result)
      if (result.status === 'success') {
        const model = result.data.model
        this.addChatMessage(
          'assistant',
          `✅ 模型添加成功！\n\n` +
            `名称: ${model.name}\n` +
            `ID: ${model.id}\n` +
            `分类: ${model.category}`,
        )
      } else {
        this.addChatMessage('system', result.message || '添加模型失败')
      }
    } catch (error) {
      console.error('❌ 添加模型失败:', error)
      this.addChatMessage('system', '添加模型时发生错误')
    }
  }

  /**
   * 执行更新模型
   */
  executeDbUpdateModel(result) {
    try {
      console.log('✏️ 更新模型:', result)
      if (result.status === 'success') {
        const model = result.data.model
        this.addChatMessage(
          'assistant',
          `✅ 模型更新成功！\n\n` +
            `名称: ${model.name}\n` +
            `ID: ${model.id}\n` +
            `分类: ${model.category}`,
        )
      } else {
        this.addChatMessage('system', result.message || '更新模型失败')
      }
    } catch (error) {
      console.error('❌ 更新模型失败:', error)
      this.addChatMessage('system', '更新模型时发生错误')
    }
  }

  /**
   * 执行删除模型
   */
  executeDbDeleteModel(result) {
    try {
      console.log('🗑️ 删除模型:', result)
      if (result.status === 'success') {
        this.addChatMessage(
          'assistant',
          `✅ 模型删除成功！\n\n` + `已删除模型ID: ${result.data.model_id}`,
        )
      } else {
        this.addChatMessage('system', result.message || '删除模型失败')
      }
    } catch (error) {
      console.error('❌ 删除模型失败:', error)
      this.addChatMessage('system', '删除模型时发生错误')
    }
  }

  /**
   * 执行按分类获取模型
   */
  executeDbGetByCategory(result) {
    try {
      console.log('📂 按分类获取模型:', result)
      if (result.status === 'success') {
        const models = result.data.models || []
        const category = result.data.category || ''

        let message = `📂 分类 "${category}" 共有 ${models.length} 个模型：\n\n`
        models.forEach((model, index) => {
          message += `${index + 1}. ${model.name}\n`
          message += `   ID: ${model.id}\n`
          if (model.description) message += `   描述: ${model.description}\n`
          message += '\n'
        })

        this.addChatMessage('assistant', message)
      } else {
        this.addChatMessage('system', result.message || '按分类获取模型失败')
      }
    } catch (error) {
      console.error('❌ 按分类获取模型失败:', error)
      this.addChatMessage('system', '按分类获取模型时发生错误')
    }
  }

  /**
   * 执行获取统计信息
   */
  executeDbGetStatistics(result) {
    try {
      console.log('📊 获取统计信息:', result)
      if (result.status === 'success') {
        const stats = result.data
        let message = `📊 数据库统计：\n\n`

        if (stats.totalModels !== undefined) {
          message += `总模型数: ${stats.totalModels}\n`
        } else if (stats.total !== undefined) {
          message += `总模型数: ${stats.total}\n`
        }

        if (stats.totalUsers !== undefined) {
          message += `总用户数: ${stats.totalUsers}\n`
        }

        if (stats.totalSensors !== undefined) {
          message += `总传感器数: ${stats.totalSensors}\n`
        }

        message += `\n按分类统计：\n`

        const categoryStats = stats.categoryStats || stats.byCategory || []
        if (categoryStats && categoryStats.length > 0) {
          categoryStats.forEach((cat) => {
            const catName = cat.category || cat.name || '未知'
            const catCount = cat.count || 0
            message += `- ${catName}: ${catCount} 个\n`
          })
        } else {
          message += `暂无数据\n`
        }

        this.addChatMessage('assistant', message)
      } else {
        this.addChatMessage('system', result.message || '获取统计信息失败')
      }
    } catch (error) {
      console.error('❌ 获取统计信息失败:', error)
      this.addChatMessage('system', '获取统计信息时发生错误: ' + error.message)
    }
  }

  /**
   * 执行高亮模型
   */
  executeHighlightModel(result) {
    try {
      console.log('💡 高亮模型:', result)
      if (result.status === 'success') {
        const data = result.data
        this.addChatMessage(
          'assistant',
          `💡 模型高亮成功！\n\n` +
            `模型ID: ${data.model_id}\n` +
            `高亮颜色: ${data.color}\n` +
            `高亮强度: ${data.intensity}\n` +
            `闪烁效果: ${data.blinking ? '开启' : '关闭'}`,
        )

        // 触发前端高亮显示
        if (window.viewer && data.model_id) {
          this.highlightModelOnScene(
            data.model_id,
            data.color,
            data.intensity,
            data.blinking,
          )
        }
      } else {
        this.addChatMessage('system', result.message || '高亮模型失败')
      }
    } catch (error) {
      console.error('❌ 高亮模型失败:', error)
      this.addChatMessage('system', '高亮模型时发生错误')
    }
  }

  /**
   * 执行清除高亮
   */
  executeClearHighlight(result) {
    try {
      console.log('💡 清除高亮:', result)
      if (result.status === 'success') {
        this.addChatMessage('assistant', result.message || '✅ 已清除高亮效果')

        // 触发前端清除高亮
        if (window.viewer) {
          this.clearHighlightOnScene(result.data.model_id)
        }
      } else {
        this.addChatMessage('system', result.message || '清除高亮失败')
      }
    } catch (error) {
      console.error('❌ 清除高亮失败:', error)
      this.addChatMessage('system', '清除高亮时发生错误')
    }
  }

  /**
   * 执行SQLite连接
   */
  executeSqlConnect(result) {
    try {
      console.log('🗄️ 数据库连接:', result)
      if (result.status === 'success') {
        this.addChatMessage(
          'assistant',
          `✅ ${result.message}\n\n📁 数据库路径: ${result.data?.path || '未知'}`,
        )
      } else {
        this.addChatMessage('system', result.message || '数据库连接失败')
      }
    } catch (error) {
      console.error('❌ 数据库连接失败:', error)
      this.addChatMessage('system', '数据库连接时发生错误')
    }
  }

  /**
   * 执行创建内存数据库
   */
  executeSqlConnectMemory(result) {
    try {
      console.log('🗄️ 内存数据库:', result)
      if (result.status === 'success') {
        this.addChatMessage('assistant', `✅ ${result.message}`)
      } else {
        this.addChatMessage('system', result.message || '创建内存数据库失败')
      }
    } catch (error) {
      console.error('❌ 创建内存数据库失败:', error)
      this.addChatMessage('system', '创建内存数据库时发生错误')
    }
  }

  /**
   * 执行断开数据库
   */
  executeSqlDisconnect(result) {
    try {
      console.log('🗄️ 断开连接:', result)
      if (result.status === 'success') {
        this.addChatMessage('assistant', `✅ ${result.message}`)
      } else {
        this.addChatMessage('system', result.message || '断开连接失败')
      }
    } catch (error) {
      console.error('❌ 断开连接失败:', error)
      this.addChatMessage('system', '断开连接时发生错误')
    }
  }

  /**
   * 执行SQL语句
   */
  executeSqlExecute(result) {
    try {
      console.log('🗄️ SQL执行:', result)
      if (result.status === 'success') {
        const data = result.data
        let message = `✅ ${result.message}\n\n`

        if (data.type === 'query' && data.rows && data.rows.length > 0) {
          message += '📊 查询结果:\n'
          const rows = data.rows.slice(0, 10)
          rows.forEach((row, i) => {
            message += `${i + 1}. ${JSON.stringify(row)}\n`
          })
          if (data.rows.length > 10) {
            message += `\n... 还有 ${data.rows.length - 10} 条记录`
          }
        } else if (data.type === 'run') {
          message += `📝 影响行数: ${data.changes}`
        } else {
          message += '✅ SQL语句执行成功'
        }

        this.addChatMessage('assistant', message)
      } else {
        this.addChatMessage('system', result.message || 'SQL执行失败')
      }
    } catch (error) {
      console.error('❌ SQL执行失败:', error)
      this.addChatMessage('system', 'SQL执行时发生错误')
    }
  }

  /**
   * 获取表列表
   */
  executeSqlGetTables(result) {
    try {
      console.log('🗄️ 获取表:', result)
      if (result.status === 'success') {
        const tables = result.data?.tables || []
        let message = `✅ ${result.message}\n\n📋 数据库表:\n`
        if (tables.length > 0) {
          tables.forEach((table, i) => {
            message += `${i + 1}. ${table}\n`
          })
        } else {
          message += '(无表)'
        }
        this.addChatMessage('assistant', message)
      } else {
        this.addChatMessage('system', result.message || '获取表列表失败')
      }
    } catch (error) {
      console.error('❌ 获取表列表失败:', error)
      this.addChatMessage('system', '获取表列表时发生错误')
    }
  }

  /**
   * 获取表结构
   */
  executeSqlGetTableInfo(result) {
    try {
      console.log('🗄️ 表结构:', result)
      if (result.status === 'success') {
        const columns = result.data?.columns || []
        let message = `✅ ${result.message}\n\n📊 表结构 (${result.data?.tableName}):\n`
        if (columns.length > 0) {
          columns.forEach((col) => {
            message += `• ${col.name} (${col.type})${col.notnull ? ' NOT NULL' : ''}\n`
          })
        } else {
          message += '(无字段)'
        }
        this.addChatMessage('assistant', message)
      } else {
        this.addChatMessage('system', result.message || '获取表结构失败')
      }
    } catch (error) {
      console.error('❌ 获取表结构失败:', error)
      this.addChatMessage('system', '获取表结构时发生错误')
    }
  }

  /**
   * 获取数据库状态
   */
  executeSqlStatus(result) {
    try {
      console.log('🗄️ 数据库状态:', result)
      if (result.status === 'success') {
        const data = result.data
        let message = `✅ ${result.message}\n\n`
        message += `🔗 连接状态: ${data.connected ? '已连接' : '未连接'}\n`
        if (data.connected) {
          message += `📁 当前数据库: ${data.currentPath || '未知'}\n`
          message += `🔢 活动连接数: ${data.activeConnections}\n`
        }
        this.addChatMessage('assistant', message)
      } else {
        this.addChatMessage('system', result.message || '获取状态失败')
      }
    } catch (error) {
      console.error('❌ 获取数据库状态失败:', error)
      this.addChatMessage('system', '获取数据库状态时发生错误')
    }
  }

  /**
   * 在场景中高亮模型
   */
  highlightModelOnScene(modelId, color, intensity, blinking) {
    try {
      const cesiumColor = SuperMap3D.Color.fromCssColorString(
        color || '#FF0000',
      )

      // 遍历场景中的实体，找到对应的模型并高亮
      window.viewer.entities.values.forEach((entity) => {
        if (entity.id === modelId || entity.name === modelId) {
          // 获取实体当前材质并添加高亮效果
          if (entity.entitySemantic || entity.model) {
            // 使用颜色叠加实现高亮
            entity.highColor = cesiumColor.withAlpha(intensity || 1)
            console.log(`✅ 模型 ${modelId} 已设置高亮:`, color)
          }
        }
      })
    } catch (error) {
      console.error('场景高亮失败:', error)
    }
  }

  /**
   * 清除场景中的高亮
   */
  clearHighlightOnScene(modelId) {
    try {
      window.viewer.entities.values.forEach((entity) => {
        if (!modelId || entity.id === modelId || entity.name === modelId) {
          // 清除高亮颜色
          delete entity.highColor
          console.log(`✅ 模型 ${modelId || '所有'} 高亮已清除`)
        }
      })
    } catch (error) {
      console.error('清除高亮失败:', error)
    }
  }

  /**
   * 初始化Web Speech API语音识别
   */
  initSpeechRecognition() {
    // 检查浏览器是否支持Web Speech API
    if (!WebSpeechRecognition.isSupported()) {
      console.warn('浏览器不支持Web Speech API')
      this.showVoiceStatus('浏览器不支持语音识别功能', 'error')
      return
    }

    try {
      // 创建Web Speech API实例
      this.speechRecognition = new WebSpeechRecognition({
        continuous: false, // 禁用连续模式，防止自动重启
        interimResults: true,
        lang: 'zh-CN',
      })

      // 设置识别结果回调
      this.speechRecognition.onResult((result) => {
        this.handleSpeechResult(result)
      })

      // 设置错误回调
      this.speechRecognition.onError((error) => {
        this.handleSpeechError(error)
      })

      // 设置开始回调
      this.speechRecognition.onStart(() => {
        this.handleSpeechStart()
      })

      // 设置结束回调
      this.speechRecognition.onEnd(() => {
        this.handleSpeechEnd()
      })

      console.log('✅ Web Speech API语音识别初始化完成')
      console.log('📍 使用浏览器内置语音识别功能')
    } catch (error) {
      console.error('❌ Web Speech API初始化失败:', error)
      this.showVoiceStatus('语音识别初始化失败', 'error')
    }
  }

  /**
   * 连接FunASR WebSocket服务
   */
  connectFunASR() {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔌 连接FunASR服务器...')
        this.funasrWs = new WebSocket(this.funasrUrl)

        this.funasrWs.onopen = () => {
          console.log('✅ FunASR连接成功')

          // 发送初始化消息
          const initMessage = {
            mode: 'online',
            chunk_size: [5, 10, 5],
            chunk_interval: 10,
            wav_name: 'microphone',
            is_speaking: true,
          }
          this.funasrWs.send(JSON.stringify(initMessage))
          resolve()
        }

        this.funasrWs.onmessage = (event) => {
          this.handleFunASRMessage(event.data)
        }

        this.funasrWs.onerror = (error) => {
          console.error('❌ FunASR连接错误:', error)
          this.showVoiceStatus('FunASR服务连接失败', 'error')
          reject(error)
        }

        this.funasrWs.onclose = () => {
          console.log('🔌 FunASR连接已关闭')
          this.isRecording = false
          this.updateVoiceButtonState()
          this.cleanupAudio()
        }
      } catch (error) {
        console.error('❌ 创建FunASR连接失败:', error)
        reject(error)
      }
    })
  }

  /**
   * 处理Web Speech API识别结果
   */
  handleSpeechResult(result) {
    const chatInput = document.getElementById('chatInput')
    if (!chatInput) return

    try {
      if (result.isFinal) {
        // 最终结果：追加到聊天框内容（白色文本）
        const currentText = chatInput.value
        const separator = currentText ? ' ' : '' // 如果已有内容，添加空格分隔
        chatInput.value = currentText + separator + result.finalText
        this.speechText = result.finalText
        console.log('✅ 语音识别最终结果:', result.finalText)

        // 清除临时文字状态
        this.clearTempText()

        // 更新UI状态
        this.updateVoiceButtonState()
      } else if (result.interimText) {
        // 临时结果：显示实时识别结果（灰色临时文本）
        console.log('📝 实时识别片段:', result.interimText)

        // 清除之前的临时文字
        this.clearTempText()

        // 显示累积的识别结果（临时状态）
        this.insertTextAtCursor(chatInput, result.interimText, true)
      }
    } catch (error) {
      console.error('❌ 处理语音识别结果失败:', error)
    }
  }

  /**
   * 处理语音识别错误
   */
  handleSpeechError(error) {
    console.error('❌ 语音识别错误:', error)

    let errorMessage = '语音识别发生错误'

    switch (error) {
      case 'not-allowed':
        errorMessage = '麦克风权限被拒绝，请允许使用麦克风'
        break
      case 'audio-capture':
        errorMessage = '无法捕获音频，请检查麦克风设备'
        break
      case 'network':
        errorMessage = '网络错误，请检查网络连接'
        break
      case 'no-speech':
        errorMessage = '未检测到语音输入'
        break
      case 'aborted':
        errorMessage = '语音识别被中止'
        break
    }

    this.isRecording = false
    this.showVoiceStatus(errorMessage, 'error')
    this.updateVoiceButtonState()

    // 如果是网络错误，延迟后尝试重新初始化（仅在未录制状态下）
    if (error === 'network' && !this.isRecording) {
      console.log('🔄 检测到网络错误，将在3秒后尝试重新初始化语音识别')
      setTimeout(() => {
        if (!this.isRecording) {
          this.initSpeechRecognition()
        }
      }, 3000)
    }
  }

  /**
   * 处理语音识别开始
   */
  handleSpeechStart() {
    console.log('🎤 语音识别已开始')
    this.isRecording = true
    this.updateVoiceButtonState()
    this.showVoiceStatus('正在聆听...', 'recording')
  }

  /**
   * 处理语音识别结束
   */
  handleSpeechEnd() {
    console.log('🔴 语音识别已结束')
    this.isRecording = false
    this.updateVoiceButtonState()
    this.showVoiceStatus('语音识别已停止', 'idle')

    // 延迟隐藏状态提示，确保用户看到结束状态
    setTimeout(() => {
      this.hideVoiceStatus()
    }, 2000)

    // 防止Web Speech API自动重启 - 使用更强大的机制
    if (this.speechRecognition) {
      // 重置识别状态
      this.speechRecognition.reset()

      // 添加一个标志来阻止自动重启
      this.preventAutoRestart = true

      // 延迟一小段时间后清除标志，允许手动重新启动
      setTimeout(() => {
        this.preventAutoRestart = false
      }, 1000)
    }
  }

  /**
   * 切换语音录制状态
   */
  async toggleVoiceRecording() {
    if (this.isRecording) {
      this.stopVoiceRecording()
    } else {
      await this.startVoiceRecording()
    }
  }

  /**
   * 开始语音录制
   */
  async startVoiceRecording() {
    try {
      // 检查语音识别是否已初始化
      if (!this.speechRecognition) {
        console.error('❌ 语音识别未初始化')
        this.showVoiceStatus('语音识别未初始化', 'error')
        return
      }

      // 检查是否应该阻止自动重启
      if (this.preventAutoRestart) {
        console.log('⏸️ 阻止语音识别自动重启')
        return
      }

      // 重置识别状态
      this.speechText = ''
      this.speechRecognition.reset()

      // 初始化光标位置
      const chatInput = document.getElementById('chatInput')
      if (chatInput) {
        this.cursorPosition = chatInput.selectionStart || chatInput.value.length
      }

      // 开始语音识别
      this.speechRecognition.start()

      console.log('✅ 语音识别已开始')
    } catch (error) {
      console.error('❌ 启动语音识别失败:', error)
      this.showVoiceStatus('启动语音识别失败', 'error')
    }
  }

  /**
   * 停止语音录制
   */
  stopVoiceRecording() {
    try {
      if (!this.speechRecognition) {
        console.error('❌ 语音识别未初始化')
        return
      }

      // 停止语音识别
      this.speechRecognition.stop()

      // 强制重置状态，防止自动重启
      this.isRecording = false
      this.updateVoiceButtonState()

      console.log('⏹️ 语音识别已停止')
    } catch (error) {
      console.error('❌ 停止语音识别失败:', error)
      this.isRecording = false
      this.updateVoiceButtonState()
    }
  }

  /**
   * 清理语音识别资源
   */
  cleanupSpeechRecognition() {
    try {
      if (this.speechRecognition) {
        this.speechRecognition.destroy()
        this.speechRecognition = null
      }
    } catch (error) {
      console.error('❌ 清理语音识别资源失败:', error)
    }
  }

  /**
   * 在光标位置插入文本
   */
  insertTextAtCursor(inputElement, text, isTemporary = false) {
    if (!this.cursorPosition && this.cursorPosition !== 0) {
      this.cursorPosition = inputElement.selectionStart || 0
    }

    const start = this.cursorPosition
    const currentValue = inputElement.value

    if (isTemporary) {
      // 临时显示，记录临时文字的位置和长度
      this.tempTextStart = start
      this.tempTextLength = text.length
      const tempValue =
        currentValue.substring(0, start) + text + currentValue.substring(start)
      inputElement.value = tempValue
      inputElement.style.color = '#999' // 临时文本用灰色显示

      // 设置光标位置到临时文字末尾
      const newCursorPos = start + text.length
      inputElement.setSelectionRange(newCursorPos, newCursorPos)
    } else {
      // 最终结果，正式插入
      const newValue =
        currentValue.substring(0, start) + text + currentValue.substring(start)
      inputElement.value = newValue
      inputElement.style.color = '#ffffff' // 恢复正常颜色

      // 更新光标位置
      this.cursorPosition = start + text.length
      inputElement.setSelectionRange(this.cursorPosition, this.cursorPosition)
      inputElement.focus()
    }
  }

  /**
   * 清除临时文字
   */
  clearTempText() {
    const chatInput = document.getElementById('chatInput')
    if (chatInput && this.tempTextLength > 0) {
      const currentValue = chatInput.value
      const beforeTemp = currentValue.substring(0, this.tempTextStart)
      const afterTemp = currentValue.substring(
        this.tempTextStart + this.tempTextLength,
      )
      chatInput.value = beforeTemp + afterTemp
      chatInput.style.color = '#ffffff' // 恢复正常颜色

      // 重置临时文字跟踪变量
      this.tempTextLength = 0

      // 设置光标位置
      chatInput.setSelectionRange(this.tempTextStart, this.tempTextStart)
    }
  }

  /**
   * 更新语音按钮状态
   */
  updateVoiceButtonState() {
    const voiceButton = document.getElementById('voiceButton')
    if (this.isRecording) {
      voiceButton.classList.add('recording')
      voiceButton.title = '点击停止语音输入'
    } else {
      voiceButton.classList.remove('recording')
      voiceButton.title = '点击开始语音输入'
    }
  }

  /**
   * 显示语音状态
   */
  showVoiceStatus(message, type = 'info') {
    // 清除之前的自动隐藏定时器
    if (this.statusHideTimer) {
      clearTimeout(this.statusHideTimer)
      this.statusHideTimer = null
    }

    let statusElement = document.querySelector('.voice-status')
    if (!statusElement) {
      statusElement = document.createElement('div')
      statusElement.className = 'voice-status'
      const chatInput = document.querySelector('.chat-input')
      if (chatInput) {
        chatInput.appendChild(statusElement)
      }
    }

    statusElement.textContent = message
    statusElement.className = `voice-status show ${type}`

    // 自动隐藏（除了录制状态）
    if (type !== 'recording') {
      this.statusHideTimer = setTimeout(() => {
        this.hideVoiceStatus()
      }, 3000)
    }
  }

  /**
   * 隐藏语音状态
   */
  hideVoiceStatus() {
    // 清除自动隐藏定时器
    if (this.statusHideTimer) {
      clearTimeout(this.statusHideTimer)
      this.statusHideTimer = null
    }

    const statusElement = document.querySelector('.voice-status')
    if (statusElement) {
      statusElement.classList.remove('show', 'recording', 'error', 'info')
      // 延迟移除元素，确保动画完成
      setTimeout(() => {
        if (statusElement.parentNode) {
          statusElement.parentNode.removeChild(statusElement)
        }
      }, 300)
    }
  }
}

// 导出到全局作用域
window.IntelligentAnalysisAssistant = IntelligentAnalysisAssistant
window.MCPClient = MCPClient

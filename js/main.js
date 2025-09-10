/**
 * 实景三维时空分析工具主程序
 * 基于SuperMap iClient3D for WebGL/WebGPU
 */

class RealityTwin3DAnalysisTool {
    constructor() {
        this.viewer = null;
        this.scene = null;
        this.layers = [];
        this.currentModel = null;
        this.navigationMode = false;
        this.analysisMode = null;
        this.routePoints = [];
        this.currentFloor = 1;
        
        this.init();
    }

    /**
     * 初始化工具
     */
    init() {
        // 设置全局网络请求拦截器，阻止不必要的在线服务请求
        this.setupNetworkInterceptor();
        
        // 初始化组件
        this.initializeComponents();
        
        // 添加页面卸载事件处理
        this.setupPageUnloadHandling();
        
        // 添加WebGL上下文丢失处理
        this.setupWebGLContextHandling();
        
        // 设置全局引用，以便在对话框中调用方法
        window.realityTwin3DAnalysisTool = this;
        
        console.log('实景三维时空分析工具初始化完成');
    }
    
    /**
     * 初始化MCP客户端
     */
    initMCPClient() {
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
            console.log('✅ MCP客户端初始化成功');
            
            // 注册三维分析工具
            this.registerAnalysisTools();
            
        } catch (error) {
            console.error('❌ MCP客户端初始化失败:', error);
        }
    }
    
    /**
     * 注册三维分析工具
     */
    registerAnalysisTools() {
        if (!window.mcpClient) return;
        
        // 注册可用的三维分析工具
        const tools = [
            {
                name: 'viewshed_analysis',
                description: '可视域分析工具，用于分析从指定观察点可见的区域',
                parameters: {
                    position: '观察点位置，包含经度、纬度和高度',
                    direction: '观察方向角度（0-360度）',
                    pitch: '俯仰角度（-90到90度）',
                    horizontalFov: '水平视场角（度）',
                    verticalFov: '垂直视场角（度）',
                    distance: '观察距离（米）',
                    visibleColor: '可见区域颜色',
                    invisibleColor: '不可见区域颜色'
                }
            },
            {
                name: 'shadow_analysis',
                description: '阴影分析工具，用于分析建筑物在特定日期和时间的阴影',
                parameters: {
                    date: '日期（YYYY-MM-DD格式）',
                    startTime: '开始时间（小时，0-24）',
                    endTime: '结束时间（小时，0-24）',
                    bottomHeight: '底部高度（米）',
                    extrudeHeight: '拉伸高度（米）'
                }
            },
            {
                name: 'skyline_analysis',
                description: '天际线分析工具，用于提取城市天际线',
                parameters: {
                    radius: '分析半径（米）'
                }
            },
            {
                name: 'spatial_analysis',
                description: '空间分析工具，包括剖面分析、开挖分析等',
                parameters: {
                    type: '分析类型（clip/excavate/profile）',
                    points: '分析区域点集'
                }
            },
            {
                name: 'sightline_analysis',
                description: '通视分析工具，用于分析两点之间是否可见',
                parameters: {
                    viewPoint: '观察点位置',
                    targetPoint: '目标点位置'
                }
            },
            {
                name: 'indoor_navigation',
                description: '室内导航工具，用于计算室内路径',
                parameters: {
                    startPoint: '起点位置',
                    endPoint: '终点位置',
                    floor: '楼层'
                }
            },
            {
                name: 'load_model',
                description: '加载三维模型',
                parameters: {
                    url: '模型URL',
                    name: '模型名称'
                }
            },
            {
                name: 'fly_to_location',
                description: '飞行到指定位置',
                parameters: {
                    longitude: '经度',
                    latitude: '纬度',
                    height: '高度（米）',
                    heading: '航向角（度）',
                    pitch: '俯仰角（度）',
                    duration: '飞行时间（秒）'
                }
            },
            {
                name: 'clear_analysis',
                description: '清除分析结果',
                parameters: {
                    analysisId: '分析ID（可选）',
                    analysisType: '分析类型（可选）'
                }
            }
        ];
        
        // 向MCP客户端注册工具
        window.mcpClient.registerTools(tools);
        console.log('✅ 三维分析工具注册成功');
    }

    /**
     * 设置网络请求拦截器
     */
    setupNetworkInterceptor() {
        const originalXHR = window.XMLHttpRequest;
        const originalFetch = window.fetch;
        
        // 需要精确阻止的URL模式
        const blockedPatterns = [
            'supermapol.com/realspace/_setup.json',
            'supermapol.com/manager/license.json',
            'virtualearth.net',
            'bing.com',
            'dev.virtualearth.net',
            'openstreetmap.org',
            'tile.openstreetmap.org'
        ];
        
        // 允许的URL模式（本地文件和blob URL）
        const allowedPatterns = [
            'blob:',
            'data:',
            'file:',
            'localhost',
            '127.0.0.1',
            './data/',
            '/data/',
            '.s3m',
            '.gltf',
            '.glb',
            '.obj',
            '.json',
            'scenes.json',  // 允许场景配置文件
            'services/'     // 允许SuperMap服务请求
        ];
        
        // 检查URL是否应该被允许
        const shouldAllow = (url) => {
            if (!url) return false;
            const urlStr = url.toString();
            
            // 检查是否是允许的模式
            const isAllowed = allowedPatterns.some(pattern => urlStr.includes(pattern));
            if (isAllowed) return true;
            
            // 检查是否是相对路径（本地文件）
            if (urlStr.startsWith('./') || urlStr.startsWith('../') || !urlStr.includes('://')) {
                return true;
            }
            
            // 允许SuperMap3D的必要服务请求
            if (urlStr.includes('supermapol.com') && 
                (urlStr.includes('/services/') || urlStr.includes('scenes.json'))) {
                return true;
            }
            
            return false;
        };
        
        // 检查URL是否应该被阻止
        const shouldBlock = (url) => {
            if (!url) return false;
            const urlStr = url.toString();
            
            // 精确匹配需要阻止的URL
            return blockedPatterns.some(pattern => {
                if (pattern.includes('.json')) {
                    // 对于JSON文件，需要精确匹配路径
                    return urlStr.includes(pattern);
                } else {
                    // 对于域名，检查是否包含该域名
                    return urlStr.includes(pattern);
                }
            });
        };
        
        // 拦截XMLHttpRequest
        window.XMLHttpRequest = function() {
            const xhr = new originalXHR();
            const originalOpen = xhr.open;
            
            xhr.open = function(method, url, ...args) {
                // 首先检查是否应该允许
                if (shouldAllow(url)) {
                    return originalOpen.apply(this, [method, url, ...args]);
                }
                
                // 检查是否是被阻止的URL
                if (shouldBlock(url)) {
                    console.log('阻止网络请求:', url);
                    // 创建一个立即失败的请求
                    setTimeout(() => {
                        const event = new Event('error');
                        xhr.dispatchEvent(event);
                        if (xhr.onerror) xhr.onerror(event);
                    }, 1);
                    return;
                }
                
                return originalOpen.apply(this, [method, url, ...args]);
            };
            
            return xhr;
        };
        
        // 拦截fetch请求
        window.fetch = function(url, options) {
            // 首先检查是否应该允许
            if (shouldAllow(url)) {
                return originalFetch.apply(this, [url, options]);
            }
            
            if (shouldBlock(url)) {
                console.log('阻止fetch请求:', url);
                return Promise.reject(new Error('Request blocked: ' + url));
            }
            
            return originalFetch.apply(this, [url, options]);
        };
        
        // 修复权限策略违规问题
        this.fixPermissionsPolicyViolation();
        
        console.log('网络请求拦截器已设置');
    }

    /**
     * 修复权限策略违规问题
     */
    fixPermissionsPolicyViolation() {
        try {
            // 禁用页面卸载事件监听，避免权限策略违规
            const originalAddEventListener = window.addEventListener;
            const originalRemoveEventListener = window.removeEventListener;
            
            window.addEventListener = function(type, listener, options) {
                // 过滤掉可能导致权限策略违规的事件
                if (type === 'unload' || type === 'beforeunload') {
                    console.log(`🚫 阻止添加 ${type} 事件监听器以避免权限策略违规`);
                    return;
                }
                return originalAddEventListener.call(this, type, listener, options);
            };
            
            window.removeEventListener = function(type, listener, options) {
                if (type === 'unload' || type === 'beforeunload') {
                    console.log(`🚫 阻止移除 ${type} 事件监听器`);
                    return;
                }
                return originalRemoveEventListener.call(this, type, listener, options);
            };
            
            // 重写document的事件监听器
            const originalDocAddEventListener = document.addEventListener;
            const originalDocRemoveEventListener = document.removeEventListener;
            
            document.addEventListener = function(type, listener, options) {
                if (type === 'unload' || type === 'beforeunload') {
                    console.log(`🚫 阻止在document上添加 ${type} 事件监听器`);
                    return;
                }
                return originalDocAddEventListener.call(this, type, listener, options);
            };
            
            document.removeEventListener = function(type, listener, options) {
                if (type === 'unload' || type === 'beforeunload') {
                    console.log(`🚫 阻止在document上移除 ${type} 事件监听器`);
                    return;
                }
                return originalDocRemoveEventListener.call(this, type, listener, options);
            };
            
            console.log('✅ 权限策略违规修复已应用');
        } catch (error) {
            console.error('❌ 权限策略违规修复失败:', error);
        }
    }

    /**
     * 初始化组件
     */
    initializeComponents() {
        this.initViewer();
        
        // 等待viewer完全初始化后再进行其他操作
        setTimeout(() => {
            // 绑定事件
            this.bindEvents();
            
            // 绑定属性控制事件
            this.bindPropertyControls();
                
            // 初始化室内导航模块
            try {
                this.indoorNavigation = new IndoorNavigation(this.viewer, this.scene);
                console.log('✅ 室内导航模块初始化成功');
            } catch (error) {
                console.error('❌ 室内导航模块初始化失败:', error);
                this.indoorNavigation = null;
            }
                
            // 初始化数字孪生分析模块
            this.digitalTwinAnalysis = new DigitalTwinAnalysis(this.viewer, this.scene);
            
            // 初始化MCP客户端
            this.initMCPClient();
            
            // 设置UI
            this.setupUI();
        }, 500);
    }

    /**
     * 初始化三维场景
     */
    initViewer() {
        // 禁用在线服务和许可证检查
        if (typeof SuperMap3D !== 'undefined') {
            // 禁用在线许可证检查
            if (SuperMap3D.Ion) {
                SuperMap3D.Ion.defaultAccessToken = '';
            }
            
            // 禁用默认的在线服务
            if (SuperMap3D.RequestScheduler) {
                SuperMap3D.RequestScheduler.maximumRequestsPerServer = 1;
            }
        }
        
        // 获取引擎类型 - 强制使用WebGL2以确保兼容性
        const EngineType = 2; // 强制使用WebGL2
        
        try {
            // 创建三维场景 - 使用更简化的配置
            this.viewer = new SuperMap3D.Viewer('Container', {
                contextOptions: {
                    contextType: Number(EngineType),
                    webgl: {
                        alpha: true,  // 改为true以支持透明背景
                        depth: true,
                        stencil: true,  // 改为true以支持更多渲染特性
                        antialias: true,
                        premultipliedAlpha: true,
                        preserveDrawingBuffer: false,
                        failIfMajorPerformanceCaveat: false
                    }
                },
                animation: false,
                timeline: false,
                fullscreenButton: false,
                geocoder: false,
                homeButton: false,
                infoBox: false,
                sceneModePicker: false,
                selectionIndicator: false,
                navigationHelpButton: false,
                navigationInstructionsInitiallyVisible: false,
                baseLayerPicker: false,
                vrButton: false,
                creditContainer: document.createElement('div'),
                // 添加这些选项以确保正确初始化
                requestRenderMode: false,  // 禁用按需渲染
                maximumRenderTimeChange: Infinity
            });

            this.scene = this.viewer.scene;
            
            console.log('✅ SuperMap3D Viewer创建成功');
            console.log('🔍 Viewer组件状态:', {
                viewer: !!this.viewer,
                cesiumWidget: !!this.viewer.cesiumWidget,
                screenSpaceEventHandler: !!(this.viewer.cesiumWidget && this.viewer.cesiumWidget.screenSpaceEventHandler),
                scene: !!this.viewer.scene,
                canvas: !!(this.viewer.scene && this.viewer.scene.canvas)
            });
            
            // 立即设置场景参数
            this.setupScene();
            
            // 设置canvas的z-index，确保不会覆盖对话框
            setTimeout(() => {
                const canvas = document.querySelector('.supermap3d-widget canvas');
                if (canvas) {
                    canvas.style.zIndex = '1';
                    console.log('✅ 已设置canvas的z-index为1');
                }
            }, 500);
            
            // 等待viewer完全初始化后再继续
            this.waitForViewerReady().then(() => {
                console.log('✅ Viewer完全初始化完成');
                
                // 隐藏加载动画
                const loadingbar = document.getElementById('loadingbar');
                if (loadingbar) {
                    loadingbar.style.display = 'none';
                }
                
                // 延迟绑定鼠标事件，确保viewer完全就绪
                setTimeout(() => {
                    console.log('🖱️ 开始绑定鼠标事件...');
                    this.bindMouseEvents();
                }, 1000); // 增加延迟时间
            }).catch(error => {
                console.error('❌ Viewer初始化失败:', error);
                // 即使初始化失败，也尝试绑定事件
                setTimeout(() => {
                    this.forceRebindMouseEvents();
                }, 2000);
            });
            
        } catch (error) {
            console.error('❌ 创建SuperMap3D Viewer失败:', error);
            // 尝试使用更基础的配置重新创建
            this.createFallbackViewer();
        }
    }

    /**
     * 创建备用Viewer（使用最基础的配置）
     */
    createFallbackViewer() {
        console.log('🔄 尝试使用备用配置创建Viewer...');
        
        try {
            this.viewer = new SuperMap3D.Viewer('Container', {
                animation: false,
                timeline: false,
                fullscreenButton: false,
                geocoder: false,
                homeButton: false,
                infoBox: false,
                sceneModePicker: false,
                selectionIndicator: false,
                navigationHelpButton: false,
                baseLayerPicker: false,
                vrButton: false
            });

            this.scene = this.viewer.scene;
            
            console.log('✅ 备用Viewer创建成功');
            
            // 设置场景参数
            this.setupScene();
            
            // 隐藏加载动画
            const loadingbar = document.getElementById('loadingbar');
            if (loadingbar) {
                loadingbar.style.display = 'none';
            }
            
            // 延迟绑定事件
            setTimeout(() => {
                this.bindMouseEvents();
            }, 2000);
            
        } catch (error) {
            console.error('❌ 备用Viewer创建也失败:', error);
        }
    }

    /**
     * 等待Viewer完全初始化
     */
    async waitForViewerReady() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 50; // 减少最大尝试次数，因为我们会直接创建handler
            
            const checkReady = () => {
                attempts++;
                
                // SuperMap3D的Viewer结构可能与标准Cesium不同，尝试多种访问方式
                let screenSpaceEventHandler = null;
                let canvas = null;
                
                // 尝试不同的访问路径
                if (this.viewer && this.viewer.scene && this.viewer.scene.canvas) {
                    canvas = this.viewer.scene.canvas;
                    
                    // 尝试多种可能的handler访问路径
                    if (this.viewer.cesiumWidget && this.viewer.cesiumWidget.screenSpaceEventHandler) {
                        screenSpaceEventHandler = this.viewer.cesiumWidget.screenSpaceEventHandler;
                    } else if (this.viewer.screenSpaceEventHandler) {
                        screenSpaceEventHandler = this.viewer.screenSpaceEventHandler;
                    } else if (this.viewer.scene.screenSpaceEventHandler) {
                        screenSpaceEventHandler = this.viewer.scene.screenSpaceEventHandler;
                    } else {
                        // 如果都没有，直接创建一个
                        try {
                            screenSpaceEventHandler = new SuperMap3D.ScreenSpaceEventHandler(canvas);
                            // 将创建的handler保存到viewer上
                            if (this.viewer.cesiumWidget) {
                                this.viewer.cesiumWidget.screenSpaceEventHandler = screenSpaceEventHandler;
                            } else {
                                this.viewer.screenSpaceEventHandler = screenSpaceEventHandler;
                            }
                            console.log('✅ 成功创建并绑定screenSpaceEventHandler');
                        } catch (error) {
                            console.warn('⚠️ 无法创建screenSpaceEventHandler:', error);
                        }
                    }
                }
                
                // 详细检查每个组件的状态
                const status = {
                    viewer: !!this.viewer,
                    cesiumWidget: !!(this.viewer && this.viewer.cesiumWidget),
                    screenSpaceEventHandler: !!screenSpaceEventHandler,
                    scene: !!(this.viewer && this.viewer.scene),
                    canvas: !!canvas,
                    camera: !!(this.viewer && this.viewer.scene && this.viewer.scene.camera),
                    globe: !!(this.viewer && this.viewer.scene && this.viewer.scene.globe),
                    primitives: !!(this.viewer && this.viewer.scene && this.viewer.scene.primitives)
                };
                
                // 检查关键组件是否就绪
                const isReady = status.viewer && 
                               status.screenSpaceEventHandler &&
                               status.scene &&
                               status.canvas &&
                               status.camera;
                
                if (attempts % 10 === 0 || attempts <= 5) {
                    console.log(`🔄 第${attempts}次检查Viewer状态:`, status);
                }
                
                if (isReady) {
                    console.log(`✅ Viewer在第${attempts}次检查后完全就绪`);
                    console.log('🎯 最终状态检查:', status);
                    
                    // 保存handler引用以便后续使用
                    this.screenSpaceEventHandler = screenSpaceEventHandler;
                    
                    // 额外验证screenSpaceEventHandler是否可用
                    try {
                        if (screenSpaceEventHandler && typeof screenSpaceEventHandler.setInputAction === 'function') {
                            console.log('✅ ScreenSpaceEventHandler功能验证通过');
                            resolve();
                        } else {
                            console.warn('⚠️ ScreenSpaceEventHandler功能验证失败，继续等待...');
                            if (attempts >= maxAttempts) {
                                console.error(`❌ Viewer在${maxAttempts}次检查后仍未完全就绪`);
                                reject(new Error('Viewer初始化超时'));
                            } else {
                                setTimeout(checkReady, 300);
                            }
                        }
                    } catch (error) {
                        console.error('❌ ScreenSpaceEventHandler验证出错:', error);
                        if (attempts >= maxAttempts) {
                            reject(new Error('Viewer初始化失败'));
                        } else {
                            setTimeout(checkReady, 300);
                        }
                    }
                } else if (attempts >= maxAttempts) {
                    console.error(`❌ Viewer在${maxAttempts}次检查后仍未就绪`);
                    console.error('❌ 最终状态:', status);
                    
                    // 即使失败，也尝试创建基本的handler
                    if (canvas && !screenSpaceEventHandler) {
                        try {
                            this.screenSpaceEventHandler = new SuperMap3D.ScreenSpaceEventHandler(canvas);
                            console.log('✅ 在超时后成功创建基本handler');
                            resolve();
                        } catch (error) {
                            reject(new Error('Viewer初始化超时且无法创建handler'));
                        }
                    } else {
                        reject(new Error('Viewer初始化超时'));
                    }
                } else {
                    setTimeout(checkReady, 300); // 增加检查间隔
                }
            };
            
            // 立即开始第一次检查
            checkReady();
        });
    }

    /**
     * 设置场景参数
     */
    setupScene() {
        // 设置分辨率
        this.viewer.resolutionScale = window.devicePixelRatio;
        
        // 设置光照
        this.scene.lightSource.ambientLightColor = new SuperMap3D.Color(0.6, 0.6, 0.6, 1);
        this.scene.lightSource.directionalLightColor = new SuperMap3D.Color(1.0, 1.0, 1.0, 1);
        
        // 设置相机参数
        this.scene.camera.frustum.near = 0.01;
        this.scene.camera.frustum.far = 50000.0;
        
        // 设置地球参数
        this.scene.globe.enableLighting = true;
        this.scene.globe.depthTestAgainstTerrain = true;
        
        // 解决蓝色背景问题 - 设置透明背景
        try {
            // 隐藏地球
            this.scene.globe.show = false;
            
            // 设置天空盒为透明
            this.scene.skyBox.show = false;
            
            // 设置大气层为透明
            this.scene.skyAtmosphere.show = false;
            
            // 设置太阳和月亮不显示
            this.scene.sun.show = false;
            this.scene.moon.show = false;
            
            // 设置背景颜色为透明黑色
            this.scene.backgroundColor = SuperMap3D.Color.TRANSPARENT;
            
            console.log('✅ 场景背景设置为透明');
        } catch (error) {
            console.error('❌ 设置透明背景失败:', error);
        }
        
        // 设置相机控制器
        this.setupCameraController();
        
        // 添加底图
        this.addBaseLayer();
        
        // 启动渲染循环
        this.startRenderLoop();
    }

    /**
     * 设置相机控制器
     */
    setupCameraController() {
        try {
            const controller = this.scene.screenSpaceCameraController;
            
            // 启用所有相机控制
            controller.enableRotate = true;
            controller.enableTranslate = true;
            controller.enableZoom = true;
            controller.enableTilt = true;
            controller.enableLook = true;
            
            // 优化缩放范围 - 允许更近距离的缩放
            controller.minimumZoomDistance = 0.1;  // 从1.0改为0.1，允许更近距离查看
            controller.maximumZoomDistance = 100000.0;  // 从50000增加到100000，允许更远距离查看
            
            // 优化缩放灵敏度
            controller.zoomFactor = 5.0;  // 增加缩放灵敏度
            controller.wheelZoomFactor = 0.1;  // 优化鼠标滚轮缩放速度
            
            // 设置旋转惯性
            controller.inertiaSpin = 0.9;
            controller.inertiaTranslate = 0.9;
            controller.inertiaZoom = 0.8;
            
            // 设置鼠标灵敏度
            controller.rotateEventTypes = SuperMap3D.CameraEventType.LEFT_DRAG;
            controller.translateEventTypes = SuperMap3D.CameraEventType.RIGHT_DRAG;
            controller.zoomEventTypes = [SuperMap3D.CameraEventType.WHEEL, SuperMap3D.CameraEventType.PINCH];
            
            // 设置碰撞检测 - 防止相机穿透模型
            controller.enableCollisionDetection = true;
            
            console.log('✅ 相机控制器设置完成 - 优化缩放范围和灵敏度');
        } catch (error) {
            console.error('❌ 设置相机控制器失败:', error);
        }
    }

    /**
     * 添加底图
     */
    addBaseLayer() {
        try {
            console.log('禁用在线底图，使用离线模式');
            // 完全移除所有底图，避免网络连接问题
            this.viewer.imageryLayers.removeAll();
            console.log('已移除所有底图，使用纯色背景');
        } catch (error) {
            console.error('底图处理失败:', error);
        }
    }

    /**
     * 获取引擎类型
     */
    getEngineType() {
        // 优先使用WebGPU，如果不支持则使用WebGL
        if (typeof WebGPU !== 'undefined' && WebGPU.supported) {
            return 3; // WebGPU
        }
        return 2; // WebGL2
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        console.log('🔗 开始绑定事件...');
        
        try {
            // 模型管理事件
            const loadModelBtn = document.getElementById('loadModelBtn');
            if (loadModelBtn) {
                loadModelBtn.addEventListener('click', () => this.loadModel());
                console.log('✅ 加载模型按钮事件已绑定');
            } else {
                console.warn('⚠️ 未找到加载模型按钮');
            }
            
            // 批量加载按钮事件 - 添加详细调试和错误处理
            const batchLoadBtn = document.getElementById('batchLoadBtn');
            if (batchLoadBtn) {
                console.log('✅ 找到批量加载按钮，绑定事件');
                console.log('📋 按钮元素信息:', {
                    id: batchLoadBtn.id,
                    className: batchLoadBtn.className,
                    style: batchLoadBtn.style.cssText,
                    disabled: batchLoadBtn.disabled,
                    offsetParent: batchLoadBtn.offsetParent ? batchLoadBtn.offsetParent.tagName : 'null',
                    clientRect: batchLoadBtn.getBoundingClientRect()
                });
                
                // 主要点击事件
                batchLoadBtn.addEventListener('click', (event) => {
                    console.log('🚀 批量加载按钮被点击 (click事件)', event);
                    event.preventDefault();
                    event.stopPropagation();
                    try {
                        this.batchLoadModels();
                    } catch (error) {
                        console.error('❌ 调用batchLoadModels时出错:', error);
                        // 备用处理
                        this.showSimpleBatchLoadDialog();
                    }
                });
                
                // 调试事件
                batchLoadBtn.addEventListener('mousedown', () => {
                    console.log('🖱️ 批量加载按钮鼠标按下 (mousedown事件)');
                });
                
                batchLoadBtn.addEventListener('mouseup', () => {
                    console.log('🖱️ 批量加载按钮鼠标释放 (mouseup事件)');
                });
                
                batchLoadBtn.addEventListener('mouseover', () => {
                    console.log('🖱️ 鼠标悬停在批量加载按钮上 (mouseover事件)');
                });
                
                // 添加备用的双击事件
                batchLoadBtn.addEventListener('dblclick', () => {
                    console.log('🖱️ 批量加载按钮双击');
                    this.showSimpleBatchLoadDialog();
                });
                
                console.log('✅ 批量加载按钮所有事件已绑定');
                
            } else {
                console.error('❌ 未找到批量加载按钮');
                // 尝试延迟绑定
                setTimeout(() => {
                    const delayedBtn = document.getElementById('batchLoadBtn');
                    if (delayedBtn) {
                        console.log('🔄 延迟找到批量加载按钮，重新绑定');
                        this.bindBatchLoadButton(delayedBtn);
                    }
                }, 1000);
            }
        } catch (error) {
            console.error('❌ 绑定批量加载按钮事件时出错:', error);
        }
        
        // 绑定飞行到模型按钮事件
        const flyToModelsBtn = document.getElementById('flyToModelsBtn');
        if (flyToModelsBtn) {
            console.log('✅ 找到飞行到模型按钮，绑定事件');
            flyToModelsBtn.addEventListener('click', () => {
                console.log('🚁 飞行到模型按钮被点击');
                this.flyToAllModels();
            });
        } else {
            console.error('❌ 未找到飞行到模型按钮');
        }



        // 左侧面板折叠功能
        document.getElementById('toggleLeftPanel').addEventListener('click', () => this.toggleLeftPanel());
        
        // 图层管理按钮事件
        document.getElementById('layerManagementBtn').addEventListener('click', () => this.toggleLayerManagement());
        
        // 图层控制事件
        document.getElementById('addLayerBtn').addEventListener('click', () => this.addLayer());
        document.getElementById('removeLayerBtn').addEventListener('click', () => this.removeSelectedLayer());
        document.getElementById('layerPropertiesBtn').addEventListener('click', () => this.showLayerProperties());
        document.getElementById('fullscreenBtn').addEventListener('click', () => this.enterFullscreen());
        document.getElementById('exitFullscreenBtn').addEventListener('click', () => this.exitFullscreen());

        // 室内导航事件
        document.getElementById('startNavigationBtn').addEventListener('click', () => this.toggleNavigationPanel());
        document.getElementById('setRouteBtn').addEventListener('click', () => this.setNavigationMode());
        document.getElementById('clearNavigationBtn').addEventListener('click', () => this.clearNavigation());


        // 空间分析事件
        document.getElementById('spatialAnalysisBtn').addEventListener('click', () => this.toggleAnalysisPanel());
        document.getElementById('viewshedBtn').addEventListener('click', () => this.togglePanel('viewshedPanel'));
            document.getElementById('sightlineBtn').addEventListener('click', () => this.togglePanel('sightlinePanel'));
            document.getElementById('shadowAnalysisBtn').addEventListener('click', () => this.togglePanel('shadowPanel'));
            document.getElementById('skylineAnalysisBtn').addEventListener('click', () => this.togglePanel('skylinePanel'));

        document.getElementById('clearAnalysisBtn').addEventListener('click', () => this.clearAllAnalysis());
        
        // 清除按钮已移至各自的弹窗面板中

        // 场景效果事件
        document.getElementById('lightingBtn').addEventListener('click', () => this.adjustLighting());

        document.getElementById('bloomBtn').addEventListener('click', () => this.toggleBloom());

        // 面板关闭事件（用于弹出面板）
        document.getElementById('closeNavigation').addEventListener('click', () => this.hidePanel('navigationPanel'));
            document.getElementById('closeAnalysis').addEventListener('click', () => this.hidePanel('analysisPanel'));
            document.getElementById('closeInfo').addEventListener('click', () => this.hidePanel('infoPanel'));
            document.getElementById('closeViewshed').addEventListener('click', () => this.hidePanel('viewshedPanel'));
            document.getElementById('closeSightline').addEventListener('click', () => this.hidePanel('sightlinePanel'));
            document.getElementById('closeShadowPanel').addEventListener('click', () => this.hidePanel('shadowPanel'));


        // 导航控制事件
        document.getElementById('calculateRoute').addEventListener('click', () => this.calculateRoute());
            document.getElementById('startWalk').addEventListener('click', () => this.startWalkthrough());
            document.getElementById('stopWalk').addEventListener('click', () => this.stopWalkthrough());
            document.getElementById('clearNavigation').addEventListener('click', () => this.clearNavigation());
        document.getElementById('floorSelect').addEventListener('change', (e) => this.changeFloor(e.target.value));
            
            // 可视域分析面板事件
            document.getElementById('drawViewshed').addEventListener('click', () => this.drawViewshed());
            document.getElementById('drawClipPlane').addEventListener('click', () => this.drawClipPlane());
            document.getElementById('clearViewshed').addEventListener('click', () => this.clearSpecificAnalysis('viewshed'));
            document.getElementById('clipMode').addEventListener('change', (e) => this.setClipMode(e.target.value));
            document.getElementById('propertyEditor').addEventListener('click', () => this.showPropertyEditor());
            
            // 通视分析面板事件
            document.getElementById('addViewPoint').addEventListener('click', () => this.addSightlineViewPoint());
            document.getElementById('addTargetPoint').addEventListener('click', () => this.addSightlineTargetPoint());
            document.getElementById('clearSightline').addEventListener('click', () => this.clearSpecificAnalysis('sightline'));
            
            // 阴影分析面板事件
            document.getElementById('startShadowAnalysis').addEventListener('click', () => this.startShadowAnalysis());
            document.getElementById('shadowSunlight').addEventListener('click', () => this.performSunlightEffect());
            document.getElementById('getShadowRatio').addEventListener('click', () => this.getShadowRatio());
            document.getElementById('clearShadow').addEventListener('click', () => this.clearSpecificAnalysis('shadow'));
            
            // 天际线分析面板事件
            document.getElementById('closeSkylinePanel').addEventListener('click', () => this.hidePanel('skylinePanel'));
            document.getElementById('extractSkyline').addEventListener('click', () => this.extractSkyline());
            document.getElementById('getSkyline2D').addEventListener('click', () => this.getSkyline2D());
            document.getElementById('setLimitBody').addEventListener('click', () => this.setLimitBody());
            document.getElementById('getSkylineArea').addEventListener('click', () => this.getSkylineArea());
            document.getElementById('clearSkyline').addEventListener('click', () => this.clearSkylineAnalysis());
            
            // 属性编辑面板事件
            document.getElementById('closeProperty').addEventListener('click', () => this.hidePanel('propertyPanel'));
            this.bindPropertyControls();
            


        // 空间分析主面板事件 - 打开子面板
        document.getElementById('openClipPanel').addEventListener('click', () => this.togglePanel('clipPanel'));
        
        // 空间分析子面板关闭事件
        document.getElementById('closeClip').addEventListener('click', () => this.hidePanel('clipPanel'));
        
        // 空间分析功能按钮事件
        document.getElementById('startClip').addEventListener('click', () => this.startClipAnalysis());
        document.getElementById('clearClip').addEventListener('click', () => this.clearSpecificAnalysis('clip'));

        // 主界面剖面图表关闭按钮事件
        document.getElementById('closeMainProfileChart').addEventListener('click', () => {
            const container = document.getElementById('mainProfileChartContainer');
            if (container) {
                container.style.display = 'none';
            }
        });

        // 交互取消按钮事件
        document.getElementById('cancelInteraction').addEventListener('click', () => this.cancelInteraction());

        // 鼠标事件 - 添加安全检查和延迟绑定
        this.bindMouseEvents();
    }

    /**
     * 绑定鼠标事件
     */
    bindMouseEvents() {
        console.log('🖱️ 开始绑定鼠标事件...');
        
        // 尝试获取handler，使用多种可能的访问路径
        let handler = this.screenSpaceEventHandler;
        
        if (!handler) {
            // 尝试从viewer的不同位置获取handler
            if (this.viewer && this.viewer.cesiumWidget && this.viewer.cesiumWidget.screenSpaceEventHandler) {
                handler = this.viewer.cesiumWidget.screenSpaceEventHandler;
            } else if (this.viewer && this.viewer.screenSpaceEventHandler) {
                handler = this.viewer.screenSpaceEventHandler;
            } else if (this.viewer && this.viewer.scene && this.viewer.scene.screenSpaceEventHandler) {
                handler = this.viewer.scene.screenSpaceEventHandler;
            } else if (this.viewer && this.viewer.scene && this.viewer.scene.canvas) {
                // 最后尝试创建一个新的handler
                try {
                    handler = new SuperMap3D.ScreenSpaceEventHandler(this.viewer.scene.canvas);
                    this.screenSpaceEventHandler = handler;
                    console.log('✅ 在绑定时创建了新的screenSpaceEventHandler');
                } catch (error) {
                    console.error('❌ 无法创建screenSpaceEventHandler:', error);
                }
            }
        }
        
        if (!handler) {
            console.error('❌ 无法获取screenSpaceEventHandler，尝试备用方案');
            this.forceRebindMouseEvents();
            return;
        }
        
        try {
            
            // 清除之前的事件绑定
            try {
                handler.removeInputAction(SuperMap3D.ScreenSpaceEventType.LEFT_CLICK);
                handler.removeInputAction(SuperMap3D.ScreenSpaceEventType.MOUSE_MOVE);
                console.log('🧹 清除旧的鼠标事件绑定');
            } catch (e) {
                console.log('ℹ️ 没有旧的事件绑定需要清除');
            }
            
            // 绑定新的事件
            handler.setInputAction(
                (event) => {
                    console.log('🖱️ 检测到左键点击事件');
                    this.onLeftClick(event);
                },
                SuperMap3D.ScreenSpaceEventType.LEFT_CLICK
            );

            handler.setInputAction(
                (event) => this.onMouseMove(event),
                SuperMap3D.ScreenSpaceEventType.MOUSE_MOVE
            );
            
            console.log('✅ 鼠标事件绑定成功');
            this.mouseEventsReady = true;
            
            // 验证事件绑定是否生效
            setTimeout(() => {
                this.testMouseEventBinding();
            }, 1000);
            
        } catch (error) {
            console.error('❌ 鼠标事件绑定失败:', error);
            this.forceRebindMouseEvents();
        }
    }

    /**
     * 测试鼠标事件绑定是否生效
     */
    testMouseEventBinding() {
        try {
            const handler = this.screenSpaceEventHandler || 
                          (this.viewer && this.viewer.cesiumWidget && this.viewer.cesiumWidget.screenSpaceEventHandler) ||
                          (this.viewer && this.viewer.screenSpaceEventHandler);
                          
            if (handler && handler._inputEvents && handler._inputEvents[SuperMap3D.ScreenSpaceEventType.LEFT_CLICK]) {
                console.log('✅ 鼠标事件绑定验证成功');
            } else {
                console.warn('⚠️ 鼠标事件绑定验证失败，尝试重新绑定');
                this.forceRebindMouseEvents();
            }
        } catch (error) {
            console.error('❌ 鼠标事件绑定验证出错:', error);
        }
    }

    /**
     * 强制重新绑定鼠标事件
     */
    forceRebindMouseEvents() {
        console.log('🔄 尝试强制重新绑定鼠标事件...');
        
        // 等待更长时间后再次尝试
        setTimeout(() => {
            if (this.viewer && this.viewer.cesiumWidget) {
                try {
                    // 直接在canvas上绑定事件作为备用方案
                    const canvas = this.viewer.scene.canvas;
                    if (canvas) {
                        canvas.addEventListener('click', (event) => {
                            console.log('🖱️ Canvas点击事件触发');
                            this.handleCanvasClick(event);
                        });
                        
                        console.log('✅ 备用Canvas事件绑定成功');
                        this.mouseEventsReady = true;
                    }
                } catch (error) {
                    console.error('❌ 备用事件绑定也失败:', error);
                }
            }
        }, 2000);
    }

    /**
     * 处理Canvas点击事件（备用方案）
     */
    handleCanvasClick(event) {
        if (!this.viewer || !this.viewer.scene) return;
        
        try {
            // 转换为Cesium的点击事件格式
            const rect = this.viewer.scene.canvas.getBoundingClientRect();
            const position = new SuperMap3D.Cartesian2(
                event.clientX - rect.left,
                event.clientY - rect.top
            );
            
            // 模拟Cesium的点击事件
            const cesiumEvent = {
                position: position
            };
            
            this.onLeftClick(cesiumEvent);
        } catch (error) {
            console.error('❌ 处理Canvas点击事件失败:', error);
        }
    }

    /**
     * 模型加载后重新绑定鼠标事件
     */
    rebindMouseEventsAfterModelLoad() {
        console.log('🔄 模型加载完成，重新绑定鼠标事件...');
        
        // 等待一段时间确保渲染稳定
        setTimeout(() => {
            if (!this.mouseEventsReady) {
                console.log('🔧 检测到鼠标事件未就绪，重新绑定...');
                this.bindMouseEvents();
            } else {
                console.log('✅ 鼠标事件已就绪，无需重新绑定');
            }
            
            // 验证鼠标事件是否正常工作
            this.verifyMouseEvents();
        }, 1000);
    }

    /**
     * 验证鼠标事件是否正常工作
     */
    verifyMouseEvents() {
        try {
            const handler = this.screenSpaceEventHandler || 
                          (this.viewer && this.viewer.cesiumWidget && this.viewer.cesiumWidget.screenSpaceEventHandler) ||
                          (this.viewer && this.viewer.screenSpaceEventHandler);
                          
            if (handler && typeof handler.setInputAction === 'function') {
                console.log('✅ 鼠标事件验证通过');
                
                // 如果处于导航模式，提示用户可以开始点击
                if (this.navigationMode) {
                    console.log('🧭 导航模式已激活，可以点击模型设置路径点');
                    this.updateStatus('导航模式已激活，请点击模型设置起点和终点');
                }
            } else {
                console.warn('⚠️ 鼠标事件验证失败，尝试备用方案');
                this.forceRebindMouseEvents();
            }
        } catch (error) {
            console.error('❌ 鼠标事件验证失败:', error);
            this.forceRebindMouseEvents();
        }
    }

    /**
     * 设置UI
     */
    setupUI() {
        // 初始化状态栏更新
        setInterval(() => this.updateStatusBar(), 100);
    }

    /**
     * 加载三维模型
     */
    async loadModel() {
        try {
            // 显示模型加载选择对话框
            const loadOption = await this.showModelLoadOptionDialog();
            
            if (loadOption === 'file') {
                // 选择本地文件
                await this.loadLocalFile();
            } else if (loadOption === 'preset') {
                // 选择预设模型
                await this.loadPresetModel();
            }
        } catch (error) {
            console.error('加载模型失败:', error);
            this.showErrorDialog('加载模型失败', '请检查文件格式和路径是否正确。');
        }
    }

    /**
     * 批量加载模型（直接进入批量加载模式）
     */
    async batchLoadModels() {
        console.log('批量加载模型方法被调用');
        try {
            // 直接显示批量加载选项对话框
            console.log('准备显示批量加载选项对话框');
            const loadOption = await this.showBatchLoadOptionDialog();
            console.log('用户选择的加载选项:', loadOption);
            
            if (loadOption === 'multiple') {
                console.log('开始加载多个文件');
                await this.loadMultipleFiles();
            } else if (loadOption === 'folder') {
                console.log('开始加载文件夹');
                await this.loadFolder();
            } else {
                console.log('用户取消了批量加载');
            }
        } catch (error) {
            console.error('批量加载模型失败:', error);
            this.showErrorDialog('批量加载失败', '请检查文件格式和路径是否正确。');
        }
    }

    /**
     * 简化的批量加载对话框（备用方案）
     */
    showSimpleBatchLoadDialog() {
        console.log('显示简化的批量加载对话框');
        
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            padding: 20px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            z-index: 10000;
            color: white;
            max-width: 450px;
            min-width: 350px;
        `;
        
        dialog.innerHTML = `
            <h3 style="margin-bottom: 20px;">🚀 批量加载模型</h3>
            <p style="color: #ccc; margin-bottom: 20px; font-size: 14px;">
                批量加载功能正在运行中...
            </p>
            <div style="margin: 20px 0;">
                <button onclick="window.selectMultipleFiles()" style="width: 100%; margin: 10px 0; padding: 15px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    📁 选择多个文件
                </button>
                <button onclick="window.selectFolder()" style="width: 100%; margin: 10px 0; padding: 15px; background: #17a2b8; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    🗂️ 选择整个文件夹
                </button>
            </div>
            <div style="text-align: center; margin-top: 20px;">
                <button onclick="window.closeSimpleDialog()" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">取消</button>
            </div>
        `;
        
        document.body.appendChild(dialog);
        window.currentSimpleDialog = dialog;
        
        // 添加全局函数
        window.selectMultipleFiles = () => {
            console.log('用户选择：多个文件（简化版）');
            alert('多文件选择功能');
            window.closeSimpleDialog();
        };
        
        window.selectFolder = () => {
            console.log('用户选择：文件夹（简化版）');
            alert('文件夹选择功能');
            window.closeSimpleDialog();
        };
        
        window.closeSimpleDialog = () => {
            if (window.currentSimpleDialog) {
                document.body.removeChild(window.currentSimpleDialog);
                window.currentSimpleDialog = null;
                console.log('简化对话框已关闭');
            }
        };
    }

    /**
     * 绑定批量加载按钮（备用方法）
     */
    bindBatchLoadButton(button) {
        if (!button) return;
        
        console.log('🔄 绑定批量加载按钮（备用方法）');
        
        button.addEventListener('click', (event) => {
            console.log('🚀 批量加载按钮被点击（备用绑定）');
            event.preventDefault();
            event.stopPropagation();
            this.showSimpleBatchLoadDialog();
        });
        
        console.log('✅ 备用按钮绑定完成');
    }

    /**
     * 显示批量加载选项对话框
     */
    showBatchLoadOptionDialog() {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.9);
                padding: 20px;
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                z-index: 10000;
                color: white;
                max-width: 450px;
                min-width: 350px;
            `;
            
            dialog.innerHTML = `
                <h3 style="margin-bottom: 20px;">🚀 批量加载模型</h3>
                <p style="color: #ccc; margin-bottom: 20px; font-size: 14px;">
                    选择批量加载方式，一次性加载多个模型文件
                </p>
                <div style="margin: 20px 0;">
                    <button class="batch-load-option btn btn-success" data-option="multiple" style="width: 100%; margin: 10px 0; padding: 15px;">
                        📁 选择多个文件
                        <small style="display: block; color: #ccc; margin-top: 5px;">
                            按住Ctrl键选择多个模型文件
                        </small>
                    </button>
                    <button class="batch-load-option btn btn-info" data-option="folder" style="width: 100%; margin: 10px 0; padding: 15px;">
                        🗂️ 选择整个文件夹
                        <small style="display: block; color: #ccc; margin-top: 5px;">
                            自动加载文件夹中的所有模型文件
                        </small>
                    </button>
                </div>
                <div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 4px; margin: 15px 0;">
                    <small style="color: #ccc;">
                        <strong>支持格式:</strong> S3M, GLTF, GLB, OBJ, 3DS, DAE, FBX, PLY, STL, X3D, WRL
                    </small>
                </div>
                <div style="text-align: center; margin-top: 20px;">
                    <button id="cancelBatchLoad" class="btn btn-secondary">取消</button>
                </div>
            `;
            
            document.body.appendChild(dialog);
            
            // 绑定事件
            dialog.querySelectorAll('.batch-load-option').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const option = e.target.dataset.option;
                    document.body.removeChild(dialog);
                    resolve(option);
                });
            });
            
            document.getElementById('cancelBatchLoad').addEventListener('click', () => {
                document.body.removeChild(dialog);
                resolve(null);
            });
        });
    }

    /**
     * 显示模型加载选项对话框
     */
    showModelLoadOptionDialog() {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.className = 'dialog file-load-dialog';
            
            dialog.innerHTML = `
                <h3>选择模型加载方式</h3>
                <div style="margin: 20px 0;">
                    <button id="loadLocalFile" class="btn btn-primary file-load-option">
                        📁 选择本地文件
                        <small>支持 <span class="file-format-list">S3M, GLTF, GLB, OBJ, 3DS, DAE, FBX</span> 等格式</small>
                    </button>
                    <button id="loadPresetModel" class="btn btn-secondary file-load-option">
                        📦 选择预设模型
                        <small>从配置的本地模型中选择</small>
                    </button>
                </div>
                <div style="text-align: center; margin-top: 20px;">
                    <button id="cancelLoadOption" class="btn btn-secondary">取消</button>
                </div>
            `;
            
            document.body.appendChild(dialog);
            
            document.getElementById('loadLocalFile').addEventListener('click', () => {
                document.body.removeChild(dialog);
                resolve('file');
            });
            
            document.getElementById('loadPresetModel').addEventListener('click', () => {
                document.body.removeChild(dialog);
                resolve('preset');
            });
            
            document.getElementById('cancelLoadOption').addEventListener('click', () => {
                document.body.removeChild(dialog);
                resolve(null);
            });
        });
    }

    /**
     * 加载本地文件
     */
    async loadLocalFile() {
        // 显示加载选项对话框
        const loadOption = await this.showLoadOptionDialog();
        
        if (loadOption === 'single') {
            return this.loadSingleFile();
        } else if (loadOption === 'multiple') {
            return this.loadMultipleFiles();
        } else if (loadOption === 'folder') {
            return this.loadFolder();
        }
    }

    /**
     * 显示加载选项对话框
     */
    showLoadOptionDialog() {
        return new Promise((resolve) => {
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.9);
                padding: 20px;
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                z-index: 10000;
                color: white;
                max-width: 400px;
                min-width: 300px;
            `;
            
            dialog.innerHTML = `
                <h3 style="margin-bottom: 20px;">选择加载方式</h3>
                <div style="margin: 20px 0;">
                    <button class="load-option btn btn-primary" data-option="single" style="width: 100%; margin: 10px 0; padding: 15px;">
                        📄 加载单个文件
                    </button>
                    <button class="load-option btn btn-success" data-option="multiple" style="width: 100%; margin: 10px 0; padding: 15px;">
                        📁 加载多个文件
                    </button>
                    <button class="load-option btn btn-info" data-option="folder" style="width: 100%; margin: 10px 0; padding: 15px;">
                        🗂️ 加载整个文件夹
                    </button>
                </div>
                <div style="text-align: center; margin-top: 20px;">
                    <button id="cancelLoad" class="btn btn-secondary">取消</button>
                </div>
            `;
            
            document.body.appendChild(dialog);
            
            // 绑定事件
            dialog.querySelectorAll('.load-option').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const option = e.target.dataset.option;
                    document.body.removeChild(dialog);
                    resolve(option);
                });
            });
            
            document.getElementById('cancelLoad').addEventListener('click', () => {
                document.body.removeChild(dialog);
                resolve(null);
            });
        });
    }

    /**
     * 加载单个文件
     */
    async loadSingleFile() {
        return new Promise((resolve, reject) => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.s3m,.gltf,.glb,.obj,.3ds,.dae,.fbx,.ply,.stl,.x3d,.wrl';
            fileInput.style.display = 'none';
            
            fileInput.addEventListener('change', async (event) => {
                const file = event.target.files[0];
                if (file) {
                    try {
                        await this.loadFileModel(file);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                }
                document.body.removeChild(fileInput);
            });
            
            fileInput.addEventListener('cancel', () => {
                document.body.removeChild(fileInput);
                resolve();
            });
            
            document.body.appendChild(fileInput);
            fileInput.click();
        });
    }

    /**
     * 加载多个文件
     */
    async loadMultipleFiles() {
        return new Promise((resolve, reject) => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.multiple = true; // 允许多选
            fileInput.accept = '.s3m,.gltf,.glb,.obj,.3ds,.dae,.fbx,.ply,.stl,.x3d,.wrl';
            fileInput.style.display = 'none';
            
            fileInput.addEventListener('change', async (event) => {
                const files = Array.from(event.target.files);
                if (files.length > 0) {
                    try {
                        await this.loadMultipleFileModels(files);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                }
                document.body.removeChild(fileInput);
            });
            
            fileInput.addEventListener('cancel', () => {
                document.body.removeChild(fileInput);
                resolve();
            });
            
            document.body.appendChild(fileInput);
            fileInput.click();
        });
    }

    /**
     * 加载文件夹
     */
    async loadFolder() {
        return new Promise((resolve, reject) => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.webkitdirectory = true; // 允许选择文件夹
            fileInput.multiple = true;
            fileInput.style.display = 'none';
            
            fileInput.addEventListener('change', async (event) => {
                const files = Array.from(event.target.files);
                // 过滤出支持的模型文件
                const modelFiles = files.filter(file => {
                    const ext = file.name.split('.').pop().toLowerCase();
                    return ['s3m', 'gltf', 'glb', 'obj', '3ds', 'dae', 'fbx', 'ply', 'stl', 'x3d', 'wrl'].includes(ext);
                });
                
                if (modelFiles.length > 0) {
                    try {
                        await this.loadMultipleFileModels(modelFiles);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                } else {
                    this.showErrorDialog('文件夹加载失败', '所选文件夹中没有找到支持的模型文件');
                    resolve();
                }
                document.body.removeChild(fileInput);
            });
            
            fileInput.addEventListener('cancel', () => {
                document.body.removeChild(fileInput);
                resolve();
            });
            
            document.body.appendChild(fileInput);
            fileInput.click();
        });
    }

    /**
     * 加载预设模型
     */
    async loadPresetModel() {
        // 获取可用的模型配置
        const modelConfigs = Object.values(MODEL_CONFIGS);
        
        // 优先显示本地模型
        const localModels = modelConfigs.filter(config => config.isLocal);
        const onlineModels = modelConfigs.filter(config => !config.isLocal);
        
        const sortedConfigs = [...localModels, ...onlineModels];

        // 显示模型选择对话框
        const selectedConfig = await this.showModelSelectionDialog(sortedConfigs);
        
        if (selectedConfig) {
            await this.loadS3MModel(selectedConfig);
        }
    }

    /**
     * 加载文件模型
     */
    async loadFileModel(file) {
        try {
            this.showLoadingProgress(`正在加载文件: ${file.name}...`);
            
            const fileExtension = file.name.split('.').pop().toLowerCase();
            const fileUrl = URL.createObjectURL(file);
            
            console.log(`开始加载文件: ${file.name}, 格式: ${fileExtension}`);
            
            // 根据文件格式选择加载方法
            switch (fileExtension) {
                case 's3m':
                    await this.loadS3MFile(fileUrl, file.name);
                    break;
                case 'gltf':
                case 'glb':
                    await this.loadGLTFFile(fileUrl, file.name);
                    break;
                case 'obj':
                    await this.loadOBJFile(fileUrl, file.name);
                    break;
                case '3ds':
                case 'dae':
                case 'fbx':
                case 'ply':
                case 'stl':
                case 'x3d':
                case 'wrl':
                    await this.loadGenericFile(fileUrl, file.name, fileExtension);
                    break;
                default:
                    throw new Error(`不支持的文件格式: ${fileExtension}`);
            }
            
            this.hideLoadingProgress();
            this.showSuccessMessage(`文件 ${file.name} 加载成功！`);
            
        } catch (error) {
            console.error('加载文件模型失败:', error);
            this.hideLoadingProgress();
            this.showErrorDialog('文件加载失败', `无法加载文件 ${file.name}: ${error.message}`);
            throw error;
        }
    }

    /**
     * 批量加载多个文件模型
     */
    async loadMultipleFileModels(files) {
        const totalFiles = files.length;
        let loadedFiles = 0;
        let failedFiles = [];
        
        // 检查文件数量，如果过多则警告用户
        if (totalFiles > 1000) {
            const confirmed = confirm(`您要加载 ${totalFiles} 个文件，这可能会消耗大量内存并导致性能问题。\n\n建议：\n- 分批加载（每次不超过500个文件）\n- 确保有足够的内存\n- 关闭其他占用内存的程序\n\n是否继续？`);
            if (!confirmed) {
                console.log('用户取消了大批量加载');
                return;
            }
        }
        
        // 显示批量加载进度对话框
        const progressDialog = this.showBatchLoadingProgress(totalFiles);
        
        try {
            console.log(`开始批量加载 ${totalFiles} 个文件`);
            
            // 根据文件数量动态调整批次大小
            let batchSize = 3;
            if (totalFiles > 500) {
                batchSize = 2; // 大量文件时减少批次大小
            }
            if (totalFiles > 1000) {
                batchSize = 1; // 超大量文件时逐个加载
            }
            
            console.log(`使用批次大小: ${batchSize}`);
            
            for (let i = 0; i < files.length; i += batchSize) {
                // 检查内存使用情况
                if (this.checkMemoryUsage()) {
                    console.warn('⚠️ 内存使用率过高，暂停加载');
                    await this.waitForMemoryRelease();
                }
                
                // 检查渲染器状态
                if (!this.checkRendererHealth()) {
                    console.error('❌ 渲染器状态异常，停止加载');
                    break;
                }
                
                const batch = files.slice(i, i + batchSize);
                
                // 并行加载当前批次的文件
                const batchPromises = batch.map(async (file, index) => {
                    try {
                        const globalIndex = i + index;
                        this.updateBatchProgress(progressDialog, globalIndex + 1, totalFiles, `正在加载: ${file.name}`);
                        
                        await this.loadSingleFileInBatch(file, globalIndex, totalFiles);
                        loadedFiles++;
                        
                        this.updateBatchProgress(progressDialog, globalIndex + 1, totalFiles, `已完成: ${file.name}`);
                        
                        return { success: true, file: file.name };
                    } catch (error) {
                        console.error(`文件 ${file.name} 加载失败:`, error);
                        failedFiles.push({ name: file.name, error: error.message });
                        return { success: false, file: file.name, error: error.message };
                    }
                });
                
                // 等待当前批次完成
                await Promise.allSettled(batchPromises);
                
                // 增加延迟，让浏览器有时间进行垃圾回收
                const delay = totalFiles > 1000 ? 500 : 200;
                await new Promise(resolve => setTimeout(resolve, delay));
                
                // 强制垃圾回收（如果可用）
                this.forceGarbageCollection();
            }
            
            // 关闭进度对话框
            this.closeBatchLoadingProgress(progressDialog);
            
            // 显示加载结果
            this.showBatchLoadingResult(loadedFiles, failedFiles, totalFiles);
            
            // 如果有模型加载成功，延迟飞行到场景以避免渲染问题
            if (loadedFiles > 0) {
                console.log('⏳ 等待渲染稳定后飞行到模型...');
                setTimeout(() => {
                    this.flyToAllModelsWithSafety();
                    this.updateLayerPanel();
                }, 1000);
            }
            
        } catch (error) {
            this.closeBatchLoadingProgress(progressDialog);
            console.error('批量加载失败:', error);
            this.showErrorDialog('批量加载失败', `批量加载过程中发生错误: ${error.message}`);
            throw error;
        }
    }

    /**
     * 在批量加载中加载单个文件（不显示单独的进度和消息）
     */
    async loadSingleFileInBatch(file, index, totalFiles = null) {
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const fileUrl = URL.createObjectURL(file);
        
        console.log(`批量加载文件 ${index + 1}: ${file.name}, 格式: ${fileExtension}`);
        
        // 为批量加载的模型设置不同的位置，避免重叠
        const offsetX = (index % 5) * 0.001; // 经度偏移
        const offsetY = Math.floor(index / 5) * 0.001; // 纬度偏移
        
        // 根据文件格式选择加载方法
        switch (fileExtension) {
            case 's3m':
                return await this.loadS3MFileInBatch(fileUrl, file.name, index);
            case 'gltf':
            case 'glb':
                return await this.loadGLTFFileInBatch(fileUrl, file.name, offsetX, offsetY);
            case 'obj':
                return await this.loadOBJFileInBatch(fileUrl, file.name, offsetX, offsetY);
            case '3ds':
            case 'dae':
            case 'fbx':
            case 'ply':
            case 'stl':
            case 'x3d':
            case 'wrl':
                return await this.loadGenericFileInBatch(fileUrl, file.name, fileExtension, offsetX, offsetY);
            default:
                throw new Error(`不支持的文件格式: ${fileExtension}`);
        }
    }

    /**
     * 加载S3M文件
     */
    async loadS3MFile(fileUrl, fileName) {
        try {
            console.log(`🔄 开始加载单个S3M文件: ${fileName}, URL: ${fileUrl}`);
            
            // 对于本地S3M文件，使用与批量加载相同的逻辑
            let result;
            
            // 方法1: 尝试使用addS3MTilesLayerByScp方法（如果文件是scp配置）
            if (fileName.toLowerCase().endsWith('.scp') || fileName.toLowerCase().includes('config')) {
                result = await this.loadS3MConfigFile(fileUrl, fileName);
            } else {
                // 方法2: 对于.s3m文件，尝试作为S3M Tiles加载
                result = await this.loadS3MAsEntity(fileUrl, fileName, 0);
            }
            
            // 飞行到模型
            this.flyToModel();
            
            // 更新图层管理面板
            this.updateLayerPanel();
            
            return result;
            
        } catch (error) {
            console.error(`❌ S3M文件加载失败: ${fileName}`, error);
            throw new Error(`S3M文件加载失败: ${error.message}`);
        }
    }

    /**
     * 加载GLTF/GLB文件
     */
    async loadGLTFFile(fileUrl, fileName) {
        try {
            // 创建GLTF模型实体
            const entity = this.viewer.entities.add({
                name: fileName,
                position: SuperMap3D.Cartesian3.fromDegrees(116.3, 39.9, 0),
                model: {
                    uri: fileUrl,
                    scale: 1.0,
                    minimumPixelSize: 128,  // 恢复到128，防止模型缩小时消失
                    maximumScale: 20000     // 恢复到20000
                }
            });
            
            // 添加到图层数组
            if (!this.layers) this.layers = [];
            const layerInfo = {
                name: fileName,
                type: 'GLTF/GLB',
                entity: entity,
                visible: true,
                url: fileUrl
            };
            this.layers.push(layerInfo);
            
            console.log('GLTF/GLB文件加载成功:', entity);
            console.log('当前图层数组:', this.layers);
            console.log('图层数量:', this.layers.length);
            
            // 更新图层管理面板
            this.updateLayerPanel();
            
            // 飞行到模型
            this.viewer.flyTo(entity);
            
            return entity;
        } catch (error) {
            throw new Error(`GLTF/GLB文件加载失败: ${error.message}`);
        }
    }

    /**
     * 加载OBJ文件
     */
    async loadOBJFile(fileUrl, fileName) {
        try {
            // 对于OBJ文件，我们需要转换为GLTF格式或使用特殊的加载器
            // 这里提供一个基本的实现
            const entity = this.viewer.entities.add({
                name: fileName,
                position: SuperMap3D.Cartesian3.fromDegrees(116.3, 39.9, 0),
                model: {
                    uri: fileUrl,
                    scale: 1.0
                }
            });
            
            // 添加到图层数组
            if (!this.layers) this.layers = [];
            const layerInfo = {
                name: fileName,
                type: 'OBJ',
                entity: entity,
                visible: true,
                url: fileUrl
            };
            this.layers.push(layerInfo);
            
            console.log('OBJ文件加载成功:', entity);
            console.log('当前图层数组:', this.layers);
            console.log('图层数量:', this.layers.length);
            
            // 更新图层管理面板
            this.updateLayerPanel();
            
            this.viewer.flyTo(entity);
            return entity;
        } catch (error) {
            throw new Error(`OBJ文件加载失败: ${error.message}`);
        }
    }

    /**
     * 加载通用格式文件
     */
    async loadGenericFile(fileUrl, fileName, fileExtension) {
        try {
            // 对于其他格式，尝试作为模型加载
            const entity = this.viewer.entities.add({
                name: fileName,
                position: SuperMap3D.Cartesian3.fromDegrees(116.3, 39.9, 0),
                model: {
                    uri: fileUrl,
                    scale: 1.0
                }
            });
            
            // 添加到图层数组
            if (!this.layers) this.layers = [];
            const layerInfo = {
                name: fileName,
                type: fileExtension.toUpperCase(),
                entity: entity,
                visible: true,
                url: fileUrl
            };
            this.layers.push(layerInfo);
            
            console.log(`${fileExtension.toUpperCase()}文件加载成功:`, entity);
            console.log('当前图层数组:', this.layers);
            console.log('图层数量:', this.layers.length);
            
            // 更新图层管理面板
            this.updateLayerPanel();
            
            this.viewer.flyTo(entity);
            return entity;
        } catch (error) {
            throw new Error(`${fileExtension.toUpperCase()}文件加载失败: ${error.message}`);
        }
    }

    /**
     * 加载S3M模型
     */
    async loadS3MModel(config) {
        try {
            // 显示加载进度
            this.showLoadingProgress('正在加载模型...');
            
            // 检查是否为本地文件
            if (config.url.startsWith('./') || config.url.startsWith('/') || config.url.includes('localhost') || config.url.includes('127.0.0.1') || config.isLocal) {
                // 本地文件直接加载
                console.log('加载本地S3M文件:', config.url);
                
                const promise = this.scene.open(config.url);
                
                SuperMap3D.when(promise, (layers) => {
                    console.log('本地S3M模型加载成功:', layers);
                    this.layers = layers;
                    this.currentModel = layers[0];
                    
                    // 飞行到模型
                    this.flyToModel();
                    
                    // 更新图层管理面板
                    this.updateLayerPanel();
                    
                    // 隐藏加载进度
                    this.hideLoadingProgress();
                    
                    this.showSuccessMessage('本地模型加载成功！');
                    console.log('本地模型加载成功，支持离线使用');
                }, (error) => {
                    console.error('本地模型加载失败:', error);
                    this.hideLoadingProgress();
                    this.showErrorDialog('加载失败', '本地模型文件不存在或格式错误。请检查文件路径：' + config.url);
                });
            } else {
                // 在线服务，跳过
                this.hideLoadingProgress();
                this.showErrorDialog('在线服务已禁用', '当前版本仅支持本地文件加载，请选择本地模型文件。');
            }
        } catch (error) {
            console.error('加载S3M模型出错:', error);
            this.hideLoadingProgress();
            throw error;
        }
    }

    /**
     * 显示模型选择对话框
     */
    showModelSelectionDialog(configs) {
        return new Promise((resolve) => {
            // 创建模型选择对话框
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.9);
                padding: 20px;
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                z-index: 10000;
                color: white;
                max-width: 400px;
                min-width: 300px;
            `;
            
            dialog.innerHTML = `
                <h3 style="margin-bottom: 20px;">选择要加载的模型</h3>
                <div style="margin: 20px 0;">
                    ${configs.map((config, index) => `
                        <div class="model-option-container" style="margin: 10px 0; padding: 10px; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px;">
                            <button class="model-option btn btn-primary" data-index="${index}" style="width: 100%; margin-bottom: 5px;">
                                ${config.name} ${config.isLocal ? '(本地)' : '(在线)'}
                            </button>
                            <small style="color: #ccc; font-size: 12px;">${config.description || ''}</small>
                        </div>
                    `).join('')}
                </div>
                <div style="text-align: center; margin-top: 20px;">
                    <button id="cancelModel" class="btn btn-secondary">取消</button>
                </div>
            `;
            
            document.body.appendChild(dialog);
            
            // 绑定事件
            dialog.querySelectorAll('.model-option').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const index = parseInt(e.target.dataset.index);
                    document.body.removeChild(dialog);
                    resolve(configs[index]);
                });
            });
            
            document.getElementById('cancelModel').addEventListener('click', () => {
                document.body.removeChild(dialog);
                resolve(null);
            });
        });
    }

    /**
     * 飞行到模型
     */
    flyToModel() {
        if (this.currentModel && this.currentModel.boundingSphere) {
            this.viewer.camera.flyToBoundingSphere(this.currentModel.boundingSphere, {
                duration: 2.0
            });
        }
    }

    /**
     * 切换图层管理面板
     */
    toggleLayerPanel() {
        this.togglePanel('layerPanel');
    }

    /**
     * 切换左侧面板折叠状态
     */
    toggleLeftPanel() {
        const leftPanel = document.getElementById('leftPanel');
        const container = document.getElementById('Container');
        const toggleBtn = document.getElementById('toggleLeftPanel');
        
        if (leftPanel.classList.contains('collapsed')) {
            // 展开面板
            leftPanel.classList.remove('collapsed');
            container.classList.remove('expanded');
            toggleBtn.textContent = '◀';
            toggleBtn.title = '折叠面板';
        } else {
            // 折叠面板
            leftPanel.classList.add('collapsed');
            container.classList.add('expanded');
            toggleBtn.textContent = '▶';
            toggleBtn.title = '展开面板';
        }
    }

    /**
     * 切换图层管理面板显示状态
     */
    toggleLayerManagement() {
        const leftPanel = document.getElementById('leftPanel');
        const container = document.getElementById('Container');
        
        if (leftPanel.classList.contains('hidden')) {
            // 显示面板
            leftPanel.classList.remove('hidden');
            leftPanel.classList.remove('collapsed');
            container.classList.remove('expanded');
            
            // 更新折叠按钮状态
            const toggleBtn = document.getElementById('toggleLeftPanel');
            if (toggleBtn) {
                toggleBtn.textContent = '◀';
                toggleBtn.title = '折叠面板';
            }
        } else {
            // 隐藏面板
            leftPanel.classList.add('hidden');
            leftPanel.classList.remove('collapsed');
            container.classList.add('expanded');
        }
    }

    /**
     * 添加图层
     */
    addLayer() {
        this.loadModel();
    }

    /**
     * 删除选中的图层
     */
    removeSelectedLayer() {
        const selectedItems = document.querySelectorAll('.layer-item.selected');
        if (selectedItems.length === 0) {
            this.showErrorDialog('删除图层', '请先选择要删除的图层');
            return;
        }

        // 确认删除
        const layerNames = Array.from(selectedItems).map(item => {
            const layerIndex = parseInt(item.dataset.layerIndex);
            return this.layers[layerIndex]?.name || `图层 ${layerIndex + 1}`;
        }).join(', ');
        
        const confirmed = confirm(`确定要删除以下图层吗？\n${layerNames}`);
        if (!confirmed) {
            return;
        }

        // 按索引倒序删除，避免索引错乱
        const indices = Array.from(selectedItems)
            .map(item => parseInt(item.dataset.layerIndex))
            .sort((a, b) => b - a);

        indices.forEach(layerIndex => {
            if (layerIndex >= 0 && layerIndex < this.layers.length) {
                // 从场景中移除图层
                const layerInfo = this.layers[layerIndex];
                
                // 移除不同类型的图层对象
                if (layerInfo.primitive) {
                    this.viewer.scene.primitives.remove(layerInfo.primitive);
                }
                if (layerInfo.tileset && layerInfo.tileset !== layerInfo.primitive) {
                    this.viewer.scene.primitives.remove(layerInfo.tileset);
                }
                if (layerInfo.layer) {
                    // S3M图层的移除
                    if (this.scene && this.scene.layers) {
                        this.scene.layers.remove(layerInfo.layer);
                    }
                }
                if (layerInfo.entity) {
                    this.viewer.entities.remove(layerInfo.entity);
                }
                
                // 清除与该模型相关的导航路径
                if (this.indoorNavigation) {
                    console.log(`🧹 移除模型 "${layerInfo.name}"：清除相关的起点、终点和路径`);
                    this.indoorNavigation.clearRoute();
                    
                    // 重置导航模式状态
                    this.navigationMode = false;
                    const setRouteBtn = document.getElementById('setRouteBtn');
                    if (setRouteBtn) {
                        setRouteBtn.textContent = '设置路径';
                        setRouteBtn.className = 'btn btn-warning';
                    }
                    
                    // 清空路径点数组
                    this.routePoints = [];
                    
                    // 清空输入框
                    const startPointInput = document.getElementById('startPoint');
                    const endPointInput = document.getElementById('endPoint');
                    if (startPointInput) startPointInput.value = '';
                    if (endPointInput) endPointInput.value = '';
                }
                
                // 从数组中移除
                this.layers.splice(layerIndex, 1);
            }
        });

        this.updateLayerPanel();
        this.showSuccessMessage(`成功删除 ${indices.length} 个图层`);
    }

    /**
     * 显示图层属性
     */
    showLayerProperties() {
        const selectedItems = document.querySelectorAll('.layer-item.selected');
        if (selectedItems.length === 0) {
            this.showErrorDialog('图层属性', '请先选择要查看属性的图层');
            return;
        }

        const layerIndex = parseInt(selectedItems[0].dataset.layerIndex);
        const layerInfo = this.layers[layerIndex];
        
        if (layerInfo) {
            this.showLayerPropertiesDialog(layerInfo);
        }
    }

    /**
     * 显示图层属性对话框
     */
    showLayerPropertiesDialog(layerInfo) {
        // 获取详细信息
        const details = this.getLayerDetails(layerInfo);
        
        const dialog = document.createElement('div');
        dialog.className = 'dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.95);
            padding: 25px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            z-index: 10000;
            color: white;
            max-width: 500px;
            min-width: 400px;
            max-height: 80vh;
            overflow-y: auto;
        `;
        
        dialog.innerHTML = `
            <h3 style="margin-bottom: 20px; color: #4CAF50;">📊 图层属性</h3>
            <div style="margin: 20px 0;">
                <div style="margin-bottom: 15px;">
                    <strong style="color: #2196F3;">名称:</strong> 
                    <span style="margin-left: 10px;">${layerInfo.name || '未命名图层'}</span>
                </div>
                <div style="margin-bottom: 15px;">
                    <strong style="color: #2196F3;">类型:</strong> 
                    <span style="margin-left: 10px;">${layerInfo.type || '未知'}</span>
                </div>
                <div style="margin-bottom: 15px;">
                    <strong style="color: #2196F3;">可见性:</strong> 
                    <span style="margin-left: 10px; color: ${layerInfo.visible ? '#4CAF50' : '#f44336'};">
                        ${layerInfo.visible ? '✅ 可见' : '❌ 隐藏'}
                    </span>
                </div>
                <div style="margin-bottom: 15px;">
                    <strong style="color: #2196F3;">文件路径:</strong> 
                    <div style="margin-top: 5px; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; word-break: break-all; font-size: 12px;">
                        ${layerInfo.url || '无'}
                    </div>
                </div>
                ${details.position ? `
                <div style="margin-bottom: 15px;">
                    <strong style="color: #2196F3;">位置:</strong> 
                    <div style="margin-top: 5px; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; font-size: 12px;">
                        ${details.position}
                    </div>
                </div>
                ` : ''}
                ${details.boundingSphere ? `
                <div style="margin-bottom: 15px;">
                    <strong style="color: #2196F3;">边界球:</strong> 
                    <div style="margin-top: 5px; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; font-size: 12px;">
                        ${details.boundingSphere}
                    </div>
                </div>
                ` : ''}
                ${details.scale ? `
                <div style="margin-bottom: 15px;">
                    <strong style="color: #2196F3;">缩放:</strong> 
                    <span style="margin-left: 10px;">${details.scale}</span>
                </div>
                ` : ''}
                <div style="margin-bottom: 15px;">
                    <strong style="color: #2196F3;">加载时间:</strong> 
                    <span style="margin-left: 10px;">${new Date().toLocaleString()}</span>
                </div>
            </div>
            <div style="text-align: center; margin-top: 25px;">
                <button class="close-properties-btn" 
                        style="padding: 12px 24px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px;">
                    关闭
                </button>
                <button onclick="window.realityTwin3DAnalysisTool.flyToLayer(${this.layers.indexOf(layerInfo)})" 
                        style="padding: 12px 24px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    飞行到图层
                </button>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // 绑定关闭按钮事件
        const closeBtn = dialog.querySelector('.close-properties-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(dialog);
            });
        }
    }

    /**
     * 获取图层详细信息
     */
    getLayerDetails(layerInfo) {
        const details = {};
        
        try {
            // 获取当前时间
            const currentTime = this.viewer.clock.currentTime;
            
            // 获取位置信息
            if (layerInfo.entity && layerInfo.entity.position) {
                try {
                    // 尝试获取位置值，提供时间参数
                    let positionValue;
                    if (typeof layerInfo.entity.position.getValue === 'function') {
                        positionValue = layerInfo.entity.position.getValue(currentTime);
                    } else {
                        // 如果position是直接的Cartesian3值
                        positionValue = layerInfo.entity.position;
                    }
                    
                    if (positionValue) {
                        const cartographic = SuperMap3D.Cartographic.fromCartesian(positionValue);
                        const longitude = SuperMap3D.Math.toDegrees(cartographic.longitude).toFixed(6);
                        const latitude = SuperMap3D.Math.toDegrees(cartographic.latitude).toFixed(6);
                        const height = cartographic.height.toFixed(2);
                        details.position = `经度: ${longitude}°, 纬度: ${latitude}°, 高度: ${height}m`;
                    }
                } catch (posError) {
                    console.warn('获取位置信息失败:', posError);
                    details.position = '位置信息不可用';
                }
            }
            
            // 获取边界球信息
            if (layerInfo.tileset && layerInfo.tileset.boundingSphere) {
                try {
                    const sphere = layerInfo.tileset.boundingSphere;
                    const center = sphere.center;
                    const cartographic = SuperMap3D.Cartographic.fromCartesian(center);
                    const longitude = SuperMap3D.Math.toDegrees(cartographic.longitude).toFixed(6);
                    const latitude = SuperMap3D.Math.toDegrees(cartographic.latitude).toFixed(6);
                    const height = cartographic.height.toFixed(2);
                    details.boundingSphere = `中心: (${longitude}°, ${latitude}°, ${height}m), 半径: ${sphere.radius.toFixed(2)}m`;
                } catch (boundError) {
                    console.warn('获取边界球信息失败:', boundError);
                    details.boundingSphere = '边界球信息不可用';
                }
            }
            
            // 获取缩放信息
            if (layerInfo.entity && layerInfo.entity.model && layerInfo.entity.model.scale) {
                try {
                    let scaleValue;
                    if (typeof layerInfo.entity.model.scale.getValue === 'function') {
                        scaleValue = layerInfo.entity.model.scale.getValue(currentTime);
                    } else {
                        scaleValue = layerInfo.entity.model.scale;
                    }
                    details.scale = scaleValue;
                } catch (scaleError) {
                    console.warn('获取缩放信息失败:', scaleError);
                    details.scale = '缩放信息不可用';
                }
            }
            
            // 获取基本信息
            details.name = layerInfo.name || '未命名图层';
            details.type = layerInfo.type || '未知类型';
            details.visible = layerInfo.visible !== false ? '可见' : '隐藏';
            
            // 获取实体ID
            if (layerInfo.entity && layerInfo.entity.id) {
                details.entityId = layerInfo.entity.id;
            }
            
        } catch (error) {
            console.error('获取图层详细信息时发生错误:', error);
            details.error = '获取图层信息时发生错误';
        }
        
        return details;
    }

    /**
     * 飞行到指定图层
     */
    flyToLayer(layerIndex) {
        if (layerIndex >= 0 && layerIndex < this.layers.length) {
            const layerInfo = this.layers[layerIndex];
            
            if (layerInfo.entity) {
                this.viewer.flyTo(layerInfo.entity);
            } else if (layerInfo.tileset) {
                this.viewer.flyTo(layerInfo.tileset);
            } else if (layerInfo.layer) {
                this.viewer.flyTo(layerInfo.layer);
            }
        }
    }

    /**
     * 切换导航面板
     */
    toggleNavigationPanel() {
        this.togglePanel('navigationPanel');
    }

    /**
     * 切换分析面板
     */
    toggleAnalysisPanel() {
        this.togglePanel('analysisPanel');
    }

    /**
     * 切换面板显示状态
     */
    togglePanel(panelId) {
        const panel = document.getElementById(panelId);
        if (panel.style.display === 'none' || !panel.style.display) {
            this.hideAllPanels();
            panel.style.display = 'block';
        } else {
            panel.style.display = 'none';
        }
    }

    /**
     * 隐藏指定面板
     */
    hidePanel(panelId) {
        document.getElementById(panelId).style.display = 'none';
    }

    /**
     * 隐藏所有面板
     */
    hideAllPanels() {
        ['navigationPanel', 'analysisPanel', 'infoPanel', 'viewshedPanel', 'sightlinePanel', 'clipPanel', 'shadowPanel', 'skylinePanel', 'propertyPanel'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.style.display = 'none';
            } else {
                console.warn(`面板元素未找到: ${id}`);
            }
        });
    }

    /**
     * 更新图层管理面板
     */
    updateLayerPanel() {
        console.log('🔄 开始更新图层面板...');
        console.log('当前图层数组状态:', this.layers);
        console.log('图层数量:', this.layers ? this.layers.length : 0);
        
        const layerTree = document.getElementById('layerTree');
        if (!layerTree) {
            console.warn('❌ 图层树容器未找到');
            return;
        }
        
        console.log('✅ 找到图层树容器:', layerTree);
        layerTree.innerHTML = '';
        
        if (!this.layers || this.layers.length === 0) {
            console.log('⚠️ 没有图层数据，显示"暂无图层"');
            layerTree.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">暂无图层</div>';
            return;
        }
        
        console.log(`✅ 开始渲染 ${this.layers.length} 个图层...`);
        
        this.layers.forEach((layerInfo, index) => {
            const layerItem = document.createElement('div');
            layerItem.className = 'layer-item';
            layerItem.dataset.layerIndex = index;
            
            // 获取图层状态
            const isVisible = layerInfo.visible !== false;
            const layerName = layerInfo.name || `图层 ${index + 1}`;
            const layerType = layerInfo.type || '未知';
            
            layerItem.innerHTML = `
                <div style="display: flex; align-items: center; padding: 8px;">
                    <input type="checkbox" class="layer-checkbox" ${isVisible ? 'checked' : ''} 
                           data-layer="${index}" style="margin-right: 8px;">
                    <div style="flex: 1; min-width: 0;">
                        <div class="layer-name" style="font-weight: bold; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" 
                             title="${layerName}">${layerName}</div>
                        <div class="layer-type" style="font-size: 11px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" 
                             title="${layerType}">${layerType}</div>
                    </div>
                    <span class="layer-visibility" style="margin-left: 8px; font-size: 16px;" 
                          title="${isVisible ? '可见' : '隐藏'}">${isVisible ? '👁️' : '🚫'}</span>
                </div>
            `;
            
            // 复选框事件
            const checkbox = layerItem.querySelector('.layer-checkbox');
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation(); // 防止触发图层项点击事件
                const visible = e.target.checked;
                this.updateLayerVisibility(layerInfo, visible);
                
                // 更新可见性图标
                const visibilityIcon = layerItem.querySelector('.layer-visibility');
                visibilityIcon.textContent = visible ? '👁️' : '🚫';
                visibilityIcon.title = visible ? '可见' : '隐藏';
            });
            
            // 图层项点击选择事件
            layerItem.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox' && !e.target.classList.contains('layer-checkbox')) {
                    // 切换选中状态
                    const wasSelected = layerItem.classList.contains('selected');
                    
                    // 如果按住Ctrl键，允许多选，否则单选
                    if (!e.ctrlKey) {
                        document.querySelectorAll('.layer-item.selected').forEach(item => {
                            item.classList.remove('selected');
                        });
                    }
                    
                    // 切换当前项的选中状态
                    if (e.ctrlKey) {
                        layerItem.classList.toggle('selected');
                    } else {
                        layerItem.classList.add('selected');
                    }
                }
            });
            
            // 双击飞行到图层
            layerItem.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.flyToLayer(index);
            });
            
            layerTree.appendChild(layerItem);
        });
        
        // 更新图层统计信息
        this.updateLayerStats();
    }

    /**
     * 更新图层统计信息
     */
    updateLayerStats() {
        const layerCount = this.layers ? this.layers.length : 0;
        const visibleCount = this.layers ? this.layers.filter(layer => layer.visible !== false).length : 0;
        
        // 更新左侧面板标题
        const panelHeader = document.querySelector('.left-panel .panel-header h3');
        if (panelHeader) {
            panelHeader.textContent = `图层管理 (${visibleCount}/${layerCount})`;
        }
    }

    /**
     * 更新图层可见性
     */
    updateLayerVisibility(layerInfo, visible) {
        layerInfo.visible = visible;
        
        // 处理不同类型的图层对象
        if (layerInfo.primitive) {
            layerInfo.primitive.show = visible;
        }
        if (layerInfo.tileset) {
            layerInfo.tileset.show = visible;
        }
        if (layerInfo.layer) {
            layerInfo.layer.visible = visible;
        }
        if (layerInfo.entity) {
            layerInfo.entity.show = visible;
        }
    }

    /**
     * 设置导航模式
     */
    setNavigationMode() {
        if (!this.indoorNavigation) {
            console.error('❌ 室内导航模块未初始化');
            alert('室内导航模块未正确初始化，请刷新页面重试');
            return;
        }
        
        this.navigationMode = !this.navigationMode;
        const btn = document.getElementById('setRouteBtn');
        
        if (this.navigationMode) {
            btn.textContent = '退出路径设置';
            btn.className = 'btn btn-danger';
            
            // 清除之前的路径点和所有导航相关元素
            this.routePoints = [];
            if (this.indoorNavigation) {
                console.log('🧹 重新规划路径：清除之前的起点、终点和路径');
                this.indoorNavigation.clearRoute();
            }
            
            // 清空输入框
            const startPointInput = document.getElementById('startPoint');
            const endPointInput = document.getElementById('endPoint');
            if (startPointInput) startPointInput.value = '';
            if (endPointInput) endPointInput.value = '';
            
            console.log('🎯 进入导航模式，请在地图上点击设置起点和终点');
            this.updateStatus('请在地图上点击设置起点');
        } else {
            btn.textContent = '设置路径';
            btn.className = 'btn btn-warning';
            this.routePoints = [];
            
            if (this.indoorNavigation) {
                console.log('🧹 退出导航模式：清除所有导航元素');
                this.indoorNavigation.clearRoute();
            }
            
            console.log('🚪 退出导航模式');
            this.updateStatus('导航模式已退出');
        }
    }

    /**
     * 计算路径
     */
    calculateRoute() {
        try {
            if (!this.indoorNavigation) {
                alert('室内导航模块未初始化');
                return;
            }
            
            if (this.routePoints.length < 2) {
                alert('请先设置起点和终点');
                this.updateStatus('请先设置起点和终点');
                return;
            }
            
            console.log('🧮 开始计算路径...');
            this.updateStatus('正在计算路径...');
            
            // 使用室内导航模块计算路径
            this.indoorNavigation.calculateRoute();
            
            console.log('✅ 路径计算完成');
            this.updateStatus('路径计算完成，可以开始漫游');
            alert('路径计算完成！点击"开始漫游"按钮开始导航。');
        } catch (error) {
            console.error('❌ 路径计算失败:', error);
            alert('路径计算失败，请重试');
            this.updateStatus('路径计算失败');
        }
    }

    /**
     * 开始漫游
     */
    startWalkthrough() {
        try {
            if (!this.indoorNavigation) {
                alert('室内导航模块未初始化');
                return;
            }
            
            if (this.routePoints.length < 2) {
                alert('请先设置路径并计算');
                this.updateStatus('请先设置路径并计算');
                return;
            }
            
            console.log('🚶 开始导航漫游...');
            this.updateStatus('开始导航漫游...');
            
            // 使用室内导航模块开始漫游
            this.indoorNavigation.startWalkthrough();
            
            console.log('✅ 导航漫游已启动');
        } catch (error) {
            console.error('❌ 导航漫游启动失败:', error);
            alert('导航漫游启动失败，请重试');
            this.updateStatus('导航漫游启动失败');
        }
    }

    /**
     * 停止漫游
     */
    stopWalkthrough() {
        try {
            if (!this.indoorNavigation) {
                alert('室内导航模块未初始化');
                return;
            }
            
            console.log('🛑 停止导航漫游...');
            this.updateStatus('停止导航漫游...');
            
            // 使用室内导航模块停止漫游
            this.indoorNavigation.stopNavigation();
            
            console.log('✅ 导航漫游已停止');
            this.updateStatus('导航漫游已停止');
            this.showSuccessMessage('导航漫游已停止');
            
        } catch (error) {
            console.error('❌ 停止导航漫游失败:', error);
            alert('停止导航漫游失败，请重试');
            this.updateStatus('停止导航漫游失败');
        }
    }

    /**
     * 切换楼层
     */
    changeFloor(floor) {
        try {
            if (!this.indoorNavigation) {
                console.warn('室内导航模块未初始化');
                return;
            }
            
            const floorNumber = parseInt(floor);
            console.log(`🏢 切换到第${floorNumber}层`);
            this.updateStatus(`正在切换到第${floorNumber}层...`);
            
            // 使用室内导航模块切换楼层
            this.indoorNavigation.changeFloor(floorNumber);
            
            console.log(`✅ 已切换到第${floorNumber}层`);
            this.updateStatus(`已切换到第${floorNumber}层`);
        } catch (error) {
            console.error('❌ 楼层切换失败:', error);
            this.updateStatus('楼层切换失败');
        }
    }

    // performWalkthrough方法已移除，现在使用IndoorNavigation模块的第一视角漫游功能





    /**
     * 绘制可视域
     */
    drawViewshed() {
        this.analysisMode = 'viewshed';
        this.updateStatus('请点击地图设置观察点进行可视域分析');
        if (this.digitalTwinAnalysis) {
            this.digitalTwinAnalysis.startInteractiveViewshedAnalysis();
            // 显示属性编辑弹窗
            showViewshedPropertyEditor();
        } else {
            alert('分析模块未初始化');
        }
    }

    /**
     * 绘制裁剪面
     */
    drawClipPlane() {
        this.analysisMode = 'clip-plane';
        this.updateStatus('请绘制裁剪面区域（右键结束绘制）');
        if (this.digitalTwinAnalysis) {
            this.digitalTwinAnalysis.startDrawClipPlane();
        } else {
            alert('分析模块未初始化');
        }
    }

    /**
     * 设置裁剪模式
     */
    setClipMode(mode) {
        if (this.digitalTwinAnalysis) {
            this.digitalTwinAnalysis.setViewshedClipMode(mode);
        }
    }

    /**
     * 显示属性编辑器
     */
    showPropertyEditor() {
        this.togglePanel('propertyPanel');
    }

    /**
     * 绑定属性控制事件
     */
    bindPropertyControls() {
        // 方向控制
        const directionRange = document.getElementById('direction');
        const directionValue = document.getElementById('directionValue');
        if (directionRange && directionValue) {
            directionRange.addEventListener('input', (e) => {
                directionValue.value = e.target.value;
                this.updateViewshedProperty('direction', parseFloat(e.target.value));
            });
            directionValue.addEventListener('input', (e) => {
                directionRange.value = e.target.value;
                this.updateViewshedProperty('direction', parseFloat(e.target.value));
            });
        }

        // 俯仰角控制
        const pitchRange = document.getElementById('pitch');
        const pitchValue = document.getElementById('pitchValue');
        if (pitchRange && pitchValue) {
            pitchRange.addEventListener('input', (e) => {
                pitchValue.value = e.target.value;
                this.updateViewshedProperty('pitch', parseFloat(e.target.value));
            });
            pitchValue.addEventListener('input', (e) => {
                pitchRange.value = e.target.value;
                this.updateViewshedProperty('pitch', parseFloat(e.target.value));
            });
        }

        // 距离控制
        const distanceRange = document.getElementById('distance');
        const distanceValue = document.getElementById('distanceValue');
        if (distanceRange && distanceValue) {
            distanceRange.addEventListener('input', (e) => {
                distanceValue.value = e.target.value;
                this.updateViewshedProperty('distance', parseFloat(e.target.value));
            });
            distanceValue.addEventListener('input', (e) => {
                distanceRange.value = e.target.value;
                this.updateViewshedProperty('distance', parseFloat(e.target.value));
            });
        }

        // 水平视场角控制
        const horizontalFovRange = document.getElementById('horizontalFov');
        const horizontalFovValue = document.getElementById('horizontalFovValue');
        if (horizontalFovRange && horizontalFovValue) {
            horizontalFovRange.addEventListener('input', (e) => {
                horizontalFovValue.value = e.target.value;
                this.updateViewshedProperty('horizontalFov', parseFloat(e.target.value));
            });
            horizontalFovValue.addEventListener('input', (e) => {
                horizontalFovRange.value = e.target.value;
                this.updateViewshedProperty('horizontalFov', parseFloat(e.target.value));
            });
        }

        // 垂直视场角控制
        const verticalFovRange = document.getElementById('verticalFov');
        const verticalFovValue = document.getElementById('verticalFovValue');
        if (verticalFovRange && verticalFovValue) {
            verticalFovRange.addEventListener('input', (e) => {
                verticalFovValue.value = e.target.value;
                this.updateViewshedProperty('verticalFov', parseFloat(e.target.value));
            });
            verticalFovValue.addEventListener('input', (e) => {
                verticalFovRange.value = e.target.value;
                this.updateViewshedProperty('verticalFov', parseFloat(e.target.value));
            });
        }

        // 颜色控制
        const visibleColor = document.getElementById('visibleColor');
        const invisibleColor = document.getElementById('invisibleColor');
        if (visibleColor) {
            visibleColor.addEventListener('change', (e) => {
                this.updateViewshedProperty('visibleColor', e.target.value);
            });
        }
        if (invisibleColor) {
            invisibleColor.addEventListener('change', (e) => {
                this.updateViewshedProperty('invisibleColor', e.target.value);
            });
        }
    }

    /**
     * 更新可视域属性
     */
    updateViewshedProperty(property, value) {
        if (this.digitalTwinAnalysis) {
            this.digitalTwinAnalysis.updateViewshedProperty(property, value);
        }
    }

    /**
     * 添加通视分析观察点
     */
    addSightlineViewPoint() {
        this.analysisMode = 'sightline-viewpoint';
        this.updateStatus('请点击地图设置观察点');
        if (this.digitalTwinAnalysis) {
            this.digitalTwinAnalysis.startAddViewPoint();
        } else {
            alert('分析模块未初始化');
        }
    }

    /**
     * 添加通视分析目标点
     */
    addSightlineTargetPoint() {
        this.analysisMode = 'sightline-target';
        this.updateStatus('请点击地图添加目标点');
        if (this.digitalTwinAnalysis) {
            this.digitalTwinAnalysis.startAddTargetPoint();
        } else {
            alert('分析模块未初始化');
        }
    }



    /**
     * 开始剖面分析
     */
    startClipAnalysis() {
        this.analysisMode = 'clip';
        this.performProfileAnalysis();
    }



    /**
     * 可视域分析
     */
    performViewshedAnalysis() {
        this.updateStatus('请点击设置观察点');
        
        // 确保handler正确初始化
        if (!this.handler) {
            this.handler = new SuperMap3D.ScreenSpaceEventHandler(this.scene.canvas);
        }
        
        // 清除之前的事件监听器
        this.handler.removeInputAction(SuperMap3D.ScreenSpaceEventType.LEFT_CLICK);
        
        this.handler.setInputAction((event) => {
            const position = this.viewer.camera.pickEllipsoid(event.position, this.scene.globe.ellipsoid);
            if (position) {
                this.digitalTwinAnalysis.performViewshedAnalysis(position);
                this.updateStatus('可视域分析完成');
                // 清除事件监听器
                this.handler.removeInputAction(SuperMap3D.ScreenSpaceEventType.LEFT_CLICK);
            }
        }, SuperMap3D.ScreenSpaceEventType.LEFT_CLICK);
    }

    /**
     * 通视分析
     */
    performSightlineAnalysis() {
        let startPoint = null;
        this.updateStatus('请点击设置起点');
        
        // 确保handler正确初始化
        if (!this.handler) {
            this.handler = new SuperMap3D.ScreenSpaceEventHandler(this.scene.canvas);
        }
        
        // 清除之前的事件监听器
        this.handler.removeInputAction(SuperMap3D.ScreenSpaceEventType.LEFT_CLICK);
        
        this.handler.setInputAction((event) => {
            const position = this.viewer.camera.pickEllipsoid(event.position, this.scene.globe.ellipsoid);
            if (position) {
                if (!startPoint) {
                    startPoint = position;
                    this.updateStatus('请点击设置终点');
                } else {
                    this.digitalTwinAnalysis.performSightlineAnalysis(startPoint, position);
                    this.updateStatus('通视分析完成');
                    // 清除事件监听器
                    this.handler.removeInputAction(SuperMap3D.ScreenSpaceEventType.LEFT_CLICK);
                    startPoint = null;
                }
            }
        }, SuperMap3D.ScreenSpaceEventType.LEFT_CLICK);
    }

    /**
     * 拾取模型表面位置
     * @param {SuperMap3D.Cartesian2} windowPosition 屏幕坐标
     * @returns {SuperMap3D.Cartesian3|null} 世界坐标位置
     */
    pickModelPosition(windowPosition) {
        try {
            // 首先尝试拾取3D模型对象
            const pickedObject = this.scene.pick(windowPosition);
            if (SuperMap3D.defined(pickedObject)) {
                // 使用pickPosition获取精确的模型表面位置
                const modelPosition = this.scene.pickPosition(windowPosition);
                if (modelPosition) {
                    console.log('✅ 拾取到模型表面位置:', modelPosition);
                    return modelPosition;
                }
            }
            
            // 如果没有拾取到模型，尝试拾取地形
            const terrainPosition = this.viewer.camera.pickEllipsoid(windowPosition, this.scene.globe.ellipsoid);
            if (terrainPosition) {
                console.log('📍 拾取到地形位置:', terrainPosition);
                return terrainPosition;
            }
            
            // 最后尝试使用射线与地球椭球面求交
            const ray = this.viewer.camera.getPickRay(windowPosition);
            if (ray) {
                const intersection = this.scene.globe.pick(ray, this.scene);
                if (intersection) {
                    console.log('🌍 通过射线拾取到位置:', intersection);
                    return intersection;
                }
            }
            
            console.warn('⚠️ 未能拾取到有效位置');
            return null;
        } catch (error) {
            console.error('❌ 位置拾取失败:', error);
            return null;
        }
    }









    /**
     * 剖面分析
     */
    performProfileAnalysis() {
        // 使用交互式分析管理器处理剖面分析
        if (this.digitalTwinAnalysis && this.digitalTwinAnalysis.interactiveManager) {
            this.digitalTwinAnalysis.interactiveManager.startInteraction('profile');
            this.updateStatus('请点击添加剖面线点，右键完成绘制');
        } else {
            // 兜底方案：使用原有的直接交互方式
            const positions = [];
            this.updateStatus('请点击添加剖面线点，双击结束');
            
            // 确保handler正确初始化
            if (!this.handler) {
                this.handler = new SuperMap3D.ScreenSpaceEventHandler(this.scene.canvas);
            }
            
            // 清除之前的事件监听器
            this.handler.removeInputAction(SuperMap3D.ScreenSpaceEventType.LEFT_CLICK);
            this.handler.removeInputAction(SuperMap3D.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
            
            this.handler.setInputAction((event) => {
                const position = this.pickModelPosition(event.position);
                if (position) {
                    positions.push(position);
                    this.updateStatus(`已添加第${positions.length}个点`);
                }
            }, SuperMap3D.ScreenSpaceEventType.LEFT_CLICK);
            
            this.handler.setInputAction((event) => {
                if (positions.length >= 2) {
                    this.digitalTwinAnalysis.performProfileAnalysis(positions);
                    this.updateStatus('剖面分析完成');
                    // 清除事件监听器
                    this.handler.removeInputAction(SuperMap3D.ScreenSpaceEventType.LEFT_CLICK);
                    this.handler.removeInputAction(SuperMap3D.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
                }
            }, SuperMap3D.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
        }
    }

    /**
     * 开挖分析
     */


    /**
     * 清除分析结果
     */
    clearAnalysis() {
        this.digitalTwinAnalysis.clearAllAnalysis();
        this.updateStatus('分析结果已清除');
        
        // 清除所有事件监听器
        if (this.handler) {
            this.handler.removeInputAction(SuperMap3D.ScreenSpaceEventType.LEFT_CLICK);
            this.handler.removeInputAction(SuperMap3D.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
        }
    }

    /**
     * 清除所有分析结果
     */
    clearAllAnalysis() {
        try {
            console.log('🧹 开始清除所有分析结果...');
            
            // 清除数字孪生分析结果
            if (this.digitalTwinAnalysis) {
                this.digitalTwinAnalysis.clearAllAnalysis();
                console.log('✅ 数字孪生分析结果已清除');
            }
            
            // 清除交互式分析管理器的临时实体
            if (this.digitalTwinAnalysis && this.digitalTwinAnalysis.interactiveManager) {
                this.digitalTwinAnalysis.interactiveManager.clearTempEntities();
                this.digitalTwinAnalysis.interactiveManager.stopInteraction();
                console.log('✅ 交互式分析临时实体已清除');
            }
            
            // 清除所有事件监听器
            if (this.handler) {
                this.handler.removeInputAction(SuperMap3D.ScreenSpaceEventType.LEFT_CLICK);
                this.handler.removeInputAction(SuperMap3D.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
            }
            
            console.log('✅ 所有分析结果已清除');
            this.updateStatus('所有分析结果已清除');
            this.showSuccessMessage('所有分析结果已清除');
            
        } catch (error) {
            console.error('❌ 清除所有分析结果失败:', error);
            this.updateStatus('清除分析结果失败');
            this.showErrorDialog('清除失败', '清除分析结果时发生错误：' + error.message);
        }
    }

    /**
     * 清除导航路径和相关标记
     */
    clearNavigation() {
        try {
            console.log('🧹 开始清除导航路径...');
            
            // 清除室内导航的路径和标记
            if (this.indoorNavigation) {
                this.indoorNavigation.clearRoute();
                this.indoorNavigation.stopNavigation();
                console.log('✅ 导航路径和标记已清除');
            }
            
            // 重置导航模式
            this.navigationMode = false;
            const setRouteBtn = document.getElementById('setRouteBtn');
            if (setRouteBtn) {
                setRouteBtn.textContent = '设置路径';
                setRouteBtn.className = 'btn btn-warning';
            }
            
            // 清空路径点数组
            this.routePoints = [];
            
            // 清空输入框并重置占位符
            const startPointInput = document.getElementById('startPoint');
            const endPointInput = document.getElementById('endPoint');
            if (startPointInput) {
                startPointInput.value = '';
                startPointInput.placeholder = '点击地图选择起点';
            }
            if (endPointInput) {
                endPointInput.value = '';
                endPointInput.placeholder = '点击地图选择终点';
            }
            
            // 重置按钮状态
            const calculateRouteBtn = document.getElementById('calculateRoute');
            const startWalkBtn = document.getElementById('startWalk');
            const stopWalkBtn = document.getElementById('stopWalk');
            
            if (calculateRouteBtn) calculateRouteBtn.disabled = false;
            if (startWalkBtn) startWalkBtn.disabled = false;
            if (stopWalkBtn) stopWalkBtn.disabled = false;
            
            console.log('✅ 导航相关数据已清除');
            this.updateStatus('导航路径已清除');
            this.showSuccessMessage('导航路径、起点和终点已全部清除');
            
        } catch (error) {
            console.error('❌ 清除导航路径失败:', error);
            this.updateStatus('清除导航路径失败');
            this.showErrorDialog('清除失败', '清除导航路径时发生错误：' + error.message);
        }
    }



    /**
     * 清除特定类型的分析结果
     */
    clearSpecificAnalysis(analysisType) {
        try {
            console.log(`🧹 开始清除${analysisType}分析结果...`);
            
            // 清除数字孪生分析中的特定类型分析结果
            if (this.digitalTwinAnalysis) {
                this.digitalTwinAnalysis.clearAnalysisResults(analysisType);
                console.log(`✅ ${analysisType}分析结果已清除`);
            }
            
            // 清除交互式分析管理器的临时实体
            if (this.digitalTwinAnalysis && this.digitalTwinAnalysis.interactiveManager) {
                this.digitalTwinAnalysis.interactiveManager.clearTempEntities();
                this.digitalTwinAnalysis.interactiveManager.stopInteraction();
                console.log('✅ 临时实体已清除');
            }
            
            // 清除事件监听器
            if (this.handler) {
                this.handler.removeInputAction(SuperMap3D.ScreenSpaceEventType.LEFT_CLICK);
                this.handler.removeInputAction(SuperMap3D.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
            }
            
            const analysisNames = {
                'profile': '剖面',
                'excavation': '开挖',
                'flood': '淹没',
                'crossSection': '断面',
                'viewshed': '可视域',
                'sightline': '通视',
                'shadow': '阴影',
                'skyline': '天际线'
            };
            
            const displayName = analysisNames[analysisType] || analysisType;
            console.log(`✅ ${displayName}分析结果已清除`);
            this.updateStatus(`${displayName}分析结果已清除`);
            this.showSuccessMessage(`${displayName}分析结果已清除`);
            
        } catch (error) {
            console.error(`❌ 清除${analysisType}分析结果失败:`, error);
            this.updateStatus('清除分析结果失败');
            this.showErrorDialog('清除失败', `清除${analysisType}分析结果时发生错误：` + error.message);
        }
    }

    /**
     * 开始阴影分析
     */
    startShadowAnalysis() {
        try {
            console.log('🌞 开始阴影分析...');
            
            // 获取分析参数
            const shadowDate = document.getElementById('shadowDate')?.value || new Date().toISOString().split('T')[0];
            const startTime = document.getElementById('shadowStartTime')?.value || '10';
            const endTime = document.getElementById('shadowEndTime')?.value || '14';
            const bottomHeight = document.getElementById('shadowBottomHeight')?.value || '20';
            const extrudeHeight = document.getElementById('shadowExtrudeHeight')?.value || '20';
            
            const options = {
                date: shadowDate,
                startTime: startTime,
                endTime: endTime,
                bottomHeight: bottomHeight,
                extrudeHeight: extrudeHeight,
                spacing: 10,
                timeInterval: 60
            };
            
            console.log('🌞 阴影分析参数:', options);
            
            if (this.digitalTwinAnalysis) {
                const success = this.digitalTwinAnalysis.performShadowAnalysis(options);
                if (success) {
                    this.analysisMode = 'shadow';
                    this.updateStatus('请在地图上绘制阴影分析区域');
                    this.showSuccessMessage('阴影分析已启动，请绘制分析区域');
                } else {
                    this.showErrorDialog('启动失败', '阴影分析启动失败，请检查参数设置');
                }
            } else {
                this.showErrorDialog('初始化失败', '分析模块未初始化');
            }
            
        } catch (error) {
            console.error('❌ 开始阴影分析失败:', error);
            this.showErrorDialog('分析失败', '开始阴影分析时发生错误：' + error.message);
        }
    }
    
    /**
     * 日照效果演示
     */
    performSunlightEffect() {
        try {
            console.log('☀️ 开始日照效果演示...');
            
            // 获取演示参数
            const shadowDate = document.getElementById('shadowDate')?.value || new Date().toISOString().split('T')[0];
            const startTime = document.getElementById('shadowStartTime')?.value || '10';
            const endTime = document.getElementById('shadowEndTime')?.value || '14';
            
            const options = {
                date: shadowDate,
                startTime: startTime,
                endTime: endTime
            };
            
            console.log('☀️ 日照效果参数:', options);
            
            if (this.digitalTwinAnalysis) {
                this.digitalTwinAnalysis.performSunlightEffect(options);
                this.updateStatus('日照效果演示进行中...');
                this.showSuccessMessage('日照效果演示已开始');
            } else {
                this.showErrorDialog('初始化失败', '分析模块未初始化');
            }
            
        } catch (error) {
            console.error('❌ 日照效果演示失败:', error);
            this.showErrorDialog('演示失败', '日照效果演示时发生错误：' + error.message);
        }
    }
    
    /**
     * 获取阴影率
     */
    getShadowRatio() {
        try {
            console.log('📍 开始获取阴影率...');
            
            if (this.digitalTwinAnalysis) {
                this.digitalTwinAnalysis.getShadowRatio((result) => {
                    if (result) {
                        const shadowRatioInfo = document.getElementById('shadowRatioInfo');
                        if (shadowRatioInfo) {
                            shadowRatioInfo.innerHTML = `
                                <div class="shadow-ratio-result">
                                    <h5>阴影率信息</h5>
                                    <p><strong>阴影率:</strong> ${(result.shadowRatio * 100).toFixed(2)}%</p>
                                    <p><strong>经度:</strong> ${result.longitude.toFixed(6)}°</p>
                                    <p><strong>纬度:</strong> ${result.latitude.toFixed(6)}°</p>
                                    <p><strong>高程:</strong> ${result.height.toFixed(2)}m</p>
                                </div>
                            `;
                        }
                        
                        this.updateStatus(`阴影率: ${(result.shadowRatio * 100).toFixed(2)}%`);
                        this.showSuccessMessage(`阴影率: ${(result.shadowRatio * 100).toFixed(2)}%`);
                    } else {
                        this.showErrorDialog('获取失败', '该位置无法获取阴影率信息');
                    }
                });
                
                this.updateStatus('请点击地图获取阴影率');
                this.showSuccessMessage('点击地图任意位置获取阴影率');
            } else {
                this.showErrorDialog('初始化失败', '分析模块未初始化');
            }
            
        } catch (error) {
            console.error('❌ 获取阴影率失败:', error);
            this.showErrorDialog('获取失败', '获取阴影率时发生错误：' + error.message);
        }
    }

    /**
     * 取消当前交互
     */
    cancelInteraction() {
        if (this.digitalTwinAnalysis) {
            this.digitalTwinAnalysis.stopInteraction();
            this.updateStatus('已取消当前交互操作');
        }
    }

    /**
     * 提取天际线
     */
    extractSkyline() {
        try {
            console.log('🏔️ 开始提取天际线...');
            
            if (!this.digitalTwinAnalysis) {
                this.showErrorDialog('初始化失败', '分析模块未初始化');
                return;
            }
            
            // 获取分析半径
            const radius = document.getElementById('skylineRadius')?.value || 10000;
            
            // 调用数字孪生分析模块的天际线提取方法
            const success = this.digitalTwinAnalysis.extractSkyline(parseInt(radius));
            
            if (success) {
                this.updateStatus('天际线提取完成');
                this.showSuccessMessage('天际线提取完成，可以进行二维天际线分析或绘制限高体');
            } else {
                this.showErrorDialog('提取失败', '天际线提取失败，请检查场景是否支持深度纹理');
            }
            
        } catch (error) {
            console.error('❌ 提取天际线失败:', error);
            this.showErrorDialog('提取失败', '提取天际线时发生错误：' + error.message);
        }
    }

    /**
     * 获取二维天际线
     */
    async getSkyline2D() {
        try {
            console.log('📊 开始获取二维天际线...');
            
            if (!this.digitalTwinAnalysis) {
                this.showErrorDialog('初始化失败', '分析模块未初始化');
                return;
            }
            
            // 获取二维天际线数据
            const skylineData = await this.digitalTwinAnalysis.getSkyline2DData();
            
            // 增强数据有效性检查
            if (!skylineData || !skylineData.x || !skylineData.y) {
                this.showErrorDialog('数据错误', '天际线数据无效，请先提取天际线');
                return;
            }
            
            if (!Array.isArray(skylineData.x) || !Array.isArray(skylineData.y)) {
                this.showErrorDialog('数据格式错误', '天际线数据格式不正确');
                return;
            }
            
            if (skylineData.x.length === 0 || skylineData.y.length === 0) {
                this.showErrorDialog('数据为空', '天际线数据为空，请重新提取天际线');
                return;
            }
            
            if (skylineData.x.length !== skylineData.y.length) {
                this.showErrorDialog('数据不匹配', 'X轴和Y轴数据长度不匹配');
                return;
            }
            
            // 检查是否有ECharts库
            if (typeof echarts === 'undefined') {
                console.warn('⚠️ ECharts库未加载，使用简单图表显示');
                this.showSimpleSkylineChart(skylineData);
                return;
            }
            
            // 使用ECharts绘制二维天际线
            const chartContainer = document.getElementById('skylineChart');
            if (!chartContainer) {
                this.showErrorDialog('显示失败', '图表容器未找到');
                return;
            }
            
            // 清除之前的图表实例
            const existingChart = echarts.getInstanceByDom(chartContainer);
            if (existingChart) {
                existingChart.dispose();
            }
            
            chartContainer.style.display = 'block';
            
            const myChart = echarts.init(chartContainer);
            
            // 优化的ECharts配置
            const option = {
                backgroundColor: {
                    type: 'linear',
                    x: 0,
                    y: 0,
                    x2: 1,
                    y2: 1,
                    colorStops: [{
                        offset: 0, color: 'rgba(25, 35, 45, 0.95)'
                    }, {
                        offset: 1, color: 'rgba(45, 65, 85, 0.95)'
                    }]
                },
                title: {
                    text: "二维天际线分析图表",
                    subtext: `数据点数: ${skylineData.x.length}`,
                    left: 'center',
                    top: '3%',
                    textStyle: {
                        color: '#ffffff',
                        fontSize: 18,
                        fontWeight: 'bold'
                    },
                    subtextStyle: {
                        color: '#cccccc',
                        fontSize: 12
                    }
                },
                tooltip: {
                    trigger: "axis",
                    backgroundColor: 'rgba(0, 0, 0, 0.85)',
                    borderColor: '#00d4ff',
                    borderWidth: 2,
                    borderRadius: 8,
                    textStyle: {
                        color: '#ffffff',
                        fontSize: 13
                    },
                    formatter: function(params) {
                        const angle = parseFloat(params[0].name).toFixed(1);
                        const height = (params[0].value * 100).toFixed(2);
                        return `<div style="padding: 5px;">
                                  <div style="color: #00d4ff; font-weight: bold;">天际线数据</div>
                                  <div>角度: ${angle}°</div>
                                  <div>相对高度: ${height}%</div>
                                </div>`;
                    },
                    axisPointer: {
                        type: 'cross',
                        crossStyle: {
                            color: '#00d4ff'
                        }
                    }
                },
                grid: {
                    left: '8%',
                    right: '5%',
                    bottom: '12%',
                    top: '18%',
                    containLabel: true
                },
                xAxis: {
                    type: "category",
                    boundaryGap: false,
                    data: skylineData.x.map(x => parseFloat(x).toFixed(1)),
                    axisLabel: {
                        color: '#ffffff',
                        fontSize: 11,
                        interval: Math.max(1, Math.floor(skylineData.x.length / 10)),
                        rotate: 0
                    },
                    axisLine: {
                        lineStyle: {
                            color: '#ffffff',
                            width: 1
                        }
                    },
                    axisTick: {
                        lineStyle: {
                            color: '#ffffff'
                        }
                    },
                    splitLine: {
                        show: true,
                        lineStyle: {
                            color: 'rgba(255, 255, 255, 0.1)',
                            type: 'dashed'
                        }
                    },
                    name: '角度 (°)',
                    nameLocation: 'middle',
                    nameGap: 25,
                    nameTextStyle: {
                        color: '#ffffff',
                        fontSize: 13,
                        fontWeight: 'bold'
                    }
                },
                yAxis: {
                    type: "value",
                    min: 0,
                    max: function(value) {
                        return Math.max(1, Math.ceil(value.max * 1.1 * 10) / 10);
                    },
                    axisLabel: {
                        color: '#ffffff',
                        fontSize: 11,
                        formatter: function(value) {
                            return (value * 100).toFixed(0) + '%';
                        }
                    },
                    axisLine: {
                        lineStyle: {
                            color: '#ffffff',
                            width: 1
                        }
                    },
                    axisTick: {
                        lineStyle: {
                            color: '#ffffff'
                        }
                    },
                    splitLine: {
                        lineStyle: {
                            color: 'rgba(255, 255, 255, 0.15)',
                            type: 'solid'
                        }
                    },
                    name: '相对高度',
                    nameLocation: 'middle',
                    nameGap: 40,
                    nameTextStyle: {
                        color: '#ffffff',
                        fontSize: 13,
                        fontWeight: 'bold'
                    }
                },
                series: [{
                    name: "天际线",
                    type: "line",
                    data: skylineData.y,
                    smooth: 0.3,
                    lineStyle: {
                        color: '#00d4ff',
                        width: 3,
                        shadowColor: 'rgba(0, 212, 255, 0.5)',
                        shadowBlur: 10
                    },
                    areaStyle: {
                        color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [{
                                offset: 0, color: 'rgba(0, 212, 255, 0.7)'
                            }, {
                                offset: 0.5, color: 'rgba(0, 212, 255, 0.3)'
                            }, {
                                offset: 1, color: 'rgba(0, 212, 255, 0.05)'
                            }]
                        }
                    },
                    symbol: 'circle',
                    symbolSize: 4,
                    itemStyle: {
                        color: '#00d4ff',
                        borderColor: '#ffffff',
                        borderWidth: 1
                    },
                    emphasis: {
                        itemStyle: {
                            color: '#ffffff',
                            borderColor: '#00d4ff',
                            borderWidth: 2,
                            shadowColor: 'rgba(0, 212, 255, 0.8)',
                            shadowBlur: 15
                        }
                    }
                }],
                animation: true,
                animationDuration: 1500,
                animationEasing: 'cubicOut'
            };
            
            myChart.setOption(option);
            
            // 保存图表实例以便后续清理
            if (!this.skylineCharts) {
                this.skylineCharts = [];
            }
            this.skylineCharts.push(myChart);
            
            // 添加窗口大小变化监听
            const resizeHandler = () => {
                if (myChart && !myChart.isDisposed()) {
                    myChart.resize();
                }
            };
            window.addEventListener('resize', resizeHandler);
            
            // 保存resize处理器以便清理
            myChart._resizeHandler = resizeHandler;
            
            this.updateStatus('二维天际线图表已生成');
            this.showSuccessMessage(`二维天际线图表已生成，包含 ${skylineData.x.length} 个数据点，可通过鼠标交互查看详细数据`);
            
        } catch (error) {
            console.error('❌ 获取二维天际线失败:', error);
            this.showErrorDialog('获取失败', '获取二维天际线时发生错误：' + error.message);
        }
    }

    /**
     * 显示简单的天际线图表（当ECharts不可用时）
     */
    showSimpleSkylineChart(skylineData) {
        const chartContainer = document.getElementById('skylineChart');
        if (!chartContainer) return;
        
        chartContainer.style.display = 'block';
        chartContainer.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #333;">
                <h5>二维天际线数据</h5>
                <p>X轴数据点数: ${skylineData.x.length}</p>
                <p>Y轴数据点数: ${skylineData.y.length}</p>
                <p>数据范围: ${Math.min(...skylineData.y).toFixed(3)} - ${Math.max(...skylineData.y).toFixed(3)}</p>
                <small>注：需要ECharts库来显示完整图表</small>
            </div>
        `;
    }

    /**
     * 绘制限高体
     */
    setLimitBody() {
        try {
            console.log('🏗️ 开始绘制限高体...');
            
            if (!this.digitalTwinAnalysis) {
                this.showErrorDialog('初始化失败', '分析模块未初始化');
                return;
            }
            
            // 调用数字孪生分析模块的限高体绘制方法
            this.digitalTwinAnalysis.drawLimitBody();
            
            this.updateStatus('请在地图上绘制多边形作为限高体');
            this.showSuccessMessage('请在地图上绘制多边形，完成后将自动创建限高体');
            
        } catch (error) {
            console.error('❌ 绘制限高体失败:', error);
            this.showErrorDialog('绘制失败', '绘制限高体时发生错误：' + error.message);
        }
    }

    /**
     * 获取天际线拉伸闭合体
     */
    getSkylineArea() {
        try {
            console.log('🔺 开始创建天际线拉伸闭合体...');
            
            if (!this.digitalTwinAnalysis) {
                this.showErrorDialog('初始化失败', '分析模块未初始化');
                return;
            }
            
            // 调用数字孪生分析模块的拉伸闭合体方法
            const entity = this.digitalTwinAnalysis.getSkylineArea();
            
            if (entity) {
                this.updateStatus('天际线拉伸闭合体创建完成');
                this.showSuccessMessage('天际线拉伸闭合体创建完成');
            } else {
                this.showErrorDialog('创建失败', '天际线拉伸闭合体创建失败，请先提取天际线');
            }
            
        } catch (error) {
            console.error('❌ 创建天际线拉伸闭合体失败:', error);
            this.showErrorDialog('创建失败', '创建天际线拉伸闭合体时发生错误：' + error.message);
        }
    }

    /**
     * 清除天际线分析
     */
    clearSkylineAnalysis() {
        try {
            console.log('🧹 开始清除天际线分析...');
            
            if (!this.digitalTwinAnalysis) {
                this.showErrorDialog('初始化失败', '分析模块未初始化');
                return;
            }
            
            // 清除ECharts图表实例和相关事件监听器
            if (this.skylineCharts && this.skylineCharts.length > 0) {
                this.skylineCharts.forEach(chart => {
                    if (chart && !chart.isDisposed()) {
                        // 移除resize事件监听器
                        if (chart._resizeHandler) {
                            window.removeEventListener('resize', chart._resizeHandler);
                            delete chart._resizeHandler;
                        }
                        // 清除图表事件监听器
                        chart.off();
                        // 销毁图表实例
                        chart.dispose();
                    }
                });
                this.skylineCharts = [];
                console.log('✅ ECharts图表实例已清除');
            }
            
            // 清空并隐藏图表容器
            const chartContainer = document.getElementById('skylineChart');
            if (chartContainer) {
                // 清除所有子元素
                while (chartContainer.firstChild) {
                    chartContainer.removeChild(chartContainer.firstChild);
                }
                chartContainer.innerHTML = '';
                chartContainer.style.display = 'none';
                console.log('✅ 图表容器已清空并隐藏');
            }
            
            // 清除可能存在的其他图表容器
            const allChartContainers = document.querySelectorAll('[id*="skyline"], [class*="skyline"]');
            allChartContainers.forEach(container => {
                if (container.id !== 'skylineChart') {
                    const chartInstance = echarts && echarts.getInstanceByDom(container);
                    if (chartInstance) {
                        chartInstance.dispose();
                    }
                    container.innerHTML = '';
                    container.style.display = 'none';
                }
            });
            
            // 调用数字孪生分析模块的清除方法
            this.digitalTwinAnalysis.clearSkylineAnalysis();
            
            // 清除特定分析类型的结果
            this.digitalTwinAnalysis.clearAnalysisResults('skyline');
            
            // 清除可能的全局变量
            if (window.skylineData) {
                delete window.skylineData;
            }
            if (window.skylineCharts) {
                delete window.skylineCharts;
            }
            
            // 隐藏天际线面板
            const skylinePanel = document.getElementById('skylinePanel');
            if (skylinePanel) {
                skylinePanel.style.display = 'none';
            }
            
            // 清除状态
            this.updateStatus('天际线分析已清除');
            this.showSuccessMessage('天际线分析已完全清除，包括所有图表实例、事件监听器和相关数据');
            
            console.log('🎉 天际线分析清除完成');
            
        } catch (error) {
            console.error('❌ 清除天际线分析失败:', error);
            this.showErrorDialog('清除失败', '清除天际线分析时发生错误：' + error.message);
        }
    }

    /**
     * 执行地形开挖
     */


    /**
     * 更新状态信息
     */
    updateStatus(message) {
        const statusElement = document.getElementById('statusMessage');
        if (statusElement) {
            statusElement.textContent = message;
        }
        console.log(message);
    }

    /**
     * 显示加载进度
     */
    showLoadingProgress(message) {
        const loadingDiv = document.getElementById('loadingbar') || document.createElement('div');
        loadingDiv.id = 'loadingbar';
        loadingDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px;
            border-radius: 8px;
            z-index: 10001;
            text-align: center;
        `;
        loadingDiv.innerHTML = `
            <div>${message}</div>
            <div style="margin-top: 10px;">
                <div style="width: 200px; height: 4px; background: rgba(255,255,255,0.3); border-radius: 2px;">
                    <div style="width: 0%; height: 100%; background: #007bff; border-radius: 2px; animation: loading 2s infinite;"></div>
                </div>
            </div>
        `;
        
        if (!document.getElementById('loadingbar')) {
            document.body.appendChild(loadingDiv);
        }
        loadingDiv.style.display = 'block';
    }

    /**
     * 隐藏加载进度
     */
    hideLoadingProgress() {
        const loadingDiv = document.getElementById('loadingbar');
        if (loadingDiv) {
            loadingDiv.style.display = 'none';
        }
    }

    /**
     * 显示错误对话框
     */
    showErrorDialog(title, message) {
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(220, 53, 69, 0.9);
            color: white;
            padding: 20px;
            border-radius: 8px;
            z-index: 10002;
            max-width: 400px;
            text-align: center;
        `;
        
        dialog.innerHTML = `
            <h4>${title}</h4>
            <p>${message}</p>
            <button id="closeError" class="btn btn-light" style="margin-top: 10px;">确定</button>
        `;
        
        document.body.appendChild(dialog);
        
        document.getElementById('closeError').addEventListener('click', () => {
            document.body.removeChild(dialog);
        });
        
        // 3秒后自动关闭
        setTimeout(() => {
            if (document.body.contains(dialog)) {
                document.body.removeChild(dialog);
            }
        }, 3000);
    }

    /**
     * 显示成功消息
     */
    showSuccessMessage(message) {
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(40, 167, 69, 0.9);
            color: white;
            padding: 15px;
            border-radius: 8px;
            z-index: 10002;
            max-width: 300px;
        `;
        
        dialog.innerHTML = `<div>${message}</div>`;
        document.body.appendChild(dialog);
        
        // 2秒后自动关闭
        setTimeout(() => {
            if (document.body.contains(dialog)) {
                document.body.removeChild(dialog);
            }
        }, 2000);
    }

    /**
     * 调整光照
     */
    adjustLighting() {
        const lightSource = this.scene.lightSource;
        
        // 切换光照模式
        if (lightSource.ambientLightColor.red > 0.5) {
            lightSource.ambientLightColor = SuperMap3D.Color.fromArray(EFFECT_CONFIG.LIGHTING.AMBIENT_LIGHT.NIGHT);
        } else {
            lightSource.ambientLightColor = SuperMap3D.Color.fromArray(EFFECT_CONFIG.LIGHTING.AMBIENT_LIGHT.DAY);
        }
    }



    /**
     * 切换泛光效果
     */
    toggleBloom() {
        if (this.scene.postProcessStages) {
            const bloom = this.scene.postProcessStages.bloom;
            bloom.enabled = !bloom.enabled;
        }
    }



    /**
     * 鼠标左键点击事件
     */
    onLeftClick(event) {
        try {
            console.log('🖱️ 鼠标左键点击事件触发');
            
            if (this.navigationMode) {
                console.log('🧭 导航模式下处理点击事件');
                
                // 导航模式下设置路径点
                let cartesian = null;
                
                // 首先尝试拾取模型上的点
                const pickedObject = this.scene.pick(event.position);
                if (pickedObject) {
                    console.log('✅ 拾取到模型对象');
                    // 使用drillPick获取更精确的位置
                    const pickedPosition = this.scene.pickPosition(event.position);
                    if (pickedPosition) {
                        cartesian = pickedPosition;
                        console.log('✅ 获取到模型表面坐标:', cartesian);
                    }
                }
                
                // 如果没有拾取到模型，尝试拾取地面
                if (!cartesian) {
                    console.log('🌍 尝试拾取地面坐标');
                    cartesian = this.viewer.camera.pickEllipsoid(event.position, this.scene.globe.ellipsoid);
                    if (cartesian) {
                        console.log('✅ 获取到地面坐标:', cartesian);
                    }
                }
                
                // 如果还是没有坐标，使用屏幕坐标转换
                if (!cartesian) {
                    console.log('📐 使用屏幕坐标转换');
                    const ray = this.viewer.camera.getPickRay(event.position);
                    if (ray) {
                        cartesian = this.scene.globe.pick(ray, this.scene);
                        if (cartesian) {
                            console.log('✅ 通过射线获取到坐标:', cartesian);
                        }
                    }
                }
                
                if (cartesian) {
                    this.routePoints.push(cartesian);
                    
                    // 使用室内导航模块添加路径点
                    if (this.indoorNavigation) {
                        this.indoorNavigation.addRoutePoint(cartesian);
                    }
                    
                    if (this.routePoints.length === 1) {
                        const startPointInput = document.getElementById('startPoint');
                        if (startPointInput) {
                            startPointInput.value = '起点已设置';
                        }
                        console.log('✅ 起点已设置');
                        this.updateStatus('请点击设置终点');
                    } else if (this.routePoints.length === 2) {
                        const endPointInput = document.getElementById('endPoint');
                        if (endPointInput) {
                            endPointInput.value = '终点已设置';
                        }
                        
                        // 自动退出导航模式
                        this.navigationMode = false;
                        const setRouteBtn = document.getElementById('setRouteBtn');
                        if (setRouteBtn) {
                            setRouteBtn.textContent = '设置路径';
                            setRouteBtn.className = 'btn btn-warning';
                        }
                        
                        console.log('✅ 终点已设置，路径设置完成');
                        this.updateStatus('路径设置完成，可以计算路径了');
                    }
                } else {
                    console.warn('⚠️ 无法获取点击位置的坐标');
                    this.updateStatus('请点击模型表面或有效的地面位置');
                }
            } else {
                // 非导航模式下显示对象信息
                const pickedObject = this.scene.pick(event.position);
                if (pickedObject) {
                    console.log('📋 显示对象信息');
                    this.showObjectInfo(pickedObject);
                }
            }
        } catch (error) {
            console.error('❌ 鼠标点击事件处理失败:', error);
        }
    }

    /**
     * 鼠标移动事件
     */
    onMouseMove(event) {
        // 更新坐标显示
        const cartesian = this.viewer.camera.pickEllipsoid(event.endPosition, this.scene.globe.ellipsoid);
        if (cartesian) {
            const cartographic = SuperMap3D.Cartographic.fromCartesian(cartesian);
            const longitude = SuperMap3D.Math.toDegrees(cartographic.longitude).toFixed(6);
            const latitude = SuperMap3D.Math.toDegrees(cartographic.latitude).toFixed(6);
            const height = cartographic.height.toFixed(2);
            
            document.getElementById('coordinates').textContent = 
                `坐标: ${longitude}, ${latitude}, ${height}`;
        }
    }

    /**
     * 显示对象信息
     */
    showObjectInfo(pickedObject) {
        const infoPanel = document.getElementById('infoPanel');
        const infoContent = document.getElementById('objectInfo');
        
        // 获取对象属性
        const properties = pickedObject.primitive.properties || {};
        
        let infoHtml = '<h5>对象属性</h5>';
        for (const [key, value] of Object.entries(properties)) {
            infoHtml += `<p><strong>${key}:</strong> ${value}</p>`;
        }
        
        infoContent.innerHTML = infoHtml;
        infoPanel.style.display = 'block';
    }

    /**
     * 更新状态栏
     */
    updateStatusBar() {
        const camera = this.viewer.camera;
        const position = camera.position;
        const heading = SuperMap3D.Math.toDegrees(camera.heading).toFixed(1);
        const pitch = SuperMap3D.Math.toDegrees(camera.pitch).toFixed(1);
        const roll = SuperMap3D.Math.toDegrees(camera.roll).toFixed(1);
        
        document.getElementById('cameraInfo').textContent = 
            `相机: H:${heading}° P:${pitch}° R:${roll}°`;
        
        // 更新FPS
        const fps = this.scene.frameState ? this.scene.frameState.frameNumber : 0;
        document.getElementById('fps').textContent = `FPS: ${fps}`;
    }

    /**
     * 启动渲染循环
     */
    startRenderLoop() {
        this.viewer.clock.onTick.addEventListener(() => {
            // 渲染循环中的自定义逻辑
        });
    }

    /**
     * 显示批量加载进度对话框
     */
    showBatchLoadingProgress(totalFiles) {
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            padding: 30px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            z-index: 10000;
            color: white;
            min-width: 400px;
            text-align: center;
        `;
        
        dialog.innerHTML = `
            <h3 style="margin-bottom: 20px;">批量加载模型</h3>
            <div class="progress-container" style="margin: 20px 0;">
                <div class="progress-bar" style="width: 100%; height: 20px; background: rgba(255,255,255,0.2); border-radius: 10px; overflow: hidden;">
                    <div class="progress-fill" style="width: 0%; height: 100%; background: linear-gradient(90deg, #4CAF50, #45a049); transition: width 0.3s ease;"></div>
                </div>
                <div class="progress-text" style="margin-top: 10px; font-size: 14px;">
                    准备加载 ${totalFiles} 个文件...
                </div>
                <div class="current-file" style="margin-top: 5px; font-size: 12px; color: #ccc;">
                    等待开始...
                </div>
            </div>
            <button class="cancel-batch-btn btn btn-secondary" style="margin-top: 20px;">取消加载</button>
        `;
        
        document.body.appendChild(dialog);
        
        // 绑定取消按钮事件
        dialog.querySelector('.cancel-batch-btn').addEventListener('click', () => {
            this.cancelBatchLoading = true;
            this.closeBatchLoadingProgress(dialog);
        });
        
        return dialog;
    }

    /**
     * 更新批量加载进度
     */
    updateBatchProgress(dialog, current, total, currentFile) {
        const progressFill = dialog.querySelector('.progress-fill');
        const progressText = dialog.querySelector('.progress-text');
        const currentFileText = dialog.querySelector('.current-file');
        
        const percentage = Math.round((current / total) * 100);
        
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `正在加载: ${current}/${total} (${percentage}%)`;
        currentFileText.textContent = currentFile;
    }

    /**
     * 关闭批量加载进度对话框
     */
    closeBatchLoadingProgress(dialog) {
        if (document.body.contains(dialog)) {
            document.body.removeChild(dialog);
        }
    }

    /**
     * 显示批量加载结果
     */
    showBatchLoadingResult(loadedFiles, failedFiles, totalFiles) {
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            padding: 20px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            z-index: 10000;
            color: white;
            max-width: 500px;
            max-height: 400px;
            overflow-y: auto;
        `;
        
        let resultHtml = `
            <h3 style="margin-bottom: 20px;">批量加载完成</h3>
            <div style="margin: 15px 0;">
                <p><strong>总文件数:</strong> ${totalFiles}</p>
                <p style="color: #4CAF50;"><strong>成功加载:</strong> ${loadedFiles}</p>
                <p style="color: #f44336;"><strong>加载失败:</strong> ${failedFiles.length}</p>
            </div>
        `;
        
        if (failedFiles.length > 0) {
            resultHtml += `
                <div style="margin-top: 20px;">
                    <h4>失败文件列表:</h4>
                    <div style="max-height: 150px; overflow-y: auto; background: rgba(255,255,255,0.1); padding: 10px; border-radius: 4px;">
                        ${failedFiles.map(file => `
                            <div style="margin: 5px 0; font-size: 12px;">
                                <strong>${file.name}</strong><br>
                                <span style="color: #ffcdd2;">${file.error}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        resultHtml += `
            <div style="text-align: center; margin-top: 20px;">
                <button class="close-result-btn btn btn-primary">确定</button>
            </div>
        `;
        
        dialog.innerHTML = resultHtml;
        document.body.appendChild(dialog);
        
        // 绑定关闭按钮事件
        dialog.querySelector('.close-result-btn').addEventListener('click', () => {
            document.body.removeChild(dialog);
        });
    }

    /**
     * 批量加载中的S3M文件加载
     */
    async loadS3MFileInBatch(fileUrl, fileName, index) {
        try {
            console.log(`🔄 开始加载S3M文件: ${fileName}, URL: ${fileUrl}`);
            
            // 对于本地S3M文件，我们需要使用不同的加载方式
            // SuperMap3D的scene.open()主要用于在线服务，对于本地文件需要特殊处理
            
            // 方法1: 尝试使用addS3MTilesLayerByScp方法（如果文件是scp配置）
            if (fileName.toLowerCase().endsWith('.scp') || fileName.toLowerCase().includes('config')) {
                return await this.loadS3MConfigFile(fileUrl, fileName);
            }
            
            // 方法2: 对于.s3m文件，尝试作为S3M Tiles加载
            return await this.loadS3MAsEntity(fileUrl, fileName, index);
            
        } catch (error) {
            console.error(`❌ S3M文件加载失败: ${fileName}`, error);
            throw new Error(`S3M文件加载失败: ${error.message}`);
        }
    }

    /**
     * 加载S3M配置文件
     */
    async loadS3MConfigFile(fileUrl, fileName) {
        return new Promise((resolve, reject) => {
            try {
                const promise = this.scene.addS3MTilesLayerByScp(fileUrl, {
                    name: fileName.replace(/\.[^/.]+$/, ""), // 移除文件扩展名
                });
                
                SuperMap3D.when(promise, (layer) => {
                    console.log(`✅ S3M配置文件加载成功: ${fileName}`, layer);
                    
                    // 将图层添加到总图层列表
                    if (!this.layers) this.layers = [];
                    const layerInfo = {
                        name: fileName.replace(/\.[^/.]+$/, ""),
                        type: 'S3M',
                        layer: layer,
                        tileset: layer,
                        visible: true,
                        url: fileUrl
                    };
                    this.layers.push(layerInfo);
                    
                    // 设置第一个加载的模型为当前模型
                    if (!this.currentModel) {
                        this.currentModel = layer;
                    }
                    
                    resolve([layer]);
                }, (error) => {
                    console.error(`❌ S3M配置文件加载失败: ${fileName}`, error);
                    reject(new Error(`S3M配置文件加载失败: ${error.message}`));
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 将S3M文件作为3D Tiles图层加载
     */
    async loadS3MAsEntity(fileUrl, fileName, index) {
        try {
            console.log(`🔄 尝试将S3M文件作为3D Tiles图层加载: ${fileName}`);
            
            // S3M文件应该使用3D Tiles方式加载，而不是作为模型实体
            return new Promise((resolve, reject) => {
                try {
                    // 尝试使用addS3MTilesLayerByScp方法加载
                    const promise = this.scene.addS3MTilesLayerByScp(fileUrl, {
                        name: fileName.replace(/\.[^/.]+$/, ""), // 移除文件扩展名
                        cacheKey: `s3m_${Date.now()}_${index}` // 使用唯一的缓存键
                    });
                    
                    SuperMap3D.when(promise, (layer) => {
                        console.log(`✅ S3M文件作为3D Tiles图层加载成功: ${fileName}`, layer);
                        
                        // 将图层添加到总图层列表
                        if (!this.layers) this.layers = [];
                        const layerInfo = {
                            name: fileName.replace(/\.[^/.]+$/, ""),
                            type: 'S3M',
                            layer: layer,
                            tileset: layer,
                            visible: true,
                            url: fileUrl
                        };
                        this.layers.push(layerInfo);
                        
                        // 设置图层可见性
                        if (layer) {
                            layer.visible = true;
                            
                            // 如果图层有边界球，记录用于后续飞行
                            if (layer.boundingSphere) {
                                console.log(`📍 S3M图层边界球信息:`, layer.boundingSphere);
                            }
                        }
                        
                        resolve(layer);
                    }, (error) => {
                        console.error(`❌ S3M文件作为3D Tiles图层加载失败: ${fileName}`, error);
                        
                        // 如果3D Tiles加载失败，尝试作为primitive加载
                        this.loadS3MAsPrimitive(fileUrl, fileName, index)
                            .then(resolve)
                            .catch(reject);
                    });
                    
                } catch (error) {
                    console.error(`❌ S3M文件加载过程中出错: ${fileName}`, error);
                    
                    // 如果所有方法都失败，尝试作为primitive加载
                    this.loadS3MAsPrimitive(fileUrl, fileName, index)
                        .then(resolve)
                        .catch(reject);
                }
            });
            
        } catch (error) {
            console.error(`❌ S3M文件加载失败: ${fileName}`, error);
            throw new Error(`S3M文件加载失败: ${error.message}`);
        }
    }

    /**
     * 将S3M文件作为Primitive加载（备用方法）
     */
    async loadS3MAsPrimitive(fileUrl, fileName, index) {
        try {
            console.log(`🔄 尝试将S3M文件作为Primitive加载: ${fileName}`);
            
            // 创建一个3D Tiles集合
            const tileset = new SuperMap3D.SuperMap3DTileset({
                url: fileUrl,
                maximumScreenSpaceError: 16,
                maximumNumberOfLoadedTiles: 1000
            });
            
            // 添加到场景中
            const primitive = this.scene.primitives.add(tileset);
            
            console.log(`✅ S3M文件作为Primitive加载成功: ${fileName}`, primitive);
            
            // 存储到图层列表中
            if (!this.layers) this.layers = [];
            const layerInfo = {
                name: fileName.replace(/\.[^/.]+$/, ""),
                type: 'S3M',
                primitive: primitive,
                tileset: primitive,
                visible: true,
                url: fileUrl
            };
            this.layers.push(layerInfo);
            
            return primitive;
            
        } catch (error) {
            console.error(`❌ S3M文件作为Primitive加载也失败: ${fileName}`, error);
            throw new Error(`S3M文件无法加载，可能文件格式不正确或需要配置文件: ${error.message}`);
        }
    }



    /**
     * 批量加载中的GLTF/GLB文件加载
     */
    async loadGLTFFileInBatch(fileUrl, fileName, offsetX, offsetY) {
        try {
            const entity = this.viewer.entities.add({
                name: fileName,
                position: SuperMap3D.Cartesian3.fromDegrees(116.3 + offsetX, 39.9 + offsetY, 0),
                model: {
                    uri: fileUrl,
                    scale: 1.0,
                    minimumPixelSize: 128,  // 恢复到128，防止模型缩小时消失
                    maximumScale: 20000     // 恢复到20000
                }
            });
            
            console.log(`批量GLTF/GLB文件加载成功: ${fileName}`, entity);
            
            // 添加图层信息到layers数组
            const layerInfo = {
                name: fileName,
                type: 'gltf',
                entity: entity,
                visible: true,
                url: fileUrl
            };
            this.layers.push(layerInfo);
            console.log(`✅ 图层信息已添加: ${fileName}`, layerInfo);
            
            // 存储实体到数组中，用于后续飞行
            if (!this.loadedEntities) {
                this.loadedEntities = [];
            }
            this.loadedEntities.push(entity);
            
            return entity;
        } catch (error) {
            throw new Error(`GLTF/GLB文件加载失败: ${error.message}`);
        }
    }

    /**
     * 批量加载中的OBJ文件加载
     */
    async loadOBJFileInBatch(fileUrl, fileName, offsetX, offsetY) {
        try {
            const entity = this.viewer.entities.add({
                name: fileName,
                position: SuperMap3D.Cartesian3.fromDegrees(116.3 + offsetX, 39.9 + offsetY, 0),
                model: {
                    uri: fileUrl,
                    scale: 1.0
                }
            });
            
            console.log(`批量OBJ文件加载成功: ${fileName}`, entity);
            
            // 添加图层信息到layers数组
            const layerInfo = {
                name: fileName,
                type: 'obj',
                entity: entity,
                visible: true,
                url: fileUrl
            };
            this.layers.push(layerInfo);
            console.log(`✅ 图层信息已添加: ${fileName}`, layerInfo);
            
            return entity;
        } catch (error) {
            throw new Error(`OBJ文件加载失败: ${error.message}`);
        }
    }

    /**
     * 批量加载中的通用格式文件加载
     */
    async loadGenericFileInBatch(fileUrl, fileName, fileExtension, offsetX, offsetY) {
        try {
            const entity = this.viewer.entities.add({
                name: fileName,
                position: SuperMap3D.Cartesian3.fromDegrees(116.3 + offsetX, 39.9 + offsetY, 0),
                model: {
                    uri: fileUrl,
                    scale: 1.0
                }
            });
            
            console.log(`批量${fileExtension.toUpperCase()}文件加载成功: ${fileName}`, entity);
            
            // 添加图层信息到layers数组
            const layerInfo = {
                name: fileName,
                type: fileExtension.toLowerCase(),
                entity: entity,
                visible: true,
                url: fileUrl
            };
            this.layers.push(layerInfo);
            console.log(`✅ 图层信息已添加: ${fileName}`, layerInfo);
            
            return entity;
        } catch (error) {
            throw new Error(`${fileExtension.toUpperCase()}文件加载失败: ${error.message}`);
        }
    }

    /**
     * 飞行到所有模型
     */
    flyToAllModels() {
        try {
            console.log('🚁 开始飞行到所有模型...');
            
            // 如果有S3M图层，飞行到第一个图层
            if (this.layers && this.layers.length > 0 && this.layers[0].boundingSphere) {
                console.log('🎯 飞行到S3M图层');
                this.viewer.camera.flyToBoundingSphere(this.layers[0].boundingSphere, {
                    duration: 2.0
                });
                return;
            } 
            
            // 如果有加载的实体，飞行到所有实体
            if (this.viewer.entities.values.length > 0) {
                console.log(`🎯 飞行到 ${this.viewer.entities.values.length} 个实体`);
                
                // 等待一小段时间确保模型完全加载
                setTimeout(() => {
                    try {
                        // 计算所有实体的边界球
                        const entities = this.viewer.entities.values;
                        if (entities.length > 0) {
                            // 使用SuperMap3D的flyTo方法，不使用链式调用
                            this.viewer.flyTo(entities, {
                                duration: 3.0,
                                offset: new SuperMap3D.HeadingPitchRange(0, SuperMap3D.Math.toRadians(-30), 500)
                            });
                            
                            // 设置飞行完成的回调
                            setTimeout(() => {
                                console.log('✅ 飞行到模型完成');
                                // 确保相机控制器启用
                                this.enableCameraControls();
                            }, 3500);
                        }
                    } catch (flyError) {
                        console.error('❌ 飞行到模型失败:', flyError);
                        this.setFallbackCameraView();
                    }
                }, 500);
                return;
            }
            
            // 如果没有模型，设置默认视角
            console.log('⚠️ 没有找到模型，设置默认视角');
            this.setFallbackCameraView();
            
        } catch (error) {
            console.error('❌ 飞行到模型失败:', error);
            this.setFallbackCameraView();
        }
    }

    /**
     * 设置备用相机视角
     */
    setFallbackCameraView() {
        try {
            console.log('🔄 使用备用飞行方案...');
            this.viewer.camera.setView({
                destination: SuperMap3D.Cartesian3.fromDegrees(116.3, 39.9, 1000),
                orientation: {
                    heading: 0.0,
                    pitch: SuperMap3D.Math.toRadians(-30),
                    roll: 0.0
                }
            });
            
            // 确保相机控制器启用
            this.enableCameraControls();
            console.log('✅ 备用相机视角设置完成');
        } catch (finalError) {
            console.error('❌ 备用飞行方案也失败:', finalError);
        }
    }

    /**
     * 启用相机控制器
     */
    enableCameraControls() {
        try {
            if (this.viewer && this.viewer.scene && this.viewer.scene.screenSpaceCameraController) {
                const controller = this.viewer.scene.screenSpaceCameraController;
                controller.enableRotate = true;
                controller.enableTranslate = true;
                controller.enableZoom = true;
                controller.enableTilt = true;
                controller.enableLook = true;
                
                // 设置优化的缩放范围
                controller.minimumZoomDistance = 0.1;  // 允许更近距离查看
                controller.maximumZoomDistance = 100000.0;  // 允许更远距离查看
                
                // 优化缩放灵敏度
                controller.zoomFactor = 5.0;
                controller.wheelZoomFactor = 0.1;
                
                console.log('✅ 相机控制器已启用');
            }
        } catch (error) {
            console.error('❌ 启用相机控制器失败:', error);
        }
    }

    /**
     * 重置相机视角
     */
    resetCameraView() {
        try {
            console.log('🔄 重置相机视角...');
            
            // 如果有模型，计算合适的视角
            if (this.viewer.entities.values.length > 0) {
                console.log('📍 根据模型位置重置视角');
                
                // 计算所有模型的中心点
                const entities = this.viewer.entities.values;
                let totalX = 0, totalY = 0, totalZ = 0;
                let validCount = 0;
                
                entities.forEach(entity => {
                    if (entity.position) {
                        const cartographic = SuperMap3D.Cartographic.fromCartesian(entity.position.getValue(SuperMap3D.JulianDate.now()));
                        totalX += SuperMap3D.Math.toDegrees(cartographic.longitude);
                        totalY += SuperMap3D.Math.toDegrees(cartographic.latitude);
                        totalZ += cartographic.height;
                        validCount++;
                    }
                });
                
                if (validCount > 0) {
                    const centerX = totalX / validCount;
                    const centerY = totalY / validCount;
                    const centerZ = (totalZ / validCount) + 500; // 在平均高度上方500米
                    
                    this.viewer.camera.setView({
                        destination: SuperMap3D.Cartesian3.fromDegrees(centerX, centerY, centerZ),
                        orientation: {
                            heading: 0.0,
                            pitch: SuperMap3D.Math.toRadians(-45),
                            roll: 0.0
                        }
                    });
                    
                    console.log(`✅ 视角重置到模型中心: (${centerX.toFixed(4)}, ${centerY.toFixed(4)}, ${centerZ.toFixed(1)})`);
                } else {
                    this.setDefaultView();
                }
            } else {
                this.setDefaultView();
            }
            
            // 确保相机控制器启用
            this.enableCameraControls();
            
        } catch (error) {
            console.error('❌ 重置视角失败:', error);
            this.setDefaultView();
        }
    }

    /**
     * 设置默认视角
     */
    setDefaultView() {
        try {
            console.log('📍 设置默认视角');
            this.viewer.camera.setView({
                destination: SuperMap3D.Cartesian3.fromDegrees(116.3, 39.9, 1000),
                orientation: {
                    heading: 0.0,
                    pitch: SuperMap3D.Math.toRadians(-45),
                    roll: 0.0
                }
            });
            console.log('✅ 默认视角设置完成');
        } catch (error) {
            console.error('❌ 设置默认视角失败:', error);
        }
    }

    /**
     * 检查内存使用情况
     */
    checkMemoryUsage() {
        try {
            // 检查性能内存API（如果可用）
            if (performance.memory) {
                const memInfo = performance.memory;
                const usedPercent = (memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit) * 100;
                
                console.log(`💾 内存使用: ${(memInfo.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB / ${(memInfo.jsHeapSizeLimit / 1024 / 1024).toFixed(1)}MB (${usedPercent.toFixed(1)}%)`);
                
                // 如果内存使用超过80%，返回true
                return usedPercent > 80;
            }
            
            // 如果没有内存API，检查实体数量作为替代指标
            const entityCount = this.viewer.entities.values.length;
            if (entityCount > 1500) {
                console.warn(`⚠️ 实体数量过多: ${entityCount}`);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('检查内存使用失败:', error);
            return false;
        }
    }

    /**
     * 等待内存释放
     */
    async waitForMemoryRelease() {
        console.log('⏳ 等待内存释放...');
        
        // 强制垃圾回收
        this.forceGarbageCollection();
        
        // 等待一段时间
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 再次检查内存
        let attempts = 0;
        while (this.checkMemoryUsage() && attempts < 5) {
            console.log(`⏳ 内存仍然过高，继续等待... (尝试 ${attempts + 1}/5)`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            this.forceGarbageCollection();
            attempts++;
        }
    }

    /**
     * 强制垃圾回收（如果可用）
     */
    forceGarbageCollection() {
        try {
            // 尝试强制垃圾回收（仅在开发环境中可用）
            if (window.gc) {
                window.gc();
                console.log('🗑️ 强制垃圾回收完成');
            }
        } catch (error) {
            // 忽略错误，垃圾回收不是必需的
        }
    }

    /**
     * 检查渲染器健康状态
     */
    checkRendererHealth() {
        try {
            // 检查viewer是否存在
            if (!this.viewer) {
                console.error('❌ Viewer不存在');
                return false;
            }

            // 检查scene是否存在
            if (!this.viewer.scene) {
                console.error('❌ Scene不存在');
                return false;
            }

            // 使用更宽松的检查策略
            console.log('✅ 基本渲染器组件检查通过');
            
            // 尝试获取canvas（使用多种方式）
            let canvas = null;
            try {
                canvas = this.viewer.canvas || this.viewer.scene.canvas;
            } catch (canvasError) {
                console.warn('⚠️ 无法获取canvas，但继续执行:', canvasError);
                // 即使无法获取canvas，也允许继续，因为SuperMap3D可能有内部处理
                return true;
            }

            if (canvas) {
                // 检查canvas尺寸（宽松检查）
                if (canvas.width <= 0 || canvas.height <= 0) {
                    console.warn(`⚠️ Canvas尺寸可能无效: ${canvas.width}x${canvas.height}，但允许继续`);
                }

                // 尝试检查WebGL上下文（非阻塞）
                try {
                    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                    if (gl && !gl.isContextLost()) {
                        console.log('✅ WebGL上下文检查通过');
                    } else {
                        console.warn('⚠️ WebGL上下文可能有问题，但允许继续');
                    }
                } catch (glError) {
                    console.warn('⚠️ WebGL检查失败，但允许继续:', glError);
                }
            }

            // 检查SuperMap3D特有的状态
            try {
                if (this.viewer.scene.context && this.viewer.scene.context.isDestroyed && this.viewer.scene.context.isDestroyed()) {
                    console.error('❌ SuperMap3D渲染上下文已销毁');
                    return false;
                }
            } catch (contextError) {
                console.warn('⚠️ SuperMap3D上下文检查失败，但允许继续:', contextError);
            }

            console.log('✅ 渲染器健康状态检查通过（宽松模式）');
            return true;
            
        } catch (error) {
            console.warn('⚠️ 渲染器健康检查遇到错误，但允许继续:', error);
            // 采用宽松策略，即使检查失败也允许继续
            return true;
        }
    }

    /**
     * 安全飞行到所有模型
     */
    flyToAllModelsWithSafety() {
        try {
            console.log('🚁 安全飞行到所有模型...');
            
            // 首先检查渲染器状态
            if (!this.checkRendererHealth()) {
                console.error('❌ 渲染器状态异常，无法飞行');
                this.handleRendererError();
                return;
            }
            
            // 如果有S3M图层，飞行到第一个图层
            if (this.layers && this.layers.length > 0 && this.layers[0].boundingSphere) {
                console.log('🎯 飞行到S3M图层');
                this.viewer.camera.flyToBoundingSphere(this.layers[0].boundingSphere, {
                    duration: 2.0
                });
                return;
            } 
            
            // 如果有加载的实体，飞行到所有实体
            if (this.viewer.entities.values.length > 0) {
                const entityCount = this.viewer.entities.values.length;
                console.log(`🎯 安全飞行到 ${entityCount} 个实体`);
                
                // 对于大量实体，使用更保守的方法
                if (entityCount > 1000) {
                    console.log('📊 实体数量较多，使用保守飞行方法');
                    this.conservativeFlyToModels();
                } else {
                    this.standardFlyToModels();
                }
                return;
            }
            
            // 如果没有模型，设置默认视角
            console.log('⚠️ 没有找到模型，设置默认视角');
            this.setFallbackCameraView();
            
        } catch (error) {
            console.error('❌ 安全飞行失败:', error);
            this.handleRendererError();
        }
    }

    /**
     * 标准飞行方法
     */
    standardFlyToModels() {
        try {
            // 等待一小段时间确保模型完全加载
            setTimeout(() => {
                try {
                    const entities = this.viewer.entities.values;
                    if (entities.length > 0) {
                        // 使用SuperMap3D的flyTo方法
                        this.viewer.flyTo(entities, {
                            duration: 3.0,
                            offset: new SuperMap3D.HeadingPitchRange(0, SuperMap3D.Math.toRadians(-30), 500)
                        });
                        
                        // 设置飞行完成的回调
                        setTimeout(() => {
                            console.log('✅ 标准飞行完成');
                            this.enableCameraControls();
                            // 重新绑定鼠标事件，确保导航功能正常
                            this.rebindMouseEventsAfterModelLoad();
                        }, 3500);
                    }
                } catch (flyError) {
                    console.error('❌ 标准飞行失败:', flyError);
                    this.conservativeFlyToModels();
                }
            }, 500);
        } catch (error) {
            console.error('❌ 标准飞行方法失败:', error);
            this.conservativeFlyToModels();
        }
    }

    /**
     * 保守飞行方法（用于大量模型）
     */
    conservativeFlyToModels() {
        try {
            console.log('🛡️ 使用保守飞行方法');
            
            // 计算模型的大致中心点
            const entities = this.viewer.entities.values;
            let totalX = 0, totalY = 0, totalZ = 0;
            let validCount = 0;
            
            // 只计算前100个实体的位置，避免计算过多
            const sampleSize = Math.min(entities.length, 100);
            
            for (let i = 0; i < sampleSize; i++) {
                const entity = entities[i];
                if (entity.position) {
                    try {
                        const cartographic = SuperMap3D.Cartographic.fromCartesian(entity.position.getValue(SuperMap3D.JulianDate.now()));
                        totalX += SuperMap3D.Math.toDegrees(cartographic.longitude);
                        totalY += SuperMap3D.Math.toDegrees(cartographic.latitude);
                        totalZ += cartographic.height;
                        validCount++;
                    } catch (posError) {
                        // 忽略单个实体的位置错误
                    }
                }
            }
            
            if (validCount > 0) {
                const centerX = totalX / validCount;
                const centerY = totalY / validCount;
                const centerZ = (totalZ / validCount) + 1000; // 在平均高度上方1000米
                
                this.viewer.camera.setView({
                    destination: SuperMap3D.Cartesian3.fromDegrees(centerX, centerY, centerZ),
                    orientation: {
                        heading: 0.0,
                        pitch: SuperMap3D.Math.toRadians(-45),
                        roll: 0.0
                    }
                });
                
                console.log(`✅ 保守飞行完成，视角设置到: (${centerX.toFixed(4)}, ${centerY.toFixed(4)}, ${centerZ.toFixed(1)})`);
                this.enableCameraControls();
                // 重新绑定鼠标事件，确保导航功能正常
                this.rebindMouseEventsAfterModelLoad();
            } else {
                this.setFallbackCameraView();
            }
            
        } catch (error) {
            console.error('❌ 保守飞行方法也失败:', error);
            this.setFallbackCameraView();
        }
    }

    /**
     * 处理渲染器错误
     */
    handleRendererError() {
        try {
            console.log('🔧 尝试恢复渲染器...');
            
            // 显示错误信息给用户
            this.showErrorDialog('渲染器错误', '检测到渲染器异常，建议刷新页面或减少加载的模型数量。');
            
            // 尝试重新初始化相机控制器
            setTimeout(() => {
                this.enableCameraControls();
                this.setDefaultView();
            }, 1000);
            
        } catch (error) {
              console.error('❌ 渲染器恢复失败:', error);
          }
      }

    /**
     * 设置页面卸载事件处理
     */
    setupPageUnloadHandling() {
        try {
            // 阻止默认的页面卸载行为
            window.addEventListener('beforeunload', (event) => {
                // 不设置returnValue，避免权限策略违规
                console.log('页面即将卸载，清理资源...');
                this.cleanupResources();
            });

            // 页面隐藏时也进行清理
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    console.log('页面隐藏，暂停渲染...');
                    this.pauseRendering();
                } else {
                    console.log('页面显示，恢复渲染...');
                    this.resumeRendering();
                }
            });

            console.log('✅ 页面卸载事件处理已设置');
        } catch (error) {
            console.error('❌ 设置页面卸载事件处理失败:', error);
        }
    }

    /**
     * 设置WebGL上下文处理
     */
    setupWebGLContextHandling() {
        try {
            if (this.viewer && this.viewer.canvas) {
                const canvas = this.viewer.canvas;

                // WebGL上下文丢失事件
                canvas.addEventListener('webglcontextlost', (event) => {
                    console.error('❌ WebGL上下文丢失');
                    event.preventDefault(); // 阻止默认行为
                    this.handleWebGLContextLost();
                });

                // WebGL上下文恢复事件
                canvas.addEventListener('webglcontextrestored', () => {
                    console.log('✅ WebGL上下文已恢复');
                    this.handleWebGLContextRestored();
                });

                console.log('✅ WebGL上下文事件处理已设置');
            }
        } catch (error) {
            console.error('❌ 设置WebGL上下文事件处理失败:', error);
        }
    }

    /**
     * 清理资源
     */
    cleanupResources() {
        try {
            console.log('🧹 开始清理资源...');

            // 清理实体
            if (this.viewer && this.viewer.entities) {
                this.viewer.entities.removeAll();
            }

            // 清理图层
            if (this.layers && this.layers.length > 0) {
                this.layers.forEach(layer => {
                    try {
                        if (layer.destroy) {
                            layer.destroy();
                        }
                    } catch (error) {
                        console.warn('清理图层失败:', error);
                    }
                });
                this.layers = [];
            }

            // 强制垃圾回收
            this.forceGarbageCollection();

            console.log('✅ 资源清理完成');
        } catch (error) {
            console.error('❌ 清理资源失败:', error);
        }
    }

    /**
     * 暂停渲染
     */
    pauseRendering() {
        try {
            if (this.viewer && this.viewer.scene) {
                this.viewer.scene.requestRenderMode = true;
                this.viewer.scene.maximumRenderTimeChange = Infinity;
                console.log('⏸️ 渲染已暂停');
            }
        } catch (error) {
            console.error('❌ 暂停渲染失败:', error);
        }
    }

    /**
     * 恢复渲染
     */
    resumeRendering() {
        try {
            if (this.viewer && this.viewer.scene) {
                this.viewer.scene.requestRenderMode = false;
                this.viewer.scene.maximumRenderTimeChange = 0.0;
                console.log('▶️ 渲染已恢复');
            }
        } catch (error) {
            console.error('❌ 恢复渲染失败:', error);
        }
    }

    /**
     * 处理WebGL上下文丢失
     */
    handleWebGLContextLost() {
        try {
            console.log('🔧 处理WebGL上下文丢失...');
            
            // 显示错误信息
            this.showErrorDialog('WebGL上下文丢失', 
                'WebGL上下文已丢失，这通常是由于内存不足或GPU驱动问题导致的。\n\n' +
                '建议：\n' +
                '1. 刷新页面\n' +
                '2. 减少加载的模型数量\n' +
                '3. 关闭其他占用GPU的程序\n' +
                '4. 更新GPU驱动程序'
            );

            // 暂停所有渲染操作
            this.pauseRendering();

        } catch (error) {
            console.error('❌ 处理WebGL上下文丢失失败:', error);
        }
    }

    /**
     * 处理WebGL上下文恢复
     */
    handleWebGLContextRestored() {
        try {
            console.log('🔧 处理WebGL上下文恢复...');
            
            // 恢复渲染
            this.resumeRendering();
            
            // 重新设置相机控制器
            this.enableCameraControls();
            
            // 设置默认视角
            this.setDefaultView();

            console.log('✅ WebGL上下文恢复处理完成');
        } catch (error) {
            console.error('❌ 处理WebGL上下文恢复失败:', error);
        }
    }

    // 进入全屏模式
    enterFullscreen() {
        try {
            console.log('🖥️ 进入全屏模式...');
            
            const element = document.documentElement;
            
            if (element.requestFullscreen) {
                element.requestFullscreen();
            } else if (element.mozRequestFullScreen) {
                element.mozRequestFullScreen();
            } else if (element.webkitRequestFullscreen) {
                element.webkitRequestFullscreen();
            } else if (element.msRequestFullscreen) {
                element.msRequestFullscreen();
            }
            
            // 监听全屏状态变化
            this.setupFullscreenListeners();
            
            console.log('✅ 全屏请求已发送');
        } catch (error) {
            console.error('❌ 进入全屏失败:', error);
            this.showErrorDialog('全屏错误', '无法进入全屏模式，请检查浏览器设置');
        }
    }

    // 退出全屏模式
    exitFullscreen() {
        try {
            console.log('🖥️ 退出全屏模式...');
            
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
            
            console.log('✅ 退出全屏请求已发送');
        } catch (error) {
            console.error('❌ 退出全屏失败:', error);
            this.showErrorDialog('全屏错误', '无法退出全屏模式');
        }
    }

    // 设置全屏状态监听器
    setupFullscreenListeners() {
        const fullscreenChangeHandler = () => {
            const isFullscreen = !!(document.fullscreenElement || 
                                   document.mozFullScreenElement || 
                                   document.webkitFullscreenElement || 
                                   document.msFullscreenElement);
            
            this.updateFullscreenButtons(isFullscreen);
            
            if (isFullscreen) {
                console.log('✅ 已进入全屏模式');
                this.showSuccessMessage('已进入全屏模式');
                // 调整场景大小以适应全屏
                this.resizeViewer();
            } else {
                console.log('✅ 已退出全屏模式');
                this.showSuccessMessage('已退出全屏模式');
                // 调整场景大小以适应窗口
                this.resizeViewer();
            }
        };
        
        // 移除之前的监听器（如果存在）
        document.removeEventListener('fullscreenchange', fullscreenChangeHandler);
        document.removeEventListener('mozfullscreenchange', fullscreenChangeHandler);
        document.removeEventListener('webkitfullscreenchange', fullscreenChangeHandler);
        document.removeEventListener('msfullscreenchange', fullscreenChangeHandler);
        
        // 添加新的监听器
        document.addEventListener('fullscreenchange', fullscreenChangeHandler);
        document.addEventListener('mozfullscreenchange', fullscreenChangeHandler);
        document.addEventListener('webkitfullscreenchange', fullscreenChangeHandler);
        document.addEventListener('msfullscreenchange', fullscreenChangeHandler);
    }

    // 更新全屏按钮状态
    updateFullscreenButtons(isFullscreen) {
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        const exitFullscreenBtn = document.getElementById('exitFullscreenBtn');
        
        if (fullscreenBtn && exitFullscreenBtn) {
            if (isFullscreen) {
                fullscreenBtn.style.display = 'none';
                exitFullscreenBtn.style.display = 'inline-block';
            } else {
                fullscreenBtn.style.display = 'inline-block';
                exitFullscreenBtn.style.display = 'none';
            }
        }
    }

    // 调整查看器大小
    resizeViewer() {
        try {
            if (this.viewer && this.viewer.scene) {
                // 强制重新计算画布大小
                setTimeout(() => {
                    if (this.viewer.canvas) {
                        this.viewer.canvas.style.width = '100%';
                        this.viewer.canvas.style.height = '100%';
                    }
                    
                    // 触发场景重绘
                    if (this.viewer.scene.requestRender) {
                        this.viewer.scene.requestRender();
                    }
                    
                    console.log('✅ 查看器大小已调整');
                }, 100);
            }
        } catch (error) {
            console.error('❌ 调整查看器大小失败:', error);
        }
    }
 }

// 页面加载完成后初始化工具
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM内容加载完成，开始初始化...');
    
    // 检查批量加载按钮是否存在
    const batchLoadBtn = document.getElementById('batchLoadBtn');
    if (batchLoadBtn) {
        console.log('✅ 在DOM加载时找到批量加载按钮');
    } else {
        console.error('❌ 在DOM加载时未找到批量加载按钮');
    }
    
    // 等待SuperMap3D库加载完成
    let attemptCount = 0;
    function initializeWhenReady() {
        attemptCount++;
        console.log(`🔄 初始化尝试 #${attemptCount}`);
        
        if (typeof SuperMap3D !== 'undefined') {
            console.log('✅ SuperMap3D库已加载，版本:', SuperMap3D.VERSION || '未知');
            try {
                window.realityTwinTool = new RealityTwin3DAnalysisTool();
                console.log('✅ 实景三维时空分析工具初始化成功');
                
                // 验证批量加载按钮事件是否正确绑定
                setTimeout(() => {
                    const btn = document.getElementById('batchLoadBtn');
                    if (btn) {
                        console.log('🔍 验证批量加载按钮状态:');
                        console.log('  - ID:', btn.id);
                        console.log('  - 类名:', btn.className);
                        console.log('  - 禁用状态:', btn.disabled);
                        console.log('  - 事件监听器数量:', btn.getEventListeners ? btn.getEventListeners('click').length : '无法检测');
                        
                        // 手动触发点击测试
                        console.log('🧪 手动触发点击测试...');
                        btn.click();
                    }
                }, 1000);
                
            } catch (error) {
                console.error('❌ 工具初始化失败:', error);
                console.error('错误堆栈:', error.stack);
            }
        } else {
            if (attemptCount <= 50) {
                console.log(`⏳ 等待SuperMap3D库加载... (尝试 ${attemptCount}/50)`);
                setTimeout(initializeWhenReady, 100);
            } else {
                console.error('❌ SuperMap3D库加载超时，初始化失败');
                
                // 即使SuperMap3D未加载，也尝试绑定基本的按钮事件
                console.log('🔧 尝试绑定基本按钮事件...');
                const btn = document.getElementById('batchLoadBtn');
                if (btn) {
                    btn.addEventListener('click', function() {
                        console.log('🚀 批量加载按钮被点击（备用处理）');
                        alert('SuperMap3D库未正确加载，无法使用批量加载功能');
                    });
                    console.log('✅ 备用事件监听器已绑定');
                }
            }
        }
    }
    
    initializeWhenReady();
});

// 导出工具类供外部使用
// 可视域属性编辑弹窗相关函数
let currentViewshedClipMode = 'keep-inside';

/**
 * 显示可视域属性编辑弹窗
 */
function showViewshedPropertyEditor() {
    const modal = document.getElementById('viewshedPropertyModal');
    if (modal) {
        modal.classList.add('show');
        // 绑定属性控件事件
        bindViewshedPropertyControls();
        console.log('✅ 显示可视域属性编辑弹窗');
    }
}

/**
 * 关闭可视域属性编辑弹窗
 */
function closeViewshedPropertyEditor() {
    const modal = document.getElementById('viewshedPropertyModal');
    if (modal) {
        modal.classList.remove('show');
        console.log('✅ 关闭可视域属性编辑弹窗');
    }
}

/**
 * 绑定可视域属性控件事件
 */
function bindViewshedPropertyControls() {
    // 方向角控件
    const directionSlider = document.getElementById('modal-direction');
    const directionValue = document.getElementById('modal-direction-value');
    if (directionSlider && directionValue) {
        directionSlider.addEventListener('input', function() {
            directionValue.textContent = this.value + '°';
            updateViewshedProperty('direction', parseFloat(this.value));
        });
    }
    
    // 俯仰角控件
    const pitchSlider = document.getElementById('modal-pitch');
    const pitchValue = document.getElementById('modal-pitch-value');
    if (pitchSlider && pitchValue) {
        pitchSlider.addEventListener('input', function() {
            pitchValue.textContent = this.value + '°';
            updateViewshedProperty('pitch', parseFloat(this.value));
        });
    }
    
    // 观察距离控件
    const distanceSlider = document.getElementById('modal-distance');
    const distanceValue = document.getElementById('modal-distance-value');
    if (distanceSlider && distanceValue) {
        distanceSlider.addEventListener('input', function() {
            distanceValue.textContent = this.value + 'm';
            updateViewshedProperty('distance', parseFloat(this.value));
        });
    }
    
    // 水平视场角控件
    const horizontalFovSlider = document.getElementById('modal-horizontal-fov');
    const horizontalFovValue = document.getElementById('modal-horizontal-fov-value');
    if (horizontalFovSlider && horizontalFovValue) {
        horizontalFovSlider.addEventListener('input', function() {
            horizontalFovValue.textContent = this.value + '°';
            updateViewshedProperty('horizontalFov', parseFloat(this.value));
        });
    }
    
    // 垂直视场角控件
    const verticalFovSlider = document.getElementById('modal-vertical-fov');
    const verticalFovValue = document.getElementById('modal-vertical-fov-value');
    if (verticalFovSlider && verticalFovValue) {
        verticalFovSlider.addEventListener('input', function() {
            verticalFovValue.textContent = this.value + '°';
            updateViewshedProperty('verticalFov', parseFloat(this.value));
        });
    }
    
    // 可见区域颜色控件
    const visibleColorPicker = document.getElementById('modal-visible-color');
    if (visibleColorPicker) {
        visibleColorPicker.addEventListener('change', function() {
            updateViewshedProperty('visibleColor', this.value);
        });
    }
    
    // 不可见区域颜色控件
    const invisibleColorPicker = document.getElementById('modal-invisible-color');
    if (invisibleColorPicker) {
        invisibleColorPicker.addEventListener('change', function() {
            updateViewshedProperty('invisibleColor', this.value);
        });
    }
    
    console.log('✅ 绑定可视域属性控件事件完成');
}

/**
 * 更新可视域属性
 */
function updateViewshedProperty(propertyName, value) {
    if (window.realityTwin3DAnalysisTool && window.realityTwin3DAnalysisTool.digitalTwinAnalysis) {
        window.realityTwin3DAnalysisTool.digitalTwinAnalysis.updateViewshedProperty(propertyName, value);
        console.log(`✅ 更新可视域属性: ${propertyName} = ${value}`);
    }
}

/**
 * 选择裁剪模式
 */
function selectClipMode(mode) {
    currentViewshedClipMode = mode;
    
    // 更新UI状态
    document.querySelectorAll('.clip-mode-option').forEach(option => {
        option.classList.remove('active');
    });
    document.querySelector(`[data-mode="${mode}"]`).classList.add('active');
    
    // 应用裁剪模式
    if (window.realityTwin3DAnalysisTool && window.realityTwin3DAnalysisTool.digitalTwinAnalysis) {
        window.realityTwin3DAnalysisTool.digitalTwinAnalysis.setViewshedClipMode(mode);
        console.log(`✅ 设置裁剪模式: ${mode}`);
    }
}

/**
 * 重置可视域属性
 */
function resetViewshedProperties() {
    // 重置滑块值
    const directionSlider = document.getElementById('modal-direction');
    const pitchSlider = document.getElementById('modal-pitch');
    const distanceSlider = document.getElementById('modal-distance');
    const horizontalFovSlider = document.getElementById('modal-horizontal-fov');
    const verticalFovSlider = document.getElementById('modal-vertical-fov');
    const visibleColorPicker = document.getElementById('modal-visible-color');
    const invisibleColorPicker = document.getElementById('modal-invisible-color');
    
    if (directionSlider) {
        directionSlider.value = 0;
        document.getElementById('modal-direction-value').textContent = '0°';
        updateViewshedProperty('direction', 0);
    }
    
    if (pitchSlider) {
        pitchSlider.value = 0;
        document.getElementById('modal-pitch-value').textContent = '0°';
        updateViewshedProperty('pitch', 0);
    }
    
    if (distanceSlider) {
        distanceSlider.value = 1000;
        document.getElementById('modal-distance-value').textContent = '1000m';
        updateViewshedProperty('distance', 1000);
    }
    
    if (horizontalFovSlider) {
        horizontalFovSlider.value = 90;
        document.getElementById('modal-horizontal-fov-value').textContent = '90°';
        updateViewshedProperty('horizontalFov', 90);
    }
    
    if (verticalFovSlider) {
        verticalFovSlider.value = 60;
        document.getElementById('modal-vertical-fov-value').textContent = '60°';
        updateViewshedProperty('verticalFov', 60);
    }
    
    if (visibleColorPicker) {
        visibleColorPicker.value = '#00ff00';
        updateViewshedProperty('visibleColor', '#00ff00');
    }
    
    if (invisibleColorPicker) {
        invisibleColorPicker.value = '#ff0000';
        updateViewshedProperty('invisibleColor', '#ff0000');
    }
    
    // 重置裁剪模式
    selectClipMode('keep-inside');
    
    console.log('✅ 重置可视域属性完成');
}

/**
 * 应用可视域属性
 */
function applyViewshedProperties() {
    // 获取当前所有属性值
    const properties = {
        direction: parseFloat(document.getElementById('modal-direction').value),
        pitch: parseFloat(document.getElementById('modal-pitch').value),
        distance: parseFloat(document.getElementById('modal-distance').value),
        horizontalFov: parseFloat(document.getElementById('modal-horizontal-fov').value),
        verticalFov: parseFloat(document.getElementById('modal-vertical-fov').value),
        visibleColor: document.getElementById('modal-visible-color').value,
        invisibleColor: document.getElementById('modal-invisible-color').value,
        clipMode: currentViewshedClipMode
    };
    
    // 批量应用属性
    if (window.realityTwin3DAnalysisTool && window.realityTwin3DAnalysisTool.digitalTwinAnalysis) {
        Object.keys(properties).forEach(key => {
            if (key === 'clipMode') {
                window.realityTwin3DAnalysisTool.digitalTwinAnalysis.setViewshedClipMode(properties[key]);
            } else {
                window.realityTwin3DAnalysisTool.digitalTwinAnalysis.updateViewshedProperty(key, properties[key]);
            }
        });
    }
    
    console.log('✅ 应用可视域属性完成:', properties);
    
    // 显示成功消息
    if (window.realityTwin3DAnalysisTool) {
        window.realityTwin3DAnalysisTool.showSuccessMessage('可视域属性已应用');
    }
}

// 点击弹窗外部关闭弹窗
document.addEventListener('click', function(event) {
    const modal = document.getElementById('viewshedPropertyModal');
    if (modal && event.target === modal) {
        closeViewshedPropertyEditor();
    }
});

// ESC键关闭弹窗
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeViewshedPropertyEditor();
    }
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RealityTwin3DAnalysisTool;
}
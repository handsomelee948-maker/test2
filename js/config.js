/**
 * 配置文件
 * 包含数据源配置、服务地址等
 */

// 数据源配置
const URL_CONFIG = {
    // 本地数据路径
    LOCAL_DATA_PATH: "./data/",
    
    // 示例本地模型路径
    LOCAL_MODELS: {
        DIZHITI_MODEL: "./data/dizhiti/Layer1.s3m",
        DIZHITI_LAYER2: "./data/dizhiti/Layer2.s3m",
        DIZHITI_LAYER3: "./data/dizhiti/Layer3.s3m",
        DIZHITI_LAYER4: "./data/dizhiti/Layer4.s3m",
        DIZHITI_LAYER5: "./data/dizhiti/Layer5.s3m",
        DIZHITI_LAYER6: "./data/dizhiti/Layer6.s3m",
        SAMPLE_MODEL: "./data/sample/",
        BUILDING_MODEL: "./data/building/",
        TERRAIN_MODEL: "./data/terrain/"
    },
    
    // 在线服务地址（可选，需要网络连接）
    ONLINE_SERVICES: {
        SCENE_JINJIANG: "http://www.supermapol.com/realspace/services/3D-jinjiang/rest/realspace",
        SCENE_BIMBUILDING: "http://www.supermapol.com/realspace/services/3D-BIMbuilding/rest/realspace",
        SCENE_CBD: "http://www.supermapol.com/realspace/services/3D-CBD/rest/realspace",
        TERRAIN_URL: "http://www.supermapol.com/realspace/services/map-World/rest/maps/World_Terrain",
        IMAGERY_URL: "http://www.supermapol.com/realspace/services/map-World/rest/maps/World_Image"
    },
    
    // 禁用Bing Maps以避免API密钥错误
    BING_MAP_KEY: null,
    USE_BING_MAPS: false
};

// 模型配置
const MODEL_CONFIGS = {
    DIZHITI_MODEL: {
        name: "地质体模型 - 图层1",
        url: URL_CONFIG.LOCAL_MODELS.DIZHITI_MODEL,
        type: "S3M",
        dataSourceName: "Local",
        dataSetName: "Dizhiti_Layer1",
        description: "本地地质体三维模型数据 - 图层1",
        isLocal: true
    },
    DIZHITI_LAYER2: {
        name: "地质体模型 - 图层2",
        url: URL_CONFIG.LOCAL_MODELS.DIZHITI_LAYER2,
        type: "S3M",
        dataSourceName: "Local",
        dataSetName: "Dizhiti_Layer2",
        description: "本地地质体三维模型数据 - 图层2",
        isLocal: true
    },
    DIZHITI_LAYER3: {
        name: "地质体模型 - 图层3",
        url: URL_CONFIG.LOCAL_MODELS.DIZHITI_LAYER3,
        type: "S3M",
        dataSourceName: "Local",
        dataSetName: "Dizhiti_Layer3",
        description: "本地地质体三维模型数据 - 图层3",
        isLocal: true
    },
    DIZHITI_LAYER4: {
        name: "地质体模型 - 图层4",
        url: URL_CONFIG.LOCAL_MODELS.DIZHITI_LAYER4,
        type: "S3M",
        dataSourceName: "Local",
        dataSetName: "Dizhiti_Layer4",
        description: "本地地质体三维模型数据 - 图层4",
        isLocal: true
    },
    DIZHITI_LAYER5: {
        name: "地质体模型 - 图层5",
        url: URL_CONFIG.LOCAL_MODELS.DIZHITI_LAYER5,
        type: "S3M",
        dataSourceName: "Local",
        dataSetName: "Dizhiti_Layer5",
        description: "本地地质体三维模型数据 - 图层5",
        isLocal: true
    },
    DIZHITI_LAYER6: {
        name: "地质体模型 - 图层6",
        url: URL_CONFIG.LOCAL_MODELS.DIZHITI_LAYER6,
        type: "S3M",
        dataSourceName: "Local",
        dataSetName: "Dizhiti_Layer6",
        description: "本地地质体三维模型数据 - 图层6",
        isLocal: true
    },
    LOCAL_SAMPLE: {
        name: "本地示例模型",
        url: URL_CONFIG.LOCAL_MODELS.SAMPLE_MODEL,
        type: "S3M",
        dataSourceName: "Local",
        dataSetName: "Sample",
        description: "本地示例三维模型数据",
        isLocal: true
    },
    LOCAL_BUILDING: {
        name: "本地建筑模型",
        url: URL_CONFIG.LOCAL_MODELS.BUILDING_MODEL,
        type: "S3M",
        dataSourceName: "Local",
        dataSetName: "Building",
        description: "本地建筑三维模型数据",
        isLocal: true
    },
    // 在线模型（需要网络连接和授权）
    BIM_BUILDING: {
        name: "BIM建筑模型（在线）",
        url: URL_CONFIG.ONLINE_SERVICES.SCENE_BIMBUILDING,
        type: "S3M",
        dataSourceName: "BIMBuilding",
        dataSetName: "Building",
        description: "精细BIM建筑模型，支持部件级查询和分析（需要网络连接）",
        isLocal: false,
        requiresAuth: true
    },
    CBD_MODEL: {
        name: "CBD精细模型（在线）",
        url: URL_CONFIG.ONLINE_SERVICES.SCENE_CBD,
        type: "S3M",
        dataSourceName: "CBD",
        dataSetName: "Buildings",
        description: "城市CBD区域精细三维模型（需要网络连接）",
        isLocal: false,
        requiresAuth: true
    },
    JINJIANG_MODEL: {
        name: "晋江模型（在线）",
        url: URL_CONFIG.ONLINE_SERVICES.SCENE_JINJIANG,
        type: "S3M",
        dataSourceName: "jinjiang",
        dataSetName: "test",
        description: "晋江地区三维模型数据（需要网络连接）",
        isLocal: false,
        requiresAuth: true
    }
};

// 分析工具配置
const ANALYSIS_CONFIG = {
    VIEWSHED: {
        name: "可视域分析",
        description: "分析从指定观察点能够看到的区域范围"
    },
    SIGHTLINE: {
        name: "通视分析",
        description: "分析两点之间的通视情况"
    },
    CLIP: {
        name: "剖面分析",
        description: "对三维模型进行剖面切割分析"
    },
    EXCAVATE: {
        name: "开挖分析",
        description: "模拟地形或建筑的开挖效果"
    },

    PROFILE: {
        name: "断面分析",
        description: "生成指定路径的地形断面图"
    }
};

// 导航配置
const NAVIGATION_CONFIG = {
    WALKING_SPEED: 2.0, // 漫游速度 m/s
    FLOOR_HEIGHT: 3.0,  // 楼层高度 m
    CAMERA_HEIGHT: 1.7, // 相机高度 m
    TURN_SPEED: 0.5,    // 转向速度
    MAX_FLOORS: 20      // 最大楼层数
};

// 场景效果配置
const EFFECT_CONFIG = {
    LIGHTING: {
        AMBIENT_LIGHT: {
            DAY: [0.8, 0.8, 0.8, 1],
            NIGHT: [0.2, 0.2, 0.3, 1]
        },
        DIRECTIONAL_LIGHT: {
            DAY: [1.0, 1.0, 0.9, 1],
            NIGHT: [0.3, 0.3, 0.4, 1]
        }
    },
    SHADOW: {
        ENABLED: true,
        SIZE: 2048
    },
    BLOOM: {
        ENABLED: false,
        INTENSITY: 0.5
    }
};

// UI配置
const UI_CONFIG = {
    PANEL_WIDTH: 350,
    TOOLBAR_WIDTH: 300,
    STATUS_BAR_HEIGHT: 40,
    ANIMATION_DURATION: 300
};

/**
 * 获取引擎类型
 * @returns {number} 引擎类型 (2: WebGL2, 3: WebGPU)
 */
function getEngineType() {
    // 检查WebGPU支持
    if (navigator.gpu && typeof navigator.gpu.requestAdapter === 'function') {
        return 3; // WebGPU
    }
    
    // 检查WebGL2支持
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (gl) {
        return 2; // WebGL2
    }
    
    // 降级到WebGL1
    return 1; // WebGL1
}

/**
 * 检查浏览器兼容性
 */
function checkBrowserCompatibility() {
    const userAgent = navigator.userAgent;
    const isChrome = /Chrome/.test(userAgent);
    const isFirefox = /Firefox/.test(userAgent);
    const isEdge = /Edge/.test(userAgent);
    const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
    
    if (!isChrome && !isFirefox && !isEdge && !isSafari) {
        console.warn('当前浏览器可能不完全支持WebGL/WebGPU功能');
    }
    
    // 检查WebGL支持
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
        throw new Error('您的浏览器不支持WebGL');
    }
    
    return true;
}

/**
 * 初始化配置检查
 */
function initializeConfig() {
    try {
        checkBrowserCompatibility();
        console.log('浏览器兼容性检查通过');
        console.log('引擎类型:', getEngineType() === 3 ? 'WebGPU' : 'WebGL');
        return true;
    } catch (error) {
        console.error('配置初始化失败:', error);
        alert('浏览器不支持，请使用Chrome、Firefox、Edge或Safari浏览器');
        return false;
    }
}

// 导出配置对象
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        URL_CONFIG,
        MODEL_CONFIGS,
        ANALYSIS_CONFIG,
        NAVIGATION_CONFIG,
        EFFECT_CONFIG,
        UI_CONFIG,
        getEngineType,
        checkBrowserCompatibility,
        initializeConfig
    };
}
/**
 * 配置文件
 * 包含数据源配置、服务地址等
 */

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
        ANALYSIS_CONFIG,
        NAVIGATION_CONFIG,
        EFFECT_CONFIG,
        UI_CONFIG,
        MCP_CONFIG,
        getEngineType,
        checkBrowserCompatibility,
        initializeConfig
    };
}
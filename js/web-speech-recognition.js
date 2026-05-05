/**
 * Web Speech API 语音识别类
 * 使用浏览器内置的语音识别功能，替代不稳定的离线模型
 */
class WebSpeechRecognition {
    constructor(options = {}) {
        // 检查浏览器是否支持Web Speech API
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            throw new Error('浏览器不支持Web Speech API');
        }

        // 创建语音识别实例
        this.recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        
        // 配置选项
        this.options = {
            continuous: false,          // 默认不连续识别，防止自动重启
            interimResults: true,       // 显示临时结果
            lang: 'zh-CN',              // 中文识别
            maxAlternatives: 1,         // 最大备选结果数
            ...options
        };

        // 应用配置
        this.recognition.continuous = this.options.continuous;
        this.recognition.interimResults = this.options.interimResults;
        this.recognition.lang = this.options.lang;
        this.recognition.maxAlternatives = this.options.maxAlternatives;

        // 状态变量
        this.isListening = false;
        this.finalText = '';
        this.interimText = '';
        this.onResultCallback = null;
        this.onErrorCallback = null;
        this.onStartCallback = null;
        this.onEndCallback = null;

        // 绑定事件处理器
        this.bindEvents();
    }

    /**
     * 绑定语音识别事件
     */
    bindEvents() {
        // 识别结果事件
        this.recognition.onresult = (event) => {
            this.handleResult(event);
        };

        // 识别开始事件
        this.recognition.onstart = () => {
            this.isListening = true;
            console.log('🎤 语音识别已开始');
            if (this.onStartCallback) {
                this.onStartCallback();
            }
        };

        // 识别结束事件
        this.recognition.onend = () => {
            this.isListening = false;
            console.log('🔴 语音识别已结束');
            if (this.onEndCallback) {
                this.onEndCallback();
            }
            
            // 如果配置为连续识别，自动重新开始
            if (this.options.continuous) {
                this.start();
            }
        };

        // 识别错误事件
        this.recognition.onerror = (event) => {
            console.error('❌ 语音识别错误:', event.error);
            this.isListening = false;
            
            if (this.onErrorCallback) {
                this.onErrorCallback(event.error);
            }

            // 处理特定错误类型
            switch (event.error) {
                case 'not-allowed':
                    console.error('麦克风权限被拒绝');
                    break;
                case 'audio-capture':
                    console.error('无法捕获音频');
                    break;
                case 'network':
                    console.error('网络错误');
                    break;
            }
        };

        // 无语音输入事件
        this.recognition.onspeechend = () => {
            console.log('🔇 检测到语音结束');
        };

        // 语音开始事件
        this.recognition.onspeechstart = () => {
            console.log('🔊 检测到语音开始');
        };

        // 无匹配结果事件
        this.recognition.onnomatch = () => {
            console.log('❓ 未识别到匹配的语音');
        };
    }

    /**
     * 处理识别结果
     */
    handleResult(event) {
        let interimTranscript = '';
        let finalTranscript = '';

        // 遍历所有结果
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        // 更新文本
        if (finalTranscript) {
            this.finalText += finalTranscript;
            this.interimText = '';
        } else {
            this.interimText = interimTranscript;
        }

        // 调用回调函数
        if (this.onResultCallback) {
            this.onResultCallback({
                finalText: this.finalText,
                interimText: this.interimText,
                isFinal: !!finalTranscript
            });
        }

        console.log('📝 识别结果 - 最终文本:', this.finalText, '临时文本:', this.interimText, '是否最终:', !!finalTranscript);
    }

    /**
     * 开始语音识别
     */
    start() {
        if (this.isListening) {
            console.log('⚠️ 语音识别已在运行中');
            return;
        }

        try {
            this.recognition.start();
            this.isListening = true;
            console.log('🚀 启动语音识别');
        } catch (error) {
            console.error('❌ 启动语音识别失败:', error);
            this.isListening = false;
            if (this.onErrorCallback) {
                this.onErrorCallback(error);
            }
        }
    }

    /**
     * 停止语音识别
     */
    stop() {
        if (!this.isListening) {
            console.log('⚠️ 语音识别未在运行');
            return;
        }

        try {
            this.recognition.stop();
            this.isListening = false;
            console.log('🛑 停止语音识别');
        } catch (error) {
            console.error('❌ 停止语音识别失败:', error);
            this.isListening = false;
        }
    }

    /**
     * 重置识别状态
     */
    reset() {
        this.finalText = '';
        this.interimText = '';
        console.log('🔄 重置语音识别状态');
    }

    /**
     * 设置识别结果回调
     */
    onResult(callback) {
        this.onResultCallback = callback;
    }

    /**
     * 设置错误回调
     */
    onError(callback) {
        this.onErrorCallback = callback;
    }

    /**
     * 设置开始回调
     */
    onStart(callback) {
        this.onStartCallback = callback;
    }

    /**
     * 设置结束回调
     */
    onEnd(callback) {
        this.onEndCallback = callback;
    }

    /**
     * 检查浏览器支持情况
     */
    static isSupported() {
        return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    }

    /**
     * 获取支持的语音列表
     */
    static getSupportedLanguages() {
        // 注意：这个功能需要用户交互才能获取
        return [
            'zh-CN', 'zh-TW', 'zh-HK', // 中文
            'en-US', 'en-GB', 'en-AU', // 英语
            'ja-JP', 'ko-KR',          // 日语、韩语
            'fr-FR', 'de-DE', 'es-ES'  // 欧洲语言
        ];
    }

    /**
     * 销毁实例
     */
    destroy() {
        if (this.isListening) {
            this.stop();
        }
        
        // 移除所有事件监听器
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onstart = null;
        this.recognition.onend = null;
        this.recognition.onspeechend = null;
        this.recognition.onspeechstart = null;
        this.recognition.onnomatch = null;
        
        console.log('🗑️ 语音识别实例已销毁');
    }
}

// 导出类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebSpeechRecognition;
} else {
    window.WebSpeechRecognition = WebSpeechRecognition;
}
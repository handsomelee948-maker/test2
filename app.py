#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FunASR 语音识别 API 服务
为三维时空分析系统提供实时语音识别功能

功能特性：
    ✅ WebSocket 实时流式识别（边说边显示）
    ✅ RESTful API 文件识别（批量处理）
    ✅ VAD 语音活动检测
    ✅ 自动标点恢复
    ✅ 离线部署，无需联网

API 接口：
    - WebSocket: ws://localhost:10095/asr          (实时流式识别)
    - POST:      http://localhost:10095/api/transcribe  (文件识别)
    - POST:      http://localhost:10095/api/punctuate   (标点恢复)
    - GET:       http://localhost:10095/api/health      (健康检查)
    - GET:       http://localhost:10095/api/models      (模型信息)

启动方式：
    python app.py

模型位置：
    ./models/iic/
"""

from flask import Flask, render_template, send_from_directory, request, jsonify
from flask_sock import Sock
from flask_cors import CORS
import numpy as np
import json
import logging
import base64
import io
from pathlib import Path
from datetime import datetime

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 创建Flask应用
app = Flask(__name__)

# 启用 CORS（允许三维系统跨域调用）
CORS(app, resources={
    r"/api/*": {"origins": "*"},
    r"/asr": {"origins": "*"}
})

sock = Sock(app)

# 全局变量存储模型（避免每次连接都加载）
models = {}

# 本地模型目录
SCRIPT_DIR = Path(__file__).parent
MODELS_DIR = SCRIPT_DIR / "models" / "iic"

def load_models():
    """加载 FunASR 模型（离线部署 - VAD + ASR离线 + 标点）"""
    global models
    
    if models:
        logger.info("模型已加载，跳过重复加载")
        return
    
    # 检查模型目录
    if not MODELS_DIR.exists():
        logger.error(f"❌ 找不到模型目录: {MODELS_DIR}")
        logger.error("请先运行 python download_models.py 下载模型")
        raise FileNotFoundError(f"模型目录不存在: {MODELS_DIR}")
    
    logger.info("开始加载 FunASR 模型（离线部署）...")
    logger.info(f"模型目录: {MODELS_DIR}")
    
    try:
        from funasr import AutoModel
        
        # 1. VAD 模型 - 语音活动检测
        vad_model_path = MODELS_DIR / "speech_fsmn_vad_zh-cn-16k-common-pytorch"
        logger.info(f"加载 VAD 模型: {vad_model_path}")
        models['vad'] = AutoModel(
            model=str(vad_model_path),
            ngpu=0,  # 使用CPU
            ncpu=4,
            device="cpu",
            disable_pbar=True,
            disable_log=True
        )
        
        # 2. ASR 离线模型（高精度，非流式）
        asr_model_path = MODELS_DIR / "speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch"
        logger.info(f"加载 ASR 离线模型: {asr_model_path}")
        models['asr_offline'] = AutoModel(
            model=str(asr_model_path),
            ngpu=0,  # 使用CPU
            ncpu=4,
            device="cpu",
            disable_pbar=True,
            disable_log=True
        )
        
        # 3. 标点恢复模型
        punc_model_path = MODELS_DIR / "punc_ct-transformer_zh-cn-common-vad_realtime-vocab272727"
        logger.info(f"加载标点恢复模型: {punc_model_path}")
        models['punc'] = AutoModel(
            model=str(punc_model_path),
            ngpu=0,  # 使用CPU
            ncpu=4,
            device="cpu",
            disable_pbar=True,
            disable_log=True
        )
        
        logger.info("✅ 所有模型加载完成！")
        logger.info(f"已加载模型: {list(models.keys())}")
        logger.info("运行模式: 离线部署 + CPU")
        
    except Exception as e:
        logger.error(f"❌ 模型加载失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise

# 启动时加载模型
load_models()


@app.route('/')
def index():
    """主页 - 返回 API 信息"""
    return jsonify({
        'service': 'FunASR 语音识别 API',
        'version': '1.0.0',
        'status': 'running',
        'endpoints': {
            'websocket': 'ws://localhost:10095/asr',
            'health': 'http://localhost:10095/api/health',
            'transcribe': 'http://localhost:10095/api/transcribe',
            'punctuate': 'http://localhost:10095/api/punctuate',
            'models': 'http://localhost:10095/api/models'
        }
    })


@sock.route('/asr')
def asr_stream(ws):
    """
    WebSocket 流式语音识别接口（使用离线ASR模型）
    
    接收格式: 二进制音频数据（PCM, 16kHz, 16bit, mono）
    返回格式: JSON {"text": "识别文本", "is_final": false}
    
    注意: 离线模型不支持流式cache，采用分段识别策略
    """
    logger.info("新的 WebSocket 连接建立")
    
    # 音频缓冲区
    audio_buffer = []
    # 累积识别结果
    accumulated_text = []
    
    try:
        while True:
            # 接收音频数据
            data = ws.receive()
            
            if data is None:
                break
            
            if isinstance(data, bytes):
                # 将字节数据转换为 numpy 数组
                audio_data = np.frombuffer(data, dtype=np.int16)
                audio_buffer.extend(audio_data)
                
                # 当累积足够数据时进行识别（每 1.5秒识别一次，平衡实时性和准确性）
                chunk_duration = 1.5  # 1.5秒
                chunk_size = int(16000 * chunk_duration)  # 1.5s @ 16kHz
                
                if len(audio_buffer) >= chunk_size:
                    # 取出一段数据
                    chunk = np.array(audio_buffer[:chunk_size], dtype=np.float32)
                    audio_buffer = audio_buffer[chunk_size:]
                    
                    # 归一化
                    chunk = chunk / 32768.0
                    
                    try:
                        logger.info(f"处理音频块: {len(chunk)} 采样点")
                        
                        # 1. VAD 检测语音活动（过滤静音和噪音）
                        vad_result = models['vad'].generate(input=chunk)
                        
                        has_speech = False
                        if vad_result and len(vad_result) > 0:
                            vad_segments = vad_result[0].get('value', [])
                            has_speech = len(vad_segments) > 0
                            if has_speech:
                                logger.info(f"✅ VAD检测到语音: {len(vad_segments)} 个片段")
                            else:
                                logger.info("⏭️  VAD未检测到语音，跳过识别")
                        
                        # 只对有语音的片段进行识别
                        if has_speech:
                            # 2. ASR 识别
                            asr_result = models['asr_offline'].generate(
                                input=chunk,
                                batch_size=1
                            )
                            
                            if asr_result and len(asr_result) > 0:
                                raw_text = asr_result[0].get('text', '').strip()
                                logger.info(f"📝 原始文本: {raw_text}")
                                
                                # 质量过滤：过滤掉太短或无意义的识别结果
                                if raw_text and len(raw_text) >= 2:
                                    # 3. 添加标点
                                    try:
                                        punc_result = models['punc'].generate(input=raw_text)
                                        
                                        if punc_result and len(punc_result) > 0:
                                            final_text = punc_result[0].get('text', raw_text)
                                        else:
                                            final_text = raw_text
                                    except Exception as punc_error:
                                        logger.warning(f"标点添加失败: {punc_error}")
                                        final_text = raw_text
                                    
                                    # 累积文本
                                    accumulated_text.append(final_text)
                                    
                                    # 发送实时识别结果（累积显示）
                                    result = {
                                        'text': ' '.join(accumulated_text),
                                        'segment': final_text,  # 当前段
                                        'is_final': False
                                    }
                                    ws.send(json.dumps(result, ensure_ascii=False))
                                    logger.info(f"✅ 实时识别: {final_text}")
                                else:
                                    logger.info(f"⏭️  识别结果太短，跳过: '{raw_text}'")
                            else:
                                logger.info("⏭️  ASR识别结果为空")
                        else:
                            logger.info("⏭️  无语音活动，跳过识别")
                    
                    except Exception as e:
                        logger.error(f"识别错误: {e}")
                        import traceback
                        logger.error(traceback.format_exc())
                        ws.send(json.dumps({'error': str(e)}, ensure_ascii=False))
            
            elif isinstance(data, str):
                # 处理控制命令
                try:
                    command = json.loads(data)
                    
                    if command.get('command') == 'end':
                        # 处理剩余数据
                        if len(audio_buffer) > 1600:  # 至少100ms的数据
                            chunk = np.array(audio_buffer, dtype=np.float32) / 32768.0
                            
                            # 最终识别
                            asr_result = models['asr_offline'].generate(
                                input=chunk,
                                batch_size=1
                            )
                            
                            if asr_result and len(asr_result) > 0:
                                raw_text = asr_result[0].get('text', '').strip()
                                
                                if raw_text:
                                    punc_result = models['punc'].generate(input=raw_text)
                                    final_text = punc_result[0].get('text', raw_text) if punc_result else raw_text
                                    accumulated_text.append(final_text)
                        
                        # 生成最终结果（合并所有累积文本）
                        final_full_text = ' '.join(accumulated_text)
                        
                        # 对完整文本进行最终标点优化
                        if final_full_text:
                            try:
                                final_punc_result = models['punc'].generate(input=final_full_text)
                                if final_punc_result and len(final_punc_result) > 0:
                                    final_full_text = final_punc_result[0].get('text', final_full_text)
                            except:
                                pass
                            
                            result = {
                                'text': final_full_text,
                                'is_final': True
                            }
                            ws.send(json.dumps(result, ensure_ascii=False))
                            logger.info(f"最终结果: {final_full_text}")
                        
                        # 重置缓冲区和累积文本
                        audio_buffer.clear()
                        accumulated_text.clear()
                        
                except json.JSONDecodeError:
                    logger.warning(f"无法解析命令: {data}")
    
    except Exception as e:
        logger.error(f"WebSocket 错误: {e}")
    
    finally:
        logger.info("WebSocket 连接关闭")


@app.route('/api/health', methods=['GET'])
def health():
    """
    健康检查接口
    
    返回示例:
    {
        "status": "ok",
        "service": "FunASR 语音识别 API",
        "version": "1.0.0",
        "models_loaded": ["vad", "asr_offline", "punc"],
        "model_path": "./models/iic",
        "timestamp": "2024-01-01 12:00:00"
    }
    """
    return jsonify({
        'status': 'ok',
        'service': 'FunASR 语音识别 API',
        'version': '1.0.0',
        'models_loaded': list(models.keys()),
        'model_path': str(MODELS_DIR),
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    })


@app.route('/api/models', methods=['GET'])
def get_models_info():
    """
    获取模型信息
    
    返回示例:
    {
        "models": {
            "vad": {"name": "VAD模型", "description": "语音活动检测"},
            "asr_offline": {"name": "ASR模型", "description": "语音识别（离线）"},
            "punc": {"name": "标点模型", "description": "标点恢复"}
        },
        "total": 3
    }
    """
    model_info = {
        'vad': {
            'name': 'VAD 语音活动检测模型',
            'description': '检测音频中的语音片段，过滤静音和噪音',
            'model_path': 'speech_fsmn_vad_zh-cn-16k-common-pytorch'
        },
        'asr_offline': {
            'name': 'ASR 离线识别模型',
            'description': '高精度中文语音识别（Paraformer-Large）',
            'model_path': 'speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-pytorch'
        },
        'punc': {
            'name': '标点恢复模型',
            'description': '为识别文本自动添加标点符号',
            'model_path': 'punc_ct-transformer_zh-cn-common-vad_realtime-vocab272727'
        }
    }
    
    return jsonify({
        'models': model_info,
        'total': len(model_info),
        'status': 'loaded' if models else 'not_loaded'
    })


@app.route('/api/transcribe', methods=['POST'])
def transcribe_audio():
    """
    音频文件识别接口（RESTful API）
    
    请求格式:
    {
        "audio": "base64编码的音频数据",
        "format": "wav",  // 可选：wav, pcm
        "sample_rate": 16000,  // 可选：默认16000
        "add_punctuation": true  // 可选：是否添加标点
    }
    
    或使用 multipart/form-data 上传文件:
    - file: 音频文件
    
    返回示例:
    {
        "success": true,
        "text": "识别的文本内容。",
        "raw_text": "识别的文本内容",
        "duration": 3.5,
        "has_speech": true
    }
    """
    try:
        audio_data = None
        
        # 方式1: JSON 格式（base64编码）
        if request.is_json:
            data = request.get_json()
            audio_base64 = data.get('audio')
            if not audio_base64:
                return jsonify({'success': False, 'error': '缺少 audio 参数'}), 400
            
            # 解码 base64
            audio_bytes = base64.b64decode(audio_base64)
            audio_data = np.frombuffer(audio_bytes, dtype=np.int16)
            add_punc = data.get('add_punctuation', True)
        
        # 方式2: 文件上传
        elif 'file' in request.files:
            file = request.files['file']
            audio_bytes = file.read()
            audio_data = np.frombuffer(audio_bytes, dtype=np.int16)
            add_punc = request.form.get('add_punctuation', 'true').lower() == 'true'
        
        else:
            return jsonify({'success': False, 'error': '请提供音频数据（JSON 或文件上传）'}), 400
        
        # 转换为 float32 并归一化
        audio_float = audio_data.astype(np.float32) / 32768.0
        duration = len(audio_float) / 16000.0
        
        logger.info(f"收到音频识别请求，时长: {duration:.2f}秒")
        
        # 1. VAD 检测
        vad_result = models['vad'].generate(input=audio_float)
        has_speech = False
        if vad_result and len(vad_result) > 0:
            vad_segments = vad_result[0].get('value', [])
            has_speech = len(vad_segments) > 0
        
        if not has_speech:
            return jsonify({
                'success': True,
                'text': '',
                'raw_text': '',
                'duration': duration,
                'has_speech': False,
                'message': '未检测到语音活动'
            })
        
        # 2. ASR 识别
        asr_result = models['asr_offline'].generate(
            input=audio_float,
            batch_size=1
        )
        
        if not asr_result or len(asr_result) == 0:
            return jsonify({
                'success': True,
                'text': '',
                'raw_text': '',
                'duration': duration,
                'has_speech': True,
                'message': '识别结果为空'
            })
        
        raw_text = asr_result[0].get('text', '').strip()
        final_text = raw_text
        
        # 3. 添加标点（可选）
        if add_punc and raw_text:
            try:
                punc_result = models['punc'].generate(input=raw_text)
                if punc_result and len(punc_result) > 0:
                    final_text = punc_result[0].get('text', raw_text)
            except Exception as e:
                logger.warning(f"标点添加失败: {e}")
        
        logger.info(f"✅ 识别成功: {final_text}")
        
        return jsonify({
            'success': True,
            'text': final_text,
            'raw_text': raw_text,
            'duration': duration,
            'has_speech': True
        })
    
    except Exception as e:
        logger.error(f"❌ 音频识别失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/punctuate', methods=['POST'])
def add_punctuation():
    """
    文本标点恢复接口
    
    请求格式:
    {
        "text": "需要添加标点的文本"
    }
    
    返回示例:
    {
        "success": true,
        "original_text": "需要添加标点的文本",
        "punctuated_text": "需要添加标点的文本。"
    }
    """
    try:
        if not request.is_json:
            return jsonify({'success': False, 'error': '请使用 JSON 格式'}), 400
        
        data = request.get_json()
        text = data.get('text', '').strip()
        
        if not text:
            return jsonify({'success': False, 'error': '缺少 text 参数'}), 400
        
        logger.info(f"收到标点恢复请求: {text}")
        
        # 使用标点模型
        punc_result = models['punc'].generate(input=text)
        
        if punc_result and len(punc_result) > 0:
            punctuated_text = punc_result[0].get('text', text)
        else:
            punctuated_text = text
        
        logger.info(f"✅ 标点恢复完成: {punctuated_text}")
        
        return jsonify({
            'success': True,
            'original_text': text,
            'punctuated_text': punctuated_text
        })
    
    except Exception as e:
        logger.error(f"❌ 标点恢复失败: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


if __name__ == '__main__':
    print("=" * 80)
    print("🚀 FunASR 语音识别 API 服务启动中...")
    print("=" * 80)
    print("")
    print("📡 服务信息:")
    print(f"   服务地址: http://localhost:10095")
    print(f"   模型路径: {MODELS_DIR}")
    print(f"   已加载模型: {list(models.keys())}")
    print("")
    print("🔌 API 接口:")
    print("   [WebSocket] ws://localhost:10095/asr              - 实时流式识别")
    print("   [POST]      http://localhost:10095/api/transcribe - 音频文件识别")
    print("   [POST]      http://localhost:10095/api/punctuate  - 文本标点恢复")
    print("   [GET]       http://localhost:10095/api/health     - 健康检查")
    print("   [GET]       http://localhost:10095/api/models     - 模型信息")
    print("")
    print("💡 使用示例:")
    print("   # 健康检查")
    print("   curl http://localhost:10095/api/health")
    print("")
    print("   # 文件识别")
    print("   curl -X POST http://localhost:10095/api/transcribe \\")
    print("        -F 'file=@audio.wav'")
    print("")
    print("   # 标点恢复")
    print("   curl -X POST http://localhost:10095/api/punctuate \\")
    print("        -H 'Content-Type: application/json' \\")
    print("        -d '{\"text\": \"你好世界\"}'")
    print("")
    print("=" * 80)
    print("✅ 服务已启动，等待连接...")
    print("=" * 80)
    
    # 启动 Flask 应用（端口改为 10095，匹配前端配置）
    app.run(
        host='0.0.0.0',
        port=10095,
        debug=False,
        threaded=True
    )

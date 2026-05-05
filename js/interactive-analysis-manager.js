/**
 * 交互式分析工具管理器
 * 用于处理用户交互操作，如点击设置观察点、绘制分析区域等
 */
class InteractiveAnalysisManager {
    constructor(viewer, scene, digitalTwinAnalysis) {
        this.viewer = viewer;
        this.scene = scene;
        this.digitalTwinAnalysis = digitalTwinAnalysis;
        
        // 事件处理器
        this.handler = null;
        
        // 当前交互模式
        this.currentMode = null; // 'viewshed', 'sightline', 'profile', 'excavation', 'measurement'
        
        // 交互状态
        this.isActive = false;
        this.points = [];
        this.currentStep = 0;
        
        // 临时实体
        this.tempEntities = [];
        
        // 回调函数
        this.onViewshedComplete = null;
        this.onClipPlaneComplete = null;
        
        this.init();
    }
    
    /**
     * 初始化交互管理器
     */
    init() {
        try {
            // 创建事件处理器
            this.handler = new SuperMap3D.ScreenSpaceEventHandler(this.scene.canvas);
            
            // 绑定鼠标事件
            this.bindEvents();
            
            // console.log('✅ 交互式分析管理器初始化成功');
        } catch (error) {
            console.error('❌ 交互式分析管理器初始化失败:', error);
        }
    }
    
    /**
     * 绑定事件
     */
    bindEvents() {
        // 左键点击事件
        this.handler.setInputAction((event) => {
            if (!this.isActive) return;
            
            const pickedPosition = this.pickPosition(event.position);
            if (pickedPosition) {
                this.handleClick(pickedPosition);
            }
        }, SuperMap3D.ScreenSpaceEventType.LEFT_CLICK);
        
        // 右键点击事件（完成操作）
        this.handler.setInputAction((event) => {
            if (!this.isActive) return;
            this.completeOperation();
        }, SuperMap3D.ScreenSpaceEventType.RIGHT_CLICK);
        
        // 鼠标移动事件
        this.handler.setInputAction((event) => {
            if (!this.isActive) return;
            
            const pickedPosition = this.pickPosition(event.endPosition);
            if (pickedPosition) {
                this.handleMouseMove(pickedPosition);
            }
        }, SuperMap3D.ScreenSpaceEventType.MOUSE_MOVE);
    }
    
    /**
     * 拾取位置
     */
    pickPosition(windowPosition) {
        try {
            // 首先尝试拾取3D模型对象（优先级最高）
            const pickedObject = this.scene.pick(windowPosition);
            if (SuperMap3D.defined(pickedObject)) {
                // 使用pickPosition获取精确的模型表面位置
                const modelPosition = this.scene.pickPosition(windowPosition);
                if (modelPosition) {
                    // 拾取到模型表面位置
                    return modelPosition;
                }
            }
            
            // 如果没有拾取到模型，尝试拾取地形
            const terrainPosition = this.viewer.camera.pickEllipsoid(windowPosition, this.scene.globe.ellipsoid);
            if (terrainPosition) {
                // 拾取到地形位置
                return terrainPosition;
            }
            
            // 最后尝试使用射线与地球椭球面求交
            const ray = this.viewer.camera.getPickRay(windowPosition);
            if (ray) {
                const intersection = this.scene.globe.pick(ray, this.scene);
                if (intersection) {
                    // 通过射线拾取到位置
                    return intersection;
                }
            }
            
            console.warn('⚠️ 未能拾取到有效位置');
            return null;
        } catch (error) {
            console.warn('❌ 位置拾取失败:', error);
            return null;
        }
    }
    
    /**
     * 处理点击事件
     */
    handleClick(position) {
        switch (this.currentMode) {
            case 'viewshed':
                this.handleViewshedClick(position);
                break;
            case 'clipplane':
                this.handleClipPlaneClick(position);
                break;
            case 'sightline':
                this.handleSightlineClick(position);
                break;
            case 'sightline-multi':
                this.handleMultiSightlineClick(position);
                break;
            case 'sightline-viewpoint':
                this.handleSightlineViewPointClick(position);
                break;
            case 'sightline-targetpoint':
                this.handleSightlineTargetPointClick(position);
                break;
            case 'profile':
                this.handleProfileClick(position);
                break;

            case 'measurement-distance':
                this.handleDistanceMeasurementClick(position);
                break;
            case 'measurement-area':
                this.handleAreaMeasurementClick(position);
                break;
        }
    }
    
    /**
     * 启动可视域分析
     */
    startViewshedAnalysis() {
        try {
            this.currentMode = 'viewshed';
            this.isActive = true;
            this.points = [];
            this.currentStep = 0;
            
            // console.log('✅ 启动可视域分析交互模式');
        } catch (error) {
            console.error('❌ 启动可视域分析失败:', error);
        }
    }

    /**
     * 启动裁剪面绘制
     */
    startClipPlaneDrawing() {
        try {
            this.currentMode = 'clipplane';
            this.isActive = true;
            this.points = [];
            this.currentStep = 0;
            
            // console.log('✅ 启动裁剪面绘制交互模式');
        } catch (error) {
            console.error('❌ 启动裁剪面绘制失败:', error);
        }
    }

    /**
     * 处理可视域分析点击
     */
    handleViewshedClick(position) {
        // 设置观察点
        this.addTempPoint(position, '观察点', SuperMap3D.Color.YELLOW);
        
        // 执行可视域分析
        this.digitalTwinAnalysis.performViewshedAnalysis(position);
        
        // 调用完成回调
        if (this.onViewshedComplete && typeof this.onViewshedComplete === 'function') {
            this.onViewshedComplete();
        }
        
        // 完成操作
        this.completeOperation();
    }

    /**
     * 处理裁剪面绘制点击
     */
    handleClipPlaneClick(position) {
        // 添加点到裁剪面路径
        this.points.push(position);
        
        // 添加临时点标记
        this.addTempPoint(position, `点${this.points.length}`, SuperMap3D.Color.RED);
        
        // 如果有多个点，绘制临时线条
        if (this.points.length > 1) {
            this.drawTempLine();
        }
        
        // 添加裁剪面点
    }
    
    /**
     * 处理通视分析点击
     */
    handleSightlineClick(position) {
        if (this.currentStep === 0) {
            // 设置起点
            this.points.push(position);
            this.addTempPoint(position, '起点', SuperMap3D.Color.LIME);
            this.currentStep = 1;
            this.showMessage('请点击设置终点');
        } else if (this.currentStep === 1) {
            // 设置终点
            this.points.push(position);
            this.addTempPoint(position, '终点', SuperMap3D.Color.ORANGE);
            
            // 执行通视分析
            this.digitalTwinAnalysis.performSightlineAnalysis(this.points[0], this.points[1]);
            
            // 完成操作
            this.completeOperation();
        }
    }
    
    /**
     * 处理多点通视分析点击
     */
    handleMultiSightlineClick(position) {
        try {
            if (this.currentStep === 0) {
                // 设置观察点
                if (this.digitalTwinAnalysis && this.digitalTwinAnalysis.setSightlineViewPoint) {
                    const success = this.digitalTwinAnalysis.setSightlineViewPoint(position);
                    if (success) {
                        // 不再添加临时点，因为setSightlineViewPoint方法已经创建了永久标记
                        this.currentStep = 1;
                        this.points = [position]; // 保存观察点
                        this.showMessage('观察点已设置，请点击添加目标点（可添加多个）');
                    } else {
                        this.showMessage('观察点设置失败，请重新点击');
                    }
                }
            } else if (this.currentStep === 1) {
                // 添加目标点
                if (this.digitalTwinAnalysis && this.digitalTwinAnalysis.addSightlineTargetPoint) {
                    const success = this.digitalTwinAnalysis.addSightlineTargetPoint(position);
                    if (success) {
                        // 不再添加临时点，因为addSightlineTargetPoint方法已经创建了永久标记
                        this.points.push(position);
                        this.showMessage(`目标点${this.points.length - 1}已添加，可继续添加更多目标点或右键完成`);
                    } else {
                        this.showMessage('目标点添加失败，请重新点击');
                    }
                }
            }
        } catch (error) {
            console.error('❌ 处理多点通视分析点击失败:', error);
            this.showMessage('操作失败: ' + error.message);
        }
    }

    /**
     * 处理通视分析观察点点击
     */
    handleSightlineViewPointClick(position) {
        try {
            // 只调用setSightlineViewPoint，它会处理标记的添加
            // 不再调用addTempPoint避免重复标记
            if (this.digitalTwinAnalysis && this.digitalTwinAnalysis.setSightlineViewPoint) {
                const success = this.digitalTwinAnalysis.setSightlineViewPoint(position);
                if (success) {
                    // console.log('✅ 观察点设置成功');
                    this.showMessage('观察点已设置，请继续添加目标点');
                    // 切换到目标点添加模式，但不停止交互
                    this.currentMode = 'sightline-targetpoint';
                } else {
                    console.warn('⚠️ 观察点设置失败');
                    this.showMessage('观察点设置失败');
                }
            }
        } catch (error) {
            console.error('❌ 处理观察点点击失败:', error);
            this.showMessage('观察点设置失败: ' + error.message);
        }
    }

    /**
     * 处理通视分析目标点点击
     */
    handleSightlineTargetPointClick(position) {
        try {
            // 只调用addSightlineTargetPoint，它会处理标记的添加
            // 不再调用addTempPoint避免重复标记
            if (this.digitalTwinAnalysis && this.digitalTwinAnalysis.addSightlineTargetPoint) {
                const success = this.digitalTwinAnalysis.addSightlineTargetPoint(position);
                if (success) {
                    // console.log('✅ 目标点添加成功');
                    this.showMessage('目标点已添加，可继续添加更多目标点或右键完成');
                    // 保持在目标点添加模式，不停止交互
                } else {
                    console.warn('⚠️ 目标点添加失败');
                    this.showMessage('目标点添加失败');
                }
            }
        } catch (error) {
            console.error('❌ 处理目标点点击失败:', error);
            this.showMessage('目标点添加失败: ' + error.message);
        }
    }
    
    /**
     * 处理剖面分析点击
     */
    handleProfileClick(position) {
        this.points.push(position);
        this.addTempPoint(position, `点${this.points.length}`, SuperMap3D.Color.CYAN);
        
        if (this.points.length >= 2) {
            this.showMessage('右键完成剖面线绘制，或继续点击添加更多点');
        } else {
            this.showMessage('请继续点击添加剖面点');
        }
    }
    

    
    /**
     * 处理距离测量点击
     */
    handleDistanceMeasurementClick(position) {
        this.points.push(position);
        this.addTempPoint(position, `点${this.points.length}`, SuperMap3D.Color.BLUE);
        
        if (this.points.length >= 2) {
            this.showMessage('右键完成距离测量，或继续点击添加更多点');
        } else {
            this.showMessage('请继续点击添加测量点');
        }
    }
    
    /**
     * 处理面积测量点击
     */
    handleAreaMeasurementClick(position) {
        this.points.push(position);
        this.addTempPoint(position, `点${this.points.length}`, SuperMap3D.Color.PURPLE);
        
        if (this.points.length >= 3) {
            this.showMessage('右键完成面积测量，或继续点击添加更多点');
        } else {
            this.showMessage('请继续点击添加测量点');
        }
    }
    
    /**
     * 处理鼠标移动事件
     */
    handleMouseMove(position) {
        // 可以在这里添加动态预览功能
        // 例如显示临时线条、面等
    }
    
    /**
     * 添加临时点标记
     */
    addTempPoint(position, label, color) {
        try {
            // 添加临时点标记
            
            const entity = this.viewer.entities.add({
                position: position,
                point: {
                    pixelSize: 12,
                    color: color,
                    outlineColor: SuperMap3D.Color.BLACK,
                    outlineWidth: 2,
                    heightReference: SuperMap3D.HeightReference.CLAMP_TO_GROUND,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    scaleByDistance: new SuperMap3D.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.5)
                },
                label: {
                    text: label,
                    font: '14pt sans-serif',
                    fillColor: SuperMap3D.Color.WHITE,
                    outlineColor: SuperMap3D.Color.BLACK,
                    outlineWidth: 2,
                    style: SuperMap3D.LabelStyle.FILL_AND_OUTLINE,
                    pixelOffset: new SuperMap3D.Cartesian2(0, -40),
                    heightReference: SuperMap3D.HeightReference.CLAMP_TO_GROUND,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    scaleByDistance: new SuperMap3D.NearFarScalar(1.5e2, 1.0, 1.5e7, 0.5)
                }
            });
            
            this.tempEntities.push(entity);
            // 临时点标记添加成功
            
            return entity;
        } catch (error) {
            console.error('❌ 添加临时点标记失败:', error);
            return null;
        }
    }
    
    /**
     * 绘制临时线条
     */
    drawTempLine() {
        try {
            if (this.points.length < 2) return;
            
            // 移除之前的临时线条
            this.tempEntities = this.tempEntities.filter(entity => {
                if (entity.polyline && !entity.label) {
                    this.viewer.entities.remove(entity);
                    return false;
                }
                return true;
            });
            
            // 绘制新的临时线条
            const entity = this.viewer.entities.add({
                polyline: {
                    positions: this.points,
                    width: 2,
                    material: SuperMap3D.Color.CYAN.withAlpha(0.8),
                    clampToGround: true
                }
            });
            
            this.tempEntities.push(entity);
            // 绘制临时线条成功
            
        } catch (error) {
            console.error('❌ 绘制临时线条失败:', error);
        }
    }

    /**
     * 完成当前操作
     */
    completeOperation() {
        switch (this.currentMode) {
            case 'clipplane':
                if (this.points.length >= 3) {
                    // 执行裁剪面绘制
                    this.digitalTwinAnalysis.drawClipPlane(this.points);
                    
                    // 调用完成回调
                    if (this.onClipPlaneComplete && typeof this.onClipPlaneComplete === 'function') {
                        this.onClipPlaneComplete();
                    }
                }
                break;
            case 'profile':
                if (this.points.length >= 2) {
                    this.digitalTwinAnalysis.performProfileAnalysis(this.points);
                }
                break;

            case 'measurement-distance':
                if (this.points.length >= 2) {
                    this.digitalTwinAnalysis.measureDistance(this.points);
                }
                break;
            case 'measurement-area':
                if (this.points.length >= 3) {
                    this.digitalTwinAnalysis.measureArea(this.points);
                }
                break;
            case 'sightline-multi':
                if (this.points.length >= 2) {
                    // 执行多点通视分析
                    const viewPoint = this.points[0]; // 第一个点是观察点
                    const targetPoints = this.points.slice(1); // 其余点是目标点
                    
                    this.digitalTwinAnalysis.performMultiSightlineAnalysis(viewPoint, targetPoints);
                }
                break;
            case 'sightline-targetpoint':
                // 对于目标点模式，需要检查是否已经设置了观察点
                if (this.digitalTwinAnalysis && this.digitalTwinAnalysis.sightlineViewPoint) {
                    // 获取所有已添加的目标点
                    const targetPoints = this.digitalTwinAnalysis.sightlineTargetPoints || [];
                    if (targetPoints.length > 0) {
                        // 执行多点通视分析
                        this.digitalTwinAnalysis.performMultiSightlineAnalysis(
                            this.digitalTwinAnalysis.sightlineViewPoint,
                            targetPoints
                        );
                        console.log('✅ 自动执行多点通视分析完成');
                    } else {
                        console.warn('⚠️ 没有找到目标点，无法执行通视分析');
                    }
                } else {
                    console.warn('⚠️ 请先设置观察点，再添加目标点');
                }
                break;
        }
        
        this.stopInteraction();
    }
    
    /**
     * 开始交互
     */
    startInteraction(mode) {
        this.stopInteraction(); // 先停止之前的交互
        
        this.currentMode = mode;
        this.isActive = true;
        this.points = [];
        this.currentStep = 0;
        
        // 显示提示信息
        this.showModeInstructions(mode);
        
        // 改变鼠标样式
        this.scene.canvas.style.cursor = 'crosshair';
        
        // console.log('✅ 开始交互');
    }
    
    /**
     * 停止交互
     */
    stopInteraction() {
        const previousMode = this.currentMode;
        this.isActive = false;
        this.currentMode = null;
        this.points = [];
        this.currentStep = 0;
        
        // 只有在非通视分析模式下才清除临时实体
        // 通视分析的实体由专门的清除方法处理
        if (previousMode && !previousMode.includes('sightline')) {
            this.clearTempEntities();
        }
        
        // 恢复鼠标样式
        this.scene.canvas.style.cursor = 'default';
        
        // 隐藏提示信息
        this.hideMessage();
        
        // console.log('✅ 停止交互');
    }
    
    /**
     * 绘制通视线
     */
    drawSightline(startPosition, endPosition) {
        try {
            // 绘制通视线
            
            const entity = this.viewer.entities.add({
                polyline: {
                    positions: [startPosition, endPosition],
                    width: 3,
                    material: SuperMap3D.Color.YELLOW.withAlpha(0.8),
                    clampToGround: false,
                    heightReference: SuperMap3D.HeightReference.NONE
                }
            });
            
            this.tempEntities.push(entity);
            // 通视线绘制成功
            
            return entity;
        } catch (error) {
            console.error('❌ 绘制通视线失败:', error);
            return null;
        }
    }
    
    /**
     * 清除临时实体
     */
    clearTempEntities() {
        try {
            // 开始清除临时实体
            
            this.tempEntities.forEach(entity => {
                if (this.viewer.entities.contains(entity)) {
                    this.viewer.entities.remove(entity);
                    // 清除临时实体
                }
            });
            
            this.tempEntities = [];
            
            // 如果是通视分析模式，调用专门的清除方法
            if (this.currentMode && this.currentMode.includes('sightline')) {
                if (this.digitalTwinAnalysis && this.digitalTwinAnalysis.clearSightlineAnalysis) {
                    this.digitalTwinAnalysis.clearSightlineAnalysis();
                    // 调用通视分析专门清除方法
                }
                
                // 额外的兜底清理 - 清除可能遗漏的实体
                const entitiesToRemove = [];
                this.viewer.entities.values.forEach(entity => {
                    let shouldRemove = false;
                    
                    // 检查ID是否包含通视分析标识
                    if (entity.id && (entity.id.includes('sightline') || entity.id.includes('通视'))) {
                        shouldRemove = true;
                    }
                    
                    // 检查标签文本
                    if (entity.label && entity.label.text && entity.label.text._value) {
                        const labelText = entity.label.text._value;
                        if (labelText.includes('观察点') || labelText.includes('目标点') || 
                            labelText.includes('起点') || labelText.includes('终点')) {
                            shouldRemove = true;
                        }
                    }
                    
                    // 检查是否是通视线条（仅清除临时的两点连线）
                    if (entity.polyline && !entity.label && entity.polyline.positions && 
                        entity.polyline.positions._value && entity.polyline.positions._value.length === 2) {
                        shouldRemove = true;
                    }
                    
                    if (shouldRemove) {
                        entitiesToRemove.push(entity);
                    }
                });
                
                entitiesToRemove.forEach(entity => {
                    try {
                        this.viewer.entities.remove(entity);
                        console.log('🗑️ 清除遗漏的通视分析实体:', 
                            entity.label ? entity.label.text._value : 
                            (entity.id || '通视线条'));
                    } catch (removeError) {
                        console.warn('清除实体时出错:', removeError);
                    }
                });
            }
            
            console.log('✅ 临时实体清除完成');
            
        } catch (error) {
            console.error('❌ 清除临时实体失败:', error);
            // 强制清空数组，避免内存泄漏
            this.tempEntities = [];
        }
    }
    
    /**
     * 显示模式说明
     */
    showModeInstructions(mode) {
        const instructions = {
            'viewshed': '请点击设置观察点',
            'sightline': '请点击设置起点',
            'sightline-viewpoint': '请点击地图设置观察点',
            'sightline-targetpoint': '请点击地图添加目标点',
            'sightline-multi': '请点击设置观察点',
            'profile': '请点击设置剖面线起点',

            'measurement-distance': '请点击设置测量起点',
            'measurement-area': '请点击设置测量区域顶点'
        };
        
        this.showMessage(instructions[mode] || '请点击开始操作');
    }
    
    /**
     * 获取模式显示名称
     */
    getModeDisplayName(mode) {
        const names = {
            'viewshed': '可视域分析',
            'sightline': '通视分析',
            'sightline-viewpoint': '通视分析-添加观察点',
            'sightline-targetpoint': '通视分析-添加目标点',
            'profile': '剖面分析',

            'measurement-distance': '距离测量',
            'measurement-area': '面积测量'
        };
        
        return names[mode] || mode;
    }
    
    /**
     * 显示消息
     */
    showMessage(message) {
        // console.log('💡 ' + message);
        
        // 显示交互提示消息
        const messageElement = document.getElementById('interactionMessage');
        const messageText = document.getElementById('messageText');
        
        if (messageElement && messageText) {
            messageText.textContent = message;
            messageElement.style.display = 'block';
        }
    }
    
    /**
     * 隐藏消息
     */
    hideMessage() {
        const messageElement = document.getElementById('interactionMessage');
        if (messageElement) {
            messageElement.style.display = 'none';
        }
    }
    
    /**
     * 销毁管理器
     */
    destroy() {
        this.stopInteraction();
        
        if (this.handler) {
            this.handler.destroy();
            this.handler = null;
        }
        
        // console.log('🗑️ 交互式分析管理器已销毁');
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InteractiveAnalysisManager;
}
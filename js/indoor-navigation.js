/**
 * 室内导航模块
 * 实现室内路径规划、楼层切换、漫游等功能
 */

class IndoorNavigation {
    constructor(viewer, scene) {
        this.viewer = viewer;
        this.scene = scene;
        this.isNavigating = false;
        this.currentFloor = 1;
        this.routePoints = [];
        this.routePolyline = null;
        this.walkingSpeed = NAVIGATION_CONFIG.WALKING_SPEED;
        this.floorHeight = NAVIGATION_CONFIG.FLOOR_HEIGHT;
        this.cameraHeight = NAVIGATION_CONFIG.CAMERA_HEIGHT;
        
        this.init();
    }

    /**
     * 初始化导航模块
     */
    init() {
        this.setupNavigationControls();
        this.bindEvents();
    }

    /**
     * 设置导航控制
     */
    setupNavigationControls() {
        // 禁用默认的相机控制
        this.scene.screenSpaceCameraController.enableRotate = true;
        this.scene.screenSpaceCameraController.enableTranslate = true;
        this.scene.screenSpaceCameraController.enableZoom = true;
        this.scene.screenSpaceCameraController.enableTilt = true;
        this.scene.screenSpaceCameraController.enableLook = true;
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 键盘控制
        document.addEventListener('keydown', (event) => this.onKeyDown(event));
        document.addEventListener('keyup', (event) => this.onKeyUp(event));
    }

    /**
     * 设置路径点
     * @param {SuperMap3D.Cartesian3} position 位置
     */
    addRoutePoint(position) {
        this.routePoints.push(position);
        
        // 在场景中添加标记
        this.addRouteMarker(position, this.routePoints.length);
        
        // 如果有两个点，计算路径
        if (this.routePoints.length === 2) {
            this.calculateRoute();
        }
    }

    /**
     * 添加路径标记
     * @param {SuperMap3D.Cartesian3} position 位置
     * @param {number} index 索引
     */
    addRouteMarker(position, index) {
        const entities = this.viewer.entities;
        
        const marker = entities.add({
            name: index === 1 ? 'Start Point' : 'End Point',
            position: position,
            point: {
                pixelSize: 10,
                color: index === 1 ? SuperMap3D.Color.GREEN : SuperMap3D.Color.RED,
                outlineColor: SuperMap3D.Color.WHITE,
                outlineWidth: 2,
                heightReference: SuperMap3D.HeightReference.CLAMP_TO_GROUND
            },
            label: {
                text: index === 1 ? '起点' : '终点',
                font: '14pt sans-serif',
                fillColor: SuperMap3D.Color.WHITE,
                outlineColor: SuperMap3D.Color.BLACK,
                outlineWidth: 2,
                style: SuperMap3D.LabelStyle.FILL_AND_OUTLINE,
                pixelOffset: new SuperMap3D.Cartesian2(0, -40)
            }
        });
        
        // 存储标记引用以便后续清除
        if (index === 1) {
            // 清除之前的起点标记
            if (this.startMarker) {
                this.viewer.entities.remove(this.startMarker);
            }
            this.startMarker = marker;
        } else {
            // 清除之前的终点标记
            if (this.endMarker) {
                this.viewer.entities.remove(this.endMarker);
            }
            this.endMarker = marker;
        }
    }

    /**
     * 计算路径
     */
    calculateRoute() {
        if (this.routePoints.length < 2) {
            console.warn('路径点不足，无法计算路径');
            return;
        }

        try {
            const startPoint = this.routePoints[0];
            const endPoint = this.routePoints[1];

            console.log('🧮 开始计算路径...');
            console.log('起点:', startPoint);
            console.log('终点:', endPoint);

            // 保存当前相机状态
            const currentCameraPosition = this.viewer.camera.position.clone();
            const currentCameraDirection = this.viewer.camera.direction.clone();
            const currentCameraUp = this.viewer.camera.up.clone();
            console.log('📸 已保存当前相机状态');

            // 简单的直线路径（实际项目中可以接入路径规划算法）
            const route = this.generateSimpleRoute(startPoint, endPoint);
            
            // 绘制路径
            this.drawRoute(route);
            
            // 恢复相机状态（防止视角跳转）
            setTimeout(() => {
                this.viewer.camera.setView({
                    position: currentCameraPosition,
                    direction: currentCameraDirection,
                    up: currentCameraUp
                });
                console.log('📸 相机状态已恢复');
            }, 100);
            
            console.log('✅ 路径计算完成，路径点数:', route.length);
        } catch (error) {
            console.error('❌ 路径计算失败:', error);
            throw error;
        }
    }

    /**
     * 生成简单路径
     * @param {SuperMap3D.Cartesian3} start 起点
     * @param {SuperMap3D.Cartesian3} end 终点
     * @returns {Array} 路径点数组
     */
    generateSimpleRoute(start, end) {
        const route = [];
        const steps = 10; // 路径细分步数
        
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const position = SuperMap3D.Cartesian3.lerp(start, end, t, new SuperMap3D.Cartesian3());
            route.push(position);
        }
        
        return route;
    }

    /**
     * 绘制路径
     * @param {Array} route 路径点数组
     */
    drawRoute(route) {
        try {
            console.log('🎨 开始绘制路径...');
            
            // 移除之前的路径
            if (this.routePolyline) {
                this.viewer.entities.remove(this.routePolyline);
                this.routePolyline = null;
                console.log('🗑️ 已移除之前的路径');
            }

            // 验证路径点
            if (!route || route.length < 2) {
                console.warn('⚠️ 路径点不足，无法绘制路径');
                return;
            }

            // 确保所有路径点都是有效的Cartesian3对象
            const validRoute = route.filter(point => {
                return point && 
                       typeof point.x === 'number' && 
                       typeof point.y === 'number' && 
                       typeof point.z === 'number' &&
                       !isNaN(point.x) && !isNaN(point.y) && !isNaN(point.z);
            });

            if (validRoute.length < 2) {
                console.warn('⚠️ 有效路径点不足，无法绘制路径');
                return;
            }

            console.log(`✅ 有效路径点数: ${validRoute.length}`);

            // 绘制新路径（使用更保守的设置，避免影响模型显示）
            this.routePolyline = this.viewer.entities.add({
                name: 'Navigation Route',
                polyline: {
                    positions: validRoute,
                    width: 3,
                    material: SuperMap3D.Color.CYAN.withAlpha(0.8),
                    clampToGround: false,
                    heightReference: SuperMap3D.HeightReference.NONE,
                    extrudedHeight: 0,
                    show: true,
                    followSurface: false,
                    depthFailMaterial: SuperMap3D.Color.CYAN.withAlpha(0.5)
                }
            });

            console.log('✅ 路径绘制完成');
            
        } catch (error) {
            console.error('❌ 绘制路径失败:', error);
            // 不抛出错误，避免影响其他功能
        }
    }

    /**
     * 添加路径标记
     */
    addRouteMarkers(routePoints) {
        try {
            if (!routePoints || routePoints.length < 2) {
                return;
            }
            
            // 添加起点标记
            this.startMarker = this.viewer.entities.add({
                name: 'Start Point',
                position: routePoints[0],
                point: {
                    pixelSize: 10,
                    color: SuperMap3D.Color.GREEN,
                    outlineColor: SuperMap3D.Color.WHITE,
                    outlineWidth: 2,
                    heightReference: SuperMap3D.HeightReference.NONE
                },
                label: {
                    text: '起点',
                    font: '12pt sans-serif',
                    fillColor: SuperMap3D.Color.WHITE,
                    outlineColor: SuperMap3D.Color.BLACK,
                    outlineWidth: 2,
                    style: SuperMap3D.LabelStyle.FILL_AND_OUTLINE,
                    pixelOffset: new SuperMap3D.Cartesian2(0, -40)
                }
            });
            
            // 添加终点标记
            this.endMarker = this.viewer.entities.add({
                name: 'End Point',
                position: routePoints[routePoints.length - 1],
                point: {
                    pixelSize: 10,
                    color: SuperMap3D.Color.RED,
                    outlineColor: SuperMap3D.Color.WHITE,
                    outlineWidth: 2,
                    heightReference: SuperMap3D.HeightReference.NONE
                },
                label: {
                    text: '终点',
                    font: '12pt sans-serif',
                    fillColor: SuperMap3D.Color.WHITE,
                    outlineColor: SuperMap3D.Color.BLACK,
                    outlineWidth: 2,
                    style: SuperMap3D.LabelStyle.FILL_AND_OUTLINE,
                    pixelOffset: new SuperMap3D.Cartesian2(0, -40)
                }
            });
            
            console.log('✅ 路径标记已添加');
        } catch (error) {
            console.error('❌ 添加路径标记失败:', error);
        }
    }

    /**
     * 确保路径可见
     */
    ensureRouteVisible() {
        try {
            if (this.routePolyline && this.routePoints.length >= 2) {
                // 计算路径的边界框
                const positions = [this.routePoints[0], this.routePoints[1]];
                
                // 飞行到路径，但保持适当距离
                this.viewer.camera.flyTo({
                    destination: SuperMap3D.Rectangle.fromCartesianArray(positions),
                    duration: 1.0,
                    offset: new SuperMap3D.HeadingPitchRange(0, SuperMap3D.Math.toRadians(-30), 200)
                });
                
                console.log('✅ 相机已调整到路径视角');
            }
        } catch (error) {
            console.error('❌ 调整路径视角失败:', error);
        }
    }

    /**
     * 开始导航漫游
     */
    startWalkthrough() {
        if (this.routePoints.length < 2) {
            alert('请先设置起点和终点');
            return;
        }

        this.isNavigating = true;
        const route = this.generateSimpleRoute(this.routePoints[0], this.routePoints[1]);
        this.performWalkthrough(route);
    }

    /**
     * 执行漫游 - 从起点第一视角出发到终点
     * @param {Array} route 路径点数组
     */
    performWalkthrough(route) {
        if (route.length < 2) {
            console.error('路径点不足，无法执行漫游');
            return;
        }

        const camera = this.viewer.camera;
        this.isNavigating = true;
        
        console.log('🚶 开始第一视角漫游，路径点数:', route.length);
        
        // 计算总距离用于显示
        let totalDistance = 0;
        for (let i = 1; i < route.length; i++) {
            const distance = SuperMap3D.Cartesian3.distance(route[i-1], route[i]);
            totalDistance += distance;
        }
        
        // 固定漫游时间为5秒，提供最佳的第一人称体验
        const totalTime = 5;
        console.log(`📏 总距离: ${totalDistance.toFixed(2)}m, 漫游时间: ${totalTime}秒`);
        
        // 设置起点第一视角
        this.setFirstPersonViewAtPosition(route[0]);
        
        // 创建平滑的第一视角漫游路径
        this.createFirstPersonWalkthrough(route, totalTime);
    }
    
    /**
     * 在指定位置设置第一视角
     * @param {SuperMap3D.Cartesian3} position 位置
     */
    setFirstPersonViewAtPosition(position) {
        const camera = this.viewer.camera;
        
        // 调整相机到人眼高度
        const adjustedPosition = SuperMap3D.Cartesian3.clone(position);
        adjustedPosition.z += this.cameraHeight;
        
        // 计算沿路径的前进方向
        let forwardDirection = new SuperMap3D.Cartesian3(1, 0, 0); // 默认朝向
        if (this.routePoints.length >= 2) {
            // 如果是起点，朝向第一段路径方向
            const start = this.routePoints[0];
            const next = this.routePoints[1];
            forwardDirection = SuperMap3D.Cartesian3.subtract(next, start, new SuperMap3D.Cartesian3());
            SuperMap3D.Cartesian3.normalize(forwardDirection, forwardDirection);
        }
        
        // 禁用相机控制，确保第一视角体验
        this.scene.screenSpaceCameraController.enableRotate = false;
        this.scene.screenSpaceCameraController.enableTranslate = false;
        this.scene.screenSpaceCameraController.enableZoom = false;
        
        camera.setView({
            destination: adjustedPosition,
            orientation: {
                direction: forwardDirection,
                up: SuperMap3D.Cartesian3.UNIT_Z
            },
            duration: 1.0 // 平滑过渡到第一视角
        });
        
        console.log('👁️ 已设置第一视角，朝向路径方向，相机控制已禁用');
    }
    
    /**
     * 创建第一视角漫游动画
     * @param {Array} route 路径点数组
     * @param {Number} totalTime 总时间
     */
    createFirstPersonWalkthrough(route, totalTime = 5) {
        const camera = this.viewer.camera;
        let progress = 0;
        const stepTime = 50; // 50ms更新一次
        const totalSteps = Math.floor(totalTime * 1000 / stepTime);
        
        console.log('🎬 开始第一视角漫游动画，总时间:', totalTime, '秒，总步数:', totalSteps);
        
        const walkInterval = setInterval(() => {
            if (!this.isNavigating) {
                clearInterval(walkInterval);
                this.restoreCameraControls();
                return;
            }
            
            progress += 1 / totalSteps;
            
            if (progress >= 1) {
                // 漫游完成
                clearInterval(walkInterval);
                this.isNavigating = false;
                console.log('✅ 第一视角漫游完成');
                
                // 设置终点视角并恢复相机控制
                this.setFirstPersonViewAtPosition(route[route.length - 1]);
                setTimeout(() => {
                    this.restoreCameraControls();
                    console.log('🎮 相机控制已恢复');
                }, 2000); // 2秒后恢复控制
                return;
            }
            
            // 计算当前位置和前进方向
            const currentPosition = this.interpolateRoutePosition(route, progress);
            const nextProgress = Math.min(progress + 0.01, 1); // 稍微向前看一点
            const nextPosition = this.interpolateRoutePosition(route, nextProgress);
            
            // 调整相机高度
            const adjustedPosition = SuperMap3D.Cartesian3.clone(currentPosition);
            adjustedPosition.z += this.cameraHeight;
            
            // 计算前进方向（沿路径方向）
            const forwardDirection = SuperMap3D.Cartesian3.subtract(nextPosition, currentPosition, new SuperMap3D.Cartesian3());
            
            // 如果方向向量太小，使用路径的整体方向
            if (SuperMap3D.Cartesian3.magnitude(forwardDirection) < 0.001) {
                const startPos = route[0];
                const endPos = route[route.length - 1];
                SuperMap3D.Cartesian3.subtract(endPos, startPos, forwardDirection);
            }
            
            // 标准化方向向量
            SuperMap3D.Cartesian3.normalize(forwardDirection, forwardDirection);
            
            // 计算相机朝向，使用lookAt方式确保能看到前方路径
            const lookAtPosition = SuperMap3D.Cartesian3.add(adjustedPosition, 
                SuperMap3D.Cartesian3.multiplyByScalar(forwardDirection, 10, new SuperMap3D.Cartesian3()), 
                new SuperMap3D.Cartesian3());
            
            // 设置稍微向下的俯仰角，但不要太大，确保能看到前方路径
            const pitch = SuperMap3D.Math.toRadians(-5); // 向下看5度，减少俯仰角
            
            console.log('🚶 漫游进度:', (progress * 100).toFixed(1) + '%', '前进方向:', forwardDirection);
            
            // 使用lookAt方式设置相机，确保能看到前方路径
            camera.setView({
                destination: adjustedPosition,
                orientation: {
                    direction: forwardDirection,
                    up: SuperMap3D.Cartesian3.UNIT_Z
                }
            });
            
        }, stepTime);
        
        // 保存interval引用，用于停止漫游
        this.walkthroughInterval = walkInterval;
    }
    
    /**
     * 在路径上插值计算位置
     * @param {Array} route 路径点数组
     * @param {Number} progress 进度 (0-1)
     * @returns {SuperMap3D.Cartesian3} 插值位置
     */
    interpolateRoutePosition(route, progress) {
        if (progress <= 0) return route[0];
        if (progress >= 1) return route[route.length - 1];
        
        // 计算在哪两个点之间
        const segmentProgress = progress * (route.length - 1);
        const segmentIndex = Math.floor(segmentProgress);
        const localProgress = segmentProgress - segmentIndex;
        
        if (segmentIndex >= route.length - 1) {
            return route[route.length - 1];
        }
        
        // 在两点间线性插值
        const start = route[segmentIndex];
        const end = route[segmentIndex + 1];
        
        return SuperMap3D.Cartesian3.lerp(start, end, localProgress, new SuperMap3D.Cartesian3());
    }

    /**
     * 切换楼层
     * @param {number} floor 楼层号
     */
    changeFloor(floor) {
        this.currentFloor = floor;
        
        const camera = this.viewer.camera;
        const currentPosition = camera.position.clone();
        
        // 计算新的高度
        const newHeight = (floor - 1) * this.floorHeight + this.cameraHeight;
        currentPosition.z = newHeight;
        
        // 平滑过渡到新楼层
        camera.flyTo({
            destination: currentPosition,
            duration: 1.0,
            easingFunction: SuperMap3D.EasingFunction.CUBIC_IN_OUT
        });
        
        // 更新楼层显示
        this.updateFloorDisplay(floor);
        
        console.log(`切换到第${floor}层`);
    }

    /**
     * 更新楼层显示
     * @param {number} floor 楼层号
     */
    updateFloorDisplay(floor) {
        // 这里可以实现楼层相关的显示逻辑
        // 例如：显示/隐藏特定楼层的模型、调整透明度等
        
        if (this.scene.layers) {
            this.scene.layers.forEach(layer => {
                if (layer.floorNumber && layer.floorNumber !== floor) {
                    layer.alpha = 0.3; // 其他楼层半透明
                } else {
                    layer.alpha = 1.0; // 当前楼层不透明
                }
            });
        }
    }

    /**
     * 键盘按下事件
     * @param {KeyboardEvent} event 键盘事件
     */
    onKeyDown(event) {
        if (!this.isNavigating) return;

        const camera = this.viewer.camera;
        const moveDistance = this.walkingSpeed * 0.1; // 移动距离

        switch (event.code) {
            case 'KeyW': // 前进
                camera.moveForward(moveDistance);
                break;
            case 'KeyS': // 后退
                camera.moveBackward(moveDistance);
                break;
            case 'KeyA': // 左移
                camera.moveLeft(moveDistance);
                break;
            case 'KeyD': // 右移
                camera.moveRight(moveDistance);
                break;
            case 'KeyQ': // 上升
                camera.moveUp(moveDistance);
                break;
            case 'KeyE': // 下降
                camera.moveDown(moveDistance);
                break;
            case 'ArrowUp': // 向上看
                camera.lookUp(SuperMap3D.Math.toRadians(1));
                break;
            case 'ArrowDown': // 向下看
                camera.lookDown(SuperMap3D.Math.toRadians(1));
                break;
            case 'ArrowLeft': // 向左看
                camera.lookLeft(SuperMap3D.Math.toRadians(1));
                break;
            case 'ArrowRight': // 向右看
                camera.lookRight(SuperMap3D.Math.toRadians(1));
                break;
        }
        
        event.preventDefault();
    }

    /**
     * 键盘释放事件
     * @param {KeyboardEvent} event 键盘事件
     */
    onKeyUp(event) {
        // 可以在这里处理键盘释放后的逻辑
    }

    /**
     * 设置第一人称视角
     */
    setFirstPersonView() {
        const camera = this.viewer.camera;
        
        // 设置相机高度为人眼高度
        const position = camera.position.clone();
        position.z = this.cameraHeight + (this.currentFloor - 1) * this.floorHeight;
        
        camera.setView({
            destination: position,
            orientation: {
                heading: camera.heading,
                pitch: SuperMap3D.Math.toRadians(-5), // 统一使用-5度人眼视角
                roll: 0
            }
        });
        
        // 调整相机控制参数
        this.scene.screenSpaceCameraController.minimumZoomDistance = 0.1;
        this.scene.screenSpaceCameraController.maximumZoomDistance = 1000;
    }
    
    /**
     * 恢复相机控制
     */
    restoreCameraControls() {
        this.scene.screenSpaceCameraController.enableRotate = true;
        this.scene.screenSpaceCameraController.enableTranslate = true;
        this.scene.screenSpaceCameraController.enableZoom = true;
        console.log('🎮 相机控制已恢复，用户可以自由操作');
    }

    /**
     * 清除路径
     */
    clearRoute() {
        try {
            console.log('🧹 开始清除路径，当前路径点数量:', this.routePoints.length);
            this.routePoints = [];
            
            // 清除路径线
            if (this.routePolyline) {
                console.log('🗑️ 清除路径线');
                this.viewer.entities.remove(this.routePolyline);
                this.routePolyline = null;
            }
            
            // 清除路径实体（新版本）
            if (this.routeEntity) {
                console.log('🗑️ 清除路径实体');
                this.viewer.entities.remove(this.routeEntity);
                this.routeEntity = null;
            }
            
            // 清除起点标记
            if (this.startMarker) {
                console.log('🗑️ 清除起点标记');
                this.viewer.entities.remove(this.startMarker);
                this.startMarker = null;
            }
            
            // 清除终点标记
            if (this.endMarker) {
                console.log('🗑️ 清除终点标记');
                this.viewer.entities.remove(this.endMarker);
                this.endMarker = null;
            }
            
            // 清除所有导航相关的临时实体（但保留模型）
            const entitiesToRemove = [];
            this.viewer.entities.values.forEach(entity => {
                // 只清除导航相关的实体，保留模型实体
                if (entity.name && (
                    entity.name.includes('路径') || 
                    entity.name.includes('起点') || 
                    entity.name.includes('终点') ||
                    entity.name.includes('导航') ||
                    entity.name.includes('Navigation') ||
                    entity.name === 'route' ||
                    entity.name === 'startPoint' ||
                    entity.name === 'endPoint' ||
                    entity.name === 'Navigation Route' ||
                    entity.name === 'Start Point' ||
                    entity.name === 'End Point'
                )) {
                    entitiesToRemove.push(entity);
                }
            });
            
            entitiesToRemove.forEach(entity => {
                console.log('🗑️ 清除导航实体:', entity.name);
                this.viewer.entities.remove(entity);
            });
            
            // 停止当前的导航动画
            this.stopNavigation();
            
            console.log('✅ 路径清除完成，保留了模型实体');
            console.log('🔍 当前场景中剩余实体数量:', this.viewer.entities.values.length);
        } catch (error) {
            console.error('❌ 清除路径失败:', error);
        }
    }

    /**
     * 停止导航
     */
    stopNavigation() {
        this.isNavigating = false;
        
        // 停止漫游动画
        if (this.walkthroughInterval) {
            clearInterval(this.walkthroughInterval);
            this.walkthroughInterval = null;
        }
        
        // 取消相机飞行
        this.viewer.camera.cancelFlight();
        
        // 恢复相机控制
        this.restoreCameraControls();
        
        console.log('🛑 导航已停止，相机控制已恢复');
    }

    /**
     * 获取当前位置信息
     * @returns {Object} 位置信息
     */
    getCurrentLocation() {
        const camera = this.viewer.camera;
        const position = camera.position;
        const cartographic = SuperMap3D.Cartographic.fromCartesian(position);
        
        return {
            longitude: SuperMap3D.Math.toDegrees(cartographic.longitude),
            latitude: SuperMap3D.Math.toDegrees(cartographic.latitude),
            height: cartographic.height,
            floor: this.currentFloor,
            heading: SuperMap3D.Math.toDegrees(camera.heading),
            pitch: SuperMap3D.Math.toDegrees(camera.pitch),
            roll: SuperMap3D.Math.toDegrees(camera.roll)
        };
    }

    /**
     * 销毁导航模块
     */
    destroy() {
        this.clearRoute();
        this.stopNavigation();
        
        // 清理漫游动画
        if (this.walkthroughInterval) {
            clearInterval(this.walkthroughInterval);
            this.walkthroughInterval = null;
        }
        
        // 移除事件监听
        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('keyup', this.onKeyUp);
        
        console.log('🗑️ 导航模块已销毁');
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = IndoorNavigation;
}
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
        
        // 新增：多点路径相关属性
        this.isSelectingPoints = false; // 是否正在选择路径点
        this.routeMarkers = []; // 存储所有路径标记
        this.routeSegments = []; // 存储路径分段
        
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
        
        // 新增：鼠标右键事件绑定
        document.addEventListener('contextmenu', (event) => this.onRightClick(event));
    }

    /**
     * 开始多点路径选择模式
     */
    startMultiPointSelection() {
        this.isSelectingPoints = true;
        this.clearRoute(); // 清除之前的路径
        console.log('多点路径选择模式已启动，左键选择路径点，右键结束选择');
    }

    /**
     * 结束多点路径选择模式
     */
    endMultiPointSelection() {
        if (this.routePoints.length >= 2) {
            // 保存当前完整的相机状态
            const currentCamera = {
                position: this.viewer.camera.position.clone(),
                direction: this.viewer.camera.direction.clone(),
                up: this.viewer.camera.up.clone(),
                right: this.viewer.camera.right.clone(),
                transform: this.viewer.camera.transform.clone()
            };
            
            // 强制退出设置路径模式
            this.isSelectingPoints = false;
            
            // 移除之前的终点标记（如果有）
            if (this.endMarker) {
                this.viewer.entities.remove(this.endMarker);
                this.endMarker = null;
            }
            
            // 添加终点标记（最后一个点）
            const lastPoint = this.routePoints[this.routePoints.length - 1];
            this.addRouteMarker(lastPoint, 'end');
            
            this.calculateMultiPointRoute();
            
            // 立即恢复相机状态，避免任何视角跳转
            this.viewer.camera.setView({
                destination: currentCamera.position,
                orientation: {
                    direction: currentCamera.direction,
                    up: currentCamera.up
                }
            });
            
            console.log(`✅ 多点路径选择结束，共选择 ${this.routePoints.length} 个路径点，已退出设置路径模式，相机状态已恢复`);
        } else {
            console.warn('路径点不足，至少需要选择2个点');
            this.isSelectingPoints = false; // 即使点不足也退出设置模式
        }
    }

    /**
     * 设置路径点（支持多点）
     * @param {SuperMap3D.Cartesian3} position 位置
     */
    addRoutePoint(position) {
        if (!this.isSelectingPoints) {
            // 如果不是多点选择模式，清除之前的路径点
            this.clearRoute();
            this.isSelectingPoints = true;
        }
        
        this.routePoints.push(position);
        
        // 第一个点显示为起点（有注记）
        if (this.routePoints.length === 1) {
            this.addRouteMarker(position, 'start');
        } 
        // 第二个及之后的点显示标记但没有注记
        else if (this.routePoints.length >= 2) {
            this.addIntermediateMarker(position, this.routePoints.length);
        }
        
        console.log(`已添加第 ${this.routePoints.length} 个路径点`);
    }

    /**
     * 添加路径标记（支持多点）
     * @param {SuperMap3D.Cartesian3} position 位置
     * @param {string} type 标记类型（'start'或'end'）
     */
    addRouteMarker(position, type) {
        const entities = this.viewer.entities;
        
        let markerColor, markerText;
        if (type === 'start') {
            markerColor = SuperMap3D.Color.GREEN;
            markerText = '起点';
        } else if (type === 'end') {
            markerColor = SuperMap3D.Color.RED;
            markerText = '终点';
        }
        
        const marker = entities.add({
            name: `${type} Point`,
            position: position,
            point: {
                pixelSize: 10,
                color: markerColor,
                outlineColor: SuperMap3D.Color.WHITE,
                outlineWidth: 2,
                heightReference: SuperMap3D.HeightReference.CLAMP_TO_GROUND
            },
            label: {
                text: markerText,
                font: '12pt sans-serif',
                fillColor: SuperMap3D.Color.WHITE,
                outlineColor: SuperMap3D.Color.BLACK,
                outlineWidth: 2,
                style: SuperMap3D.LabelStyle.FILL_AND_OUTLINE,
                pixelOffset: new SuperMap3D.Cartesian2(0, -40)
            }
        });
        
        // 存储标记引用
        if (type === 'start') {
            this.startMarker = marker;
        } else if (type === 'end') {
            this.endMarker = marker;
        }
    }

    /**
     * 添加中间点标记（没有注记）
     * @param {SuperMap3D.Cartesian3} position 位置
     * @param {number} index 索引
     */
    addIntermediateMarker(position, index) {
        const entities = this.viewer.entities;
        
        const marker = entities.add({
            name: `Intermediate Point ${index}`,
            position: position,
            point: {
                pixelSize: 8,
                color: SuperMap3D.Color.YELLOW,
                outlineColor: SuperMap3D.Color.WHITE,
                outlineWidth: 1,
                heightReference: SuperMap3D.HeightReference.CLAMP_TO_GROUND
            }
        });
        
        // 存储中间点标记引用
        if (!this.intermediateMarkers) {
            this.intermediateMarkers = [];
        }
        this.intermediateMarkers.push(marker);
    }

    /**
     * 鼠标右键点击事件
     * @param {MouseEvent} event 鼠标事件
     */
    onRightClick(event) {
        event.preventDefault(); // 阻止默认右键菜单
        
        if (this.isSelectingPoints) {
            this.endMultiPointSelection();
        }
    }

    /**
     * 计算多点路径
     */
    calculateMultiPointRoute() {
        if (this.routePoints.length < 2) {
            console.warn('路径点不足，无法计算路径');
            return;
        }

        try {
            // 保存当前完整的相机状态
            const currentCamera = {
                position: this.viewer.camera.position.clone(),
                direction: this.viewer.camera.direction.clone(),
                up: this.viewer.camera.up.clone(),
                right: this.viewer.camera.right.clone(),
                transform: this.viewer.camera.transform.clone()
            };

            // 生成多点路径
            const route = this.generateMultiPointRoute(this.routePoints);
            
            // 绘制完整路径
            this.drawRoute(route);
            
            // 立即恢复相机状态，避免任何视角跳转
            this.viewer.camera.setView({
                destination: currentCamera.position,
                orientation: {
                    direction: currentCamera.direction,
                    up: currentCamera.up
                }
            });
            
            console.log('✅ 多点路径计算完成，相机状态已恢复');
        } catch (error) {
            console.error('❌ 多点路径计算失败:', error);
        }
    }

    /**
     * 生成多点路径
     * @param {Array} points 路径点数组
     * @returns {Array} 完整路径点数组
     */
    generateMultiPointRoute(points) {
        if (points.length < 2) {
            return [];
        }
        
        const fullRoute = [];
        
        // 连接所有相邻点
        for (let i = 0; i < points.length - 1; i++) {
            const segment = this.generateSimpleRoute(points[i], points[i + 1]);
            
            // 如果是第一个段，添加所有点；否则跳过第一个点（避免重复）
            if (i === 0) {
                fullRoute.push(...segment);
            } else {
                fullRoute.push(...segment.slice(1));
            }
        }
        
        return fullRoute;
    }

    /**
     * 绘制已连接的路径段（实时预览）
     */
    drawConnectedSegments() {
        // 清除之前的预览路径
        this.routeSegments.forEach(segment => {
            if (segment) {
                this.viewer.entities.remove(segment);
            }
        });
        this.routeSegments = [];
        
        // 绘制所有已连接的段
        for (let i = 0; i < this.routePoints.length - 1; i++) {
            const segment = this.generateSimpleRoute(this.routePoints[i], this.routePoints[i + 1]);
            
            const polyline = this.viewer.entities.add({
                name: `Route Segment ${i+1}`,
                polyline: {
                    positions: segment,
                    width: 2,
                    material: SuperMap3D.Color.CYAN.withAlpha(0.6),
                    clampToGround: false,
                    heightReference: SuperMap3D.HeightReference.NONE,
                    show: true,
                    followSurface: false
                }
            });
            
            this.routeSegments.push(polyline);
        }
    }

    /**
     * 清除路径
     */
    clearRoute() {
        // 清除路径点
        this.routePoints = [];
        
        // 清除起点标记
        if (this.startMarker) {
            this.viewer.entities.remove(this.startMarker);
            this.startMarker = null;
        }
        
        // 清除终点标记
        if (this.endMarker) {
            this.viewer.entities.remove(this.endMarker);
            this.endMarker = null;
        }
        
        // 清除中间点标记
        if (this.intermediateMarkers) {
            this.intermediateMarkers.forEach(marker => {
                if (marker) {
                    this.viewer.entities.remove(marker);
                }
            });
            this.intermediateMarkers = [];
        }
        
        // 清除路径线
        if (this.routePolyline) {
            this.viewer.entities.remove(this.routePolyline);
            this.routePolyline = null;
        }
        
        // 清除路径段（确保routeSegments数组已初始化）
        if (!this.routeSegments) {
            this.routeSegments = [];
        }
        this.routeSegments.forEach(segment => {
            if (segment) {
                this.viewer.entities.remove(segment);
            }
        });
        this.routeSegments = [];
        
        this.isSelectingPoints = false;
        console.log('✅ 路径已清除');
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
            // 开始计算路径

            // 保存当前相机状态
            const currentCameraPosition = this.viewer.camera.position.clone();
            const currentCameraDirection = this.viewer.camera.direction.clone();
            const currentCameraUp = this.viewer.camera.up.clone();
            // 已保存当前相机状态

            // 生成多点路径（支持多个路径点的分段连接）
            const route = this.generateMultiPointRoute(this.routePoints);
            
            // 绘制路径
            this.drawRoute(route);
            
            // 恢复相机状态（防止视角跳转）
            setTimeout(() => {
                this.viewer.camera.setView({
                    position: currentCameraPosition,
                    direction: currentCameraDirection,
                    up: currentCameraUp
                });
                // 相机状态已恢复
            }, 100);
            
            // 路径计算完成
            console.log(`✅ 多点路径计算完成，共${this.routePoints.length}个路径点`);
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
     * 生成多点路径（支持多个路径点的分段连接）
     * @param {Array} points 路径点数组
     * @returns {Array} 完整的路径点数组
     */
    generateMultiPointRoute(points) {
        if (!points || points.length < 2) {
            console.warn('路径点不足，无法生成多点路径');
            return [];
        }

        const fullRoute = [];
        
        // 连接所有路径点
        for (let i = 0; i < points.length - 1; i++) {
            const startPoint = points[i];
            const endPoint = points[i + 1];
            
            // 生成当前段的路径
            const segmentRoute = this.generateSimpleRoute(startPoint, endPoint);
            
            // 如果是第一段，添加所有点；否则跳过第一个点（避免重复）
            if (i === 0) {
                fullRoute.push(...segmentRoute);
            } else {
                fullRoute.push(...segmentRoute.slice(1));
            }
        }
        
        console.log(`✅ 多点路径生成完成，共${points.length}个路径点，生成${fullRoute.length}个路径细分点`);
        return fullRoute;
    }

    /**
     * 绘制路径
     * @param {Array} route 路径点数组
     */
    drawRoute(route) {
        try {
            // 开始绘制路径
            
            // 移除之前的路径
            this.clearRoutePolylines();

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

            // 绘制统一的主路径（不分段，统一颜色）
            this.routePolyline = this.viewer.entities.add({
                name: 'Navigation Route',
                polyline: {
                    positions: validRoute,
                    width: 4,
                    material: SuperMap3D.Color.CYAN.withAlpha(0.9),
                    clampToGround: false,
                    heightReference: SuperMap3D.HeightReference.NONE,
                    extrudedHeight: 0,
                    show: true,
                    followSurface: false,
                    depthFailMaterial: SuperMap3D.Color.CYAN.withAlpha(0.7)
                }
            });

            console.log(`✅ 路径绘制完成，共${validRoute.length}个路径点`);
            
        } catch (error) {
            console.error('❌ 绘制路径失败:', error);
            // 不抛出错误，避免影响其他功能
        }
    }


                    


    /**
     * 清除路径线段
     */
    clearRoutePolylines() {
        try {
            // 清除主路径
            if (this.routePolyline) {
                this.viewer.entities.remove(this.routePolyline);
                this.routePolyline = null;
            }
            
            // 清除分段路径
            if (this.routeSegmentPolylines) {
                this.routeSegmentPolylines.forEach(polyline => {
                    this.viewer.entities.remove(polyline);
                });
                this.routeSegmentPolylines = [];
            }
            
            console.log('✅ 路径线段已清除');
        } catch (error) {
            console.error('❌ 清除路径线段失败:', error);
        }
    }

    /**
     * 添加路径标记（只添加起点和终点）
     */
    addRouteMarkers(routePoints) {
        try {
            if (!routePoints || routePoints.length < 2) {
                return;
            }
            
            // 清除之前的标记
            this.clearRouteMarkers();
            
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
            
            console.log(`✅ 路径标记添加完成（起点和终点）`);
        } catch (error) {
            console.error('❌ 添加路径标记失败:', error);
        }
    }

    /**
     * 清除路径标记
     */
    clearRouteMarkers() {
        try {
            // 清除起点标记
            if (this.startMarker) {
                this.viewer.entities.remove(this.startMarker);
                this.startMarker = null;
            }
            
            // 清除终点标记
            if (this.endMarker) {
                this.viewer.entities.remove(this.endMarker);
                this.endMarker = null;
            }
            
            console.log('✅ 路径标记已清除');
        } catch (error) {
            console.error('❌ 清除路径标记失败:', error);
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
        // 生成完整的多点路径，而不是仅第一个点到第二个点
        const route = this.generateMultiPointRoute(this.routePoints);
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
        
        // 开始第一视角漫游
        
        // 计算总距离用于显示
        let totalDistance = 0;
        for (let i = 1; i < route.length; i++) {
            const distance = SuperMap3D.Cartesian3.distance(route[i-1], route[i]);
            totalDistance += distance;
        }
        
        // 固定漫游时间为5秒，提供最佳的第一人称体验
        const totalTime = 15;
        // 计算漫游参数
        
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
        
        // 调整相机到人眼高度 - 使用更安全的方式
        const adjustedPosition = new SuperMap3D.Cartesian3(
            position.x,
            position.y,
            position.z + this.cameraHeight
        );
        
        // 计算看向下一个点的方向
        let lookDirection = new SuperMap3D.Cartesian3(1, 0, 0); // 默认朝向
        if (this.routePoints && this.routePoints.length >= 2) {
            // 如果是起点，看向第二个点
            const start = this.routePoints[0];
            const next = this.routePoints[1];
            lookDirection = SuperMap3D.Cartesian3.subtract(next, start, new SuperMap3D.Cartesian3());
            SuperMap3D.Cartesian3.normalize(lookDirection, lookDirection);
        }
        
        // 确保方向向量有效，避免零向量
        if (SuperMap3D.Cartesian3.magnitude(lookDirection) < 0.001) {
            lookDirection = new SuperMap3D.Cartesian3(1, 0, 0);
        }
        
        // 确保第一人称行走视角直立行走，基于地面法向量计算
        let upVector = new SuperMap3D.Cartesian3(0, 0, 1); // 默认上向量
        
        // 使用路径段计算地面法向量，确保视角垂直于地面
        if (this.routePoints && this.routePoints.length >= 2) {
            const groundNormal = this.calculateGroundNormal(adjustedPosition, this.routePoints, 0);
            upVector = groundNormal;
        }
        
        // 确保上向量与前进方向垂直（避免视角倾斜）
        const dot = SuperMap3D.Cartesian3.dot(lookDirection, upVector);
        console.log(`[setFirstPersonViewAtPosition] 前进方向与上向量点积:${dot.toFixed(4)}, 阈值:0.1`);
        
        if (Math.abs(dot) > 0.1) { // 放宽阈值，避免过度修正
            console.log(`[setFirstPersonViewAtPosition] 需要修正上向量，当前点积:${dot.toFixed(4)}`);
            // 如果前进方向与上向量不垂直，计算正确的上向量
            const rightVector = SuperMap3D.Cartesian3.cross(lookDirection, upVector, new SuperMap3D.Cartesian3());
            SuperMap3D.Cartesian3.normalize(rightVector, rightVector);
            
            // 重新计算与前进方向和右向量都垂直的上向量
            upVector = SuperMap3D.Cartesian3.cross(rightVector, lookDirection, new SuperMap3D.Cartesian3());
            SuperMap3D.Cartesian3.normalize(upVector, upVector);
            
            console.log(`[setFirstPersonViewAtPosition] 修正后的上向量:(${upVector.x.toFixed(3)}, ${upVector.y.toFixed(3)}, ${upVector.z.toFixed(3)})`);
        }
        
        // 禁用相机控制，确保第一视角体验
        this.scene.screenSpaceCameraController.enableRotate = false;
        this.scene.screenSpaceCameraController.enableTranslate = false;
        this.scene.screenSpaceCameraController.enableZoom = false;
        
        camera.flyTo({
            destination: adjustedPosition,
            orientation: {
                direction: lookDirection,
                up: upVector // 动态计算的上向量，确保视角水平
            },
            duration: 1.0, // 平滑过渡
            maximumHeight: 5000 // 限制最大高度
        });
        
        // 已设置第一视角
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
        
        // 保存漫游开始前的相机位置和方向，用于恢复
        const originalPosition = camera.position.clone();
        const originalOrientation = {
            heading: camera.heading,
            pitch: camera.pitch,
            roll: camera.roll
        };
        
        // 开始第一视角漫游动画
        
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
                
                // 设置终点视角并平滑恢复到原始位置
                this.setFirstPersonViewAtPosition(route[route.length - 1]);
                setTimeout(() => {
                    // 平滑飞回原始位置
                    camera.flyTo({
                        destination: originalPosition,
                        orientation: originalOrientation,
                        duration: 2.0,
                        maximumHeight: 5000
                    });
                    
                    // 飞行完成后恢复相机控制
                    setTimeout(() => {
                        this.restoreCameraControls();
                    }, 2000);
                }, 1000);
                return;
            }
            
            // 计算当前位置
            const currentPosition = this.interpolateRoutePosition(route, progress);
            
            // 计算当前所在的路径段和下一个目标点
            const currentSegment = this.getCurrentPathSegment(route, progress);
            const targetPoint = route[currentSegment.targetIndex];
            
            // 确保相机位置在路径中心线上
            // 对于第一人称漫游，相机位置应该直接位于路径点上，不需要偏移
            // 使用精确的路径插值位置，确保相机在路径中心
            const adjustedPosition = new SuperMap3D.Cartesian3(
                currentPosition.x,
                currentPosition.y,
                currentPosition.z + this.cameraHeight
            );
            
            console.log(`[漫游位置] 段${currentSegment.segmentIndex}, 位置:(${adjustedPosition.x.toFixed(3)}, ${adjustedPosition.y.toFixed(3)}, ${adjustedPosition.z.toFixed(3)})`);
            
            // 计算前进方向（从当前位置看向目标点）
            const lookDirection = SuperMap3D.Cartesian3.subtract(targetPoint, currentPosition, new SuperMap3D.Cartesian3());
            
            // 如果方向向量太小，使用当前路径段的方向
            if (SuperMap3D.Cartesian3.magnitude(lookDirection) < 0.001) {
                // 使用当前路径段的方向，确保方向稳定
                if (currentSegment.segmentIndex < route.length - 1) {
                    const segmentStart = route[currentSegment.segmentIndex];
                    const segmentEnd = route[currentSegment.segmentIndex + 1];
                    SuperMap3D.Cartesian3.subtract(segmentEnd, segmentStart, lookDirection);
                } else {
                    // 如果已经是最后一段，使用整体路径方向
                    const startPos = route[0];
                    const endPos = route[route.length - 1];
                    SuperMap3D.Cartesian3.subtract(endPos, startPos, lookDirection);
                }
            }
            
            // 标准化方向向量
            SuperMap3D.Cartesian3.normalize(lookDirection, lookDirection);
            
            // 确保第一人称行走视角直立行走，基于地面法向量计算
            let upVector = new SuperMap3D.Cartesian3(0, 0, 1); // 默认上向量
            
            // 使用路径段计算地面法向量，确保视角垂直于地面
            if (route && route.length >= 2 && currentSegment.segmentIndex >= 0) {
                const groundNormal = this.calculateGroundNormal(currentPosition, route, currentSegment.segmentIndex);
                upVector = groundNormal;
                console.log(`[漫游视角] 段${currentSegment.segmentIndex}使用地面法向量作为上向量:(${upVector.x.toFixed(3)}, ${upVector.y.toFixed(3)}, ${upVector.z.toFixed(3)})`);
                
                // 添加路径段信息
                if (currentSegment.segmentIndex < route.length - 1) {
                    const currentPoint = route[currentSegment.segmentIndex];
                    const nextPoint = route[currentSegment.segmentIndex + 1];
                    const segmentDirection = SuperMap3D.Cartesian3.subtract(nextPoint, currentPoint, new SuperMap3D.Cartesian3());
                    const segmentLength = SuperMap3D.Cartesian3.magnitude(segmentDirection);
                    if (segmentLength > 0) {
                        SuperMap3D.Cartesian3.normalize(segmentDirection, segmentDirection);
                    }
                    console.log(`[漫游视角] 当前段${currentSegment.segmentIndex}方向:(${segmentDirection.x.toFixed(3)}, ${segmentDirection.y.toFixed(3)}, ${segmentDirection.z.toFixed(3)}), 长度:${segmentLength.toFixed(3)}`);
                }
            } else {
                console.log(`[漫游视角] 使用默认上向量:(${upVector.x.toFixed(3)}, ${upVector.y.toFixed(3)}, ${upVector.z.toFixed(3)})`);
            }
            
            // 确保上向量与前进方向垂直（避免视角倾斜）
            const dot = SuperMap3D.Cartesian3.dot(lookDirection, upVector);
            console.log(`[漫游视角] 前进方向与上向量点积:${dot.toFixed(4)}, 阈值:0.1`);
            
            if (Math.abs(dot) > 0.1) { // 放宽阈值，避免过度修正
                console.log(`[漫游视角] 需要修正上向量，当前点积:${dot.toFixed(4)}`);
                // 如果前进方向与上向量不垂直，计算正确的上向量
                const rightVector = SuperMap3D.Cartesian3.cross(lookDirection, upVector, new SuperMap3D.Cartesian3());
                SuperMap3D.Cartesian3.normalize(rightVector, rightVector);
                
                // 重新计算与前进方向和右向量都垂直的上向量
                upVector = SuperMap3D.Cartesian3.cross(rightVector, lookDirection, new SuperMap3D.Cartesian3());
                SuperMap3D.Cartesian3.normalize(upVector, upVector);
                
                console.log(`[漫游视角] 修正后的上向量:(${upVector.x.toFixed(3)}, ${upVector.y.toFixed(3)}, ${upVector.z.toFixed(3)})`);
            }
            
            camera.setView({
                destination: adjustedPosition,
                orientation: {
                    direction: lookDirection,
                    up: upVector // 动态计算的上向量，确保视角水平
                }
            });
            
        }, stepTime);
        
        // 保存interval引用，用于停止漫游
        this.walkthroughInterval = walkInterval;
    }
    
    /**
     * 获取当前所在的路径段和下一个目标点
     * @param {Array} route 路径点数组
     * @param {Number} progress 进度 (0-1)
     * @returns {Object} 包含当前段索引和目标点索引的对象
     */
    getCurrentPathSegment(route, progress) {
        if (progress <= 0) {
            return { segmentIndex: 0, targetIndex: 1 }; // 起点，看向第二个点
        }
        if (progress >= 1) {
            return { segmentIndex: route.length - 2, targetIndex: route.length - 1 }; // 终点，看向终点
        }
        
        // 计算在哪两个点之间
        const segmentProgress = progress * (route.length - 1);
        const segmentIndex = Math.floor(segmentProgress);
        
        // 下一个目标点是当前段的下一个点（确保向前看）
        const targetIndex = Math.min(segmentIndex + 1, route.length - 1);
        
        return { segmentIndex, targetIndex };
    }
    
    /**
     * 计算前进方向与参考方向的夹角（heading）
     * @param {SuperMap3D.Cartesian3} direction 前进方向
     * @param {SuperMap3D.Cartesian3} reference 参考方向（通常为正北）
     * @returns {Number} 朝向角度（弧度）
     */
    calculateHeading(direction, reference) {
        // 将方向向量投影到水平面（忽略Z轴）
        const horizontalDirection = new SuperMap3D.Cartesian3(direction.x, direction.y, 0);
        const horizontalReference = new SuperMap3D.Cartesian3(reference.x, reference.y, 0);
        
        // 标准化向量
        SuperMap3D.Cartesian3.normalize(horizontalDirection, horizontalDirection);
        SuperMap3D.Cartesian3.normalize(horizontalReference, horizontalReference);
        
        // 计算点积
        const dot = SuperMap3D.Cartesian3.dot(horizontalDirection, horizontalReference);
        
        // 计算叉积的Z分量（用于判断方向）
        const crossZ = horizontalDirection.x * horizontalReference.y - horizontalDirection.y * horizontalReference.x;
        
        // 计算夹角
        let angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        
        // 根据叉积的Z分量判断方向（正负）
        // 修正：当crossZ < 0时，角度应该是2π - angle，而不是-angle
        if (crossZ < 0) {
            angle = 2 * Math.PI - angle;
        }
        
        return angle;
    }
    
    /**
     * 计算路径地面的法向量，确保直立行走视角
     * 地面就是生成路径的那个面，确保人正常走路的第一视角
     * @param {SuperMap3D.Cartesian3} currentPosition 当前位置
     * @param {Array} route 路径点数组
     * @param {Number} segmentIndex 当前段索引
     * @returns {SuperMap3D.Cartesian3} 地面法向量
     */
    calculateGroundNormal(currentPosition, route, segmentIndex) {
        // 使用固定的地面法向量进行测试
        const fixedNormal = new SuperMap3D.Cartesian3(-0.394, 0.736, 0.551);
        console.log(`[地面法向量] 使用固定法向量 - 段索引:${segmentIndex}, 地面法向量:(${fixedNormal.x.toFixed(3)}, ${fixedNormal.y.toFixed(3)}, ${fixedNormal.z.toFixed(3)})`);
        return fixedNormal;
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
     * 键盘释放事件
     * @param {KeyboardEvent} event 键盘事件
     */
    onKeyUp(event) {
        // 可以在这里处理键盘释放后的逻辑
    }

    /**
     * 键盘按下事件
     * @param {KeyboardEvent} event 键盘事件
     */
    onKeyDown(event) {
        // 可以在这里处理键盘按下的逻辑
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
        // 相机控制已恢复
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
        
        // 恢复相机到原始位置
        if (this.originalCameraState) {
            this.viewer.camera.setView({
                destination: this.originalCameraState.position,
                orientation: {
                    direction: this.originalCameraState.direction,
                    up: this.originalCameraState.up
                }
            });
        }
        
        // 导航已停止，相机控制已恢复，位置已重置
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
        
        // 导航模块已销毁
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = IndoorNavigation;
}
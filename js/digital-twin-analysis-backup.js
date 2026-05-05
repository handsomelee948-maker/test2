/**
 * 数字孪生分析模块
 * 实现空间分析、模型分析、数据可视化等功能
 */

class DigitalTwinAnalysis {
  constructor(viewer, scene) {
    this.viewer = viewer
    this.scene = scene
    this.analysisResults = new Map()
    this.activeAnalysis = null

    this.analysisEntities = []

    // 交互式分析管理器
    this.interactiveManager = null

    this.init()
  }

  /**
   * 初始化分析模块
   */
  init() {
    this.setupAnalysisTools()
    this.bindEvents()
    this.initInteractiveManager()
    this.setupErrorHandling()
  }

  /**
   * 设置错误处理机制
   */
  setupErrorHandling() {
    // 初始化错误处理状态
    this.isHandlingError = false
    this.lastErrorTime = 0
    this.errorCount = 0

    // 监听渲染错误
    if (this.scene && this.scene.renderError) {
      this.scene.renderError.addEventListener((error) => {
        console.error('🚨 场景渲染错误:', error)
        this.handleRenderError(error)
      })
    }

    // 监听WebGL上下文丢失
    if (this.viewer && this.viewer.canvas) {
      this.viewer.canvas.addEventListener('webglcontextlost', (event) => {
        console.warn('⚠️ WebGL上下文丢失')
        event.preventDefault()
        this.clearAllAnalysis()
      })
    }
  }

  /**
   * 处理渲染错误
   */
  handleRenderError(error) {
    try {
      // 防止重复处理错误
      const currentTime = Date.now()
      if (this.isHandlingError || currentTime - this.lastErrorTime < 1000) {
        console.log('⚠️ 错误处理中或频率过高，跳过此次处理')
        return
      }

      this.isHandlingError = true
      this.lastErrorTime = currentTime
      this.errorCount++

      console.log(`🔧 尝试恢复渲染... (第${this.errorCount}次)`)

      // 特殊处理可视域分析相关错误
      this.handleViewshedRenderError()

      // 如果错误次数过多，采用更激进的清理策略
      if (this.errorCount > 3) {
        console.warn('⚠️ 错误次数过多，执行深度清理')
        this.performDeepCleanup()
      } else {
        // 清除所有分析结果
        this.clearAllAnalysis()

        // 清除临时实体
        if (
          this.interactiveManager &&
          typeof this.interactiveManager.clearTempEntities === 'function'
        ) {
          this.interactiveManager.clearTempEntities()
        }
      }

      // 延迟重置错误处理状态
      setTimeout(() => {
        this.isHandlingError = false
        // 如果一段时间没有错误，重置错误计数
        if (Date.now() - this.lastErrorTime > 30000) {
          this.errorCount = 0
        }
      }, 2000)

      // 渲染错误处理完成
    } catch (recoveryError) {
      console.error('❌ 渲染错误恢复失败:', recoveryError)
      this.isHandlingError = false
    }
  }

  /**
   * 处理可视域分析相关的渲染错误
   */
  handleViewshedRenderError() {
    try {
      // 处理可视域分析渲染错误

      // 特别清除可视域分析相关对象
      const viewshedResult = this.analysisResults.get('viewshed')
      if (viewshedResult) {
        // 销毁ViewShed3D对象
        if (
          viewshedResult.viewshed3D &&
          typeof viewshedResult.viewshed3D.destroy === 'function'
        ) {
          try {
            viewshedResult.viewshed3D.destroy()
            // 销毁ViewShed3D对象成功
          } catch (destroyError) {
            console.warn('⚠️ 销毁ViewShed3D对象失败:', destroyError)
          }
        }

        // 清除可视域分析集合
        if (this.scene && this.scene.viewshedAnalysis3Ds) {
          try {
            this.scene.viewshedAnalysis3Ds.removeAll()
            // 清除可视域分析集合成功
          } catch (removeError) {
            console.warn('⚠️ 清除可视域分析集合失败:', removeError)
          }
        }
      }

      // 可视域分析错误处理完成
    } catch (error) {
      console.error('❌ 可视域分析错误处理失败:', error)
    }
  }

  /**
   * 执行深度清理（已废弃，使用智能清除代替）
   * @deprecated 使用 clearAllAnalysis() 代替，该方法会保留模型
   */
  performDeepCleanup() {
    console.warn('⚠️ performDeepCleanup已废弃，使用智能清除代替')
    this.clearAllAnalysis()
  }

  /**
   * 设置分析工具
   */
  setupAnalysisTools() {
    // 初始化各种分析工具
    this.initViewshedAnalysis()
    this.initSightlineAnalysis()
    this.initShadowAnalysis()
    this.initProfileAnalysis()
    this.initSkylineAnalysis()
    this.initMeasureAnalysis()
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 鼠标事件处理
    this.handler = new SuperMap3D.ScreenSpaceEventHandler(this.scene.canvas)
  }

  /**
   * 可视域分析
   * @param {SuperMap3D.Cartesian3} viewPoint 观察点
   * @param {number} distance 观察距离
   * @param {number} pitch 俯仰角
   * @param {number} heading 方位角
   * @param {Object} options 可选参数
   */
  performViewshedAnalysis(
    viewPoint,
    distance = 1000,
    pitch = -30,
    heading = 0,
    options = {},
  ) {
    try {
      // 开始可视域分析

      // 验证输入参数
      if (!viewPoint || !SuperMap3D.defined(viewPoint)) {
        throw new Error('观察点位置无效')
      }

      if (distance <= 0 || distance > 10000) {
        console.warn('⚠️ 观察距离超出合理范围，已调整为1000米')
        distance = 1000
      }

      // 检查场景是否支持深度纹理
      if (!this.scene.pickPositionSupported) {
        console.warn('⚠️ 不支持深度纹理，使用自定义可视域分析实现')
        return this.performCustomViewshedAnalysis(
          viewPoint,
          distance,
          pitch,
          heading,
          options,
        )
      }

      // 清除之前的分析结果
      this.clearAnalysisResults('viewshed')

      // 使用SuperMap3D官方ViewShed3D实现
      // 使用SuperMap3D.ViewShed3D官方实现
      return this.performOfficialViewshedAnalysis(
        viewPoint,
        distance,
        pitch,
        heading,
        options,
      )
    } catch (error) {
      console.error('❌ 可视域分析失败:', error)

      // 显示用户友好的错误信息
      if (typeof window !== 'undefined' && window.showErrorMessage) {
        window.showErrorMessage('可视域分析失败', error.message)
      }

      return null
    }
  }

  /**
   * 使用SuperMap3D官方ViewShed3D实现可视域分析
   * @param {SuperMap3D.Cartesian3} viewPoint 观察点
   * @param {number} distance 观察距离
   * @param {number} pitch 俯仰角
   * @param {number} heading 方位角
   * @param {Object} options 可选参数
   */
  performOfficialViewshedAnalysis(
    viewPoint,
    distance = 1000,
    pitch = -30,
    heading = 0,
    options = {},
  ) {
    try {
      // 使用SuperMap3D.ViewShed3D官方实现

      // 创建可视域分析对象
      const viewshed3D = new SuperMap3D.ViewShed3D(this.scene)

      // 检查viewPoint是否有效
      if (
        !viewPoint ||
        !SuperMap3D.defined(viewPoint) ||
        typeof viewPoint.x !== 'number' ||
        typeof viewPoint.y !== 'number' ||
        typeof viewPoint.z !== 'number' ||
        isNaN(viewPoint.x) ||
        isNaN(viewPoint.y) ||
        isNaN(viewPoint.z)
      ) {
        console.error('❌ 观察点无效:', viewPoint)
        throw new Error('观察点位置无效，请确保经纬度和高度值是有效的数字')
      }

      // 检查viewPoint是否已经是经纬度格式
      let longitude, latitude, height

      if (
        viewPoint.longitude !== undefined &&
        viewPoint.latitude !== undefined &&
        viewPoint.height !== undefined
      ) {
        // 如果viewPoint已经是经纬度格式，直接使用
        longitude = viewPoint.longitude
        latitude = viewPoint.latitude
        height = viewPoint.height + 1.8 // 添加人眼高度
        // 使用经纬度格式的观察点
      } else {
        // 如果是Cartesian3格式，进行坐标转换
        const ellipsoid = this.viewer.scene.globe.ellipsoid
        const cartographic = ellipsoid.cartesianToCartographic(viewPoint)

        if (!cartographic) {
          console.error('❌ 无法将Cartesian3转换为Cartographic')
          throw new Error('坐标转换失败')
        }

        // 转换为经纬度
        longitude = SuperMap3D.Math.toDegrees(cartographic.longitude)
        latitude = SuperMap3D.Math.toDegrees(cartographic.latitude)
        height = cartographic.height + 1.8 // 添加人眼高度
        // 从Cartesian3转换的经纬度坐标
      }

      // 转换成功，经纬度坐标

      // 确保所有参数都是有效的数字
      if (isNaN(longitude) || isNaN(latitude) || isNaN(height)) {
        console.error('❌ 经纬度坐标无效:', { longitude, latitude, height })
        throw new Error('经纬度坐标无效，无法设置可视域分析参数')
      }

      // 设置可视域分析参数
      // 设置可视域分析参数

      // 使用直接的数组赋值
      viewshed3D.viewPosition = [longitude, latitude, height]
      viewshed3D.direction = heading
      viewshed3D.pitch = pitch
      viewshed3D.distance = distance
      viewshed3D.horizontalFov = options.horizontalFov || 90
      viewshed3D.verticalFov = options.verticalFov || 60

      // 可视域分析参数设置成功

      // 设置可见和不可见区域颜色 - 使用正确的颜色格式
      try {
        // 处理颜色参数，支持字符串和Color对象
        let visibleColor, hiddenColor

        if (options.visibleColor) {
          if (typeof options.visibleColor === 'string') {
            // 如果是字符串，使用hexToColor转换，增加透明度
            visibleColor = this.hexToColor(options.visibleColor, 0.8)
            console.log(
              '转换可见区域颜色:',
              options.visibleColor,
              '->',
              visibleColor,
            )
          } else if (options.visibleColor instanceof SuperMap3D.Color) {
            // 如果已经是Color对象，直接使用
            visibleColor = options.visibleColor
          } else {
            // 其他情况使用默认颜色
            visibleColor = new SuperMap3D.Color(0.0, 1.0, 0.0, 0.8)
          }
        } else {
          visibleColor = new SuperMap3D.Color(0.0, 1.0, 0.0, 0.8) // 绿色，增加透明度
        }

        if (options.hiddenColor) {
          if (typeof options.hiddenColor === 'string') {
            // 如果是字符串，使用hexToColor转换，增加透明度
            hiddenColor = this.hexToColor(options.hiddenColor, 0.8)
            console.log(
              '转换不可见区域颜色:',
              options.hiddenColor,
              '->',
              hiddenColor,
            )
          } else if (options.hiddenColor instanceof SuperMap3D.Color) {
            // 如果已经是Color对象，直接使用
            hiddenColor = options.hiddenColor
          } else {
            // 其他情况使用默认颜色
            hiddenColor = new SuperMap3D.Color(1.0, 0.0, 0.0, 0.8)
          }
        } else {
          hiddenColor = new SuperMap3D.Color(1.0, 0.0, 0.0, 0.8) // 红色，增加透明度
        }

        // 确保颜色对象有效且数值在正确范围内
        if (
          !visibleColor ||
          typeof visibleColor.red !== 'number' ||
          isNaN(visibleColor.red) ||
          isNaN(visibleColor.green) ||
          isNaN(visibleColor.blue) ||
          isNaN(visibleColor.alpha) ||
          visibleColor.red < 0 ||
          visibleColor.red > 1 ||
          visibleColor.green < 0 ||
          visibleColor.green > 1 ||
          visibleColor.blue < 0 ||
          visibleColor.blue > 1 ||
          visibleColor.alpha < 0 ||
          visibleColor.alpha > 1
        ) {
          console.warn('⚠️ 可见区域颜色无效，使用默认绿色')
          visibleColor = new SuperMap3D.Color(0.0, 1.0, 0.0, 0.5)
        }

        if (
          !hiddenColor ||
          typeof hiddenColor.red !== 'number' ||
          isNaN(hiddenColor.red) ||
          isNaN(hiddenColor.green) ||
          isNaN(hiddenColor.blue) ||
          isNaN(hiddenColor.alpha) ||
          hiddenColor.red < 0 ||
          hiddenColor.red > 1 ||
          hiddenColor.green < 0 ||
          hiddenColor.green > 1 ||
          hiddenColor.blue < 0 ||
          hiddenColor.blue > 1 ||
          hiddenColor.alpha < 0 ||
          hiddenColor.alpha > 1
        ) {
          console.warn('⚠️ 不可见区域颜色无效，使用默认红色')
          hiddenColor = new SuperMap3D.Color(1.0, 0.0, 0.0, 0.5)
        }

        // 在设置颜色之前，先验证ViewShed3D对象是否有效
        if (!viewshed3D || typeof viewshed3D !== 'object') {
          throw new Error('ViewShed3D对象无效')
        }

        // 延迟设置颜色，避免在构建前设置
        console.log('准备设置可视域颜色:', {
          visibleColor: `rgba(${visibleColor.red}, ${visibleColor.green}, ${visibleColor.blue}, ${visibleColor.alpha})`,
          hiddenColor: `rgba(${hiddenColor.red}, ${hiddenColor.green}, ${hiddenColor.blue}, ${hiddenColor.alpha})`,
        })

        // 暂时不设置颜色，等构建完成后再设置
        this._pendingColors = {
          visibleColor: visibleColor,
          hiddenColor: hiddenColor,
        }
      } catch (colorError) {
        console.warn('⚠️ 颜色处理失败，使用默认颜色:', colorError)
        // 如果颜色处理失败，设置默认颜色
        this._pendingColors = {
          visibleColor: new SuperMap3D.Color(0.0, 1.0, 0.0, 0.5),
          hiddenColor: new SuperMap3D.Color(1.0, 0.0, 0.0, 0.5),
        }
      }

      // 构建可视域分析
      try {
        console.log('开始构建可视域分析...')
        viewshed3D.build()
        console.log('✅ 可视域分析构建成功')

        // 验证可视域分析是否正确添加到场景中
        // 检查多种可能的场景属性来验证可视域分析是否成功添加
        let isAddedToScene = false
        let sceneInfo = []

        if (this.scene.viewsheds && this.scene.viewsheds.length > 0) {
          isAddedToScene = true
          sceneInfo.push(`viewsheds: ${this.scene.viewsheds.length}`)
        }

        if (this.scene.primitives && this.scene.primitives.length > 0) {
          // 检查primitives中是否有可视域相关的对象
          for (let i = 0; i < this.scene.primitives.length; i++) {
            const primitive = this.scene.primitives.get(i)
            if (
              primitive &&
              (primitive.constructor.name.includes('ViewShed') ||
                primitive.constructor.name.includes('Viewshed') ||
                primitive._viewshed ||
                primitive.viewshed)
            ) {
              isAddedToScene = true
              sceneInfo.push(
                `primitives中发现可视域对象: ${primitive.constructor.name}`,
              )
              break
            }
          }
        }

        // 检查viewshed3D对象本身的状态
        if (
          viewshed3D &&
          (viewshed3D._built || viewshed3D.built || viewshed3D.isBuilt)
        ) {
          isAddedToScene = true
          sceneInfo.push('viewshed3D对象已构建')
        }

        if (isAddedToScene) {
          console.log('✅ 可视域分析已成功添加到场景:', sceneInfo.join(', '))
        } else {
          console.warn('⚠️ 无法确认可视域分析是否正确添加到场景，但构建已完成')
        }

        // 构建完成后设置颜色
        if (this._pendingColors) {
          try {
            // 使用setTimeout确保在下一个事件循环中设置颜色
            setTimeout(() => {
              try {
                // 将SuperMap3D.Color对象转换为vec4数组格式
                const visibleVec4 = [
                  this._pendingColors.visibleColor.red,
                  this._pendingColors.visibleColor.green,
                  this._pendingColors.visibleColor.blue,
                  this._pendingColors.visibleColor.alpha,
                ]
                const hiddenVec4 = [
                  this._pendingColors.hiddenColor.red,
                  this._pendingColors.hiddenColor.green,
                  this._pendingColors.hiddenColor.blue,
                  this._pendingColors.hiddenColor.alpha,
                ]

                // 验证vec4数组的有效性
                const isValidVec4 = (vec) => {
                  return (
                    Array.isArray(vec) &&
                    vec.length === 4 &&
                    vec.every(
                      (v) =>
                        typeof v === 'number' && !isNaN(v) && v >= 0 && v <= 1,
                    )
                  )
                }

                if (isValidVec4(visibleVec4) && isValidVec4(hiddenVec4)) {
                  // 尝试多种设置方式
                  try {
                    // 方式1：直接设置Color对象
                    viewshed3D.visibleAreaColor =
                      this._pendingColors.visibleColor
                    viewshed3D.hiddenAreaColor = this._pendingColors.hiddenColor
                    console.log('✅ 方式1：直接设置Color对象成功')
                  } catch (e1) {
                    console.warn('方式1失败，尝试方式2:', e1.message)
                    try {
                      // 方式2：设置vec4数组
                      viewshed3D.visibleAreaColor = visibleVec4
                      viewshed3D.hiddenAreaColor = hiddenVec4
                      console.log('✅ 方式2：设置vec4数组成功')
                    } catch (e2) {
                      console.warn('方式2失败，尝试方式3:', e2.message)
                      try {
                        // 方式3：使用SuperMap3D.Cartesian4
                        viewshed3D.visibleAreaColor = new SuperMap3D.Cartesian4(
                          ...visibleVec4,
                        )
                        viewshed3D.hiddenAreaColor = new SuperMap3D.Cartesian4(
                          ...hiddenVec4,
                        )
                        console.log('✅ 方式3：设置Cartesian4成功')
                      } catch (e3) {
                        console.warn('所有颜色设置方式都失败:', e3.message)
                        console.warn('跳过颜色设置，使用默认颜色')
                      }
                    }
                  }

                  console.log('✅ 可视域颜色设置完成:', {
                    visibleColor: `rgba(${visibleVec4.join(', ')})`,
                    hiddenColor: `rgba(${hiddenVec4.join(', ')})`,
                  })
                } else {
                  console.warn('⚠️ 颜色vec4数组无效，跳过颜色设置')
                }

                // 确保可视域分析在所有视口中可见
                try {
                  if (typeof viewshed3D.setVisibleInViewport === 'function') {
                    for (let i = 0; i < 4; i++) {
                      viewshed3D.setVisibleInViewport(i)
                    }
                    console.log('✅ 已设置可视域分析在所有视口中可见')
                  }
                } catch (viewportError) {
                  console.warn('⚠️ 设置视口可见性失败:', viewportError.message)
                }

                // 强制恢复渲染并刷新场景
                if (this.viewer && this.viewer.scene) {
                  // 确保渲染模式正常
                  this.viewer.scene.requestRenderMode = false
                  this.viewer.scene.maximumRenderTimeChange = 0.0
                  console.log('✅ 已恢复正常渲染模式')

                  // 请求重新渲染
                  this.viewer.scene.requestRender()
                  console.log('✅ 已请求场景重新渲染')

                  // 强制多次渲染确保可视域显示
                  setTimeout(() => {
                    this.viewer.scene.requestRender()
                    console.log('✅ 延迟渲染请求已发送')
                  }, 100)

                  setTimeout(() => {
                    this.viewer.scene.requestRender()
                    console.log('✅ 第二次延迟渲染请求已发送')
                  }, 500)
                }

                // 清除临时颜色
                delete this._pendingColors
              } catch (colorSetError) {
                console.warn('⚠️ 延迟设置颜色失败:', colorSetError)
                // 清除临时颜色
                delete this._pendingColors
              }
            }, 100)
          } catch (timeoutError) {
            console.warn('⚠️ 设置延迟颜色失败:', timeoutError)
            delete this._pendingColors
          }
        }
      } catch (error) {
        console.error('❌ 构建可视域分析失败:', error)
        // 清除临时颜色
        delete this._pendingColors
        throw error
      }

      // 添加观察点标记
      const viewPointEntity = this.viewer.entities.add({
        id: `viewshed-observer-${Date.now()}`,
        position: viewPoint,
        point: {
          pixelSize: 15,
          color: SuperMap3D.Color.YELLOW,
          outlineColor: SuperMap3D.Color.BLACK,
          outlineWidth: 3,
          heightReference: SuperMap3D.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: '观察点',
          font: '16pt sans-serif',
          fillColor: SuperMap3D.Color.WHITE,
          outlineColor: SuperMap3D.Color.BLACK,
          outlineWidth: 3,
          style: SuperMap3D.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new SuperMap3D.Cartesian2(0, -50),
          heightReference: SuperMap3D.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })

      this.analysisEntities.push(viewPointEntity)

      // 保存分析结果
      const analysisData = {
        viewshed3D: viewshed3D,
        viewPoint: viewPoint,
        distance: distance,
        pitch: pitch,
        heading: heading,
        horizontalFov: viewshed3D.horizontalFov,
        verticalFov: viewshed3D.verticalFov,
        timestamp: new Date().toISOString(),
        entities: [viewPointEntity],
        isOfficialImplementation: true,
      }

      this.analysisResults.set('viewshed', analysisData)
      this.activeAnalysis = 'viewshed'

      // 确保可视域分析结果立即显示
      if (this.viewer && this.viewer.scene) {
        // 强制恢复正常渲染模式
        this.viewer.scene.requestRenderMode = false
        this.viewer.scene.maximumRenderTimeChange = 0.0
        console.log('✅ 可视域分析完成后已恢复正常渲染模式')

        // 立即请求渲染
        this.viewer.scene.requestRender()

        // 延迟渲染确保显示
        setTimeout(() => {
          this.viewer.scene.requestRender()
          console.log('✅ 可视域分析结果渲染请求已发送')
        }, 50)
      }

      console.log('✅ SuperMap3D.ViewShed3D可视域分析完成', {
        distance: distance + 'm',
        pitch: pitch + '°',
        heading: heading + '°',
        horizontalFov: viewshed3D.horizontalFov + '°',
        verticalFov: viewshed3D.verticalFov + '°',
      })

      // 显示提示信息
      if (typeof window !== 'undefined' && window.showMessage) {
        window.showMessage(
          '可视域分析完成',
          '使用SuperMap3D官方实现，显示精确可视区域',
          'success',
        )
      }

      return analysisData
    } catch (error) {
      console.error('❌ SuperMap3D.ViewShed3D可视域分析失败:', error)

      // 如果官方实现失败，回退到自定义实现
      console.log('🔄 回退到自定义可视域分析实现')
      return this.performCustomViewshedAnalysis(
        viewPoint,
        distance,
        pitch,
        heading,
        options,
      )
    }
  }

  /**
   * 自定义可视域分析实现（备用方案）
   * @param {SuperMap3D.Cartesian3} viewPoint 观察点
   * @param {number} distance 观察距离
   * @param {number} pitch 俯仰角
   * @param {number} heading 方位角
   * @param {Object} options 可选参数
   */
  performCustomViewshedAnalysis(
    viewPoint,
    distance = 1000,
    pitch = -30,
    heading = 0,
    options = {},
  ) {
    try {
      console.log('🔍 使用自定义可视域分析...', {
        viewPoint,
        distance,
        pitch,
        heading,
      })

      // 创建可视域扇形区域
      const horizontalAngle = options.horizontalAngle || 90
      const verticalAngle = options.verticalAngle || 60

      // 检查viewPoint是否有效
      if (
        !viewPoint ||
        !SuperMap3D.defined(viewPoint) ||
        typeof viewPoint.x !== 'number' ||
        typeof viewPoint.y !== 'number' ||
        typeof viewPoint.z !== 'number' ||
        isNaN(viewPoint.x) ||
        isNaN(viewPoint.y) ||
        isNaN(viewPoint.z)
      ) {
        console.error('❌ 观察点无效:', viewPoint)
        throw new Error('观察点位置无效，请确保经纬度和高度值是有效的数字')
      }

      // 直接使用ellipsoid.cartesianToCartographic方法转换坐标
      const ellipsoid = this.viewer.scene.globe.ellipsoid
      const cartographic = ellipsoid.cartesianToCartographic(viewPoint)

      if (!cartographic) {
        console.error('❌ 无法将Cartesian3转换为Cartographic')
        throw new Error('坐标转换失败')
      }

      // 转换为经纬度
      const longitude = SuperMap3D.Math.toDegrees(cartographic.longitude)
      const latitude = SuperMap3D.Math.toDegrees(cartographic.latitude)
      const height = cartographic.height + 1.8 // 添加人眼高度

      console.log('转换成功，经纬度坐标:', { longitude, latitude, height })

      // 创建可视域扇形几何体
      const viewshedGeometry = this.createViewshedGeometry(
        viewPoint,
        distance,
        heading,
        horizontalAngle,
        pitch,
        verticalAngle,
      )

      // 创建可视域实体
      const viewshedEntity = this.viewer.entities.add({
        name: '可视域分析',
        polygon: {
          hierarchy: viewshedGeometry.positions,
          material: SuperMap3D.Color.GREEN.withAlpha(0.3),
          outline: true,
          outlineColor: SuperMap3D.Color.GREEN,
          height: height,
          extrudedHeight:
            height +
            distance * Math.sin(SuperMap3D.Math.toRadians(Math.abs(pitch))),
          closeTop: false,
          closeBottom: false,
        },
      })

      // 添加观察点标记
      const viewPointEntity = this.viewer.entities.add({
        id: `viewshed-custom-observer-${Date.now()}`,
        position: viewPoint,
        point: {
          pixelSize: 15,
          color: SuperMap3D.Color.YELLOW,
          outlineColor: SuperMap3D.Color.BLACK,
          outlineWidth: 3,
          heightReference: SuperMap3D.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: '观察点',
          font: '16pt sans-serif',
          fillColor: SuperMap3D.Color.WHITE,
          outlineColor: SuperMap3D.Color.BLACK,
          outlineWidth: 3,
          style: SuperMap3D.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new SuperMap3D.Cartesian2(0, -50),
          heightReference: SuperMap3D.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })

      // 添加方向指示线
      const directionEndPoint = this.calculateDirectionPoint(
        viewPoint,
        distance,
        heading,
      )
      const directionEntity = this.viewer.entities.add({
        name: '观察方向',
        polyline: {
          positions: [viewPoint, directionEndPoint],
          width: 3,
          material: SuperMap3D.Color.YELLOW,
          clampToGround: false,
        },
      })

      this.analysisEntities.push(
        viewshedEntity,
        viewPointEntity,
        directionEntity,
      )

      // 保存分析结果
      const analysisData = {
        viewshed: viewshedEntity,
        viewPoint: viewPoint,
        distance: distance,
        pitch: pitch,
        heading: heading,
        timestamp: new Date().toISOString(),
        entities: [viewshedEntity, viewPointEntity, directionEntity],
        isCustomImplementation: true,
      }

      this.analysisResults.set('viewshed', analysisData)
      this.activeAnalysis = 'viewshed'

      console.log('✅ 自定义可视域分析完成', {
        distance: distance + 'm',
        pitch: pitch + '°',
        heading: heading + '°',
        horizontalAngle: horizontalAngle + '°',
        verticalAngle: verticalAngle + '°',
      })

      // 显示提示信息
      if (typeof window !== 'undefined' && window.showMessage) {
        window.showMessage(
          '可视域分析完成',
          '使用自定义实现，显示近似可视区域',
          'info',
        )
      }

      return analysisData
    } catch (error) {
      console.error('❌ 自定义可视域分析失败:', error)

      // 显示用户友好的错误信息
      if (typeof window !== 'undefined' && window.showErrorMessage) {
        window.showErrorMessage(
          '可视域分析失败',
          '无法执行可视域分析: ' + error.message,
        )
      }

      return null
    }
  }

  /**
   * 创建可视域几何体
   */
  createViewshedGeometry(
    viewPoint,
    distance,
    heading,
    horizontalAngle,
    pitch,
    verticalAngle,
  ) {
    try {
      console.log('创建可视域几何体:', {
        distance,
        heading,
        horizontalAngle,
        pitch,
        verticalAngle,
      })

      const positions = [viewPoint] // 起始点

      // 计算扇形边界点
      const halfHorizontalAngle = horizontalAngle / 2
      const steps = 20 // 扇形分段数

      // 确保距离合理
      if (distance <= 0 || isNaN(distance)) {
        console.warn('⚠️ 距离无效，使用默认值1000')
        distance = 1000
      }

      // 限制最大距离
      if (distance > 10000) {
        console.warn('⚠️ 距离过大，限制为10000米')
        distance = 10000
      }

      for (let i = 0; i <= steps; i++) {
        const angle =
          heading - halfHorizontalAngle + (horizontalAngle * i) / steps
        const endPoint = this.calculateDirectionPoint(
          viewPoint,
          distance,
          angle,
        )

        // 验证endPoint是否有效
        if (
          endPoint &&
          SuperMap3D.defined(endPoint) &&
          typeof endPoint.x === 'number' &&
          typeof endPoint.y === 'number' &&
          typeof endPoint.z === 'number' &&
          !isNaN(endPoint.x) &&
          !isNaN(endPoint.y) &&
          !isNaN(endPoint.z)
        ) {
          positions.push(endPoint)
        } else {
          console.warn(`⚠️ 跳过无效的边界点 ${i}:`, endPoint)
        }
      }

      console.log(`✅ 可视域几何体创建成功，包含 ${positions.length} 个点`)

      return {
        positions: positions,
      }
    } catch (error) {
      console.error('❌ 创建可视域几何体失败:', error)
      // 返回一个简单的三角形作为备用
      return {
        positions: [
          viewPoint,
          this.calculateDirectionPoint(viewPoint, distance, heading - 45),
          this.calculateDirectionPoint(viewPoint, distance, heading + 45),
        ],
      }
    }
  }

  /**
   * 计算方向点
   */
  calculateDirectionPoint(startPoint, distance, heading) {
    // 使用ellipsoid.cartesianToCartographic方法转换坐标
    const ellipsoid = this.viewer.scene.globe.ellipsoid
    const cartographic = ellipsoid.cartesianToCartographic(startPoint)

    if (!cartographic) {
      console.error('❌ 无法将起点转换为Cartographic')
      // 返回一个默认点，避免完全失败
      return startPoint
    }

    const longitude = SuperMap3D.Math.toDegrees(cartographic.longitude)
    const latitude = SuperMap3D.Math.toDegrees(cartographic.latitude)
    const height = cartographic.height

    // 计算终点经纬度
    const headingRadians = SuperMap3D.Math.toRadians(heading)
    const deltaLat = (distance * Math.cos(headingRadians)) / 111320 // 纬度变化
    const deltaLon =
      (distance * Math.sin(headingRadians)) /
      (111320 * Math.cos(SuperMap3D.Math.toRadians(latitude))) // 经度变化

    const endLongitude = longitude + deltaLon
    const endLatitude = latitude + deltaLat

    console.log('方向点计算:', {
      起点: { longitude, latitude, height },
      终点: { longitude: endLongitude, latitude: endLatitude, height },
      方向: heading,
      距离: distance,
    })

    return SuperMap3D.Cartesian3.fromDegrees(endLongitude, endLatitude, height)
  }

  /**
   * 通视分析（仅使用SuperMap3D原生实现）
   * @param {SuperMap3D.Cartesian3} startPoint 起点
   * @param {SuperMap3D.Cartesian3} endPoint 终点
   * @param {Object} options 可选参数
   */
  performSightlineAnalysis(startPoint, endPoint, options = {}) {
    try {
      console.log('👁️ 开始通视分析...', { startPoint, endPoint })

      // 验证输入参数
      if (!startPoint || !SuperMap3D.defined(startPoint)) {
        throw new Error('起点位置无效')
      }

      if (!endPoint || !SuperMap3D.defined(endPoint)) {
        throw new Error('终点位置无效')
      }

      // 验证坐标数值有效性
      if (!this.isValidCartesian3(startPoint)) {
        throw new Error('起点坐标包含无效数值')
      }

      if (!this.isValidCartesian3(endPoint)) {
        throw new Error('终点坐标包含无效数值')
      }

      // 计算两点间距离
      const distance = SuperMap3D.Cartesian3.distance(startPoint, endPoint)
      if (!isFinite(distance) || distance < 0.1) {
        throw new Error('起点和终点距离无效或过近')
      }

      if (distance > 10000) {
        console.warn(
          '⚠️ 两点距离较远(' + distance.toFixed(2) + 'm)，分析可能不准确',
        )
      }

      // 如果不是多目标点模式，清除之前的分析结果
      if (!options.keepPreviousResults) {
        this.clearAnalysisResults('sightline')
      }

      // 使用SuperMap3D原生通视分析
      console.log('🎯 使用SuperMap3D原生Sightline实现')

      // 检查是否需要重新创建Sightline对象（清除后或对象无效时）
      const needNewSightline =
        !this.sightlineAnalysis ||
        (typeof this.sightlineAnalysis.destroy === 'function' &&
          this.sightlineAnalysis.isDestroyed &&
          this.sightlineAnalysis.isDestroyed())

      if (needNewSightline) {
        try {
          console.log('🔧 创建新的SuperMap3D.Sightline对象...')

          // 验证场景对象
          if (!this.viewer || !this.viewer.scene) {
            throw new Error('场景对象无效')
          }

          // 创建Sightline实例
          this.sightlineAnalysis = new SuperMap3D.Sightline(this.viewer.scene)

          // 验证创建结果
          if (!this.sightlineAnalysis) {
            throw new Error('Sightline对象创建失败')
          }

          // 设置基本属性
          if (this.sightlineAnalysis.visibleColor !== undefined) {
            this.sightlineAnalysis.visibleColor = new SuperMap3D.Color(
              0,
              1,
              0,
              0.8,
            ) // 绿色表示可见，增加透明度
          }
          if (this.sightlineAnalysis.hiddenColor !== undefined) {
            this.sightlineAnalysis.hiddenColor = new SuperMap3D.Color(
              1,
              0,
              0,
              0.8,
            ) // 红色表示不可见，增加透明度
          }
          if (this.sightlineAnalysis.lineWidth !== undefined) {
            this.sightlineAnalysis.lineWidth = 3
          }

          // 设置通视分析精度参数
          if (this.sightlineAnalysis.pixelSize !== undefined) {
            this.sightlineAnalysis.pixelSize = 1 // 提高精度
          }

          // 设置通视分析采样参数
          if (this.sightlineAnalysis.sampleSize !== undefined) {
            this.sightlineAnalysis.sampleSize = 256 // 增加采样点数量
          }

          // 构建通视分析
          if (typeof this.sightlineAnalysis.build === 'function') {
            this.sightlineAnalysis.build()
            console.log('✅ Sightline对象创建并构建成功')
          } else {
            console.warn('⚠️ Sightline对象没有build方法')
          }
        } catch (createError) {
          console.error('❌ 创建Sightline对象失败:', createError)
          this.sightlineAnalysis = null
          throw new Error('无法创建通视分析对象: ' + createError.message)
        }
      } else {
        console.log('✅ 使用现有的Sightline对象')

        // 确保现有对象处于可用状态
        try {
          // 清除之前的目标点
          if (
            typeof this.sightlineAnalysis.removeAllTargetPoint === 'function'
          ) {
            this.sightlineAnalysis.removeAllTargetPoint()
            console.log('✅ 清除现有Sightline对象的目标点')
          }

          // 重置观察点
          this.sightlineAnalysis.viewPosition = null
          console.log('✅ 重置现有Sightline对象的观察点')

          // 重新构建通视分析对象，确保分析功能正常工作
          if (typeof this.sightlineAnalysis.build === 'function') {
            this.sightlineAnalysis.build()
            console.log('✅ 重新构建现有Sightline对象')
          }
        } catch (resetError) {
          console.warn('⚠️ 重置现有Sightline对象时出错:', resetError)
          // 如果重置失败，强制重新创建对象
          this.sightlineAnalysis = null
          throw new Error(
            '现有Sightline对象不可用，需要重新创建: ' + resetError.message,
          )
        }
      }

      // 转换坐标为经纬度并验证
      const startCartographic =
        SuperMap3D.Cartographic.fromCartesian(startPoint)
      const endCartographic = SuperMap3D.Cartographic.fromCartesian(endPoint)

      if (!startCartographic || !endCartographic) {
        throw new Error('坐标转换失败：无法将Cartesian3转换为Cartographic')
      }

      // 验证转换后的坐标
      if (!this.isValidCartographic(startCartographic)) {
        throw new Error('起点坐标转换后包含无效数值')
      }

      if (!this.isValidCartographic(endCartographic)) {
        throw new Error('终点坐标转换后包含无效数值')
      }

      const startLonLatHeight = [
        SuperMap3D.Math.toDegrees(startCartographic.longitude),
        SuperMap3D.Math.toDegrees(startCartographic.latitude),
        startCartographic.height,
      ]

      const endLonLatHeight = [
        SuperMap3D.Math.toDegrees(endCartographic.longitude),
        SuperMap3D.Math.toDegrees(endCartographic.latitude),
        endCartographic.height,
      ]

      // 验证最终的经纬度数组
      if (!this.isValidLonLatHeight(startLonLatHeight)) {
        throw new Error('起点经纬度坐标包含无效数值')
      }

      if (!this.isValidLonLatHeight(endLonLatHeight)) {
        throw new Error('终点经纬度坐标包含无效数值')
      }

      // 设置观察点
      try {
        console.log('🎯 设置观察点:', startLonLatHeight)
        this.sightlineAnalysis.viewPosition = startLonLatHeight
      } catch (viewPointError) {
        console.error('❌ 设置观察点失败:', viewPointError)
        throw new Error('设置观察点失败: ' + viewPointError.message)
      }

      // 清除之前的目标点
      try {
        if (typeof this.sightlineAnalysis.removeAllTargetPoint === 'function') {
          this.sightlineAnalysis.removeAllTargetPoint()
        }
      } catch (clearError) {
        console.warn('⚠️ 清除目标点时出错:', clearError)
      }

      // 添加目标点
      const targetName = 'target_' + Date.now()
      let addResult = false

      try {
        console.log('🎯 添加目标点:', endLonLatHeight, '名称:', targetName)
        addResult = this.sightlineAnalysis.addTargetPoint({
          position: endLonLatHeight,
          name: targetName,
        })

        console.log('🎯 目标点添加结果:', addResult)
      } catch (targetError) {
        console.error('❌ 添加目标点时出错:', targetError)
        throw new Error('添加目标点失败: ' + targetError.message)
      }

      if (!addResult) {
        throw new Error('添加目标点失败：API返回false')
      }

      // 不再创建额外的标记和连接线，因为SuperMap3D原生Sightline对象会自动创建
      console.log(
        '✅ 观察点和目标点标记将由SuperMap3D原生Sightline对象自动创建',
      )

      // 保存分析结果
      const analysisData = {
        type: 'sightline',
        implementation: 'native',
        startPoint: startPoint,
        endPoint: endPoint,
        distance: distance,
        timestamp: new Date().toISOString(),
        sightline: this.sightlineAnalysis,
        sightlineObject: this.sightlineAnalysis,
        targetName: targetName,
        addedToCollection: 'sightline',
        entities: [], // 不再保存自己创建的实体引用
        observerMarker: null, // 不再引用自己创建的观察点标记
        targetMarker: null, // 不再引用自己创建的目标点标记
        connectionLine: null, // 不再引用自己创建的通视线
      }

      // 支持多条通视线：将结果存储为数组
      if (options.keepPreviousResults) {
        let existingResults = this.analysisResults.get('sightline')
        if (!existingResults) {
          existingResults = []
        } else if (!Array.isArray(existingResults)) {
          // 如果现有结果不是数组，将其转换为数组
          existingResults = [existingResults]
        }
        existingResults.push(analysisData)
        this.analysisResults.set('sightline', existingResults)
      } else {
        this.analysisResults.set('sightline', analysisData)
      }
      this.activeAnalysis = 'sightline'

      console.log('✅ SuperMap3D原生通视分析完成', {
        distance: distance.toFixed(2) + 'm',
        implementation: 'SuperMap3D原生实现',
      })

      // 显示成功信息
      if (typeof window !== 'undefined' && window.showSuccessMessage) {
        window.showSuccessMessage(
          '通视分析完成',
          `距离: ${distance.toFixed(2)}m (SuperMap3D原生实现)`,
        )
      }

      return analysisData
    } catch (error) {
      console.error('❌ 通视分析失败:', error)

      // 显示用户友好的错误信息
      if (typeof window !== 'undefined' && window.showErrorMessage) {
        window.showErrorMessage('通视分析失败', error.message)
      }

      return null
    }
  }

  /**
   * 执行多点通视分析
   * @param {SuperMap3D.Cartesian3} viewPoint 观察点位置
   * @param {Array<SuperMap3D.Cartesian3>} targetPoints 目标点位置数组
   * @param {Object} options 可选参数
   */
  performMultiSightlineAnalysis(viewPoint, targetPoints, options = {}) {
    try {
      console.log('👁️ 开始多点通视分析...', {
        viewPoint,
        targetPoints: targetPoints.length,
        viewPointType: typeof viewPoint,
        targetPointsType: typeof targetPoints,
        firstTargetPoint:
          targetPoints && targetPoints.length > 0 ? targetPoints[0] : null,
      })

      // 验证输入参数
      if (!viewPoint || !SuperMap3D.defined(viewPoint)) {
        throw new Error('观察点位置无效')
      }

      if (
        !targetPoints ||
        !Array.isArray(targetPoints) ||
        targetPoints.length === 0
      ) {
        throw new Error('目标点数组无效或为空')
      }

      // 验证观察点坐标
      if (!this.isValidCartesian3(viewPoint)) {
        throw new Error('观察点坐标包含无效数值')
      }

      // 验证所有目标点坐标
      console.log('🎯 开始验证目标点坐标:', targetPoints)
      for (let i = 0; i < targetPoints.length; i++) {
        const targetPointInfo = targetPoints[i]
        let targetPoint = targetPointInfo

        // 如果targetPointInfo是对象且包含position属性，提取position
        if (
          targetPointInfo &&
          typeof targetPointInfo === 'object' &&
          targetPointInfo.position
        ) {
          targetPoint = targetPointInfo.position
        }

        console.log(`🎯 目标点${i + 1}坐标:`, {
          x: targetPoint.x,
          y: targetPoint.y,
          z: targetPoint.z,
          isValidCartesian3: this.isValidCartesian3(targetPoint),
        })
        if (!this.isValidCartesian3(targetPoint)) {
          throw new Error(`目标点${i + 1}坐标包含无效数值`)
        }
      }

      // 清除之前的分析结果
      this.clearAnalysisResults('sightline')

      // 使用SuperMap3D原生通视分析
      console.log('🎯 使用SuperMap3D原生Sightline实现进行多点分析')

      // 检查是否需要重新创建Sightline对象
      const needNewSightline =
        !this.sightlineAnalysis ||
        (typeof this.sightlineAnalysis.destroy === 'function' &&
          this.sightlineAnalysis.isDestroyed &&
          this.sightlineAnalysis.isDestroyed())

      if (needNewSightline) {
        try {
          console.log('🔧 创建新的SuperMap3D.Sightline对象...')

          // 验证场景对象
          if (!this.viewer || !this.viewer.scene) {
            throw new Error('场景对象无效')
          }

          // 创建Sightline实例
          this.sightlineAnalysis = new SuperMap3D.Sightline(this.viewer.scene)

          // 验证创建结果
          if (!this.sightlineAnalysis) {
            throw new Error('Sightline对象创建失败')
          }

          // 设置基本属性
          if (this.sightlineAnalysis.visibleColor !== undefined) {
            this.sightlineAnalysis.visibleColor = new SuperMap3D.Color(
              0,
              1,
              0,
              0.8,
            ) // 绿色表示可见
          }
          if (this.sightlineAnalysis.hiddenColor !== undefined) {
            this.sightlineAnalysis.hiddenColor = new SuperMap3D.Color(
              1,
              0,
              0,
              0.8,
            ) // 红色表示不可见
          }
          if (this.sightlineAnalysis.lineWidth !== undefined) {
            this.sightlineAnalysis.lineWidth = 3
          }

          // 设置通视分析精度参数
          if (this.sightlineAnalysis.pixelSize !== undefined) {
            this.sightlineAnalysis.pixelSize = 1
          }

          // 设置通视分析采样参数
          if (this.sightlineAnalysis.sampleSize !== undefined) {
            this.sightlineAnalysis.sampleSize = 256
          }

          // 构建通视分析
          if (typeof this.sightlineAnalysis.build === 'function') {
            this.sightlineAnalysis.build()
            console.log('✅ Sightline对象创建并构建成功')
          } else {
            console.warn('⚠️ Sightline对象没有build方法')
          }
        } catch (createError) {
          console.error('❌ 创建Sightline对象失败:', createError)
          this.sightlineAnalysis = null
          throw new Error('无法创建通视分析对象: ' + createError.message)
        }
      } else {
        console.log('✅ 使用现有的Sightline对象')

        // 确保现有对象处于可用状态
        try {
          // 清除之前的目标点
          if (
            typeof this.sightlineAnalysis.removeAllTargetPoint === 'function'
          ) {
            this.sightlineAnalysis.removeAllTargetPoint()
            console.log('✅ 清除现有Sightline对象的目标点')
          }

          // 重置观察点
          this.sightlineAnalysis.viewPosition = null
          console.log('✅ 重置现有Sightline对象的观察点')

          // 重新构建通视分析对象，确保分析功能正常工作
          if (typeof this.sightlineAnalysis.build === 'function') {
            this.sightlineAnalysis.build()
            console.log('✅ 重新构建现有Sightline对象')
          }
        } catch (resetError) {
          console.warn('⚠️ 重置现有Sightline对象时出错:', resetError)
          // 如果重置失败，强制重新创建对象
          this.sightlineAnalysis = null
          throw new Error(
            '现有Sightline对象不可用，需要重新创建: ' + resetError.message,
          )
        }
      }

      // 转换观察点坐标为经纬度
      const viewCartographic = SuperMap3D.Cartographic.fromCartesian(viewPoint)
      if (!viewCartographic) {
        throw new Error('观察点坐标转换失败')
      }

      if (!this.isValidCartographic(viewCartographic)) {
        throw new Error('观察点坐标转换后包含无效数值')
      }

      const viewLonLatHeight = [
        SuperMap3D.Math.toDegrees(viewCartographic.longitude),
        SuperMap3D.Math.toDegrees(viewCartographic.latitude),
        viewCartographic.height,
      ]

      if (!this.isValidLonLatHeight(viewLonLatHeight)) {
        throw new Error('观察点经纬度坐标包含无效数值')
      }

      // 设置观察点
      try {
        console.log('🎯 设置观察点:', viewLonLatHeight)
        this.sightlineAnalysis.viewPosition = viewLonLatHeight
      } catch (viewPointError) {
        console.error('❌ 设置观察点失败:', viewPointError)
        throw new Error('设置观察点失败: ' + viewPointError.message)
      }

      // 添加所有目标点
      const analysisResults = []
      const entities = [] // 仍然保留entities数组，但不添加重复的标记

      // 不再创建观察点标记，因为setSightlineViewPoint方法已经创建过了
      // 避免重复标记显示
      console.log('🎯 观察点标记已通过setSightlineViewPoint创建')

      for (let i = 0; i < targetPoints.length; i++) {
        const targetPointInfo = targetPoints[i]
        let targetPoint = targetPointInfo

        // 如果targetPointInfo是对象且包含position属性，提取position
        if (
          targetPointInfo &&
          typeof targetPointInfo === 'object' &&
          targetPointInfo.position
        ) {
          targetPoint = targetPointInfo.position
        }

        // 转换目标点坐标为经纬度
        const targetCartographic =
          SuperMap3D.Cartographic.fromCartesian(targetPoint)
        if (!targetCartographic) {
          console.warn(`⚠️ 目标点${i + 1}坐标转换失败，跳过`)
          continue
        }

        if (!this.isValidCartographic(targetCartographic)) {
          console.warn(`⚠️ 目标点${i + 1}坐标转换后包含无效数值，跳过`)
          continue
        }

        const targetLonLatHeight = [
          SuperMap3D.Math.toDegrees(targetCartographic.longitude),
          SuperMap3D.Math.toDegrees(targetCartographic.latitude),
          targetCartographic.height,
        ]

        if (!this.isValidLonLatHeight(targetLonLatHeight)) {
          console.warn(`⚠️ 目标点${i + 1}经纬度坐标包含无效数值，跳过`)
          continue
        }

        // 计算距离
        const distance = SuperMap3D.Cartesian3.distance(viewPoint, targetPoint)

        // 添加目标点
        const targetName = `target_${i + 1}_${Date.now()}`
        let addResult = false

        try {
          console.log(
            `🎯 添加目标点${i + 1}:`,
            targetLonLatHeight,
            '名称:',
            targetName,
          )
          addResult = this.sightlineAnalysis.addTargetPoint({
            position: targetLonLatHeight,
            name: targetName,
          })

          console.log(`🎯 目标点${i + 1}添加结果:`, addResult)
        } catch (targetError) {
          console.error(`❌ 添加目标点${i + 1}时出错:`, targetError)
          continue
        }

        if (!addResult) {
          console.warn(`⚠️ 添加目标点${i + 1}失败：API返回false`)
          continue
        }

        // 目标点标记已通过addSightlineTargetPoint方法创建
        console.log(`🎯 目标点${i + 1}标记已显示`)

        // 通视线由SuperMap3D原生Sightline对象创建
        console.log(`🎯 目标点${i + 1}的通视线由SuperMap3D原生实现创建`)

        // 保存分析结果
        const analysisData = {
          type: 'sightline',
          implementation: 'native',
          viewPoint: viewPoint,
          targetPoint: targetPoint,
          distance: distance,
          targetIndex: i + 1,
          targetName: targetName,
          timestamp: new Date().toISOString(),
          // 不再保存标记实体引用，因为这些实体已在其他方法中创建
          entities: [],
        }

        analysisResults.push(analysisData)
      }

      // 保存所有分析结果
      this.analysisResults.set('sightline', analysisResults)
      this.activeAnalysis = 'sightline'

      console.log('✅ 多点通视分析完成', {
        targetCount: targetPoints.length,
        successfulTargets: analysisResults.length,
        implementation: 'SuperMap3D原生实现',
      })

      // 显示成功信息
      if (typeof window !== 'undefined' && window.showSuccessMessage) {
        window.showSuccessMessage(
          '多点通视分析完成',
          `成功分析${analysisResults.length}个目标点 (SuperMap3D原生实现)`,
        )
      }

      return analysisResults
    } catch (error) {
      console.error('❌ 多点通视分析失败:', error)

      // 显示用户友好的错误信息
      if (typeof window !== 'undefined' && window.showErrorMessage) {
        window.showErrorMessage('多点通视分析失败', error.message)
      }

      return null
    }
  }

  /**
   * 距离量测
   * @param {Array<SuperMap3D.Cartesian3>} positions 测量点位置数组
   * @param {Object} options 可选参数
   */

  /**
   * 格式化距离显示
   * @param {number} distance 距离（米）
   * @param {number} precision 精度
   * @returns {string} 格式化后的距离字符串
   */
  formatDistance(distance, precision = 2) {
    if (distance >= 1000) {
      return (distance / 1000).toFixed(precision) + 'km'
    } else if (distance >= 1) {
      return distance.toFixed(precision) + 'm'
    } else {
      return (distance * 100).toFixed(precision) + 'cm'
    }
  }

  /**
   * 格式化面积显示
   * @param {number} area 面积（平方米）
   * @param {number} precision 精度
   * @returns {string} 格式化后的面积字符串
   */
  formatArea(area, precision = 2) {
    if (area >= 1000000) {
      return (area / 1000000).toFixed(precision) + 'km²'
    } else if (area >= 10000) {
      return (area / 10000).toFixed(precision) + '公顷'
    } else if (area >= 1) {
      return area.toFixed(precision) + 'm²'
    } else {
      return (area * 10000).toFixed(precision) + 'cm²'
    }
  }

  /**
   * 格式化体积显示
   * @param {number} volume 体积（立方米）
   * @param {number} precision 精度
   * @returns {string} 格式化后的体积字符串
   */
  formatVolume(volume, precision = 2) {
    if (volume >= 1000000000) {
      return (volume / 1000000000).toFixed(precision) + 'km³'
    } else if (volume >= 1000000) {
      return (volume / 1000000).toFixed(precision) + '百万m³'
    } else if (volume >= 1000) {
      return (volume / 1000).toFixed(precision) + '千m³'
    } else if (volume >= 1) {
      return volume.toFixed(precision) + 'm³'
    } else if (volume >= 0.001) {
      return (volume * 1000).toFixed(precision) + 'L'
    } else {
      return (volume * 1000000).toFixed(precision) + 'cm³'
    }
  }

  /**
   * 计算多边形周长
   * @param {Array<SuperMap3D.Cartesian3>} positions 顶点位置数组
   * @returns {number} 周长（米）
   */
  calculatePolygonPerimeter(positions) {
    let perimeter = 0
    for (let i = 0; i < positions.length; i++) {
      const nextIndex = (i + 1) % positions.length
      perimeter += SuperMap3D.Cartesian3.distance(
        positions[i],
        positions[nextIndex],
      )
    }
    return perimeter
  }

  /**
   * 检查点是否共线
   * @param {Array<SuperMap3D.Cartesian3>} positions 点位置数组
   * @returns {boolean} 是否共线
   */
  arePointsCollinear(positions) {
    if (positions.length < 3) return true

    // 使用前三个点检查是否共线
    const p1 = positions[0]
    const p2 = positions[1]
    const p3 = positions[2]

    // 计算向量叉积
    const v1 = SuperMap3D.Cartesian3.subtract(
      p2,
      p1,
      new SuperMap3D.Cartesian3(),
    )
    const v2 = SuperMap3D.Cartesian3.subtract(
      p3,
      p1,
      new SuperMap3D.Cartesian3(),
    )
    const cross = SuperMap3D.Cartesian3.cross(
      v1,
      v2,
      new SuperMap3D.Cartesian3(),
    )

    // 如果叉积的模长接近0，则点共线
    const magnitude = SuperMap3D.Cartesian3.magnitude(cross)
    return magnitude < 1e-10
  }

  /**
   * 剖面分析
   * @param {Array<SuperMap3D.Cartesian3>} positions 剖面线位置数组
   * @param {Object} options 可选参数
   */
  performProfileAnalysis(positions, options = {}) {
    try {
      console.log('📊 开始剖面分析...', {
        pointCount: positions ? positions.length : 0,
      })

      // 验证输入参数
      if (!positions || !Array.isArray(positions)) {
        throw new Error('剖面线位置必须是数组格式')
      }

      if (positions.length < 2) {
        throw new Error('剖面分析需要至少2个点')
      }

      // 验证每个点的有效性
      for (let i = 0; i < positions.length; i++) {
        if (!positions[i] || !SuperMap3D.defined(positions[i])) {
          throw new Error(`第${i + 1}个剖面点无效`)
        }
      }

      // 计算剖面线总长度
      const totalDistance = this.calculatePolygonPerimeter(positions)
      if (totalDistance > 50000) {
        console.warn(
          '⚠️ 剖面线距离较长(' +
            totalDistance.toFixed(2) +
            'm)，分析可能耗时较长',
        )
      }

      // 清除之前的分析结果
      this.clearAnalysisResults('profile')

      // 设置分析参数
      const sampleCount =
        options.sampleCount ||
        Math.min(Math.max(Math.floor(totalDistance / 10), 100), 1000)
      const lineColor = options.lineColor || SuperMap3D.Color.RED
      const lineWidth = options.lineWidth || 3
      const showElevationLabels = options.showElevationLabels !== false
      const showProfilePlane = options.showProfilePlane !== false
      const precision = options.precision || 2

      console.log(
        `🔍 采样点数: ${sampleCount}, 剖面线长度: ${this.formatDistance(totalDistance)}`,
      )

      // 检查深度纹理支持
      if (!this.scene.pickPositionSupported) {
        console.warn('⚠️ 不支持深度纹理，剖面分析功能可能受限')
      }

      // 使用SuperMap3D.Profile进行剖面分析
      let profile = null
      const analysisEntities = []

      try {
        // 创建SuperMap3D.Profile对象
        profile = new SuperMap3D.Profile(this.scene)

        if (positions.length >= 2) {
          const startPoint = positions[0]
          const endPoint = positions[positions.length - 1]

          // 转换为经纬度坐标
          const startCartographic =
            SuperMap3D.Cartographic.fromCartesian(startPoint)
          const endCartographic =
            SuperMap3D.Cartographic.fromCartesian(endPoint)

          const startLongitude = SuperMap3D.Math.toDegrees(
            startCartographic.longitude,
          )
          const startLatitude = SuperMap3D.Math.toDegrees(
            startCartographic.latitude,
          )
          const startHeight = startCartographic.height

          const endLongitude = SuperMap3D.Math.toDegrees(
            endCartographic.longitude,
          )
          const endLatitude = SuperMap3D.Math.toDegrees(
            endCartographic.latitude,
          )
          const endHeight = endCartographic.height

          // 设置剖面分析的起点和终点
          profile.startPoint = [startLongitude, startLatitude, startHeight]
          profile.endPoint = [endLongitude, endLatitude, endHeight]
          profile.extendHeight = options.extendHeight || 40

          console.log('🔍 剖面分析参数:', {
            startPoint: profile.startPoint,
            endPoint: profile.endPoint,
            extendHeight: profile.extendHeight,
          })
        }
      } catch (error) {
        console.warn('⚠️ SuperMap3D.Profile创建失败，使用自定义实现:', error)
        profile = null
      }

      // 执行剖面分析
      if (profile) {
        console.log('🛠️ 使用SuperMap3D.Profile进行剖面分析')

        // 设置剖面分析完成的回调函数
        profile.getBuffer((buffer) => {
          try {
            console.log('📊 剖面分析数据获取成功')

            // 显示剖面图表
            this.displayProfileChart(profile, buffer)
          } catch (error) {
            console.error('❌ 剖面图表显示失败:', error)
          }
        })

        // 执行剖面分析
        profile.build()

        // 绘制剖面线
        const profileLine = this.viewer.entities.add({
          id: 'profile-line-' + Date.now(),
          polyline: {
            positions: positions,
            width: lineWidth,
            material: lineColor,
            clampToGround: true,
            classificationType: SuperMap3D.ClassificationType.BOTH,
          },
        })

        analysisEntities.push(profileLine)
      } else {
        console.log('🛠️ 使用自定义剖面分析实现')

        // 生成剖面线上的采样点
        const samplePoints = this.generateProfileSamplePoints(
          positions,
          sampleCount,
        )

        // 获取每个采样点的高程
        const elevationData = this.getElevationProfile(samplePoints)

        // 绘制剖面线
        const profileLine = this.viewer.entities.add({
          id: 'profile-line-custom-' + Date.now(),
          polyline: {
            positions: positions,
            width: lineWidth,
            material: lineColor,
            clampToGround: true,
            classificationType: SuperMap3D.ClassificationType.BOTH,
          },
        })

        analysisEntities.push(profileLine)

        // 添加起点和终点标记
        const startPointEntity = this.viewer.entities.add({
          position: positions[0],
          point: {
            pixelSize: 10,
            color: SuperMap3D.Color.GREEN,
            outlineColor: SuperMap3D.Color.WHITE,
            outlineWidth: 2,
            heightReference: SuperMap3D.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: '剖面起点',
            font: '12pt sans-serif',
            fillColor: SuperMap3D.Color.WHITE,
            outlineColor: SuperMap3D.Color.BLACK,
            outlineWidth: 2,
            style: SuperMap3D.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new SuperMap3D.Cartesian2(0, -30),
          },
        })

        const endPointEntity = this.viewer.entities.add({
          position: positions[positions.length - 1],
          point: {
            pixelSize: 10,
            color: SuperMap3D.Color.RED,
            outlineColor: SuperMap3D.Color.WHITE,
            outlineWidth: 2,
            heightReference: SuperMap3D.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: '剖面终点',
            font: '12pt sans-serif',
            fillColor: SuperMap3D.Color.WHITE,
            outlineColor: SuperMap3D.Color.BLACK,
            outlineWidth: 2,
            style: SuperMap3D.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new SuperMap3D.Cartesian2(0, -30),
          },
        })

        analysisEntities.push(startPointEntity, endPointEntity)

        // 添加中间控制点标记
        for (let i = 1; i < positions.length - 1; i++) {
          const controlPointEntity = this.viewer.entities.add({
            position: positions[i],
            point: {
              pixelSize: 8,
              color: SuperMap3D.Color.BLUE,
              outlineColor: SuperMap3D.Color.WHITE,
              outlineWidth: 2,
              heightReference: SuperMap3D.HeightReference.CLAMP_TO_GROUND,
            },
            label: {
              text: `P${i + 1}`,
              font: '10pt sans-serif',
              fillColor: SuperMap3D.Color.WHITE,
              outlineColor: SuperMap3D.Color.BLACK,
              outlineWidth: 1,
              style: SuperMap3D.LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new SuperMap3D.Cartesian2(0, -25),
            },
          })

          analysisEntities.push(controlPointEntity)
        }

        // 添加高程标注（可选）
        if (showElevationLabels && elevationData.length > 0) {
          const labelInterval = Math.max(
            1,
            Math.floor(elevationData.length / 15),
          )

          for (let i = 0; i < elevationData.length; i += labelInterval) {
            const data = elevationData[i]
            if (data && data.elevation !== undefined) {
              const elevationLabel = this.viewer.entities.add({
                position: data.position,
                label: {
                  text: `${data.elevation.toFixed(precision)}m`,
                  font: '10pt sans-serif',
                  fillColor: SuperMap3D.Color.YELLOW,
                  outlineColor: SuperMap3D.Color.BLACK,
                  outlineWidth: 1,
                  style: SuperMap3D.LabelStyle.FILL_AND_OUTLINE,
                  pixelOffset: new SuperMap3D.Cartesian2(0, -15),
                  scale: 0.8,
                },
              })

              analysisEntities.push(elevationLabel)
            }
          }
        }

        // 创建自定义剖面对象
        profile = {
          positions: positions,
          samplePoints: samplePoints,
          elevationData: elevationData,
          distance: totalDistance,
          entities: analysisEntities,
          isCustom: true,
        }
      }

      // 保存分析结果
      const analysisData = {
        profile: profile,
        positions: positions,
        distance: totalDistance,
        sampleCount: sampleCount,
        timestamp: new Date().toISOString(),
        entities: analysisEntities,
        options: options,
      }

      this.analysisResults.set('profile', analysisData)
      this.activeAnalysis = 'profile'
      this.analysisEntities.push(...analysisEntities)

      console.log('✅ 剖面分析完成', {
        distance: this.formatDistance(totalDistance),
        sampleCount: sampleCount,
        segments: positions.length - 1,
        type: profile && profile.isCustom ? '自定义实现' : 'SuperMap3D内置',
      })

      return analysisData
    } catch (error) {
      console.error('❌ 剖面分析失败:', error)

      // 显示用户友好的错误信息
      if (typeof window !== 'undefined' && window.showErrorMessage) {
        window.showErrorMessage('剖面分析失败', error.message)
      }

      return null
    }
  }

  /**
   * 显示剖面图表
   * @param {SuperMap3D.Profile} profile 剖面分析对象
   * @param {Uint8Array} buffer 剖面数据缓冲区
   */
  displayProfileChart(profile, buffer) {
    try {
      console.log('📊 开始绘制剖面图表...')

      // 优先使用主界面的剖面图表容器
      let canvas = document.getElementById('mainProfileChart')
      let chartContainer = document.getElementById('mainProfileChartContainer')

      console.log('🔍 检查主界面元素:', {
        mainCanvas: canvas ? '存在' : '不存在',
        mainContainer: chartContainer ? '存在' : '不存在',
        mainContainerDisplay: chartContainer
          ? chartContainer.style.display
          : 'N/A',
      })

      // 如果主界面容器不存在，则使用面板中的容器
      if (!canvas) {
        canvas = document.getElementById('profileChart')
        chartContainer = document.getElementById('profileChartContainer')
        console.log('🔄 回退到面板元素:', {
          panelCanvas: canvas ? '存在' : '不存在',
          panelContainer: chartContainer ? '存在' : '不存在',
        })
      }

      if (!canvas) {
        console.error('❌ 找不到剖面图表canvas元素')
        return
      }

      // 设置canvas尺寸
      canvas.width = profile._textureWidth || 600
      canvas.height = profile._textureHeight || 300

      const ctx = canvas.getContext('2d')

      // 创建图像数据
      const imgData = ctx.createImageData(canvas.width, canvas.height)
      imgData.data.set(buffer)

      // 在canvas上绘制图像
      ctx.putImageData(imgData, 0, 0)

      // 显示图表容器
      if (chartContainer) {
        chartContainer.style.display = 'block'
        chartContainer.style.visibility = 'visible'
        chartContainer.style.opacity = '1'

        // 如果是主界面容器，确保层级最高
        if (chartContainer.id === 'mainProfileChartContainer') {
          chartContainer.style.zIndex = '9999'
          chartContainer.style.position = 'fixed'
        }

        // 调整canvas显示尺寸
        canvas.style.width = '100%'
        canvas.style.height = 'auto'
        canvas.style.maxWidth = '500px'
        canvas.style.maxHeight = '300px'

        console.log('✅ 图表容器已显示:', {
          containerId: chartContainer.id,
          display: chartContainer.style.display,
          visibility: chartContainer.style.visibility,
          zIndex: chartContainer.style.zIndex,
          position: chartContainer.style.position,
        })
      }

      console.log('✅ 剖面图表绘制完成', {
        width: canvas.width,
        height: canvas.height,
        bufferSize: buffer.length,
        container: chartContainer ? chartContainer.id : 'none',
      })
    } catch (error) {
      console.error('❌ 剖面图表显示失败:', error)
    }
  }

  /**
   * 隐藏剖面图表
   */
  hideProfileChart() {
    try {
      // 隐藏主界面的剖面图表容器
      const mainChartContainer = document.getElementById(
        'mainProfileChartContainer',
      )
      if (mainChartContainer) {
        mainChartContainer.style.display = 'none'

        // 清空主界面canvas内容
        const mainCanvas = document.getElementById('mainProfileChart')
        if (mainCanvas) {
          const ctx = mainCanvas.getContext('2d')
          ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height)
          mainCanvas.width = 0
          mainCanvas.height = 0
        }
      }

      // 隐藏面板中的剖面图表容器
      const chartContainer = document.getElementById('profileChartContainer')
      if (chartContainer) {
        chartContainer.style.display = 'none'

        // 清空面板canvas内容
        const canvas = document.getElementById('profileChart')
        if (canvas) {
          const ctx = canvas.getContext('2d')
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          canvas.width = 0
          canvas.height = 0
        }
      }

      console.log('✅ 剖面图表已隐藏')
    } catch (error) {
      console.error('❌ 隐藏剖面图表失败:', error)
    }
  }

  /**
   * 生成剖面线上的采样点
   * @param {Array<SuperMap3D.Cartesian3>} positions 剖面线位置数组
   * @param {number} sampleCount 采样点数量
   * @returns {Array<SuperMap3D.Cartesian3>} 采样点数组
   */
  generateProfileSamplePoints(positions, sampleCount) {
    const points = []

    // 计算每段的长度
    const segments = []
    let totalLength = 0

    for (let i = 0; i < positions.length - 1; i++) {
      const segmentLength = SuperMap3D.Cartesian3.distance(
        positions[i],
        positions[i + 1],
      )
      segments.push(segmentLength)
      totalLength += segmentLength
    }

    // 按比例在每段上分配采样点
    for (let i = 0; i < positions.length - 1; i++) {
      const segmentSampleCount = Math.max(
        1,
        Math.floor((sampleCount * segments[i]) / totalLength),
      )

      for (let j = 0; j < segmentSampleCount; j++) {
        const t = j / segmentSampleCount
        const point = SuperMap3D.Cartesian3.lerp(
          positions[i],
          positions[i + 1],
          t,
          new SuperMap3D.Cartesian3(),
        )
        points.push(point)
      }
    }

    // 确保包含最后一个点
    if (
      points.length === 0 ||
      !SuperMap3D.Cartesian3.equals(
        points[points.length - 1],
        positions[positions.length - 1],
      )
    ) {
      points.push(positions[positions.length - 1])
    }

    return points
  }

  /**
   * 获取剖面线的高程数据
   * @param {Array<SuperMap3D.Cartesian3>} samplePoints 采样点数组
   * @returns {Array<Object>} 高程数据数组
   */
  getElevationProfile(samplePoints) {
    const elevationData = []
    let cumulativeDistance = 0

    try {
      for (let i = 0; i < samplePoints.length; i++) {
        const point = samplePoints[i]

        // 计算累积距离
        if (i > 0) {
          cumulativeDistance += SuperMap3D.Cartesian3.distance(
            samplePoints[i - 1],
            point,
          )
        }

        // 转换为地理坐标
        const cartographic = SuperMap3D.Cartographic.fromCartesian(point)

        // 获取地形高程（如果可用）
        let elevation = 0
        if (this.scene.globe && this.scene.globe.getHeight) {
          elevation = this.scene.globe.getHeight(cartographic) || 0
        } else if (cartographic.height !== undefined) {
          elevation = cartographic.height
        }

        elevationData.push({
          position: point,
          cartographic: cartographic,
          elevation: elevation,
          distance: cumulativeDistance,
          longitude: SuperMap3D.Math.toDegrees(cartographic.longitude),
          latitude: SuperMap3D.Math.toDegrees(cartographic.latitude),
        })
      }

      // 计算高程统计信息
      if (elevationData.length > 0) {
        const elevations = elevationData.map((d) => d.elevation)
        const minElevation = Math.min(...elevations)
        const maxElevation = Math.max(...elevations)
        const avgElevation =
          elevations.reduce((sum, e) => sum + e, 0) / elevations.length

        console.log('📈 高程统计:', {
          最低高程: minElevation.toFixed(2) + 'm',
          最高高程: maxElevation.toFixed(2) + 'm',
          平均高程: avgElevation.toFixed(2) + 'm',
          高差: (maxElevation - minElevation).toFixed(2) + 'm',
        })
      }
    } catch (error) {
      console.warn('⚠️ 获取高程数据时出错:', error)
    }

    return elevationData
  }

  /**
   * 开挖分析
   * @param {Array<SuperMap3D.Cartesian3>} positions 开挖区域位置数组
   * @param {number} depth 开挖深度
   */

  /**
   * 格式化体积显示
   * @param {number} volume 体积（立方米）
   * @param {number} precision 精度
   * @returns {string} 格式化的体积字符串
   */
  formatVolume(volume, precision = 2) {
    if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(precision)} 百万立方米`
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(precision)} 千立方米`
    } else {
      return `${volume.toFixed(precision)} 立方米`
    }
  }

  /**
   * 断面分析
   * @param {SuperMap3D.Cartesian3} startPoint 起点
   * @param {SuperMap3D.Cartesian3} endPoint 终点
   */

  /**
   * 模型属性查询
   * @param {SuperMap3D.Cartesian2} windowPosition 屏幕坐标位置
   * @param {Object} options 查询选项
   * @returns {Object|null} 查询结果
   */
  queryModelAttributes(windowPosition, options = {}) {
    try {
      // 参数验证
      if (!windowPosition || !SuperMap3D.defined(windowPosition)) {
        console.error('模型属性查询失败: 需要有效的屏幕坐标位置')
        return null
      }

      // 默认选项
      const defaultOptions = {
        showPopup: true,
        showInConsole: true,
        includeGeometry: false,
        precision: 6,
      }
      const finalOptions = { ...defaultOptions, ...options }

      console.log('开始模型属性查询...', {
        windowPosition: windowPosition,
        options: finalOptions,
      })

      // 执行拾取
      const pickedObject = this.scene.pick(windowPosition)

      if (!SuperMap3D.defined(pickedObject)) {
        console.log('未拾取到任何对象')
        return null
      }

      const result = {
        picked: true,
        position: windowPosition,
        objectType: null,
        properties: {},
        geometry: null,
        worldPosition: null,
      }

      // 获取世界坐标
      const cartesian = this.viewer.camera.pickEllipsoid(
        windowPosition,
        this.scene.globe.ellipsoid,
      )
      if (cartesian) {
        result.worldPosition = cartesian
        const cartographic = SuperMap3D.Cartographic.fromCartesian(cartesian)
        result.coordinates = {
          longitude: SuperMap3D.Math.toDegrees(cartographic.longitude).toFixed(
            finalOptions.precision,
          ),
          latitude: SuperMap3D.Math.toDegrees(cartographic.latitude).toFixed(
            finalOptions.precision,
          ),
          height: cartographic.height.toFixed(2),
        }
      }

      // 处理不同类型的拾取对象
      if (pickedObject.primitive) {
        const primitive = pickedObject.primitive
        result.objectType = 'primitive'

        // 处理3D Tiles特征
        if (primitive.getProperty && primitive.getPropertyNames) {
          const propertyNames = primitive.getPropertyNames()

          propertyNames.forEach((name) => {
            try {
              result.properties[name] = primitive.getProperty(name)
            } catch (error) {
              result.properties[name] = `获取失败: ${error.message}`
            }
          })

          result.objectType = '3DTiles特征'
        }

        // 处理模型信息
        if (primitive.modelMatrix) {
          result.hasModelMatrix = true
        }

        if (primitive.boundingSphere) {
          result.boundingSphere = {
            center: primitive.boundingSphere.center,
            radius: primitive.boundingSphere.radius,
          }
        }
      } else if (pickedObject.id) {
        // 处理Entity对象
        const entity = pickedObject.id
        result.objectType = 'Entity'
        result.entityId = entity.id
        result.entityName = entity.name || '未命名实体'

        // 获取Entity属性
        if (entity.properties) {
          const propertyNames = entity.properties.propertyNames
          if (propertyNames && propertyNames.length > 0) {
            propertyNames.forEach((name) => {
              try {
                result.properties[name] = entity.properties[name]
              } catch (error) {
                result.properties[name] = `获取失败: ${error.message}`
              }
            })
          }
        }

        // 获取几何信息
        if (finalOptions.includeGeometry) {
          if (entity.polygon) {
            result.geometry = { type: 'polygon' }
          } else if (entity.polyline) {
            result.geometry = { type: 'polyline' }
          } else if (entity.point) {
            result.geometry = { type: 'point' }
          } else if (entity.model) {
            result.geometry = { type: 'model' }
          }
        }
      }

      // 输出到控制台
      if (finalOptions.showInConsole) {
        console.log('模型属性查询结果:', result)
      }

      // 显示弹窗
      if (
        finalOptions.showPopup &&
        result.properties &&
        Object.keys(result.properties).length > 0
      ) {
        this.showAttributePopup(result)
      }

      return result
    } catch (error) {
      console.error('模型属性查询失败:', error)
      return null
    }
  }

  /**
   * 显示属性弹窗
   * @param {Object} queryResult 查询结果
   */
  showAttributePopup(queryResult) {
    try {
      // 创建弹窗内容
      let content = `<div style="max-width: 300px; font-family: Arial, sans-serif;">`
      content += `<h4 style="margin: 0 0 10px 0; color: #333;">${queryResult.objectType || '对象属性'}</h4>`

      if (queryResult.entityName) {
        content += `<p><strong>名称:</strong> ${queryResult.entityName}</p>`
      }

      if (queryResult.coordinates) {
        content += `<p><strong>坐标:</strong><br/>`
        content += `经度: ${queryResult.coordinates.longitude}°<br/>`
        content += `纬度: ${queryResult.coordinates.latitude}°<br/>`
        content += `高度: ${queryResult.coordinates.height}m</p>`
      }

      if (Object.keys(queryResult.properties).length > 0) {
        content += `<p><strong>属性:</strong></p>`
        content += `<table style="width: 100%; border-collapse: collapse;">`

        Object.entries(queryResult.properties).forEach(([key, value]) => {
          content += `<tr style="border-bottom: 1px solid #eee;">`
          content += `<td style="padding: 2px 5px; font-weight: bold;">${key}:</td>`
          content += `<td style="padding: 2px 5px;">${value}</td>`
          content += `</tr>`
        })

        content += `</table>`
      }

      content += `</div>`

      // 创建信息框实体
      const infoEntity = this.viewer.entities.add({
        position: queryResult.worldPosition,
        label: {
          text: content,
          font: '12pt sans-serif',
          fillColor: SuperMap3D.Color.WHITE,
          backgroundColor: SuperMap3D.Color.BLACK.withAlpha(0.8),
          showBackground: true,
          pixelOffset: new SuperMap3D.Cartesian2(0, -100),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })

      // 5秒后自动移除
      setTimeout(() => {
        this.viewer.entities.remove(infoEntity)
      }, 5000)
    } catch (error) {
      console.error('显示属性弹窗失败:', error)
    }
  }

  /**
   * 计算多边形面积
   * @param {Array<SuperMap3D.Cartesian3>} positions 顶点位置数组
   * @returns {number} 面积
   */
  calculatePolygonArea(positions) {
    if (positions.length < 3) return 0

    // 转换为地理坐标
    const cartographics = positions.map((pos) =>
      SuperMap3D.Cartographic.fromCartesian(pos),
    )

    // 简化的面积计算（球面几何）
    let area = 0
    const n = cartographics.length

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const lat1 = cartographics[i].latitude
      const lon1 = cartographics[i].longitude
      const lat2 = cartographics[j].latitude
      const lon2 = cartographics[j].longitude

      area += (lon2 - lon1) * (lat1 + lat2)
    }

    area = Math.abs(area) * 0.5

    // 转换为平方米（近似）
    const earthRadius = 6371000 // 地球半径（米）
    return area * earthRadius * earthRadius
  }

  /**
   * 计算多边形中心点
   * @param {Array<SuperMap3D.Cartesian3>} positions 顶点位置数组
   * @returns {SuperMap3D.Cartesian3} 中心点
   */
  calculatePolygonCenter(positions) {
    let x = 0,
      y = 0,
      z = 0

    positions.forEach((pos) => {
      x += pos.x
      y += pos.y
      z += pos.z
    })

    return new SuperMap3D.Cartesian3(
      x / positions.length,
      y / positions.length,
      z / positions.length,
    )
  }

  /**
   * 初始化可视域分析
   */
  initViewshedAnalysis() {
    try {
      // 检查SuperMap3D是否支持可视域分析
      if (typeof SuperMap3D !== 'undefined' && SuperMap3D.ViewShed3D) {
        // console.log('✅ 可视域分析功能可用 (使用SuperMap3D原生API)');
        return true
      } else {
        // console.log('✅ 可视域分析功能可用 (使用自定义实现)');
        return true
      }
    } catch (error) {
      // console.log('✅ 可视域分析功能可用 (使用自定义实现)');
      return true
    }
  }

  /**
   * 初始化通视分析
   */
  initSightlineAnalysis() {
    try {
      // 检查SuperMap3D是否支持通视分析
      if (typeof SuperMap3D !== 'undefined' && SuperMap3D.Sightline) {
        // 初始化SuperMap3D原生通视分析对象
        this.sightline = new SuperMap3D.Sightline(this.scene)

        // 设置通视分析颜色
        this.sightline.visibleColor = new SuperMap3D.Color(0, 1, 0, 1) // 绿色表示可见
        this.sightline.hiddenColor = new SuperMap3D.Color(1, 0, 0, 1) // 红色表示不可见
        this.sightline.lineWidth = 3

        // 构建通视分析
        this.sightline.build()

        // 初始化通视分析相关变量
        this.sightlineViewPoint = null
        this.sightlineTargetPoints = []
        this.sightlinePointCounter = 0
        this.sightlineViewPointEntity = null
        this.sightlineTargetPointEntities = []

        // console.log('✅ 通视分析功能可用 (使用SuperMap3D原生API)');
        return true
      } else {
        // console.log('✅ 通视分析功能可用 (使用自定义实现)');
        return true
      }
    } catch (error) {
      // console.log('✅ 通视分析功能可用 (使用自定义实现)');
      return true
    }
  }

  /**
   * 初始化量测工具
   */
  initMeasurementTools() {
    try {
      // 检查场景是否可用
      if (!this.scene || !this.scene.canvas) {
        throw new Error('场景或画布不可用')
      }

      // 初始化量测相关的事件处理器
      this.measurementHandler = new SuperMap3D.ScreenSpaceEventHandler(
        this.scene.canvas,
      )
      this.measurementPoints = []
      this.measurementMode = null // 'distance', 'area', 'height'

      console.log('✅ 量测工具初始化成功')
      return true
    } catch (error) {
      console.error('❌ 量测工具初始化失败:', error)
      return false
    }
  }

  /**
   * 初始化剖面分析
   */
  initProfileAnalysis() {
    try {
      // 检查场景是否可用
      if (!this.scene || !this.scene.canvas) {
        throw new Error('场景或画布不可用')
      }

      // 初始化剖面分析的事件处理器
      this.profileHandler = new SuperMap3D.ScreenSpaceEventHandler(
        this.scene.canvas,
      )

      // console.log('✅ 剖面分析功能可用 (使用SuperMap3D原生API)');
      return { available: true, native: false }
    } catch (error) {
      console.error('❌ 剖面分析初始化失败:', error)
      return { available: false, native: false, error: error.message }
    }
  }

  /**
   * 初始化模型属性查询
   */
  initModelQuery() {
    try {
      // 检查拾取功能
      if (this.viewer && this.viewer.scene && this.viewer.scene.pick) {
        console.log('✅ 模型属性查询功能可用')
        return { available: true, native: true }
      } else {
        throw new Error('场景拾取功能不可用')
      }
    } catch (error) {
      console.error('❌ 模型属性查询初始化失败:', error)
      return { available: false, native: false, error: error.message }
    }
  }

  /**
   * 获取所有分析功能的状态
   * @returns {Object} 功能状态报告
   */
  getAnalysisCapabilities() {
    const capabilities = {
      viewshed: this.initViewshedAnalysis(),
      sightline: this.initSightlineAnalysis(),
      shadow: this.initShadowAnalysis(),
      skyline: this.initSkylineAnalysis(),
      profile: this.initProfileAnalysis(),
      modelQuery: this.initModelQuery(),
    }

    // 统计可用功能
    const availableCount = Object.values(capabilities).filter(
      (cap) => cap.available,
    ).length
    const totalCount = Object.keys(capabilities).length
    const nativeCount = Object.values(capabilities).filter(
      (cap) => cap.available && cap.native,
    ).length

    console.log(`\n📊 数字孪生分析功能状态报告:`)
    console.log(`总功能数: ${totalCount}`)
    console.log(
      `可用功能: ${availableCount}/${totalCount} (${Math.round((availableCount / totalCount) * 100)}%)`,
    )
    console.log(
      `原生API: ${nativeCount}/${availableCount} (${availableCount > 0 ? Math.round((nativeCount / availableCount) * 100) : 0}%)`,
    )
    console.log(
      `自定义实现: ${availableCount - nativeCount}/${availableCount}\n`,
    )

    return {
      capabilities,
      summary: {
        total: totalCount,
        available: availableCount,
        native: nativeCount,
        custom: availableCount - nativeCount,
        availabilityRate: Math.round((availableCount / totalCount) * 100),
        nativeRate:
          availableCount > 0
            ? Math.round((nativeCount / availableCount) * 100)
            : 0,
      },
    }
  }

  /**
   * 批量导出所有分析结果
   * @param {Object} options 导出选项
   * @param {string} options.format 导出格式
   * @param {boolean} options.downloadFile 是否下载文件
   * @param {boolean} options.includeMetadata 是否包含元数据
   * @returns {Object} 批量导出结果
   */
  exportAllAnalysisResults(options = {}) {
    try {
      const {
        format = 'json',
        downloadFile = false,
        includeMetadata = true,
      } = options

      const exportResults = {}
      const errors = []

      // 遍历所有分析结果
      this.analysisResults.forEach((result, analysisType) => {
        try {
          const exportData = this.exportAnalysisResult(analysisType, {
            format,
            downloadFile: false, // 批量导出时不单独下载
            includeMetadata,
          })
          exportResults[analysisType] = exportData
        } catch (error) {
          errors.push({ analysisType, error: error.message })
          console.error(`导出${analysisType}分析结果失败:`, error)
        }
      })

      // 构建批量导出数据
      const batchExportData = {
        exportType: 'batch',
        timestamp: new Date().toISOString(),
        format: format,
        totalResults: this.analysisResults.size,
        successfulExports: Object.keys(exportResults).length,
        errors: errors,
        results: exportResults,
      }

      if (includeMetadata) {
        batchExportData.metadata = {
          version: '1.0.0',
          generator: 'DigitalTwinAnalysis',
          capabilities: this.getAnalysisCapabilities().summary,
        }
      }

      // 下载批量导出文件
      if (downloadFile && Object.keys(exportResults).length > 0) {
        let content
        let filename
        let mimeType

        switch (format.toLowerCase()) {
          case 'json':
            content = JSON.stringify(batchExportData, null, 2)
            filename = `batch_analysis_results_${Date.now()}.json`
            mimeType = 'application/json'
            break
          case 'csv':
            content = this.convertBatchToCSV(batchExportData)
            filename = `batch_analysis_results_${Date.now()}.csv`
            mimeType = 'text/csv'
            break
          default:
            content = JSON.stringify(batchExportData, null, 2)
            filename = `batch_analysis_results_${Date.now()}.json`
            mimeType = 'application/json'
        }

        this.downloadFile(content, filename, mimeType)
      }

      console.log(
        `批量导出完成: ${Object.keys(exportResults).length}/${this.analysisResults.size} 个分析结果`,
      )
      return batchExportData
    } catch (error) {
      console.error('批量导出分析结果失败:', error)
      throw error
    }
  }

  /**
   * 转换批量导出数据为CSV格式
   * @param {Object} batchData 批量导出数据
   * @returns {string} CSV字符串
   */
  convertBatchToCSV(batchData) {
    try {
      let csvContent = ''

      // 添加头部信息
      csvContent += `Export Type,${batchData.exportType}\n`
      csvContent += `Timestamp,${batchData.timestamp}\n`
      csvContent += `Format,${batchData.format}\n`
      csvContent += `Total Results,${batchData.totalResults}\n`
      csvContent += `Successful Exports,${batchData.successfulExports}\n`
      csvContent += '\n'

      // 添加错误信息
      if (batchData.errors && batchData.errors.length > 0) {
        csvContent += 'Errors:\n'
        csvContent += 'Analysis Type,Error Message\n'
        batchData.errors.forEach((error) => {
          csvContent += `${error.analysisType},"${error.error}"\n`
        })
        csvContent += '\n'
      }

      // 添加分析结果摘要
      csvContent += 'Analysis Results Summary:\n'
      csvContent += 'Analysis Type,Status\n'
      Object.keys(batchData.results).forEach((analysisType) => {
        csvContent += `${analysisType},Success\n`
      })

      return csvContent
    } catch (error) {
      console.error('转换批量CSV失败:', error)
      return ''
    }
  }

  /**
   * 清除分析结果
   * @param {string} analysisType 分析类型
   */
  clearAnalysisResults(analysisType) {
    try {
      if (!analysisType) {
        console.warn('清除分析结果失败: 未指定分析类型')
        return false
      }

      if (!this.analysisResults.has(analysisType)) {
        console.log(`没有找到 ${analysisType} 类型的分析结果`)
        return true
      }

      const result = this.analysisResults.get(analysisType)
      console.log(`开始清除 ${analysisType} 分析结果...`)

      // 根据分析类型清除相应结果
      switch (analysisType) {
        case 'viewshed':
          // 清除可视域分析对象 - 基于元数据的精确清理
          if (result.viewshed && !result.isDestroyed) {
            try {
              // 检查对象是否已经被销毁
              let isDestroyed = false
              try {
                isDestroyed =
                  result.viewshed.isDestroyed && result.viewshed.isDestroyed()
              } catch (checkError) {
                console.warn('检查可视域分析对象状态失败:', checkError.message)
                isDestroyed = true // 假设已销毁
              }

              if (!isDestroyed) {
                // 根据保存的集合信息进行精确清理
                if (
                  result.addedToCollection === 'viewshedAnalysis3Ds' &&
                  this.scene.viewshedAnalysis3Ds
                ) {
                  try {
                    this.scene.viewshedAnalysis3Ds.remove(result.viewshed)
                    console.log('✅ 从viewshedAnalysis3Ds集合中移除可视域分析')
                  } catch (removeError) {
                    console.warn(
                      '从viewshedAnalysis3Ds集合移除失败:',
                      removeError.message,
                    )
                  }
                } else if (
                  result.addedToCollection === 'primitives' &&
                  this.scene.primitives
                ) {
                  try {
                    this.scene.primitives.remove(result.viewshed)
                    console.log('✅ 从primitives集合中移除可视域分析')
                  } catch (removeError) {
                    console.warn(
                      '从primitives集合移除失败:',
                      removeError.message,
                    )
                  }
                } else {
                  // 兜底策略：尝试所有可能的集合
                  let removed = false
                  if (
                    this.scene.viewshedAnalysis3Ds &&
                    typeof this.scene.viewshedAnalysis3Ds.remove === 'function'
                  ) {
                    try {
                      this.scene.viewshedAnalysis3Ds.remove(result.viewshed)
                      removed = true
                      console.log(
                        '✅ 兜底策略：从viewshedAnalysis3Ds集合中移除',
                      )
                    } catch (e) {
                      console.warn(
                        '兜底策略：从viewshedAnalysis3Ds集合移除失败:',
                        e.message,
                      )
                    }
                  }
                  if (
                    !removed &&
                    this.scene.primitives &&
                    typeof this.scene.primitives.remove === 'function'
                  ) {
                    try {
                      this.scene.primitives.remove(result.viewshed)
                      console.log('✅ 兜底策略：从primitives集合中移除')
                    } catch (e) {
                      console.warn(
                        '兜底策略：从primitives集合移除失败:',
                        e.message,
                      )
                    }
                  }
                }

                // 销毁分析对象
                if (typeof result.viewshed.destroy === 'function') {
                  try {
                    result.viewshed.destroy()
                    result.isDestroyed = true
                    console.log('✅ 销毁可视域分析对象')
                  } catch (destroyError) {
                    console.warn(
                      '销毁可视域分析对象失败:',
                      destroyError.message,
                    )
                    result.isDestroyed = true // 标记为已销毁，避免重复尝试
                  }
                }
              } else {
                console.log('⚠️ 可视域分析对象已被销毁，跳过清理')
                result.isDestroyed = true
              }
            } catch (removeError) {
              console.warn('⚠️ 清除可视域分析对象时出错:', removeError)
              result.isDestroyed = true // 标记为已销毁，避免重复尝试
            }
          } else if (result.isDestroyed) {
            console.log('⚠️ 可视域分析对象已标记为销毁状态，跳过清理')
          }

          // 清除官方ViewShed3D对象
          if (result.officialViewshed && !result.officialViewshedDestroyed) {
            try {
              // 检查对象是否已经被销毁
              let isDestroyed = false
              try {
                isDestroyed =
                  result.officialViewshed.isDestroyed &&
                  result.officialViewshed.isDestroyed()
              } catch (checkError) {
                console.warn(
                  '检查官方可视域分析对象状态失败:',
                  checkError.message,
                )
                isDestroyed = true // 假设已销毁
              }

              if (!isDestroyed) {
                // 从viewshedAnalysis3Ds集合中移除
                if (
                  this.scene.viewshedAnalysis3Ds &&
                  typeof this.scene.viewshedAnalysis3Ds.remove === 'function'
                ) {
                  try {
                    this.scene.viewshedAnalysis3Ds.remove(
                      result.officialViewshed,
                    )
                    console.log(
                      '✅ 从viewshedAnalysis3Ds集合中移除官方可视域分析',
                    )
                  } catch (removeError) {
                    console.warn(
                      '从viewshedAnalysis3Ds集合移除官方可视域分析失败:',
                      removeError.message,
                    )
                  }
                }

                // 销毁对象
                if (typeof result.officialViewshed.destroy === 'function') {
                  try {
                    result.officialViewshed.destroy()
                    result.officialViewshedDestroyed = true
                    console.log('✅ 销毁官方可视域分析对象')
                  } catch (destroyError) {
                    console.warn(
                      '销毁官方可视域分析对象失败:',
                      destroyError.message,
                    )
                    result.officialViewshedDestroyed = true // 标记为已销毁，避免重复尝试
                  }
                }
              } else {
                console.log('⚠️ 官方可视域分析对象已被销毁，跳过清理')
                result.officialViewshedDestroyed = true
              }
            } catch (removeError) {
              console.warn('⚠️ 清除官方可视域分析对象时出错:', removeError)
              result.officialViewshedDestroyed = true // 标记为已销毁，避免重复尝试
            }
          }

          // 清除viewshed3D对象（新增的官方实现对象）
          if (result.viewshed3D && !result.isDestroyed) {
            try {
              // 检查对象是否已经被销毁
              let isDestroyed = false
              try {
                isDestroyed =
                  result.viewshed3D.isDestroyed &&
                  result.viewshed3D.isDestroyed()
              } catch (checkError) {
                console.warn('检查viewshed3D对象状态失败:', checkError.message)
                isDestroyed = true // 假设已销毁
              }

              if (!isDestroyed) {
                // 从viewshedAnalysis3Ds集合中移除
                if (
                  this.scene.viewshedAnalysis3Ds &&
                  typeof this.scene.viewshedAnalysis3Ds.remove === 'function'
                ) {
                  try {
                    this.scene.viewshedAnalysis3Ds.remove(result.viewshed3D)
                    console.log(
                      '✅ 从viewshedAnalysis3Ds集合中移除viewshed3D对象',
                    )
                  } catch (removeError) {
                    console.warn(
                      '从viewshedAnalysis3Ds集合移除viewshed3D对象失败:',
                      removeError.message,
                    )
                  }
                }

                // 销毁对象
                if (typeof result.viewshed3D.destroy === 'function') {
                  try {
                    result.viewshed3D.destroy()
                    result.isDestroyed = true
                    console.log('✅ 销毁viewshed3D对象')
                  } catch (destroyError) {
                    console.warn(
                      '销毁viewshed3D对象失败:',
                      destroyError.message,
                    )
                    result.isDestroyed = true // 标记为已销毁，避免重复尝试
                  }
                }
              } else {
                console.log('⚠️ viewshed3D对象已被销毁，跳过清理')
                result.isDestroyed = true
              }
            } catch (removeError) {
              console.warn('⚠️ 清除viewshed3D对象时出错:', removeError)
              result.isDestroyed = true // 标记为已销毁，避免重复尝试
            }
          }

          // 清除备用分析对象
          if (result.analysis) {
            try {
              // 检查备用分析对象是否已经被销毁
              const isAnalysisDestroyed =
                result.analysis.isDestroyed && result.analysis.isDestroyed()

              if (!isAnalysisDestroyed) {
                if (
                  this.scene.viewshedAnalysis3Ds &&
                  typeof this.scene.viewshedAnalysis3Ds.remove === 'function'
                ) {
                  this.scene.viewshedAnalysis3Ds.remove(result.analysis)
                } else if (
                  this.scene.primitives &&
                  typeof this.scene.primitives.remove === 'function'
                ) {
                  this.scene.primitives.remove(result.analysis)
                }
                if (typeof result.analysis.destroy === 'function') {
                  result.analysis.destroy()
                }
              } else {
                console.log('⚠️ 备用可视域分析对象已被销毁，跳过清理')
              }
            } catch (removeError) {
              console.warn('⚠️ 清除备用可视域分析对象时出错:', removeError)
            }
          }

          // 清除观察点标记 - 支持多种存储方式
          if (
            result.observerEntity &&
            this.viewer.entities.contains(result.observerEntity)
          ) {
            this.viewer.entities.remove(result.observerEntity)
          }
          // 清除存储在entities数组中的标记
          if (result.entities && Array.isArray(result.entities)) {
            result.entities.forEach((entity) => {
              if (this.viewer.entities.contains(entity)) {
                this.viewer.entities.remove(entity)
                console.log(
                  '🗑️ 清除可视域分析标记:',
                  entity.label ? entity.label.text._value : '未命名标记',
                )
              }
            })
          }

          // 清除裁剪面
          if (result.clipRegions && Array.isArray(result.clipRegions)) {
            result.clipRegions.forEach((clipRegion) => {
              // 清除裁剪面实体
              if (
                clipRegion.entity &&
                this.viewer.entities.contains(clipRegion.entity)
              ) {
                this.viewer.entities.remove(clipRegion.entity)
                console.log('🗑️ 清除裁剪面实体:', clipRegion.name)
              }

              // 从可视域分析对象中移除裁剪面
              try {
                if (
                  result.officialViewshed &&
                  typeof result.officialViewshed.removeClipRegion === 'function'
                ) {
                  result.officialViewshed.removeClipRegion(clipRegion.name)
                  console.log(
                    '✅ 从官方ViewShed3D对象移除裁剪面:',
                    clipRegion.name,
                  )
                } else if (
                  result.viewshed3D &&
                  typeof result.viewshed3D.removeClipRegion === 'function'
                ) {
                  result.viewshed3D.removeClipRegion(clipRegion.name)
                  console.log(
                    '✅ 从自定义可视域分析对象移除裁剪面:',
                    clipRegion.name,
                  )
                } else if (
                  result.viewshed &&
                  typeof result.viewshed.removeClipRegion === 'function'
                ) {
                  result.viewshed.removeClipRegion(clipRegion.name)
                  console.log(
                    '✅ 从备用可视域分析对象移除裁剪面:',
                    clipRegion.name,
                  )
                }
              } catch (removeError) {
                console.warn('⚠️ 移除裁剪面失败:', removeError.message)
              }
            })
            result.clipRegions = []
          }

          // 清除所有裁剪面（兜底策略）
          try {
            if (
              result.officialViewshed &&
              typeof result.officialViewshed.removeAllClipRegion === 'function'
            ) {
              result.officialViewshed.removeAllClipRegion()
              console.log('✅ 清除官方ViewShed3D对象的所有裁剪面')
            } else if (
              result.viewshed3D &&
              typeof result.viewshed3D.removeAllClipRegion === 'function'
            ) {
              result.viewshed3D.removeAllClipRegion()
              console.log('✅ 清除自定义可视域分析对象的所有裁剪面')
            } else if (
              result.viewshed &&
              typeof result.viewshed.removeAllClipRegion === 'function'
            ) {
              result.viewshed.removeAllClipRegion()
              console.log('✅ 清除备用可视域分析对象的所有裁剪面')
            }
          } catch (clearAllError) {
            console.warn('⚠️ 清除所有裁剪面失败:', clearAllError.message)
          }

          // 调用通用裁剪面清除方法
          this.clearClipPlanes()

          // 强制清除所有可视域相关的实体和图形（增强清除策略）
          try {
            // 清除所有可能的可视域分析对象
            if (this.scene.viewshedAnalysis3Ds) {
              const viewshedCount = this.scene.viewshedAnalysis3Ds.length
              for (let i = viewshedCount - 1; i >= 0; i--) {
                try {
                  const viewshed = this.scene.viewshedAnalysis3Ds.get(i)
                  if (viewshed && typeof viewshed.destroy === 'function') {
                    viewshed.destroy()
                    console.log(`✅ 强制清除可视域分析对象 ${i}`)
                  }
                } catch (destroyError) {
                  console.warn(
                    `强制清除可视域分析对象 ${i} 失败:`,
                    destroyError.message,
                  )
                }
              }
              // 清空集合
              if (
                typeof this.scene.viewshedAnalysis3Ds.removeAll === 'function'
              ) {
                this.scene.viewshedAnalysis3Ds.removeAll()
                console.log('✅ 清空viewshedAnalysis3Ds集合')
              }
            }

            // 清除所有包含'viewshed'关键字的实体
            const entitiesToRemove = []
            this.viewer.entities.values.forEach((entity) => {
              if (
                entity.id &&
                (entity.id.includes('viewshed') ||
                  entity.id.includes('observer'))
              ) {
                entitiesToRemove.push(entity)
              }
            })
            entitiesToRemove.forEach((entity) => {
              this.viewer.entities.remove(entity)
              console.log(`✅ 强制清除可视域相关实体: ${entity.id}`)
            })

            // 清除analysisEntities数组中的实体
            if (this.analysisEntities && Array.isArray(this.analysisEntities)) {
              this.analysisEntities.forEach((entity) => {
                if (this.viewer.entities.contains(entity)) {
                  this.viewer.entities.remove(entity)
                  console.log('✅ 清除分析实体数组中的实体')
                }
              })
              this.analysisEntities = []
            }

            // 清除primitives集合中可能的可视域图形
            if (this.scene.primitives) {
              const primitivesToRemove = []
              for (let i = 0; i < this.scene.primitives.length; i++) {
                const primitive = this.scene.primitives.get(i)
                // 检查是否为可视域相关的图形
                if (
                  primitive &&
                  (primitive._viewshed ||
                    primitive.viewshed ||
                    (primitive.constructor &&
                      primitive.constructor.name &&
                      primitive.constructor.name
                        .toLowerCase()
                        .includes('viewshed')))
                ) {
                  primitivesToRemove.push(primitive)
                }
              }
              primitivesToRemove.forEach((primitive) => {
                try {
                  this.scene.primitives.remove(primitive)
                  if (typeof primitive.destroy === 'function') {
                    primitive.destroy()
                  }
                  console.log('✅ 强制清除primitives中的可视域图形')
                } catch (removeError) {
                  console.warn(
                    '强制清除primitives中的可视域图形失败:',
                    removeError.message,
                  )
                }
              })
            }

            console.log('✅ 可视域分析强制清除完成')
          } catch (forceCleanError) {
            console.warn(
              '⚠️ 可视域分析强制清除过程中出错:',
              forceCleanError.message,
            )
          }

          break

        case 'sightline':
          // 调用新的通视分析清除方法
          this.clearSightlineAnalysis()

          // 支持数组形式的分析结果清除
          const sightlineResults = Array.isArray(result) ? result : [result]

          for (let i = 0; i < sightlineResults.length; i++) {
            const sightlineResult = sightlineResults[i]

            // 清除官方Sightline对象
            if (
              sightlineResult.sightlineObject &&
              sightlineResult.implementation === 'official'
            ) {
              try {
                // 清除目标点
                if (sightlineResult.targetName) {
                  sightlineResult.sightlineObject.removeTargetPoint(
                    sightlineResult.targetName,
                  )
                  console.log(
                    `✅ 清除官方通视分析目标点 ${i + 1}:`,
                    sightlineResult.targetName,
                  )
                }

                // 清除所有目标点（兜底策略）
                if (
                  typeof sightlineResult.sightlineObject
                    .removeAllTargetPoint === 'function'
                ) {
                  sightlineResult.sightlineObject.removeAllTargetPoint()
                  console.log(`✅ 清除所有官方通视分析目标点 ${i + 1}`)
                }

                console.log(`✅ 官方通视分析 ${i + 1} 清理完成`)
              } catch (error) {
                console.warn(`⚠️ 清除官方通视分析对象 ${i + 1} 时出错:`, error)
              }
            }
          }

          // 清除通视分析对象 - 基于元数据的精确清理，支持数组形式
          for (let i = 0; i < sightlineResults.length; i++) {
            const sightlineResult = sightlineResults[i]

            if (sightlineResult.sightline && !sightlineResult.isDestroyed) {
              try {
                // 检查对象是否已经被销毁
                let isDestroyed = false
                try {
                  isDestroyed =
                    sightlineResult.sightline.isDestroyed &&
                    sightlineResult.sightline.isDestroyed()
                } catch (checkError) {
                  console.warn(
                    `检查通视分析对象 ${i + 1} 状态失败:`,
                    checkError.message,
                  )
                  isDestroyed = true // 假设已销毁
                }

                if (!isDestroyed) {
                  // 根据保存的集合信息进行精确清理
                  if (
                    sightlineResult.addedToCollection === 'sightlineAnalysis' &&
                    this.scene.sightlineAnalysis
                  ) {
                    try {
                      this.scene.sightlineAnalysis.remove(
                        sightlineResult.sightline,
                      )
                      console.log(
                        `✅ 从sightlineAnalysis集合中移除通视分析 ${i + 1}`,
                      )
                    } catch (removeError) {
                      console.warn(
                        `从sightlineAnalysis集合移除 ${i + 1} 失败:`,
                        removeError.message,
                      )
                    }
                  } else if (
                    sightlineResult.addedToCollection === 'primitives' &&
                    this.scene.primitives
                  ) {
                    try {
                      this.scene.primitives.remove(sightlineResult.sightline)
                      console.log(`✅ 从primitives集合中移除通视分析 ${i + 1}`)
                    } catch (removeError) {
                      console.warn(
                        `从primitives集合移除 ${i + 1} 失败:`,
                        removeError.message,
                      )
                    }
                  } else {
                    // 兜底策略：尝试所有可能的集合
                    let removed = false
                    if (
                      this.scene.sightlineAnalysis &&
                      typeof this.scene.sightlineAnalysis.remove === 'function'
                    ) {
                      try {
                        this.scene.sightlineAnalysis.remove(
                          sightlineResult.sightline,
                        )
                        removed = true
                        console.log(
                          `✅ 兜底策略：从sightlineAnalysis集合中移除 ${i + 1}`,
                        )
                      } catch (e) {
                        console.warn(
                          `兜底策略：从sightlineAnalysis集合移除 ${i + 1} 失败:`,
                          e.message,
                        )
                      }
                    }
                    if (
                      !removed &&
                      this.scene.primitives &&
                      typeof this.scene.primitives.remove === 'function'
                    ) {
                      try {
                        this.scene.primitives.remove(sightlineResult.sightline)
                        console.log(
                          `✅ 兜底策略：从primitives集合中移除 ${i + 1}`,
                        )
                      } catch (e) {
                        console.warn(
                          `兜底策略：从primitives集合移除 ${i + 1} 失败:`,
                          e.message,
                        )
                      }
                    }
                  }

                  // 销毁分析对象
                  if (typeof sightlineResult.sightline.destroy === 'function') {
                    try {
                      sightlineResult.sightline.destroy()
                      sightlineResult.isDestroyed = true
                      console.log(`✅ 销毁通视分析对象 ${i + 1}`)
                    } catch (destroyError) {
                      console.warn(
                        `销毁通视分析对象 ${i + 1} 失败:`,
                        destroyError.message,
                      )
                      sightlineResult.isDestroyed = true // 标记为已销毁，避免重复尝试
                    }
                  }
                } else {
                  console.log(`⚠️ 通视分析对象 ${i + 1} 已被销毁，跳过清理`)
                  sightlineResult.isDestroyed = true
                }
              } catch (removeError) {
                console.warn(
                  `⚠️ 清除通视分析对象 ${i + 1} 时出错:`,
                  removeError,
                )
                sightlineResult.isDestroyed = true // 标记为已销毁，避免重复尝试
              }
            } else if (sightlineResult.isDestroyed) {
              console.log(`⚠️ 通视分析对象 ${i + 1} 已标记为销毁状态，跳过清理`)
            }
          }

          // 清除备用分析对象 - 支持数组形式
          for (let i = 0; i < sightlineResults.length; i++) {
            const sightlineResult = sightlineResults[i]

            if (sightlineResult.analysis) {
              try {
                // 检查备用分析对象是否已经被销毁
                const isAnalysisDestroyed =
                  sightlineResult.analysis.isDestroyed &&
                  sightlineResult.analysis.isDestroyed()

                if (!isAnalysisDestroyed) {
                  if (
                    this.scene.sightlineAnalysis &&
                    typeof this.scene.sightlineAnalysis.remove === 'function'
                  ) {
                    this.scene.sightlineAnalysis.remove(
                      sightlineResult.analysis,
                    )
                  } else if (
                    this.scene.primitives &&
                    typeof this.scene.primitives.remove === 'function'
                  ) {
                    this.scene.primitives.remove(sightlineResult.analysis)
                  }
                  if (typeof sightlineResult.analysis.destroy === 'function') {
                    sightlineResult.analysis.destroy()
                  }
                  console.log(`✅ 清除备用通视分析对象 ${i + 1}`)
                } else {
                  console.log(`⚠️ 备用通视分析对象 ${i + 1} 已被销毁，跳过清理`)
                }
              } catch (removeError) {
                console.warn(
                  `⚠️ 清除备用通视分析对象 ${i + 1} 时出错:`,
                  removeError,
                )
              }
            }

            // 清除起点和终点标记 - 支持多种存储方式
            if (
              sightlineResult.startMarker &&
              this.viewer.entities.contains(sightlineResult.startMarker)
            ) {
              this.viewer.entities.remove(sightlineResult.startMarker)
              console.log(`✅ 清除通视分析起点标记 ${i + 1}`)
            }
            if (
              sightlineResult.endMarker &&
              this.viewer.entities.contains(sightlineResult.endMarker)
            ) {
              this.viewer.entities.remove(sightlineResult.endMarker)
              console.log(`✅ 清除通视分析终点标记 ${i + 1}`)
            }
            // 清除存储在entities数组中的标记
            if (
              sightlineResult.entities &&
              Array.isArray(sightlineResult.entities)
            ) {
              sightlineResult.entities.forEach((entity) => {
                if (this.viewer.entities.contains(entity)) {
                  this.viewer.entities.remove(entity)
                  console.log(
                    `🗑️ 清除通视分析标记 ${i + 1}:`,
                    entity.label ? entity.label.text._value : '未命名标记',
                  )
                }
              })
            }
          }
          break

        case 'profile':
          // 清除SuperMap3D.Profile对象
          if (result.profile && !result.profile.isCustom) {
            try {
              if (typeof result.profile.destroy === 'function') {
                result.profile.destroy()
                console.log('✅ 清除SuperMap3D.Profile对象')
              } else if (
                this.scene.profileAnalysis &&
                typeof this.scene.profileAnalysis.remove === 'function'
              ) {
                this.scene.profileAnalysis.remove(result.profile)
                console.log('✅ 从profileAnalysis集合中移除')
              }
            } catch (error) {
              console.warn('⚠️ 清除SuperMap3D.Profile对象失败:', error)
            }
          }

          // 清除剖面分析的实体
          if (result.entities) {
            result.entities.forEach((entity) => {
              if (this.viewer.entities.contains(entity)) {
                this.viewer.entities.remove(entity)
              }
            })
          }

          // 隐藏剖面图表
          this.hideProfileChart()
          break

        case 'crossSection':
          if (result.analysis && this.scene.crossSectionAnalysis) {
            this.scene.crossSectionAnalysis.remove(result.analysis)
          }
          break

        case 'excavation':
          // 清除开挖分析实体
          if (result.entity && this.viewer.entities.contains(result.entity)) {
            this.viewer.entities.remove(result.entity)
          }
          break

        case 'measurement':
          // 清除量测实体
          if (result.entities) {
            result.entities.forEach((entity) => {
              if (this.viewer.entities.contains(entity)) {
                this.viewer.entities.remove(entity)
              }
            })
          }
          break

        case 'skyline':
          // 清除天际线分析
          this.clearSkylineAnalysis()
          break

        default:
          console.warn(`未知的分析类型: ${analysisType}`)
          break
      }

      // 从分析结果映射中删除
      this.analysisResults.delete(analysisType)

      // 如果当前活动分析是被清除的类型，则重置
      if (this.activeAnalysis === analysisType) {
        this.activeAnalysis = null
      }

      console.log(`${analysisType} 分析结果已清除`)
      return true
    } catch (error) {
      console.error(`清除 ${analysisType} 分析结果失败:`, error)
      return false
    }
  }

  /**
   * 判断实体是否为分析相关实体
   * @param {Object} entity - 要检查的实体
   * @returns {boolean} - 是否为分析相关实体
   */
  isAnalysisRelatedEntity(entity) {
    if (!entity) return false

    // 检查实体标签文本
    if (entity.label && entity.label.text && entity.label.text._value) {
      const labelText = entity.label.text._value
      if (
        labelText.includes('观察点') ||
        labelText.includes('起点') ||
        labelText.includes('终点') ||
        labelText.includes('测量点') ||
        labelText.includes('分析点') ||
        labelText === '观察点' ||
        labelText === '起点' ||
        labelText === '终点' ||
        labelText.includes('点') || // 增加对包含"点"字的标签的识别
        labelText.includes('标记') || // 增加对标记的识别
        labelText.includes('marker') || // 英文标记
        labelText.includes('point')
      ) {
        // 英文点
        return true
      }
    }

    // 检查实体名称
    if (
      entity.name &&
      (entity.name.includes('分析') ||
        entity.name.includes('测量') ||
        entity.name.includes('观察') ||
        entity.name.includes('通视') ||
        entity.name.includes('可视域') ||
        entity.name === 'viewshed' ||
        entity.name === 'sightline' ||
        entity.name === 'measurement' ||
        entity.name === 'profile' ||
        entity.name.includes('剖面') ||
        entity.name.includes('marker') || // 英文标记
        entity.name.includes('point') || // 英文点
        entity.name.includes('标记')) // 中文标记
    ) {
      return true
    }

    // 检查实体ID（如果有特定的分析实体ID模式）
    if (
      entity.id &&
      (entity.id.includes('analysis_') ||
        entity.id.includes('measurement_') ||
        entity.id.includes('viewshed_') ||
        entity.id.includes('sightline_') ||
        entity.id.includes('profile_') ||
        entity.id.includes('marker_') || // 标记ID
        entity.id.includes('point_')) // 点ID
    ) {
      return true
    }

    // 检查实体属性（如果有自定义的分析标记属性）
    if (
      entity.properties &&
      (entity.properties.isAnalysisEntity ||
        entity.properties.analysisType ||
        entity.properties.isMeasurement ||
        entity.properties.isMarker || // 标记属性
        entity.properties.isAnalysisPoint) // 分析点属性
    ) {
      return true
    }

    // 检查实体几何类型 - 识别点类型的实体
    if (entity.point || entity.billboard) {
      // 如果实体有点或广告牌几何，且没有明确的模型标识，可能是分析点
      // 但需要排除明确的模型标记
      if (
        !entity.model &&
        !entity.properties?.isModel &&
        !entity.name?.includes('模型')
      ) {
        // 进一步检查是否为用户添加的分析点
        // 检查创建时间或其他标识
        if (
          entity.properties?.createdBy === 'analysis' ||
          entity.properties?.type === 'analysisPoint' ||
          !entity.properties?.isSystemEntity
        ) {
          // 非系统实体
          return true
        }

        // 如果点的颜色是特定的分析颜色（如红色、黄色等分析常用颜色）
        if (entity.point && entity.point.color) {
          const color = entity.point.color._value || entity.point.color
          if (color && (color.red > 0.8 || color.yellow > 0.8)) {
            // 红色或黄色点通常是分析点
            return true
          }
        }
      }
    }

    // 检查实体是否在分析相关的集合中
    if (entity.entityCollection && entity.entityCollection.id) {
      const collectionId = entity.entityCollection.id
      if (
        collectionId.includes('analysis') ||
        collectionId.includes('measurement') ||
        collectionId.includes('viewshed') ||
        collectionId.includes('sightline')
      ) {
        return true
      }
    }

    return false
  }

  /**
   * 清除分析相关的图元（保留模型图元）
   */
  clearAnalysisRelatedPrimitives() {
    try {
      if (!this.scene || !this.scene.primitives) return

      const primitivesToRemove = []

      // 遍历所有图元，找出分析相关的图元
      for (let i = 0; i < this.scene.primitives.length; i++) {
        const primitive = this.scene.primitives.get(i)
        if (!primitive) continue

        // 检查图元是否为分析相关（通过名称、ID或其他标识）
        if (this.isAnalysisRelatedPrimitive(primitive)) {
          primitivesToRemove.push(primitive)
        }
      }

      // 移除分析相关的图元
      primitivesToRemove.forEach((primitive) => {
        try {
          this.scene.primitives.remove(primitive)
          console.log('🗑️ 清除分析图元')
        } catch (error) {
          console.warn('⚠️ 移除图元失败:', error)
        }
      })
    } catch (error) {
      console.warn('⚠️ 清除分析图元失败:', error)
    }
  }

  /**
   * 判断图元是否为分析相关图元
   * @param {Object} primitive - 要检查的图元
   * @returns {boolean} - 是否为分析相关图元
   */
  isAnalysisRelatedPrimitive(primitive) {
    if (!primitive) return false

    // 检查图元ID或名称（确保ID是字符串类型）
    if (
      primitive.id &&
      typeof primitive.id === 'string' &&
      (primitive.id.includes('analysis') ||
        primitive.id.includes('measurement') ||
        primitive.id.includes('viewshed') ||
        primitive.id.includes('sightline') ||
        primitive.id.includes('profile') ||
        primitive.id.includes('skyline'))
    ) {
      return true
    }

    // 检查图元类型（避免清除模型相关的图元）
    if (primitive.constructor && primitive.constructor.name) {
      const typeName = primitive.constructor.name
      // 保留模型相关的图元类型
      if (
        typeName.includes('Model') ||
        typeName.includes('Tileset') ||
        typeName.includes('Primitive3DTileSet') ||
        typeName.includes('Cesium3DTileset')
      ) {
        return false // 不清除模型图元
      }
    }

    // 检查是否为分析相关的几何图元
    if (primitive._geometryInstances || primitive.geometryInstances) {
      return true // 通常分析生成的几何图元
    }

    return false
  }

  /**
   * 清除分析集合中的对象
   */
  clearAnalysisCollections() {
    try {
      // 清除可视域分析集合
      if (this.scene && this.scene.viewshedAnalysis3Ds) {
        this.scene.viewshedAnalysis3Ds.removeAll()
        console.log('🗑️ 清除可视域分析集合')
      }

      // 清除通视分析集合
      if (this.scene && this.scene.sightlineAnalysis) {
        this.scene.sightlineAnalysis.removeAll()
        console.log('🗑️ 清除通视分析集合')
      }

      // 清除其他分析集合（如果有）
      if (this.scene && this.scene.profileAnalysis) {
        this.scene.profileAnalysis.removeAll()
        console.log('🗑️ 清除剖面分析集合')
      }
    } catch (error) {
      console.warn('⚠️ 清除分析集合失败:', error)
    }
  }

  /**
   * 清除所有分析点标记（增强版点清除策略）
   */
  clearAllAnalysisPoints() {
    try {
      console.log('🧹 开始清除所有分析点标记...')

      if (!this.viewer || !this.viewer.entities) {
        console.warn('⚠️ viewer或entities未初始化')
        return
      }

      const pointsToRemove = []
      const entities = this.viewer.entities.values

      entities.forEach((entity) => {
        if (!entity) return

        let shouldRemove = false

        // 策略1: 检查点类型实体（point或billboard）
        if (entity.point || entity.billboard) {
          // 排除明确的模型实体
          if (
            !entity.model &&
            !entity.properties?.isModel &&
            !entity.name?.includes('模型') &&
            !entity.name?.includes('建筑') &&
            !entity.id?.includes('model_')
          ) {
            // 如果没有明确的系统标识，认为是用户添加的分析点
            if (
              !entity.properties?.isSystemEntity &&
              !entity.properties?.isPermanent
            ) {
              shouldRemove = true
            }

            // 检查点的位置是否在模型表面（分析点通常在模型表面）
            if (entity.position && entity.position._value) {
              // 这里可以添加更复杂的位置检查逻辑
              shouldRemove = true
            }
          }
        }

        // 策略2: 检查实体的创建时间（如果是最近创建的，可能是分析点）
        if (entity.properties?.createdAt) {
          const createdTime = new Date(entity.properties.createdAt)
          const now = new Date()
          const timeDiff = now - createdTime
          // 如果是最近24小时内创建的点实体，可能是分析点
          if (
            timeDiff < 24 * 60 * 60 * 1000 &&
            (entity.point || entity.billboard)
          ) {
            shouldRemove = true
          }
        }

        // 策略3: 检查实体的颜色特征（分析点通常使用特定颜色）
        if (entity.point && entity.point.color) {
          const color = entity.point.color._value || entity.point.color
          if (color) {
            // 红色、黄色、绿色、蓝色等常用分析颜色
            if (
              (color.red > 0.7 && color.green < 0.3 && color.blue < 0.3) || // 红色
              (color.red > 0.7 && color.green > 0.7 && color.blue < 0.3) || // 黄色
              (color.red < 0.3 && color.green > 0.7 && color.blue < 0.3) || // 绿色
              (color.red < 0.3 && color.green < 0.3 && color.blue > 0.7)
            ) {
              // 蓝色
              shouldRemove = true
            }
          }
        }

        // 策略4: 检查实体大小（分析点通常有特定的大小范围）
        if (entity.point && entity.point.pixelSize) {
          const size = entity.point.pixelSize._value || entity.point.pixelSize
          // 分析点通常大小在5-20像素之间
          if (size >= 5 && size <= 20) {
            shouldRemove = true
          }
        }

        if (shouldRemove) {
          pointsToRemove.push(entity)
        }
      })

      // 移除找到的分析点
      let removedCount = 0
      pointsToRemove.forEach((entity) => {
        try {
          if (this.viewer.entities.contains(entity)) {
            this.viewer.entities.remove(entity)
            removedCount++
            console.log(
              '🗑️ 清除分析点:',
              entity.label?.text?._value || entity.name || '未命名点',
            )
          }
        } catch (error) {
          console.warn('⚠️ 移除分析点失败:', error)
        }
      })

      console.log(`✅ 分析点清除完成，共清除 ${removedCount} 个点`)
    } catch (error) {
      console.error('❌ 清除分析点失败:', error)
    }
  }

  /**
   * 清除所有分析结果（智能清除，保留模型）
   */
  clearAllAnalysis() {
    try {
      console.log('🧹 开始智能清除所有分析结果（保留模型）...')

      // 清除所有分析结果 - 增加空值检查和Map类型检查
      if (this.analysisResults) {
        if (
          this.analysisResults instanceof Map &&
          typeof this.analysisResults.forEach === 'function'
        ) {
          // 使用Array.from转换Map为数组，避免在迭代过程中修改Map
          const analysisTypes = Array.from(this.analysisResults.keys())
          analysisTypes.forEach((type) => {
            this.clearAnalysisResults(type)
          })
        } else if (Array.isArray(this.analysisResults)) {
          // 如果是数组类型
          this.analysisResults.forEach((result, index) => {
            if (result && result.type) {
              this.clearAnalysisResults(result.type)
            }
          })
          this.analysisResults = []
        } else {
          console.warn(
            '⚠️ analysisResults类型不正确:',
            typeof this.analysisResults,
          )
          // 重新初始化为Map
          this.analysisResults = new Map()
        }
      } else {
        console.warn('⚠️ analysisResults未初始化，重新创建')
        this.analysisResults = new Map()
      }

      // 清除量测实体 - 增加空值检查
      if (this.measurementEntities && Array.isArray(this.measurementEntities)) {
        this.measurementEntities.forEach((entity) => {
          if (
            entity &&
            this.viewer &&
            this.viewer.entities &&
            this.viewer.entities.contains(entity)
          ) {
            this.viewer.entities.remove(entity)
            console.log('🗑️ 清除测量实体')
          }
        })
        this.measurementEntities = []
      }

      // 清除分析实体 - 增加空值检查
      if (this.analysisEntities && Array.isArray(this.analysisEntities)) {
        this.analysisEntities.forEach((entity) => {
          if (
            entity &&
            this.viewer &&
            this.viewer.entities &&
            this.viewer.entities.contains(entity)
          ) {
            this.viewer.entities.remove(entity)
            console.log('🗑️ 清除分析实体')
          }
        })
        this.analysisEntities = []
      }

      // 智能清除：只清除分析相关的实体，保留模型和其他重要元素
      const entitiesToRemove = []
      if (
        this.viewer &&
        this.viewer.entities &&
        this.viewer.entities.values &&
        Array.isArray(this.viewer.entities.values)
      ) {
        this.viewer.entities.values.forEach((entity) => {
          if (!entity) return // 跳过空实体

          // 检查是否为分析相关实体
          if (this.isAnalysisRelatedEntity(entity)) {
            entitiesToRemove.push(entity)
          }
        })
      }

      // 额外的点标记清除策略 - 针对可能遗漏的点
      this.clearAllAnalysisPoints()

      // 智能清除图元：只清除分析相关的图元，保留模型
      this.clearAnalysisRelatedPrimitives()

      // 清除分析集合中的对象
      this.clearAnalysisCollections()

      // 移除找到的分析相关实体
      if (entitiesToRemove && Array.isArray(entitiesToRemove)) {
        entitiesToRemove.forEach((entity) => {
          if (entity && this.viewer && this.viewer.entities) {
            try {
              this.viewer.entities.remove(entity)
              console.log(
                '🗑️ 清除分析实体:',
                entity.label
                  ? entity.label.text._value
                  : entity.name || '未命名',
              )
            } catch (removeError) {
              console.warn('⚠️ 移除实体失败:', removeError)
            }
          }
        })
      }

      // 隐藏剖面图表
      this.hideProfileChart()

      this.activeAnalysis = null
      console.log(
        '✅ 智能清除完成，共清除',
        entitiesToRemove.length,
        '个分析实体，模型已保留',
      )
    } catch (error) {
      console.error('❌ 智能清除分析结果失败:', error)
    }
  }

  /**
   * 获取分析结果
   * @param {string} analysisType 分析类型
   * @returns {*} 分析结果
   */
  getAnalysisResult(analysisType) {
    return this.analysisResults.get(analysisType)
  }

  /**
   * 导出分析结果
   * @param {string} analysisType 分析类型
   * @param {Object} options 导出选项
   * @param {string} options.format 导出格式 ('json'|'csv'|'geojson')
   * @param {boolean} options.includeMetadata 是否包含元数据
   * @param {boolean} options.downloadFile 是否下载文件
   * @returns {Object|string} 导出数据
   */
  exportAnalysisResult(analysisType, options = {}) {
    try {
      // 参数验证
      if (!analysisType || typeof analysisType !== 'string') {
        throw new Error('分析类型参数无效')
      }

      const result = this.analysisResults.get(analysisType)
      if (!result) {
        console.warn(`未找到${analysisType}分析结果`)
        return null
      }

      const {
        format = 'json',
        includeMetadata = true,
        downloadFile = false,
      } = options

      // 构建基础导出数据
      const baseData = {
        type: analysisType,
        timestamp: new Date().toISOString(),
        data: result,
      }

      // 添加元数据
      if (includeMetadata) {
        baseData.metadata = {
          version: '1.0.0',
          generator: 'DigitalTwinAnalysis',
          coordinate_system: 'WGS84',
          units: this.getAnalysisUnits(analysisType),
        }
      }

      let exportData
      let filename
      let mimeType

      // 根据格式处理数据
      switch (format.toLowerCase()) {
        case 'json':
          exportData = JSON.stringify(baseData, null, 2)
          filename = `${analysisType}_${Date.now()}.json`
          mimeType = 'application/json'
          break

        case 'csv':
          exportData = this.convertToCSV(baseData)
          filename = `${analysisType}_${Date.now()}.csv`
          mimeType = 'text/csv'
          break

        case 'geojson':
          exportData = this.convertToGeoJSON(baseData)
          filename = `${analysisType}_${Date.now()}.geojson`
          mimeType = 'application/geo+json'
          break

        default:
          throw new Error(`不支持的导出格式: ${format}`)
      }

      // 下载文件
      if (downloadFile) {
        this.downloadFile(exportData, filename, mimeType)
      }

      console.log(`${analysisType}分析结果已导出为${format.toUpperCase()}格式`)
      return format === 'json' ? baseData : exportData
    } catch (error) {
      console.error('导出分析结果失败:', error)
      throw error
    }
  }

  /**
   * 获取分析类型对应的单位
   * @param {string} analysisType 分析类型
   * @returns {Object} 单位信息
   */
  getAnalysisUnits(analysisType) {
    const units = {
      viewshed: { distance: 'meters', angle: 'degrees' },
      sightline: { distance: 'meters' },
      profile: { distance: 'meters', elevation: 'meters' },
      crossSection: { distance: 'meters', elevation: 'meters' },
      excavation: {
        area: 'square_meters',
        volume: 'cubic_meters',
        depth: 'meters',
      },

      distance: { length: 'meters' },
      area: { area: 'square_meters', perimeter: 'meters' },
    }
    return units[analysisType] || {}
  }

  /**
   * 转换为CSV格式
   * @param {Object} data 数据对象
   * @returns {string} CSV字符串
   */
  convertToCSV(data) {
    try {
      const analysisData = data.data
      let csvContent = ''

      // 添加头部信息
      csvContent += `Analysis Type,${data.type}\n`
      csvContent += `Timestamp,${data.timestamp}\n`
      csvContent += '\n'

      // 根据分析类型处理数据
      switch (data.type) {
        case 'distance':
          csvContent += 'Point Index,Longitude,Latitude,Height\n'
          if (analysisData.positions) {
            analysisData.positions.forEach((pos, index) => {
              const cartographic = Cesium.Cartographic.fromCartesian(pos)
              csvContent += `${index + 1},${Cesium.Math.toDegrees(cartographic.longitude)},${Cesium.Math.toDegrees(cartographic.latitude)},${cartographic.height}\n`
            })
          }
          csvContent += `\nTotal Distance,${analysisData.distance || 0} meters\n`
          break

        case 'area':
          csvContent += 'Point Index,Longitude,Latitude,Height\n'
          if (analysisData.positions) {
            analysisData.positions.forEach((pos, index) => {
              const cartographic = Cesium.Cartographic.fromCartesian(pos)
              csvContent += `${index + 1},${Cesium.Math.toDegrees(cartographic.longitude)},${Cesium.Math.toDegrees(cartographic.latitude)},${cartographic.height}\n`
            })
          }
          csvContent += `\nArea,${analysisData.area || 0} square meters\n`
          csvContent += `Perimeter,${analysisData.perimeter || 0} meters\n`
          break

        case 'profile':
          csvContent += 'Distance,Elevation\n'
          if (analysisData.elevationProfile) {
            analysisData.elevationProfile.forEach((point) => {
              csvContent += `${point.distance},${point.elevation}\n`
            })
          }
          break

        case 'excavation':
          csvContent += 'Property,Value,Unit\n'
          csvContent += `Area,${analysisData.area || 0},square meters\n`
          csvContent += `Volume,${analysisData.volume || 0},cubic meters\n`
          csvContent += `Depth,${analysisData.depth || 0},meters\n`
          break

        default:
          csvContent += 'Data\n'
          csvContent += JSON.stringify(analysisData)
          break
      }

      return csvContent
    } catch (error) {
      console.error('转换CSV失败:', error)
      return ''
    }
  }

  /**
   * 转换为GeoJSON格式
   * @param {Object} data 数据对象
   * @returns {string} GeoJSON字符串
   */
  convertToGeoJSON(data) {
    try {
      const analysisData = data.data
      const geojson = {
        type: 'FeatureCollection',
        metadata: {
          analysisType: data.type,
          timestamp: data.timestamp,
          generator: 'DigitalTwinAnalysis',
        },
        features: [],
      }

      // 根据分析类型创建要素
      switch (data.type) {
        case 'distance':
        case 'profile':
          if (analysisData.positions && analysisData.positions.length > 1) {
            const coordinates = analysisData.positions.map((pos) => {
              const cartographic = Cesium.Cartographic.fromCartesian(pos)
              return [
                Cesium.Math.toDegrees(cartographic.longitude),
                Cesium.Math.toDegrees(cartographic.latitude),
                cartographic.height,
              ]
            })

            geojson.features.push({
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: coordinates,
              },
              properties: {
                analysisType: data.type,
                distance: analysisData.distance || 0,
                ...(analysisData.elevationProfile && {
                  elevationProfile: analysisData.elevationProfile,
                }),
              },
            })
          }
          break

        case 'area':
        case 'excavation':
        case 'flood':
          if (analysisData.positions && analysisData.positions.length > 2) {
            const coordinates = analysisData.positions.map((pos) => {
              const cartographic = Cesium.Cartographic.fromCartesian(pos)
              return [
                Cesium.Math.toDegrees(cartographic.longitude),
                Cesium.Math.toDegrees(cartographic.latitude),
                cartographic.height,
              ]
            })
            // 闭合多边形
            coordinates.push(coordinates[0])

            geojson.features.push({
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [coordinates],
              },
              properties: {
                analysisType: data.type,
                area: analysisData.area || 0,
                ...(analysisData.volume && { volume: analysisData.volume }),
                ...(analysisData.depth && { depth: analysisData.depth }),
                ...(analysisData.waterLevel && {
                  waterLevel: analysisData.waterLevel,
                }),
              },
            })
          }
          break

        case 'viewshed':
        case 'sightline':
          if (analysisData.viewPoint || analysisData.startPoint) {
            const point = analysisData.viewPoint || analysisData.startPoint
            const cartographic = Cesium.Cartographic.fromCartesian(point)

            geojson.features.push({
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [
                  Cesium.Math.toDegrees(cartographic.longitude),
                  Cesium.Math.toDegrees(cartographic.latitude),
                  cartographic.height,
                ],
              },
              properties: {
                analysisType: data.type,
                ...analysisData,
              },
            })
          }
          break
      }

      return JSON.stringify(geojson, null, 2)
    } catch (error) {
      console.error('转换GeoJSON失败:', error)
      return JSON.stringify({ type: 'FeatureCollection', features: [] })
    }
  }

  /**
   * 下载文件
   * @param {string} content 文件内容
   * @param {string} filename 文件名
   * @param {string} mimeType MIME类型
   */
  downloadFile(content, filename, mimeType) {
    try {
      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.style.display = 'none'

      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      URL.revokeObjectURL(url)
      console.log(`文件已下载: ${filename}`)
    } catch (error) {
      console.error('下载文件失败:', error)
    }
  }

  /**
   * 初始化交互式分析管理器
   */
  initInteractiveManager() {
    try {
      if (typeof InteractiveAnalysisManager !== 'undefined') {
        this.interactiveManager = new InteractiveAnalysisManager(
          this.viewer,
          this.scene,
          this,
        )

        // 将interactiveManager设置到全局对象上，供其他模块访问
        if (window.realityTwin3DAnalysisTool) {
          window.realityTwin3DAnalysisTool.interactiveAnalysisManager =
            this.interactiveManager
          console.log('✅ 交互式分析管理器已设置到全局对象')
        } else {
          console.warn(
            '⚠️ window.realityTwin3DAnalysisTool 未找到，无法设置交互式分析管理器',
          )
        }

        // console.log('✅ 交互式分析管理器初始化成功');
      } else {
        console.warn('⚠️ InteractiveAnalysisManager 类未找到')
      }
    } catch (error) {
      console.error('❌ 交互式分析管理器初始化失败:', error)
    }
  }

  /**
   * 开始交互式可视域分析
   */
  startInteractiveViewshedAnalysis() {
    if (this.interactiveManager) {
      this.interactiveManager.startInteraction('viewshed')
    } else {
      console.warn('交互式分析管理器未初始化')
    }
  }

  /**
   * 开始交互式通视分析
   */
  startInteractiveSightlineAnalysis() {
    if (this.interactiveManager) {
      this.interactiveManager.startInteraction('sightline')
    } else {
      console.warn('交互式分析管理器未初始化')
    }
  }

  /**
   * 开始添加通视分析观察点
   */
  startAddViewPoint() {
    console.log('🎯 开始添加观察点模式')
    if (this.interactiveManager) {
      this.interactiveManager.startInteraction('sightline-viewpoint')
    } else {
      console.warn('交互式分析管理器未初始化')
    }
  }

  /**
   * 开始添加通视分析目标点
   */
  startAddTargetPoint() {
    console.log('🎯 开始添加目标点模式')
    if (this.interactiveManager) {
      this.interactiveManager.startInteraction('sightline-targetpoint')
    } else {
      console.warn('交互式分析管理器未初始化')
    }
  }

  /**
   * 设置通视分析观察点
   */
  setSightlineViewPoint(position) {
    try {
      console.log('🎯 设置通视分析观察点:', position)

      // 清除之前的观察点标记
      if (this.sightlineViewPointEntity) {
        this.viewer.entities.remove(this.sightlineViewPointEntity)
        this.sightlineViewPointEntity = null
      }

      // 保存观察点位置
      this.sightlineViewPoint = position

      // 创建观察点标记
      this.sightlineViewPointEntity = this.viewer.entities.add({
        position: position,
        point: {
          pixelSize: 10,
          color: SuperMap3D.Color.CYAN,
          outlineColor: SuperMap3D.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: '观察点',
          font: '16px Microsoft YaHei',
          fillColor: SuperMap3D.Color.WHITE,
          outlineColor: SuperMap3D.Color.BLACK,
          outlineWidth: 2,
          style: SuperMap3D.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: SuperMap3D.VerticalOrigin.BOTTOM,
          pixelOffset: new SuperMap3D.Cartesian2(0, -10),
        },
        id: 'sightline_viewpoint_' + Date.now(),
      })

      console.log('✅ 观察点位置已保存并创建标记:', {
        position: position,
        positionType: typeof position,
        hasX: position && position.x !== undefined,
        hasY: position && position.y !== undefined,
        hasZ: position && position.z !== undefined,
        entityCreated: !!this.sightlineViewPointEntity,
      })
      return true
    } catch (error) {
      console.error('❌ 设置通视分析观察点失败:', error)
      return false
    }
  }

  /**
   * 添加通视分析目标点
   */
  addSightlineTargetPoint(position) {
    try {
      console.log('🎯 添加通视分析目标点:', position)

      // 生成目标点名称
      this.sightlinePointCounter++
      const pointName = `target_point_${this.sightlinePointCounter}`

      // 创建目标点标记
      const targetEntity = this.viewer.entities.add({
        position: position,
        point: {
          pixelSize: 8,
          color: SuperMap3D.Color.RED,
          outlineColor: SuperMap3D.Color.WHITE,
          outlineWidth: 2,
        },
        label: {
          text: `目标点${this.sightlinePointCounter}`,
          font: '14px Microsoft YaHei',
          fillColor: SuperMap3D.Color.WHITE,
          outlineColor: SuperMap3D.Color.BLACK,
          outlineWidth: 2,
          style: SuperMap3D.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: SuperMap3D.VerticalOrigin.BOTTOM,
          pixelOffset: new SuperMap3D.Cartesian2(0, -8),
        },
        id: pointName,
      })

      // 保存目标点信息
      const targetPointInfo = {
        name: pointName,
        position: position,
        entity: targetEntity,
      }

      console.log('🎯 保存目标点信息:', {
        name: pointName,
        position: position,
        positionType: typeof position,
        hasX: position && position.x !== undefined,
        hasY: position && position.y !== undefined,
        hasZ: position && position.z !== undefined,
        entityCreated: !!targetEntity,
      })

      this.sightlineTargetPoints.push(targetPointInfo)

      // 保存目标点实体引用，用于后续管理
      if (!this.sightlineTargetPointEntities) {
        this.sightlineTargetPointEntities = []
      }
      this.sightlineTargetPointEntities.push(targetEntity)

      console.log('✅ 目标点位置已保存并创建标记，等待多点通视分析创建通视线')
      return true
    } catch (error) {
      console.error('❌ 添加通视分析目标点失败:', error)
      return false
    }
  }

  /**
   * 清除通视分析结果
   */
  clearSightlineAnalysis() {
    try {
      console.log('🧹 开始清除通视分析结果...')

      // 清除SuperMap3D原生通视分析对象 - 统一处理this.sightline和this.sightlineAnalysis
      const sightlineObjects = [this.sightline, this.sightlineAnalysis].filter(
        (obj) => obj,
      )

      sightlineObjects.forEach((sightlineObj, index) => {
        try {
          console.log(`🔧 处理通视分析对象 ${index + 1}...`)

          // 清除所有目标点
          if (typeof sightlineObj.removeAllTargetPoint === 'function') {
            sightlineObj.removeAllTargetPoint()
            console.log('✅ 清除原生通视分析目标点')
          }

          // 清除观察点
          if (sightlineObj.viewPosition) {
            sightlineObj.viewPosition = null
            console.log('✅ 清除原生通视分析观察点')
          }

          // 尝试销毁对象
          if (typeof sightlineObj.destroy === 'function') {
            sightlineObj.destroy()
            console.log('✅ 销毁原生通视分析对象')
          }
        } catch (nativeError) {
          console.warn(
            `⚠️ 清除原生通视分析对象 ${index + 1} 时出错:`,
            nativeError,
          )
        }
      })

      // 强制重置所有通视分析对象引用，确保下次分析重新创建
      this.sightline = null
      this.sightlineAnalysis = null

      // 清除观察点标记
      if (this.sightlineViewPointEntity) {
        try {
          this.viewer.entities.remove(this.sightlineViewPointEntity)
          this.sightlineViewPointEntity = null
          console.log('✅ 观察点标记已清除')
        } catch (error) {
          console.error('清除观察点标记时出错:', error)
        }
      }

      // 清除目标点标记
      if (
        this.sightlineTargetPointEntities &&
        this.sightlineTargetPointEntities.length > 0
      ) {
        this.sightlineTargetPointEntities.forEach((entity, index) => {
          try {
            this.viewer.entities.remove(entity)
            console.log(`✅ 目标点标记 ${index} 已清除`)
          } catch (error) {
            console.error(`清除目标点标记 ${index} 时出错:`, error)
          }
        })
        this.sightlineTargetPointEntities = []
      }

      // 清除自定义通视分析实体（线条、点标记等）
      const entitiesToRemove = []
      this.viewer.entities.values.forEach((entity) => {
        let shouldRemove = false

        // 检查是否是通视分析相关的实体
        // 1. 检查ID是否包含通视分析标识
        if (
          entity.id &&
          (entity.id.includes('sightline') ||
            entity.id.includes('通视') ||
            entity.id.includes('custom-sightline'))
        ) {
          shouldRemove = true
        }

        // 2. 检查标签文本
        if (entity.label && entity.label.text && entity.label.text._value) {
          const labelText = entity.label.text._value
          if (
            labelText.includes('观察点') ||
            labelText.includes('目标点') ||
            labelText.includes('起点') ||
            labelText.includes('终点') ||
            labelText.includes('距离:')
          ) {
            shouldRemove = true
          }
        }

        // 3. 检查是否是通视线条（polyline且没有其他明确标识的实体）
        if (entity.polyline && !entity.label) {
          // 进一步检查是否可能是通视线条
          if (
            entity.polyline.positions &&
            entity.polyline.positions._value &&
            entity.polyline.positions._value.length === 2
          ) {
            shouldRemove = true
          }
        }

        if (shouldRemove) {
          entitiesToRemove.push(entity)
        }
      })

      // 移除找到的实体
      entitiesToRemove.forEach((entity) => {
        try {
          this.viewer.entities.remove(entity)
          console.log(
            '🗑️ 清除通视分析实体:',
            entity.label ? entity.label.text._value : entity.id || '通视线条',
          )
        } catch (removeError) {
          console.warn('清除实体时出错:', removeError)
        }
      })

      // 重置变量
      this.sightlineViewPoint = null
      this.sightlineTargetPoints = []
      this.sightlinePointCounter = 0
      this.sightlineViewPointEntity = null
      this.sightlineTargetPointEntities = []

      // 重置原生通视分析对象引用
      this.sightline = null
      this.sightlineAnalysis = null

      // 清除分析结果存储
      if (this.analysisResults && this.analysisResults.has('sightline')) {
        this.analysisResults.delete('sightline')
        console.log('✅ 清除通视分析结果存储')
      }

      console.log('✅ 通视分析结果清除完成')
      return true
    } catch (error) {
      console.error('❌ 清除通视分析结果失败:', error)
      return false
    }
  }

  /**
   * 笛卡尔坐标转换为经纬度
   */
  cartesianToDegrees(position) {
    const cartographic = SuperMap3D.Cartographic.fromCartesian(position)
    const longitude = SuperMap3D.Math.toDegrees(cartographic.longitude)
    const latitude = SuperMap3D.Math.toDegrees(cartographic.latitude)
    const height = cartographic.height

    return [longitude, latitude, height]
  }

  /**
   * 验证Cartesian3坐标是否有效
   * @param {SuperMap3D.Cartesian3} cartesian3 - 要验证的坐标
   * @returns {boolean} 是否有效
   */
  isValidCartesian3(cartesian3) {
    if (!cartesian3 || !SuperMap3D.defined(cartesian3)) {
      return false
    }

    return (
      isFinite(cartesian3.x) &&
      isFinite(cartesian3.y) &&
      isFinite(cartesian3.z) &&
      !isNaN(cartesian3.x) &&
      !isNaN(cartesian3.y) &&
      !isNaN(cartesian3.z)
    )
  }

  /**
   * 验证Cartographic坐标是否有效
   * @param {SuperMap3D.Cartographic} cartographic - 要验证的坐标
   * @returns {boolean} 是否有效
   */
  isValidCartographic(cartographic) {
    if (!cartographic || !SuperMap3D.defined(cartographic)) {
      return false
    }

    return (
      isFinite(cartographic.longitude) &&
      isFinite(cartographic.latitude) &&
      isFinite(cartographic.height) &&
      !isNaN(cartographic.longitude) &&
      !isNaN(cartographic.latitude) &&
      !isNaN(cartographic.height)
    )
  }

  /**
   * 验证经纬度高度数组是否有效
   * @param {Array} lonLatHeight - [经度, 纬度, 高度]数组
   * @returns {boolean} 是否有效
   */
  isValidLonLatHeight(lonLatHeight) {
    if (!Array.isArray(lonLatHeight) || lonLatHeight.length !== 3) {
      return false
    }

    const [lon, lat, height] = lonLatHeight
    return (
      isFinite(lon) &&
      isFinite(lat) &&
      isFinite(height) &&
      !isNaN(lon) &&
      !isNaN(lat) &&
      !isNaN(height) &&
      lon >= -180 &&
      lon <= 180 &&
      lat >= -90 &&
      lat <= 90
    )
  }

  /**
   * 开始交互式剖面分析
   */
  startInteractiveProfileAnalysis() {
    if (this.interactiveManager) {
      this.interactiveManager.startInteraction('profile')
    } else {
      console.warn('交互式分析管理器未初始化')
    }
  }

  /**
   * 开始交互式开挖分析
   */

  /**
   * 开始交互式距离测量
   */
  startInteractiveDistanceMeasurement() {
    if (this.interactiveManager) {
      this.interactiveManager.startInteraction('measurement-distance')
    } else {
      console.warn('交互式分析管理器未初始化')
    }
  }

  /**
   * 开始交互式面积测量
   */
  startInteractiveAreaMeasurement() {
    if (this.interactiveManager) {
      this.interactiveManager.startInteraction('measurement-area')
    } else {
      console.warn('交互式分析管理器未初始化')
    }
  }

  /**
   * 停止当前交互
   */
  stopInteraction() {
    if (this.interactiveManager) {
      this.interactiveManager.stopInteraction()
    }
  }

  /**
   * 更新可视域分析属性
   * @param {string} property 属性名称
   * @param {*} value 属性值
   */
  updateViewshedProperty(property, value) {
    try {
      const viewshedResult = this.analysisResults.get('viewshed')
      if (!viewshedResult) {
        console.warn('没有找到可视域分析结果，无法更新属性')
        return false
      }

      console.log(`🔧 更新可视域属性: ${property} = ${value}`)

      // 更新官方ViewShed3D对象属性
      if (viewshedResult.viewshed3D && !viewshedResult.isDestroyed) {
        try {
          switch (property) {
            case 'direction':
              viewshedResult.viewshed3D.direction = value
              viewshedResult.heading = value
              break
            case 'pitch':
              viewshedResult.viewshed3D.pitch = value
              viewshedResult.pitch = value
              break
            case 'distance':
              viewshedResult.viewshed3D.distance = value
              viewshedResult.distance = value
              break
            case 'horizontalFov':
              viewshedResult.viewshed3D.horizontalFov = value
              viewshedResult.horizontalFov = value
              break
            case 'verticalFov':
              viewshedResult.viewshed3D.verticalFov = value
              viewshedResult.verticalFov = value
              break
            case 'visibleColor':
              const visibleColor = this.parseColorValue(value, 0.5)
              viewshedResult.viewshed3D.visibleAreaColor = visibleColor
              break
            case 'invisibleColor':
              const invisibleColor = this.parseColorValue(value, 0.5)
              viewshedResult.viewshed3D.hiddenAreaColor = invisibleColor
              break
            default:
              console.warn(`未知的可视域属性: ${property}`)
              return false
          }

          // 重新构建可视域分析
          if (typeof viewshedResult.viewshed3D.build === 'function') {
            viewshedResult.viewshed3D.build()
            console.log(`✅ 可视域属性 ${property} 更新成功`)
          }

          return true
        } catch (error) {
          console.warn(`⚠️ 更新官方可视域属性失败: ${error.message}`)
        }
      }

      // 更新自定义可视域分析属性
      if (viewshedResult.analysis && !viewshedResult.isDestroyed) {
        try {
          // 对于自定义实现，需要重新执行分析
          const options = {
            horizontalFov:
              property === 'horizontalFov'
                ? value
                : viewshedResult.horizontalFov,
            verticalFov:
              property === 'verticalFov' ? value : viewshedResult.verticalFov,
            visibleColor:
              property === 'visibleColor'
                ? this.hexToColor(value, 0.5)
                : viewshedResult.visibleColor,
            hiddenColor:
              property === 'invisibleColor'
                ? this.hexToColor(value, 0.5)
                : viewshedResult.hiddenColor,
          }

          const distance =
            property === 'distance' ? value : viewshedResult.distance
          const pitch = property === 'pitch' ? value : viewshedResult.pitch
          const heading =
            property === 'direction' ? value : viewshedResult.heading

          // 清除当前分析结果
          this.clearAnalysisResults('viewshed')

          // 重新执行可视域分析
          this.performViewshedAnalysis(
            viewshedResult.viewPoint,
            distance,
            pitch,
            heading,
            options,
          )

          console.log(`✅ 自定义可视域属性 ${property} 更新成功`)
          return true
        } catch (error) {
          console.warn(`⚠️ 更新自定义可视域属性失败: ${error.message}`)
        }
      }

      return false
    } catch (error) {
      console.error(`❌ 更新可视域属性失败: ${error.message}`)
      return false
    }
  }

  /**
   * 设置可视域裁剪模式
   * @param {string} mode 裁剪模式 ('keep-inside' 或 'keep-outside')
   */
  setViewshedClipMode(mode) {
    try {
      const viewshedResult = this.analysisResults.get('viewshed')
      if (!viewshedResult) {
        console.warn('没有找到可视域分析结果')
        return false
      }

      console.log(`🔧 设置可视域裁剪模式: ${mode}`)

      // 转换模式字符串为SuperMap3D的裁剪类型
      let clipMode
      if (mode === 'keep-inside') {
        clipMode = SuperMap3D.ClippingType
          ? SuperMap3D.ClippingType.KeepInside
          : 0
      } else if (mode === 'keep-outside') {
        clipMode = SuperMap3D.ClippingType
          ? SuperMap3D.ClippingType.KeepOutside
          : 1
      } else {
        console.warn('无效的裁剪模式:', mode)
        return false
      }

      // 设置官方ViewShed3D对象的裁剪模式
      if (viewshedResult.viewshed3D && !viewshedResult.isDestroyed) {
        try {
          if (typeof viewshedResult.viewshed3D.setClipMode === 'function') {
            viewshedResult.viewshed3D.setClipMode(clipMode)
            console.log('✅ 官方ViewShed3D对象裁剪模式设置成功')
          } else if (viewshedResult.viewshed3D.clipMode !== undefined) {
            viewshedResult.viewshed3D.clipMode = clipMode
            console.log('✅ 官方ViewShed3D对象裁剪模式属性设置成功')
          } else {
            console.warn('⚠️ 官方ViewShed3D对象不支持裁剪模式设置')
          }

          // 重新构建可视域分析
          if (typeof viewshedResult.viewshed3D.build === 'function') {
            viewshedResult.viewshed3D.build()
          }
        } catch (setError) {
          console.warn(
            `⚠️ 设置官方ViewShed3D对象裁剪模式失败: ${setError.message}`,
          )
        }
      }

      // 保存裁剪模式到结果中
      viewshedResult.clipMode = mode
      viewshedResult.clipModeValue = clipMode

      return true
    } catch (error) {
      console.error('❌ 设置可视域裁剪模式失败:', error)
      return false
    }
  }

  /**
   * 将十六进制颜色转换为SuperMap3D.Color
   * @param {string} hex 十六进制颜色值
   * @param {number} alpha 透明度
   * @returns {SuperMap3D.Color}
   */
  hexToColor(hex, alpha = 1.0) {
    try {
      // 移除#号
      hex = hex.replace('#', '')

      // 解析RGB值
      const r = parseInt(hex.substr(0, 2), 16) / 255
      const g = parseInt(hex.substr(2, 2), 16) / 255
      const b = parseInt(hex.substr(4, 2), 16) / 255

      return new SuperMap3D.Color(r, g, b, alpha)
    } catch (error) {
      console.warn(`颜色转换失败: ${hex}`, error)
      return SuperMap3D.Color.GREEN.withAlpha(alpha)
    }
  }

  /**
   * 解析颜色值（支持十六进制和RGBA格式）
   * @param {string} color 颜色值（如#00ff00或rgba(0, 1, 0, 0.8)）
   * @param {number} alpha 透明度（如果颜色值中不包含透明度）
   * @returns {SuperMap3D.Color}
   */
  parseColorValue(color, alpha = 1.0) {
    try {
      // 检查是否为RGBA格式
      const rgbaMatch = color.match(
        /rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)/i,
      )

      if (rgbaMatch) {
        // 解析RGBA值
        const r = parseFloat(rgbaMatch[1]) / 255
        const g = parseFloat(rgbaMatch[2]) / 255
        const b = parseFloat(rgbaMatch[3]) / 255
        const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : alpha

        return new SuperMap3D.Color(r, g, b, a)
      }

      // 如果不是RGBA格式，则使用hexToColor处理十六进制颜色
      return this.hexToColor(color, alpha)
    } catch (error) {
      console.warn(`颜色解析失败: ${color}`, error)
      return SuperMap3D.Color.GREEN.withAlpha(alpha)
    }
  }

  /**
   * 开始绘制裁剪面
   */
  startDrawClipPlane() {
    try {
      console.log('🔧 开始绘制可视域裁剪面...')

      // 检查是否有可视域分析结果
      const viewshedResult = this.analysisResults.get('viewshed')
      if (!viewshedResult) {
        console.warn('⚠️ 请先执行可视域分析')
        return false
      }

      // 检查是否支持深度纹理
      if (!this.scene.pickPositionSupported) {
        console.warn('⚠️ 不支持深度纹理，无法精确选择模型位置')
        return false
      }

      const positions = []

      // 设置鼠标事件处理器
      if (!this.handler) {
        this.handler = new SuperMap3D.ScreenSpaceEventHandler(this.scene.canvas)
      }

      // 清除之前的事件监听器
      this.handler.removeInputAction(SuperMap3D.ScreenSpaceEventType.LEFT_CLICK)
      this.handler.removeInputAction(
        SuperMap3D.ScreenSpaceEventType.RIGHT_CLICK,
      )

      // 左键点击添加点
      this.handler.setInputAction((event) => {
        // 使用pickPosition来精确选择模型表面位置
        this.scene
          .pickPositionAsync(event.position)
          .then((position) => {
            if (position) {
              positions.push(position)

              // 添加临时标记
              const pointEntity = this.viewer.entities.add({
                position: position,
                point: {
                  pixelSize: 10,
                  color: SuperMap3D.Color.YELLOW,
                  outlineColor: SuperMap3D.Color.BLACK,
                  outlineWidth: 2,
                  heightReference: SuperMap3D.HeightReference.NONE,
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
                label: {
                  text: `点${positions.length}`,
                  font: '12pt sans-serif',
                  fillColor: SuperMap3D.Color.WHITE,
                  outlineColor: SuperMap3D.Color.BLACK,
                  outlineWidth: 2,
                  style: SuperMap3D.LabelStyle.FILL_AND_OUTLINE,
                  pixelOffset: new SuperMap3D.Cartesian2(0, -40),
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
              })

              // 保存临时实体
              this.tempClipEntities = this.tempClipEntities || []
              this.tempClipEntities.push(pointEntity)

              console.log(`已添加第${positions.length}个裁剪面顶点`)

              // 如果有足够的点，绘制临时线条
              if (positions.length >= 2) {
                const lineEntity = this.viewer.entities.add({
                  polyline: {
                    positions: positions,
                    width: 3,
                    material: SuperMap3D.Color.YELLOW,
                    clampToGround: false,
                    depthFailMaterial: SuperMap3D.Color.YELLOW.withAlpha(0.5),
                  },
                })
                this.tempClipEntities.push(lineEntity)
              }
            } else {
              console.warn('⚠️ 无法获取点击位置，请点击模型表面')
            }
          })
          .catch((error) => {
            console.warn('⚠️ 获取点击位置失败:', error.message)
          })
      }, SuperMap3D.ScreenSpaceEventType.LEFT_CLICK)

      // 右键点击完成绘制
      this.handler.setInputAction((event) => {
        if (positions.length >= 3) {
          // 清除临时实体
          if (this.tempClipEntities) {
            this.tempClipEntities.forEach((entity) => {
              if (this.viewer.entities.contains(entity)) {
                this.viewer.entities.remove(entity)
              }
            })
            this.tempClipEntities = []
          }

          // 绘制最终的裁剪面
          this.drawViewshedClipPlane(positions)

          // 清除事件监听器
          this.handler.removeInputAction(
            SuperMap3D.ScreenSpaceEventType.LEFT_CLICK,
          )
          this.handler.removeInputAction(
            SuperMap3D.ScreenSpaceEventType.RIGHT_CLICK,
          )

          console.log('✅ 裁剪面绘制完成')
        } else {
          console.warn('⚠️ 裁剪面至少需要3个顶点')
        }
      }, SuperMap3D.ScreenSpaceEventType.RIGHT_CLICK)

      return true
    } catch (error) {
      console.error('❌ 开始绘制裁剪面失败:', error)
      return false
    }
  }

  /**
   * 绘制裁剪面（通用方法）
   * @param {Array<SuperMap3D.Cartesian3>} positions 裁剪面顶点
   */
  drawClipPlane(positions) {
    try {
      if (!positions || positions.length < 3) {
        throw new Error('裁剪面至少需要3个顶点')
      }

      console.log('🔧 绘制裁剪面...', { pointCount: positions.length })

      // 清除之前的裁剪面
      this.clearClipPlanes()

      // 创建裁剪面可视化
      const clipPlaneEntity = this.viewer.entities.add({
        polygon: {
          hierarchy: positions,
          material: SuperMap3D.Color.BLUE.withAlpha(0.3),
          outline: true,
          outlineColor: SuperMap3D.Color.BLUE,
          height: 0,
          extrudedHeight: 100,
          classificationType: SuperMap3D.ClassificationType.BOTH,
        },
      })

      // 保存裁剪面实体
      this.clipPlaneEntities = this.clipPlaneEntities || []
      this.clipPlaneEntities.push(clipPlaneEntity)

      // 应用裁剪面到场景中的图层
      this.applyClipPlaneToLayers(positions)

      console.log('✅ 裁剪面绘制完成')
      return true
    } catch (error) {
      console.error('❌ 绘制裁剪面失败:', error)
      return false
    }
  }

  /**
   * 应用裁剪面到场景图层
   * @param {Array<SuperMap3D.Cartesian3>} positions 裁剪面顶点
   */
  applyClipPlaneToLayers(positions) {
    try {
      // 转换位置为经纬度坐标
      const clipPositions = []
      for (let i = 0; i < positions.length; i++) {
        const cartographic = SuperMap3D.Cartographic.fromCartesian(positions[i])
        const longitude = SuperMap3D.Math.toDegrees(cartographic.longitude)
        const latitude = SuperMap3D.Math.toDegrees(cartographic.latitude)
        const height = cartographic.height

        clipPositions.push(longitude)
        clipPositions.push(latitude)
        clipPositions.push(height)
      }

      // 遍历场景中的图层并应用裁剪面
      this.scene.layers.layerQueue.forEach((layer) => {
        if (layer && typeof layer.setCustomClipPlane === 'function') {
          try {
            // 使用前三个点创建裁剪面
            if (positions.length >= 3) {
              layer.setCustomClipPlane(positions[0], positions[1], positions[2])
              console.log('✅ 应用裁剪面到图层:', layer.name || '未命名图层')
            }
          } catch (layerError) {
            console.warn(
              '⚠️ 图层裁剪失败:',
              layer.name || '未命名图层',
              layerError,
            )
          }
        }
      })

      console.log('✅ 裁剪面应用完成')
    } catch (error) {
      console.error('❌ 应用裁剪面失败:', error)
    }
  }

  /**
   * 绘制可视域裁剪面
   * @param {Array<SuperMap3D.Cartesian3>} positions 裁剪面顶点
   */
  drawViewshedClipPlane(positions) {
    try {
      if (!positions || positions.length < 3) {
        throw new Error('裁剪面至少需要3个顶点')
      }

      console.log('🔧 绘制可视域裁剪面...', { pointCount: positions.length })

      // 清除之前的裁剪面
      this.clearClipPlanes()

      // 转换位置为经纬度坐标
      const clipPositions = []
      for (let i = 0; i < positions.length; i++) {
        const cartographic = SuperMap3D.Cartographic.fromCartesian(positions[i])
        const longitude = SuperMap3D.Math.toDegrees(cartographic.longitude)
        const latitude = SuperMap3D.Math.toDegrees(cartographic.latitude)
        const height = cartographic.height

        // 避免重复坐标
        if (
          clipPositions.indexOf(longitude) === -1 &&
          clipPositions.indexOf(latitude) === -1
        ) {
          clipPositions.push(longitude)
          clipPositions.push(latitude)
          clipPositions.push(height)
        }
      }

      // 创建裁剪面可视化
      const clipPlaneEntity = this.viewer.entities.add({
        polygon: {
          hierarchy: positions,
          material: SuperMap3D.Color.BLUE.withAlpha(0.3),
          outline: true,
          outlineColor: SuperMap3D.Color.BLUE,
          height: 0,
          extrudedHeight: 100,
          classificationType: SuperMap3D.ClassificationType.BOTH,
        },
      })

      // 保存裁剪面实体
      this.clipPlaneEntities = this.clipPlaneEntities || []
      this.clipPlaneEntities.push(clipPlaneEntity)

      // 应用裁剪面到可视域分析
      const viewshedResult = this.analysisResults.get('viewshed')
      if (viewshedResult) {
        try {
          // 生成唯一的裁剪面名称
          const clipRegionName =
            'clipRegion_' +
            Date.now() +
            '_' +
            Math.random().toString(36).substr(2, 9)

          // 优先使用官方ViewShed3D对象
          if (
            viewshedResult.officialViewshed &&
            typeof viewshedResult.officialViewshed.addClipRegion === 'function'
          ) {
            viewshedResult.officialViewshed.addClipRegion({
              name: clipRegionName,
              position: clipPositions,
            })
            console.log('✅ 使用官方ViewShed3D对象应用裁剪面:', clipRegionName)
          }
          // 备用：使用自定义可视域分析对象
          else if (
            viewshedResult.viewshed3D &&
            typeof viewshedResult.viewshed3D.addClipRegion === 'function'
          ) {
            viewshedResult.viewshed3D.addClipRegion({
              name: clipRegionName,
              position: clipPositions,
            })
            console.log(
              '✅ 使用自定义可视域分析对象应用裁剪面:',
              clipRegionName,
            )
          }
          // 兜底：使用viewshed对象
          else if (
            viewshedResult.viewshed &&
            typeof viewshedResult.viewshed.addClipRegion === 'function'
          ) {
            viewshedResult.viewshed.addClipRegion({
              name: clipRegionName,
              position: clipPositions,
            })
            console.log('✅ 使用备用可视域分析对象应用裁剪面:', clipRegionName)
          } else {
            console.warn('⚠️ 可视域分析对象不支持addClipRegion方法')
          }

          // 保存裁剪面信息到结果中
          viewshedResult.clipRegions = viewshedResult.clipRegions || []
          viewshedResult.clipRegions.push({
            name: clipRegionName,
            positions: clipPositions,
            entity: clipPlaneEntity,
          })

          console.log('✅ 可视域裁剪面绘制完成，名称:', clipRegionName)
        } catch (clipError) {
          console.warn('⚠️ 应用裁剪面到可视域分析失败:', clipError.message)
        }
      } else {
        console.warn('⚠️ 未找到可视域分析结果')
      }

      return clipPlaneEntity
    } catch (error) {
      console.error('❌ 绘制可视域裁剪面失败:', error)
      return null
    }
  }

  /**
   * 清除裁剪面
   */
  clearClipPlanes() {
    try {
      if (this.clipPlaneEntities && this.clipPlaneEntities.length > 0) {
        this.clipPlaneEntities.forEach((entity) => {
          if (this.viewer.entities.contains(entity)) {
            this.viewer.entities.remove(entity)
          }
        })
        this.clipPlaneEntities = []
        console.log('✅ 清除裁剪面完成')
      }
    } catch (error) {
      console.warn('⚠️ 清除裁剪面失败:', error)
    }
  }

  /**
   * 初始化阴影分析
   */
  initShadowAnalysis() {
    try {
      // console.log('🌞 初始化阴影分析模块...');

      // 检查场景是否支持深度纹理
      if (!this.scene.pickPositionSupported) {
        console.warn('⚠️ 不支持深度纹理，阴影分析功能可能无法正常使用')
      }

      // 确保场景开启阴影
      if (!this.scene.shadowMap.enabled) {
        this.scene.shadowMap.enabled = true
        this.scene.shadowMap.darkness = 0.3
        // console.log('✅ 已开启场景阴影');
      }

      // 初始化阴影查询对象
      this.shadowQuery = null
      this.shadowDrawHandler = null
      this.shadowMarkedPoints = []

      // console.log('✅ 阴影分析模块初始化完成');
    } catch (error) {
      console.error('❌ 阴影分析模块初始化失败:', error)
    }
  }

  /**
   * 开始阴影分析
   * @param {Object} options 分析参数
   */
  performShadowAnalysis(options = {}) {
    try {
      console.log('🌞 开始阴影分析...', options)

      // 清除之前的分析结果
      this.clearAnalysisResults('shadow')

      // 确保场景支持深度纹理
      if (!this.scene.pickPositionSupported) {
        console.warn('⚠️ 不支持深度纹理，阴影分析功能可能无法正常使用')
        return false
      }

      // 确保场景开启阴影
      if (!this.scene.shadowMap.enabled) {
        this.scene.shadowMap.enabled = true
        this.scene.shadowMap.darkness = 0.3
        console.log('✅ 已开启场景阴影')
      }

      // 创建阴影查询对象
      this.shadowQuery = new SuperMap3D.ShadowQueryPoints(this.scene)

      // 设置分析时间
      const dateValue = options.date || new Date().toISOString().split('T')[0]
      const startTime = new Date(dateValue)
      startTime.setHours(Number(options.startTime || 10))
      this.shadowQuery.startTime = SuperMap3D.JulianDate.fromDate(startTime)

      const endTime = new Date(dateValue)
      endTime.setHours(Number(options.endTime || 14))
      this.shadowQuery.endTime = SuperMap3D.JulianDate.fromDate(endTime)

      // 设置分析参数
      this.shadowQuery.spacing = options.spacing || 10
      this.shadowQuery.timeInterval = options.timeInterval || 60

      // 设置当前时间为结束时间
      this.setCurrentTime(options)

      // 创建绘制处理器
      this.shadowDrawHandler = new SuperMap3D.DrawHandler(
        this.viewer,
        SuperMap3D.DrawMode.Polygon,
        0,
      )

      // 设置绘制事件
      this.shadowDrawHandler.activeEvt.addEventListener((isActive) => {
        if (isActive) {
          this.viewer.enableCursorStyle = false
          this.viewer._element.style.cursor = 'crosshair'
          console.log('🖱️ 开始绘制阴影分析区域')
        } else {
          this.viewer.enableCursorStyle = true
          this.viewer._element.style.cursor = 'default'
        }
      })

      // 添加绘制移动事件提示
      this.shadowDrawHandler.movingEvt.addEventListener((windowPosition) => {
        if (this.shadowDrawHandler.isDrawing) {
          // 可以在这里添加提示信息
          console.log('正在绘制阴影分析区域...')
        }
      })

      // 绘制完成事件
      this.shadowDrawHandler.drawEvt.addEventListener((result) => {
        this.handleShadowDrawComplete(result, options)
      })

      // 激活绘制
      this.shadowDrawHandler.activate()

      console.log('✅ 阴影分析绘制模式已激活')
      return true
    } catch (error) {
      console.error('❌ 阴影分析失败:', error)
      return false
    }
  }

  /**
   * 处理阴影分析绘制完成
   * @param {Object} result 绘制结果
   * @param {Object} options 分析参数
   */
  handleShadowDrawComplete(result, options) {
    try {
      const polygon = result.object
      if (!polygon) {
        console.warn('⚠️ 绘制结果无效')
        return
      }

      // 隐藏绘制的多边形
      polygon.show = false
      if (this.shadowDrawHandler.polyline) {
        this.shadowDrawHandler.polyline.show = false
      }

      // 提取多边形顶点坐标，参考shadowQuery.html的实现
      const positions = [].concat(polygon.positions)
      // 去除重复点
      const uniquePositions = SuperMap3D.arrayRemoveDuplicates(
        positions,
        SuperMap3D.Cartesian3.equalsEpsilon,
      )
      const points = []

      // 遍历多边形，取出所有点
      for (let i = 0, len = uniquePositions.length; i < len; i++) {
        // 转化为经纬度，并加入至临时数组
        const cartographic = SuperMap3D.Cartographic.fromCartesian(
          uniquePositions[i],
        )
        const longitude = SuperMap3D.Math.toDegrees(cartographic.longitude)
        const latitude = SuperMap3D.Math.toDegrees(cartographic.latitude)
        points.push(longitude)
        points.push(latitude)
      }

      // 设置分析对象的开始结束时间
      const dateValue = options.date || new Date().toISOString().split('T')[0]
      const startTime = new Date(dateValue)
      startTime.setHours(Number(options.startTime || 10))
      this.shadowQuery.startTime = SuperMap3D.JulianDate.fromDate(startTime)

      const endTime = new Date(dateValue)
      endTime.setHours(Number(options.endTime || 14))
      this.shadowQuery.endTime = SuperMap3D.JulianDate.fromDate(endTime)

      // 设置当前时间
      this.setCurrentTime(options)

      // 设置分析参数
      this.shadowQuery.spacing = options.spacing || 10
      this.shadowQuery.timeInterval = options.timeInterval || 60

      // 设置分析区域、底部高程和拉伸高度
      const bottomHeight = Number(options.bottomHeight || 20)
      const extrudeHeight = Number(options.extrudeHeight || 20)

      this.shadowQuery.qureyRegion({
        position: points,
        bottom: bottomHeight,
        extend: extrudeHeight,
      })

      // 执行分析
      this.shadowQuery.build()

      // 保存分析结果
      const analysisData = {
        shadowQuery: this.shadowQuery,
        drawHandler: this.shadowDrawHandler,
        polygon: polygon,
        points: points,
        bottomHeight: bottomHeight,
        extrudeHeight: extrudeHeight,
        startTime: this.shadowQuery.startTime,
        endTime: this.shadowQuery.endTime,
        options: options,
        timestamp: new Date().toISOString(),
      }

      this.analysisResults.set('shadow', analysisData)
      this.activeAnalysis = 'shadow'

      console.log('✅ 阴影分析完成', {
        points: points.length / 2,
        bottomHeight: bottomHeight + 'm',
        extrudeHeight: extrudeHeight + 'm',
        dateRange: `${dateValue} ${options.startTime || 10}:00 - ${options.endTime || 14}:00`,
      })
    } catch (error) {
      console.error('❌ 处理阴影分析绘制完成失败:', error)
    }
  }

  /**
   * 设置当前时间
   * @param {Object} options 时间参数
   */
  setCurrentTime(options = {}) {
    try {
      const dateValue = options.date || new Date().toISOString().split('T')[0]
      const endTime = new Date(dateValue)
      endTime.setHours(Number(options.endTime || 14))

      this.viewer.clock.currentTime = SuperMap3D.JulianDate.fromDate(endTime)
      this.viewer.clock.multiplier = 1
      this.viewer.clock.shouldAnimate = true

      console.log('⏰ 设置当前时间:', endTime.toLocaleString())
    } catch (error) {
      console.warn('⚠️ 设置当前时间失败:', error)
    }
  }

  /**
   * 执行日照效果动画
   * @param {Object} options 选项参数
   */
  performSunlightEffect(options = {}) {
    try {
      console.log('☀️ 开始日照效果动画...')

      if (!this.shadowQuery) {
        console.warn('⚠️ 请先执行阴影分析')
        return false
      }

      // 清除之前的定时器
      if (this.sunlightInterval) {
        clearInterval(this.sunlightInterval)
        this.sunlightInterval = null
      }

      const dateValue = options.date || new Date().toISOString().split('T')[0]
      const startHour = Number(options.startTime || 10)
      const endHour = Number(options.endTime || 14)

      if (startHour >= endHour) {
        console.warn('⚠️ 开始时间必须小于结束时间')
        return false
      }

      let currentHour = startHour
      let currentMinute = 0

      this.sunlightInterval = setInterval(() => {
        if (currentHour < endHour) {
          const currentTime = new Date(dateValue)
          currentTime.setHours(currentHour)
          currentTime.setMinutes(currentMinute)

          this.viewer.clock.currentTime =
            SuperMap3D.JulianDate.fromDate(currentTime)

          currentMinute += 10 // 每次增加10分钟
          if (currentMinute >= 60) {
            currentHour += 1
            currentMinute = 0
          }

          console.log('🕐 当前时间:', currentTime.toLocaleTimeString())
        } else {
          clearInterval(this.sunlightInterval)
          this.sunlightInterval = null
          console.log('✅ 日照效果动画完成')
        }
      }, 20) // 每20毫秒更新一次

      return true
    } catch (error) {
      console.error('❌ 日照效果动画失败:', error)
      return false
    }
  }

  /**
   * 获取阴影率
   * @param {Function} callback 回调函数
   */
  getShadowRatio(callback) {
    try {
      if (!this.shadowQuery) {
        console.warn('⚠️ 请先执行阴影分析')
        if (callback) callback({ error: '请先执行阴影分析', success: false })
        return
      }

      // 清除之前的阴影率处理器
      if (this.shadowRatioHandler) {
        this.shadowRatioHandler.destroy()
        this.shadowRatioHandler = null
      }

      // 设置鼠标样式为十字准星
      this.viewer.canvas.style.cursor = 'crosshair'

      // 创建点击处理器
      const handler = new SuperMap3D.ScreenSpaceEventHandler(this.scene.canvas)

      handler.setInputAction((event) => {
        this.scene
          .pickPositionAsync(event.position)
          .then((position) => {
            if (!position) {
              console.warn('⚠️ 无法获取点击位置，请点击模型表面')
              if (callback)
                callback({
                  error: '无法获取点击位置，请点击模型表面',
                  success: false,
                })
              return
            }

            const cartographic = SuperMap3D.Cartographic.fromCartesian(position)

            this.shadowQuery
              .getShadowRadioAsync(cartographic)
              .then((shadowRatio) => {
                const longitude = SuperMap3D.Math.toDegrees(
                  cartographic.longitude,
                )
                const latitude = SuperMap3D.Math.toDegrees(
                  cartographic.latitude,
                )
                const height = cartographic.height

                if (shadowRatio !== -1) {
                  // 计算阴影率百分比
                  const shadowPercentage = (shadowRatio * 100).toFixed(2)

                  // 根据阴影率设置不同颜色
                  let pointColor = SuperMap3D.Color.GREEN // 低阴影率
                  if (shadowRatio > 0.7) {
                    pointColor = SuperMap3D.Color.RED // 高阴影率
                  } else if (shadowRatio > 0.3) {
                    pointColor = SuperMap3D.Color.YELLOW // 中等阴影率
                  }

                  // 添加标记点
                  const markedPoint = this.viewer.entities.add({
                    point: {
                      color: pointColor.withAlpha(0.8),
                      pixelSize: 15,
                      outlineColor: SuperMap3D.Color.BLACK,
                      outlineWidth: 2,
                      heightReference:
                        SuperMap3D.HeightReference.CLAMP_TO_GROUND,
                      disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    },
                    label: {
                      text: `阴影率: ${shadowPercentage}%`,
                      font: '14pt sans-serif',
                      fillColor: SuperMap3D.Color.WHITE,
                      outlineColor: SuperMap3D.Color.BLACK,
                      outlineWidth: 2,
                      style: SuperMap3D.LabelStyle.FILL_AND_OUTLINE,
                      pixelOffset: new SuperMap3D.Cartesian2(0, -50),
                      disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    },
                    position: SuperMap3D.Cartesian3.fromDegrees(
                      longitude,
                      latitude,
                      height + 0.5,
                    ),
                  })

                  this.shadowMarkedPoints.push(markedPoint)

                  const result = {
                    shadowRatio: shadowRatio,
                    shadowPercentage: shadowPercentage,
                    longitude: longitude,
                    latitude: latitude,
                    height: height,
                    success: true,
                  }

                  // 调用回调函数
                  if (callback) {
                    callback(result)
                  }

                  console.log('📍 获取阴影率成功:', {
                    shadowRatio: shadowRatio,
                    shadowPercentage: shadowPercentage + '%',
                    longitude: longitude.toFixed(6),
                    latitude: latitude.toFixed(6),
                    height: height.toFixed(2) + 'm',
                  })
                } else {
                  console.warn('⚠️ 该位置无法获取阴影率')
                  if (callback) {
                    callback({ error: '该位置无法获取阴影率', success: false })
                  }
                }
              })
              .catch((error) => {
                console.error('❌ 获取阴影率失败:', error)
                if (callback) {
                  callback({
                    error: '获取阴影率失败: ' + error.message,
                    success: false,
                  })
                }
              })
          })
          .catch((error) => {
            console.error('❌ 获取位置失败:', error)
            if (callback) {
              callback({
                error: '获取位置失败: ' + error.message,
                success: false,
              })
            }
          })
      }, SuperMap3D.ScreenSpaceEventType.LEFT_CLICK)

      // 保存处理器以便后续清理
      this.shadowRatioHandler = handler

      console.log(
        '👆 点击地图获取阴影率（绿色=低阴影率，黄色=中等阴影率，红色=高阴影率）',
      )
    } catch (error) {
      console.error('❌ 获取阴影率功能启动失败:', error)
      if (callback) {
        callback({
          error: '获取阴影率功能启动失败: ' + error.message,
          success: false,
        })
      }
    }
  }

  /**
   * 日照效果演示
   * @param {Object} options 演示参数
   */
  performSunlightEffect(options = {}) {
    try {
      console.log('☀️ 开始日照效果演示...')

      const dateValue = options.date || new Date().toISOString().split('T')[0]
      const startHour = Number(options.startTime || 10)
      const endHour = Number(options.endTime || 14)

      if (startHour >= endHour) {
        console.warn('⚠️ 开始时间必须小于结束时间')
        return
      }

      let currentHour = startHour
      let currentMinute = 0

      const interval = setInterval(() => {
        if (currentHour < endHour) {
          const currentTime = new Date(dateValue)
          currentTime.setHours(currentHour)
          currentTime.setMinutes(currentMinute)

          this.viewer.clock.currentTime =
            SuperMap3D.JulianDate.fromDate(currentTime)

          currentMinute += 10
          if (currentMinute >= 60) {
            currentHour += 1
            currentMinute = 0
          }

          console.log('⏰ 当前时间:', currentTime.toLocaleTimeString())
        } else {
          clearInterval(interval)
          console.log('✅ 日照效果演示完成')
        }
      }, 100) // 每100ms更新一次

      // 保存定时器以便后续清理
      this.sunlightInterval = interval
    } catch (error) {
      console.error('❌ 日照效果演示失败:', error)
    }
  }

  /**
   * 清除阴影标记点
   */
  clearShadowMarkedPoints() {
    try {
      if (this.shadowMarkedPoints && this.shadowMarkedPoints.length > 0) {
        this.shadowMarkedPoints.forEach((point) => {
          if (this.viewer.entities.contains(point)) {
            this.viewer.entities.remove(point)
          }
        })
        this.shadowMarkedPoints = []
        console.log('✅ 清除阴影标记点')
      }
    } catch (error) {
      console.warn('⚠️ 清除阴影标记点失败:', error)
    }
  }

  /**
   * 清除阴影分析
   */
  clearShadowAnalysis() {
    try {
      console.log('🧹 清除阴影分析...')

      // 清除标记点
      this.clearShadowMarkedPoints()

      // 停用绘制处理器
      if (this.shadowDrawHandler) {
        this.shadowDrawHandler.deactivate()
        if (this.shadowDrawHandler.polygon) {
          this.shadowDrawHandler.polygon.show = false
        }
        if (this.shadowDrawHandler.polyline) {
          this.shadowDrawHandler.polyline.show = false
        }
        this.shadowDrawHandler = null
      }

      // 清除阴影查询对象
      if (this.shadowQuery) {
        if (typeof this.shadowQuery.clear === 'function') {
          this.shadowQuery.clear()
        }
        this.shadowQuery = null
      }

      // 清除阴影率处理器
      if (this.shadowRatioHandler) {
        this.shadowRatioHandler.destroy()
        this.shadowRatioHandler = null
      }

      // 重置鼠标样式
      this.viewer.canvas.style.cursor = 'default'

      // 清除日照效果定时器
      if (this.sunlightInterval) {
        clearInterval(this.sunlightInterval)
        this.sunlightInterval = null
      }

      // 清除分析结果
      this.clearAnalysisResults('shadow')

      console.log('✅ 阴影分析清除完成')
    } catch (error) {
      console.error('❌ 清除阴影分析失败:', error)
    }
  }

  /**
   * 初始化天际线分析
   */
  initSkylineAnalysis() {
    try {
      if (!this.scene.pickPositionSupported) {
        console.warn('⚠️ 不支持深度纹理，天际线分析功能无法使用')
        return false
      }

      // 创建天际线分析对象
      this.skyline = new SuperMap3D.Skyline(this.scene)

      // 注：限高体绘制功能已移除，以简化清除逻辑

      // console.log('✅ 天际线分析初始化成功');
      return true
    } catch (error) {
      console.error('❌ 天际线分析初始化失败:', error)
      return false
    }
  }

  // 注：限高体绘制功能已移除，以简化清除逻辑

  /**
   * 提取天际线
   */
  extractSkyline(radius = 10000) {
    try {
      if (!this.skyline) {
        if (!this.initSkylineAnalysis()) {
          throw new Error('天际线分析初始化失败')
        }
      }

      const cartographic = this.scene.camera.positionCartographic
      const longitude = SuperMap3D.Math.toDegrees(cartographic.longitude)
      const latitude = SuperMap3D.Math.toDegrees(cartographic.latitude)
      const height = cartographic.height

      // 天际线分析的视口位置设置成当前相机位置
      this.skyline.viewPosition = [longitude, latitude, height]
      // 设置俯仰和方向
      this.skyline.pitch = SuperMap3D.Math.toDegrees(this.scene.camera.pitch)
      this.skyline.direction = SuperMap3D.Math.toDegrees(
        this.scene.camera.heading,
      )
      this.skyline.radius = radius // 天际线分析半径

      this.skyline.build()

      // 存储天际线分析结果到analysisResults中
      const analysisData = {
        type: 'skyline',
        radius: radius,
        viewPosition: this.skyline.viewPosition,
        pitch: this.skyline.pitch,
        direction: this.skyline.direction,
        timestamp: new Date().toISOString(),
      }

      this.analysisResults.set('skyline', analysisData)
      console.log('✅ 天际线提取完成，分析结果已存储')
      return true
    } catch (error) {
      console.error('❌ 提取天际线失败:', error)
      return false
    }
  }

  /**
   * 获取二维天际线数据
   */
  async getSkyline2DData() {
    try {
      if (!this.skyline) {
        throw new Error('天际线分析未初始化')
      }

      // 获取二维天际线对象，兼容WebGPU
      const skylineData = await this.skyline.getSkyline2DAsync()
      console.log('✅ 获取二维天际线数据成功')
      return skylineData
    } catch (error) {
      console.error('❌ 获取二维天际线数据失败:', error)
      throw error
    }
  }

  // 移除有问题的限高体和拉伸闭合体功能

  /**
   * 清除天际线分析
   */
  clearSkylineAnalysis() {
    try {
      console.log('🧹 开始清除天际线分析...')

      // 清除天际线分析结果
      if (this.skyline) {
        try {
          // 强制清除所有天际线分析效果
          if (typeof this.skyline.clear === 'function') {
            this.skyline.clear()
            console.log('🧹 已调用天际线clear方法')
          }

          // 重置显示模式为默认线模式
          if (typeof this.skyline.displayStyle !== 'undefined') {
            this.skyline.displayStyle = 0
            console.log('🔄 重置天际线显示模式为线模式')
          }

          // 重置天际线分析参数
          if (typeof this.skyline.radius !== 'undefined') {
            this.skyline.radius = 0
            console.log('🔄 重置天际线分析半径')
          }

          // 重置视点位置和方向参数
          if (typeof this.skyline.viewPosition !== 'undefined') {
            this.skyline.viewPosition = null
            console.log('🔄 重置天际线视点位置')
          }

          if (typeof this.skyline.pitch !== 'undefined') {
            this.skyline.pitch = 0
            console.log('🔄 重置天际线俯仰角')
          }

          if (typeof this.skyline.direction !== 'undefined') {
            this.skyline.direction = 0
            console.log('🔄 重置天际线方向角')
          }

          // 销毁天际线对象
          if (typeof this.skyline.destroy === 'function') {
            this.skyline.destroy()
            console.log('💥 已销毁天际线对象')
          }
        } catch (e) {
          console.warn('清除天际线对象时出错:', e)
        }
        this.skyline = null

        // 强制场景刷新，确保天际线效果完全清除
        if (this.scene) {
          this.scene.requestRender()
          console.log('🔄 强制场景刷新，确保天际线效果完全清除')
        }
      }

      // 简化清除逻辑：只清除基本的天际线分析对象和必要的清理

      // 清除分析实体集合
      if (this.analysisEntities && this.analysisEntities.length > 0) {
        this.analysisEntities.forEach((entity) => {
          try {
            if (this.viewer.entities.contains(entity)) {
              this.viewer.entities.remove(entity)
            }
          } catch (e) {
            console.warn('清除分析实体时出错:', e)
          }
        })
        this.analysisEntities = []
        console.log('🧹 已清除分析实体集合')
      }

      // 注：多边形绘制处理器已移除（限高体功能）

      // 清除所有可能的天际线图表容器
      const chartContainerIds = [
        'skylineChart',
        'skyline-chart',
        'skylineChartContainer',
        'chart-container',
      ]
      chartContainerIds.forEach((id) => {
        try {
          const container = document.getElementById(id)
          if (container) {
            // 销毁ECharts实例
            if (typeof echarts !== 'undefined') {
              const chartInstance = echarts.getInstanceByDom(container)
              if (chartInstance) {
                chartInstance.dispose()
                console.log('🗑️ 销毁ECharts实例:', id)
              }
            }

            // 清空容器内容
            while (container.firstChild) {
              container.removeChild(container.firstChild)
            }
            container.innerHTML = ''
            container.style.display = 'none'
          }
        } catch (e) {
          console.warn(`清除图表容器 ${id} 时出错:`, e)
        }
      })

      // 清除天际线分析数据
      if (this.analysisResults) {
        this.analysisResults.delete('skyline')
        this.analysisResults.delete('skylineAnalysis')
      }

      // 重置天际线相关属性
      this.skylineData = null
      this.skylinePolygon = null
      this.skylineRadius = 10000
      this.skylinePoints = null
      this.skylineEntities = null
      // 注：限高体数组已移除

      // 清除全局变量
      if (typeof window !== 'undefined') {
        if (window.skylineData) {
          window.skylineData = null
          delete window.skylineData
        }
        if (window.skylineCharts) {
          window.skylineCharts = null
          delete window.skylineCharts
        }
        if (window.skylineAnalysisResult) {
          window.skylineAnalysisResult = null
          delete window.skylineAnalysisResult
        }
      }

      // 恢复鼠标样式
      if (this.viewer) {
        this.viewer.enableCursorStyle = true
        this.viewer._element.style.cursor = ''
      }

      console.log('✅ 天际线分析清除完成')
    } catch (error) {
      console.error('❌ 清除天际线分析失败:', error)
    }
  }

  /**
   * 初始化测量分析
   */
  initMeasureAnalysis() {
    try {
      // 创建测量处理器
      this.measureHandler = new SuperMap3D.MeasureHandler(
        this.viewer,
        SuperMap3D.MeasureMode.Distance,
        SuperMap3D.ClampMode.None,
      )

      // 测量结果
      this.measureResults = []
      this.measureEntities = []

      console.log('✅ 测量分析初始化成功')
      return true
    } catch (error) {
      console.error('❌ 测量分析初始化失败:', error)
      return false
    }
  }

  /**
   * 设置鼠标为十字光标
   */
  setCrosshairCursor() {
    if (this.viewer && this.viewer._element) {
      this.viewer.enableCursorStyle = false
      this.viewer._element.style.cursor = 'crosshair'
    }
  }

  /**
   * 恢复默认鼠标光标
   */
  resetCursor() {
    if (this.viewer && this.viewer._element) {
      this.viewer.enableCursorStyle = true
      this.viewer._element.style.cursor = ''
    }
  }

  /**
   * 创建测量结果显示面板
   */
  createMeasureResultPanel() {
    // 检查是否已存在面板
    let panel = document.getElementById('measureResultPanel')
    if (panel) {
      panel.style.display = 'block'
      return panel
    }

    // 创建新面板
    panel = document.createElement('div')
    panel.id = 'measureResultPanel'
    panel.className = 'measure-result-panel'
    panel.innerHTML = `
      <div class="measure-result-header">
        <span class="measure-result-title">📏 测量结果</span>
        <button class="measure-result-close" onclick="document.getElementById('measureResultPanel').style.display='none'">&times;</button>
      </div>
      <div class="measure-result-content" id="measureResultContent">
        <div class="measure-result-hint">点击场景进行测量...</div>
      </div>
    `

    // 添加样式
    const style = document.createElement('style')
    style.textContent = `
      .measure-result-panel {
        position: fixed;
        top: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(255, 255, 255, 0.95);
        border: 2px solid #007bff;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
        z-index: 10000;
        min-width: 300px;
        max-width: 400px;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      }
      .measure-result-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 15px;
        background: linear-gradient(135deg, #007bff, #0056b3);
        color: white;
        border-radius: 8px 8px 0 0;
      }
      .measure-result-title {
        font-size: 16px;
        font-weight: bold;
      }
      .measure-result-close {
        background: none;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        line-height: 1;
      }
      .measure-result-close:hover {
        color: #ffcccc;
      }
      .measure-result-content {
        padding: 15px;
        max-height: 300px;
        overflow-y: auto;
      }
      .measure-result-hint {
        color: #666;
        font-style: italic;
        text-align: center;
        padding: 20px;
      }
      .measure-result-item {
        background: #f8f9fa;
        border-left: 4px solid #007bff;
        padding: 12px;
        margin-bottom: 10px;
        border-radius: 5px;
      }
      .measure-result-item.area {
        border-left-color: #28a745;
      }
      .measure-result-item.height {
        border-left-color: #ffc107;
      }
      .measure-result-label {
        font-size: 12px;
        color: #666;
        margin-bottom: 5px;
      }
      .measure-result-value {
        font-size: 24px;
        font-weight: bold;
        color: #007bff;
        margin: 5px 0;
      }
      .measure-result-item.area .measure-result-value {
        color: #28a745;
      }
      .measure-result-item.height .measure-result-value {
        color: #ffc107;
      }
      .measure-result-detail {
        font-size: 12px;
        color: #666;
        margin-top: 5px;
      }
    `

    document.head.appendChild(style)
    document.body.appendChild(panel)

    return panel
  }

  /**
   * 显示测量结果
   * @param {string} type 测量类型
   * @param {object} result 测量结果
   */
  displayMeasureResult(type, result) {
    const panel = this.createMeasureResultPanel()
    const content = document.getElementById('measureResultContent')

    let html = ''

    if (type === 'distance') {
      const distance = result.distance
      let distanceText =
        distance >= 1000
          ? `${(distance / 1000).toFixed(2)} km`
          : `${distance.toFixed(2)} m`

      html = `
        <div class="measure-result-item">
          <div class="measure-result-label">空间距离</div>
          <div class="measure-result-value">${distanceText}</div>
          <div class="measure-result-detail">${distance.toFixed(3)} 米</div>
        </div>
      `
    } else if (type === 'area') {
      const area = result.area
      let areaText =
        area >= 1000000
          ? `${(area / 1000000).toFixed(2)} km²`
          : area >= 10000
            ? `${(area / 10000).toFixed(2)} 万m²`
            : `${area.toFixed(2)} m²`

      html = `
        <div class="measure-result-item area">
          <div class="measure-result-label">测量面积</div>
          <div class="measure-result-value">${areaText}</div>
          <div class="measure-result-detail">${area.toFixed(3)} 平方米</div>
        </div>
      `
    } else if (type === 'height') {
      html = `
        <div class="measure-result-item height">
          <div class="measure-result-label">垂直高度</div>
          <div class="measure-result-value">${result.verticalHeight ? result.verticalHeight.toFixed(2) : '0.00'} m</div>
          <div class="measure-result-detail">
            水平距离: ${result.horizontalDistance ? result.horizontalDistance.toFixed(2) : '0.00'} m<br>
            空间距离: ${result.distance ? result.distance.toFixed(2) : '0.00'} m
          </div>
        </div>
      `
    }

    // 如果有历史结果，保留前3条
    const existingItems = content.querySelectorAll('.measure-result-item')
    if (existingItems.length >= 3) {
      existingItems[0].remove()
    }

    // 添加新结果
    const hint = content.querySelector('.measure-result-hint')
    if (hint) {
      hint.remove()
    }
    content.insertAdjacentHTML('beforeend', html)

    // 保存结果
    this.measureResults.push({
      type,
      ...result,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * 执行距离测量
   * @param {number} mode 测量模式：0-空间距离，1-水平距离，2-垂直距离
   */
  performDistanceMeasure(mode = 0) {
    try {
      console.log('📏 执行距离测量，模式:', mode)

      // 先停用之前的测量
      if (this.measureHandler) {
        try {
          this.measureHandler.deactivate()
          this.measureHandler.clear()
        } catch (e) {
          console.warn('停用旧测量处理器时出错:', e)
        }
      }

      // 创建新的距离测量处理器
      this.measureHandler = new SuperMap3D.MeasureHandler(
        this.viewer,
        SuperMap3D.MeasureMode.Distance,
        SuperMap3D.ClampMode.Space,
      )

      // 设置测量模式
      if (mode === 1) {
        // 水平距离 - 贴地模式
        this.measureHandler.clampMode = SuperMap3D.ClampMode.Ground
      }

      // 设置十字光标
      this.setCrosshairCursor()

      // 激活测量
      this.measureHandler.activate()

      // 创建结果面板
      this.createMeasureResultPanel()

      // 监听测量完成事件 - 只添加一次
      this.measureHandler.measureEvt.removeAllListeners()
      this.measureHandler.measureEvt.addEventListener((result) => {
        console.log('📏 距离测量结果:', result)

        if (result.distance) {
          const distance = result.distance
          let distanceText = ''

          if (distance >= 1000) {
            distanceText = `${(distance / 1000).toFixed(2)} km`
          } else {
            distanceText = `${distance.toFixed(2)} m`
          }

          // 显示测量结果标签
          this.measureHandler.disLabel.text = distanceText

          // 在面板中显示结果
          this.displayMeasureResult('distance', result)

          // 恢复默认光标
          this.resetCursor()
        }
      })

      this.activeAnalysis = 'distance_measure'
      console.log('✅ 距离测量已激活')

      return true
    } catch (error) {
      console.error('❌ 距离测量失败:', error)
      this.resetCursor()
      return false
    }
  }

  /**
   * 执行面积测量
   * @param {number} mode 测量模式：0-表面面积，1-投影面积
   */
  performAreaMeasure(mode = 0) {
    try {
      console.log('📐 执行面积测量，模式:', mode)

      // 先停用之前的测量
      if (this.measureHandler) {
        try {
          this.measureHandler.deactivate()
          this.measureHandler.clear()
        } catch (e) {
          console.warn('停用旧测量处理器时出错:', e)
        }
      }

      // 创建新的面积测量处理器
      this.measureHandler = new SuperMap3D.MeasureHandler(
        this.viewer,
        SuperMap3D.MeasureMode.Area,
        SuperMap3D.ClampMode.Space,
      )

      // 设置测量模式
      if (mode === 1) {
        // 投影面积 - 贴地模式
        this.measureHandler.clampMode = SuperMap3D.ClampMode.Ground
      }

      // 设置十字光标
      this.setCrosshairCursor()

      // 激活测量
      this.measureHandler.activate()

      // 创建结果面板
      this.createMeasureResultPanel()

      // 监听测量完成事件 - 只添加一次
      this.measureHandler.measureEvt.removeAllListeners()
      this.measureHandler.measureEvt.addEventListener((result) => {
        console.log('📐 面积测量结果:', result)

        if (result.area) {
          const area = result.area
          let areaText = ''

          if (area >= 1000000) {
            areaText = `${(area / 1000000).toFixed(2)} km²`
          } else if (area >= 10000) {
            areaText = `${(area / 10000).toFixed(2)} 万m²`
          } else {
            areaText = `${area.toFixed(2)} m²`
          }

          // 显示测量结果标签
          this.measureHandler.areaLabel.text = areaText

          // 在面板中显示结果
          this.displayMeasureResult('area', result)

          // 恢复默认光标
          this.resetCursor()
        }
      })

      this.activeAnalysis = 'area_measure'
      console.log('✅ 面积测量已激活')

      return true
    } catch (error) {
      console.error('❌ 面积测量失败:', error)
      this.resetCursor()
      return false
    }
  }

  /**
   * 执行高度测量（DVH）
   */
  performHeightMeasure() {
    try {
      console.log('📊 执行高度测量')

      // 先停用之前的测量
      if (this.measureHandler) {
        try {
          this.measureHandler.deactivate()
          this.measureHandler.clear()
        } catch (e) {
          console.warn('停用旧测量处理器时出错:', e)
        }
      }

      // 创建新的高度测量处理器（DVH模式）
      this.measureHandler = new SuperMap3D.MeasureHandler(
        this.viewer,
        SuperMap3D.MeasureMode.DVH,
        SuperMap3D.ClampMode.Space,
      )

      // 设置十字光标
      this.setCrosshairCursor()

      // 激活测量
      this.measureHandler.activate()

      // 创建结果面板
      this.createMeasureResultPanel()

      // 监听测量完成事件 - 只添加一次
      this.measureHandler.measureEvt.removeAllListeners()
      this.measureHandler.measureEvt.addEventListener((result) => {
        console.log('📊 高度测量结果:', result)

        if (result) {
          let resultText = ''

          // 显示垂直高度
          if (result.verticalHeight) {
            resultText += `垂直高度: ${result.verticalHeight.toFixed(2)} m\n`
          }

          // 显示水平距离
          if (result.horizontalDistance) {
            resultText += `水平距离: ${result.horizontalDistance.toFixed(2)} m\n`
          }

          // 显示总距离
          if (result.distance) {
            resultText += `空间距离: ${result.distance.toFixed(2)} m`
          }

          // 显示测量结果标签
          this.measureHandler.vLabel.text = resultText

          // 在面板中显示结果
          this.displayMeasureResult('height', result)

          // 恢复默认光标
          this.resetCursor()
        }
      })

      this.activeAnalysis = 'height_measure'
      console.log('✅ 高度测量已激活')

      return true
    } catch (error) {
      console.error('❌ 高度测量失败:', error)
      this.resetCursor()
      return false
    }
  }

  /**
   * 清除测量结果
   * @param {string} measureType 要清除的测量类型：all, distance, area, height
   */
  clearMeasurements(measureType = 'all') {
    try {
      console.log('🗑️ 清除测量结果，类型:', measureType)

      // 恢复光标
      this.resetCursor()

      // 停用测量处理器
      if (this.measureHandler) {
        this.measureHandler.deactivate()
        this.measureHandler.clear()
      }

      // 清除测量实体
      if (this.measureEntities && this.measureEntities.length > 0) {
        this.measureEntities.forEach((entity) => {
          try {
            if (this.viewer.entities.contains(entity)) {
              this.viewer.entities.remove(entity)
            }
          } catch (e) {
            console.warn('清除测量实体时出错:', e)
          }
        })
        this.measureEntities = []
      }

      // 清除测量结果
      if (measureType === 'all') {
        this.measureResults = []
        // 隐藏测量结果面板
        const panel = document.getElementById('measureResultPanel')
        if (panel) {
          panel.style.display = 'none'
        }
      } else {
        this.measureResults = this.measureResults.filter(
          (result) => result.type !== measureType,
        )
      }

      this.activeAnalysis = null
      console.log('✅ 测量结果已清除')

      return true
    } catch (error) {
      console.error('❌ 清除测量失败:', error)
      return false
    }
  }
        SuperMap3D.ClampMode.None,
      )

      // 设置测量模式
      if (mode === 1) {
        // 投影面积 - 贴地
        this.measureHandler.clampMode = SuperMap3D.ClampMode.Ground
      }

      // 设置十字光标
      this.setCrosshairCursor()

      // 激活测量
      this.measureHandler.activate()

      // 创建结果面板
      this.createMeasureResultPanel()

      // 监听测量完成事件
      this.measureHandler.measureEvt.addEventListener((result) => {
        console.log('📐 面积测量结果:', result)

        if (result.area) {
          const area = result.area
          let areaText = ''

          if (area >= 1000000) {
            areaText = `${(area / 1000000).toFixed(2)} km²`
          } else if (area >= 10000) {
            areaText = `${(area / 10000).toFixed(2)} 万m²`
          } else {
            areaText = `${area.toFixed(2)} m²`
          }

          // 显示测量结果标签
          this.measureHandler.areaLabel.text = areaText

          // 在面板中显示结果
          this.displayMeasureResult('area', result)

          // 恢复默认光标
          this.resetCursor()
        }
      })

      this.activeAnalysis = 'area_measure'
      console.log('✅ 面积测量已激活')

      return true
    } catch (error) {
      console.error('❌ 面积测量失败:', error)
      this.resetCursor()
      return false
    }
  }

  /**
   * 执行高度测量（DVH）
   */
  performHeightMeasure() {
    try {
      console.log('📊 执行高度测量')

      // 清除之前的测量
      this.clearMeasurements('all')

      if (!this.measureHandler) {
        if (!this.initMeasureAnalysis()) {
          throw new Error('测量分析初始化失败')
        }
      }

      // 设置测量模式为DVH（距离、垂直高度、水平距离）
      this.measureHandler = new SuperMap3D.MeasureHandler(
        this.viewer,
        SuperMap3D.MeasureMode.DVH,
        SuperMap3D.ClampMode.None,
      )

      // 设置十字光标
      this.setCrosshairCursor()

      // 激活测量
      this.measureHandler.activate()

      // 创建结果面板
      this.createMeasureResultPanel()

      // 监听测量完成事件
      this.measureHandler.measureEvt.addEventListener((result) => {
        console.log('📊 高度测量结果:', result)

        if (result) {
          let resultText = ''

          // 显示垂直高度
          if (result.verticalHeight) {
            resultText += `垂直高度: ${result.verticalHeight.toFixed(2)} m\n`
          }

          // 显示水平距离
          if (result.horizontalDistance) {
            resultText += `水平距离: ${result.horizontalDistance.toFixed(2)} m\n`
          }

          // 显示总距离
          if (result.distance) {
            resultText += `空间距离: ${result.distance.toFixed(2)} m`
          }

          // 显示测量结果标签
          this.measureHandler.vLabel.text = resultText

          // 在面板中显示结果
          this.displayMeasureResult('height', result)

          // 恢复默认光标
          this.resetCursor()
        }
      })

      this.activeAnalysis = 'height_measure'
      console.log('✅ 高度测量已激活')

      return true
    } catch (error) {
      console.error('❌ 高度测量失败:', error)
      this.resetCursor()
      return false
    }
  }

  /**
   * 清除测量结果
   * @param {string} measureType 要清除的测量类型：all, distance, area, height
   */
  clearMeasurements(measureType = 'all') {
    try {
      console.log('🗑️ 清除测量结果，类型:', measureType)

      // 恢复光标
      this.resetCursor()

      // 停用测量处理器
      if (this.measureHandler) {
        this.measureHandler.deactivate()
        this.measureHandler.clear()
      }

      // 清除测量实体
      if (this.measureEntities && this.measureEntities.length > 0) {
        this.measureEntities.forEach((entity) => {
          try {
            if (this.viewer.entities.contains(entity)) {
              this.viewer.entities.remove(entity)
            }
          } catch (e) {
            console.warn('清除测量实体时出错:', e)
          }
        })
        this.measureEntities = []
      }

      // 清除测量结果
      if (measureType === 'all') {
        this.measureResults = []
        // 隐藏测量结果面板
        const panel = document.getElementById('measureResultPanel')
        if (panel) {
          panel.style.display = 'none'
        }
      } else {
        this.measureResults = this.measureResults.filter(
          (result) => result.type !== measureType,
        )
      }

      this.activeAnalysis = null
      console.log('✅ 测量结果已清除')

      return true
    } catch (error) {
      console.error('❌ 清除测量失败:', error)
      return false
    }
  }

  /**
   * 智能选择观察点
   * 自动在模型上选择合适的位置作为观察点，而不是使用相机位置
   * @returns {Promise<SuperMap3D.Cartesian3>} 选择的观察点位置
   */
  async selectOptimalViewPoint() {
    try {
      console.log('🎯 开始智能选择模型表面观察点...')

      // 方法1: 优先使用精确拾取方法
      console.log('尝试使用精确拾取方法...')
      const precisePickResult = await this.findModelPositionByPrecisePicking()
      if (precisePickResult && this.isValidPosition(precisePickResult)) {
        console.log('✅ 精确拾取成功找到模型表面位置:', precisePickResult)

        // 如果拾取到的是模型表面，直接使用该位置作为观察点
        // 只添加少量高度偏移以确保观察点在模型表面上方
        const finalHeight = precisePickResult.height + 1.8 // 人眼高度偏移
        const optimalPoint = {
          longitude: precisePickResult.longitude,
          latitude: precisePickResult.latitude,
          height: finalHeight,
        }

        // 创建Cartesian3坐标用于标记
        const optimalViewPointCartesian = SuperMap3D.Cartesian3.fromDegrees(
          optimalPoint.longitude,
          optimalPoint.latitude,
          optimalPoint.height,
        )

        // 添加观察点标记
        this.addViewPointMarker(optimalViewPointCartesian, '模型表面观察点')

        console.log('🎯 使用模型表面拾取结果，观察点位置:', optimalPoint)
        return optimalPoint
      }

      // 方法2: 查找场景中的模型位置
      console.log('尝试查找场景中的模型位置...')
      const modelPosition = await this.findModelPosition()
      if (modelPosition && this.isValidPosition(modelPosition)) {
        console.log('✅ 成功找到模型位置:', modelPosition)

        // 在模型位置基础上设置观察点，使用较小的高度偏移
        const observationHeight = modelPosition.height + 1.8 // 只添加人眼高度
        const optimalPoint = {
          longitude: modelPosition.longitude,
          latitude: modelPosition.latitude,
          height: observationHeight,
        }

        // 创建Cartesian3坐标用于标记
        const optimalViewPointCartesian = SuperMap3D.Cartesian3.fromDegrees(
          optimalPoint.longitude,
          optimalPoint.latitude,
          optimalPoint.height,
        )

        // 添加观察点标记
        this.addViewPointMarker(optimalViewPointCartesian, '模型位置观察点')

        return optimalPoint
      }

      // 方法3: 使用改进的屏幕采样方法
      console.log('尝试使用改进的屏幕采样方法...')
      const samplingResult = await this.findViewPointBySampling()
      if (samplingResult && this.isValidPosition(samplingResult)) {
        console.log('✅ 屏幕采样成功找到观察点:', samplingResult)

        // 创建Cartesian3坐标用于标记
        const optimalViewPointCartesian = SuperMap3D.Cartesian3.fromDegrees(
          samplingResult.longitude,
          samplingResult.latitude,
          samplingResult.height,
        )

        // 添加观察点标记
        this.addViewPointMarker(optimalViewPointCartesian, '采样观察点')

        return samplingResult
      }

      // 方法4: 使用相机位置附近的智能点
      console.log('使用相机位置附近的智能观察点...')
      const cameraPosition = this.viewer.camera.position
      const cameraCartographic =
        SuperMap3D.Cartographic.fromCartesian(cameraPosition)

      if (cameraCartographic) {
        const longitude = SuperMap3D.Math.toDegrees(
          cameraCartographic.longitude,
        )
        const latitude = SuperMap3D.Math.toDegrees(cameraCartographic.latitude)

        // 使用相机高度的合理比例，确保观察点在合适的高度
        let observationHeight
        if (cameraCartographic.height > 1000) {
          observationHeight = Math.max(cameraCartographic.height * 0.3, 100)
        } else if (cameraCartographic.height > 500) {
          observationHeight = Math.max(cameraCartographic.height * 0.5, 80)
        } else {
          observationHeight = Math.max(cameraCartographic.height * 0.8, 50)
        }

        // 添加小范围偏移以避免与相机位置重叠
        const offsetRange = 0.001 // 约100米范围
        const finalLon = longitude + (Math.random() - 0.5) * offsetRange
        const finalLat = latitude + (Math.random() - 0.5) * offsetRange

        const intelligentPoint = {
          longitude: finalLon,
          latitude: finalLat,
          height: observationHeight,
        }

        console.log('✅ 使用智能相机附近观察点:', intelligentPoint)

        // 创建Cartesian3坐标用于标记
        const intelligentViewPointCartesian = SuperMap3D.Cartesian3.fromDegrees(
          intelligentPoint.longitude,
          intelligentPoint.latitude,
          intelligentPoint.height,
        )

        // 添加观察点标记
        this.addViewPointMarker(intelligentViewPointCartesian, '智能相机观察点')

        return intelligentPoint
      }

      // 最后的备用方案：使用固定的默认点
      throw new Error('无法获取相机位置，使用默认观察点')
    } catch (error) {
      console.error('❌ 智能选择观察点失败:', error)

      // 返回默认观察点（当前视野中心的合理高度）
      const defaultPoint = {
        longitude: 116.4074, // 北京市中心
        latitude: 39.9042,
        height: 150, // 150米高度
      }

      console.log('使用默认观察点:', defaultPoint)

      // 创建Cartesian3坐标用于标记
      const defaultViewPointCartesian = SuperMap3D.Cartesian3.fromDegrees(
        defaultPoint.longitude,
        defaultPoint.latitude,
        defaultPoint.height,
      )

      // 添加观察点标记
      this.addViewPointMarker(defaultViewPointCartesian, '默认观察点')

      return defaultPoint
    }
  }

  /**
   * 验证位置是否有效
   * @param {Object} position 位置对象
   * @returns {boolean} 是否有效
   */
  isValidPosition(position) {
    if (!position || typeof position !== 'object') {
      return false
    }

    const { longitude, latitude, height } = position

    // 检查经纬度范围
    if (isNaN(longitude) || longitude < -180 || longitude > 180) {
      return false
    }

    if (isNaN(latitude) || latitude < -90 || latitude > 90) {
      return false
    }

    // 检查高度范围（允许合理的负高度值，如地下建筑或海平面以下的模型）
    if (isNaN(height) || height < -1000 || height > 10000) {
      return false
    }

    return true
  }

  /**
   * 通过屏幕采样查找观察点
   * @returns {Promise<Object|null>} 观察点位置
   */
  async findViewPointBySampling() {
    try {
      console.log('🔍 开始屏幕采样查找观察点...')

      if (!this.scene.pickPositionSupported) {
        console.log('场景不支持pickPosition，跳过屏幕采样')
        return null
      }

      const canvas = this.scene.canvas
      const centerX = canvas.clientWidth / 2
      const centerY = canvas.clientHeight / 2

      // 优化的采样策略：从中心向外扩散
      const samplePoints = []

      // 中心点
      samplePoints.push({ x: centerX, y: centerY, priority: 1 })

      // 中心区域密集采样
      for (let radius = 50; radius <= 300; radius += 50) {
        const angleStep = Math.max(15, 360 / (radius / 25))
        for (let angle = 0; angle < 360; angle += angleStep) {
          const x = centerX + radius * Math.cos((angle * Math.PI) / 180)
          const y = centerY + radius * Math.sin((angle * Math.PI) / 180)

          if (
            x >= 0 &&
            x < canvas.clientWidth &&
            y >= 0 &&
            y < canvas.clientHeight
          ) {
            samplePoints.push({ x, y, priority: 2 })
          }
        }
      }

      // 按优先级排序
      samplePoints.sort((a, b) => a.priority - b.priority)

      console.log(`生成了 ${samplePoints.length} 个采样点`)

      let bestResult = null
      let bestScore = -1

      for (const point of samplePoints) {
        try {
          const windowPosition = new SuperMap3D.Cartesian2(point.x, point.y)

          // 先尝试pick检测是否有对象
          const pickedObject = this.scene.pick(windowPosition)
          const hasObject = SuperMap3D.defined(pickedObject)

          // 使用pickPosition获取位置
          const pickedPosition = this.scene.pickPosition(windowPosition)
          if (pickedPosition && SuperMap3D.defined(pickedPosition.x)) {
            const cartographic =
              SuperMap3D.Cartographic.fromCartesian(pickedPosition)

            if (
              cartographic &&
              !isNaN(cartographic.height) &&
              cartographic.height > 0
            ) {
              const result = {
                longitude: SuperMap3D.Math.toDegrees(cartographic.longitude),
                latitude: SuperMap3D.Math.toDegrees(cartographic.latitude),
                height: cartographic.height + 1.8, // 添加人眼高度
                hasObject: hasObject,
                priority: point.priority,
              }

              // 计算评分：有对象的点优先，高度合理的点优先
              let score = 0
              if (hasObject) score += 100
              if (result.height > 10 && result.height < 500) score += 50
              if (point.priority === 1) score += 30 // 中心点优先
              score += Math.max(0, 20 - Math.abs(result.height - 50)) // 偏好50米左右高度

              if (score > bestScore) {
                bestScore = score
                bestResult = result
                console.log('找到更好的采样点:', result, '评分:', score)
              }
            }
          }
        } catch (pickError) {
          // 继续尝试下一个采样点
          continue
        }
      }

      if (bestResult) {
        console.log('✅ 屏幕采样成功，最佳观察点:', bestResult)
        return bestResult
      } else {
        console.log('屏幕采样未找到合适的观察点')
        return null
      }
    } catch (error) {
      console.warn('屏幕采样查找观察点时出错:', error)
      return null
    }
  }

  /**
   * 基于相机视野选择观察点
   * @returns {Promise<Object>} 观察点位置
   */
  async selectOptimalViewPointByCamera() {
    try {
      const camera = this.viewer.camera
      const cameraCartographic = camera.positionCartographic

      // 获取相机当前位置
      const cameraLongitude = SuperMap3D.Math.toDegrees(
        cameraCartographic.longitude,
      )
      const cameraLatitude = SuperMap3D.Math.toDegrees(
        cameraCartographic.latitude,
      )
      const cameraHeight = cameraCartographic.height

      console.log('相机当前位置:', {
        longitude: cameraLongitude,
        latitude: cameraLatitude,
        height: cameraHeight,
      })

      // 计算合适的观察高度
      let observationHeight

      if (cameraHeight > 1000) {
        // 相机较高时，选择中等高度
        observationHeight = Math.max(100, cameraHeight * 0.3)
      } else if (cameraHeight > 200) {
        // 相机中等高度时，稍微降低
        observationHeight = Math.max(80, cameraHeight * 0.8)
      } else {
        // 相机较低时，保持适当高度
        observationHeight = Math.max(50, cameraHeight + 30)
      }

      // 限制观察高度在合理范围内
      observationHeight = Math.min(observationHeight, 2000)

      const optimalPoint = {
        longitude: cameraLongitude,
        latitude: cameraLatitude,
        height: observationHeight,
      }

      console.log('基于相机视野计算的观察点:', optimalPoint)
      return optimalPoint
    } catch (error) {
      console.warn('基于相机视野选择观察点失败:', error)
      return null
    }
  }

  /**
   * 获取最终回退观察点
   * @returns {Object} 回退观察点
   */
  getFinalFallbackViewPoint() {
    try {
      const camera = this.viewer.camera
      const cameraCartographic = camera.positionCartographic

      const fallbackPoint = {
        longitude: SuperMap3D.Math.toDegrees(cameraCartographic.longitude),
        latitude: SuperMap3D.Math.toDegrees(cameraCartographic.latitude),
        height: Math.max(100, Math.min(500, cameraCartographic.height * 0.6)),
      }

      console.log('🔄 使用最终回退观察点:', fallbackPoint)

      // 创建Cartesian3坐标用于标记
      const fallbackViewPointCartesian = SuperMap3D.Cartesian3.fromDegrees(
        fallbackPoint.longitude,
        fallbackPoint.latitude,
        fallbackPoint.height,
      )

      // 添加观察点标记
      this.addViewPointMarker(fallbackViewPointCartesian, '回退观察点')

      return fallbackPoint
    } catch (error) {
      console.error('获取最终回退观察点失败:', error)
      // 绝对最后的默认位置
      return {
        longitude: 116.3974, // 北京经度
        latitude: 39.9093, // 北京纬度
        height: 200,
      }
    }
  }

  /**
   * 通过精确拾取找到模型表面位置（模拟手动操作）
   * @returns {Promise<Object|null>} 模型表面位置信息
   */
  async findModelPositionByPrecisePicking() {
    try {
      console.log('🎯 使用精确拾取方式查找模型表面...')

      if (!this.scene.pickPositionSupported) {
        console.log('场景不支持pickPosition，跳过精确拾取')
        return null
      }

      const canvas = this.scene.canvas
      const centerX = canvas.clientWidth / 2
      const centerY = canvas.clientHeight / 2

      // 改进的采样策略：优先检测模型对象
      const samplePoints = []

      // 策略1: 中心区域密集采样（优先级最高）
      for (let radius = 0; radius <= 150; radius += 20) {
        const angleStep = radius === 0 ? 360 : Math.max(20, 360 / (radius / 20))
        for (let angle = 0; angle < 360; angle += angleStep) {
          const x = centerX + radius * Math.cos((angle * Math.PI) / 180)
          const y = centerY + radius * Math.sin((angle * Math.PI) / 180)

          if (
            x >= 0 &&
            x < canvas.clientWidth &&
            y >= 0 &&
            y < canvas.clientHeight
          ) {
            samplePoints.push({ x, y, strategy: 'center', priority: 1 })
          }
        }
      }

      // 策略2: 网格采样（中等优先级）
      const gridSize = 30
      for (let x = gridSize; x < canvas.clientWidth; x += gridSize) {
        for (let y = gridSize; y < canvas.clientHeight; y += gridSize) {
          samplePoints.push({ x, y, strategy: 'grid', priority: 2 })
        }
      }

      // 按优先级排序
      samplePoints.sort((a, b) => a.priority - b.priority)

      console.log(`生成了 ${samplePoints.length} 个采样点进行精确拾取`)

      let bestResult = null
      let modelResults = []
      let terrainResults = []

      for (const point of samplePoints) {
        try {
          const windowPosition = new SuperMap3D.Cartesian2(point.x, point.y)

          // 优先检测模型对象
          const pickedObject = this.scene.pick(windowPosition)
          if (SuperMap3D.defined(pickedObject)) {
            // 检查是否是3D模型对象
            const isModel = this.isModelObject(pickedObject)
            console.log(
              `拾取到${isModel ? '模型' : '其他'}对象 (${point.strategy}):`,
              pickedObject.id?._name ||
                pickedObject.primitive?.constructor?.name ||
                '未知对象',
            )

            // 如果是模型对象，尝试多种方式获取位置
            if (isModel) {
              let modelPosition = null

              // 方法1: 使用pickPosition获取精确位置
              try {
                modelPosition = this.scene.pickPosition(windowPosition)
                if (modelPosition && SuperMap3D.defined(modelPosition.x)) {
                  console.log('✅ pickPosition成功获取模型位置:', modelPosition)
                }
              } catch (e) {
                console.warn('pickPosition失败:', e)
              }

              // 方法2: 如果pickPosition失败，尝试使用相机射线投射
              if (!modelPosition || !SuperMap3D.defined(modelPosition.x)) {
                try {
                  const ray = this.viewer.camera.getPickRay(windowPosition)
                  if (ray) {
                    // 尝试与场景求交
                    const intersection = this.scene.globe.pick(ray, this.scene)
                    if (intersection) {
                      modelPosition = intersection
                      console.log('✅ 射线投射获取位置:', modelPosition)
                    }
                  }
                } catch (e) {
                  console.warn('射线投射失败:', e)
                }
              }

              // 方法3: 如果以上都失败，尝试使用drillPick获取深度信息
              if (!modelPosition || !SuperMap3D.defined(modelPosition.x)) {
                try {
                  const drillPickResults = this.scene.drillPick(windowPosition)
                  if (drillPickResults && drillPickResults.length > 0) {
                    for (const drillResult of drillPickResults) {
                      if (this.isModelObject(drillResult)) {
                        const drillPosition =
                          this.scene.pickPosition(windowPosition)
                        if (
                          drillPosition &&
                          SuperMap3D.defined(drillPosition.x)
                        ) {
                          modelPosition = drillPosition
                          console.log(
                            '✅ drillPick获取模型位置:',
                            modelPosition,
                          )
                          break
                        }
                      }
                    }
                  }
                } catch (e) {
                  console.warn('drillPick失败:', e)
                }
              }

              // 如果获取到了有效的模型位置
              if (modelPosition && SuperMap3D.defined(modelPosition.x)) {
                const cartographic =
                  SuperMap3D.Cartographic.fromCartesian(modelPosition)

                if (
                  cartographic &&
                  !isNaN(cartographic.height) &&
                  cartographic.height > -1000
                ) {
                  const result = {
                    longitude: SuperMap3D.Math.toDegrees(
                      cartographic.longitude,
                    ),
                    latitude: SuperMap3D.Math.toDegrees(cartographic.latitude),
                    height: cartographic.height,
                    strategy: point.strategy,
                    hasObject: true,
                    isModel: true,
                    objectType:
                      pickedObject.id?._name ||
                      pickedObject.primitive?.constructor?.name ||
                      'model',
                  }

                  modelResults.push(result)
                  console.log('✅ 找到模型表面位置:', result)

                  // 如果找到模型表面且高度合理，立即返回
                  // 允许负高度值，因为模型可能位于海平面以下
                  if (
                    cartographic.height > -1000 &&
                    !isNaN(cartographic.height)
                  ) {
                    console.log(
                      '🎯 立即使用模型表面位置，高度:',
                      cartographic.height,
                    )
                    return result
                  }
                } else {
                  console.warn('模型位置坐标转换失败或高度异常:', cartographic)
                }
              } else {
                console.warn('无法获取模型的精确位置')
              }
            } else {
              // 非模型对象，使用原有逻辑
              const modelPosition = this.scene.pickPosition(windowPosition)
              if (modelPosition && SuperMap3D.defined(modelPosition.x)) {
                const cartographic =
                  SuperMap3D.Cartographic.fromCartesian(modelPosition)

                if (
                  cartographic &&
                  !isNaN(cartographic.height) &&
                  cartographic.height > -1000
                ) {
                  const result = {
                    longitude: SuperMap3D.Math.toDegrees(
                      cartographic.longitude,
                    ),
                    latitude: SuperMap3D.Math.toDegrees(cartographic.latitude),
                    height: cartographic.height,
                    strategy: point.strategy,
                    hasObject: true,
                    isModel: false,
                    objectType:
                      pickedObject.primitive?.constructor?.name || 'terrain',
                  }

                  terrainResults.push(result)
                }
              }
            }
          }
        } catch (pickError) {
          // 继续尝试下一个采样点
          continue
        }
      }

      console.log(
        `精确拾取找到 ${modelResults.length} 个模型位置, ${terrainResults.length} 个地形位置`,
      )

      // 优先返回模型结果
      if (modelResults.length > 0) {
        bestResult = modelResults.reduce((best, current) =>
          current.height > best.height ? current : best,
        )
        console.log('✅ 使用模型表面位置:', bestResult)
        return bestResult
      }

      // 如果没有模型结果，使用地形结果
      if (terrainResults.length > 0) {
        bestResult = terrainResults.reduce((best, current) => {
          const currentScore = Math.abs(current.height - 20) // 偏好20米左右的高度
          const bestScore = Math.abs(best.height - 20)
          return currentScore < bestScore ? current : best
        })
        console.log('使用地形位置:', bestResult)
        return bestResult
      }

      console.log('精确拾取未找到合适的模型表面位置')
      return null
    } catch (error) {
      console.warn('精确拾取模型表面位置时出错:', error)
      return null
    }
  }

  /**
   * 判断拾取的对象是否为3D模型
   * @param {Object} pickedObject 拾取的对象
   * @returns {boolean} 是否为模型对象
   */
  isModelObject(pickedObject) {
    if (!pickedObject) {
      return false
    }

    // 检查是否有id属性且包含模型特征
    if (pickedObject.id) {
      const id = pickedObject.id

      // 检查id的名称是否包含模型文件扩展名
      if (id._name && typeof id._name === 'string') {
        const name = id._name.toLowerCase()
        const modelExtensions = [
          '.glb',
          '.gltf',
          '.b3dm',
          '.i3dm',
          '.pnts',
          '.cmpt',
        ]
        if (modelExtensions.some((ext) => name.includes(ext))) {
          console.log('✅ 通过文件扩展名识别为模型对象:', name)
          return true
        }
      }

      // 检查id的构造函数名称
      const idConstructorName = id.constructor?.name || ''
      if (
        idConstructorName.includes('Cesium3DTile') ||
        idConstructorName.includes('Tile')
      ) {
        console.log('✅ 通过构造函数名识别为3D Tiles模型:', idConstructorName)
        return true
      }
    }

    // 检查primitive属性
    if (pickedObject.primitive) {
      const primitive = pickedObject.primitive
      const constructorName = primitive.constructor.name

      // 检查是否为3D模型相关的对象类型
      const modelTypes = [
        'Cesium3DTileset',
        'Model',
        'ModelPrimitive',
        'Primitive',
        'GroundPrimitive',
        'ClassificationPrimitive',
      ]

      if (modelTypes.some((type) => constructorName.includes(type))) {
        console.log('✅ 通过primitive类型识别为模型对象:', constructorName)
        return true
      }
    }

    // 检查是否为3D Tiles的特殊情况
    if (pickedObject.content || pickedObject.tile) {
      console.log('✅ 通过content/tile属性识别为3D Tiles模型')
      return true
    }

    console.log('❌ 未识别为模型对象:', {
      hasId: !!pickedObject.id,
      idName: pickedObject.id?._name,
      idConstructor: pickedObject.id?.constructor?.name,
      hasPrimitive: !!pickedObject.primitive,
      primitiveConstructor: pickedObject.primitive?.constructor?.name,
      hasContent: !!pickedObject.content,
      hasTile: !!pickedObject.tile,
    })

    return false
  }

  /**
   * 查找场景中的模型位置
   * @returns {Promise<Object|null>} 模型位置信息
   */
  async findModelPosition() {
    try {
      console.log('🔍 搜索场景中的模型...')

      // 方法1: 检查场景中的primitives（3D Tiles等）
      const modelBounds = this.getModelBoundsFromPrimitives()
      if (modelBounds) {
        console.log('从primitives找到模型边界:', modelBounds)
        return this.calculateModelCenter(modelBounds)
      }

      // 方法2: 检查entities中的模型
      const entityModel = this.getModelFromEntities()
      if (entityModel) {
        console.log('从entities找到模型:', entityModel)
        return entityModel
      }

      // 方法3: 使用射线检测找到模型表面
      const raycastResult = await this.findModelBySampling()
      if (raycastResult) {
        console.log('通过射线检测找到模型:', raycastResult)
        return raycastResult
      }

      console.log('未找到场景中的模型')
      return null
    } catch (error) {
      console.warn('查找模型位置时出错:', error)
      return null
    }
  }

  /**
   * 从primitives中获取模型边界
   * @returns {Object|null} 模型边界信息
   */
  getModelBoundsFromPrimitives() {
    try {
      const primitives = this.scene.primitives

      for (let i = 0; i < primitives.length; i++) {
        const primitive = primitives.get(i)

        // 检查3D Tiles
        if (
          primitive instanceof SuperMap3D.Cesium3DTileset &&
          primitive.boundingSphere
        ) {
          const boundingSphere = primitive.boundingSphere
          const center = boundingSphere.center

          if (
            center &&
            SuperMap3D.defined(center.x) &&
            SuperMap3D.defined(center.y) &&
            SuperMap3D.defined(center.z)
          ) {
            return {
              center: center,
              radius: boundingSphere.radius,
            }
          }
        }

        // 检查其他类型的primitive
        if (primitive.boundingSphere && primitive.boundingSphere.center) {
          const center = primitive.boundingSphere.center
          if (
            center &&
            SuperMap3D.defined(center.x) &&
            SuperMap3D.defined(center.y) &&
            SuperMap3D.defined(center.z)
          ) {
            return {
              center: center,
              radius: primitive.boundingSphere.radius || 100,
            }
          }
        }
      }

      return null
    } catch (error) {
      console.warn('获取primitives模型边界时出错:', error)
      return null
    }
  }

  /**
   * 从entities中获取模型
   * @returns {Object|null} 模型位置信息
   */
  getModelFromEntities() {
    try {
      const entities = this.viewer.entities.values

      for (const entity of entities) {
        // 检查是否有模型组件
        if (entity.model && entity.position) {
          const position = entity.position.getValue(
            this.viewer.clock.currentTime,
          )
          if (position) {
            const cartographic = SuperMap3D.Cartographic.fromCartesian(position)
            return {
              longitude: SuperMap3D.Math.toDegrees(cartographic.longitude),
              latitude: SuperMap3D.Math.toDegrees(cartographic.latitude),
              height: cartographic.height,
            }
          }
        }

        // 检查是否有建筑物或其他几何体
        if (
          (entity.polygon ||
            entity.polyline ||
            entity.box ||
            entity.cylinder) &&
          entity.position
        ) {
          const position = entity.position.getValue(
            this.viewer.clock.currentTime,
          )
          if (position) {
            const cartographic = SuperMap3D.Cartographic.fromCartesian(position)
            return {
              longitude: SuperMap3D.Math.toDegrees(cartographic.longitude),
              latitude: SuperMap3D.Math.toDegrees(cartographic.latitude),
              height: cartographic.height,
            }
          }
        }
      }

      return null
    } catch (error) {
      console.warn('获取entities模型时出错:', error)
      return null
    }
  }

  /**
   * 通过采样方式查找模型
   * @returns {Promise<Object|null>} 模型位置信息
   */
  async findModelBySampling() {
    try {
      if (!this.scene.pickPositionSupported) {
        console.log('场景不支持pickPosition，跳过射线检测')
        return null
      }

      const camera = this.viewer.camera
      const canvas = this.scene.canvas

      // 在屏幕中心区域进行采样
      const centerX = canvas.clientWidth / 2
      const centerY = canvas.clientHeight / 2
      const sampleRadius = 100 // 采样半径

      const samplePoints = [
        { x: centerX, y: centerY },
        { x: centerX - sampleRadius, y: centerY },
        { x: centerX + sampleRadius, y: centerY },
        { x: centerX, y: centerY - sampleRadius },
        { x: centerX, y: centerY + sampleRadius },
      ]

      for (const point of samplePoints) {
        try {
          const pickedPosition = this.scene.pickPosition(
            new SuperMap3D.Cartesian2(point.x, point.y),
          )

          if (pickedPosition && SuperMap3D.defined(pickedPosition.x)) {
            // 检查这个位置是否在地面以上（可能是模型）
            const cartographic =
              SuperMap3D.Cartographic.fromCartesian(pickedPosition)

            if (cartographic.height > 10) {
              // 高度大于10米，可能是模型
              console.log('通过射线检测找到可能的模型位置:', {
                longitude: SuperMap3D.Math.toDegrees(cartographic.longitude),
                latitude: SuperMap3D.Math.toDegrees(cartographic.latitude),
                height: cartographic.height,
              })

              return {
                longitude: SuperMap3D.Math.toDegrees(cartographic.longitude),
                latitude: SuperMap3D.Math.toDegrees(cartographic.latitude),
                height: cartographic.height,
              }
            }
          }
        } catch (pickError) {
          // 继续尝试下一个采样点
          continue
        }
      }

      return null
    } catch (error) {
      console.warn('射线检测查找模型时出错:', error)
      return null
    }
  }

  /**
   * 计算模型中心位置
   * @param {Object} bounds 模型边界
   * @returns {Object} 模型中心位置
   */
  calculateModelCenter(bounds) {
    try {
      const center = bounds.center
      console.log('模型边界中心点:', center)

      // 检查center是否是有效的Cartesian3坐标
      if (
        !center ||
        !SuperMap3D.defined(center.x) ||
        !SuperMap3D.defined(center.y) ||
        !SuperMap3D.defined(center.z)
      ) {
        console.warn('模型边界中心点无效')
        return this.getFallbackPosition()
      }

      // 检查坐标值是否合理（避免极大或极小的值）
      const magnitude = SuperMap3D.Cartesian3.magnitude(center)
      console.log('模型边界中心点magnitude:', magnitude)

      // 如果magnitude太小，说明这是局部坐标系的坐标，不是世界坐标
      if (magnitude < 6000000) {
        // 地球半径约6371000米，如果小于6000000说明是局部坐标
        console.warn(
          '检测到局部坐标系坐标，magnitude:',
          magnitude,
          '使用相机位置作为参考',
        )
        return this.getFallbackPosition()
      }

      // 如果magnitude过大，也可能是异常坐标
      if (magnitude > 20000000) {
        console.warn('模型边界中心点坐标值过大，magnitude:', magnitude)
        return this.getFallbackPosition()
      }

      console.log('✅ 模型边界中心点坐标值正常，magnitude:', magnitude)

      // 尝试多种方式进行坐标转换
      let cartographic = null

      try {
        // 方法1：直接转换
        cartographic = SuperMap3D.Cartographic.fromCartesian(center)
      } catch (e) {
        console.warn('直接坐标转换失败:', e)
      }

      // 如果直接转换失败，尝试使用椭球体转换
      if (!cartographic || isNaN(cartographic.height)) {
        try {
          cartographic = SuperMap3D.Cartographic.fromCartesian(
            center,
            SuperMap3D.Ellipsoid.WGS84,
          )
          console.log('使用WGS84椭球体转换成功')
        } catch (e) {
          console.warn('WGS84椭球体转换失败:', e)
        }
      }

      // 检查转换后的坐标是否合理
      if (
        !cartographic ||
        isNaN(cartographic.longitude) ||
        isNaN(cartographic.latitude) ||
        isNaN(cartographic.height)
      ) {
        console.warn('坐标转换结果无效，使用回退位置')
        return this.getFallbackPosition()
      }

      const longitude = SuperMap3D.Math.toDegrees(cartographic.longitude)
      const latitude = SuperMap3D.Math.toDegrees(cartographic.latitude)
      let height = cartographic.height

      // 检查经纬度是否在合理范围内
      if (
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90
      ) {
        console.warn('经纬度超出有效范围:', { longitude, latitude, height })
        return this.getFallbackPosition()
      }

      // 检查高度是否合理（避免极端值）
      if (height < -1000 || height > 50000 || isNaN(height)) {
        console.warn('高度值异常:', height, '使用地面高度估算')

        // 尝试获取地面高度
        try {
          const groundHeight = this.estimateGroundHeight(longitude, latitude)
          height = groundHeight + 50 // 在地面上方50米
          console.log('使用估算的地面高度:', height)
        } catch (e) {
          height = 100 // 使用默认高度100米
          console.log('使用默认高度:', height)
        }
      }

      const result = {
        longitude: longitude,
        latitude: latitude,
        height: height,
      }

      console.log('✅ 计算得到的模型中心位置:', result)
      return result
    } catch (error) {
      console.warn('计算模型中心位置时出错:', error)
      return this.getFallbackPosition()
    }
  }

  /**
   * 获取回退位置（基于相机位置）
   * @returns {Object} 回退位置
   */
  getFallbackPosition() {
    try {
      const camera = this.viewer.camera
      const cameraCartographic = camera.positionCartographic

      const result = {
        longitude: SuperMap3D.Math.toDegrees(cameraCartographic.longitude),
        latitude: SuperMap3D.Math.toDegrees(cameraCartographic.latitude),
        height: Math.max(50, Math.min(1000, cameraCartographic.height * 0.8)), // 限制在50-1000米范围内
      }

      console.log('使用相机位置作为回退位置:', result)
      return result
    } catch (error) {
      console.warn('获取回退位置失败:', error)
      // 最后的默认位置
      return {
        longitude: 116.3974, // 北京经度
        latitude: 39.9093, // 北京纬度
        height: 100,
      }
    }
  }

  /**
   * 估算地面高度
   * @param {number} longitude 经度
   * @param {number} latitude 纬度
   * @returns {number} 估算的地面高度
   */
  estimateGroundHeight(longitude, latitude) {
    try {
      // 尝试使用场景的地形提供者
      if (
        this.viewer.terrainProvider &&
        this.viewer.terrainProvider.availability
      ) {
        // 这里只是一个简单的估算，实际应用中可能需要异步获取
        return 0 // 海平面高度作为基准
      }

      // 如果没有地形提供者，返回默认高度
      return 0
    } catch (error) {
      console.warn('估算地面高度失败:', error)
      return 0
    }
  }

  /**
   * 基于地形分析选择观察点（原有逻辑）
   * @returns {Promise<Object>} 观察点位置
   */
  async selectOptimalViewPointByTerrain() {
    try {
      const camera = this.viewer.camera
      const centerCartographic = camera.positionCartographic
      const centerLongitude = SuperMap3D.Math.toDegrees(
        centerCartographic.longitude,
      )
      const centerLatitude = SuperMap3D.Math.toDegrees(
        centerCartographic.latitude,
      )

      console.log('当前视野中心:', {
        longitude: centerLongitude,
        latitude: centerLatitude,
      })

      // 定义候选观察点的搜索范围
      const searchRadius = 0.01 // 约1公里范围
      const candidatePoints = []

      // 生成候选观察点网格
      const gridSize = 5 // 5x5网格
      for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
          const offsetLon = (i - gridSize / 2) * (searchRadius / gridSize)
          const offsetLat = (j - gridSize / 2) * (searchRadius / gridSize)

          const candidateLon = centerLongitude + offsetLon
          const candidateLat = centerLatitude + offsetLat

          candidatePoints.push({
            longitude: candidateLon,
            latitude: candidateLat,
            score: 0,
          })
        }
      }

      console.log(`生成了 ${candidatePoints.length} 个候选观察点`)

      // 为每个候选点计算适合度分数
      let bestPoint = null
      let bestScore = -1

      // 检查地形提供者是否可用
      const hasTerrainProvider =
        this.viewer.terrainProvider &&
        this.viewer.terrainProvider.availability &&
        typeof this.viewer.terrainProvider.sampleTerrain === 'function'

      console.log('地形提供者可用性:', hasTerrainProvider)

      for (const candidate of candidatePoints) {
        try {
          let terrainHeight = centerCartographic.height // 默认使用相机高度

          // 尝试获取地形高度（如果地形提供者可用）
          if (hasTerrainProvider) {
            try {
              const positions = [
                SuperMap3D.Cartographic.fromDegrees(
                  candidate.longitude,
                  candidate.latitude,
                ),
              ]
              const heights = await SuperMap3D.sampleTerrainMostDetailed(
                this.viewer.terrainProvider,
                positions,
              )

              if (
                heights &&
                heights.length > 0 &&
                SuperMap3D.defined(heights[0].height)
              ) {
                terrainHeight = heights[0].height
              }
            } catch (terrainError) {
              console.warn('地形采样失败，使用默认高度:', terrainError.message)
            }
          }

          const observationHeight = terrainHeight + 50 // 在地面上方50米

          // 计算适合度分数
          let score = 0

          // 1. 高度分数：适中的高度更好
          const heightScore = Math.max(
            0,
            100 - Math.abs(observationHeight - 100),
          )
          score += heightScore * 0.3

          // 2. 距离中心点的分数：不要太远也不要太近
          const distance = SuperMap3D.Cartesian3.distance(
            SuperMap3D.Cartesian3.fromDegrees(
              candidate.longitude,
              candidate.latitude,
              observationHeight,
            ),
            SuperMap3D.Cartesian3.fromDegrees(
              centerLongitude,
              centerLatitude,
              terrainHeight,
            ),
          )
          const distanceScore = Math.max(0, 100 - Math.abs(distance - 500)) // 理想距离500米
          score += distanceScore * 0.4

          // 3. 地形变化分数：有一定起伏的地形更有利于观察
          const elevationVariation = Math.abs(
            terrainHeight - centerCartographic.height,
          )
          const variationScore = Math.min(100, elevationVariation * 2)
          score += variationScore * 0.3

          candidate.score = score
          candidate.height = observationHeight
          candidate.terrainHeight = terrainHeight

          if (score > bestScore) {
            bestScore = score
            bestPoint = candidate
          }
        } catch (error) {
          console.warn('计算候选点适合度时出错:', error)
          // 使用默认高度
          candidate.height = centerCartographic.height + 50
          candidate.score = 50 // 给一个中等分数

          if (candidate.score > bestScore) {
            bestScore = candidate.score
            bestPoint = candidate
          }
        }
      }

      // 如果没有找到合适的点，使用视野中心点作为备选
      if (!bestPoint) {
        console.warn('未找到最佳观察点，使用视野中心点')
        bestPoint = {
          longitude: centerLongitude,
          latitude: centerLatitude,
          height: centerCartographic.height + 50,
          score: 50,
        }
      }

      console.log('选择的最佳观察点:', bestPoint)

      // 创建Cartesian3坐标用于标记
      const optimalViewPointCartesian = SuperMap3D.Cartesian3.fromDegrees(
        bestPoint.longitude,
        bestPoint.latitude,
        bestPoint.height,
      )

      // 添加观察点标记（可选）
      this.addViewPointMarker(optimalViewPointCartesian, '智能选择的观察点')

      console.log('✅ 智能观察点选择完成（基于地形分析）')

      // 返回包含经纬度和高度的对象
      return {
        longitude: bestPoint.longitude,
        latitude: bestPoint.latitude,
        height: bestPoint.height,
      }
    } catch (error) {
      console.error('❌ 地形分析观察点选择失败:', error)

      // 使用相机位置作为最后的回退
      const camera = this.viewer.camera
      const cameraCartographic = camera.positionCartographic

      return {
        longitude: SuperMap3D.Math.toDegrees(cameraCartographic.longitude),
        latitude: SuperMap3D.Math.toDegrees(cameraCartographic.latitude),
        height: cameraCartographic.height + 50,
      }
    }
  }

  /**
   * 添加观察点标记
   * @param {SuperMap3D.Cartesian3} position 观察点位置
   * @param {string} name 标记名称
   */
  addViewPointMarker(position, name = '观察点') {
    try {
      // 移除之前的观察点标记
      const existingMarkers = this.viewer.entities.values.filter(
        (entity) => entity.name && entity.name.includes('观察点'),
      )
      existingMarkers.forEach((marker) => {
        this.viewer.entities.remove(marker)
      })

      // 添加新的观察点标记
      const marker = this.viewer.entities.add({
        name: name,
        position: position,
        point: {
          pixelSize: 12,
          color: SuperMap3D.Color.YELLOW,
          outlineColor: SuperMap3D.Color.BLACK,
          outlineWidth: 2,
          heightReference: SuperMap3D.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: name,
          font: '14pt sans-serif',
          fillColor: SuperMap3D.Color.WHITE,
          outlineColor: SuperMap3D.Color.BLACK,
          outlineWidth: 2,
          style: SuperMap3D.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new SuperMap3D.Cartesian2(0, -40),
          heightReference: SuperMap3D.HeightReference.CLAMP_TO_GROUND,
        },
      })

      console.log('✅ 添加观察点标记:', name)
      return marker
    } catch (error) {
      console.warn('⚠️ 添加观察点标记失败:', error)
      return null
    }
  }

  /**
   * 模型平移操作
   * @param {string} modelId 模型ID
   * @param {Object} translation 平移参数 {x, y, z}
   */
  translateModel(modelId, translation) {
    try {
      console.log('🚀 执行模型平移:', { modelId, translation })

      // 查找模型实体
      const modelEntity = this.findModelEntity(modelId)
      if (!modelEntity) {
        console.warn('⚠️ 未找到模型:', modelId)
        return false
      }

      // 获取当前位置
      const currentPosition = modelEntity.position?.getValue(
        SuperMap3D.JulianDate.now(),
      )
      if (!currentPosition) {
        console.warn('⚠️ 模型没有位置属性:', modelId)
        return false
      }

      // 获取当前相机的方向，用于屏幕坐标系转换
      const camera = this.viewer.camera
      const cameraDirection = camera.direction
      const cameraRight = camera.right
      const cameraUp = camera.up

      // 将屏幕坐标系的平移转换为世界坐标系
      let worldTranslation = new SuperMap3D.Cartesian3(0, 0, 0)

      // X轴平移（屏幕左右）- 使用相机的右向量
      if (translation.x !== 0) {
        const rightTranslation = SuperMap3D.Cartesian3.multiplyByScalar(
          cameraRight,
          translation.x,
          new SuperMap3D.Cartesian3(),
        )
        worldTranslation = SuperMap3D.Cartesian3.add(
          worldTranslation,
          rightTranslation,
          worldTranslation,
        )
      }

      // Y轴平移（屏幕上下）- 使用相机的上向量
      if (translation.y !== 0) {
        const upTranslation = SuperMap3D.Cartesian3.multiplyByScalar(
          cameraUp,
          translation.y,
          new SuperMap3D.Cartesian3(),
        )
        worldTranslation = SuperMap3D.Cartesian3.add(
          worldTranslation,
          upTranslation,
          worldTranslation,
        )
      }

      // Z轴平移（屏幕前后）- 使用相机的方向向量
      if (translation.z !== 0) {
        const forwardTranslation = SuperMap3D.Cartesian3.multiplyByScalar(
          cameraDirection,
          translation.z,
          new SuperMap3D.Cartesian3(),
        )
        worldTranslation = SuperMap3D.Cartesian3.add(
          worldTranslation,
          forwardTranslation,
          worldTranslation,
        )
      }

      // 计算新位置
      const newPosition = SuperMap3D.Cartesian3.add(
        currentPosition,
        worldTranslation,
        new SuperMap3D.Cartesian3(),
      )

      // 更新模型位置
      modelEntity.position = new SuperMap3D.ConstantProperty(newPosition)

      console.log('✅ 模型平移完成:', {
        modelId,
        from: currentPosition,
        to: newPosition,
        translation,
        worldTranslation,
        cameraDirection: {
          x: cameraDirection.x,
          y: cameraDirection.y,
          z: cameraDirection.z,
        },
      })

      return true
    } catch (error) {
      console.error('❌ 模型平移失败:', error)
      return false
    }
  }

  /**
   * 模型旋转操作
   * @param {string} modelId 模型ID
   * @param {Object} rotation 旋转参数 {x, y, z} (角度制)
   */
  rotateModel(modelId, rotation) {
    try {
      console.log('🔄 执行模型旋转:', { modelId, rotation })

      // 查找模型实体
      const modelEntity = this.findModelEntity(modelId)
      if (!modelEntity) {
        console.warn('⚠️ 未找到模型:', modelId)
        return false
      }

      // 获取当前位置
      const currentPosition = modelEntity.position?.getValue(
        SuperMap3D.JulianDate.now(),
      )
      if (!currentPosition) {
        console.warn('⚠️ 模型没有位置属性:', modelId)
        return false
      }

      // 将角度转换为弧度
      const xRad = SuperMap3D.Math.toRadians(rotation.x || 0)
      const yRad = SuperMap3D.Math.toRadians(rotation.y || 0)
      const zRad = SuperMap3D.Math.toRadians(rotation.z || 0)

      // 获取当前方向或创建默认方向
      let currentHPR = new SuperMap3D.HeadingPitchRoll(0, 0, 0)
      if (modelEntity.orientation) {
        const currentOrientation = modelEntity.orientation.getValue(
          SuperMap3D.JulianDate.now(),
        )
        if (currentOrientation) {
          currentHPR =
            SuperMap3D.HeadingPitchRoll.fromQuaternion(currentOrientation)
        }
      }

      // 累加旋转角度（相对于当前方向）
      const newHPR = new SuperMap3D.HeadingPitchRoll(
        currentHPR.heading + zRad, // Z轴旋转（偏航）
        currentHPR.pitch + yRad, // Y轴旋转（俯仰）
        currentHPR.roll + xRad, // X轴旋转（翻滚）
      )

      // 创建新的方向四元数
      const newOrientation = SuperMap3D.Transforms.headingPitchRollQuaternion(
        currentPosition,
        newHPR,
      )

      // 更新模型的方向
      modelEntity.orientation = new SuperMap3D.ConstantProperty(newOrientation)

      console.log('✅ 模型旋转完成:', {
        modelId,
        rotation: {
          x: rotation.x || 0,
          y: rotation.y || 0,
          z: rotation.z || 0,
        },
        currentHPR: {
          heading: SuperMap3D.Math.toDegrees(currentHPR.heading),
          pitch: SuperMap3D.Math.toDegrees(currentHPR.pitch),
          roll: SuperMap3D.Math.toDegrees(currentHPR.roll),
        },
        newHPR: {
          heading: SuperMap3D.Math.toDegrees(newHPR.heading),
          pitch: SuperMap3D.Math.toDegrees(newHPR.pitch),
          roll: SuperMap3D.Math.toDegrees(newHPR.roll),
        },
      })

      return true
    } catch (error) {
      console.error('❌ 模型旋转失败:', error)
      return false
    }
  }

  /**
   * 模型缩放操作
   * @param {string} modelId 模型ID
   * @param {number} scaleFactor 缩放因子
   */
  scaleModel(modelId, scaleFactor) {
    try {
      console.log('📏 执行模型缩放:', { modelId, scaleFactor })

      // 查找模型实体
      const modelEntity = this.findModelEntity(modelId)
      if (!modelEntity) {
        console.warn('⚠️ 未找到模型:', modelId)
        return false
      }

      // 检查实体是否有模型组件
      if (!modelEntity.model) {
        console.warn('⚠️ 实体没有模型组件:', modelId)
        return false
      }

      // 获取当前缩放，如果不存在则使用默认值1.0
      let currentScale = 1.0
      if (modelEntity.model.scale) {
        const scaleValue = modelEntity.model.scale.getValue(
          SuperMap3D.JulianDate.now(),
        )
        if (scaleValue !== undefined && scaleValue !== null) {
          currentScale = scaleValue
        }
      }

      // 计算新缩放
      const newScale = currentScale * scaleFactor

      // 更新模型缩放（直接更新model.scale属性）
      modelEntity.model.scale = new SuperMap3D.ConstantProperty(newScale)

      console.log('✅ 模型缩放完成:', {
        modelId,
        from: currentScale,
        to: newScale,
        scaleFactor,
        entityId: modelEntity.id,
      })

      return true
    } catch (error) {
      console.error('❌ 模型缩放失败:', error)
      return false
    }
  }

  /**
   * 查找模型实体
   * @param {string} modelId 模型ID
   * @returns {SuperMap3D.Entity|null} 模型实体
   */
  findModelEntity(modelId) {
    try {
      // 在场景实体中查找模型
      const entities = this.viewer.entities.values

      // 处理默认模型ID
      if (modelId === 'default' || modelId === 'current') {
        // 查找第一个模型实体
        for (const entity of entities) {
          if (entity.model) {
            return entity
          }
        }
        // 如果没有模型实体，返回第一个实体
        if (entities.length > 0) {
          return entities[0]
        }
        return null
      }

      for (const entity of entities) {
        // 检查实体是否为模型
        if (entity.model && entity.id === modelId) {
          return entity
        }

        // 检查实体名称或描述是否匹配
        if (
          (entity.name && entity.name.includes(modelId)) ||
          (entity.description && entity.description.includes(modelId))
        ) {
          return entity
        }
      }

      // 如果未找到，尝试使用默认模型
      if (entities.length > 0) {
        return entities[0] // 返回第一个实体作为默认模型
      }

      return null
    } catch (error) {
      console.error('❌ 查找模型实体失败:', error)
      return null
    }
  }

  /**
   * 销毁分析模块
   */
  destroy() {
    this.clearAllAnalysis()

    // 清理阴影分析相关资源
    this.clearShadowAnalysis()

    // 清理天际线分析相关资源
    this.clearSkylineAnalysis()
    if (this.skylinePolygonHandler) {
      this.skylinePolygonHandler.destroy()
      this.skylinePolygonHandler = null
    }
    if (this.skyline) {
      this.skyline = null
    }

    // 清理官方通视分析对象
    if (this.sightlineAnalysis) {
      try {
        if (typeof this.sightlineAnalysis.removeAllTargetPoint === 'function') {
          this.sightlineAnalysis.removeAllTargetPoint()
        }
        this.sightlineAnalysis = null
        console.log('✅ 清理官方通视分析对象')
      } catch (error) {
        console.warn('⚠️ 清理官方通视分析对象时出错:', error)
      }
    }

    if (this.interactiveManager) {
      this.interactiveManager.destroy()
      this.interactiveManager = null
    }

    if (this.handler) {
      this.handler.destroy()
    }
  }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DigitalTwinAnalysis
}

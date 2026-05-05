/**
 * 修复后的测量分析功能
 * 使用更简单稳定的方式实现测量
 */

// 保存原始的测量函数
const originalPerformAreaMeasure = RealityTwin3DAnalysisTool.prototype.performAreaMeasure
const originalPerformDistanceMeasure = RealityTwin3DAnalysisTool.prototype.performDistanceMeasure
const originalPerformHeightMeasure = RealityTwin3DAnalysisTool.prototype.performHeightMeasure

// 重写面积测量
RealityTwin3DAnalysisTool.prototype.performAreaMeasure = function(mode = 0) {
  try {
    console.log('📐 执行面积测量，模式:', mode)

    // 清除之前的测量
    if (this.measureHandler) {
      this.measureHandler.deactivate()
      this.measureHandler.clear()
    }

    // 创建测量处理器
    this.measureHandler = new SuperMap3D.MeasureHandler(
      this.viewer,
      SuperMap3D.MeasureMode.Area,
      SuperMap3D.ClampMode.None
    )

    const self = this

    // 监听测量完成事件
    this.measureHandler.measureEvt.addEventListener(function(result) {
      console.log('📐 面积测量结果:', result)

      // 直接获取 area 值
      let area = result.area

      // 如果 area 不是数字，尝试转换
      if (typeof area !== 'number') {
        area = Number(area)
      }

      // 如果还是无效，使用 0
      if (isNaN(area)) {
        console.error('❌ 无效的面积值:', area)
        return
      }

      // 格式化显示
      let areaText
      if (area >= 1000000) {
        areaText = (area / 1000000).toFixed(2) + ' km²'
      } else if (area >= 10000) {
        areaText = (area / 10000).toFixed(2) + ' 万m²'
      } else {
        areaText = area.toFixed(2) + ' m²'
      }

      // 显示结果
      self.measureHandler.areaLabel.text = areaText
      self.displayMeasureResult('area', { area: area })

      // 恢复光标
      self.resetCursor()
    })

    // 激活测量
    this.measureHandler.activate()

    // 设置光标
    this.setCrosshairCursor()

    // 创建面板
    this.createMeasureResultPanel()

    this.activeAnalysis = 'area_measure'
    console.log('✅ 面积测量已激活')

    return true
  } catch (error) {
    console.error('❌ 面积测量失败:', error)
    this.resetCursor()
    return false
  }
}

// 重写距离测量
RealityTwin3DAnalysisTool.prototype.performDistanceMeasure = function(mode = 0) {
  try {
    console.log('📏 执行距离测量，模式:', mode)

    // 清除之前的测量
    if (this.measureHandler) {
      this.measureHandler.deactivate()
      this.measureHandler.clear()
    }

    // 创建测量处理器
    this.measureHandler = new SuperMap3D.MeasureHandler(
      this.viewer,
      SuperMap3D.MeasureMode.Distance,
      SuperMap3D.ClampMode.None
    )

    const self = this

    // 监听测量完成事件
    this.measureHandler.measureEvt.addEventListener(function(result) {
      console.log('📏 距离测量结果:', result)

      // 直接获取 distance 值
      let distance = result.distance

      // 如果 distance 不是数字，尝试转换
      if (typeof distance !== 'number') {
        distance = Number(distance)
      }

      // 如果还是无效，使用 0
      if (isNaN(distance)) {
        console.error('❌ 无效的距离值:', distance)
        return
      }

      // 格式化显示
      let distanceText
      if (distance >= 1000) {
        distanceText = (distance / 1000).toFixed(2) + ' km'
      } else {
        distanceText = distance.toFixed(2) + ' m'
      }

      // 显示结果
      self.measureHandler.disLabel.text = distanceText
      self.displayMeasureResult('distance', { distance: distance })

      // 恢复光标
      self.resetCursor()
    })

    // 激活测量
    this.measureHandler.activate()

    // 设置光标
    this.setCrosshairCursor()

    // 创建面板
    this.createMeasureResultPanel()

    this.activeAnalysis = 'distance_measure'
    console.log('✅ 距离测量已激活')

    return true
  } catch (error) {
    console.error('❌ 距离测量失败:', error)
    this.resetCursor()
    return false
  }
}

// 重写高度测量
RealityTwin3DAnalysisTool.prototype.performHeightMeasure = function() {
  try {
    console.log('📊 执行高度测量')

    // 清除之前的测量
    if (this.measureHandler) {
      this.measureHandler.deactivate()
      this.measureHandler.clear()
    }

    // 创建测量处理器
    this.measureHandler = new SuperMap3D.MeasureHandler(
      this.viewer,
      SuperMap3D.MeasureMode.DVH,
      SuperMap3D.ClampMode.None
    )

    const self = this

    // 监听测量完成事件
    this.measureHandler.measureEvt.addEventListener(function(result) {
      console.log('📊 高度测量结果:', result)

      // 直接获取值
      let verticalHeight = Number(result.verticalHeight) || 0
      let horizontalDistance = Number(result.horizontalDistance) || 0
      let distance = Number(result.distance) || 0

      // 格式化显示
      let resultText = ''
      if (verticalHeight > 0) {
        resultText += `垂直高度: ${verticalHeight.toFixed(2)} m\n`
      }
      if (horizontalDistance > 0) {
        resultText += `水平距离: ${horizontalDistance.toFixed(2)} m\n`
      }
      if (distance > 0) {
        resultText += `空间距离: ${distance.toFixed(2)} m`
      }

      // 显示结果
      self.measureHandler.vLabel.text = resultText
      self.displayMeasureResult('height', {
        verticalHeight: verticalHeight,
        horizontalDistance: horizontalDistance,
        distance: distance
      })

      // 恢复光标
      self.resetCursor()
    })

    // 激活测量
    this.measureHandler.activate()

    // 设置光标
    this.setCrosshairCursor()

    // 创建面板
    this.createMeasureResultPanel()

    this.activeAnalysis = 'height_measure'
    console.log('✅ 高度测量已激活')

    return true
  } catch (error) {
    console.error('❌ 高度测量失败:', error)
    this.resetCursor()
    return false
  }
}

console.log('✅ 测量功能已重新实现')

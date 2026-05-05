// 测量功能补丁 - 修复点击和结果显示问题（移除UI面板）

// 修复 performDistanceMeasure
DigitalTwinAnalysis.prototype.performDistanceMeasure = function(mode = 0) {
  try {
    console.log('📏 执行距离测量，模式:', mode)

    if (this.measureHandler) {
      this.measureHandler.deactivate()
      this.measureHandler.clear()
    }

    this.measureHandler = new SuperMap3D.MeasureHandler(
      this.viewer,
      SuperMap3D.MeasureMode.Distance,
      SuperMap3D.ClampMode.None
    )

    const self = this

    this.measureHandler.measureEvt.addEventListener(function(result) {
      console.log('📏 距离测量结果:', result)

      let distance = Number(result.distance) || 0

      if (distance > 0) {
        let distanceText = distance >= 1000 
          ? (distance / 1000).toFixed(2) + ' km' 
          : distance.toFixed(2) + ' m'

        self.measureHandler.disLabel.text = distanceText
        self.resetCursor()
        console.log('✅ 测量完成: ' + distanceText)
      }
    })

    this.measureHandler.activate()
    this.setCrosshairCursor()
    this.activeAnalysis = 'distance_measure'
    console.log('✅ 距离测量已激活')

    return true
  } catch (error) {
    console.error('❌ 距离测量失败:', error)
    this.resetCursor()
    return false
  }
}

// 修复 performAreaMeasure
DigitalTwinAnalysis.prototype.performAreaMeasure = function(mode = 0) {
  try {
    console.log('📐 执行面积测量，模式:', mode)

    if (this.measureHandler) {
      this.measureHandler.deactivate()
      this.measureHandler.clear()
    }

    this.measureHandler = new SuperMap3D.MeasureHandler(
      this.viewer,
      SuperMap3D.MeasureMode.Area,
      SuperMap3D.ClampMode.None
    )

    const self = this

    this.measureHandler.measureEvt.addEventListener(function(result) {
      console.log('📐 面积测量结果:', result)

      let area = Number(result.area) || 0

      if (area > 0) {
        let areaText = area >= 1000000 
          ? (area / 1000000).toFixed(2) + ' km²' 
          : area >= 10000 
            ? (area / 10000).toFixed(2) + ' 万m²' 
            : area.toFixed(2) + ' m²'

        self.measureHandler.areaLabel.text = areaText
        self.resetCursor()
        console.log('✅ 测量完成: ' + areaText)
      }
    })

    this.measureHandler.activate()
    this.setCrosshairCursor()
    this.activeAnalysis = 'area_measure'
    console.log('✅ 面积测量已激活')

    return true
  } catch (error) {
    console.error('❌ 面积测量失败:', error)
    this.resetCursor()
    return false
  }
}

// 修复 performHeightMeasure
DigitalTwinAnalysis.prototype.performHeightMeasure = function() {
  try {
    console.log('📊 执行高度测量')

    if (this.measureHandler) {
      this.measureHandler.deactivate()
      this.measureHandler.clear()
    }

    this.measureHandler = new SuperMap3D.MeasureHandler(
      this.viewer,
      SuperMap3D.MeasureMode.DVH,
      SuperMap3D.ClampMode.None
    )

    const self = this

    this.measureHandler.measureEvt.addEventListener(function(result) {
      console.log('📊 高度测量结果:', result)

      let verticalHeight = Number(result.verticalHeight) || 0
      let horizontalDistance = Number(result.horizontalDistance) || 0
      let distance = Number(result.distance) || 0

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

      if (resultText) {
        self.measureHandler.vLabel.text = resultText
        self.resetCursor()
        console.log('✅ 测量完成:\n' + resultText)
      }
    })

    this.measureHandler.activate()
    this.setCrosshairCursor()
    this.activeAnalysis = 'height_measure'
    console.log('✅ 高度测量已激活')

    return true
  } catch (error) {
    console.error('❌ 高度测量失败:', error)
    this.resetCursor()
    return false
  }
}

console.log('✅ 测量功能补丁已加载（无UI面板版本）')

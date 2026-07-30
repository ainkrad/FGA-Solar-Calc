
// import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export const initScenePipelineModule = () => {
  // Grab window references safely inside the closure
  const THREE = window.THREE
  // const GLTFLoader = window.GLTFLoader || THREE.GLTFLoader
  
  let takeSnapshot = false
  let snapshotCanvas = null
  let previewImg = null
  let modalOverlay = null
  
  let currentScene = null
  let activeCamera = null // Reference stored safely during setup
  let currentModel = null
  let activeModelData = null
  let reticleMesh = null
  
  // Surface scanning toggle state
  let isScanningActive = true
  let lockedSurfacePoint = null // Stores last valid hit test pose when scanning turns OFF

  // Touch gesture state for press-and-hold & pinch adjustments
  let isTouchingModel = false
  let touchStartPos = { x: 0, y: 0 }
  let lastTouchTime = 0
  let pressHoldTimer = null
  let isDragging = false

  // Pinch-to-scale state
  let initialPinchDistance = 0
  let initialModelScale = THREE ? new THREE.Vector3() : null

  // Instantiate GLTFLoader safely
  const gltfLoader = new GLTFLoader()

  const modelsList = [
    { name: 'Chair', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/SheenChair/glTF-Binary/SheenChair.glb', scale: 1 },
    { name: 'Duck', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/Duck/glTF-Binary/Duck.glb', scale: 0.5 },
    { name: 'Helmet', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb', scale: 0.8 },
  ]

  // Helper to calculate distance between two touches
  const getTouchDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  // Spawn or replace model at target position
  const placeOrUpdateModel = (position, rotation) => {
    if (!currentScene || !activeModelData) return

    if (currentModel) {
      currentModel.position.copy(position)
      if (rotation) currentModel.quaternion.copy(rotation)
    } else if (gltfLoader) {
      gltfLoader.load(
        activeModelData.url,
        (gltf) => {
          currentModel = gltf.scene
          currentModel.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true
              child.receiveShadow = true
            }
          })

          currentModel.position.copy(position)
          if (rotation) currentModel.quaternion.copy(rotation)

          const s = activeModelData.scale || 1
          currentModel.scale.set(s, s, s)

          currentScene.add(currentModel)
        },
        undefined,
        (err) => console.error('Error loading model:', err)
      )
    }
  }

  const isIOS = () => {
    return [
      'iPad Simulator',
      'iPhone Simulator',
      'iPod Simulator',
      'iPad',
      'iPhone',
      'iPod'
    ].includes(navigator.platform) 
    || (navigator.userAgent.includes("Mac") && "ontouchend" in document)
  }

  const createUI = () => {
    // --- 1. Scanning Toggle Button ---
    const scanToggleBtn = document.createElement('button')
    scanToggleBtn.id = 'ar-scan-toggle'
    scanToggleBtn.innerText = '🔍 Surface Scan: ON'
    scanToggleBtn.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999;
      padding: 12px 24px;
      font-size: 14px;
      font-weight: bold;
      color: #ffffff;
      background-color: #0088ff;
      border: 2px solid #ffffff;
      border-radius: 25px;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(0,0,0,0.4);
      transition: background-color 0.2s ease;
    `

    scanToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      isScanningActive = !isScanningActive

      if (isScanningActive) {
        scanToggleBtn.innerText = '🔍 Surface Scan: ON'
        scanToggleBtn.style.backgroundColor = '#0088ff'
        if (reticleMesh) reticleMesh.visible = true
      } else {
        scanToggleBtn.innerText = '📍 Surface Locked (Tap to Place)'
        scanToggleBtn.style.backgroundColor = '#22c55e'
      }
    })

    // --- 2. Sidebar UI ---
    const sidebar = document.createElement('div')
    sidebar.id = 'model-sidebar'
    sidebar.style.cssText = `
      position: fixed;
      right: 15px;
      top: 50%;
      transform: translateY(-50%);
      z-index: 999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: rgba(0, 0, 0, 0.5);
      padding: 10px;
      border-radius: 20px;
      backdrop-filter: blur(5px);
    `

    modelsList.forEach((model) => {
      const btn = document.createElement('button')
      btn.innerText = model.name
      btn.style.cssText = `
        padding: 10px 14px;
        font-size: 13px;
        font-weight: bold;
        color: #ffffff;
        background-color: #2b2b2b;
        border: 2px solid #ffffff;
        border-radius: 12px;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      `
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        activeModelData = model

        if (currentModel && currentScene) {
          const pos = currentModel.position.clone()
          const rot = currentModel.quaternion.clone()
          currentScene.remove(currentModel)
          currentModel = null
          placeOrUpdateModel(pos, rot)
        }
      })
      sidebar.appendChild(btn)
    })

    // --- 3. Capture Button ---
    const captureBtn = document.createElement('button')
    captureBtn.id = 'ar-capture-btn'
    captureBtn.innerText = '📷 Take Photo'
    captureBtn.style.cssText = `
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999;
      padding: 14px 28px;
      font-size: 16px;
      font-weight: bold;
      color: #ffffff;
      background-color: #2b2b2b;
      border: 2px solid #ffffff;
      border-radius: 30px;
      cursor: pointer;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
    `

    // --- 4. Modal Overlay ---
    modalOverlay = document.createElement('div')
    modalOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0,0,0,0.85);
      display: none;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    `

    previewImg = document.createElement('img')
    previewImg.style.cssText = `
      max-width: 85%;
      max-height: 60vh;
      border-radius: 10px;
      margin-bottom: 15px;
      border: 2px solid white;
      -webkit-touch-callout: default !important;
      user-select: auto !important;
    `

    const iosInstruction = document.createElement('p')
    iosInstruction.innerText = 'Press and hold the image to save it to your Photos.'
    iosInstruction.style.cssText = `
      color: #ffffff;
      font-size: 14px;
      margin-bottom: 15px;
      text-align: center;
      padding: 0 20px;
      font-family: sans-serif;
      font-weight: 500;
      display: ${isIOS() ? 'block' : 'none'};
    `

    const downloadBtn = document.createElement('a')
    downloadBtn.innerText = 'Download Image'
    downloadBtn.download = 'ar-snapshot.png'
    downloadBtn.style.cssText = `
      padding: 10px 20px;
      background-color: #AD50FF;
      color: white;
      text-decoration: none;
      font-weight: bold;
      border-radius: 20px;
      margin-bottom: 10px;
      display: ${isIOS() ? 'none' : 'inline-block'};
    `

    const closeBtn = document.createElement('button')
    closeBtn.innerText = 'Close'
    closeBtn.style.cssText = `
      background: transparent;
      color: white;
      border: none;
      font-size: 14px;
      cursor: pointer;
      padding: 8px 16px;
    `

    modalOverlay.appendChild(previewImg)
    modalOverlay.appendChild(iosInstruction)
    modalOverlay.appendChild(downloadBtn)
    modalOverlay.appendChild(closeBtn)

    document.body.appendChild(scanToggleBtn)
    document.body.appendChild(sidebar)
    document.body.appendChild(captureBtn)
    document.body.appendChild(modalOverlay)

    captureBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      takeSnapshot = true
    })

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      modalOverlay.style.display = 'none'
    })
  }

  const initXrScene = ({scene, camera}) => {
    currentScene = scene
    activeCamera = camera

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(5, 10, 7)
    scene.add(directionalLight)

    // Placement Reticle (Visual Ring)
    const ringGeo = new THREE.RingGeometry(0.1, 0.12, 32)
    ringGeo.rotateX(-Math.PI / 2)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide })
    reticleMesh = new THREE.Mesh(ringGeo, ringMat)
    reticleMesh.visible = false
    scene.add(reticleMesh)

    activeModelData = modelsList[0]
  }

  // --- Touch Gesture Listeners ---
  const setupTouchListeners = (canvas) => {
    canvas.addEventListener('touchstart', (e) => {
      if (e.target !== canvas) return

      if (e.touches.length === 2 && currentModel && initialModelScale) {
        clearTimeout(pressHoldTimer)
        initialPinchDistance = getTouchDistance(e.touches)
        initialModelScale.copy(currentModel.scale)
        return
      }

      if (e.touches.length === 1) {
        const touch = e.touches[0]
        touchStartPos = { x: touch.clientX, y: touch.clientY }
        lastTouchTime = Date.now()
        isDragging = false

        pressHoldTimer = setTimeout(() => {
          if (currentModel) {
            isTouchingModel = true
          }
        }, 300)
      }
    })

    canvas.addEventListener('touchmove', (e) => {
      if (e.target !== canvas) return
      e.preventDefault()

      if (e.touches.length === 1) {
        const touch = e.touches[0]
        const deltaX = touch.clientX - touchStartPos.x
        const deltaY = touch.clientY - touchStartPos.y

        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
          isDragging = true
        }

        if (isTouchingModel && currentModel) {
          currentModel.rotation.y += deltaX * 0.01

          if (activeCamera) {
            const forwardVector = new THREE.Vector3()
            activeCamera.getWorldDirection(forwardVector)
            
            forwardVector.y = 0 
            forwardVector.normalize()

            const moveSpeed = 0.005
            currentModel.position.addScaledVector(forwardVector, -deltaY * moveSpeed)
          } else {
            currentModel.position.z += deltaY * 0.005
          }

          touchStartPos = { x: touch.clientX, y: touch.clientY }
        }
      }
    })

    canvas.addEventListener('touchend', (e) => {
      clearTimeout(pressHoldTimer)

      if (e.touches.length < 2) {
        initialPinchDistance = 0
      }

      if (!isScanningActive && !isDragging && (Date.now() - lastTouchTime < 300) && e.touches.length === 0) {
        if (lockedSurfacePoint) {
          placeOrUpdateModel(lockedSurfacePoint.position, lockedSurfacePoint.rotation)
        } else if (window.XR8 && XR8.XrController) {
          const rect = canvas.getBoundingClientRect()
          const touch = e.changedTouches[0]
          const normX = (touch.clientX - rect.left) / rect.width
          const normY = (touch.clientY - rect.top) / rect.height

          const hits = XR8.XrController.hitTest(normX, normY, ['FEATURE_POINT', 'ESTIMATED_SURFACE'])
          if (hits && hits.length > 0) {
            const pos = new THREE.Vector3(hits[0].position.x, hits[0].position.y, hits[0].position.z)
            const rot = hits[0].rotation ? new THREE.Quaternion(hits[0].rotation.x, hits[0].rotation.y, hits[0].rotation.z, hits[0].rotation.w) : null
            placeOrUpdateModel(pos, rot)
          }
        }
      }

      if (e.touches.length === 0) {
        isTouchingModel = false
        isDragging = false
      }
    })
  }

  return {
    name: 'threejsinitscene',

    onStart: ({canvas}) => {
      const {scene, camera} = XR8.Threejs.xrScene()

      snapshotCanvas = canvas
      createUI()
      initXrScene({scene, camera})
      setupTouchListeners(canvas)
    },

    onUpdate: () => {
      if (!reticleMesh) return

      if (isScanningActive && window.XR8 && XR8.XrController) {
        const hits = XR8.XrController.hitTest(0.5, 0.5, ['FEATURE_POINT', 'ESTIMATED_SURFACE'])

        if (hits && hits.length > 0) {
          const hit = hits[0]
          const pos = new THREE.Vector3(hit.position.x, hit.position.y, hit.position.z)
          const rot = hit.rotation ? new THREE.Quaternion(hit.rotation.x, hit.rotation.y, hit.rotation.z, hit.rotation.w) : null

          reticleMesh.position.copy(pos)
          if (rot) reticleMesh.quaternion.copy(rot)
          reticleMesh.visible = true

          lockedSurfacePoint = { position: pos, rotation: rot }
        } else {
          reticleMesh.visible = false
        }
      }
    },

    onRender: () => {
      if (takeSnapshot && snapshotCanvas) {
        takeSnapshot = false
        
        const dataUrl = snapshotCanvas.toDataURL('image/png')
        previewImg.src = dataUrl
        
        const downloadAnchor = modalOverlay.querySelector('a')
        if (downloadAnchor) {
          downloadAnchor.href = dataUrl
        }
        
        modalOverlay.style.display = 'flex'
      }
    },
  }
}
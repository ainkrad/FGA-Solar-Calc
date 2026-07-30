import { initScenePipelineModule } from './threejs-scene-init.js'

const onxrloaded = () => {
  // Ensure window.THREE is available for 8th Wall engine hooks
  if (!window.THREE) {
    console.error('Three.js global not found! Ensure the CDN script loaded correctly.')
    return
  }

  // Safely check XRExtras modules
  const landingPageModule = window.XRExtras && window.XRExtras.LandingPage
    ? window.XRExtras.LandingPage.pipelineModule()
    : null

  const loadingModule = window.XRExtras && window.XRExtras.Loading
    ? window.XRExtras.Loading.pipelineModule()
    : null

  const runtimeErrorModule = window.XRExtras && window.XRExtras.RuntimeError
    ? window.XRExtras.RuntimeError.pipelineModule()
    : null

  const fullWindowModule = window.XRExtras && window.XRExtras.FullWindowCanvas
    ? window.XRExtras.FullWindowCanvas.pipelineModule()
    : null

  // Build active module list
  const modules = [
    XR8.GlTextureRenderer.pipelineModule(), // Draws camera feed
    XR8.Threejs.pipelineModule(),           // Links SLAM tracking to Three.js
    XR8.XrController.pipelineModule(),      // World tracking
  ]

  if (landingPageModule) modules.push(landingPageModule)
  if (fullWindowModule) modules.push(fullWindowModule)
  if (loadingModule) modules.push(loadingModule)
  if (runtimeErrorModule) modules.push(runtimeErrorModule)

  // Add custom scene logic
  modules.push(initScenePipelineModule())

  XR8.addCameraPipelineModules(modules)

  const canvas = document.getElementById('camerafeed')
  
  if (!canvas) {
    console.error('Canvas element #camerafeed was not found in the DOM.')
    return
  }

  // Start the camera and SLAM processing loop
  XR8.run({ canvas })
}

if (window.XR8) {
  onxrloaded()
} else {
  window.addEventListener('xrloaded', onxrloaded)
}
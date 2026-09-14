export function getPlatform() {
  const platform = navigator.platform.toLowerCase()
  let os = null

  if (platform.indexOf("win") >= 0) {
    os = "Windows"
  } else if (platform.indexOf("mac") >= 0) {
    os = "macOS"
  }

  return os
}

export function isRunningInElectron() {
  // Check if we are running in Signal's own Electron shell: its preload API is
  // present. (Crux Garden: the user agent alone also matches other Electron hosts.)
  return (
    "electronAPI" in window &&
    navigator.userAgent.toLowerCase().indexOf(" electron/") > -1
  )
}

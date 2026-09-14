import { configure } from "mobx"
import { createRoot } from "react-dom/client"
import { App } from "./components/App/App"
// Crux Garden: the Garden bridge (inert outside a Workshop frame); Sentry and
// the service worker are upstream's hosted-site concerns and stay out.
import "./garden/bridge"

configure({
  enforceActions: "never",
})

const root = createRoot(document.querySelector("#root")!)
root.render(<App />)

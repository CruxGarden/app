import { startGarden } from './garden/bridge'
import React from 'react'
import ReactDOM from 'react-dom'
import './styles/index.scss'
import App from './App'
import * as serviceWorker from './serviceWorker'

async function mountGarden() {
  if (window.parent !== window) window.rawGarden = await startGarden()
  ReactDOM.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
    document.getElementById('root')
  )
}
mountGarden().catch(console.error)

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister()

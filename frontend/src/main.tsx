import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { initSentry } from './sentry'
import './index.css'

initSentry()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

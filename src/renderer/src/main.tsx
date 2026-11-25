import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

if (new URLSearchParams(window.location.search).get('welcome') === '1') {
  document.documentElement.classList.add('welcome-mode')
  document.body.classList.add('welcome-mode')
  document.getElementById('root')?.classList.add('welcome-mode')
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />)

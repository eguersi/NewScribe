import { useEffect, useState } from 'react'

const welcomeUrl = new URL('../assets/welcome.svg', import.meta.url).href
const english = !navigator.language.toLowerCase().startsWith('zh')

const STEPS = english
  ? ['Preparing NewScribe…', 'Loading the workspace…', 'Almost ready…']
  : ['正在准备 NewScribe…', '正在加载工作区…', '即将完成…']

export function WelcomeScreen() {
  const [progress, setProgress] = useState(8)
  const [step, setStep] = useState(0)
  const [barFading, setBarFading] = useState(false)
  const [barVisible, setBarVisible] = useState(true)
  const [buttonVisible, setButtonVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const ready = progress >= 100

  useEffect(() => {
    document.documentElement.classList.add('welcome-mode')
    document.body.classList.add('welcome-mode')
    const root = document.getElementById('root')
    root?.classList.add('welcome-mode')
    return () => {
      document.documentElement.classList.remove('welcome-mode')
      document.body.classList.remove('welcome-mode')
      root?.classList.remove('welcome-mode')
    }
  }, [])

  useEffect(() => {
    if (progress >= 100) return
    const timer = window.setTimeout(() => {
      setProgress((value) => Math.min(100, value + (value < 60 ? 9 : 5)))
      setStep((value) => Math.min(STEPS.length - 1, Math.floor((progress + 10) / 34)))
    }, 110)
    return () => window.clearTimeout(timer)
  }, [progress])

  useEffect(() => {
    if (!ready) return
    const pause = window.setTimeout(() => setBarFading(true), 1000)
    const hide = window.setTimeout(() => {
      setBarVisible(false)
      setButtonVisible(true)
    }, 1600)
    return () => {
      window.clearTimeout(pause)
      window.clearTimeout(hide)
    }
  }, [ready])

  const start = (): void => {
    if (leaving) return
    setLeaving(true)
    void window.newscribe.startWelcome()
    window.setTimeout(() => {
      void window.newscribe.finishWelcome()
    }, 240)
  }

  return (
    <div className={`welcome-screen${leaving ? ' leaving' : ''}`}>
      <img className="welcome-art" src={welcomeUrl} alt="NewScribe" draggable={false} />
      <div className={`welcome-actions${buttonVisible ? ' ready' : ''}`}>
        {barVisible && (
          <div className={`welcome-progress-block${barFading ? ' fading' : ''}`}>
            <div className="welcome-progress" aria-hidden="true">
              <div className="welcome-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="welcome-status">{STEPS[step]}</p>
          </div>
        )}
        {buttonVisible && (
          <>
            <button className="welcome-button" onClick={start}>
              {english ? 'Get started' : '欢迎使用'}
            </button>
            <p className="welcome-hint">{english ? 'Click to continue' : '点击继续'}</p>
          </>
        )}
      </div>
    </div>
  )
}

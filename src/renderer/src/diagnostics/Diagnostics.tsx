import { useEffect, useRef, useState } from 'react'
import type { AppInfo, CheckResult, DiagnosticsReport } from '@shared/types'
import { runDiagnostics } from './run'

const logoUrl = new URL('../assets/logo.svg', import.meta.url).href

const VERDICT_TITLE: Record<DiagnosticsReport['verdict'], string> = {
  ready: '核心能力全部就绪',
  degraded: '核心能力可用，有降级项',
  blocked: '存在阻塞项，需要处理'
}

function Logo() {
  return <img className="logo" src={logoUrl} alt="NewScribe" />
}

function CheckRow({ check }: { check: CheckResult }) {
  const mark = check.status === 'ok' ? '✓' : check.status === 'warn' ? '!' : '×'
  return (
    <div className="check">
      <span className="dot" data-status={check.status}>
        {mark}
      </span>
      <div className="check-main">
        <div className="check-label">{check.label}</div>
        <div className="check-detail">{check.detail}</div>
      </div>
      <div className="check-ms">{check.ms !== undefined ? `${Math.round(check.ms)} ms` : ''}</div>
    </div>
  )
}

export function Diagnostics() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [checks, setChecks] = useState<CheckResult[]>([])
  const [running, setRunning] = useState(true)
  const [summary, setSummary] = useState('')
  const [verdict, setVerdict] = useState<DiagnosticsReport['verdict']>('ready')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    void (async () => {
      let report: DiagnosticsReport
      try {
        const appInfo = await window.newscribe.getAppInfo()
        setInfo(appInfo)

        report = await runDiagnostics(appInfo, (check) => {
          setChecks((previous) => [...previous, check])
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        report = {
          createdAt: new Date().toISOString(),
          app: {
            appVersion: 'unknown',
            electron: 'unknown',
            chrome: 'unknown',
            node: 'unknown',
            platform: 'unknown',
            arch: 'unknown',
            locale: 'zh-CN'
          },
          checks: [{ id: 'fatal', label: '自检没有跑完', status: 'fail', detail: message }],
          summary: `自检中断：${message}`,
          verdict: 'blocked'
        }
      }

      setChecks(report.checks)
      setSummary(report.summary)
      setVerdict(report.verdict)
      setRunning(false)

      await window.newscribe.finishDiagnostics(report)
    })()
  }, [])

  return (
    <div className="app">
      <div className="shell">
        <header className="brand">
          <Logo />
          <div>
            <h1>NewScribe</h1>
            <p>手绘白板动画工作台</p>
          </div>
          <span className="stage">P0 · 环境自检</span>
        </header>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>{running ? '正在检测运行环境…' : VERDICT_TITLE[verdict]}</h2>
              <p className="muted">
                这一页确认这台机器是否具备「解码 → 绘制 → 编码」的完整能力。只需几十秒。
              </p>
            </div>
            {running && <span className="spinner" aria-label="检测中" />}
          </div>

          <div className="checks">
            {checks.map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
            {running && (
              <div className="check skeleton">
                <span className="dot" />
                <div className="skeleton-line" />
              </div>
            )}
          </div>

          {!running && (
            <div className={`verdict ${verdict}`}>
              <strong>{VERDICT_TITLE[verdict]}</strong>
              <span>{summary}</span>
            </div>
          )}
        </section>

        <footer className="meta">
          <span>
            Electron {info?.electron ?? '—'} · Chromium {info?.chrome ?? '—'} · Node {info?.node ?? '—'}
          </span>
          <span>{info ? `${info.platform} ${info.arch}` : ''}</span>
        </footer>
      </div>
    </div>
  )
}

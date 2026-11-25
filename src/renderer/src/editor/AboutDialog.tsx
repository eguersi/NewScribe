import { useEffect, useState } from 'react'
import { useLanguage } from './i18n'

const aboutUrl = new URL('../assets/about-panel.png', import.meta.url).href
const welcomeUrl = new URL('../assets/welcome.svg', import.meta.url).href

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const language = useLanguage()
  const [welcomePreview, setWelcomePreview] = useState(false)
  const [version, setVersion] = useState('0.1.1')
  const en = language === 'en'
  useEffect(() => {
    void window.newscribe.getAppInfo().then((info) => setVersion(info.appVersion))
  }, [])
  const openHelp = (): void => {
    void window.newscribe.openHelp(en ? 'en' : 'zh')
  }

  if (welcomePreview) {
    return (
      <div className="modal-backdrop about-backdrop">
        <div className="about-welcome-panel">
          <img src={welcomeUrl} alt="NewScribe" className="about-welcome-art" />
          <button className="about-welcome-button" onClick={() => setWelcomePreview(false)}>
            {en ? 'Get started' : '欢迎使用'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop about-backdrop">
      <div className="about-panel">
        <img src={aboutUrl} alt="" className="about-panel-art" />
        <button className="about-close-icon" onClick={onClose} aria-label={en ? 'Close' : '关闭'}>×</button>
        <div className="about-panel-content">
          <p className="about-panel-sub">
            {en ? 'Hand-drawn whiteboard animation studio' : '手绘白板动画工作台'}
            {' · v'}
            {version}
          </p>
          <p className="about-panel-tech">
            <a href="https://www.electronjs.org/" target="_blank" rel="noopener noreferrer">Electron</a>
            {' + '}
            <a href="https://react.dev/" target="_blank" rel="noopener noreferrer">React</a>
            {' + '}
            <a href="https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API" target="_blank" rel="noopener noreferrer">Canvas 2D</a>
            {' · 1080p / 30fps'}
          </p>

          <div className="about-body">
            <p className="about-intro">
              {en
                ? 'NewScribe is a local-first whiteboard animation studio. Arrange images, SVG, text, shapes, charts, tables, QR codes, formulas, molecules, and IPA on a canvas, then animate them with a deterministic camera timeline and export MP4.'
                : 'NewScribe 是一个本地优先的手绘白板动画工作台。可以在画布上摆放图片、SVG、文字、图形、图表、表格、二维码、公式、分子结构和国际音标，用确定性的镜头时间轴制作动画并导出 MP4。'}
            </p>

            <div className="about-block">
              <h4>{en ? 'Author and license' : '作者与许可'}</h4>
              <p>
                {en ? 'Author: 祝鱼贵 (Eguersi). Released under the ' : '作者：祝鱼贵（Eguersi）。以 '}
                <a href="https://github.com/eguersi/NewScribe/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT License</a>
                {en ? '. Version ' : ' 发布。版本 '}
                {version}.
              </p>
              <p>
                {en
                  ? 'Inspired by Sparkol VideoScribe, but contains no VideoScribe code. The code was made with the DeepSeek V4.1 Flash 1017 model in a Vibe Coding workflow. The NewScribe logo and the three file-format icons were designed by Eguersi.'
                  : 'NewScribe 受 Sparkol VideoScribe 启发，但不包含任何 VideoScribe 代码。代码使用 DeepSeek V4.1 Flash 1017 模型进行 Vibe Coding 制作。NewScribe logo 和三种文件格式图标由 Eguersi 设计。'}
              </p>
            </div>

            <div className="about-block">
              <h4>{en ? 'Technical route' : '技术路线'}</h4>
              <p>
                {en ? 'The desktop app uses ' : '桌面应用使用 '}
                <a href="https://www.electronjs.org/" target="_blank" rel="noopener noreferrer">Electron</a>
                {en ? ' main and preload processes and ' : ' 主进程和预加载层，界面使用 '}
                <a href="https://react.dev/" target="_blank" rel="noopener noreferrer">React</a>
                {en ? ' for the interface. Rendering uses ' : '。渲染使用 '}
                <a href="https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API" target="_blank" rel="noopener noreferrer">Canvas 2D</a>
                {en ? ' for deterministic frames, with ' : ' 做确定性逐帧渲染，状态管理使用 '}
                <a href="https://github.com/pmndrs/zustand" target="_blank" rel="noopener noreferrer">Zustand</a>
                {en ? '. Export uses ' : '。导出使用 '}
                <a href="https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API" target="_blank" rel="noopener noreferrer">WebCodecs</a>
                {en ? ' and ' : ' 和 '}
                <a href="https://github.com/Vanilagy/mp4-muxer" target="_blank" rel="noopener noreferrer">mp4-muxer</a>
                {en ? ' for H.264/AAC. Formulas use ' : ' 编码 H.264/AAC。公式使用 '}
                <a href="https://www.mathjax.org/" target="_blank" rel="noopener noreferrer">MathJax</a>
                {en ? ' and ' : ' 和 '}
                <a href="https://mhchem.github.io/MathJax-mhchem/" target="_blank" rel="noopener noreferrer">mhchem</a>
                {en ? '; molecules use ' : '；分子使用 '}
                <a href="https://www.rdkit.org/" target="_blank" rel="noopener noreferrer">RDKit</a>
                <a href="https://webassembly.org/" target="_blank" rel="noopener noreferrer"> WebAssembly</a>
                {en ? '; IPA uses ' : '；国际音标使用 '}
                <a href="https://fonts.google.com/noto/specimen/Noto+Sans" target="_blank" rel="noopener noreferrer">Noto Sans</a>
                {en ? '.' : '。'}
              </p>
            </div>

            <div className="about-block">
              <h4>{en ? 'Credits and licenses' : '引用与致谢'}</h4>
              <p>
                <a href="https://www.mathjax.org/" target="_blank" rel="noopener noreferrer">MathJax</a>
                {' / '}
                <a href="https://mhchem.github.io/MathJax-mhchem/" target="_blank" rel="noopener noreferrer">mhchem</a>
                {' (Apache-2.0) · '}
                <a href="https://www.rdkit.org/" target="_blank" rel="noopener noreferrer">RDKit</a>
                {' / '}
                <a href="https://github.com/rdkit/rdkit-js" target="_blank" rel="noopener noreferrer">@rdkit/rdkit</a>
                {' (BSD-3-Clause) · '}
                <a href="https://react.dev/" target="_blank" rel="noopener noreferrer">React</a>
                {', '}
                <a href="https://www.electronjs.org/" target="_blank" rel="noopener noreferrer">Electron</a>
                {', '}
                <a href="https://github.com/pmndrs/zustand" target="_blank" rel="noopener noreferrer">Zustand</a>
                {', '}
                <a href="https://github.com/101arrowz/fflate" target="_blank" rel="noopener noreferrer">fflate</a>
                {', '}
                <a href="https://github.com/kazuhikoarase/qrcode-generator" target="_blank" rel="noopener noreferrer">qrcode-generator</a>
                {', '}
                <a href="https://github.com/Vanilagy/mp4-muxer" target="_blank" rel="noopener noreferrer">mp4-muxer</a>
                {' (MIT) · '}
                <a href="https://fonts.google.com/noto/specimen/Noto+Sans" target="_blank" rel="noopener noreferrer">Noto Sans</a>
                {' (SIL OFL-1.1).'}
              </p>
            </div>
          </div>

          <div className="about-links">
            <a className="about-chip" href="https://github.com/eguersi/NewScribe" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a className="about-chip" href="https://github.com/eguersi/NewScribe/releases" target="_blank" rel="noopener noreferrer">Releases</a>
            <a className="about-chip" href="https://github.com/eguersi/NewScribe/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT</a>
            <button className="about-chip" onClick={openHelp}>{en ? 'Help' : '帮助'}</button>
            <button className="about-chip" onClick={() => setWelcomePreview(true)}>{en ? 'Welcome' : '欢迎页'}</button>
          </div>

          <p className="about-star">
            <a href="https://github.com/eguersi/NewScribe" target="_blank" rel="noopener noreferrer">
              {en ? 'If NewScribe is useful, please leave a Star on GitHub.' : '如果觉得 NewScribe 有用，欢迎在 GitHub 点个 Star。'}
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

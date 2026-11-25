import { useEffect } from 'react'
import { useLanguage } from './i18n'
import type { ProjectFormat } from './persistence'

export function SaveFormatDialog({
  saveAs,
  onChoose,
  onExport,
  onCancel
}: {
  saveAs?: boolean
  onChoose: (format: ProjectFormat) => void
  onExport: () => void
  onCancel: () => void
}) {
  const language = useLanguage()
  const english = language === 'en'

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="modal-backdrop">
      <div className="modal save-format-modal">
        <div className="modal-head">
          <h2>{english ? (saveAs ? 'Save project as' : 'Save project') : saveAs ? '另存为工程' : '保存工程'}</h2>
        </div>
        <div className="save-format-intro">
          <p>
            {english
              ? 'Saving keeps the project editable. It does not create a video. Export separately when you want an MP4.'
              : '保存只是保存可编辑工程，不会生成视频。需要视频时请另外选择“导出视频”。'}
          </p>
        </div>
        <div className="save-format-grid">
          <button className="save-format-card" onClick={() => onChoose('nscribe')}>
            <span className="save-format-suffix">.nscribe</span>
            <strong>{english ? 'Local project' : '本地工程'}</strong>
            <span>
              {english
                ? 'Best for editing on this computer. Uses a project file plus a .assets folder beside it. Fast to save and good for autosave.'
                : '适合在本机继续编辑。工程文件旁边会有一个 .assets 素材文件夹，保存速度快，自动保存更稳定。'}
            </span>
            <em>{english ? 'Choose this for everyday editing' : '日常编辑推荐使用这个'}</em>
          </button>
          <button className="save-format-card share" onClick={() => onChoose('nspkg')}>
            <span className="save-format-suffix">.nspkg</span>
            <strong>{english ? 'Share package' : '分享工程'}</strong>
            <span>
              {english
                ? 'One self-contained file with images, SVG, audio, and custom hands inside. Best for sending to someone else or opening on Android.'
                : '单个文件，内部包含图片、SVG、音频和自定义手势。适合发给别人，或以后在 Android 上直接打开。'}
            </span>
            <em>{english ? 'Choose this when sharing' : '分享给别人时使用这个'}</em>
          </button>
        </div>
        <p className="save-format-note">
          {english
            ? 'Both formats can be opened in NewScribe. The share package is larger because it contains all assets.'
            : '两种格式都可以用 NewScribe 打开。分享工程因为包含全部素材，文件会更大。'}
        </p>
        <div className="modal-actions">
          <button className="tool-btn" onClick={onCancel}>
            {english ? 'Cancel' : '取消'}
          </button>
          <button className="tool-btn" onClick={onExport}>
            {english ? 'Export video instead' : '导出视频'}
          </button>
        </div>
      </div>
    </div>
  )
}

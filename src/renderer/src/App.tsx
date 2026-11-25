import { Diagnostics } from './diagnostics/Diagnostics'
import { Editor } from './editor/Editor'
import { WelcomeScreen } from './editor/WelcomeScreen'

const diagnoseMode = new URLSearchParams(window.location.search).get('diagnose') === '1'
const welcomeMode = new URLSearchParams(window.location.search).get('welcome') === '1'

export default function App() {
  if (welcomeMode) return <WelcomeScreen />
  return diagnoseMode ? <Diagnostics /> : <Editor />
}

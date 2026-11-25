; Generated at install time only. Do not commit a desktop.ini in the app folder.
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
Var AssociateScribeCheckbox
Var DesktopShortcutCheckbox
Var AssociateScribe
Var DesktopShortcut

!macro customPageAfterChangeDir
  Page custom NewScribeOptionsPageCreate NewScribeOptionsPageLeave
!macroend

Function NewScribeOptionsPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "安装 NewScribe 时可以选择以下选项："
  Pop $0

  ${NSD_CreateCheckbox} 0 32u 100% 12u "关联 .scribe 文件（VideoScribe 工程）"
  Pop $AssociateScribeCheckbox
  ${NSD_Check} $AssociateScribeCheckbox

  ${NSD_CreateCheckbox} 0 54u 100% 12u "创建桌面快捷方式"
  Pop $DesktopShortcutCheckbox
  ${NSD_Check} $DesktopShortcutCheckbox

  nsDialogs::Show
FunctionEnd

Function NewScribeOptionsPageLeave
  ${NSD_GetState} $AssociateScribeCheckbox $AssociateScribe
  ${NSD_GetState} $DesktopShortcutCheckbox $DesktopShortcut
FunctionEnd
!endif

!macro WriteScribeAssociation
  WriteRegStr HKCU "Software\Classes\.scribe" "" "NewScribe.Scribe"
  WriteRegStr HKCU "Software\Classes\NewScribe.Scribe" "" "NewScribe VideoScribe Project"
  WriteRegStr HKCU "Software\Classes\NewScribe.Scribe\DefaultIcon" "" "$INSTDIR\resources\icon-scribe-file.ico,0"
  WriteRegStr HKCU "Software\Classes\NewScribe.Scribe\shell\open\command" "" '"$INSTDIR\NewScribe.exe" "%1"'
!macroend

!macro RemoveScribeAssociation
  ReadRegStr $0 HKCU "Software\Classes\.scribe" ""
  ${If} $0 == "NewScribe.Scribe"
    DeleteRegKey HKCU "Software\Classes\.scribe"
  ${EndIf}
  DeleteRegKey HKCU "Software\Classes\NewScribe.Scribe"
!macroend

!macro customInstall
  ${If} $AssociateScribe == ""
    StrCpy $AssociateScribe ${BST_CHECKED}
  ${EndIf}
  ${If} $DesktopShortcut == ""
    StrCpy $DesktopShortcut ${BST_CHECKED}
  ${EndIf}

  ${If} $AssociateScribe == ${BST_CHECKED}
    !insertmacro WriteScribeAssociation
  ${Else}
    !insertmacro RemoveScribeAssociation
  ${EndIf}

  ${If} $DesktopShortcut != ${BST_CHECKED}
    Delete "$DESKTOP\NewScribe.lnk"
  ${EndIf}

  WriteINIStr "$INSTDIR\desktop.ini" ".ShellClassInfo" "IconResource" "resources\folder.ico,0"
  WriteINIStr "$INSTDIR\desktop.ini" ".ShellClassInfo" "IconFile" "resources\folder.ico"
  WriteINIStr "$INSTDIR\desktop.ini" ".ShellClassInfo" "IconIndex" "0"
  System::Call 'kernel32::SetFileAttributes(t "$INSTDIR\desktop.ini", i 6)'
  System::Call 'kernel32::SetFileAttributes(t "$INSTDIR", i 1)'
!macroend

!macro customUnInstall
  IfSilent +3
  MessageBox MB_YESNO|MB_ICONQUESTION "是否确认卸载 NewScribe？" IDYES +2
  Quit

  !insertmacro RemoveScribeAssociation
  Delete "$DESKTOP\NewScribe.lnk"

  System::Call 'kernel32::SetFileAttributes(t "$INSTDIR", i 128)'
  Delete "$INSTDIR\desktop.ini"
!macroend

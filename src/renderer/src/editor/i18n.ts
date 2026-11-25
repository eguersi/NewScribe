import { useEffect, useState } from 'react'

export type Language = 'zh' | 'en'

let current: Language = 'zh'
const listeners = new Set<(language: Language) => void>()

const EN: Record<string, string> = {
  // Common
  确定: 'OK',
  取消: 'Cancel',
  关闭: 'Close',
  '关闭（Esc）': 'Close (Esc)',
  '正在建立描绘缓存…': 'Building drawing cache…',
  '首次预览多元素工程时可能需要一些时间，之后会快很多':
    'The first preview of a multi-element project may take a while; later previews will be much faster.',
  结尾展示: 'Ending',
  准备: 'Ready',
  完成: 'Done',
  删除: 'Delete',
  保存: 'Save',
  打开: 'Open',
  新建: 'New',
  编辑: 'Edit',
  视图: 'View',
  帮助: 'Help',
  文件: 'File',
  是: 'Yes',
  否: 'No',
  秒: 's',
  无: 'None',
  自动: 'Auto',
  默认: 'Default',
  名称: 'Name',
  路径: 'Path',
  大小: 'Size',
  时间: 'Time',
  标题: 'Title',
  作者: 'Author',
  备注: 'Comment',
  颜色: 'Color',
  背景: 'Background',
  透明度: 'Opacity',
  宽度: 'Width',
  高度: 'Height',
  位置: 'Position',
  旋转: 'Rotation',
  时长: 'Duration',
  暂停: 'Hold',
  切换: 'Transition',
  消失: 'Disappear',
  出现: 'Appear',
  描绘: 'Draw',
  位图描绘: 'Bitmap draw',
  淡入: 'Fade',
  移动: 'Move',
  缩放: 'Zoom',
  旋转出现: 'Spin',
  手写: 'Typewriter',
  只描边: 'Stroke only',
  手势: 'Hand',
  无手势: 'No hand',
  默认手势: 'Default hand',
  导入手势图片: 'Import hand image',
  音量: 'Volume',
  循环播放: 'Loop',
  移除音轨1: 'Remove track 1',
  移除音轨2: 'Remove track 2',
  添加音轨2: 'Add track 2',
  导入背景音乐: 'Import background music',
  支持: 'Supports',
  也可以直接把音频拖进窗口: 'or drag audio into the window',
  素材: 'Assets',
  素材库: 'Asset library',
  最近添加: 'Recent',
  网络检索: 'Web search',
  'AI 生成': 'AI Generate',
  'AI 素材库': 'AI Library',
  添加库: 'Add library',
  移除最近添加: 'Clear recent',
  移除这个库: 'Remove library',
  搜索素材: 'Search assets',
  搜索网络素材: 'Search web assets',
  搜索: 'Search',
  搜索中: 'Searching',
  来源: 'Sources',
  搜索网络上的: 'Search the web for',
  和开放版权图片: 'and open-license images',
  没有找到结果: 'No results',
  输入关键词: 'Enter a keyword',
  未搜索到文件: 'No files found',
  还没有最近添加的素材: 'No recent assets yet',
  这个文件夹里没有图片或SVG: 'No images or SVG files in this folder',
  还没有生成过SVG: 'No generated SVG yet',
  去配置API: 'Configure API',
  生成SVG: 'Generate SVG',
  生成中: 'Generating',
  打开网页: 'Open webpage',
  保存到本地: 'Save locally',
  插入: 'Insert',
  导入: 'Import',
  更换: 'Replace',
  添加: 'Add',
  移除: 'Remove',
  选择: 'Choose',
  浏览: 'Browse',
  文件名: 'File name',
  导出位置: 'Export location',
  分辨率: 'Resolution',
  帧率: 'Frame rate',
  自定义: 'Custom',
  视频信息: 'Video info',
  打开所在文件夹: 'Show in folder',
  打开文件: 'Open file',
  开始导出: 'Start export',
  取消导出: 'Cancel export',
  导出完成: 'Export complete',
  导出MP4: 'Export MP4',
  导出视频: 'Export video',
  导出所有素材: 'Export all assets',
  打开所在位置: 'Show location',
  从导航页移除: 'Remove from home',
  删除文件: 'Delete file',
  导出: 'Export',
  导出图像: 'Export image',
  替换元素: 'Replace element',
  复制: 'Copy',
  复制一份: 'Duplicate',
  粘贴: 'Paste',
  全选: 'Select all',
  挪动到: 'Move to',
  上一个: 'Previous',
  下一个: 'Next',
  开头: 'Start',
  结尾: 'End',
  从该元素预览: 'Preview from element',
  水平翻转: 'Flip horizontal',
  从头预览: 'Preview from start',
  从选中预览: 'Preview selection',
  固定视角: 'Pin view',
  固定为当前视角: 'Pin current view',
  从该元素开始预览: 'Preview from this element',
  撤销: 'Undo',
  重做: 'Redo',
  矩形: 'Rectangle',
  三角形: 'Triangle',
  平行四边形: 'Parallelogram',
  梯形: 'Trapezoid',
  圆形: 'Circle',
  箭状: 'Arrow shape',
  星形: 'Star',
  爱心型: 'Heart',
  箭头: 'Arrow',
  任意图形: 'Freeform',
  任意不规则图形: 'Freeform',
  曲线: 'Curve',
  图形编辑器: 'Shape editor',
  图形: 'Shape',
  闭合路径: 'Closed path',
  铅笔: 'Pencil',
  描边: 'Stroke',
  填充: 'Fill',
  节点: 'Node',
  粗细: 'Width',
  线型: 'Line style',
  实线: 'Solid',
  虚线: 'Dashed',
  点线: 'Dotted',
  适应窗口: 'Fit window',
  全屏: 'Fullscreen',
  退出全屏: 'Exit fullscreen',
  实际大小: 'Actual size',
  放大: 'Zoom in',
  缩小: 'Zoom out',
  重新加载: 'Reload',
  开发者工具: 'Developer tools',
  退出: 'Quit',
  关于: 'About',
  首选项: 'Preferences',
  常规: 'General',
  外观: 'Appearance',
  默认值: 'Defaults',
  启动: 'Startup',
  库和素材: 'Library & assets',
  语言: 'Language',
  中文: 'Chinese',
  英文: 'English',
  跟随系统: 'System',
  深色: 'Dark',
  浅色: 'Light',
  主题: 'Theme',
  工具栏紧凑模式: 'Compact toolbar',
  开启后编辑页工具栏只显示图标鼠标悬浮可看说明:
    'Only icons are shown in the editor toolbar; hover an icon to see its label.',
  编辑器展示原画布大小之外的空间: 'Show space outside the original canvas',
  开启后画布外区域也使用当前背景色和纹理方便编辑画布外元素:
    'The area outside the canvas also uses the current background colour and texture, making off-canvas elements easier to edit.',
  定时自动保存: 'Autosave',
  自动保存间隔: 'Autosave interval',
  自动保存: 'Autosave',
  当前工程有未保存的修改: 'This project has unsaved changes.',
  未保存的修改: 'Unsaved changes',
  不保存直接新建: 'Discard and create',
  保存并新建: 'Save and create',
  不保存返回: 'Discard and return',
  保存并返回: 'Save and return',
  新建工程: 'New project',
  打开工程: 'Open project',
  查看帮助: 'Help',
  检索本机工程: 'Find projects',
  进入编辑器: 'Open editor',
  最近项目: 'Recent projects',
  没有找到工程: 'No projects found',
  当前没有元素: 'No elements yet',
  当前没有元素请添加元素后再保存: 'No elements to save',
  当前没有元素请添加元素后再预览: 'No elements to preview',
  当前没有元素请添加元素后再导出: 'No elements to export',
  导入素材: 'Import assets',
  文字: 'Text',
  图表: 'Chart',
  库: 'Library',
  未命名: 'Untitled',
  元素: 'elements',
  个元素: 'elements',
  文档: 'Document',
  工程: 'Project',
  保存工程: 'Save project',
  另存为: 'Save as',
  导入图片: 'Import image',
  下载更新: 'Check for updates',
  使用帮助: 'Help',
  关于NewScribe: 'About NewScribe',
  文件信息: 'File info',
  纸张纹理: 'Paper texture',
  纸张纤维: 'Paper fiber',
  细颗粒: 'Fine grain',
  纹理强度: 'Texture strength',
  帆布: 'Canvas weave',
  亚麻布: 'Linen',
  凹凸压纹: 'Embossed',
  皮革: 'Leather',
  纹理固定于画面: 'Fixed texture',
  背景图片: 'Background image',
  固定背景: 'Fixed background',
  平铺: 'Tile',
  拉伸: 'Stretch',
  背景音乐: 'Background music',
  音轨: 'Track',
  淡入淡出: 'Fade',
  循环: 'Loop',
  选择背景图片: 'Choose background image',
  更换图片: 'Replace image',
  移除背景图: 'Remove background',
  显示输出框: 'Show output frame',
  蓝框内即导出画面: 'The blue frame is the exported frame',
  画布: 'Canvas',
  画布尺寸: 'Canvas size',
  预设: 'Preset',
  横屏: 'Landscape',
  竖屏: 'Portrait',
  方形: 'Square',
  元素列表: 'Layers',
  机位: 'Camera',
  回机位: 'Return camera',
  从当前预览: 'Preview from current',
  替换背景音频: 'Replace background audio',
  替换音频: 'Replace audio',
  已替换音频: 'Audio replaced',
  之前全部元素: 'Previous elements',
  全部元素: 'All elements',
  特定元素: 'Specific element',
  作用于元素: 'Target element',
  请选择元素: 'Select an element',
  多选时统一修改所有选中元素的动画时长:
    'Changes the animation duration for all selected elements.',
  '输入 X / Y 会把所有选中元素对齐到同一个左上角位置；旋转会把它们设成同一个角度。多选时也可以在画布上拖动，或拖选区四角整体缩放。':
    'Entering X / Y aligns all selected elements to the same top-left position; rotation sets them to the same angle. You can also drag or resize the selection on the canvas.',
  '默认只挖掉蒙版之前的元素，蒙版之后新增的内容会正常显示。编辑时显示虚线框，预览和导出中不显示边框。':
    'By default, only elements before the mask are cut out; content added after the mask stays visible. The dashed outline appears only in the editor.',
  '把当前画布视角固定到所有选中元素上。':
    'Freezes the current canvas view on all selected elements.',
  '这个 GIF / WebP 是单帧图片，没有可播放的动画。':
    'This GIF / WebP is a single-frame image and has no animation to play.',
  '编辑时默认停在首帧，点击播放才会在此处预览动画。':
    'The editor stays on the first frame by default; click Play to preview the animation.',
  动画: 'Animation',
  直线: 'Line',
  线段: 'Line segment',
  不规则: 'Freeform',
  当前缩放过大元素显示可能出现问题: 'Zoom is too large; elements may render incorrectly.',
  当前缩放过小元素显示可能出现问题: 'Zoom is too small; elements may render incorrectly.',
  '当前缩放过大，元素显示可能出现问题': 'Zoom is too large; elements may render incorrectly.',
  '当前缩放过小，元素显示可能出现问题': 'Zoom is too small; elements may render incorrectly.',
  场景: 'Scene',
  开始: 'Start',
  结束: 'End',
  总时长: 'Total duration',
  时间轴: 'Timeline',
  预览: 'Preview',
  正在准备描绘动画: 'Preparing drawing animation',
  描绘动画: 'Drawing animation',
  有SVG的路径数据过于复杂: 'An SVG has overly complex path data',
  已自动改用整图描绘: 'switched to full-image drawing',
  为保持流畅: 'to keep playback smooth',
  导出完成后自动打开所在文件夹: 'Open output folder after export',
  默认导出位置: 'Default export location',
  默认清晰度: 'Default quality',
  默认帧率: 'Default frame rate',
  留空则使用系统视频文件夹: 'Leave empty to use the system Videos folder',
  清晰度会按当前画幅比例换算宽高: 'Quality is converted to the current canvas aspect ratio',
  启用最近添加: 'Enable Recent',
  加入VideoScribe素材库: 'Add VideoScribe libraries',
  网络搜索来源: 'Web sources',
  绑定scribe到NewScribe: 'Associate .scribe with NewScribe',
  解除绑定: 'Remove association',
  绑定: 'Associate',
  关闭Esc: 'Close (Esc)',
  播放: 'Play',
  '该SVG文件存在声明式动画，当前版本暂不支持播放。':
    'This SVG contains declarative animation, which is not supported in this version.',
  '检测到 SVG 声明式动画，当前版本暂不支持播放':
    'Declarative SVG animation detected; playback is not supported in this version.',
  播放行为: 'Playback',
  播放一次动画: 'Play once',
  循环播放动画: 'Loop',
  固定到首帧: 'First frame',
  固定到尾帧: 'Last frame',
  开始时间: 'Start',
  出现后开始: 'After appear',
  出现时开始: 'With appear',
  结束时间: 'End',
  切换时结束: 'At transition',
  切换后结束: 'After transition',
  持续播放: 'Keep playing',
  停止播放: 'Stop',
  随镜头缩放: 'Scale with camera',
  重播: 'Replay',
  从头: 'Restart',
  正在搜索: 'Searching',
  正在打开工程: 'Opening project',
  文件格式不受支持或已经损坏: 'Unsupported or damaged project file',
  无法读取工程数据: 'Could not read project data',
  导入失败: 'Import failed',
  下载失败: 'Download failed',
  插入失败: 'Insert failed'
}

Object.assign(EN, {
  上移一层: 'Bring forward',
  下移一层: 'Send backward',
  删除元素: 'Delete element',
  出现动画: 'Appearance animation',
  出现时长: 'Appear duration',
  切换时长: 'Transition duration',
  暂停时长: 'Hold duration',
  拉远时长: 'Zoom-out duration',
  停留: 'Hold',
  层级: 'Layer',
  方向: 'Direction',
  方式: 'Style',
  显示方式: 'Display',
  类型: 'Type',
  图例: 'Legend',
  标签: 'Labels',
  数值: 'Values',
  数据: 'Data',
  标题: 'Title',
  字体: 'Font',
  文字默认字体: 'Default text font',
  应用到全部文字: 'Apply to all text',
  'SVG 文字字体': 'SVG text font',
  使用SVG默认字体: 'Use SVG default font',
  只替换SVG内部texttspan的字体不修改图形路径:
    'Only replaces the font of text/tspan inside the SVG; shape paths are unchanged.',
  '只替换 SVG 内部 text/tspan 的字体，不修改图形路径。':
    'Only replaces the font of text/tspan inside the SVG; shape paths are unchanged.',
  竖排: 'Vertical',
  '推荐使用可商用或开源字体（如思源、文泉驿、得意黑、更纱黑体、霞鹜系列），可降低字体版权风险。':
    'Using commercially usable or open-source fonts (such as Source Han, WenQuanYi, Smiley Sans, Sarasa Gothic, and LXGW) is recommended to reduce font licensing risk.',
  '当前系统未检测到该字体，文字会使用后备字体显示。':
    'This font was not detected on this system; fallback fonts will be used.',
  '推荐使用可商用或开源字体，以降低 SVG 字体版权风险。':
    'Using commercially usable or open-source fonts is recommended to reduce SVG font licensing risk.',
  '当前系统未检测到该字体，将使用后备字体显示。':
    'This font was not detected on this system; a fallback font will be used.',
  字号: 'Size',
  加粗: 'Bold',
  斜体: 'Italic',
  下划线: 'Underline',
  删除线: 'Strikethrough',
  对齐: 'Align',
  颜色: 'Color',
  宽: 'Width',
  高: 'Height',
  笔尖X: 'Tip X',
  笔尖Y: 'Tip Y',
  手势高度: 'Hand size',
  手势大小: 'Hand scaling',
  相对画面随镜头缩放: 'Relative to view (scales with camera)',
  固定屏幕大小: 'Fixed screen size',
  表格: 'Table',
  直方图: 'Histogram',
  思维导图: 'Mind map',
  形状: 'Shape',
  蒙版: 'Mask',
  椭圆形: 'Ellipse',
  作用于: 'Applies to',
  全部元素: 'All elements',
  其他: 'More',
  数学公式: 'Math formula',
  公式: 'Formula',
  分子结构: 'Molecule structure',
  分数: 'Fraction',
  根号: 'Square root',
  上下标: 'Superscript / subscript',
  求和: 'Summation',
  积分: 'Integral',
  化学式: 'Chemical formula',
  独立公式: 'Display formula',
  LaTeX: 'LaTeX',
  '化学公式使用 mhchem，例如': 'Chemical formulas use mhchem, for example ',
  '；物理公式可直接使用 LaTeX。': '; physics formulas can use LaTeX directly.',
  清空: 'Clear',
  钢笔: 'Pen',
  图形是空的: 'The shape is empty',
  '当前没有节点。': 'There are no nodes yet.',
  '描边和填充都已关闭。': 'Stroke and fill are both turned off.',
  '退出后画面上不会显示这个图形。': 'This shape will not appear on the canvas after you leave.',
  继续编辑: 'Continue editing',
  仍然退出: 'Leave anyway',
  '按住鼠标绘制任意形状': 'Hold the mouse button to draw a freeform shape',
  '拖动节点调整位置，或切换到铅笔自由绘制': 'Drag nodes to adjust the shape, or switch to Pencil for freehand drawing',
  二维码: 'QR code',
  即将支持: 'Coming soon',
  内容: 'Content',
  容错级别: 'Error correction',
  前景色: 'Foreground',
  留白边距: 'Quiet zone',
  网址或文字: 'URL or text',
  透明背景: 'Transparent background',
  大纲: 'Outline',
  每缩进两个空格代表下一级节点: 'Indent two spaces for the next level.',
  横向间距: 'Horizontal gap',
  纵向间距: 'Vertical gap',
  节点填充: 'Node fill',
  节点描边: 'Node border',
  文字颜色: 'Text color',
  连线颜色: 'Connector color',
  描绘角度: 'Bitmap angle',
  同时淡入: 'Fade in too',
  图表展示: 'Chart reveal',
  矢量描绘: 'Vector draw',
  位图描绘: 'Bitmap draw',
  直接描绘: 'Draw directly',
  可视化取点: 'Pick point',
  仅Windows绑定后双击scribe默认用NewScribe打开安装了VideoScribe的用户可以随时在这里解除:
    'On Windows only: .scribe files open in NewScribe after binding. You can unbind at any time.',
  仍要继续: 'Continue anyway',
  忽略: 'Ignore',
  缺失: 'Missing',
  素材丢失: 'Missing assets',
  空画布: 'Empty canvas',
  松开以导入素材: 'Drop to import assets',
  拖动画布空白处可以平移滚轮缩放: 'Drag empty space to pan, scroll to zoom.',
  拖动卡片可调整顺序: 'Drag cards to reorder',
  搜索工程名称或路径: 'Search project name or path…',
  最近工程: 'Recent projects',
  最近打开的工程快速搜索从本机找工程: 'Recent projects, quick search, and local project scan.',
  打开导航页: 'Open home',
  打开NewScribe时: 'When NewScribe starts',
  打开上次的文档: 'Open last project',
  每次让我选择文件: 'Ask me every time',
  新建空白文档: 'New blank project',
  开始创作: 'Start creating',
  开始导出: 'Start export',
  未保存的修改: 'Unsaved changes',
  无法打开工程: 'Could not open project',
  正在准备描绘动画: 'Preparing drawing animation…',
  正在搜索网络素材: 'Searching web assets…',
  正在读取文件夹: 'Reading folder…',
  文件较大时可能需要几秒钟请不要关闭窗口: 'Large files may take a few seconds. Please keep this window open.',
  有SVG的路径数据过于复杂已自动改用整图描绘保证不卡顿:
    'An SVG path is very complex; switched to full-image drawing to keep playback smooth.',
  规划动画先沿路径描边再用粗线涂满填充区域:
    'Drawing animation: trace the path first, then fill the area with broad strokes.',
  描绘动画先沿路径描边再用粗线涂满填充区域:
    'Drawing animation: trace the path first, then fill the area with broad strokes.',
  仅Windows绑定后双击scribe默认用NewScribe打开: 'On Windows only: .scribe files open in NewScribe after binding.',
  会加入VS的Caches分类和Favourites只引用原文件夹不复制不移动:
    'Adds VideoScribe Caches categories and Favourites. Files are referenced, not copied or moved.',
  启用后加入画布的图片和SVG会记录在最近添加里:
    'Images and SVG files added to the canvas will appear in Recent.',
  只在工程已经保存过之后生效没有保存路径的新工程不会自动写文件:
    'Only works after the project has been saved; unsaved projects have no path to autosave.',
  空文档时保存和预览按钮会禁用鼠标悬停会提示先添加元素:
    'Save and preview are disabled for empty projects; hover for a hint.',
  导出完成后自动打开所在文件夹: 'Open the output folder after export',
  清晰度会按当前画幅比例换算宽高: 'Quality is converted to the current canvas aspect ratio.',
  留空则使用系统视频文件夹: 'Leave empty to use the system Videos folder',
  留空则导出时选择: 'Leave empty to choose when exporting',
  纸张纹理: 'Paper texture',
  纸张纤维: 'Paper fiber',
  细颗粒: 'Fine grain',
  背景固定不随镜头移动缩放: 'Fixed background (does not move or zoom with camera)',
  结尾展示全部元素镜头拉远后停留: 'Ending shows all elements (camera zooms out and holds)',
  多选时可以在画布上拖动或拖选区四角整体缩放:
    'With multiple elements selected, drag on the canvas or drag a corner to scale the group.',
  折线条形图支持多系列饼图只使用第一个系列的数据:
    'Line and bar charts support multiple series; pie charts use only the first series.',
  把图片SVG或音频拖进窗口或者点顶部的导入素材文字:
    'Drag images, SVG, or audio into the window, or click Import assets / Text at the top.',
  滚轮缩放拖空白处平移选中元素后拖八个手柄缩放角手柄锁比例:
    'Scroll to zoom, drag empty space to pan. Select an element and drag its handles to scale; corner handles keep the aspect ratio.',
  按住Ctrl点击可以多选多选后整组移动拖选区四角等比缩放右侧可批量改透明度和时间:
    'Hold Ctrl to select multiple elements, then move or scale them together. Opacity and timing can be edited in bulk on the right.',
  右键元素可以预览替换素材挪动到开头结尾复制粘贴删除:
    'Right-click an element to preview, replace its asset, move it, copy, paste, or delete.',
  蓝色框是输出画面框内就是导出时看到的内容可在右侧画布面板关闭:
    'The blue frame is the output view. It shows exactly what will be exported and can be hidden in the Canvas panel.',
  点顶部文字添加双击画布上的文字会直接聚焦右侧内容框:
    'Click Text at the top to add text. Double-click text on the canvas to focus its content field.',
  字体可以下拉选也可以直接输入字体名系统里没有会弹警告:
    'Choose a font from the list or type a font name; a warning appears if it is not installed.',
  颜色支持16进制输入加粗斜体下划线删除线和对齐都在右侧:
    'Hex colors are supported. Bold, italic, underline, strikethrough, and alignment are on the right.',
  打字机动画会让文字一个字一个字出现: 'The typewriter animation reveals text one character at a time.',
  每个元素有出现时长暂停时长切换时长时间轴按顺序播放:
    'Each element has appear, hold, and transition durations. The timeline plays in order.',
  出现暂停镜头移动下一个元素出现切换时长属于前一个元素:
    'Appear → hold → camera move → next element. Transition duration belongs to the previous element.',
  时间轴顶部显示总时长卡片可以左右拖动排序最后一张也能拖到最前面:
    'The total duration is shown above the timeline. Drag cards to reorder; the last card can be moved first.',
  右键卡片可以预览替换挪动到开头结尾或删除双击卡片从该元素开始预览:
    'Right-click a card to preview, replace, move, or delete it. Double-click a card to preview from that element.',
  右侧可导入背景音乐调音量和淡入淡出并选择循环播放或只播一次:
    'Import background music on the right, adjust volume and fades, and choose loop or play once.',
  也可以直接把音频拖进窗口导出为1080p30fps的MP4H264AAC有进度条可取消:
    'You can also drag audio into the window. Export is MP4 (H.264 + AAC) with progress and cancel.',
  顶部图表插入折线图条形图或饼图右侧可以改类型标题图例数值坐标轴:
    'Use Chart in the toolbar to insert a line, bar, or pie chart. Type, title, legend, values, and axes are on the right.',
  并用表格编辑标签系列名颜色和数值出现动画选描绘时:
    'Edit labels, series names, colors, and values in the table. With Draw selected:',
  折线逐段画条形生长饼图扇形扫出饼图不显示坐标轴标签和数值直接标在扇区上:
    'Lines draw segment by segment, bars grow, and pie slices sweep in. Pie charts have no axes and labels sit on slices.',
  SVG和图片的出现方式选描绘时会先显示成品图再沿路径涂鸦区域逐步揭开:
    'When Draw is selected for SVG/images, the finished image appears first and is revealed along paths.',
  右侧手势可以选择不显示内置手势或导入自己的手部图片:
    'The Hand setting can be hidden, use a built-in hand, or import your own image.',
  自定义手势可以设置笔尖XY或点可视化取点在图片上直接点笔尖位置:
    'For custom hands, set tip X/Y or click Pick point and click the tip position on the image.',
  首选项分常规默认值启动三页可以设置SVG图片导入后的默认出现方式:
    'Preferences has General, Defaults, and Startup pages for default SVG/image animations,',
  默认出现暂停切换时长新建文档背景色以及启动时新建打开上次文档或每次选择文件:
    'default durations, new-document background, and startup behavior.',
  未保存时点新建会提示取消不保存直接新建保存并新建:
    'Creating a new project with unsaved changes asks whether to cancel, discard, or save first.',
  工程文件引用的是旁边的assets文件夹如果素材被移动或删除:
    'Projects reference the adjacent .assets folder. If assets are moved or deleted,',
  打开工程时顶部会提示画布上会显示红色虚线占位框把素材放回原处即可恢复:
    'a warning appears at the top and red placeholders appear on the canvas. Restore the files to recover.',
  '导出MP4': 'Export MP4',
  添加图表: 'Add chart',
  添加文字: 'Add text',
  添加库: 'Add library',
  导入结果只会保存为nscribe不会修改原始scribe文件:
    'The import result is saved as .nscribe; the original .scribe file is not modified.',
  先把图片SVG拖进窗口或点导入素材摆位置缩放旋转:
    'Drag images/SVG into the window (or click Import assets), then position, scale, and rotate them.',
  给每个元素调好视角后点右侧固定为当前视角设置出现方式与三个时长:
    'Set a camera for each element, pin the view, then choose the appearance and durations.',
  点预览检查点导出保存MP4: 'Preview, then export to MP4.',
  元素列表: 'Elements',
  从上: 'From top',
  从下: 'From bottom',
  从左: 'From left',
  从右: 'From right',
  折线图: 'Line chart',
  条形图: 'Bar chart',
  饼图: 'Pie chart',
  背景色: 'Background color',
  画布尺寸: 'Canvas size',
  预设: 'Preset',
  横屏: 'Landscape',
  竖屏: 'Portrait',
  方形: 'Square',
  图层: 'Layer',
  显示输出框: 'Show output frame',
  显示输出框蓝框内即导出画面: 'Show output frame (the blue frame is the export)',
  添加第二条音轨: 'Add track 2',
  移除音轨: 'Remove track',
  移除音轨1: 'Remove track 1',
  移除音轨2: 'Remove track 2',
  循环播放: 'Loop',
  淡入淡出: 'Fade',
  从上到下: 'Top to bottom',
  从左到右: 'Left to right',
  从右到左: 'Right to left',
  从下到上: 'Bottom to top',
  当前没有元素请添加元素后再保存: 'No elements to save',
  当前没有元素请添加元素后再预览: 'No elements to preview',
  当前没有元素请添加元素后再导出: 'No elements to export',
  当前工程有未保存的修改要先保存再新建吗: 'This project has unsaved changes. Save before creating a new one?',
  当前工程有未保存的修改要先保存再返回导航页吗: 'This project has unsaved changes. Save before returning home?',
  文件格式不受支持或已经损坏无法读取工程数据:
    'Unsupported or damaged project file. Could not read the project data.',
  不支持的文件格式: 'Unsupported file format',
  没有可导出的元素: 'No elements to export',
  时间轴是空的先添加元素: 'The timeline is empty. Add elements first.',
  导出失败: 'Export failed',
  导入失败: 'Import failed',
  保存失败: 'Save failed',
  打开失败: 'Open failed',
  重试: 'Retry',
  跳过: 'Skip',
  全部: 'All',
  'AI 生成': 'AI Generate',
  'AI 素材库': 'AI Library',
  'AI 生成的 SVG 默认加入 AI 素材库': 'Save generated SVG to AI Library by default',
  SVG默认出现: 'Default SVG appearance',
  图片默认出现: 'Default image appearance',
  启用最近添加: 'Enable Recent',
  从最近添加中移除: 'Remove from Recent',
  加入画布: 'Add to canvas',
  固定: 'Pin',
  图: 'Chart',
  坐标轴: 'Axes',
  下载SVG: 'Download SVG',
  保存到本地: 'Save locally',
  保存AI配置: 'Save AI configuration',
  保存信息: 'Save info',
  导入手势图片: 'Import hand image',
  请先预览确认再继续制作: 'Preview to confirm before continuing.',
  关闭Esc: 'Close (Esc)',
  '关闭（Esc）': 'Close (Esc)',
  '保存到本地…': 'Save locally…',
  '导入手势图片…': 'Import hand image…',
  '可视化取点…': 'Pick point…',
  Key会加密保存在软件数据目录里: 'The key is encrypted and stored in the app data folder.',
  图例数值坐标轴: 'Legend, values, axes',
  语言Language: 'Language / Language',
  '语言 / Language': '语言 / Language',
  显示蓝色输出框: 'Show blue output frame',
  背景固定: 'Fixed background',
  结尾展示全部元素: 'Ending shows all elements',
  滚轮缩放拖空白处平移右键更多操作: 'Scroll to zoom · Drag to pan · Right-click for more',
  退出全屏Esc: 'Exit fullscreen (Esc)',
  淡化: 'Fade',
  消失动画: 'Disappear animation',
  启用消失动画: 'Enable disappear animation',
  开始时机: 'Start timing',
  暂停结束后: 'After hold',
  切换结束后: 'After transition',
  旋转消失: 'Spin out',
  移动消失: 'Move out',
  同时淡出: 'Fade out too',
  向左: 'Left',
  向右: 'Right',
  向上: 'Up',
  向下: 'Down',
  适应: 'Fit',
  输出画面: 'Output frame',
  替换元素: 'Replace element',
  导出图像: 'Export image',
  显示画面: 'Output frame',
  'SVG 默认出现': 'Default SVG appearance',
  'VideoScribe 导入（实验性）': 'VideoScribe import (experimental)',
  'VideoScribe 工程格式是逆向解析的，和 NewScribe 的结构差异很大。':
    'VideoScribe project files are reverse-engineered and differ greatly from NewScribe.',
  '导入后可能出现图形拉伸、位置偏移、机位缩放不准、字体替换、':
    'Imported projects may have stretched graphics, offset positions, inaccurate camera zoom, substituted fonts,',
  '自定义手势丢失等问题；复杂运镜和 morph 会被简化或改成描绘。':
    'missing custom hands, and complex camera moves or morphs may be simplified or converted to draw.',
  输出框: 'Output frame',
  '横屏16:9': 'Landscape 16:9',
  '竖屏9:16': 'Portrait 9:16',
  '方形1:1': 'Square 1:1',
  画布背景: 'Canvas background',
  当前为深色模式: 'Currently dark mode',
  当前为浅色模式: 'Currently light mode',
  当前为自动模式: 'Currently auto mode',
  点击切换为浅色模式: 'Click to switch to light mode',
  点击切换为深色模式: 'Click to switch to dark mode',
  支持mp3wavm4aogg也可以直接把音频拖进窗口:
    'Supports mp3 / wav / m4a / ogg. You can also drag audio into the window.',
  笔尖XY是手势图片左上角到笔尖的像素距离:
    'Tip X/Y is the distance from the image top-left to the pen tip in pixels.',
  消失是停留结束后淡出的时长填0表示一直留在画面上:
    'Disappear is the fade-out duration after hold. Use 0 to keep it on screen.',
  调整好画布的缩放和位置后点这里播放时镜头会停在这个视角:
    'Set the canvas zoom and position, then click here to hold this camera view during playback.',
  当前缩放: 'Zoom',
  中心: 'Center',
  当前没有元素: 'No elements yet',
  清空画布: 'Clear canvas',
  已选中: 'Selected',
  音频比画面长秒超出部分会被截断: 'Audio is longer than the video; the extra part will be cut.',
  有素材找不到已用占位框代替: 'Some assets were not found and are shown as placeholders.',
  当前笔尖: 'Current pen tip',
  图片像素: 'pixels',
  拉伸铺满: 'Stretch to fill',
  模型: 'Model',
  淡出: 'Fade out',
  还没有元素导入图片或SVG后会出现在这里:
    'No elements yet. Imported images or SVG will appear here.',
  选中元素: 'Selected element',
  选择: 'Choose…',
  选择笔尖中心: 'Choose pen tip',
  重新定位: 'Reposition',
  音频: 'Audio',
  默认背景色: 'Default background color',
  新建元素导入素材时使用的默认值已有元素不受影响:
    'Defaults for new elements and imported assets. Existing elements are unchanged.',
  '新建元素、导入素材时使用的默认值；已有元素不受影响。':
    'Defaults for new elements and imported assets. Existing elements are unchanged.',
  '视频信息…': 'Video info…',
  移除APIKey: 'Remove API key',
  还没有元素: 'No elements yet',
  强调色: 'Accent color',
  琥珀: 'Amber',
  海洋蓝: 'Ocean blue',
  薄荷绿: 'Mint',
  紫罗兰: 'Violet',
  玫瑰红: 'Rose',
  项目主页: 'Project homepage',
  '中文（中国大陆）': '中文（中国大陆）',
  欢迎页: 'Welcome page',
  即将开放: 'Coming soon',
  欢迎使用: 'Get started',
  点击继续: 'Click to continue',
  预览: 'Preview',
  '% · 中心': '% · Center',
  '+系列': '+ Series',
  '+行': '+ Row',
  'AI 生成的 SVG 素材': 'AI-generated SVG assets',
  'AI生成.svg': 'AI-generated.svg',
  'MP4 视频': 'MP4 video',
  'NewScribe 工程': 'NewScribe project',
  'P4 · 音乐与导出': 'P4 · Music & export',
  'SVG 图标': 'SVG icons',
  'SVG 插画': 'SVG illustration',
  'SVG 填充层渲染失败': 'SVG fill layer failed to render',
  'SVG 没有可描绘的路径，已按位图处理': 'SVG has no drawable path; using bitmap',
  'SVG 路径数据过于复杂，已改用整图描绘': 'SVG paths are too complex; using full-image drawing',
  'VideoScribe 工程': 'VideoScribe project',
  'drawing.xml 解析失败': 'drawing.xml could not be parsed',
  '「打开上次的文档」只在上次保存或打开过工程时生效；文件已被移动时会提示。':
    'Open last project only works after a project has been saved or opened; a warning appears if it was moved.',
  '「消失」是停留结束后淡出的时长，填 0 表示一直留在画面上。':
    'Disappear is the fade-out duration after hold. Use 0 to keep it on screen.',
  从开头预览: 'Preview from start',
  从选中元素开始预览: 'Preview from selected element',
  '会加入 VS 的 Caches 分类和 Favourites；只引用原文件夹，不复制、不移动。':
    'Adds VideoScribe Caches categories and Favourites. Files are referenced, not copied or moved.',
  '例如：一只戴眼镜的卡通猫，透明背景': 'e.g. a cartoon cat wearing glasses, transparent background',
  保存AISVG: 'Save AI SVG',
  保存网络素材: 'Save web asset',
  像素: 'pixels',
  '准备绘制数据…': 'Preparing drawing data…',
  删除选中的: 'Delete selected',
  剪贴板图片: 'Clipboard image',
  '只在工程已经保存过之后生效；没有保存路径的新工程不会自动写文件。':
    'Only works after the project has been saved; unsaved projects have no path to autosave.',
  右对齐: 'Align right',
  国内MediaWiki: 'MediaWiki (China)',
  图像: 'Image',
  图片: 'Image',
  图片与SVG: 'Images & SVG',
  '在图片上点击实际握笔/落笔的位置，保存后作为该手势的中心点。':
    'Click the actual pen tip position; it becomes the hand pivot.',
  '导入结果只会保存为 .nscribe，不会修改原始 .scribe 文件。 请先预览确认，再继续制作。':
    'The import is saved as .nscribe and does not modify the original .scribe file. Preview before continuing.',
  '封装 MP4…': 'Packaging MP4…',
  居中: 'Align center',
  展开: 'Expand',
  '工程文件超过 200MB，暂不支持': 'Projects over 200 MB are not supported yet',
  左对齐: 'Align left',
  '已保存，留空则不修改': 'Saved. Leave empty to keep it unchanged.',
  已取消: 'Cancelled',
  '已导入 VideoScribe 工程（morph 已改为描绘）': 'VideoScribe project imported (morph converted to draw)',
  已经有两条音轨了请先移除一条再添加: 'Two audio tracks already exist. Remove one first.',
  开启后编辑页工具栏只显示图标鼠标悬浮可看说明:
    'When enabled, the toolbar shows icons only. Hover for descriptions.',
  开放版权图片: 'Open-license images',
  开放版权图片矢量: 'Open-license images / vectors',
  当前工程有未保存的修改确定打开其它工程吗:
    'This project has unsaved changes. Open another project anyway?',
  当前已经有一段背景音乐要替换吗: 'A background track already exists. Replace it?',
  当前环境不支持WebCodecs无法导出: 'WebCodecs is not available in this environment.',
  当前环境没有音频编码器: 'No audio encoder is available.',
  当前笔尖X: 'Current pen tip X',
  手绘白板动画: 'Hand-drawn whiteboard animation',
  手绘白板动画工作台: 'Hand-drawn whiteboard animation studio',
  打字机: 'Typewriter',
  打开工程或导入VideoScribe: 'Open a project or import VideoScribe',
  '搜索 AI 素材…': 'Search AI assets…',
  搜索网络上的SVG和开放版权图片: 'Search web SVG and open-license images',
  '搜索网络素材，回车': 'Search web assets, press Enter',
  收起: 'Collapse',
  文字元素: 'Text element',
  无法创建导出画布: 'Could not create the export canvas.',
  无法解析这个快捷方式: 'Could not resolve this shortcut.',
  是否移除最近添加可以在首选项库和素材里重新启用:
    'Remove Recent? You can re-enable it in Preferences → Library & assets.',
  不会删除任何文件: 'No files will be deleted.',
  最近加入画布的文件: 'Files recently added to the canvas',
  '未命名.nscribe': 'Untitled.nscribe',
  '检测到当前电脑安装了 VideoScribe。': 'VideoScribe was detected on this computer.',
  '是否把它的素材分类和 Favourites 加入 NewScribe 素材库？':
    'Add its asset categories and Favourites to the NewScribe library?',
  '只会引用，不会复制、移动或修改原文件。': 'Files are referenced only; nothing is copied, moved, or changed.',
  '正在导入 VideoScribe 工程…': 'Importing VideoScribe project…',
  没有匹配的工程: 'No matching projects.',
  没有检测到VideoScribe素材库: 'No VideoScribe library was detected.',
  浅色模式: 'Light mode',
  深色模式: 'Dark mode',
  自动模式: 'Auto mode',
  '混合背景音乐…': 'Mix background music…',
  '秒，超出部分会被截断。': 's; the extra part will be cut.',
  移入: 'Move in',
  '笔尖 X/Y 是手势图片左上角到笔尖的像素距离。':
    'Tip X/Y is the distance from the image top-left to the tip in pixels.',
  素材已重新链接: 'Assets relinked',
  '背景图：': 'Background:',
  自定义宽: 'Custom width',
  自定义高: 'Custom height',
  自定义手势: 'Custom hand',
  '解除 .scribe 绑定': 'Unbind .scribe',
  '请先在首选项 → 库和素材里启用至少一个网络来源。':
    'Enable at least one web source in Preferences → Library & assets.',
  输入APIKey: 'Enter API key',
  输入关键词搜索已启用的网络来源: 'Enter a keyword to search enabled web sources.',
  还没有最近工程新建一个或打开已有工程:
    'No recent projects. Create one or open an existing project.',
  这不是有效的NewScribe工程文件: 'This is not a valid NewScribe project file.',
  这个scribe里没有drawingxml: 'This .scribe file has no drawing.xml',
  这个文件夹已经在素材库里了: 'This folder is already in the library.',
  选择导出位置: 'Choose export location',
  选择背景音乐: 'Choose background music',
  选择默认导出文件夹: 'Choose default export folder',
  重新定位素材: 'Relink assets',
  需要安装ffmpeg: 'ffmpeg is required',
  '音轨 1 ·': 'Track 1 ·',
  '音轨 2 ·': 'Track 2 ·',
  音频文件: 'Audio file',
  音频比画面长: 'Audio is longer than the video',
  风景png: 'landscape.png',
  用AI生成SVG素材: 'Generate SVG assets with AI',
  空白手势: 'No hand',
  右手: 'Right hand',
  马克笔无标志: 'Marker (blank)',
  马克笔有标志: 'Marker (with logo)',
  已保存: 'Saved',
  已导出: 'Exported',
  已添加音轨: 'Track added',
  已设置背景音乐: 'Background music set',
  系统里没有找到字体: 'Font not found on this system',
  把工程文件移到回收站: 'Move the project file to the recycle bin?',
  导入音乐失败: 'Music import failed',
  导入VideoScribe工程: 'Import VideoScribe project',
  视频信息写入失败: 'Could not write video info',
  设置视频信息: 'Set video info',
  正在打开工程: 'Opening project',
  正在导入VideoScribe工程: 'Importing VideoScribe project',
  准备绘制数据: 'Preparing drawing data',
  封装MP4: 'Packaging MP4',
  打开文件失败: 'Could not open the file',
  保存文件失败: 'Could not save the file'
})

const PHRASES: Array<[RegExp, string]> = [  [/(\d+)\s*个元素/g, '$1 elements'],
  [/(\d+)\s*秒/g, '$1s'],
  [/(\d+)\s*个/g, '$1'],
  [/共\s*(\d+)\s*项/g, '$1 items'],
  [/第\s*(\d+)\s*条/g, 'Track $1']
]

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt']

const EN_NORMALIZED = new Map(
  Object.entries(EN).map(([key, value]) => [normalize(key), value])
)

function normalize(text: string): string {
  return text
    .replace(/[\s：:，,。.！!？?…·\-—（）()「」【】、/]/g, '')
    .trim()
}

const TOKEN_KEYS = Object.keys(EN)
  .filter((key) => /[\u4e00-\u9fff]/.test(key) && key.length >= 2 && !/[A-Za-z]/.test(key))
  .sort((a, b) => b.length - a.length)

export function setLanguage(language: Language): void {
  current = language
  for (const listener of listeners) listener(language)
}

export function getLanguage(): Language {
  return current
}

export function useLanguage(): Language {
  const [language, set] = useState(current)
  useEffect(() => {
    const listener = (next: Language): void => set(next)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return language
}

export function translate(text: string): string {
  if (current === 'zh') return text
  const direct = EN[text.trim()] ?? EN_NORMALIZED.get(normalize(text))
  if (direct) return direct
  let result = text
  for (const [pattern, replacement] of PHRASES) result = result.replace(pattern, replacement)
  for (const key of TOKEN_KEYS) {
    if (result.includes(key)) result = result.split(key).join(EN[key])
  }
  return result
}

function isNoTranslate(node: Node): boolean {
  const element =
    node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  return Boolean(element?.closest('[data-no-translate], .notranslate'))
}

function translateTextNode(node: Text): void {
  if (isNoTranslate(node)) return
  const value = node.nodeValue
  if (!value || !/[\u4e00-\u9fff]/.test(value)) return
  const next = translate(value)
  if (next !== value) node.nodeValue = next
}

function translateElement(element: Element): void {
  if (isNoTranslate(element)) return
  for (const attr of ATTRS) {
    const value = element.getAttribute(attr)
    if (!value || !/[\u4e00-\u9fff]/.test(value)) continue
    const next = translate(value)
    if (next !== value) element.setAttribute(attr, next)
  }
}

function walk(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text)
    return
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return
  const element = root as Element
  if (isNoTranslate(element)) return
  const tag = element.tagName
  if (tag === 'SCRIPT' || tag === 'STYLE') return
  translateElement(element)
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    translateTextNode(node as Text)
    node = walker.nextNode()
  }
  element.querySelectorAll(ATTRS.map((attr) => `[${attr}]`).join(',')).forEach(translateElement)
}

let observer: MutationObserver | null = null
const originals = new WeakMap<Text, string>()
const attrOriginals = new WeakMap<Element, Map<string, string>>()

function rememberAndTranslate(node: Text): void {
  if (!originals.has(node)) originals.set(node, node.nodeValue ?? '')
  translateTextNode(node)
}

function applyEnglish(): void {
  const run = (root: Node): void => {
    if (root.nodeType === Node.TEXT_NODE) {
      rememberAndTranslate(root as Text)
      return
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return
    const element = root as Element
    if (isNoTranslate(element)) return
    if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') return
    for (const attr of ATTRS) {
      const value = element.getAttribute(attr)
      if (!value) continue
      let map = attrOriginals.get(element)
      if (!map) {
        map = new Map()
        attrOriginals.set(element, map)
      }
      if (!map.has(attr)) map.set(attr, value)
      const next = translate(value)
      if (next !== value) element.setAttribute(attr, next)
    }
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      rememberAndTranslate(node as Text)
      node = walker.nextNode()
    }
    element.querySelectorAll(ATTRS.map((attr) => `[${attr}]`).join(',')).forEach((child) => {
      const el = child
      for (const attr of ATTRS) {
        const value = el.getAttribute(attr)
        if (!value) continue
        let map = attrOriginals.get(el)
        if (!map) {
          map = new Map()
          attrOriginals.set(el, map)
        }
        if (!map.has(attr)) map.set(attr, value)
        const next = translate(value)
        if (next !== value) el.setAttribute(attr, next)
      }
    })
  }
  run(document.body)
}

function restoreChinese(): void {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const original = originals.get(node as Text)
    if (original != null) (node as Text).nodeValue = original
    node = walker.nextNode()
  }
  document.querySelectorAll(ATTRS.map((attr) => `[${attr}]`).join(',')).forEach((element) => {
    const map = attrOriginals.get(element)
    if (!map) return
    for (const [attr, value] of map) element.setAttribute(attr, value)
  })
}

export function applyLanguage(language: Language): void {
  current = language
  for (const listener of listeners) listener(language)
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN'
  if (language === 'zh') {
    observer?.disconnect()
    restoreChinese()
    return
  }
  applyEnglish()
  if (!observer) {
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') rememberAndTranslate(mutation.target as Text)
        else if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          const element = mutation.target
          const attr = mutation.attributeName ?? ''
          if (!ATTRS.includes(attr)) continue
          const value = element.getAttribute(attr)
          if (!value) continue
          let map = attrOriginals.get(element)
          if (!map) {
            map = new Map()
            attrOriginals.set(element, map)
          }
          if (!map.has(attr)) map.set(attr, value)
          const next = translate(value)
          if (next !== value) element.setAttribute(attr, next)
        } else {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.TEXT_NODE) rememberAndTranslate(node as Text)
            else if (node.nodeType === Node.ELEMENT_NODE) applyEnglish()
          }
        }
      }
    })
  }
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS
  })
}

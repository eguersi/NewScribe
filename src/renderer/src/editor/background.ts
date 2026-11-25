export function drawBackgroundImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  fit: 'tile' | 'stretch'
): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, width, height)
  ctx.clip()
  if (fit === 'stretch') {
    ctx.drawImage(image, x, y, width, height)
  } else {
    const pattern = ctx.createPattern(image, 'repeat')
    if (pattern) {
      ctx.fillStyle = pattern
      ctx.fillRect(x, y, width, height)
    }
  }
  ctx.restore()
}

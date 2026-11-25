(() => {
  const body = document.body
  const toggle = document.querySelector('[data-menu-toggle]')
  const backdrop = document.querySelector('[data-sidebar-backdrop]')
  const search = document.querySelector('[data-nav-search]')
  const navItems = Array.from(document.querySelectorAll('[data-nav-item]'))

  const setMenu = (open) => {
    body.classList.toggle('sidebar-open', open)
    if (toggle) toggle.setAttribute('aria-expanded', String(open))
  }

  toggle?.addEventListener('click', () => setMenu(!body.classList.contains('sidebar-open')))
  backdrop?.addEventListener('click', () => setMenu(false))
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMenu(false)
  })

  search?.addEventListener('input', () => {
    const keyword = search.value.trim().toLowerCase()
    for (const item of navItems) {
      const text = (item.getAttribute('data-search') || item.textContent || '').toLowerCase()
      item.hidden = Boolean(keyword) && !text.includes(keyword)
    }
  })

  const tocLinks = Array.from(document.querySelectorAll('.page-toc a'))
  const headings = tocLinks
    .map((link) => {
      const id = decodeURIComponent(link.getAttribute('href')?.slice(1) || '')
      return id ? document.getElementById(id) : null
    })
    .filter(Boolean)

  if (headings.length > 0 && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (!visible) return
        for (const link of tocLinks) {
          const active = link.getAttribute('href') === `#${visible.target.id}`
          link.classList.toggle('active', active)
        }
      },
      { rootMargin: '-90px 0px -70% 0px', threshold: 0 }
    )
    for (const heading of headings) observer.observe(heading)
  }

  for (const link of document.querySelectorAll('a[href^="http"]')) {
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  }
})()

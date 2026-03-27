import { useEffect, useId, useState, type ReactNode } from 'react'

type Props = {
  title: string
  /** 경로가 이 접두사로 시작하면 펼침 */
  pathPrefix: string
  currentPath: string
  defaultOpen?: boolean
  children: ReactNode
}

export function SidebarAccordionSection({
  title,
  pathPrefix,
  currentPath,
  defaultOpen = false,
  children,
}: Props) {
  const panelId = useId()
  const matches = currentPath === pathPrefix || currentPath.startsWith(`${pathPrefix}/`)
  const [open, setOpen] = useState(defaultOpen || matches)

  useEffect(() => {
    if (matches) setOpen(true)
  }, [matches])

  return (
    <div className="sidebar-acc">
      <button
        type="button"
        className="sidebar-acc__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        id={`${panelId}-label`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sidebar-acc__chevron" aria-hidden data-open={open} />
        <span className="sidebar-acc__title">{title}</span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={`${panelId}-label`}
        aria-hidden={!open}
        className="sidebar-acc__panel"
        data-open={open}
      >
        <div className="sidebar-acc__inner" inert={!open ? true : undefined}>
          {children}
        </div>
      </div>
    </div>
  )
}

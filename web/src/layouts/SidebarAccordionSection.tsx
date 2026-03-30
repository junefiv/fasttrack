import { useEffect, useId, useState, type ReactNode } from 'react'

type Props = {
  title: string
  /** 경로가 접두사와 일치하면 펼침 (여러 개면 하나라도 맞으면 펼침) */
  pathPrefix: string | string[]
  currentPath: string
  defaultOpen?: boolean
  children: ReactNode
}

function pathMatchesPrefixes(path: string, prefixes: string[]) {
  return prefixes.some(
    (p) => path === p || path.startsWith(`${p}/`),
  )
}

export function SidebarAccordionSection({
  title,
  pathPrefix,
  currentPath,
  defaultOpen = false,
  children,
}: Props) {
  const panelId = useId()
  const prefixes = Array.isArray(pathPrefix) ? pathPrefix : [pathPrefix]
  const matches = pathMatchesPrefixes(currentPath, prefixes)
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

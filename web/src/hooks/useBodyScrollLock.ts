import { useEffect } from 'react'

let lockCount = 0

function syncDom() {
  if (lockCount > 0) {
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
  } else {
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
  }
}

/** Пока active, блокирует прокрутку страницы под модальным оверлеем (поддерживает вложенные модалки). */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    lockCount += 1
    syncDom()
    return () => {
      lockCount = Math.max(0, lockCount - 1)
      syncDom()
    }
  }, [active])
}

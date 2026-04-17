import { useCallback, useEffect, useRef, useState } from 'react'
import type { EventMediaItem } from '../api/client'
import { classifyMediaFile } from '../utils/mediaFile'

/**
 * Превью выбранных локальных файлов как лента медиа (blob URL + стабильные id).
 */
export function useLocalFileMediaItems(files: File[]) {
  const ids = useRef(new WeakMap<File, string>())
  const [items, setItems] = useState<EventMediaItem[]>([])

  const fileId = useCallback((f: File) => {
    let id = ids.current.get(f)
    if (!id) {
      id = `local-${crypto.randomUUID()}`
      ids.current.set(f, id)
    }
    return id
  }, [])

  useEffect(() => {
    const mapped: EventMediaItem[] = files.map((f) => ({
      id: fileId(f),
      url: URL.createObjectURL(f),
      kind: classifyMediaFile(f) === 'video' ? 'video' : 'image',
    }))
    setItems(mapped)
    return () => {
      mapped.forEach((m) => URL.revokeObjectURL(m.url))
    }
  }, [files, fileId])

  const filterOutMediaId = useCallback(
    (mediaId: string) => files.filter((f) => fileId(f) !== mediaId),
    [files, fileId],
  )

  return { items, filterOutMediaId }
}

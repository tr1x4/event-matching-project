import { type ChangeEvent, useEffect, useState } from 'react'
import { userFacingRequestError } from '../api/client'
import { EventMediaGallery } from './EventMediaGallery'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useLocalFileMediaItems } from '../hooks/useLocalFileMediaItems'
import {
  MAX_EVENT_MEDIA_TOTAL,
  MAX_MEDIA_UPLOAD_BATCH,
  mergeEventMediaFiles,
  mergeEventMediaForAppend,
} from '../utils/mediaFile'
import '../pages/FormPage.css'
import './EventMediaGallery.css'
import './ProfileModalShared.css'
import './MediaPickModal.css'

type Props = {
  open: boolean
  onClose: () => void
  files: File[]
  onChangeFiles: (files: File[]) => void
  /** Если задано: кнопка «Загрузить» отправляет выбранные файлы и закрывает окно. */
  onConfirmUpload?: (files: File[]) => Promise<void>
  /** Уже сохранённые медиа (для дозагрузки). */
  serverMedia?: { kind: string }[]
}

export function EventMediaPickerModal({
  open,
  onClose,
  files,
  onChangeFiles,
  onConfirmUpload,
  serverMedia = [],
}: Props) {
  useBodyScrollLock(open)
  const [error, setError] = useState<string | null>(null)
  const [upBusy, setUpBusy] = useState(false)
  const { items: localItems, filterOutMediaId } = useLocalFileMediaItems(files)

  useEffect(() => {
    if (!open) setError(null)
  }, [open])

  if (!open) return null

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!list.length) return
    setError(null)
    const merged =
      serverMedia.length > 0 ? mergeEventMediaForAppend(files, list, serverMedia) : mergeEventMediaFiles(files, list)
    if (!merged.ok) {
      setError(merged.error)
      return
    }
    onChangeFiles(merged.next)
  }

  const slotsLeft = Math.max(0, MAX_EVENT_MEDIA_TOTAL - serverMedia.length - files.length)

  async function onUpload() {
    if (!onConfirmUpload || !files.length) return
    setError(null)
    setUpBusy(true)
    try {
      await onConfirmUpload([...files])
      onChangeFiles([])
      onClose()
    } catch (e) {
      setError(userFacingRequestError(e))
    } finally {
      setUpBusy(false)
    }
  }

  return (
    <div
      className="prm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prm-ev-media-title"
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose()
      }}
    >
      <div className="prm-card prm-card--wide" onClick={(e) => e.stopPropagation()}>
        <div className="prm-head">
          <h2 id="prm-ev-media-title">Медиа события</h2>
          <p className="prm-intro">
            {`Не более ${MAX_EVENT_MEDIA_TOTAL} файлов на событие, каждый до 50 МБ. За один раз не более ${MAX_MEDIA_UPLOAD_BATCH} файлов в выборе. Превью ниже.`}
            {onConfirmUpload ? ' Нажмите «Загрузить», чтобы отправить на сервер, или «Готово», чтобы закрыть без отправки.' : ' Затем «Готово».'}
          </p>
        </div>
        <div className="prm-body prm-scrollbar">
          <label className="btn primary prm-file-btn">
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm"
              className="prm-file-inp"
              disabled={slotsLeft <= 0}
              onChange={onPick}
            />
            {slotsLeft <= 0 ? 'Лимит файлов' : 'Добавить файлы'}
          </label>
          <p className="muted mpm-slots">Можно добавить ещё: {slotsLeft}</p>

          {localItems.length ? (
            <div className="mpm-strip-wrap">
              <EventMediaGallery
                items={localItems}
                resolveMediaUrl={(u) => u}
                onDeleteItem={
                  upBusy
                    ? undefined
                    : (id) => {
                        onChangeFiles(filterOutMediaId(id))
                        setError(null)
                      }
                }
              />
            </div>
          ) : null}

          {error ? <p className="error">{error}</p> : null}
        </div>
        <div className="prm-foot">
          <div className="prm-actions">
            {onConfirmUpload ? (
              <button
                type="button"
                className="btn primary"
                disabled={upBusy || !files.length}
                onClick={() => void onUpload()}
              >
                {upBusy ? 'Отправка…' : 'Загрузить'}
              </button>
            ) : null}
            <button type="button" className="btn ghost" onClick={onClose} disabled={upBusy}>
              Готово
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

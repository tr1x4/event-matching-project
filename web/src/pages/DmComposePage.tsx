import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  fetchDmEligibility,
  fetchProfilePublic,
  profileAvatarSrc,
  sendDmFirstMessage,
  userFacingRequestError,
  type DmEligibility,
  type Profile,
} from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'
import { ageFromBirthDate, ageWordRu, displayCityName, genderLetterRu } from '../utils/profileUi'
import './FormPage.css'
import './ProfilePage.css'

export function DmComposePage() {
  const { peerProfileId: peerParam } = useParams()
  const peerId = Number.parseInt(peerParam ?? '', 10)
  const navigate = useNavigate()
  const { token } = useAuth()
  const { profile: myProfile } = useProfile()
  const [peer, setPeer] = useState<Profile | null>(null)
  const [gate, setGate] = useState<DmEligibility | null>(null)
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!token) navigate('/login', { replace: true })
  }, [token, navigate])

  useEffect(() => {
    if (!Number.isFinite(peerId)) {
      setPeer(null)
      setGate(null)
      setLoading(false)
      return
    }
    let c = false
    ;(async () => {
      setLoading(true)
      setErr(null)
      try {
        const [p, g] = await Promise.all([fetchProfilePublic(peerId), fetchDmEligibility(peerId)])
        if (!c) {
          setPeer(p)
          setGate(g)
        }
      } catch (e) {
        if (!c) {
          setPeer(null)
          setGate(null)
          setErr(userFacingRequestError(e))
        }
      } finally {
        if (!c) setLoading(false)
      }
    })()
    return () => {
      c = true
    }
  }, [peerId])

  useEffect(() => {
    if (gate?.chat_id != null) {
      navigate(`/chats/${gate.chat_id}`, { replace: true })
    }
  }, [gate?.chat_id, navigate])

  useEffect(() => {
    if (myProfile?.id != null && myProfile.id === peerId) {
      navigate('/profile', { replace: true })
    }
  }, [myProfile?.id, peerId, navigate])

  if (!token) return null

  if (!Number.isFinite(peerId)) {
    return (
      <div className="card wide">
        <p className="error">Некорректная ссылка</p>
        <Link to="/chats" className="btn ghost">
          К чатам
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="card wide">
        <p className="muted">Загрузка…</p>
      </div>
    )
  }

  const name = peer?.name?.trim() || 'Без имени'

  const peerMetaLine = (pr: Profile) => {
    const ag = ageFromBirthDate(pr.birth_date)
    const parts = [
      ag != null ? `${ag} ${ageWordRu(ag)}` : null,
      genderLetterRu(pr.gender ?? null),
      pr.city_name?.trim() ? displayCityName(pr.city_name) : null,
    ].filter(Boolean)
    return parts.join(' · ')
  }

  if (!peer || !gate?.can_message) {
    return (
      <div className="card wide profile-page dm-compose-page">
        <div className="page-hero-inline public-profile-hero">
          <Link to={peer ? `/profiles/${peerId}` : '/chats'} className="btn ghost small">
            Назад
          </Link>
        </div>
        {peer ? (
          <div className="dm-compose-peer-hero">
            <img className="dm-compose-peer-hero__avatar" src={profileAvatarSrc(peer)} width={128} height={128} alt="" />
            <h1 className="dm-compose-peer-hero__name">{name}</h1>
            <p className="dm-compose-peer-hero__meta">{peerMetaLine(peer)}</p>
          </div>
        ) : null}
        <p className="error dm-compose-err">{err || gate?.reason || 'Нельзя начать переписку'}</p>
        {peer ? (
          <p className="dm-compose-after-err">
            <Link to={`/profiles/${peerId}`} className="btn ghost">
              К профилю
            </Link>
          </p>
        ) : (
          <p className="dm-compose-after-err">
            <Link to="/chats" className="btn ghost">
              К чатам
            </Link>
          </p>
        )}
      </div>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body) {
      setErr('Введите сообщение')
      return
    }
    setErr(null)
    setBusy(true)
    try {
      const r = await sendDmFirstMessage(peerId, { body })
      navigate(`/chats/${r.chat_id}`, { replace: true })
    } catch (ex) {
      setErr(userFacingRequestError(ex))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card wide profile-page dm-compose-page">
      <div className="page-hero-inline public-profile-hero">
        <Link to={`/profiles/${peerId}`} className="btn ghost small">
          Назад
        </Link>
      </div>
      <div className="dm-compose-peer-hero">
        <img className="dm-compose-peer-hero__avatar" src={profileAvatarSrc(peer)} width={128} height={128} alt="" />
        <h1 className="dm-compose-peer-hero__name">{name}</h1>
        <p className="dm-compose-peer-hero__meta">{peerMetaLine(peer)}</p>
      </div>
      {err ? <p className="error dm-compose-err">{err}</p> : null}
      <form onSubmit={(ev) => void onSubmit(ev)} className="dm-compose-form">
        <label className="field-label" htmlFor="dm-compose-text">
          Сообщение
        </label>
        <textarea
          id="dm-compose-text"
          className="field-input"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Напишите первое сообщение…"
          maxLength={8000}
        />
        <button type="submit" className="btn primary dm-compose-submit" disabled={busy}>
          {busy ? 'Отправка…' : 'Отправить'}
        </button>
      </form>
    </div>
  )
}

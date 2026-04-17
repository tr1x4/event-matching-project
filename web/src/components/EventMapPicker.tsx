import { useMemo } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import 'leaflet/dist/leaflet.css'

// Vite: восстановить пути к стандартной иконке маркера
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
})

export type MapLatLng = { lat: number; lng: number }

function MapClickHandler({ onPick }: { onPick: (ll: MapLatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

export function EventMapPicker({
  position,
  onChange,
  readOnly,
}: {
  position: MapLatLng
  onChange: (p: MapLatLng) => void
  /** Только просмотр: без перетаскивания маркера и клика по карте. */
  readOnly?: boolean
}) {
  const center = useMemo((): [number, number] => [position.lat, position.lng], [position.lat, position.lng])
  const ro = Boolean(readOnly)

  return (
    <MapContainer
      center={center}
      zoom={13}
      className="event-map-picker"
      dragging={!ro}
      scrollWheelZoom={!ro}
      aria-label={ro ? 'Карта: место события' : 'Карта: клик или перетаскивание маркера'}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker
        position={center}
        draggable={!ro}
        eventHandlers={{
          dragend: (e) => {
            if (ro) return
            const m = e.target as L.Marker
            const ll = m.getLatLng()
            onChange({ lat: ll.lat, lng: ll.lng })
          },
        }}
      />
      {ro ? null : <MapClickHandler onPick={onChange} />}
    </MapContainer>
  )
}

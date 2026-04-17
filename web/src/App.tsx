import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { CreateEventPage } from './pages/CreateEventPage'
import { EventDetailPage } from './pages/EventDetailPage'
import { HomePage } from './pages/HomePage'
import { MyEventsPage } from './pages/MyEventsPage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { PublicProfilePage } from './pages/PublicProfilePage'
import { SettingsPage } from './pages/SettingsPage'
import { RegisterPage } from './pages/RegisterPage'
import { ChatsListPage } from './pages/ChatsListPage'
import { ChatRoomPage } from './pages/ChatRoomPage'
import { DmComposePage } from './pages/DmComposePage'
import { NotificationsPage } from './pages/NotificationsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="profiles/:profileId" element={<PublicProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="profile/setup" element={<Navigate to="/profile" replace />} />
        <Route path="my-events" element={<MyEventsPage />} />
        <Route path="events/new" element={<CreateEventPage />} />
        <Route path="events/:eventId" element={<EventDetailPage />} />
        <Route path="chats" element={<ChatsListPage />} />
        <Route path="chats/compose/:peerProfileId" element={<DmComposePage />} />
        <Route path="chats/:chatId" element={<ChatRoomPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

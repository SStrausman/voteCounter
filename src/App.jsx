import './App.css'
import { Route, Routes } from 'react-router-dom'
import Header from './components/Header.jsx'
import CreateGamePage from './pages/CreateGamePage.jsx'
import HomePage from './pages/HomePage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'

function App() {
  return (
    <div className="page">
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/games" element={<HomePage />} />
          <Route path="/games/create" element={<CreateGamePage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App

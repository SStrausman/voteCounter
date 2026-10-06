import './App.css'
import { Route, Routes } from 'react-router-dom'
import Header from './components/Header.jsx'
import ProfilePage from './pages/ProfilePage.jsx'

function App() {
  return (
    <div className="page">
      <Header />
      <main>
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App

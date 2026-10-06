import { useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../api/useApi.js'

function CreateGamePage() {
  const { isAuthenticated, isLoading: isAuthLoading, loginWithRedirect } = useAuth0()
  const { request } = useApi()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [totalPlayers, setTotalPlayers] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setIsSaving(true)

    try {
      await request('/games', {
        method: 'POST',
        body: JSON.stringify({ name, password, totalPlayers: Number(totalPlayers) }),
      })
      navigate('/')
    } catch (requestError) {
      setError(requestError.message)
      setIsSaving(false)
    }
  }

  if (isAuthLoading) {
    return <p className="page-status">Loading...</p>
  }

  if (!isAuthenticated) {
    return (
      <section className="auth-prompt">
        <h1>Create a game</h1>
        <p>Log in to create a game.</p>
        <button type="button" onClick={() => loginWithRedirect()}>Log in</button>
      </section>
    )
  }

  return (
    <section className="create-game-page">
      <p className="page-eyebrow">New game</p>
      <h1>Create a game</h1>

      <form className="game-form" onSubmit={handleSubmit}>
        <div className="field-group">
          <label htmlFor="gameName">Game name</label>
          <input
            id="gameName"
            type="text"
            value={name}
            maxLength={120}
            required
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="field-group">
          <label htmlFor="gamePassword">Join password (optional)</label>
          <input
            id="gamePassword"
            type="text"
            value={password}
            maxLength={120}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <div className="field-group">
          <label htmlFor="totalPlayers">Total players</label>
          <input
            id="totalPlayers"
            type="number"
            value={totalPlayers}
            min="1"
            required
            onChange={(event) => setTotalPlayers(event.target.value)}
          />
        </div>

        {error && <p className="form-message form-error" role="alert">{error}</p>}

        <button className="save-button" type="submit" disabled={isSaving}>
          {isSaving ? 'Creating...' : 'Create game'}
        </button>
      </form>
    </section>
  )
}

export default CreateGamePage
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
  const [addRoles, setAddRoles] = useState(false)
  const [step, setStep] = useState('details')
  const [availableRoles, setAvailableRoles] = useState([])
  const [roleIds, setRoleIds] = useState([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setIsSaving(true)

    try {
      if (step === 'details' && addRoles) {
        const body = await request('/roles')
        const vanillaTownie = body.defaultRoles.find((role) => role.name === 'Vanilla Townie')

        if (!vanillaTownie) {
          throw new Error('Vanilla Townie is not available')
        }

        const roles = [...body.defaultRoles, ...body.myRoles].sort((first, second) => (
          first.alignment.localeCompare(second.alignment)
          || first.name.localeCompare(second.name)
        ))
        setAvailableRoles(roles)
        setRoleIds(Array.from(
          { length: Number(totalPlayers) },
          () => vanillaTownie.id,
        ))
        setStep('roles')
        setIsSaving(false)
        return
      }

      await request('/games', {
        method: 'POST',
        body: JSON.stringify({
          name,
          password,
          totalPlayers: Number(totalPlayers),
          roleIds: addRoles ? roleIds : undefined,
        }),
      })
      navigate('/')
    } catch (requestError) {
      setError(requestError.message)
      setIsSaving(false)
    }
  }

  const handleRoleChange = (index, roleId) => {
    setRoleIds((currentRoleIds) => currentRoleIds.map((currentRoleId, currentIndex) => (
      currentIndex === index ? roleId : currentRoleId
    )))
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

  if (step === 'roles') {
    return (
      <section className="create-game-page">
        <p className="page-eyebrow">New game</p>
        <h1>Choose game roles</h1>
        <p className="page-intro">Select one role for each player slot.</p>

        <form className="game-form role-setup-form" onSubmit={handleSubmit}>
          <div className="role-slot-list">
            {roleIds.map((roleId, index) => (
              <div className="field-group" key={index}>
                <label htmlFor={`player-role-${index}`}>Player {index + 1}</label>
                <select
                  id={`player-role-${index}`}
                  value={roleId}
                  required
                  onChange={(event) => handleRoleChange(index, event.target.value)}
                >
                  {availableRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.alignment} - {role.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {error && <p className="form-message form-error" role="alert">{error}</p>}

          <div className="game-form-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={isSaving}
              onClick={() => {
                setError('')
                setStep('details')
              }}
            >
              Back
            </button>
            <button className="save-button" type="submit" disabled={isSaving}>
              {isSaving ? 'Creating...' : 'Create game'}
            </button>
          </div>
        </form>
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

        <label className="game-role-toggle" htmlFor="addRoles">
          <input
            id="addRoles"
            type="checkbox"
            checked={addRoles}
            onChange={(event) => setAddRoles(event.target.checked)}
          />
          <span>Add roles</span>
        </label>

        {error && <p className="form-message form-error" role="alert">{error}</p>}

        <button className="save-button" type="submit" disabled={isSaving}>
          {isSaving ? 'Creating...' : 'Create game'}
        </button>
      </form>
    </section>
  )
}

export default CreateGamePage
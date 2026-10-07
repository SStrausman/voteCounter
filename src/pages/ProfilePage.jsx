import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../api/useApi.js'
import { useTheme } from '../theme/ThemeContext.jsx'

const emptyProfile = {
  displayName: '',
  profilePictureUrl: '',
  theme: 'light',
  gamesPlayed: 0,
  gamesModerated: 0,
}

function ProfilePage({ isProfileSetup = false, onProfileSaved }) {
  const { isAuthenticated, isLoading: isAuthLoading, loginWithRedirect } = useAuth0()
  const { request } = useApi()
  const { setTheme } = useTheme()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(emptyProfile)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false)
      return
    }

    let isActive = true

    async function loadProfile() {
      try {
        const body = await request('/profile')

        if (isActive) {
          setProfile({
            ...body.profile,
            displayName: body.profile.displayName ?? '',
            profilePictureUrl: body.profile.profilePictureUrl ?? '',
          })
          setTheme(body.profile.theme)
        }
      } catch (requestError) {
        if (isActive) {
          setError(requestError.message)
        }
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    loadProfile()

    return () => {
      isActive = false
    }
  }, [isAuthenticated, request, setTheme])

  const handleChange = (event) => {
    const { name, value } = event.target
    setProfile((currentProfile) => ({ ...currentProfile, [name]: value }))
    setSaved(false)

    if (name === 'profilePictureUrl') {
      setImageError(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSaved(false)
    setIsSaving(true)

    try {
      const body = await request('/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: profile.displayName,
          profilePictureUrl: profile.profilePictureUrl,
          theme: profile.theme,
        }),
      })
      setProfile({
        ...body.profile,
        profilePictureUrl: body.profile.profilePictureUrl ?? '',
      })
      setSaved(true)
      onProfileSaved?.()

      if (isProfileSetup) {
        navigate('/', { replace: true })
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleThemeChange = (event) => {
    const theme = event.target.checked ? 'dark' : 'light'
    setProfile((currentProfile) => ({ ...currentProfile, theme }))
    setTheme(theme)
    setSaved(false)
  }

  if (isAuthLoading || isLoading) {
    return <p className="profile-status">Loading profile...</p>
  }

  if (!isAuthenticated) {
    return (
      <section className="profile-access">
        <h1>Your profile</h1>
        <p>Log in to view and edit your profile.</p>
        <button type="button" onClick={() => loginWithRedirect()}>
          Log in
        </button>
      </section>
    )
  }

  const initial = profile.displayName.trim().charAt(0).toUpperCase() || '?'
  const showProfilePicture = profile.profilePictureUrl && !imageError

  return (
    <section className="profile-page">
      <header className="profile-heading">
        <div className="profile-avatar" aria-hidden="true">
          {showProfilePicture ? (
            <img
              src={profile.profilePictureUrl}
              alt=""
              onError={() => setImageError(true)}
            />
          ) : (
            <span>{initial}</span>
          )}
        </div>
        <div>
          <p className="profile-eyebrow">{isProfileSetup ? 'Welcome' : 'Account'}</p>
          <h1>
            {isProfileSetup ? 'Choose a display name' : profile.displayName || 'Your profile'}
          </h1>
        </div>
        <div className="profile-stats">
          <div className="profile-stat">
            <strong>{profile.gamesPlayed}</strong>
            <span>Games played</span>
          </div>
          <div className="profile-stat">
            <strong>{profile.gamesModerated}</strong>
            <span>Games moderated</span>
          </div>
        </div>
      </header>

      <form className="profile-form" onSubmit={handleSubmit}>
        <div className="field-group">
          <label htmlFor="displayName">Display name</label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            value={profile.displayName}
            maxLength={15}
            required
            onChange={handleChange}
          />
        </div>

        <div className="field-group">
          <label htmlFor="profilePictureUrl">Profile picture URL</label>
          <input
            id="profilePictureUrl"
            name="profilePictureUrl"
            type="url"
            value={profile.profilePictureUrl}
            placeholder="https://example.com/photo.jpg"
            onChange={handleChange}
          />
        </div>

        <fieldset className="theme-setting">
          <legend>Appearance</legend>
          <label className="theme-toggle" htmlFor="darkMode">
            <span>
              <strong>Dark mode</strong>
              <small>Use a darker palette throughout the site.</small>
            </span>
            <input
              id="darkMode"
              type="checkbox"
              checked={profile.theme === 'dark'}
              onChange={handleThemeChange}
            />
            <span className="toggle-track" aria-hidden="true">
              <span className="toggle-thumb" />
            </span>
          </label>
        </fieldset>

        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {saved && <p className="form-message form-success" role="status">Profile saved.</p>}

        <button className="save-button" type="submit" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save profile'}
        </button>
      </form>
    </section>
  )
}

export default ProfilePage
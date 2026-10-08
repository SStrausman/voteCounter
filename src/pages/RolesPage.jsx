import { useEffect, useRef, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { useApi } from '../api/useApi.js'

const emptyRole = {
  name: '',
  description: '',
  winCondition: '',
  alignment: '',
  allowsPartners: false,
}

function RolesPage() {
  const { isAuthenticated, isLoading: isAuthLoading, loginWithRedirect } = useAuth0()
  const { request } = useApi()
  const [defaultRoles, setDefaultRoles] = useState([])
  const [myRoles, setMyRoles] = useState([])
  const [activeTab, setActiveTab] = useState('default')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [newRole, setNewRole] = useState(emptyRole)
  const [createError, setCreateError] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const createDialogRef = useRef(null)

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false)
      return
    }

    let isActive = true

    async function loadRoles() {
      try {
        const body = await request('/roles')

        if (isActive) {
          setDefaultRoles(body.defaultRoles)
          setMyRoles(body.myRoles)
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

    loadRoles()

    return () => {
      isActive = false
    }
  }, [isAuthenticated, request])

  if (isAuthLoading || isLoading) {
    return <p className="page-status">Loading roles...</p>
  }

  if (!isAuthenticated) {
    return (
      <section className="auth-prompt">
        <h1>Roles</h1>
        <p>Log in to view roles.</p>
        <button type="button" onClick={() => loginWithRedirect()}>Log in</button>
      </section>
    )
  }

  const visibleRoles = activeTab === 'default' ? defaultRoles : myRoles
  const activeTabLabel = activeTab === 'default' ? 'Default Roles' : 'My Roles'
  const alignmentGroups = Object.entries(
    visibleRoles.reduce((groups, role) => {
      const alignment = role.alignment.trim()
      groups[alignment] = [...(groups[alignment] ?? []), role]
      return groups
    }, {}),
  ).sort(([firstAlignment], [secondAlignment]) => {
    const alignmentOrder = ['Town', 'Mafia']
    const firstIndex = alignmentOrder.indexOf(firstAlignment)
    const secondIndex = alignmentOrder.indexOf(secondAlignment)

    if (firstIndex !== -1 || secondIndex !== -1) {
      return (firstIndex === -1 ? alignmentOrder.length : firstIndex)
        - (secondIndex === -1 ? alignmentOrder.length : secondIndex)
    }

    return firstAlignment.localeCompare(secondAlignment)
  })

  const openCreateDialog = () => {
    setNewRole(emptyRole)
    setCreateError('')
    createDialogRef.current?.showModal()
  }

  const handleRoleChange = (event) => {
    const { checked, name, type, value } = event.target
    setNewRole((currentRole) => ({
      ...currentRole,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleCreateRole = async (event) => {
    event.preventDefault()
    setCreateError('')
    setIsCreating(true)

    try {
      const body = await request('/roles', {
        method: 'POST',
        body: JSON.stringify(newRole),
      })
      setMyRoles((currentRoles) => (
        [...currentRoles, body.role].sort((first, second) => first.name.localeCompare(second.name))
      ))
      createDialogRef.current?.close()
    } catch (requestError) {
      setCreateError(requestError.message)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <section className="roles-page">
      <header className="page-heading">
        <div>
          <h1>Roles</h1>
        </div>
      </header>

      {error && <p className="form-message form-error" role="alert">{error}</p>}

      {!error && (
        <>
          <div className="role-tabs" role="tablist" aria-label="Role collections">
            <button
              id="default-roles-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === 'default'}
              aria-controls="role-tab-panel"
              onClick={() => setActiveTab('default')}
            >
              Default Roles
            </button>
            <button
              id="my-roles-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === 'mine'}
              aria-controls="role-tab-panel"
              onClick={() => setActiveTab('mine')}
            >
              My Roles
            </button>
          </div>

          <div
            id="role-tab-panel"
            role="tabpanel"
            aria-labelledby={activeTab === 'default' ? 'default-roles-tab' : 'my-roles-tab'}
          >
            {activeTab === 'mine' && (
              <div className="role-actions">
                <button className="save-button" type="button" onClick={openCreateDialog}>
                  Create role
                </button>
              </div>
            )}
            {visibleRoles.length === 0 ? (
              <div className="empty-state">
                <p>No roles in {activeTabLabel} yet.</p>
              </div>
            ) : (
              <div className="role-alignment-groups">
                {alignmentGroups.map(([alignment, roles]) => (
                  <section className="role-alignment-group" key={alignment}>
                    <h2 className="role-alignment-heading">{alignment}</h2>
                    <ul className="role-list">
                      {roles.map((role) => (
                        <li key={role.id}>
                          <div className="role-title">
                            <h2>{role.alignment} {role.name}</h2>
                          </div>
                          <p>{role.description}</p>
                          <div className="win-condition">
                            <p>{role.winCondition}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <dialog
        ref={createDialogRef}
        className="role-dialog"
        aria-labelledby="create-role-title"
      >
        <form className="role-form" onSubmit={handleCreateRole}>
          <div className="role-dialog-heading">
            <div>
              <p className="page-eyebrow">My Roles</p>
              <h2 id="create-role-title">Create a role</h2>
            </div>
            <button
              className="dialog-close"
              type="button"
              aria-label="Close"
              onClick={() => createDialogRef.current?.close()}
            >
              &times;
            </button>
          </div>

          <div className="field-group">
            <label htmlFor="role-name">Name</label>
            <input
              id="role-name"
              name="name"
              type="text"
              value={newRole.name}
              required
              autoFocus
              onChange={handleRoleChange}
            />
          </div>

          <div className="field-group">
            <label htmlFor="role-description">Description</label>
            <textarea
              id="role-description"
              name="description"
              rows="4"
              value={newRole.description}
              required
              onChange={handleRoleChange}
            />
          </div>

          <div className="field-group">
            <label htmlFor="role-win-condition">Win condition</label>
            <textarea
              id="role-win-condition"
              name="winCondition"
              rows="3"
              value={newRole.winCondition}
              required
              onChange={handleRoleChange}
            />
          </div>

          <div className="field-group">
            <label htmlFor="role-alignment">Alignment</label>
            <input
              id="role-alignment"
              name="alignment"
              type="text"
              value={newRole.alignment}
              required
              onChange={handleRoleChange}
            />
          </div>

          <label className="role-checkbox" htmlFor="role-allows-partners">
            <input
              id="role-allows-partners"
              name="allowsPartners"
              type="checkbox"
              checked={newRole.allowsPartners}
              onChange={handleRoleChange}
            />
            <span>Allows partners</span>
          </label>

          {createError && (
            <p className="form-message form-error" role="alert">{createError}</p>
          )}

          <div className="role-form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => createDialogRef.current?.close()}
            >
              Cancel
            </button>
            <button className="save-button" type="submit" disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create role'}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  )
}

export default RolesPage
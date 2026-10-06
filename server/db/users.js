import { eq } from 'drizzle-orm'
import { users } from './schema.js'

export async function findOrCreateUser(executor, auth0UserId) {
  const [createdUser] = await executor
    .insert(users)
    .values({ auth0UserId })
    .onConflictDoNothing({ target: users.auth0UserId })
    .returning()

  if (createdUser) {
    return createdUser
  }

  const [existingUser] = await executor
    .select()
    .from(users)
    .where(eq(users.auth0UserId, auth0UserId))
    .limit(1)

  return existingUser
}
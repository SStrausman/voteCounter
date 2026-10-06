import { count, eq } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { database } from '../db/client.js'
import { gameMembers, users } from '../db/schema.js'
import { findOrCreateUser } from '../db/users.js'

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  profilePictureUrl: z.union([z.string().url(), z.literal('')]),
  theme: z.enum(['light', 'dark']),
})

async function getGamesPlayed(userId) {
  const [result] = await database
    .select({ gamesPlayed: count() })
    .from(gameMembers)
    .where(eq(gameMembers.userId, userId))

  return result.gamesPlayed
}

export const profileRouter = Router()

profileRouter.use(requireAuth)

profileRouter.get('/', async (request, response, next) => {
  try {
    const user = await findOrCreateUser(database, request.auth.payload.sub)
    const gamesPlayed = await getGamesPlayed(user.id)

    response.json({
      profile: {
        displayName: user.displayName,
        profilePictureUrl: user.profilePictureUrl,
        theme: user.theme,
        gamesPlayed,
      },
    })
  } catch (error) {
    next(error)
  }
})

profileRouter.patch('/', async (request, response, next) => {
  const result = profileSchema.safeParse(request.body)

  if (!result.success) {
    response.status(400).json({
      error: 'Invalid profile',
      details: result.error.flatten(),
    })
    return
  }

  try {
    const user = await findOrCreateUser(database, request.auth.payload.sub)
    const [updatedUser] = await database
      .update(users)
      .set({
        displayName: result.data.displayName,
        profilePictureUrl: result.data.profilePictureUrl || null,
        theme: result.data.theme,
      })
      .where(eq(users.id, user.id))
      .returning()
    const gamesPlayed = await getGamesPlayed(user.id)

    response.json({
      profile: {
        displayName: updatedUser.displayName,
        profilePictureUrl: updatedUser.profilePictureUrl,
        theme: updatedUser.theme,
        gamesPlayed,
      },
    })
  } catch (error) {
    next(error)
  }
})
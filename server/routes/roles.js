import { asc, eq, isNull } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { database } from '../db/client.js'
import { roles } from '../db/schema.js'
import { findOrCreateUser } from '../db/users.js'

const createRoleSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  winCondition: z.string().trim().min(1),
  alignment: z.string().trim().min(1),
  allowsPartners: z.boolean(),
})

const roleFields = {
  id: roles.id,
  name: roles.name,
  description: roles.description,
  winCondition: roles.winCondition,
  alignment: roles.alignment,
  allowsPartners: roles.allowsPartners,
}

export const rolesRouter = Router()

rolesRouter.use(requireAuth)

rolesRouter.get('/', async (request, response, next) => {
  try {
    const currentUser = await findOrCreateUser(database, request.auth.payload.sub)
    const [defaultRoles, myRoles] = await Promise.all([
      database
        .select(roleFields)
        .from(roles)
        .where(isNull(roles.createdBy))
        .orderBy(asc(roles.name)),
      database
        .select(roleFields)
        .from(roles)
        .where(eq(roles.createdBy, currentUser.id))
        .orderBy(asc(roles.name)),
    ])

    response.json({ defaultRoles, myRoles })
  } catch (error) {
    next(error)
  }
})

rolesRouter.post('/', async (request, response, next) => {
  const result = createRoleSchema.safeParse(request.body)

  if (!result.success) {
    response.status(400).json({ error: 'Invalid role' })
    return
  }

  try {
    const currentUser = await findOrCreateUser(database, request.auth.payload.sub)
    const [role] = await database
      .insert(roles)
      .values({
        ...result.data,
        createdBy: currentUser.id,
      })
      .returning(roleFields)

    response.status(201).json({ role })
  } catch (error) {
    next(error)
  }
})
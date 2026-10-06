import 'dotenv/config'
import { z } from 'zod'

const environmentSchema = z.object({
  AUTH0_AUDIENCE: z.string().url(),
  AUTH0_DOMAIN: z.string().min(1),
  CLIENT_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3001),
})

const environment = environmentSchema.parse(process.env)

export const config = {
  auth0Audience: environment.AUTH0_AUDIENCE,
  auth0Domain: environment.AUTH0_DOMAIN,
  clientOrigin: environment.CLIENT_ORIGIN,
  databaseUrl: environment.DATABASE_URL,
  port: environment.PORT,
}
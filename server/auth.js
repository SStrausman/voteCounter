import { auth } from 'express-oauth2-jwt-bearer'
import { config } from './config.js'

export const requireAuth = auth({
  audience: config.auth0Audience,
  issuerBaseURL: `https://${config.auth0Domain}`,
})
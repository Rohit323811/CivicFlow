import express from 'express'
import cors from 'cors'

import apiRoutes from './routes/index.js'
import { notFound } from './middleware/notFound.js'
import { errorHandler } from './middleware/errorHandler.js'

const app = express()

app.use(cors())
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

app.use('/api', apiRoutes)

// 404 for unknown API routes
app.use(notFound)

// Centralized error handler
app.use(errorHandler)

export default app

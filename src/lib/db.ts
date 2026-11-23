// Database client for ACA TicketOps
// Uses Prisma client when available, falls back to direct PostgreSQL connection

// Direct PostgreSQL connection for when Prisma client is not initialized
import { Pool } from 'pg'

const postgresPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

export async function query(text: string, params?: any[]) {
  const client = await postgresPool.connect()
  try {
    const result = await client.query(text, params)
    return result.rows
  } catch (error) {
    throw error
  } finally {
    client.release()
  }
}

export async function execute(text: string, params?: any[]) {
  const client = await postgresPool.connect()
  try {
    const result = await client.query(text, params)
    return result.rows
  } catch (error) {
    throw error
  } finally {
    client.release()
  }
}

// Close the pool on process exit
process.on('beforeExit', async () => {
  await postgresPool.end()
})
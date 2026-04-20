import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/pool.js'
import { specShares, specs, type Spec, type SpecShare } from '../db/schema.js'

export type Access = 'owner' | 'editor' | 'viewer'

export interface SpecWithAccess {
  spec: Spec
  access: Access
  share: SpecShare | null
}

export async function loadSpecWithAccess(
  db: Db,
  specId: string,
  userId: string,
): Promise<SpecWithAccess | null> {
  const specRows = await db.client.select().from(specs).where(eq(specs.id, specId)).limit(1)
  const spec = specRows[0]
  if (!spec) return null

  if (spec.ownerId === userId) {
    return { spec, access: 'owner', share: null }
  }

  const shareRows = await db.client
    .select()
    .from(specShares)
    .where(and(eq(specShares.specId, specId), eq(specShares.userId, userId)))
    .limit(1)
  const share = shareRows[0]
  if (!share) return null

  return { spec, access: share.role, share }
}

export function canWrite(access: Access): boolean {
  return access === 'owner' || access === 'editor'
}

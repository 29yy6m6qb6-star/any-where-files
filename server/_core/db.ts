import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, transferSessions, urlMappings, type TransferSession, type UrlMapping } from "../drizzle/schema";
import { ENV } from './_core/env';

export type { TransferSession, UrlMapping };

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Generate a unique transfer key with specified length
 */
export function generateTransferKey(length: number = 11): string {
  if (length === 6) {
    return Math.floor(Math.random() * 1000000)
      .toString()
      .padStart(6, '0');
  }
  // Default to 11 digits
  return Math.floor(Math.random() * 100000000000)
    .toString()
    .padStart(11, '0');
}

/**
 * Create a new transfer session
 */
export async function createTransferSession(
  userId: number,
  fileKey: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
  keyLength: number = 11,
  expirationDays: number = 1
) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  let transferKey: string;
  let retries = 5;
  
  // Generate unique transfer key with retry logic
  while (retries > 0) {
    transferKey = generateTransferKey(keyLength);
    try {
      const result = await db
        .insert(transferSessions)
        .values({
          transferKey,
          keyLength,
          userId,
          fileKey,
          fileName,
          fileSize,
          mimeType,
          expiresAt: new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000),
        });
      return transferKey;
    } catch (error) {
      retries--;
      if (retries === 0) {
        throw new Error("Failed to generate unique transfer key");
      }
    }
  }
  throw new Error("Failed to generate unique transfer key");
}

/**
 * Get transfer session by key
 */
export async function getTransferSessionByKey(transferKey: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const result = await db
    .select()
    .from(transferSessions)
    .where(eq(transferSessions.transferKey, transferKey))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const session = result[0];
  
  // Check if session has expired
  if (new Date() > session.expiresAt) {
    return null;
  }

  return session;
}

/**
 * Increment download count for a transfer session
 */
export async function incrementDownloadCount(transferKey: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db
    .update(transferSessions)
    .set({ downloadCount: sql`${transferSessions.downloadCount} + 1` })
    .where(eq(transferSessions.transferKey, transferKey));
}

/**
 * Delete expired transfer sessions from database
 */
export async function deleteExpiredSessions() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete expired sessions: database not available");
    return;
  }

  try {
    // Delete all expired sessions
    const result = await db
      .delete(transferSessions)
      .where(sql`${transferSessions.expiresAt} < NOW()`);

    console.log("[Cleanup] Deleted expired transfer sessions");
  } catch (error) {
    console.error("[Cleanup] Error deleting expired sessions:", error);
  }
}

/**
 * Generate a unique 6-digit code for URL mapping
 */
function generateUrlCode(): string {
  return Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0');
}

/**
 * Create a new URL mapping
 */
export async function createUrlMapping(
  userId: number,
  url: string,
  expirationDays: number = 7
) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  let code: string;
  let retries = 5;
  
  // Generate unique code with retry logic
  while (retries > 0) {
    code = generateUrlCode();
    try {
      await db
        .insert(urlMappings)
        .values({
          code,
          url,
          userId,
          expiresAt: new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000),
        });
      return code;
    } catch (error) {
      retries--;
      if (retries === 0) {
        throw new Error("Failed to generate unique URL code");
      }
    }
  }
  throw new Error("Failed to generate unique URL code");
}

/**
 * Get URL mapping by code
 */
export async function getUrlMappingByCode(code: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const result = await db
    .select()
    .from(urlMappings)
    .where(eq(urlMappings.code, code))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const mapping = result[0];
  
  // Check if mapping has expired
  if (new Date() > mapping.expiresAt) {
    return null;
  }

  return mapping;
}

/**
 * Delete expired URL mappings from database
 */
export async function deleteExpiredUrlMappings() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete expired URL mappings: database not available");
    return;
  }

  try {
    // Delete all expired mappings
    await db
      .delete(urlMappings)
      .where(sql`${urlMappings.expiresAt} < NOW()`);

    console.log("[Cleanup] Deleted expired URL mappings");
  } catch (error) {
    console.error("[Cleanup] Error deleting expired URL mappings:", error);
  }
}

// TODO: add feature queries here as your schema grows.

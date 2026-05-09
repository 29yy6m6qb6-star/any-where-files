import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { createTransferSession, getTransferSessionByKey, incrementDownloadCount, deleteExpiredSessions, createUrlMapping, getUrlMappingByCode } from "./db";
import { storagePut, storageGet } from "./storage";
import { TRPCError } from "@trpc/server";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  transfer: router({
    /**
     * Upload a file and create a transfer session
     * Returns the 6-digit transfer key
     */
    upload: publicProcedure
      .input(
        z.object({
          fileName: z.string().min(1).max(255),
          fileSize: z.number().int().positive(),
          mimeType: z.string().min(1).max(100),
          fileData: z.instanceof(Uint8Array),
        })
      )
      .mutation(async ({ input }) => {
        try {
          // Validate file size (max 1GB)
          if (input.fileSize > 1024 * 1024 * 1024) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "ファイルサイズが大きすぎます（最大1GB）",
            });
          }

          // Generate unique S3 key with timestamp and random suffix
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(2, 8);
          const fileKey = `transfers/public/${timestamp}-${randomSuffix}-${input.fileName}`;

          console.log("[Upload] Starting upload:", {
            fileName: input.fileName,
            fileSize: input.fileSize,
            mimeType: input.mimeType,
            fileKey,
          });

          // Upload file to S3
          let url: string;
          try {
            const result = await storagePut(fileKey, input.fileData, input.mimeType);
            url = result.url;
            console.log("[Upload] S3 upload successful:", url);
          } catch (s3Error) {
            console.error("[Upload] S3 upload failed:", s3Error);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "S3へのアップロードに失敗しました",
            });
          }

          // Create transfer session in database (userId = 0 for anonymous users)
          let transferKey: string;
          try {
            transferKey = await createTransferSession(
              0,
              fileKey,
              input.fileName,
              input.fileSize,
              input.mimeType
            );
            console.log("[Upload] Transfer session created:", transferKey);
          } catch (dbError) {
            console.error("[Upload] Database error:", dbError);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "データベースへの保存に失敗しました",
            });
          }

          return {
            success: true,
            transferKey,
            fileUrl: url,
          };
        } catch (error) {
          console.error("[Upload] Error:", error);
          if (error instanceof TRPCError) {
            throw error;
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "アップロード中にエラーが発生しました",
          });
        }
      }),

    /**
     * Get file metadata by transfer key
     * Does not require authentication
     */
    getFileByKey: publicProcedure
      .input(z.object({ transferKey: z.string().min(6).max(11) }))
      .query(async ({ input }) => {
        const session = await getTransferSessionByKey(input.transferKey);

        if (!session) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transfer session not found or expired",
          });
        }

        return {
          fileName: session.fileName,
          fileSize: session.fileSize,
          mimeType: session.mimeType,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          downloadCount: session.downloadCount,
        };
      }),

    /**
     * Download file by transfer key
     * Returns presigned S3 URL
     */
    downloadByKey: publicProcedure
      .input(z.object({ transferKey: z.string().min(6).max(11) }))
      .mutation(async ({ input }) => {
        const session = await getTransferSessionByKey(input.transferKey);

        if (!session) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Transfer session not found or expired",
          });
        }

        // Increment download count
        await incrementDownloadCount(input.transferKey);

        // Get presigned download URL
        const { url } = await storageGet(session.fileKey);

        return {
          success: true,
          downloadUrl: url,
          fileName: session.fileName,
        };
      }),
  }),

  url: router({
    /**
     * Create a new URL mapping
     * Returns the 6-digit code
     */
    create: publicProcedure
      .input(
        z.object({
          url: z.string().url(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        try {
          const userId = ctx.user?.id || 0; // Use 0 for anonymous users
          const code = await createUrlMapping(userId, input.url, 7);
          return {
            success: true,
            code,
          };
        } catch (error) {
          console.error("URL mapping creation error:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "URLマッピングの作成に失敗しました",
          });
        }
      }),

    /**
     * Get URL by code
     */
    getByCode: publicProcedure
      .input(
        z.object({
          code: z.string().length(6),
        })
      )
      .query(async ({ input }) => {
        try {
          const mapping = await getUrlMappingByCode(input.code);
          if (!mapping) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "URLが見つかりません",
            });
          }
          return {
            success: true,
            url: mapping.url,
          };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          console.error("URL mapping retrieval error:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "URLの取得に失敗しました",
          });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;

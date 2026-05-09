import { Express, Request, Response } from "express";
import multer from "multer";
import { storagePut } from "./storage";
import { createTransferSession } from "./db";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// Configure multer for in-memory file handling
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB
  },
});

export function registerUploadRoutes(app: Express) {
  app.post("/api/upload", upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "ファイルが選択されていません",
        });
      }

      const { fileName, mimeType, keyLength = '11', expirationDays = '1' } = req.body;
      const parsedKeyLength = parseInt(keyLength);
      const parsedExpirationDays = parseInt(expirationDays);

      if (!fileName || !mimeType) {
        return res.status(400).json({
          success: false,
          error: "ファイル名またはMIMEタイプが指定されていません",
        });
      }

      // Validate file size
      if (req.file.size > 1024 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          error: "ファイルサイズが大きすぎます（最大1GB）",
        });
      }

      // Generate unique S3 key
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const s3Key = `transfers/public/${timestamp}-${randomSuffix}`;

      // Upload to S3
      const { url } = await storagePut(s3Key, req.file.buffer, mimeType);

      // Create transfer session
      const transferKey = await createTransferSession(
        0, // Anonymous user
        s3Key,
        fileName,
        req.file.size,
        mimeType,
        parsedKeyLength,
        parsedExpirationDays
      );

      return res.status(200).json({
        success: true,
        transferKey,
        fileSize: req.file.size,
        fileName,
        mimeType,
        keyLength: parseInt(keyLength),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[Upload] Error:", error);
      console.error("[Upload] Error details:", errorMessage);
      return res.status(500).json({
        success: false,
        error: "アップロード中にエラーが発生しました",
        details: errorMessage,
      });
    }
  });
}

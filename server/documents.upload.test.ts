import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return ctx;
}

describe("documents.upload", () => {
  it("uploads a document with required fields", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.documents.upload({
      type: "document",
      title: "Survey Plan",
      fileName: "survey-plan.pdf",
      fileKey: "documents/1234567890-survey-plan.pdf",
      fileUrl: "https://storage.example.com/documents/1234567890-survey-plan.pdf",
      parcelId: 1,
    });

    expect(result).toBeDefined();
    expect(result.type).toBe("document");
    expect(result.title).toBe("Survey Plan");
    expect(result.fileName).toBe("survey-plan.pdf");
  });

  it("uploads a document with transaction ID", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.documents.upload({
      type: "document",
      title: "Transfer Agreement",
      fileName: "transfer-agreement.pdf",
      fileKey: "documents/1234567890-transfer-agreement.pdf",
      fileUrl: "https://storage.example.com/documents/1234567890-transfer-agreement.pdf",
      transactionId: 1,
      fileSize: 1024000,
      mimeType: "application/pdf",
    });

    expect(result).toBeDefined();
    expect(result.transactionId).toBe(1);
    expect(result.fileSize).toBe(1024000);
    expect(result.mimeType).toBe("application/pdf");
  });

  it("uploads an image document", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.documents.upload({
      type: "image",
      title: "Property Photo",
      fileName: "property-photo.jpg",
      fileKey: "documents/1234567890-property-photo.jpg",
      fileUrl: "https://storage.example.com/documents/1234567890-property-photo.jpg",
      parcelId: 1,
      mimeType: "image/jpeg",
      fileSize: 2048000,
    });

    expect(result).toBeDefined();
    expect(result.type).toBe("image");
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("uploads a document with description", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.documents.upload({
      type: "document",
      title: "Certificate of Occupancy",
      fileName: "c-of-o.pdf",
      fileKey: "documents/1234567890-c-of-o.pdf",
      fileUrl: "https://storage.example.com/documents/1234567890-c-of-o.pdf",
      parcelId: 1,
      description: "Original Certificate of Occupancy issued in 2020",
    });

    expect(result).toBeDefined();
    expect(result.description).toBe("Original Certificate of Occupancy issued in 2020");
  });
});

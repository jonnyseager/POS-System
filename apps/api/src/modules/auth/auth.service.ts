import { eq, and } from "drizzle-orm";
import { hash, verify } from "argon2";
import { randomBytes, createHash } from "node:crypto";
import { schema } from "@commerce-os/db";
import type { Database } from "@commerce-os/db";
import type { RegisterInput, LoginInput } from "@commerce-os/validation";
import type { JWT } from "@fastify/jwt";
import { getEnv } from "../../config/env.js";

interface AuthResult {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
  };
}

export class AuthService {
  constructor(
    private readonly db: Database,
    private readonly jwt: JWT
  ) {}

  /** Register a new user, create their tenant, and return auth tokens. */
  async register(input: RegisterInput): Promise<AuthResult> {
    const passwordHash = await hash(input.password);
    const slug = this.generateSlug(input.businessName);

    // Create user
    const [user] = await this.db
      .insert(schema.users)
      .values({
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
      })
      .returning();

    if (!user) throw new Error("Failed to create user");

    // Create tenant
    const [tenant] = await this.db
      .insert(schema.tenants)
      .values({
        name: input.businessName,
        slug,
      })
      .returning();

    if (!tenant) throw new Error("Failed to create tenant");

    // Create default UK tax rates for the tenant
    await this.db.insert(schema.taxRates).values([
      { tenantId: tenant.id, name: "Standard VAT", rate: "0.2000", isDefault: true },
      { tenantId: tenant.id, name: "Reduced VAT", rate: "0.0500", isDefault: false },
      { tenantId: tenant.id, name: "Zero-rated", rate: "0.0000", isDefault: false },
    ]);

    // Link user to tenant as owner
    await this.db.insert(schema.tenantUsers).values({
      tenantId: tenant.id,
      userId: user.id,
      role: "owner",
    });

    // Generate tokens
    const tokens = await this.generateTokens(user.id, tenant.id, "owner");

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      tokens,
    };
  }

  /** Authenticate with email and password. */
  async login(input: LoginInput): Promise<AuthResult | null> {
    // Find user by email
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.email, input.email), eq(schema.users.deletedAt, null as unknown as Date)))
      .limit(1);

    if (!user) return null;

    // Verify password
    const valid = await verify(user.passwordHash, input.password);
    if (!valid) return null;

    // Get the user's first tenant (for MVP, users have one tenant)
    const [tenantUser] = await this.db
      .select()
      .from(schema.tenantUsers)
      .where(and(eq(schema.tenantUsers.userId, user.id), eq(schema.tenantUsers.isActive, true)))
      .limit(1);

    if (!tenantUser) return null;

    const [tenant] = await this.db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantUser.tenantId))
      .limit(1);

    if (!tenant) return null;

    const tokens = await this.generateTokens(user.id, tenant.id, tenantUser.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
      tokens,
    };
  }

  /** Exchange a refresh token for new access + refresh tokens. */
  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: string } | null> {
    const tokenHash = this.hashToken(refreshToken);

    const [stored] = await this.db
      .select()
      .from(schema.refreshTokens)
      .where(and(eq(schema.refreshTokens.tokenHash, tokenHash), eq(schema.refreshTokens.revokedAt, null as unknown as Date)))
      .limit(1);

    if (!stored || stored.expiresAt < new Date()) return null;

    // Revoke the old refresh token (rotation)
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(schema.refreshTokens.id, stored.id));

    // Find tenant membership to get role
    const [tenantUser] = await this.db
      .select()
      .from(schema.tenantUsers)
      .where(and(eq(schema.tenantUsers.userId, stored.userId), eq(schema.tenantUsers.isActive, true)))
      .limit(1);

    if (!tenantUser) return null;

    return this.generateTokens(stored.userId, tenantUser.tenantId, tenantUser.role);
  }

  private async generateTokens(userId: string, tenantId: string, role: string) {
    const env = getEnv();

    const accessToken = this.jwt.sign(
      { userId, tenantId, role },
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    const refreshToken = randomBytes(40).toString("hex");
    const tokenHash = this.hashToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + env.REFRESH_TOKEN_EXPIRES_IN_DAYS);

    await this.db.insert(schema.refreshTokens).values({
      userId,
      tokenHash,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: env.JWT_EXPIRES_IN,
    };
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private generateSlug(businessName: string): string {
    const base = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const suffix = randomBytes(3).toString("hex");
    return `${base}-${suffix}`;
  }
}

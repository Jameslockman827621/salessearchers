// ===========================================
// Auth Routes (Complete Implementation)
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@salessearchers/db';
import { loginSchema, registerSchema, AUDIT_ACTIONS, logger, sha256 } from '@salessearchers/shared';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';

function generateToken(payload: { userId: string; tenantId: string }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

async function hashPassword(password: string): Promise<string> {
  // In production, use bcrypt or argon2
  // For now, use a simple hash with salt
  const salt = 'salt_' + Math.random().toString(36).substring(7);
  return `${salt}:${sha256(salt + password)}`;
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, hashed] = hash.split(':');
  return sha256(salt + password) === hashed;
}

export async function authRoutes(app: FastifyInstance) {
  // Register new tenant + user
  app.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = registerSchema.parse(request.body);

    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (existing) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'EMAIL_EXISTS',
          message: 'An account with this email already exists',
        },
      });
    }

    // Create tenant
    const slug = body.tenantName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const tenant = await prisma.tenant.create({
      data: {
        name: body.tenantName,
        slug: `${slug}-${Date.now().toString(36)}`,
      },
    });

    // Hash password
    const passwordHash = await hashPassword(body.password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        firstName: body.firstName,
        lastName: body.lastName,
        memberships: {
          create: {
            tenantId: tenant.id,
            role: 'OWNER',
          },
        },
      },
    });

    // Generate token
    const token = generateToken({ userId: user.id, tenantId: tenant.id });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        action: AUDIT_ACTIONS.USER_CREATED,
        resource: 'user',
        resourceId: user.id,
        details: { email: user.email, role: 'OWNER' },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      },
    });

    // Set cookie
    reply.setCookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return {
      success: true,
      data: {
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
        token,
      },
    };
  });

  // Login
  app.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = loginSchema.parse(request.body);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: {
        memberships: {
          include: { tenant: true },
          where: { isActive: true },
          take: 1,
        },
      },
    });

    if (!user || !user.passwordHash) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    // Verify password
    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    // Get tenant
    const membership = user.memberships[0];
    if (!membership) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'NO_TENANT',
          message: 'User is not a member of any organization',
        },
      });
    }

    // Generate token
    const token = generateToken({ userId: user.id, tenantId: membership.tenantId });

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: membership.tenantId,
        userId: user.id,
        action: AUDIT_ACTIONS.USER_LOGIN,
        resource: 'session',
        resourceId: user.id,
        details: { method: 'password' },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      },
    });

    // Set cookie
    reply.setCookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        tenant: {
          id: membership.tenant.id,
          name: membership.tenant.name,
          slug: membership.tenant.slug,
        },
        token,
      },
    };
  });

  // Logout
  app.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('token', { path: '/' });

    return {
      success: true,
      data: { message: 'Logged out' },
    };
  });

  // Get current user
  app.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(request, reply);

    const userId = request.userId!;
    const tenantId = request.tenantId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
      },
    });

    const membership = await prisma.membership.findFirst({
      where: { userId, tenantId },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    if (!user || !membership) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Session expired',
        },
      });
    }

    // Get permissions based on role
    const permissions = getRolePermissions(membership.role);

    return {
      success: true,
      data: {
        user,
        tenant: membership.tenant,
        permissions,
      },
    };
  });

  // Refresh token
  app.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    await app.authenticate(request, reply);

    const userId = request.userId!;
    const tenantId = request.tenantId!;

    const token = generateToken({ userId, tenantId });

    reply.setCookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return {
      success: true,
      data: { token },
    };
  });
}

function getRolePermissions(role: string): string[] {
  const basePermissions = [
    'meetings.read',
    'meetings.create',
    'tasks.read',
    'tasks.create',
    'tasks.update',
    'contacts.read',
    'deals.read',
    'integrations.read',
    'settings.read',
  ];

  const managerPermissions = [
    ...basePermissions,
    'meetings.update',
    'tasks.delete',
    'contacts.create',
    'contacts.update',
    'deals.create',
    'deals.update',
    'integrations.manage',
  ];

  const adminPermissions = [
    ...managerPermissions,
    'contacts.delete',
    'deals.delete',
    'users.read',
    'users.invite',
    'settings.manage',
  ];

  const ownerPermissions = [
    ...adminPermissions,
    'users.manage',
    'tenant.manage',
    'billing.manage',
  ];

  switch (role) {
    case 'OWNER':
      return ownerPermissions;
    case 'ADMIN':
      return adminPermissions;
    case 'MANAGER':
      return managerPermissions;
    default:
      return basePermissions;
  }
}

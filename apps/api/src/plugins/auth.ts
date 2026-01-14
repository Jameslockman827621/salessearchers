// ===========================================
// Authentication Plugin
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import { prisma } from '@salessearchers/db';
import { UnauthorizedError, ForbiddenError, logger } from '@salessearchers/shared';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

interface JWTPayload {
  userId: string;
  tenantId: string;
  iat: number;
  exp: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (permission: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    userId?: string;
    tenantId?: string;
    userRole?: string;
    userPermissions?: string[];
  }
}

async function authPluginHandler(app: FastifyInstance) {
  // Authenticate decorator
  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    // Get token from cookie or header
    let token = request.cookies['token'];
    
    if (!token) {
      const authHeader = request.headers['authorization'];
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
      }
    }

    if (!token) {
      throw new UnauthorizedError('No token provided');
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
      
      // Verify user still exists and has access
      const membership = await prisma.membership.findFirst({
        where: {
          userId: payload.userId,
          tenantId: payload.tenantId,
          isActive: true,
        },
      });

      if (!membership) {
        throw new UnauthorizedError('Invalid session');
      }

      // Set request properties
      request.userId = payload.userId;
      request.tenantId = payload.tenantId;
      request.userRole = membership.role;
      request.userPermissions = getRolePermissions(membership.role);

    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid token');
      }
      throw error;
    }
  });

  // Permission check decorator
  app.decorate('requirePermission', function (permission: string) {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      if (!request.userPermissions?.includes(permission)) {
        throw new ForbiddenError(`Missing permission: ${permission}`);
      }
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

export const authPlugin = fp(authPluginHandler, {
  name: 'auth',
});

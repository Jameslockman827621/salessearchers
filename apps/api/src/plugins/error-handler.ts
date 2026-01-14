// ===========================================
// Error Handler Plugin
// ===========================================

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  logger,
} from '@salessearchers/shared';

async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler(async (error: Error, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.id;

    // Log error
    logger.error(
      'Request error',
      {
        requestId,
        path: request.url,
        method: request.method,
        errorName: error.name,
        errorCode: (error as AppError).code,
      },
      error
    );

    // Zod validation errors
    if (error instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        },
        meta: { requestId },
      });
    }

    // Custom app errors
    if (error instanceof AppError) {
      let statusCode = 500;

      if (error instanceof NotFoundError) {
        statusCode = 404;
      } else if (error instanceof UnauthorizedError) {
        statusCode = 401;
      } else if (error instanceof ForbiddenError) {
        statusCode = 403;
      } else if (error instanceof ValidationError) {
        statusCode = 400;
      }

      return reply.status(statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        meta: { requestId },
      });
    }

    // Fastify errors (e.g., payload too large, rate limit)
    if ('statusCode' in error && typeof error.statusCode === 'number') {
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: 'REQUEST_ERROR',
          message: error.message,
        },
        meta: { requestId },
      });
    }

    // Unknown errors - don't expose internal details in production
    const message =
      process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : error.message;

    return reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message,
        ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
      },
      meta: { requestId },
    });
  });

  // Not found handler
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
      meta: { requestId: request.id },
    });
  });
}

export const errorHandler = fp(errorHandlerPlugin, {
  name: 'error-handler',
});

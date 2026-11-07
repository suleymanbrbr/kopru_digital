import { errorCodes, type ErrorResponse } from '@kopru/contracts';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const statusDefaults: Record<number, { code: string; message: string }> = {
  400: { code: errorCodes.validation, message: 'İstek geçersiz.' },
  401: { code: errorCodes.unauthorized, message: 'Oturum açmanız gerekiyor.' },
  403: { code: errorCodes.forbidden, message: 'Bu işlem için yetkiniz yok.' },
  404: { code: errorCodes.notFound, message: 'Kayıt bulunamadı.' },
  409: { code: errorCodes.conflict, message: 'İşlem mevcut kayıtlarla çakışıyor.' },
  429: {
    code: errorCodes.rateLimited,
    message: 'Çok fazla istek gönderdiniz. Lütfen biraz bekleyin.',
  },
};

function body(
  request: FastifyRequest,
  code: string,
  message: string,
  details?: unknown,
): ErrorResponse {
  return {
    error: { code, message, requestId: request.id, ...(details === undefined ? {} : { details }) },
  };
}

/** Fastify error handler: her hata contracts'taki standart formata cevrilir. */
export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof AppError) {
    return reply
      .status(error.statusCode)
      .send(body(request, error.code, error.message, error.details));
  }

  if (hasZodFastifySchemaValidationErrors(error)) {
    const details = error.validation.map((issue) => ({
      path: issue.instancePath,
      message: issue.message,
    }));
    return reply
      .status(400)
      .send(body(request, errorCodes.validation, 'İstek doğrulanamadı.', details));
  }

  const statusCode =
    'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
  const known = statusDefaults[statusCode];
  if (statusCode < 500 && statusCode >= 400) {
    const fallback = known ?? { code: errorCodes.validation, message: 'İstek işlenemedi.' };
    return reply.status(statusCode).send(body(request, fallback.code, fallback.message));
  }

  request.log.error({ err: error }, 'beklenmeyen hata');
  return reply
    .status(500)
    .send(
      body(
        request,
        errorCodes.internal,
        'Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.',
      ),
    );
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply.status(404).send(body(request, errorCodes.notFound, 'İstenen kaynak bulunamadı.'));
}

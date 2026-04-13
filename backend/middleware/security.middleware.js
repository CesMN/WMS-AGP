import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

/**
 * Helmet + CORS + rate limit para /api/auth.
 * - CORS_ORIGIN: lista separada por comas (producción recomendado). Vacío en dev → origin reflejado.
 * - TRUST_PROXY=1: detrás de nginx/load balancer (IP correcta en rate limit).
 * - AUTH_RATE_LIMIT_MAX: intentos por ventana (defecto 30 / 15 min).
 */
export function setupSecurity(app) {
  if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );

  const corsOrigin = (process.env.CORS_ORIGIN || '').trim();
  const isProd = process.env.NODE_ENV === 'production';
  let corsOptions;

  if (corsOrigin) {
    const origins = corsOrigin.split(',').map((o) => o.trim()).filter(Boolean);
    corsOptions = {
      origin: origins.length === 1 ? origins[0] : origins,
      credentials: true,
    };
  } else if (isProd) {
    console.warn(
      '[security] CORS_ORIGIN no definido en producción. Se acepta el origen de la petición (origin: true). Configure CORS_ORIGIN=https://su-app.com'
    );
    corsOptions = { origin: true, credentials: true };
  } else {
    corsOptions = { origin: true, credentials: true };
  }

  app.use(cors(corsOptions));

  const windowMs = 15 * 60 * 1000;
  const max = Math.max(1, Math.min(200, Number(process.env.AUTH_RATE_LIMIT_MAX || 30) || 30));

  const authLimiter = rateLimit({
    windowMs,
    max,
    message: { message: 'Demasiados intentos. Espere unos minutos e inténtelo de nuevo.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  return { authLimiter };
}

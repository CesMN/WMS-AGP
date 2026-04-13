import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

describe('/api/auth', () => {
  afterEach(() => {
    delete process.env.AUTH_RATE_LIMIT_MAX;
  });

  it('rechaza email invalido con 400 (sin consultar credenciales)', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/login').send({ email: 'no-valido', password: 'x' });
    expect(res.status).toBe(400);
  });

  it('responde 429 al superar el limite de peticiones en /api/auth', async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '3';
    const app = createApp();
    for (let i = 0; i < 3; i++) {
      const r = await request(app).post('/api/auth/login').send({ email: 'no-valido', password: 'x' });
      expect(r.status).toBe(400);
    }
    const blocked = await request(app).post('/api/auth/login').send({ email: 'no-valido', password: 'x' });
    expect(blocked.status).toBe(429);
    expect(String(blocked.body?.message || '')).toMatch(/demasiados/i);
  });
});

describe('rutas API', () => {
  it('devuelve 404 para ruta API inexistente', async () => {
    const app = createApp();
    const res = await request(app).get('/api/ruta-inexistente-test');
    expect(res.status).toBe(404);
    expect(res.body.message).toBeDefined();
  });
});

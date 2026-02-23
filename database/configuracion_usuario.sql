-- Configuración por usuario: cada usuario puede tener su propia configuración.
-- Si no existe valor para un usuario, se usa el de la tabla configuracion (global).
CREATE TABLE IF NOT EXISTS configuracion_usuario (
    user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    clave VARCHAR(255) NOT NULL,
    valor TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, clave)
);

CREATE INDEX IF NOT EXISTS idx_configuracion_usuario_user ON configuracion_usuario(user_id);

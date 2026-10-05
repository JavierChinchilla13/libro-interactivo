# Libro Interactivo — universo Memorias

Plataforma web que acompaña la saga de libros "Memorias": sitio público, cuentas de lectores, quizzes, juego final, capítulos extra, actualizaciones, personajes, glosario, fan arts, reseñas y panel de administración. Todo el contenido vive en la base de datos y está organizado por libro.

**Estado:** Fase 2 (base técnica del monorepo). Aún no hay funcionalidades; la portada solo muestra el estado del servidor.

## Stack
React + TypeScript (Vite) · Node.js + Express (TypeScript) · MongoDB Atlas (Mongoose) · Cloudinary (imágenes) · almacenamiento S3-compatible (documentos privados) · Render. Monorepo con npm workspaces: `apps/web`, `apps/api`, `packages/shared`.

## Flujo de trabajo
Una rama por fase (`fase-N-nombre`), commits pequeños, pruebas al final de cada fase. No se hace push a `main` sin confirmación.

## Empezar en local
Requisitos: Node ≥ 22 y npm (no hace falta Docker ni MongoDB instalado).

```bash
npm ci
npm run dev:db   # terminal 1: MongoDB de desarrollo (puerto 27017)
npm run dev      # terminal 2: api en :3000 y web en http://localhost:5173
```

Pruebas y calidad: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`. Variables de entorno: [apps/api/.env.example](apps/api/.env.example) (en desarrollo todo tiene un valor por defecto).

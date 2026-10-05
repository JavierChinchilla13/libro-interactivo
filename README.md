# Libro Interactivo — universo Memorias

Plataforma web que acompaña la saga de libros "Memorias": sitio público, cuentas de lectores, quizzes, juego final, capítulos extra, actualizaciones, personajes, glosario, fan arts, reseñas y panel de administración. Todo el contenido vive en la base de datos y está organizado por libro.

**Estado:** planificación (sin código de la aplicación todavía).

## Stack
React + TypeScript (Vite) · Node.js + Express (TypeScript) · MongoDB Atlas (Mongoose) · Cloudinary (imágenes) · almacenamiento S3-compatible (documentos privados) · Render. Monorepo con npm workspaces: `apps/web`, `apps/api`, `packages/shared`.

## Flujo de trabajo
Una rama por fase (`fase-N-nombre`), commits pequeños, pruebas al final de cada fase. No se hace push a `main` sin confirmación.

import {
  attemptResponseSchema,
  progressResponseSchema,
  publicBookDetailSchema,
  publicBookListResponseSchema,
  quizIntroResponseSchema,
  quizResultsResponseSchema,
  readerExtraResponseSchema,
  readerExtrasResponseSchema,
  resultsListResponseSchema,
  welcomeResponseSchema,
} from '@libro/shared';
import { z } from 'zod';
import { apiRequest } from '../../shared/api/client';

/** Llamadas del lector. Todas validan la respuesta con el esquema compartido; el servidor decide todo el acceso. */

export const booksApi = {
  list: () => apiRequest('/books', publicBookListResponseSchema),
  get: (slug: string) => apiRequest(`/books/${encodeURIComponent(slug)}`, publicBookDetailSchema),
};

export const readerApi = {
  progress: (bookId: string) => apiRequest(`/me/progress?bookId=${bookId}`, progressResponseSchema),
  results: (bookId: string) =>
    apiRequest(`/me/results?bookId=${bookId}`, resultsListResponseSchema),
  quizResults: (quizId: string) => apiRequest(`/me/results/${quizId}`, quizResultsResponseSchema),
  intro: (quizId: string) => apiRequest(`/quizzes/${quizId}`, quizIntroResponseSchema),
  start: (quizId: string) =>
    apiRequest(`/quizzes/${quizId}/attempts`, attemptResponseSchema, { method: 'POST' }),
  /** Envía TODAS las respuestas de la etapa (una por pregunta). */
  submit: (attemptId: string, stageId: string, answers: Record<string, string>) =>
    apiRequest(`/attempts/${attemptId}/stages/${stageId}/answers`, attemptResponseSchema, {
      method: 'POST',
      body: {
        answers: Object.entries(answers).map(([questionId, answerId]) => ({
          questionId,
          answerId,
        })),
      },
    }),
  extras: (bookId: string) => apiRequest(`/extras?bookId=${bookId}`, readerExtrasResponseSchema),
  extra: (extraId: string) => apiRequest(`/extras/${extraId}`, readerExtraResponseSchema),
  welcome: () => apiRequest('/me/welcome', welcomeResponseSchema),
  welcomeSeen: () => apiRequest('/me/welcome-seen', z.null(), { method: 'POST' }),
};

export const readerKeys = {
  books: ['reader', 'books'] as const,
  progress: (bookId: string) => ['reader', 'progress', bookId] as const,
  results: (bookId: string) => ['reader', 'results', bookId] as const,
  quizResults: (quizId: string) => ['reader', 'quiz-results', quizId] as const,
  intro: (quizId: string) => ['reader', 'intro', quizId] as const,
  extras: (bookId: string) => ['reader', 'extras', bookId] as const,
  welcome: ['reader', 'welcome'] as const,
};

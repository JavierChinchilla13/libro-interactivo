import { postDetailSchema, postListResponseSchema, type PostCategory } from '@libro/shared';
import { apiRequest } from '../../shared/api/client';

/** Llamadas públicas de las actualizaciones (sin sesión). */
export const postsApi = {
  list: (params: {
    category?: PostCategory | undefined;
    featured?: boolean;
    page?: number;
    pageSize?: number;
  }) => {
    const query = new URLSearchParams();
    if (params.category) query.set('category', params.category);
    if (params.featured !== undefined) query.set('featured', String(params.featured));
    query.set('page', String(params.page ?? 1));
    query.set('pageSize', String(params.pageSize ?? 9));
    return apiRequest(`/posts?${query.toString()}`, postListResponseSchema);
  },
  get: (slug: string) => apiRequest(`/posts/${encodeURIComponent(slug)}`, postDetailSchema),
};

export const postKeys = {
  list: (category: PostCategory | undefined) => ['posts', 'list', category ?? 'todas'] as const,
  featured: ['posts', 'featured'] as const,
  detail: (slug: string) => ['posts', 'detail', slug] as const,
};

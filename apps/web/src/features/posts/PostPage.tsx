import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { ApiClientError } from '../../shared/api/client';
import { errorMessage } from '../../shared/api/messages';
import { Alert, Loading } from '../../shared/ui/layout';
import { postKeys, postsApi } from './api';
import { PostView } from './templates';

function Back() {
  return (
    <p className="mx-auto w-full max-w-2xl text-sm">
      <Link to="/actualizaciones" className="underline">
        ← Actualizaciones
      </Link>
    </p>
  );
}

/** Una publicación con la plantilla que eligió la autora. Una que no existe, no es pública aún o ya no está da 404. */
export function PostPage() {
  const { slug = '' } = useParams();
  const query = useQuery({
    queryKey: postKeys.detail(slug),
    queryFn: () => postsApi.get(slug),
    retry: false,
  });

  if (query.isPending) return <Loading />;
  if (query.isError) {
    const missing = query.error instanceof ApiClientError && query.error.code === 'NOT_FOUND';
    return (
      <div className="flex flex-col gap-4">
        <Back />
        <Alert>{missing ? 'No encontramos esa publicación.' : errorMessage(query.error)}</Alert>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <Back />
      <PostView post={query.data} />
    </div>
  );
}

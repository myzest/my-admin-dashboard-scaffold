import { useState } from 'react';
import useSWR from 'swr';

export default function usePaginatedList(endpoint, filters = {}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const query = new URLSearchParams({ page, pageSize, ...filters });
  const result = useSWR(`${endpoint}?${query}`, {
    onSuccess: (data) => {
      const lastPage = Math.max(1, Math.ceil(data.pagination.total / pageSize));
      if (page > lastPage) setPage(lastPage);
    },
  });

  function changePage(nextPage, nextPageSize) {
    setPage(nextPageSize === pageSize ? nextPage : 1);
    setPageSize(nextPageSize);
  }

  function refresh() {
    return result.mutate(undefined, {
      revalidate: true,
      populateCache: false,
      throwOnError: false,
    });
  }

  return { ...result, page, pageSize, setPage, changePage, refresh };
}

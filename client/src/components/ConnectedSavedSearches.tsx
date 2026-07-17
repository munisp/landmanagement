import { SavedSearches, SavedSearch } from './SavedSearches';
import { trpc } from '@/lib/trpc';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ConnectedSavedSearchesProps {
  onLoadSearch: (search: SavedSearch) => void;
  currentQuery: Record<string, any>;
}

export function ConnectedSavedSearches({ onLoadSearch, currentQuery }: ConnectedSavedSearchesProps) {
  const utils = trpc.useUtils();

  const { data: searches = [], isLoading } = trpc.savedSearches.list.useQuery();

  const createSearch = trpc.savedSearches.create.useMutation({
    onSuccess: () => {
      utils.savedSearches.list.invalidate();
      toast.success('Search saved successfully');
    },
    onError: () => {
      toast.error('Failed to save search');
    },
  });

  const deleteSearch = trpc.savedSearches.delete.useMutation({
    onSuccess: () => {
      utils.savedSearches.list.invalidate();
      toast.success('Search deleted');
    },
    onError: () => {
      toast.error('Failed to delete search');
    },
  });

  const toggleFavorite = trpc.savedSearches.toggleFavorite.useMutation({
    onSuccess: () => {
      utils.savedSearches.list.invalidate();
    },
  });

  const handleSaveSearch = async (name: string, query: Record<string, any>) => {
    await createSearch.mutateAsync({ name, query });
  };

  const handleDeleteSearch = async (id: string) => {
    await deleteSearch.mutateAsync({ id });
  };

  const handleToggleFavorite = async (id: string) => {
    await toggleFavorite.mutateAsync({ id });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Transform API searches to SavedSearches format
  const transformedSearches: SavedSearch[] = searches.map((search) => ({
    id: String(search.id),
    name: search.name,
    query: search.query as Record<string, any>,
    isFavorite: search.isFavorite,
    createdAt: new Date(search.createdAt),
  }));

  return (
    <SavedSearches
      searches={transformedSearches}
      onSave={handleSaveSearch}
      onLoad={onLoadSearch}
      onDelete={handleDeleteSearch}
      onToggleFavorite={handleToggleFavorite}
      currentQuery={currentQuery}
    />
  );
}

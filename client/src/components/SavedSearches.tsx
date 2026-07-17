import { useState } from 'react';
import { Save, Star, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

export interface SavedSearch {
  id: string;
  name: string;
  query: Record<string, any>;
  createdAt: Date;
  isFavorite?: boolean;
}

interface SavedSearchesProps {
  searches: SavedSearch[];
  onSave: (name: string, query: Record<string, any>) => void;
  onLoad: (search: SavedSearch) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  currentQuery: Record<string, any>;
}

export function SavedSearches({
  searches,
  onSave,
  onLoad,
  onDelete,
  onToggleFavorite,
  currentQuery,
}: SavedSearchesProps) {
  const [open, setOpen] = useState(false);
  const [searchName, setSearchName] = useState('');

  const handleSave = () => {
    if (!searchName.trim()) {
      toast.error('Please enter a name for this search');
      return;
    }

    onSave(searchName, currentQuery);
    setSearchName('');
    setOpen(false);
    toast.success('Search saved successfully');
  };

  const handleLoad = (search: SavedSearch) => {
    onLoad(search);
    toast.success(`Loaded search: ${search.name}`);
  };

  const handleDelete = (id: string, name: string) => {
    onDelete(id);
    toast.success(`Deleted search: ${name}`);
  };

  const favorites = searches.filter(s => s.isFavorite);
  const regular = searches.filter(s => !s.isFavorite);

  return (
    <div className="space-y-4">
      {/* Save Current Search */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Save className="h-4 w-4" />
            Save Current Search
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Search</DialogTitle>
            <DialogDescription>
              Give this search a name so you can quickly access it later.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="e.g., Lagos Residential Properties"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSave();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Search</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Saved Searches List */}
      {searches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saved Searches</CardTitle>
            <CardDescription>
              Quickly load your frequently used search filters
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Favorites */}
            {favorites.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Favorites</h4>
                {favorites.map((search) => (
                  <div
                    key={search.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{search.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(search.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleLoad(search)}
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onToggleFavorite(search.id)}
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(search.id, search.name)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Regular Searches */}
            {regular.length > 0 && (
              <div className="space-y-2">
                {favorites.length > 0 && (
                  <h4 className="text-sm font-medium text-muted-foreground">All Searches</h4>
                )}
                {regular.map((search) => (
                  <div
                    key={search.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">{search.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(search.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleLoad(search)}
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onToggleFavorite(search.id)}
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(search.id, search.name)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

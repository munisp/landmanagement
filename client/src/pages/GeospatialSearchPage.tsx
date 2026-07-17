/**
 * Geospatial Search Page
 * Map-based parcel search with radius selector
 */

import { GeospatialSearchWithBatch } from '@/components/GeospatialSearchWithBatch';

export default function GeospatialSearchPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold">Geospatial Search</h1>
          <p className="text-muted-foreground mt-2">
            Find parcels near a location using interactive map search
          </p>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <GeospatialSearchWithBatch />
      </div>
    </div>
  );
}

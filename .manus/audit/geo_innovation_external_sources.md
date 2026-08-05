# Geospatial Innovation External Sources

## OGC API family

Source: https://ogcapi.ogc.org/

The OGC API family defines modular, resource-centric building blocks for sharing, accessing, integrating, and analyzing geospatial data on the web. Relevant approved standards identified for this implementation include Features, Tiles, Processes, Maps, Records, Connected Systems, and DGGS. The source describes Features for feature data, Tiles for tiled vector/map data, Processes for invoking geoprocessing tools, Records for catalog metadata, and Connected Systems for dynamic system data.

## OGC API Features

Source: https://www.ogc.org/standards/ogcapi-features/

OGC API Features defines web API building blocks for interacting with geospatial features. The standard includes discovery/query operations, fine-grained feature-level access, CRS support through Part 2, and CQL2 filtering through Part 3. This supports an interoperable parcel collection endpoint with standards-inspired collection metadata, bbox filtering, CRS declaration, and GeoJSON feature output.

## STAC

Source: https://stacspec.org/

STAC provides a common structure for describing and cataloging spatiotemporal assets. It defines Items as GeoJSON features with datetime and links, Collections as catalog groupings with extent/license/provider metadata, and STAC API for RESTful search. It is applicable to the platform's imagery, LiDAR, field observation, raster, and derived GeoAI asset records.

## Cloud Optimized GeoTIFF

Source: https://www.ogc.org/standards/ogc-cloud-optimized-geotiff/

COG relies on TIFF tiles, reduced-resolution subfiles, GeoTIFF georeferencing keys, and HTTP range requests to support partial web delivery and efficient visualization/processing. This supports a COG-readiness innovation that reports actual inspection findings and never labels a raster as COG without verified metadata.

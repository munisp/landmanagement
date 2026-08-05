import asyncio
import unittest

from fastapi import HTTPException

from api.geo_innovations_service import (
    GeometryQualityRequest,
    HazardProfileRequest,
    HazardSource,
    PrivacyReleaseRequest,
    StacAssetLink,
    StacValidationRequest,
    build_hazard_profile,
    geometry_quality,
    prepare_privacy_release,
    validate_stac_item,
)

CHECKSUM = "a" * 64
PARCEL = {
    "type": "Polygon",
    "coordinates": [[[3.0, 6.0], [3.001, 6.0], [3.001, 6.001], [3.0, 6.001], [3.0, 6.0]]],
}
HAZARD = {
    "type": "Polygon",
    "coordinates": [[[3.0005, 6.0005], [3.0015, 6.0005], [3.0015, 6.0015], [3.0005, 6.0015], [3.0005, 6.0005]]],
}


class GeoInnovationServiceTests(unittest.TestCase):
    def test_geometry_quality_reports_measurement_and_non_certification(self):
        result = asyncio.run(geometry_quality(GeometryQualityRequest(
            geometry=PARCEL,
            source_crs="EPSG:4326",
            analysis_crs="EPSG:32631",
            source_asset_id="parcel-asset-001",
            source_checksum_sha256=CHECKSUM,
            reported_horizontal_accuracy_m=1.5,
            expected_horizontal_accuracy_m=2.0,
            lineage_completeness_pct=90,
        )))
        self.assertEqual(result["status"], "computed")
        self.assertGreater(result["geometry"]["metric_area_m2"], 0)
        self.assertTrue(result["score"]["not_a_legal_certification"])

    def test_hazard_overlay_keeps_source_lineage_and_coverage(self):
        result = asyncio.run(build_hazard_profile(HazardProfileRequest(
            parcel_geometry=PARCEL,
            parcel_source_crs="EPSG:4326",
            analysis_crs="EPSG:32631",
            parcel_asset_id="parcel-asset-001",
            parcel_checksum_sha256=CHECKSUM,
            hazards=[HazardSource(
                hazard_id="hazard-001",
                hazard_type="flood_extent",
                severity=4,
                geometry=HAZARD,
                source_asset_id="hazard-asset-001",
                source_checksum_sha256=CHECKSUM,
            )],
        )))
        self.assertEqual(result["hazard_count"], 1)
        self.assertGreater(result["exposures"][0]["parcel_coverage_pct"], 0)
        self.assertEqual(result["exposures"][0]["source_asset_id"], "hazard-asset-001")

    def test_stac_validation_rejects_a_bbox_outside_the_geometry(self):
        request = StacValidationRequest(
            item_id="item-001",
            collection_key="imagery",
            geometry=PARCEL,
            bbox=[4.0, 7.0, 4.1, 7.1],
            datetime="2026-08-04T00:00:00Z",
            assets={"visual": StacAssetLink(href="https://assets.example/scene.tif", media_type="image/tiff")},
        )
        with self.assertRaises(HTTPException) as context:
            asyncio.run(validate_stac_item(request))
        self.assertEqual(context.exception.status_code, 422)

    def test_privacy_release_generalizes_geometry_and_preserves_notice(self):
        result = asyncio.run(prepare_privacy_release(PrivacyReleaseRequest(
            geometry=PARCEL,
            source_crs="EPSG:4326",
            analysis_crs="EPSG:32631",
            method="grid_centroid",
            grid_size_m=1000,
            source_asset_id="parcel-asset-001",
            source_checksum_sha256=CHECKSUM,
            license="CC-BY-4.0",
            legal_notice="Released geometry is generalized and cannot be used as a legal boundary.",
        )))
        self.assertEqual(result["status"], "prepared_for_human_approval")
        self.assertEqual(result["feature"]["geometry"]["type"], "Point")
        self.assertTrue(result["feature"]["properties"]["not_for_legal_or_regulatory_boundary_use"])


if __name__ == "__main__":
    unittest.main()

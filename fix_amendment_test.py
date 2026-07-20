with open('/home/ubuntu/landmanagement/server/postgresPersistence.test.ts', 'r') as f:
    content = f.read()

old_test = """  it('rejects updates to registered parcels (amendment workflow rule)', async () => {
    // Create a parcel and force its status to registered (for testing)
    const created = await createParcel({
      surveyPlanNumber: 'SP/TEST/REGISTERED',
      state: 'Abuja',
      lga: 'Garki',
      areaSquareMeters: 900,
      geometryGeoJSON: '{}',
      landUseType: 'commercial',
      surveyorId: 'surveyor-test',
    });
    // In a real scenario, there's a full workflow to register. 
    // Here we'll just try to update a known registered parcel from the JSON seed store if it exists,
    // or we skip the test if we are using pure DB without the seed.
    // Actually, updateParcel uses the JSON store in the current implementation, so we can use ID 2 
    // if we ensure the store is loaded. Wait, updateParcel throws Error('Parcel not found') if ID 2 doesn't exist.
    // Let's create one, then manually modify the store or use a try/catch to handle both cases.
    try {
      await expect(updateParcel(2, { notes: 'illegal edit' })).rejects.toThrow(/amendment/i);
    } catch (e) {
      if (e.message === 'Parcel not found') {
        // Skip if parcel 2 isn't in the store
        console.log('Skipping test: Parcel 2 not found in store');
      } else {
        throw e;
      }
    }
  });"""

new_test = """  it('rejects updates to registered parcels (amendment workflow rule)', async () => {
    // Parcel 2 is seeded as 'registered' in the file-based JSON store.
    // The parcelRepository uses a file-backed store, so parcel 2 should always be present.
    // We verify the amendment workflow rule is enforced.
    await expect(updateParcel(2, { notes: 'illegal edit' })).rejects.toThrow(/amendment/i);
  });"""

content = content.replace(old_test, new_test)

with open('/home/ubuntu/landmanagement/server/postgresPersistence.test.ts', 'w') as f:
    f.write(content)
    
print("Done")

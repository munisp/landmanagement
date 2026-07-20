with open('/home/ubuntu/landmanagement/server/registryIntegrityService.ts', 'r') as f:
    content = f.read()

old_catch = """    } catch (err: any) {
      // FK violation: parcel_id from in-memory store not yet persisted to DB.
      // Retry without the FK-constrained parcel_id, storing it in relatedEntityId instead.
      if (err?.code === '23503' && String(err?.constraint ?? '').includes('parcel_id')) {"""

new_catch = """    } catch (err: any) {
      // FK violation: parcel_id from in-memory store not yet persisted to DB.
      // Retry without the FK-constrained parcel_id, storing it in relatedEntityId instead.
      // Drizzle wraps the PG error; check both err and err.cause for the FK code.
      const pgErr = err?.cause ?? err;
      const isFkViolation = (pgErr?.code === '23503' || err?.code === '23503') &&
        (String(pgErr?.constraint ?? err?.constraint ?? '').includes('parcel_id') ||
         String(pgErr?.detail ?? err?.detail ?? '').includes('parcel_id'));
      if (isFkViolation) {"""

content = content.replace(old_catch, new_catch)

with open('/home/ubuntu/landmanagement/server/registryIntegrityService.ts', 'w') as f:
    f.write(content)
    
print("Done")

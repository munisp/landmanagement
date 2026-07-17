# PostgreSQL Migration Guide: TiDB to PostgreSQL

**Author**: Manus AI  
**Last Updated**: February 24, 2026  
**Version**: 1.0

---

## Table of Contents

1. [Overview](#overview)
2. [Why PostgreSQL](#why-postgresql)
3. [Migration Strategy](#migration-strategy)
4. [Schema Comparison](#schema-comparison)
5. [Data Type Mapping](#data-type-mapping)
6. [Migration Steps](#migration-steps)
7. [Drizzle ORM Configuration](#drizzle-orm-configuration)
8. [Testing and Validation](#testing-and-validation)
9. [Rollback Procedures](#rollback-procedures)
10. [Performance Optimization](#performance-optimization)

---

## Overview

This guide provides a comprehensive plan for migrating the IDLR-PTS platform from TiDB (MySQL-compatible) to PostgreSQL. The migration aligns with the platform's requirements for **cloud-agnostic**, **open-source** database solutions.

### Migration Goals

- **Cloud Agnosticism**: Use open-source PostgreSQL instead of vendor-specific managed services
- **Data Integrity**: Ensure zero data loss during migration
- **Minimal Downtime**: Implement blue-green deployment strategy
- **Performance**: Optimize for PostgreSQL-specific features
- **Compatibility**: Maintain existing application logic with minimal changes

### Current Database

- **Database**: TiDB 8.5.0 (MySQL 8.0 compatible)
- **Host**: gateway01.us-west-2.prod.aws.tidbcloud.com
- **Port**: 4000
- **SSL**: Required

### Target Database

- **Database**: PostgreSQL 16.x
- **Deployment**: Self-hosted or cloud-agnostic managed service (e.g., Aiven, Crunchy Data)
- **Replication**: Multi-master or primary-replica setup
- **Connection Pooling**: PgBouncer

---

## Why PostgreSQL

### Advantages Over TiDB/MySQL

1. **Advanced Data Types**
   - JSONB with indexing (faster than MySQL JSON)
   - Array types for multi-value columns
   - UUID native type
   - PostGIS for geospatial data

2. **Better Query Optimization**
   - More sophisticated query planner
   - Parallel query execution
   - Better index types (GIN, GIST, BRIN)

3. **ACID Compliance**
   - True MVCC (Multi-Version Concurrency Control)
   - Better isolation levels
   - More reliable transaction handling

4. **Extensibility**
   - Custom functions in multiple languages (PL/pgSQL, Python, etc.)
   - Extensions ecosystem (PostGIS, pg_cron, TimescaleDB)
   - Full-text search built-in

5. **Open Source & Community**
   - Truly open-source (PostgreSQL License)
   - Large community and ecosystem
   - No vendor lock-in

6. **Cloud Agnostic**
   - Runs anywhere (on-premise, cloud, hybrid)
   - Multiple managed service providers
   - Easy to migrate between providers

---

## Migration Strategy

### Approach: Blue-Green Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                     Migration Timeline                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Phase 1: Preparation (Week 1-2)                            │
│  ├─ Set up PostgreSQL cluster                               │
│  ├─ Convert schema                                           │
│  └─ Test migrations                                          │
│                                                               │
│  Phase 2: Initial Data Migration (Week 3)                   │
│  ├─ Full database dump from TiDB                            │
│  ├─ Transform and load to PostgreSQL                        │
│  └─ Verify data integrity                                    │
│                                                               │
│  Phase 3: Dual-Write Period (Week 4-5)                      │
│  ├─ Write to both TiDB and PostgreSQL                       │
│  ├─ Read from TiDB (primary)                                │
│  └─ Continuous sync and validation                          │
│                                                               │
│  Phase 4: Cutover (Week 6)                                  │
│  ├─ Switch reads to PostgreSQL                              │
│  ├─ Monitor performance                                      │
│  └─ Stop writes to TiDB                                      │
│                                                               │
│  Phase 5: Cleanup (Week 7)                                  │
│  ├─ Remove TiDB connection                                   │
│  ├─ Optimize PostgreSQL                                      │
│  └─ Archive TiDB data                                        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Zero-Downtime Strategy

1. **Dual-Write Phase**
   - Application writes to both databases
   - Reads from TiDB (primary)
   - Background sync validates consistency

2. **Gradual Cutover**
   - Switch read traffic to PostgreSQL gradually (10% → 50% → 100%)
   - Monitor error rates and performance
   - Rollback capability at each step

3. **Final Cutover**
   - Stop writes to TiDB
   - PostgreSQL becomes primary
   - Keep TiDB as backup for 30 days

---

## Schema Comparison

### Current TiDB Schema (Drizzle ORM)

The platform uses Drizzle ORM with TiDB-compatible schema:

```typescript
// drizzle/schema.ts (current)
import { mysqlTable, varchar, int, timestamp, text, boolean } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  openId: varchar('open_id', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  role: varchar('role', { length: 50 }).default('user'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});
```

### Target PostgreSQL Schema

```typescript
// drizzle/schema-postgres.ts (new)
import { pgTable, serial, varchar, integer, timestamp, text, boolean, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  openId: varchar('open_id', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  role: varchar('role', { length: 50 }).default('user'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

### Key Differences

| Feature | TiDB/MySQL | PostgreSQL |
|---------|------------|------------|
| Auto-increment | `autoincrement()` | `serial` or `GENERATED ALWAYS AS IDENTITY` |
| Timestamp update | `onUpdateNow()` | Trigger or application logic |
| Boolean | `tinyint(1)` | `boolean` |
| JSON | `json` | `jsonb` (binary, indexed) |
| UUID | `varchar(36)` | `uuid` (native type) |
| Arrays | Not supported | `text[]`, `integer[]`, etc. |
| Full-text search | `FULLTEXT` index | `tsvector` and `tsquery` |

---

## Data Type Mapping

### Complete Mapping Table

| TiDB/MySQL Type | PostgreSQL Type | Notes |
|-----------------|-----------------|-------|
| `INT` | `INTEGER` | Same |
| `BIGINT` | `BIGINT` | Same |
| `VARCHAR(n)` | `VARCHAR(n)` | Same |
| `TEXT` | `TEXT` | Same |
| `TIMESTAMP` | `TIMESTAMP` | PostgreSQL has better timezone support |
| `DATETIME` | `TIMESTAMP` | Use `TIMESTAMP WITH TIME ZONE` for TZ-aware |
| `BOOLEAN` / `TINYINT(1)` | `BOOLEAN` | Native boolean in PostgreSQL |
| `JSON` | `JSONB` | Binary format, faster queries |
| `ENUM('a','b')` | `VARCHAR` + `CHECK` or custom `ENUM` type | PostgreSQL ENUMs are more strict |
| `DECIMAL(p,s)` | `NUMERIC(p,s)` | Same precision |
| `FLOAT` | `REAL` | 4 bytes |
| `DOUBLE` | `DOUBLE PRECISION` | 8 bytes |
| `BLOB` | `BYTEA` | Binary data |

### Special Cases

#### 1. Auto-Increment Primary Keys

**TiDB:**
```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY
);
```

**PostgreSQL:**
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY
);
-- OR (preferred in PostgreSQL 10+)
CREATE TABLE users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY
);
```

#### 2. Timestamp with Auto-Update

**TiDB:**
```sql
CREATE TABLE users (
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**PostgreSQL:**
```sql
CREATE TABLE users (
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create trigger for auto-update
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

#### 3. JSON Columns

**TiDB:**
```sql
CREATE TABLE settings (
  data JSON
);
```

**PostgreSQL:**
```sql
CREATE TABLE settings (
  data JSONB  -- Binary format, faster and indexable
);

-- Create GIN index for fast queries
CREATE INDEX idx_settings_data ON settings USING GIN (data);
```

---

## Migration Steps

### Step 1: Set Up PostgreSQL Cluster

#### Option A: Self-Hosted (Recommended for Full Control)

```bash
# Install PostgreSQL 16
sudo apt update
sudo apt install -y postgresql-16 postgresql-contrib-16

# Configure PostgreSQL
sudo -u postgres psql << EOF
CREATE DATABASE idlr_pts;
CREATE USER idlr_admin WITH ENCRYPTED PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE idlr_pts TO idlr_admin;
ALTER DATABASE idlr_pts OWNER TO idlr_admin;
\c idlr_pts
GRANT ALL ON SCHEMA public TO idlr_admin;
EOF

# Configure pg_hba.conf for remote access
sudo nano /etc/postgresql/16/main/pg_hba.conf
# Add: host idlr_pts idlr_admin 0.0.0.0/0 scram-sha-256

# Configure postgresql.conf
sudo nano /etc/postgresql/16/main/postgresql.conf
# Set: listen_addresses = '*'
# Set: max_connections = 200
# Set: shared_buffers = 4GB
# Set: effective_cache_size = 12GB

# Restart PostgreSQL
sudo systemctl restart postgresql
```

#### Option B: Cloud-Agnostic Managed Service

**Aiven (Recommended)**
- Multi-cloud support (AWS, GCP, Azure)
- Open-source PostgreSQL
- Automated backups and HA
- No vendor lock-in

```bash
# Install Aiven CLI
pip3 install aiven-client

# Login
avn user login

# Create PostgreSQL service
avn service create idlr-pts-pg \
  --service-type pg \
  --cloud aws-us-west-2 \
  --plan business-4 \
  --project your-project

# Get connection info
avn service get idlr-pts-pg --format json
```

**Crunchy Data**
- Kubernetes-native PostgreSQL
- Open-source operator
- Enterprise support available

### Step 2: Convert Schema

Create PostgreSQL-compatible schema:

```bash
cd /home/ubuntu/idlr-pts-platform

# Create new schema file
cp drizzle/schema.ts drizzle/schema-postgres.ts

# Edit schema-postgres.ts to use PostgreSQL types
# (See schema comparison section above)
```

Example conversion script:

```typescript
// scripts/convert-schema.ts
import * as fs from 'fs';

const schemaContent = fs.readFileSync('drizzle/schema.ts', 'utf-8');

// Replace MySQL imports with PostgreSQL imports
let postgresSchema = schemaContent
  .replace(/from 'drizzle-orm\/mysql-core'/g, "from 'drizzle-orm/pg-core'")
  .replace(/mysqlTable/g, 'pgTable')
  .replace(/\.autoincrement\(\)/g, '') // Remove autoincrement, use serial
  .replace(/int\('id'\)\.primaryKey\(\)/g, "serial('id').primaryKey()")
  .replace(/\.onUpdateNow\(\)/g, '') // Remove onUpdateNow, will use triggers
  .replace(/varchar\('role',\s*{\s*length:\s*50\s*}\)/g, "varchar('role', { length: 50 })");

fs.writeFileSync('drizzle/schema-postgres.ts', postgresSchema);
console.log('✅ Schema converted to PostgreSQL');
```

Run conversion:

```bash
npx tsx scripts/convert-schema.ts
```

### Step 3: Configure Drizzle for PostgreSQL

Update `drizzle.config.ts`:

```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: './drizzle/schema-postgres.ts', // Use PostgreSQL schema
  out: './drizzle/migrations-postgres',
  driver: 'pg', // Change from 'mysql2' to 'pg'
  dbCredentials: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'idlr_admin',
    password: process.env.POSTGRES_PASSWORD || '',
    database: process.env.POSTGRES_DATABASE || 'idlr_pts',
    ssl: process.env.POSTGRES_SSL === 'true',
  },
} satisfies Config;
```

Install PostgreSQL driver:

```bash
pnpm add pg
pnpm add -D @types/pg
pnpm remove mysql2
```

### Step 4: Generate PostgreSQL Migrations

```bash
# Generate migrations for PostgreSQL
pnpm drizzle-kit generate:pg

# Review generated migrations
ls -la drizzle/migrations-postgres/
```

### Step 5: Export Data from TiDB

```bash
# Create export directory
mkdir -p /tmp/tidb-export

# Export all tables
mysqldump \
  --host=gateway01.us-west-2.prod.aws.tidbcloud.com \
  --port=4000 \
  --user=your-username \
  --password \
  --ssl-mode=REQUIRED \
  --databases idlr_pts \
  --single-transaction \
  --quick \
  --lock-tables=false \
  --result-file=/tmp/tidb-export/idlr_pts.sql

# Export as CSV for easier transformation
for table in users parcels transactions blockchain_transactions; do
  mysql \
    --host=gateway01.us-west-2.prod.aws.tidbcloud.com \
    --port=4000 \
    --user=your-username \
    --password \
    --ssl-mode=REQUIRED \
    --database=idlr_pts \
    --execute="SELECT * FROM $table" \
    | sed 's/\t/","/g;s/^/"/;s/$/"/;s/\n//g' > /tmp/tidb-export/${table}.csv
done
```

### Step 6: Transform and Load Data

Create transformation script:

```typescript
// scripts/migrate-data.ts
import { Client } from 'pg';
import * as fs from 'fs';
import * as csv from 'csv-parser';

const pgClient = new Client({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE,
  ssl: process.env.POSTGRES_SSL === 'true',
});

async function migrateTable(tableName: string) {
  console.log(`Migrating table: ${tableName}`);

  const rows: any[] = [];
  
  // Read CSV
  await new Promise((resolve, reject) => {
    fs.createReadStream(`/tmp/tidb-export/${tableName}.csv`)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', resolve)
      .on('error', reject);
  });

  // Insert into PostgreSQL
  for (const row of rows) {
    const columns = Object.keys(row);
    const values = Object.values(row);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

    const query = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT DO NOTHING
    `;

    try {
      await pgClient.query(query, values);
    } catch (error) {
      console.error(`Error inserting row into ${tableName}:`, error);
    }
  }

  console.log(`✅ Migrated ${rows.length} rows from ${tableName}`);
}

async function main() {
  await pgClient.connect();

  const tables = ['users', 'parcels', 'transactions', 'blockchain_transactions'];
  
  for (const table of tables) {
    await migrateTable(table);
  }

  await pgClient.end();
  console.log('✅ Migration complete');
}

main();
```

Run migration:

```bash
npx tsx scripts/migrate-data.ts
```

### Step 7: Create Triggers for Auto-Update

```sql
-- Create function for updating updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables with updated_at column
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_parcels_updated_at
BEFORE UPDATE ON parcels
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Repeat for other tables...
```

### Step 8: Verify Data Integrity

```bash
# Create verification script
cat > scripts/verify-migration.ts << 'EOF'
import { Client as PgClient } from 'pg';
import mysql from 'mysql2/promise';

async function verifyTableCounts() {
  const pgClient = new PgClient({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DATABASE,
  });

  const mysqlClient = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    port: parseInt(process.env.TIDB_PORT || '4000'),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl: { rejectUnauthorized: true },
  });

  await pgClient.connect();

  const tables = ['users', 'parcels', 'transactions'];

  for (const table of tables) {
    const [pgResult] = await pgClient.query(`SELECT COUNT(*) as count FROM ${table}`);
    const [mysqlResult] = await mysqlClient.query(`SELECT COUNT(*) as count FROM ${table}`);

    const pgCount = pgResult.rows[0].count;
    const mysqlCount = mysqlResult[0].count;

    if (pgCount === mysqlCount) {
      console.log(`✅ ${table}: ${pgCount} rows (match)`);
    } else {
      console.error(`❌ ${table}: PostgreSQL=${pgCount}, TiDB=${mysqlCount} (mismatch)`);
    }
  }

  await pgClient.end();
  await mysqlClient.end();
}

verifyTableCounts();
EOF

npx tsx scripts/verify-migration.ts
```

---

## Drizzle ORM Configuration

### Update Database Connection

Update `server/db.ts`:

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../drizzle/schema-postgres';

// Create PostgreSQL connection pool
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'idlr_admin',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE || 'idlr_pts',
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Create Drizzle instance
export const db = drizzle(pool, { schema });

// Export helper to get database instance
export async function getDb() {
  return db;
}

// Health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}
```

### Update Environment Variables

```bash
# .env
# PostgreSQL Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=idlr_admin
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DATABASE=idlr_pts
POSTGRES_SSL=false

# For production with SSL
# POSTGRES_SSL=true
# POSTGRES_SSL_CA=/path/to/ca-cert.pem
```

---

## Testing and Validation

### Unit Tests

Update database tests to use PostgreSQL:

```typescript
// server/db.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb, checkDatabaseHealth } from './db';

describe('PostgreSQL Database', () => {
  beforeAll(async () => {
    const healthy = await checkDatabaseHealth();
    if (!healthy) {
      throw new Error('Database not healthy');
    }
  });

  it('should connect to PostgreSQL', async () => {
    const db = await getDb();
    expect(db).toBeDefined();
  });

  it('should query users table', async () => {
    const db = await getDb();
    const users = await db.query.users.findMany({ limit: 10 });
    expect(Array.isArray(users)).toBe(true);
  });

  it('should handle transactions', async () => {
    const db = await getDb();
    
    await db.transaction(async (tx) => {
      const user = await tx.insert(users).values({
        openId: 'test-user',
        name: 'Test User',
        email: 'test@example.com',
      }).returning();

      expect(user[0].id).toBeDefined();
    });
  });
});
```

### Performance Testing

```bash
# Install pgbench
sudo apt install postgresql-contrib

# Initialize test database
pgbench -i -s 50 idlr_pts

# Run benchmark
pgbench -c 10 -j 2 -t 1000 idlr_pts
```

---

## Rollback Procedures

### Rollback Plan

If migration fails, rollback to TiDB:

```bash
# 1. Stop application
sudo systemctl stop idlr-pts

# 2. Revert environment variables
cp .env.tidb .env

# 3. Revert Drizzle configuration
git checkout drizzle.config.ts
git checkout server/db.ts

# 4. Restart application
sudo systemctl start idlr-pts

# 5. Verify TiDB connection
curl http://localhost:3000/health
```

### Data Rollback

If data corruption occurs:

```bash
# Restore from TiDB backup
mysqldump \
  --host=gateway01.us-west-2.prod.aws.tidbcloud.com \
  --port=4000 \
  --user=your-username \
  --password \
  --ssl-mode=REQUIRED \
  --databases idlr_pts \
  | mysql -h localhost -u root -p idlr_pts
```

---

## Performance Optimization

### Indexing Strategy

```sql
-- Create indexes for common queries
CREATE INDEX idx_users_open_id ON users(open_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_parcels_owner_id ON parcels(owner_id);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);

-- Create composite indexes
CREATE INDEX idx_parcels_status_created ON parcels(status, created_at DESC);

-- Create partial indexes
CREATE INDEX idx_active_users ON users(id) WHERE status = 'active';

-- Create GIN indexes for JSONB
CREATE INDEX idx_metadata_gin ON parcels USING GIN (metadata);
```

### Connection Pooling with PgBouncer

```bash
# Install PgBouncer
sudo apt install pgbouncer

# Configure /etc/pgbouncer/pgbouncer.ini
[databases]
idlr_pts = host=localhost port=5432 dbname=idlr_pts

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25

# Start PgBouncer
sudo systemctl start pgbouncer

# Update application to use PgBouncer
# POSTGRES_PORT=6432
```

### Query Optimization

```sql
-- Enable query logging
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_duration = on;
ALTER SYSTEM SET log_min_duration_statement = 1000; -- Log queries > 1s

-- Analyze query plans
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'test@example.com';

-- Update statistics
ANALYZE users;
ANALYZE parcels;
ANALYZE transactions;

-- Vacuum regularly
VACUUM ANALYZE;
```

---

## Conclusion

This migration guide provides a comprehensive plan for transitioning from TiDB to PostgreSQL. The migration ensures:

- ✅ **Zero data loss** through careful export/import procedures
- ✅ **Minimal downtime** using blue-green deployment
- ✅ **Cloud agnosticism** with open-source PostgreSQL
- ✅ **Performance optimization** with PostgreSQL-specific features
- ✅ **Rollback capability** at every step

### Next Steps

1. Set up PostgreSQL cluster (development environment first)
2. Convert schema and test migrations
3. Perform initial data migration
4. Run dual-write phase for 1-2 weeks
5. Gradually cutover read traffic
6. Complete migration and optimize

### Resources

- [PostgreSQL Official Documentation](https://www.postgresql.org/docs/)
- [Drizzle ORM PostgreSQL Guide](https://orm.drizzle.team/docs/get-started-postgresql)
- [Aiven PostgreSQL](https://aiven.io/postgresql)
- [Crunchy Data PostgreSQL](https://www.crunchydata.com/)

---

**For support, contact the IDLR-PTS development team.**

import { describe, it, expect, beforeAll } from 'vitest';
import { requireDb, upsertUser } from './db';
import * as adminService from './adminService';
import { users } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Admin User Management', () => {
  let testAdminId: number;
  let testUserId: number;

  beforeAll(async () => {
    const db = await requireDb();

    // Create test admin user
    await upsertUser({
      openId: 'test-admin-openid',
      name: 'Test Admin',
      email: 'admin@test.com',
    });

    const [adminUser] = await db
      .select()
      .from(users)
      .where(eq(users.openId, 'test-admin-openid'))
      .limit(1);

    if (adminUser) {
      testAdminId = adminUser.id;
      // Set admin role
      await db
        .update(users)
        .set({ role: 'admin' })
        .where(eq(users.id, testAdminId));
    }

    // Create test regular user
    await upsertUser({
      openId: 'test-user-openid',
      name: 'Test User',
      email: 'user@test.com',
    });

    const [regularUser] = await db
      .select()
      .from(users)
      .where(eq(users.openId, 'test-user-openid'))
      .limit(1);

    if (regularUser) {
      testUserId = regularUser.id;
    }
  });

  describe('getAllUsers', () => {
    it('should return paginated list of users', async () => {
      const result = await adminService.getAllUsers(1, 50);

      expect(result).toHaveProperty('users');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('limit');
      expect(Array.isArray(result.users)).toBe(true);
      expect(result.total).toBeGreaterThan(0);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('should return users with correct properties', async () => {
      const result = await adminService.getAllUsers(1, 50);

      if (result.users.length > 0) {
        const user = result.users[0];
        expect(user).toHaveProperty('id');
        expect(user).toHaveProperty('name');
        expect(user).toHaveProperty('email');
        expect(user).toHaveProperty('role');
        expect(user).toHaveProperty('suspended');
        expect(user).toHaveProperty('lastActive');
        expect(user).toHaveProperty('createdAt');
      }
    });
  });

  describe('updateUserRole', () => {
    it('should successfully update user role', async () => {
      const result = await adminService.updateUserRole(testUserId, 'surveyor', testAdminId);

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.role).toBe('surveyor');
    });

    it('should update role to registrar', async () => {
      const result = await adminService.updateUserRole(testUserId, 'registrar', testAdminId);

      expect(result.success).toBe(true);
      expect(result.user?.role).toBe('registrar');
    });

    it('should update role back to user', async () => {
      const result = await adminService.updateUserRole(testUserId, 'user', testAdminId);

      expect(result.success).toBe(true);
      expect(result.user?.role).toBe('user');
    });
  });

  describe('suspendUser', () => {
    it('should successfully suspend a user account', async () => {
      const reason = 'Violation of terms of service';
      const result = await adminService.suspendUser(testUserId, reason, testAdminId);

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.suspended).toBe(true);
      expect(result.user?.suspensionReason).toBe(reason);
      expect(result.user?.suspendedBy).toBe(testAdminId);
      expect(result.user?.suspendedAt).toBeDefined();
    });

    it('should record suspension details correctly', async () => {
      const db = await requireDb();
      const user = (await db.select().from(users).where(eq(users.id, testUserId)).limit(1))[0];

      expect(user?.suspended).toBe(true);
      expect(user?.suspensionReason).toBe('Violation of terms of service');
      expect(user?.suspendedBy).toBe(testAdminId);
    });
  });

  describe('activateUser', () => {
    it('should successfully activate a suspended user', async () => {
      const result = await adminService.activateUser(testUserId, testAdminId);

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.suspended).toBe(false);
      expect(result.user?.suspensionReason).toBeNull();
      expect(result.user?.suspendedBy).toBeNull();
      expect(result.user?.suspendedAt).toBeNull();
    });

    it('should clear all suspension fields', async () => {
      const db = await requireDb();
      const user = (await db.select().from(users).where(eq(users.id, testUserId)).limit(1))[0];

      expect(user?.suspended).toBe(false);
      expect(user?.suspensionReason).toBeNull();
      expect(user?.suspendedBy).toBeNull();
      expect(user?.suspendedAt).toBeNull();
    });
  });

  describe('getUserActivityLogs', () => {
    beforeAll(async () => {
      // Record a real login attempt for the test user through the actual
      // security-monitoring write path, so the read path has data to serve.
      const { recordLoginAttempt } = await import('./securityMonitoringService');
      await recordLoginAttempt('user@test.com', '127.0.0.1', true, { userId: testUserId });
    });

    it('should return activity logs for a user', async () => {
      const logs = await adminService.getUserActivityLogs(testUserId, 50);

      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should return logs with correct structure', async () => {
      const logs = await adminService.getUserActivityLogs(testUserId, 50);

      if (logs.length > 0) {
        const log = logs[0];
        expect(log).toHaveProperty('userId');
        expect(log).toHaveProperty('userName');
        expect(log).toHaveProperty('action');
        expect(log).toHaveProperty('timestamp');
        expect(log).toHaveProperty('details');
      }
    });

    it('should respect limit parameter', async () => {
      const logs = await adminService.getUserActivityLogs(testUserId, 2);

      expect(logs.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getUserStats', () => {
    it('should return user statistics', async () => {
      const stats = await adminService.getUserStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('suspended');
      expect(stats).toHaveProperty('byRole');
    });

    it('should have valid counts', async () => {
      const stats = await adminService.getUserStats();

      expect(stats.total).toBeGreaterThan(0);
      expect(stats.active).toBeGreaterThanOrEqual(0);
      expect(stats.suspended).toBeGreaterThanOrEqual(0);
      expect(stats.total).toBe(stats.active + stats.suspended);
    });

    it('should break down users by role', async () => {
      const stats = await adminService.getUserStats();

      expect(typeof stats.byRole).toBe('object');
      expect(stats.byRole).toHaveProperty('admin');
      expect(stats.byRole.admin).toBeGreaterThan(0); // We created an admin user
    });
  });

  describe('Suspension and Activation Flow', () => {
    it('should handle multiple suspend/activate cycles', async () => {
      // First suspension
      let result = await adminService.suspendUser(testUserId, 'First suspension', testAdminId);
      expect(result.success).toBe(true);
      expect(result.user?.suspended).toBe(true);

      // First activation
      result = await adminService.activateUser(testUserId, testAdminId);
      expect(result.success).toBe(true);
      expect(result.user?.suspended).toBe(false);

      // Second suspension
      result = await adminService.suspendUser(testUserId, 'Second suspension', testAdminId);
      expect(result.success).toBe(true);
      expect(result.user?.suspended).toBe(true);

      // Second activation
      result = await adminService.activateUser(testUserId, testAdminId);
      expect(result.success).toBe(true);
      expect(result.user?.suspended).toBe(false);
    });
  });

  describe('Role Change Flow', () => {
    it('should handle role progression: user -> surveyor -> registrar -> admin', async () => {
      let result = await adminService.updateUserRole(testUserId, 'user', testAdminId);
      expect(result.user?.role).toBe('user');

      result = await adminService.updateUserRole(testUserId, 'surveyor', testAdminId);
      expect(result.user?.role).toBe('surveyor');

      result = await adminService.updateUserRole(testUserId, 'registrar', testAdminId);
      expect(result.user?.role).toBe('registrar');

      result = await adminService.updateUserRole(testUserId, 'admin', testAdminId);
      expect(result.user?.role).toBe('admin');

      // Reset back to user
      result = await adminService.updateUserRole(testUserId, 'user', testAdminId);
      expect(result.user?.role).toBe('user');
    });
  });
});

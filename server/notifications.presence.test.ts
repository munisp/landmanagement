import { describe, expect, it } from 'vitest';
import { NotificationService } from './notifications';

describe('NotificationService presence tracking', () => {
  const createService = () => {
    const service = new NotificationService() as any;
    const sentMessages: Array<{ userId: number; data: any }> = [];

    service.sendToUser = (userId: number, data: any) => {
      sentMessages.push({ userId, data });
    };

    return { service, sentMessages };
  };

  it('tracks users joining the same page and broadcasts presence to all viewers', () => {
    const { service, sentMessages } = createService();

    service.handleUserJoinedPage(11, 'Surveyor Ada', 'parcel:101');
    service.handleUserJoinedPage(15, 'Registrar Tunde', 'parcel:101');

    const presence = service.getPagePresence('parcel:101');

    expect(presence).toHaveLength(2);
    expect(presence.map((entry: any) => entry.userId)).toEqual([11, 15]);

    const latestBroadcasts = sentMessages.slice(-2);
    expect(latestBroadcasts).toHaveLength(2);
    latestBroadcasts.forEach(({ data }) => {
      expect(data.type).toBe('presence_update');
      expect(data.pageId).toBe('parcel:101');
      expect(data.users).toHaveLength(2);
    });
  });

  it('removes users from page presence when they leave and cleans up empty pages', () => {
    const { service } = createService();

    service.handleUserJoinedPage(21, 'Planner Mary', 'dashboard:compliance');
    service.handleUserJoinedPage(22, 'Analyst Kunle', 'dashboard:compliance');
    expect(service.getPagePresence('dashboard:compliance')).toHaveLength(2);

    service.handleUserLeftPage(21, 'dashboard:compliance');
    const remaining = service.getPagePresence('dashboard:compliance');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].userId).toBe(22);

    service.handleUserLeftPage(22, 'dashboard:compliance');
    expect(service.getPagePresence('dashboard:compliance')).toEqual([]);
  });

  it('returns an empty list for pages without active viewers', () => {
    const { service } = createService();
    expect(service.getPagePresence('missing:page')).toEqual([]);
  });
});

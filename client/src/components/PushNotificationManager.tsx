import { useState, useEffect } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface NotificationPreferences {
  transactionUpdates: boolean;
  phase4StatusChanges: boolean;
  documentApprovals: boolean;
  paymentNotifications: boolean;
  systemAlerts: boolean;
}

export function PushNotificationManager() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    transactionUpdates: true,
    phase4StatusChanges: true,
    documentApprovals: true,
    paymentNotifications: true,
    systemAlerts: true,
  });

  useEffect(() => {
    // Check if push notifications are supported
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      checkSubscriptionStatus();
      loadPreferences();
    }
  }, []);

  const checkSubscriptionStatus = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error('Error checking subscription status:', error);
    }
  };

  const loadPreferences = () => {
    const saved = localStorage.getItem('notificationPreferences');
    if (saved) {
      setPreferences(JSON.parse(saved));
    }
  };

  const savePreferences = (newPreferences: NotificationPreferences) => {
    localStorage.setItem('notificationPreferences', JSON.stringify(newPreferences));
    setPreferences(newPreferences);
    toast.success('Notification preferences updated');
  };

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribeToPushNotifications = async () => {
    setIsLoading(true);
    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Notification permission denied');
        setIsLoading(false);
        return;
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push notifications
      // Note: In production, you would use your actual VAPID public key
      const vapidPublicKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib37J8xYjEB6pSRXQhGEGE4TJQqkDCXfKe9KPzKjyN0VjKGdJU3yiGv1oLg';
      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      });

      // Send subscription to server
      // In a real implementation, you would send this to your backend
      console.log('Push subscription:', JSON.stringify(subscription));
      
      setIsSubscribed(true);
      toast.success('Push notifications enabled');
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
      toast.error('Failed to enable push notifications');
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribeFromPushNotifications = async () => {
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
        setIsSubscribed(false);
        toast.success('Push notifications disabled');
      }
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error);
      toast.error('Failed to disable push notifications');
    } finally {
      setIsLoading(false);
    }
  };

  const testNotification = async () => {
    if (!isSubscribed) {
      toast.error('Please enable push notifications first');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification('IDLR Platform Test', {
        body: 'This is a test notification',
        icon: '/icon-192x192.png',
        badge: '/icon-96x96.png',
        tag: 'test-notification',
      });
      toast.success('Test notification sent');
    } catch (error) {
      console.error('Error sending test notification:', error);
      toast.error('Failed to send test notification');
    }
  };

  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Push Notifications</CardTitle>
          <CardDescription>Push notifications are not supported in this browser</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Push Notifications</CardTitle>
            <CardDescription>
              Get real-time updates about your transactions and system changes
            </CardDescription>
          </div>
          {isSubscribed ? (
            <Bell className="h-6 w-6 text-primary" />
          ) : (
            <BellOff className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Enable Push Notifications</p>
            <p className="text-sm text-muted-foreground">
              {isSubscribed ? 'You will receive push notifications' : 'Enable to receive real-time updates'}
            </p>
          </div>
          <Button
            onClick={isSubscribed ? unsubscribeFromPushNotifications : subscribeToPushNotifications}
            disabled={isLoading}
            variant={isSubscribed ? 'outline' : 'default'}
          >
            {isLoading ? 'Loading...' : isSubscribed ? 'Disable' : 'Enable'}
          </Button>
        </div>

        {isSubscribed && (
          <>
            <div className="border-t pt-6">
              <h3 className="font-medium mb-4">Notification Preferences</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="transaction-updates" className="flex flex-col gap-1">
                    <span>Transaction Updates</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      Notifications about transaction status changes
                    </span>
                  </Label>
                  <Switch
                    id="transaction-updates"
                    checked={preferences.transactionUpdates}
                    onCheckedChange={(checked) =>
                      savePreferences({ ...preferences, transactionUpdates: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="phase4-status" className="flex flex-col gap-1">
                    <span>Phase 4 System Status</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      Mortgage, tax, insurance, and other system updates
                    </span>
                  </Label>
                  <Switch
                    id="phase4-status"
                    checked={preferences.phase4StatusChanges}
                    onCheckedChange={(checked) =>
                      savePreferences({ ...preferences, phase4StatusChanges: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="document-approvals" className="flex flex-col gap-1">
                    <span>Document Approvals</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      Notifications when documents are approved or rejected
                    </span>
                  </Label>
                  <Switch
                    id="document-approvals"
                    checked={preferences.documentApprovals}
                    onCheckedChange={(checked) =>
                      savePreferences({ ...preferences, documentApprovals: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="payment-notifications" className="flex flex-col gap-1">
                    <span>Payment Notifications</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      Payment confirmations and receipts
                    </span>
                  </Label>
                  <Switch
                    id="payment-notifications"
                    checked={preferences.paymentNotifications}
                    onCheckedChange={(checked) =>
                      savePreferences({ ...preferences, paymentNotifications: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="system-alerts" className="flex flex-col gap-1">
                    <span>System Alerts</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      Important system announcements and maintenance notices
                    </span>
                  </Label>
                  <Switch
                    id="system-alerts"
                    checked={preferences.systemAlerts}
                    onCheckedChange={(checked) =>
                      savePreferences({ ...preferences, systemAlerts: checked })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-6">
              <Button onClick={testNotification} variant="outline" className="w-full">
                Send Test Notification
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

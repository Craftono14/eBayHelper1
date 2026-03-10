import { useEffect, useState } from 'react';

type Tab = 'discord' | 'pushover' | 'preferences' | 'account';
type NotificationPreference = 'DISCORD' | 'PUSHOVER';

interface DiscordSettings {
  discordId: string;
  username: string;
}

interface PushoverSettings {
  pushoverUserKey: string;
  pushoverDevice: string;
}

export function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>('discord');
  const [discordSettings, setDiscordSettings] = useState<DiscordSettings>({
    discordId: '',
    username: '',
  });
  const [pushoverSettings, setPushoverSettings] = useState<PushoverSettings>({
    pushoverUserKey: '',
    pushoverDevice: '',
  });
  const [notificationPreference, setNotificationPreference] = useState<NotificationPreference>('DISCORD');
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchDiscordSettings();
    fetchPushoverSettings();
    fetchNotificationPreference();
  }, []);

  const authHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : null;
  };

  const fetchDiscordSettings = async () => {
    try {
      const headers = authHeaders();
      if (!headers) return;

      const response = await fetch('/api/users/discord-settings', { headers });
      if (response.ok) {
        const data = await response.json();
        setDiscordSettings({
          discordId: data.discordId || '',
          username: data.username || '',
        });
      }
    } catch (error) {
      console.error('Error fetching Discord settings:', error);
    }
  };

  const fetchPushoverSettings = async () => {
    try {
      const headers = authHeaders();
      if (!headers) return;

      const response = await fetch('/api/users/pushover-settings', { headers });
      if (response.ok) {
        const data = await response.json();
        setPushoverSettings({
          pushoverUserKey: data.pushoverUserKey || '',
          pushoverDevice: data.pushoverDevice || '',
        });
      }
    } catch (error) {
      console.error('Error fetching Pushover settings:', error);
    }
  };

  const fetchNotificationPreference = async () => {
    try {
      const headers = authHeaders();
      if (!headers) return;

      const response = await fetch('/api/users/notification-preferences', { headers });
      if (response.ok) {
        const data = await response.json();
        setNotificationPreference(data.notificationPreference === 'PUSHOVER' ? 'PUSHOVER' : 'DISCORD');
      }
    } catch (error) {
      console.error('Error fetching notification preference:', error);
    }
  };

  const handleSaveDiscordSettings = async () => {
    setLoading(true);
    setSaveSuccess(false);
    try {
      const headers = authHeaders();
      if (!headers) return;

      const response = await fetch('/api/users/discord-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(discordSettings),
      });

      if (response.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data?.error || 'Failed to save Discord settings');
      }
    } catch (error) {
      console.error('Error saving Discord settings:', error);
      alert('Failed to save Discord settings');
    } finally {
      setLoading(false);
    }
  };

  const handleClearDiscordSettings = async () => {
    if (!window.confirm('Are you sure you want to clear all Discord settings?')) {
      return;
    }

    setLoading(true);
    try {
      const headers = authHeaders();
      if (!headers) return;

      const response = await fetch('/api/users/discord-settings', {
        method: 'DELETE',
        headers,
      });

      if (response.ok) {
        setDiscordSettings({ discordId: '', username: '' });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      } else {
        alert('Failed to clear Discord settings');
      }
    } catch (error) {
      console.error('Error clearing Discord settings:', error);
      alert('Failed to clear Discord settings');
    } finally {
      setLoading(false);
    }
  };

  const handleTestDiscordDM = async () => {
    setLoading(true);
    try {
      const headers = authHeaders();
      if (!headers) return;

      const response = await fetch('/api/users/discord-settings/test', {
        method: 'POST',
        headers,
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        alert('Test Discord DM sent. Check your Discord inbox.');
      } else {
        alert(data?.error || 'Failed to send test Discord DM.');
      }
    } catch (error) {
      console.error('Error testing Discord DM:', error);
      alert('Failed to send test Discord DM.');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePushoverSettings = async () => {
    setLoading(true);
    setSaveSuccess(false);
    try {
      const headers = authHeaders();
      if (!headers) return;

      const response = await fetch('/api/users/pushover-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(pushoverSettings),
      });

      if (response.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data?.error || 'Failed to save Pushover settings');
      }
    } catch (error) {
      console.error('Error saving Pushover settings:', error);
      alert('Failed to save Pushover settings');
    } finally {
      setLoading(false);
    }
  };

  const handleClearPushoverSettings = async () => {
    if (!window.confirm('Are you sure you want to clear all Pushover settings?')) {
      return;
    }

    setLoading(true);
    try {
      const headers = authHeaders();
      if (!headers) return;

      const response = await fetch('/api/users/pushover-settings', {
        method: 'DELETE',
        headers,
      });

      if (response.ok) {
        setPushoverSettings({ pushoverUserKey: '', pushoverDevice: '' });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      } else {
        alert('Failed to clear Pushover settings');
      }
    } catch (error) {
      console.error('Error clearing Pushover settings:', error);
      alert('Failed to clear Pushover settings');
    } finally {
      setLoading(false);
    }
  };

  const handleTestPushover = async () => {
    setLoading(true);
    try {
      const headers = authHeaders();
      if (!headers) return;

      const response = await fetch('/api/users/pushover-settings/test', {
        method: 'POST',
        headers,
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        alert('Test Pushover notification sent. Check your Pushover app.');
      } else {
        alert(data?.error || 'Failed to send test Pushover notification.');
      }
    } catch (error) {
      console.error('Error testing Pushover notification:', error);
      alert('Failed to send test Pushover notification.');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePreference = async () => {
    setLoading(true);
    setSaveSuccess(false);
    try {
      const headers = authHeaders();
      if (!headers) return;

      const response = await fetch('/api/users/notification-preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ notificationPreference }),
      });

      if (response.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      } else {
        const data = await response.json().catch(() => ({}));
        alert(data?.error || 'Failed to save notification preference');
      }
    } catch (error) {
      console.error('Error saving notification preference:', error);
      alert('Failed to save notification preference');
    } finally {
      setLoading(false);
    }
  };

  const tabClass = (tab: Tab) =>
    `py-2 px-4 border-b-2 font-medium text-sm ${
      activeTab === tab
        ? 'border-blue-500 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`;

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">User Settings</h1>

      <div className="border-b border-gray-200 mb-6">
        <nav className="flex -mb-px flex-wrap gap-1">
          <button onClick={() => setActiveTab('discord')} className={tabClass('discord')}>
            Discord Settings
          </button>
          <button onClick={() => setActiveTab('pushover')} className={tabClass('pushover')}>
            Pushover Settings
          </button>
          <button onClick={() => setActiveTab('preferences')} className={tabClass('preferences')}>
            Notification Preferences
          </button>
          <button onClick={() => setActiveTab('account')} className={tabClass('account')}>
            Account Settings
          </button>
        </nav>
      </div>

      {activeTab === 'preferences' && (
        <div className="max-w-2xl space-y-5">
          <h2 className="text-2xl font-bold">Notification Preferences</h2>
          <p className="text-gray-600">
            Choose exactly one notification method. Price-drop alerts will be sent only through your selected method.
          </p>

          <div className="space-y-3 rounded-md border border-gray-200 p-4 bg-white">
            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="notificationPreference"
                value="DISCORD"
                checked={notificationPreference === 'DISCORD'}
                onChange={() => setNotificationPreference('DISCORD')}
                className="h-4 w-4"
              />
              <span>Discord</span>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="radio"
                name="notificationPreference"
                value="PUSHOVER"
                checked={notificationPreference === 'PUSHOVER'}
                onChange={() => setNotificationPreference('PUSHOVER')}
                className="h-4 w-4"
              />
              <span>Pushover</span>
            </label>
          </div>

          <button
            onClick={handleSavePreference}
            disabled={loading}
            className={`px-6 py-2 rounded-md font-medium text-white ${
              loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? 'Saving...' : 'Save Preference'}
          </button>
        </div>
      )}

      {activeTab === 'discord' && (
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold mb-4">Discord Direct Message Settings</h2>
          <p className="text-gray-600 mb-6">
            Configure Discord delivery. If Notification Preference is set to Discord, alerts are delivered by DM.
          </p>

          <div className="mb-6">
            <a
              href="https://discord.gg/hQSjewfW4X"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition"
            >
              Join Discord Server
            </a>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Discord User ID *</label>
              <input
                type="text"
                value={discordSettings.discordId}
                onChange={(e) => setDiscordSettings({ ...discordSettings, discordId: e.target.value })}
                placeholder="123456789012345678"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Discord Username (Optional)</label>
              <input
                type="text"
                value={discordSettings.username}
                onChange={(e) => setDiscordSettings({ ...discordSettings, username: e.target.value })}
                placeholder="YourUsername"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                onClick={handleSaveDiscordSettings}
                disabled={loading || !discordSettings.discordId}
                className={`px-6 py-2 rounded-md font-medium text-white ${
                  loading || !discordSettings.discordId
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {loading ? 'Saving...' : 'Save Settings'}
              </button>

              <button
                onClick={handleClearDiscordSettings}
                disabled={loading || !discordSettings.discordId}
                className={`px-6 py-2 rounded-md font-medium ${
                  loading || !discordSettings.discordId
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                Clear Settings
              </button>

              <button
                onClick={handleTestDiscordDM}
                disabled={loading || !discordSettings.discordId}
                className={`px-6 py-2 rounded-md font-medium text-white ${
                  loading || !discordSettings.discordId
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                Send Test DM
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pushover' && (
        <div className="max-w-2xl space-y-4">
          <h2 className="text-2xl font-bold">Pushover Settings</h2>
          <p className="text-gray-600">
            Configure Pushover delivery. If Notification Preference is set to Pushover, alerts are delivered through the Pushover app.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Pushover User Key *</label>
            <input
              type="text"
              value={pushoverSettings.pushoverUserKey}
              onChange={(e) => setPushoverSettings({ ...pushoverSettings, pushoverUserKey: e.target.value })}
              placeholder="uQiRzpo4DXghDmr9QzzfQu27cmVRsG"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Pushover Device (Optional)</label>
            <input
              type="text"
              value={pushoverSettings.pushoverDevice}
              onChange={(e) => setPushoverSettings({ ...pushoverSettings, pushoverDevice: e.target.value })}
              placeholder="iphone"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex space-x-3 pt-2">
            <button
              onClick={handleSavePushoverSettings}
              disabled={loading || !pushoverSettings.pushoverUserKey}
              className={`px-6 py-2 rounded-md font-medium text-white ${
                loading || !pushoverSettings.pushoverUserKey
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {loading ? 'Saving...' : 'Save Settings'}
            </button>

            <button
              onClick={handleClearPushoverSettings}
              disabled={loading || !pushoverSettings.pushoverUserKey}
              className={`px-6 py-2 rounded-md font-medium ${
                loading || !pushoverSettings.pushoverUserKey
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              Clear Settings
            </button>

            <button
              onClick={handleTestPushover}
              disabled={loading || !pushoverSettings.pushoverUserKey}
              className={`px-6 py-2 rounded-md font-medium text-white ${
                loading || !pushoverSettings.pushoverUserKey
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              Send Test Push
            </button>
          </div>
        </div>
      )}

      {activeTab === 'account' && (
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold mb-4">Account Settings</h2>
          <p className="text-gray-600 mb-6">Account management features coming soon.</p>
        </div>
      )}

      {saveSuccess && (
        <div className="mt-6 p-3 bg-green-100 border border-green-400 text-green-700 rounded-md max-w-2xl">
          Settings saved successfully!
        </div>
      )}
    </div>
  );
}

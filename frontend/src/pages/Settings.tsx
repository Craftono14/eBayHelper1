import { useState, useEffect } from 'react';

interface DiscordSettings {
  discordWebhookUrl: string;
  discordId: string;
  username: string;
}

export function Settings() {
  const [activeTab, setActiveTab] = useState<'discord' | 'account'>('discord');
  const [discordSettings, setDiscordSettings] = useState<DiscordSettings>({
    discordWebhookUrl: '',
    discordId: '',
    username: ''
  });
  const [loading, setLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchDiscordSettings();
  }, []);

  const fetchDiscordSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('http://localhost:3001/api/users/discord-settings', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setDiscordSettings({
          discordWebhookUrl: data.discordWebhookUrl || '',
          discordId: data.discordId || '',
          username: data.username || ''
        });
      }
    } catch (error) {
      console.error('Error fetching Discord settings:', error);
    }
  };

  const handleSaveDiscordSettings = async () => {
    setLoading(true);
    setSaveSuccess(false);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('http://localhost:3001/api/users/discord-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(discordSettings)
      });

      if (response.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert('Failed to save Discord settings');
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
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('http://localhost:3001/api/users/discord-settings', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        setDiscordSettings({
          discordWebhookUrl: '',
          discordId: '',
          username: ''
        });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
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

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">User Settings</h1>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex -mb-px">
          <button
            onClick={() => setActiveTab('discord')}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === 'discord'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Discord Settings
          </button>
          <button
            onClick={() => setActiveTab('account')}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === 'account'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Account Settings
          </button>
        </nav>
      </div>

      {/* Discord Settings Tab */}
      {activeTab === 'discord' && (
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold mb-4">Discord Notification Settings</h2>
          <p className="text-gray-600 mb-6">
            Configure Discord notifications to receive price alerts when items in your watchlist drop below your target price.
          </p>

          <div className="space-y-4">
            {/* Discord Webhook URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Discord Webhook URL
              </label>
              <input
                type="text"
                value={discordSettings.discordWebhookUrl}
                onChange={(e) =>
                  setDiscordSettings({ ...discordSettings, discordWebhookUrl: e.target.value })
                }
                placeholder="https://discord.com/api/webhooks/..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-sm text-gray-500 mt-1">
                Create a webhook in your Discord server settings → Integrations → Webhooks
              </p>
            </div>

            {/* Discord User ID */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Discord User ID (Optional)
              </label>
              <input
                type="text"
                value={discordSettings.discordId}
                onChange={(e) =>
                  setDiscordSettings({ ...discordSettings, discordId: e.target.value })
                }
                placeholder="123456789012345678"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-sm text-gray-500 mt-1">
                Your Discord user ID for mentions (enable Developer Mode in Discord to copy ID)
              </p>
            </div>

            {/* Discord Username */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Discord Username (Optional)
              </label>
              <input
                type="text"
                value={discordSettings.username}
                onChange={(e) =>
                  setDiscordSettings({ ...discordSettings, username: e.target.value })
                }
                placeholder="YourUsername"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-sm text-gray-500 mt-1">
                Your Discord username for display purposes
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3 pt-4">
              <button
                onClick={handleSaveDiscordSettings}
                disabled={loading || !discordSettings.discordWebhookUrl}
                className={`px-6 py-2 rounded-md font-medium text-white ${
                  loading || !discordSettings.discordWebhookUrl
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {loading ? 'Saving...' : 'Save Settings'}
              </button>

              <button
                onClick={handleClearDiscordSettings}
                disabled={loading || !discordSettings.discordWebhookUrl}
                className={`px-6 py-2 rounded-md font-medium ${
                  loading || !discordSettings.discordWebhookUrl
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                Clear Settings
              </button>
            </div>

            {/* Success Message */}
            {saveSuccess && (
              <div className="p-3 bg-green-100 border border-green-400 text-green-700 rounded-md">
                Settings saved successfully!
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h3 className="font-semibold text-blue-900 mb-2">How Discord Notifications Work</h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Price alerts are sent when an item's current price drops below your target price</li>
              <li>Notifications are sent during watchlist sync operations</li>
              <li>Webhook URL is required for notifications to work</li>
              <li>User ID and username are optional but enhance notification display</li>
            </ul>
          </div>
        </div>
      )}

      {/* Account Settings Tab */}
      {activeTab === 'account' && (
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold mb-4">Account Settings</h2>
          <p className="text-gray-600 mb-6">
            Account management features coming soon.
          </p>
        </div>
      )}
    </div>
  );
}

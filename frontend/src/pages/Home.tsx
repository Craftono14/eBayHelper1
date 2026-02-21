import React from 'react';
import { useAuth } from '../context/AuthContext';

export const Home: React.FC = () => {
  const { isLoggedIn } = useAuth();

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-800 text-white rounded-lg p-12 text-center">
        <h1 className="text-5xl font-bold mb-4">Welcome to eBayHelper</h1>
        <p className="text-xl mb-6">
          Monitor eBay prices, track wishlist items, and get instant notifications when prices drop.
        </p>
        {!isLoggedIn && (
          <a
            href="/login"
            className="inline-block bg-white text-blue-600 px-8 py-3 rounded-lg font-bold text-lg hover:bg-gray-100 transition"
          >
            Get Started
          </a>
        )}
      </section>

      {/* Features Overview */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition">
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-xl font-bold mb-2">Price Monitoring</h3>
          <p className="text-gray-600">
            Track prices for your favorite eBay items and get notified when prices drop.
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition">
          <div className="text-4xl mb-4">❤️</div>
          <h3 className="text-xl font-bold mb-2">Wishlist Management</h3>
          <p className="text-gray-600">
            Save and organize items you love, and track price changes in real-time.
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md hover:shadow-lg transition">
          <div className="text-4xl mb-4">🔔</div>
          <h3 className="text-xl font-bold mb-2">Smart Notifications</h3>
          <p className="text-gray-600">
            Receive alerts via email, Discord, or push notifications when deals appear.
          </p>
        </div>
      </section>

      {/* Step-by-Step Guide */}
      <section className="bg-white p-8 rounded-lg shadow-md">
        <h2 className="text-3xl font-bold mb-8 text-center">How to Use eBayHelper</h2>

        <div className="space-y-8">
          {/* Step 1 */}
          <div className="flex gap-6">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-12 w-12 rounded-full bg-blue-600 text-white font-bold text-lg">
                1
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold mb-2">Create Your Account</h3>
              <p className="text-gray-600 mb-2">
                Sign up with your email address and create a secure password. This is where we'll store your saved items
                and preferences.
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                <li>Click "Login / Register" in the top-right corner</li>
                <li>Fill in your email and a strong password</li>
                <li>Click "Register" to create your account</li>
              </ul>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-6">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-12 w-12 rounded-full bg-blue-600 text-white font-bold text-lg">
                2
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold mb-2">Link Your eBay Account</h3>
              <p className="text-gray-600 mb-2">
                Connect your eBay account to enable automatic price tracking and item discovery.
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                <li>After logging in, click "Link eBay Account"</li>
                <li>You will be redirected to eBay's authorization page</li>
                <li>Grant eBayHelper access to your account</li>
                <li>You'll be redirected back to complete the setup</li>
              </ul>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-6">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-12 w-12 rounded-full bg-blue-600 text-white font-bold text-lg">
                3
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold mb-2">Add Items to Your Wishlist</h3>
              <p className="text-gray-600 mb-2">
                Save items you're interested in and set target prices for automatic alerts.
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                <li>Navigate to the "Wishlist" page</li>
                <li>Add items by eBay URL or item ID</li>
                <li>Set your desired target price</li>
                <li>Choose your notification preferences (email, Discord, etc.)</li>
              </ul>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-6">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-12 w-12 rounded-full bg-blue-600 text-white font-bold text-lg">
                4
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold mb-2">Receive Price Alerts</h3>
              <p className="text-gray-600 mb-2">
                Get notified instantly when item prices change or match your target price.
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                <li>Prices are checked every 5 minutes</li>
                <li>You'll receive notifications through your chosen channel</li>
                <li>Track price history in your dashboard</li>
                <li>Adjust target prices anytime</li>
              </ul>
            </div>
          </div>

          {/* Step 5 */}
          <div className="flex gap-6">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-12 w-12 rounded-full bg-blue-600 text-white font-bold text-lg">
                5
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold mb-2">Explore Saved Searches & Feed</h3>
              <p className="text-gray-600 mb-2">
                Use the Feed to discover trending items and the Saved Searches page to manage your search queries.
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                <li>Save frequently used searches for quick access</li>
                <li>Browse trending items in the Feed section</li>
                <li>Re-run saved searches at any time</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-gray-100 p-8 rounded-lg">
        <h2 className="text-3xl font-bold mb-8 text-center">Frequently Asked Questions</h2>

        <div className="space-y-6">
          <details className="bg-white p-4 rounded-lg border-l-4 border-blue-600">
            <summary className="font-bold text-lg cursor-pointer">How often are prices checked?</summary>
            <p className="text-gray-600 mt-3">
              Prices are checked every 5 minutes for all monitored items to ensure you get timely updates.
            </p>
          </details>

          <details className="bg-white p-4 rounded-lg border-l-4 border-blue-600">
            <summary className="font-bold text-lg cursor-pointer">What notification channels are available?</summary>
            <p className="text-gray-600 mt-3">
              We support email, Discord webhooks, SMS, push notifications, and custom webhooks. You can mix and match
              channels per item.
            </p>
          </details>

          <details className="bg-white p-4 rounded-lg border-l-4 border-blue-600">
            <summary className="font-bold text-lg cursor-pointer">Is my eBay account data secure?</summary>
            <p className="text-gray-600 mt-3">
              Yes! We use OAuth 2.0 for secure authentication and never store your eBay password. Your data is
              encrypted at rest.
            </p>
          </details>

          <details className="bg-white p-4 rounded-lg border-l-4 border-blue-600">
            <summary className="font-bold text-lg cursor-pointer">Can I monitor items from different countries?</summary>
            <p className="text-gray-600 mt-3">
              Yes, we support eBay.com and other international eBay sites. Prices are automatically converted to your
              preferred currency.
            </p>
          </details>
        </div>
      </section>
    </div>
  );
};

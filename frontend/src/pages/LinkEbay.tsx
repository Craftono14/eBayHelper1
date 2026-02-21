import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export const LinkEbay: React.FC = () => {
  const { isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [redirectUrl, setRedirectUrl] = useState('');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleLinkClick = () => {
    if (!isLoggedIn) {
      alert('Please log in first before linking your eBay account.');
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      alert('Authentication token not found. Please log in again.');
      return;
    }

    // Redirect directly to the backend OAuth endpoint with token as query param
    // The backend will validate the token and redirect to eBay
    window.location.href = `/api/ebay/authorize?token=${encodeURIComponent(token)}`;
  };

  const handleManualRedirect = async () => {
    if (!redirectUrl.trim()) {
      setError('Please paste the redirect URL');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      // Extract code and state from the URL
      const url = new URL(redirectUrl);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      if (!code || !state) {
        throw new Error('Invalid redirect URL - missing code or state parameter');
      }

      // Call our backend callback endpoint
      const response = await fetch(`/api/ebay/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to complete eBay linking');
      }

      alert('eBay account linked successfully!');
      navigate('/saved-searches');
    } catch (err: any) {
      console.error('Manual redirect error:', err);
      setError(err.message || 'Failed to process redirect URL');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6 text-center">Link eBay Account</h1>

      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h2 className="text-xl font-bold mb-4">Step 1: Authorize with eBay</h2>
        <p className="text-gray-600 mb-4">
          Click the button below to open eBay's authorization page.
        </p>
        <button
          onClick={handleLinkClick}
          className="w-full bg-red-700 text-white py-3 rounded-lg font-bold text-lg hover:bg-red-800 transition"
        >
          Connect to eBay
        </button>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-xl font-bold mb-4">Step 2: Complete Authorization</h2>
        <p className="text-gray-600 mb-4">
          After authorizing on eBay, you'll see a success page. <strong>Copy the entire URL</strong> from your browser's address bar and paste it below:
        </p>
        
        <textarea
          value={redirectUrl}
          onChange={(e) => setRedirectUrl(e.target.value)}
          placeholder="Paste the redirect URL here&#10;Example: https://auth2.ebay.com/oauth2/ThirdPartyAuthSucessFailure?isAuthSuccessful=true&state=3&code=..."
          className="w-full p-3 border border-gray-300 rounded mb-4 font-mono text-sm"
          rows={5}
          disabled={processing}
        />

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleManualRedirect}
          disabled={processing || !redirectUrl.trim()}
          className="w-full bg-green-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-green-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {processing ? 'Processing...' : 'Complete eBay Linking'}
        </button>
      </div>

      <div className="bg-blue-100 border border-blue-400 text-blue-700 p-4 rounded-lg mt-6">
        <p className="font-bold mb-2">What happens?</p>
        <ul className="text-sm space-y-2">
          <li>• You'll be redirected to eBay's secure login</li>
          <li>• Grant eBayHelper permission to access your account</li>
          <li>• Copy the success page URL and paste it above</li>
          <li>• Your eBay data stays secure and encrypted</li>
        </ul>
      </div>

      <p className="text-xs text-gray-500 mt-6 text-center">
        We use OAuth 2.0 and never store your eBay password.
      </p>
    </div>
  );
};

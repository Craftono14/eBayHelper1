import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function EbayCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('Processing eBay authorization...');
  const [error, setError] = useState('');

  useEffect(() => {
    const processCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');
      const isSuccess = params.get('isAuthSuccessful');

      console.log('eBay callback params:', { code, state, isSuccess });

      if (!code || !state) {
        setError('Missing authorization code or state parameter');
        return;
      }

      if (isSuccess !== 'true') {
        setError('eBay authorization was not successful');
        return;
      }

      try {
        // Call our backend callback endpoint with the code and state
        const response = await fetch(`/api/ebay/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, {
          method: 'GET',
          credentials: 'include',
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to complete eBay linking');
        }

        setStatus('eBay account linked successfully! Redirecting...');
        setTimeout(() => {
          navigate('/saved-searches');
        }, 1500);
      } catch (err: any) {
        console.error('Callback error:', err);
        setError(err.message || 'Failed to link eBay account');
      }
    };

    processCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">
            eBay Authorization
          </h2>
          {error ? (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded">
              <p className="text-red-600">{error}</p>
              <button
                onClick={() => navigate('/link-ebay')}
                className="mt-4 text-blue-600 hover:text-blue-800"
              >
                Try Again
              </button>
            </div>
          ) : (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
              <p className="text-blue-600">{status}</p>
              <div className="mt-4 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

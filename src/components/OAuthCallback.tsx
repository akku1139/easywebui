import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');

      if (error) {
        setStatus('error');
        setMessage(`OAuth error: ${error}`);
        return;
      }

      if (!code || !state) {
        setStatus('error');
        setMessage('Missing code or state parameter');
        return;
      }

      try {
        // Send the code and state to the backend
        const response = await fetch('/api/mcp-oauth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state }),
        });

        if (response.ok) {
          const data = await response.json() as { serverId?: string };
          window.opener?.postMessage(
            { type: 'mcp-oauth-complete', serverId: data.serverId },
            window.location.origin
          );
          setStatus('success');
          setMessage('OAuth authentication successful! You can close this window.');
          setTimeout(() => {
            window.close();
            navigate('/');
          }, 1200);
        } else {
          const data = await response.json() as { error?: string };
          setStatus('error');
          setMessage(data.error || 'Failed to complete OAuth flow');
        }
      } catch (err) {
        setStatus('error');
        setMessage('Failed to process OAuth callback');
        console.error('OAuth callback error:', err);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-lg p-8">
        <div className="text-center">
          {status === 'processing' && (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
              <h2 className="text-xl font-semibold text-white mb-2">Processing OAuth...</h2>
              <p className="text-gray-400">Please wait while we complete the authentication.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="text-green-500 text-5xl mb-4">✓</div>
              <h2 className="text-xl font-semibold text-white mb-2">Success!</h2>
              <p className="text-gray-400">{message}</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="text-red-500 text-5xl mb-4">✗</div>
              <h2 className="text-xl font-semibold text-white mb-2">Error</h2>
              <p className="text-gray-400 mb-4">{message}</p>
              <button
                onClick={() => navigate('/')}
                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition"
              >
                Return to App
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

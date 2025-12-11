import { useState } from 'react';

export function Auth({ onLogin }: { onLogin: (token: string, user: any, password?: string) => void }) {
    const [isLogin, setIsLogin] = useState(false); // Default: Create Account
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        // Explicit Mode Logic
        const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            const data = await res.json();

            if (!res.ok) {
                // Smart Fallback: If registering and user exists -> Suggest Login
                if (!isLogin && res.status === 409) {
                    setError('User already exists. Please sign in.');
                    setIsLogin(true); // Auto-switch to login
                    setLoading(false);
                    return;
                }
                throw new Error(data.error || 'Failed');
            }

            onLogin(data.token, data.user, password);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="bg-white p-8 rounded-xl shadow-sm border w-full max-w-sm">
                <h1 className="text-2xl font-bold mb-2 text-center">{isLogin ? 'Welcome back' : 'Create your account'}</h1>
                <p className="text-gray-500 mb-6 text-sm text-center">
                    {isLogin ? 'Enter your details to access your portfolio.' : 'Start your private wealth journey today.'}
                </p>

                {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm mb-4">{error}</div>}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">USERNAME</label>
                        <input
                            className="w-full border p-2 rounded focus:ring-2 focus:ring-black outline-none transition"
                            value={username} onChange={e => setUsername(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">PASSWORD</label>
                        <input
                            type="password"
                            className="w-full border p-2 rounded focus:ring-2 focus:ring-black outline-none transition"
                            value={password} onChange={e => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button
                        disabled={loading}
                        className="w-full bg-black text-white font-bold py-3 rounded hover:bg-gray-800 disabled:opacity-50 transition"
                    >
                        {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
                    </button>
                </form>

                <div className="mt-6 text-center text-sm">
                    <button
                        onClick={() => { setIsLogin(!isLogin); setError(''); }}
                        className="text-gray-500 hover:text-black font-medium underline"
                    >
                        {isLogin ? 'Need an account? Create one' : 'Already have an account? Sign in'}
                    </button>
                </div>
            </div>
        </div>
    );
}

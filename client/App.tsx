import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { Auth } from './components/Auth';
import { DashboardPage } from './pages/DashboardPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { deriveMasterKey } from './lib/crypto';

// Unlock Gate Component: Forces user to unlock E2EE before accessing protected routes
function UnlockGate({ user, encryptionKey, onUnlock, onLogout, children }: any) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    if (encryptionKey) return children;

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const key = await deriveMasterKey(password, user.username);
            onUnlock(key);
        } catch (e) {
            setError('Failed to unlock. Wrong password?');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="bg-white p-8 rounded shadow max-w-md w-full text-center">
                <h2 className="text-xl font-bold mb-2">🔐 Unlock Session</h2>
                <p className="mb-6 text-gray-500 text-sm">Please decrypt your key to continue.</p>
                {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
                <form onSubmit={handleUnlock} className="flex gap-2">
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="border p-2 rounded flex-1" placeholder="Enter Password" autoFocus />
                    <button className="bg-black text-white px-4 rounded">Unlock</button>
                </form>
                <button onClick={onLogout} className="mt-4 text-xs text-gray-400 hover:text-red-500">Log out</button>
            </div>
        </div>
    );
}

function MainLayout({ user, onLogout, children }: any) {
    return (
        <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
            <nav className="bg-white border-b px-6 py-4 flex justify-between items-center sticky top-0 z-50">
                <div className="flex items-center gap-8">
                    <a href="/" className="font-bold text-xl">PrivateFolio</a>
                    <div className="hidden md:flex gap-6 text-sm font-medium text-gray-500">
                        <a href="/" className="text-black">Asset</a>
                        <a href="#" className="hover:text-black">Portfolio</a>
                        <a href="#" className="hover:text-black">Cash</a>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                        {user.username.slice(0, 2).toUpperCase()}
                    </div>
                    <button onClick={onLogout} className="text-sm text-gray-400 hover:text-black">Log out</button>
                </div>
            </nav>
            {children}
        </div>
    )
}

function App() {
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [user, setUser] = useState<any>(JSON.parse(localStorage.getItem('user') || 'null'));
    const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);

    const handleLogin = async (newToken: string, newUser: any, password?: string) => {
        localStorage.setItem('token', newToken);
        localStorage.setItem('user', JSON.stringify(newUser));
        setToken(newToken);
        setUser(newUser);
        if (password && newUser.username) {
            const key = await deriveMasterKey(password, newUser.username)
            setEncryptionKey(key)
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
        setEncryptionKey(null);
    };

    if (!token || !user) {
        return <Auth onLogin={handleLogin} />;
    }

    return (
        <BrowserRouter>
            <UnlockGate user={user} encryptionKey={encryptionKey} onUnlock={setEncryptionKey} onLogout={handleLogout}>
                <MainLayout user={user} onLogout={handleLogout}>
                    <Routes>
                        <Route path="/" element={<DashboardPage token={token} />} />
                        <Route path="/portfolio/:id" element={<PortfolioPage token={token} user={user} encryptionKey={encryptionKey} />} />
                        <Route path="*" element={<Navigate to="/" />} />
                    </Routes>
                </MainLayout>
            </UnlockGate>
        </BrowserRouter>
    );
}

export default App;

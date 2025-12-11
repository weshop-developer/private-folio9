import { useState, useEffect } from 'react';
import { encryptData, decryptData, deriveMasterKey } from '../lib/crypto';

export function Dashboard({ token, user, encryptionKey, onSetKey, onLogout }: { token: string; user: any; encryptionKey: CryptoKey | null; onSetKey: (k: CryptoKey) => void; onLogout: () => void }) {
    const [portfolios, setPortfolios] = useState<any[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newPortfolioName, setNewPortfolioName] = useState('');

    // Unlock State
    const [unlockPassword, setUnlockPassword] = useState('');
    const [unlockError, setUnlockError] = useState('');

    // Single Portfolio View State
    const [selectedPortfolio, setSelectedPortfolio] = useState<any>(null);
    const [showAddAsset, setShowAddAsset] = useState(false);
    const [newAssetSymbol, setNewAssetSymbol] = useState('');
    const [newAssetQty, setNewAssetQty] = useState('');
    const [newAssetCost, setNewAssetCost] = useState('');

    // Decrypted Assets Cache (Mapping AssetID -> DecryptedData)
    const [decryptedAssets, setDecryptedAssets] = useState<Record<string, any>>({});

    // Fetch Portfolios
    useEffect(() => {
        fetch('/api/portfolios', {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => setPortfolios(Array.isArray(data) ? data : []));
    }, [token]);

    // Handle Unlock
    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setUnlockError('');
        try {
            const key = await deriveMasterKey(unlockPassword, user.username);
            onSetKey(key);
            setUnlockPassword('');
        } catch (e) {
            setUnlockError('Failed to derive key');
        }
    };

    const handleCreatePortfolio = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch('/api/portfolios', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ name: newPortfolioName, currency: 'USD' })
        });
        const newP = await res.json();
        setPortfolios([newP, ...portfolios]);
        setShowCreateModal(false);
        setNewPortfolioName('');
    };

    const handleSelectPortfolio = async (id: string) => {
        const res = await fetch(`/api/portfolios/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setSelectedPortfolio(data);

        // Attempt Decrypt Assets
        if (encryptionKey && data.assets) {
            const decrypted: Record<string, any> = {};
            for (const asset of data.assets) {
                try {
                    // If asset.quantity is a string containing ':', it's encrypted.
                    // NOTE: Backward compatibility check:
                    // Our schema defines quantity/cost_basis as REAL. To store ciphertext we need schema change OR string hack.
                    // Current schema: quantity REAL, cost_basis REAL ... symbol TEXT.
                    // We can't store "iv:cipher" in a REAL column.
                    // WORKAROUND: For MVP without schema migration, we will JSON.stringify the ENTIRE asset payload 
                    // and store it in a new TEXT column? Or reuse 'symbol' column? No.
                    // We need to change schema to store encrypted data.
                    // OR we just encrypt the 'symbol'? No, want to hide quantities.
                    // Let's assume schema change: all sensitive fields -> TEXT.
                    // Or simplistic approach: Storing metadata in 'symbol' field JSON string? Hacky.

                    // OK, Real Plan: I need to update schema locally to change quantity/cost to TEXT
                    // and probably add an 'is_encrypted' flag?
                    // Let's modify schema.sql and re-run migration (safe with IF NOT EXISTS?).
                    // SQLite is loosely typed, we CAN store string in REAL column actually! (D1/SQLite affinity)
                    // So "iv:cipher" string can be saved in quantity/cost_basis columns.

                    // Let's try to decrypt if it looks like encryption string
                    // But wait, quantity is likely the number itself if not encrypted.

                    // Implementation:
                    // We will encrypt the *values* and store them as strings.

                    // Decrypt Logic:
                    const qtyStr = String(asset.quantity); // Force string to check format
                    const costStr = String(asset.cost_basis);

                    let qty = asset.quantity;
                    let cost = asset.cost_basis;

                    if (qtyStr.includes(':')) {
                        qty = await decryptData(qtyStr, encryptionKey);
                    }
                    if (costStr.includes(':')) {
                        cost = await decryptData(costStr, encryptionKey);
                    }

                    decrypted[asset.id] = { ...asset, quantity: qty, cost_basis: cost };
                } catch (e) {
                    console.error("Decrypt fail", e);
                    decrypted[asset.id] = asset; // Fallback
                }
            }
            setDecryptedAssets(decrypted);
        }
    };

    const handleAddAsset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPortfolio) return;

        let submitQty: string | number = Number(newAssetQty);
        let submitCost: string | number = Number(newAssetCost);

        if (encryptionKey) {
            // Encrypt Sensitive Data
            // We encrypt the numbers and store the ciphertext string
            submitQty = await encryptData(Number(newAssetQty), encryptionKey);
            submitCost = await encryptData(Number(newAssetCost), encryptionKey);
        }

        const res = await fetch(`/api/portfolios/${selectedPortfolio.id}/assets`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                symbol: newAssetSymbol,
                quantity: submitQty, // Sending string (ciphertext) to backend
                costBasis: submitCost
            })
        });

        if (res.ok) {
            handleSelectPortfolio(selectedPortfolio.id);
            setShowAddAsset(false);
            setNewAssetSymbol('');
            setNewAssetQty('');
            setNewAssetCost('');
        }
    };

    if (!encryptionKey) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="bg-white p-8 rounded shadow max-w-md w-full text-center">
                    <h2 className="text-xl font-bold mb-4">🔐 Unlock Your Portfolio</h2>
                    <p className="mb-6 text-gray-600">Your data is end-to-end encrypted. Please enter your password to unlock your local encryption key.</p>
                    {unlockError && <p className="text-red-500 mb-4">{unlockError}</p>}
                    <form onSubmit={handleUnlock}>
                        <input
                            type="password"
                            value={unlockPassword}
                            onChange={e => setUnlockPassword(e.target.value)}
                            className="w-full border p-2 rounded mb-4"
                            placeholder="Password"
                            required
                        />
                        <div className="flex gap-2 justify-center">
                            <button type="button" onClick={onLogout} className="text-gray-500 underline text-sm">Logout</button>
                            <button type="submit" className="bg-black text-white px-6 py-2 rounded">Unlock</button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Navbar */}
            <nav className="bg-white border-b px-8 py-4 flex justify-between items-center">
                <h1 className="font-bold text-xl">PrivateFolio <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded ml-2">Encrypted</span></h1>
                <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">Scanning as <strong>{user.username}</strong></span>
                    <button onClick={onLogout} className="text-sm text-red-600 hover:underline">Logout</button>
                </div>
            </nav>

            <main className="max-w-6xl mx-auto py-10 px-8">
                {!selectedPortfolio ? (
                    // Portfolio List View (Same as before)
                    <div>
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-2xl font-bold">Your Portfolios</h2>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800"
                            >
                                + New Portfolio
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {portfolios.map(p => (
                                <div key={p.id} onClick={() => handleSelectPortfolio(p.id)} className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-md transition cursor-pointer">
                                    <h3 className="font-bold text-lg mb-2">{p.name}</h3>
                                    <p className="text-gray-500 text-sm">{p.currency} • {new Date(p.created_at * 1000).toLocaleDateString()}</p>
                                </div>
                            ))}

                            {portfolios.length === 0 && (
                                <div className="col-span-3 text-center py-20 text-gray-400">
                                    No portfolios yet. Create one to get started.
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    // Portfolio Detail View (With Decrypted Data)
                    <div>
                        <button onClick={() => setSelectedPortfolio(null)} className="mb-6 text-gray-500 hover:text-black">← Back to Dashboard</button>

                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h2 className="text-3xl font-bold">{selectedPortfolio.name}</h2>
                                <p className="text-gray-500">Holdings Overview</p>
                            </div>
                            <button
                                onClick={() => setShowAddAsset(true)}
                                className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800"
                            >
                                + Add Asset
                            </button>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="p-4 font-semibold text-sm text-gray-600">Symbol</th>
                                        <th className="p-4 font-semibold text-sm text-gray-600">Quantity</th>
                                        <th className="p-4 font-semibold text-sm text-gray-600">Cost Basis</th>
                                        <th className="p-4 font-semibold text-sm text-gray-600">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedPortfolio.assets?.map((rawAsset: any) => {
                                        const a = decryptedAssets[rawAsset.id] || rawAsset;
                                        const isEncrypted = String(rawAsset.quantity).includes(':');

                                        return (
                                            <tr key={a.id} className="border-b last:border-0 hover:bg-gray-50">
                                                <td className="p-4 font-bold">{a.symbol.toUpperCase()}</td>
                                                <td className="p-4 font-mono">{typeof a.quantity === 'number' ? a.quantity : '***'}</td>
                                                <td className="p-4 font-mono">${typeof a.cost_basis === 'number' ? a.cost_basis : '***'}</td>
                                                <td className="p-4 text-xs">
                                                    {isEncrypted ? (
                                                        <span className="bg-green-100 text-green-700 px-2 py-1 rounded">Locked</span>
                                                    ) : (
                                                        <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded">Plain</span>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {(!selectedPortfolio.assets || selectedPortfolio.assets.length === 0) && (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-gray-400">No assets in this portfolio.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>

            {/* Create Portfolio Modal (Same) */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white p-6 rounded-xl w-full max-w-sm">
                        <h3 className="font-bold text-lg mb-4">New Portfolio</h3>
                        <form onSubmit={handleCreatePortfolio}>
                            <input
                                className="w-full border p-2 rounded mb-4"
                                placeholder="Portfolio Name (e.g. Retirement)"
                                value={newPortfolioName}
                                onChange={e => setNewPortfolioName(e.target.value)}
                                required
                            />
                            <div className="flex gap-2 justify-end">
                                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-gray-600">Cancel</button>
                                <button type="submit" className="bg-black text-white px-4 py-2 rounded">Create</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Asset Modal */}
            {showAddAsset && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white p-6 rounded-xl w-full max-w-sm">
                        <h3 className="font-bold text-lg mb-4">Add Asset (Encrypted)</h3>
                        <form onSubmit={handleAddAsset} className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-gray-500">TICKER SYMBOL</label>
                                <input
                                    className="w-full border p-2 rounded"
                                    placeholder="e.g. AAPL"
                                    value={newAssetSymbol}
                                    onChange={e => setNewAssetSymbol(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-gray-500">QUANTITY</label>
                                    <input
                                        type="number" step="any"
                                        className="w-full border p-2 rounded"
                                        placeholder="0.00"
                                        value={newAssetQty}
                                        onChange={e => setNewAssetQty(e.target.value)}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500">COST BASIS ($)</label>
                                    <input
                                        type="number" step="any"
                                        className="w-full border p-2 rounded"
                                        placeholder="0.00"
                                        value={newAssetCost}
                                        onChange={e => setNewAssetCost(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="text-xs text-center text-gray-500 mt-2">
                                🔒 Data will be encrypted before sending.
                            </div>
                            <div className="flex gap-2 justify-end mt-4">
                                <button type="button" onClick={() => setShowAddAsset(false)} className="px-4 py-2 text-gray-600">Cancel</button>
                                <button type="submit" className="bg-black text-white px-4 py-2 rounded">Add Holding</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

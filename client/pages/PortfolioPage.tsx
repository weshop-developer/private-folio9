import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { encryptData, decryptData } from '../lib/crypto';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// Mock Data for Portfolio Chart
const chartData = [
    { name: 'Nov 25', value: 650000 },
    { name: 'Nov 30', value: 720000 },
    { name: 'Dec 5', value: 750000 },
    { name: 'Dec 11', value: 759860 },
];

export function PortfolioPage({ token, user, encryptionKey, onSetKey }: any) {
    const { id } = useParams();
    const [portfolio, setPortfolio] = useState<any>(null);
    const [decryptedAssets, setDecryptedAssets] = useState<Record<string, any>>({});

    // Add Asset State
    const [showAddModal, setShowAddModal] = useState(false);
    const [newAssetSymbol, setNewAssetSymbol] = useState('');
    const [newAssetQty, setNewAssetQty] = useState('');
    const [newAssetCost, setNewAssetCost] = useState('');

    // Fetch Logic
    const fetchPortfolio = async () => {
        const res = await fetch(`/api/portfolios/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        setPortfolio(data);
        decryptAssets(data.assets);
    };

    const decryptAssets = async (assets: any[]) => {
        if (!encryptionKey || !assets) return;
        const decrypted: Record<string, any> = {};

        for (const asset of assets) {
            try {
                let qty = asset.quantity;
                let cost = asset.cost_basis;
                if (String(qty).includes(':')) qty = await decryptData(qty, encryptionKey);
                if (String(cost).includes(':')) cost = await decryptData(cost, encryptionKey);
                decrypted[asset.id] = { ...asset, quantity: qty, cost_basis: cost };
            } catch (e) {
                decrypted[asset.id] = asset;
            }
        }
        setDecryptedAssets(decrypted);
    };

    useEffect(() => {
        fetchPortfolio();
    }, [id, token, encryptionKey]);

    const handleAddAsset = async (e: React.FormEvent) => {
        e.preventDefault();
        let submitQty: any = Number(newAssetQty);
        let submitCost: any = Number(newAssetCost);

        if (encryptionKey) {
            submitQty = await encryptData(Number(newAssetQty), encryptionKey);
            submitCost = await encryptData(Number(newAssetCost), encryptionKey);
        }

        await fetch(`/api/portfolios/${id}/assets`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                symbol: newAssetSymbol,
                quantity: submitQty,
                costBasis: submitCost
            })
        });
        setShowAddModal(false);
        fetchPortfolio(); // Refresh
    };

    if (!portfolio) return <div className="p-8">Loading...</div>;

    return (
        <div className="max-w-7xl mx-auto py-8 px-4">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
                <Link to="/" className="hover:text-black">Assets</Link>
                <span>/</span>
                <span className="text-black font-medium">{portfolio.name}</span>
            </div>

            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-2xl font-bold">{portfolio.name}</h1>
                </div>
                <div className="flex items-baseline gap-4">
                    <span className="text-4xl font-bold">$759,860.15</span>
                    <span className="text-green-500 font-bold text-sm">+2.95% (Today)</span>
                </div>
            </div>

            {/* Chart */}
            <div className="bg-white p-6 rounded-xl border shadow-sm mb-8 h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#aaa' }} />
                        <YAxis hide domain={['dataMin', 'dataMax']} />
                        <Tooltip />
                        <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={3} dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Actions Bar */}
            <div className="flex justify-between items-center mb-6">
                <div className="flex gap-2">
                    <button className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-bold">Assets</button>
                    <button className="px-4 py-2 bg-gray-100 text-gray-500 rounded-full text-sm font-bold hover:bg-gray-200">Activity</button>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded shadow-sm hover:bg-blue-700 font-medium text-sm"
                >
                    + Add Asset
                </button>
            </div>

            {/* Assets Table */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-white border-b text-xs font-bold text-gray-400 uppercase tracking-wider">
                        <tr>
                            <th className="p-4 pl-6">Asset</th>
                            <th className="p-4">Type</th>
                            <th className="p-4 text-right">Quantity</th>
                            <th className="p-4 text-right">Avg Cost</th>
                            <th className="p-4 text-right">Price</th>
                            <th className="p-4 text-right">Value</th>
                            <th className="p-4 text-right">State</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {portfolio.assets?.map((rawAsset: any) => {
                            const a = decryptedAssets[rawAsset.id] || rawAsset;
                            const isEncrypted = String(rawAsset.quantity).includes(':');

                            return (
                                <tr key={a.id} className="hover:bg-gray-50 transition text-sm">
                                    <td className="p-4 pl-6 font-bold flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs">
                                            {a.symbol.slice(0, 1).toUpperCase()}
                                        </div>
                                        {a.symbol.toUpperCase()}
                                    </td>
                                    <td className="p-4 text-gray-500">Stock/ETF</td>
                                    <td className="p-4 text-right font-mono">{typeof a.quantity === 'number' ? a.quantity : 'LOCKED'}</td>
                                    <td className="p-4 text-right font-mono">${typeof a.cost_basis === 'number' ? a.cost_basis : '---'}</td>
                                    <td className="p-4 text-right font-mono">$150.00</td>
                                    <td className="p-4 text-right font-bold font-mono">$ --</td>
                                    <td className="p-4 text-right">
                                        {isEncrypted ? <span className="text-green-600">🔒 Encrypted</span> : <span className="text-gray-400">Plain</span>}
                                    </td>
                                </tr>
                            )
                        })}
                        {(!portfolio.assets || portfolio.assets.length === 0) && (
                            <tr>
                                <td colSpan={7} className="p-10 text-center text-gray-400">No assets yet. Add one to see it here.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add Asset Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white p-6 rounded-xl w-full max-w-sm">
                        <h3 className="font-bold text-lg mb-4">Add Encrypted Position</h3>
                        <form onSubmit={handleAddAsset} className="space-y-4">
                            <input className="w-full border p-2 rounded" placeholder="Symbol (e.g. BTC)" value={newAssetSymbol} onChange={e => setNewAssetSymbol(e.target.value)} required />
                            <div className="grid grid-cols-2 gap-4">
                                <input type="number" step="any" className="w-full border p-2 rounded" placeholder="Qty" value={newAssetQty} onChange={e => setNewAssetQty(e.target.value)} required />
                                <input type="number" step="any" className="w-full border p-2 rounded" placeholder="Cost Basis" value={newAssetCost} onChange={e => setNewAssetCost(e.target.value)} required />
                            </div>
                            <div className="flex justify-end gap-2 mt-4">
                                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-gray-500">Cancel</button>
                                <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Add Position</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

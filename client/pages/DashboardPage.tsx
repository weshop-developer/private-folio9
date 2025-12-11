import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export function DashboardPage({ token }: { token: string }) {
    const [portfolios, setPortfolios] = useState<any[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        fetch('/api/portfolios', {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => setPortfolios(Array.isArray(data) ? data : []));
    }, [token]);

    const handleCreate = async () => {
        const name = prompt("Enter Portfolio Name:");
        if (!name) return;
        const res = await fetch('/api/portfolios', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ name, currency: 'USD' })
        });
        const newP = await res.json();
        setPortfolios([newP, ...portfolios]);
    };

    // Mock Data for Charts
    const data = [
        { name: 'Crypto', value: 400 },
        { name: 'Stocks', value: 300 },
        { name: 'Cash', value: 300 },
    ];
    const COLORS = ['#0088FE', '#00C49F', '#FFBB28'];

    return (
        <div className="max-w-7xl mx-auto py-8 px-4">
            {/* Header Summary */}
            <div className="mb-8">
                <h2 className="text-xl font-bold mb-1">Total Assets Overview</h2>
                <p className="text-gray-500 text-sm">Aggregated assets converted to selected currency</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <p className="text-gray-500 text-xs font-bold uppercase mb-2">Total Assets</p>
                    <p className="text-3xl font-bold">$759,860.15</p>
                </div>
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <p className="text-gray-500 text-xs font-bold uppercase mb-2">Unrealized P&L</p>
                    <p className="text-3xl font-bold text-green-500">+$269,654.34</p>
                </div>
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <p className="text-gray-500 text-xs font-bold uppercase mb-2">Realized P&L</p>
                    <p className="text-3xl font-bold text-gray-400">--</p>
                </div>
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <p className="text-gray-500 text-xs font-bold uppercase mb-2">Yesterday P&L</p>
                    <p className="text-3xl font-bold text-red-500">-$26,438.25</p>
                </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                {/* Donut Chart */}
                <div className="bg-white p-6 rounded-xl border shadow-sm col-span-1">
                    <h3 className="font-bold mb-4">Asset Breakdown</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {data.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Line Chart Placeholder */}
                <div className="bg-white p-6 rounded-xl border shadow-sm col-span-2">
                    <h3 className="font-bold mb-4">Asset Trend</h3>
                    <div className="h-64 flex items-end justify-between gap-1">
                        {/* Fake Chart Bars for visual */}
                        {[...Array(20)].map((_, i) => (
                            <div key={i} style={{ height: `${Math.random() * 80 + 20}%` }} className="bg-blue-100 hover:bg-blue-200 w-full rounded-t-md transition-all"></div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Portfolios List */}
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Your Portfolios</h3>
                <button onClick={handleCreate} className="bg-black text-white px-4 py-2 rounded text-sm hover:bg-gray-800">+ New Portfolio</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {portfolios.map(p => (
                    <Link to={`/portfolio/${p.id}`} key={p.id} className="block group">
                        <div className="bg-white p-6 rounded-xl border shadow-sm hover:shadow-md transition">
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-lg">💰</div>
                                <span className="text-gray-400 group-hover:text-black transition">↗</span>
                            </div>
                            <h4 className="font-bold text-lg mb-1">{p.name}</h4>
                            <p className="text-sm text-gray-500">Created: {new Date(p.created_at * 1000).toLocaleDateString()}</p>
                        </div>
                    </Link>
                ))}
                {portfolios.length === 0 && (
                    <div className="col-span-3 text-center py-10 text-gray-400 bg-white rounded-xl border border-dashed">
                        No portfolios found. Create one!
                    </div>
                )}
            </div>
        </div>
    );
}

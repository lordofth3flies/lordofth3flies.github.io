import React, { useState, useEffect, useContext } from 'react';
import { FirebaseContext } from '../App'; // Adjust path
import { doc, updateDoc, getDocs, collection } from 'firebase/firestore'; // Import necessary functions

const AdminModifyProvincesModal = ({ onClose, provinces, onProvinceUpdate, onPasswordReset }) => {
    const { db, appId } = useContext(FirebaseContext);
    const [selectedProvinceName, setSelectedProvinceName] = useState('');
    const [currentProvinceData, setCurrentProvinceData] = useState(null);
    const [newType, setNewType] = useState('');
    const [newVoteWeight, setNewVoteWeight] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const councilTypes = [
        { name: "Territory", weight: 0.5 },
        { name: "Lower Council", weight: 1 },
        { name: "Upper Council", weight: 1.5 },
        { name: "King", weight: 2 },
        { name: "Admin", weight: 0 }
    ];

    useEffect(() => {
        if (selectedProvinceName) {
            const province = provinces.find(p => p.name === selectedProvinceName);
            setCurrentProvinceData(province);
            setNewType(province?.type || '');
            setNewVoteWeight(province?.voteWeight || '');
            setMessage('');
        } else {
            setCurrentProvinceData(null);
            setNewType('');
            setNewVoteWeight('');
        }
    }, [selectedProvinceName, provinces]);

    const handleTypeChange = (e) => {
        const type = e.target.value;
        setNewType(type);
        const selectedType = councilTypes.find(t => t.name === type);
        if (selectedType) {
            setNewVoteWeight(selectedType.weight);
        }
    };

    const handleUpdateProvince = async () => {
        if (!currentProvinceData) {
            setMessage('Please select a province to modify.');
            return;
        }
        if (!newType.trim() || newVoteWeight === '') {
            setMessage('Type and Vote Weight cannot be empty.');
            return;
        }

        setLoading(true);
        try {
            await onProvinceUpdate(currentProvinceData.name, newType, parseFloat(newVoteWeight));
            setMessage('Province updated successfully!');
            setLoading(false);
        }
        catch (e) {
            setMessage(`Error updating province: ${e.message}`);
            setLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!currentProvinceData) {
            setMessage('Please select a province to reset password.');
            return;
        }
        setLoading(true);
        try {
            await onPasswordReset(currentProvinceData.name);
            setMessage(`Password for ${currentProvinceData.name} reset to default.`);
            setLoading(false);
        } catch (e) {
            setMessage(`Error resetting password: ${e.message}`);
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 text-3xl font-bold"
                >
                    &times;
                </button>
                <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Modify Provinces</h2>

                {message && (
                    <div className={`p-3 mb-4 rounded-xl text-center ${message.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {message}
                    </div>
                )}

                <div className="mb-4">
                    <label htmlFor="select-province" className="block text-gray-700 text-sm font-semibold mb-2">
                        Select Province:
                    </label>
                    <select
                        id="select-province"
                        className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={selectedProvinceName}
                        onChange={(e) => setSelectedProvinceName(e.target.value)}
                    >
                        <option value="">-- Select Province --</option>
                        {provinces.filter(p => p.name !== "Administrator").map((p) => (
                            <option key={p.id} value={p.name}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                </div>

                {currentProvinceData && (
                    <>
                        <div className="mb-4">
                            <label htmlFor="province-type" className="block text-gray-700 text-sm font-semibold mb-2">
                                Council Status:
                            </label>
                            <select
                                id="province-type"
                                className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={newType}
                                onChange={handleTypeChange}
                            >
                                {councilTypes.map(type => (
                                    <option key={type.name} value={type.name}>{type.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mb-6">
                            <label htmlFor="vote-weight" className="block text-gray-700 text-sm font-semibold mb-2">
                                Manual Vote Weight (Override):
                            </label>
                            <input
                                id="vote-weight"
                                type="number"
                                step="0.1"
                                className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={newVoteWeight}
                                onChange={(e) => setNewVoteWeight(e.target.value)}
                            />
                        </div>
                        <div className="flex justify-between space-x-4 mb-6">
                            <button
                                onClick={handleUpdateProvince}
                                className={`flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                disabled={loading}
                            >
                                Update Province
                            </button>
                            <button
                                onClick={handleResetPassword}
                                className={`flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                disabled={loading}
                            >
                                Reset Password
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AdminModifyProvincesModal;

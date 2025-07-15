import React, { useState, useContext } from 'react';
import { FirebaseContext } from '../App'; // Adjust path
import { doc, updateDoc } from 'firebase/firestore'; // Import necessary functions

const PasswordResetModal = ({ userProvince, onClose }) => {
    const { db, appId } = useContext(FirebaseContext);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handlePasswordReset = async () => {
        setError('');
        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters long.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            const provinceDocRef = doc(db, `artifacts/${appId}/public/data/provinces`, userProvince);
            await updateDoc(provinceDocRef, {
                password: newPassword,
                isDefaultPassword: false
            });
            console.log("Password reset successfully for", userProvince);
            setLoading(false);
            onClose();
        } catch (e) {
            console.error("Error resetting password:", e);
            setError("Failed to reset password. Please try again.");
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md relative">
                <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Set New Password</h2>
                <p className="text-gray-700 text-center mb-4">
                    Your current password is the default. Please set a new password.
                </p>
                {error && <p className="text-red-500 text-center mb-4">{error}</p>}
                <div className="mb-4">
                    <label htmlFor="new-password" className="block text-gray-700 text-sm font-semibold mb-2">
                        New Password:
                    </label>
                    <input
                        id="new-password"
                        type="password"
                        className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                    />
                </div>
                <div className="mb-6">
                    <label htmlFor="confirm-password" className="block text-gray-700 text-sm font-semibold mb-2">
                        Confirm New Password:
                    </label>
                    <input
                        id="confirm-password"
                        type="password"
                        className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onKeyPress={(e) => {
                            if (e.key === 'Enter') handlePasswordReset();
                        }}
                    />
                </div>
                <button
                    onClick={handlePasswordReset}
                    className={`w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={loading}
                >
                    {loading ? 'Resetting...' : 'Reset Password'}
                </button>
            </div>
        </div>
    );
};

export default PasswordResetModal;

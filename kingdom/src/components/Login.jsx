import React, { useState, useContext } from 'react';
import { FirebaseContext } from '../App'; // Adjust path
import { doc, getDoc } from 'firebase/firestore'; // Import only necessary functions
import { signInAnonymously } from 'firebase/auth'; // Removed setPersistence and browserLocalPersistence from here

const Login = ({ onLoginSuccess, provinces, provinceColors, setShowPasswordResetModal, setCurrentUserProvince, setIsAdminLoggedIn }) => {
    const { db, auth, appId } = useContext(FirebaseContext); // Use imported auth and appId
    const [selectedProvince, setSelectedProvince] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = async () => {
        setError('');
        if (!selectedProvince || !password) {
            setError('Please select a province/role and enter a password.');
            return;
        }

        const trimmedSelectedProvince = selectedProvince.trim();
        const trimmedPassword = password.trim();

        let provinceData = provinces.find(p => p.name === trimmedSelectedProvince);

        if (!provinceData && trimmedSelectedProvince === "Administrator") {
            provinceData = { name: "Administrator", password: "passwordadmin", isDefaultPassword: true };
        } else if (!provinceData) {
            setError('Selected province not found.');
            return;
        }

        try {
            const provinceDocRef = doc(db, `artifacts/${appId}/public/data/provinces`, trimmedSelectedProvince);
            const docSnap = await getDoc(provinceDocRef);

            if (docSnap.exists()) {
                provinceData = { id: docSnap.id, ...docSnap.data() };
            } else {
                setError('Selected province data not found in database.');
                return;
            }
        } catch (e) {
            console.error("Error fetching province data:", e);
            setError("Failed to verify login. Please try again.");
            return;
        }

        console.log("Expected password:", provinceData.password);
        console.log("Entered password:", trimmedPassword);

        if (trimmedPassword === provinceData.password) {
            // Persistence is now set globally in App.jsx, so no need to set it here.
            if (!auth.currentUser) { // Check if already authenticated, if not, sign in
                try {
                    await signInAnonymously(auth); // This sign-in will now use the globally set persistence
                    console.log("Signed in anonymously during login process.");
                } catch (anonError) {
                    console.error("Error signing in anonymously:", anonError);
                    setError("Failed to authenticate with Firebase. Please try again.");
                    return;
                }
            }

            if (provinceData.isDefaultPassword) {
                setCurrentUserProvince(trimmedSelectedProvince);
                setIsAdminLoggedIn(trimmedSelectedProvince === "Administrator");
                setShowPasswordResetModal(true); // Force password reset
            } else {
                onLoginSuccess(trimmedSelectedProvince);
            }
        } else {
            setError('Invalid password.');
        }
    };

    const selectBgColor = provinceColors[selectedProvince] || '#ffffff';

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative z-10">
            <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
                <h2 className="text-3xl font-bold text-center text-gray-800 mb-6">Council Login</h2>
                {error && <p className="text-red-500 text-center mb-4">{error}</p>}
                <div className="mb-4">
                    <label htmlFor="province-select" className="block text-gray-700 text-sm font-semibold mb-2">
                        Select Province/Role:
                    </label>
                    <select
                        id="province-select"
                        className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-300"
                        style={{ backgroundColor: selectBgColor, color: (selectedProvince === "Capital" || selectedProvince === "Atitia" || selectedProvince === "Administrator") ? "#000000" : "#ffffff" }}
                        value={selectedProvince}
                        onChange={(e) => setSelectedProvince(e.target.value)}
                    >
                        <option value="">-- Select your Province/Role --</option>
                        {provinces
                            .filter(p => p.name !== "Administrator")
                            .map((p) => (
                                <option key={p.id} value={p.name} style={{ backgroundColor: provinceColors[p.name] || '#ffffff', color: (p.name === "Capital" || p.name === "Atitia") ? "#000000" : "#ffffff" }}>
                                    {p.name === "Capital" ? "King (Capital)" : p.name}
                                </option>
                            ))}
                        <option value="Administrator" style={{ backgroundColor: provinceColors["Administrator"], color: "#ffffff" }}>Administrator</option>
                    </select>
                </div>
                <div className="mb-6">
                    <label htmlFor="password-input" className="block text-gray-700 text-sm font-semibold mb-2">
                        Password:
                    </label>
                    <input
                        id="password-input"
                        type="password"
                        className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-700 mb-3 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyPress={(e) => {
                            if (e.key === 'Enter') handleLogin();
                        }}
                    />
                </div>
                <button
                    onClick={handleLogin}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105"
                >
                    Login
                </button>
                <p className="text-center text-gray-600 text-sm mt-4">
                    Default password: <span className="font-semibold">'password' + Province Name</span>
                </p>
            </div>
        </div>
    );
};

export default Login;

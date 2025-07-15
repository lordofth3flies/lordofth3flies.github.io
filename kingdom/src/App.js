import React, { useState, useEffect, createContext, useContext, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';

// Context for Firebase and User
const FirebaseContext = createContext(null);

// Define province colors
const provinceColors = {
    "Hovalen": "#04037a",
    "Izartil": "#42953b",
    "Rilra": "#75002e",
    "Kobat": "#ec1021",
    "Schrafen": "#252ad1",
    "Puron": "#ff3ac5",
    "Atitia": "#67ff4a",
    "Artayos": "#e43900",
    "Capital": "#e4fc28",
    "Guzia": "#4b0202",
    "Astaria": "#243e55",
    "Administrator": "#FF3300" // Updated color for admin
};

// Animated Background Component
const AnimatedBackground = ({ colors }) => {
    const canvasRef = useRef(null);
    const animationFrameId = useRef(null);
    const particles = useRef([]);
    const maxParticles = 100;
    const connectDistance = 150;
    const particleSpeed = 0.5;

    const availableColors = colors.filter(color => color !== provinceColors["Administrator"]);

    const createParticle = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        return {
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * particleSpeed,
            vy: (Math.random() - 0.5) * particleSpeed,
            radius: Math.random() * 3 + 2, // Slightly larger circles
            color: availableColors[Math.floor(Math.random() * availableColors.length)],
            alpha: Math.random() * 0.5 + 0.1 // Initial alpha for fading
        };
    }, [availableColors]);

    const draw = useCallback((ctx, particle) => {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${parseInt(particle.color.slice(1, 3), 16)}, ${parseInt(particle.color.slice(3, 5), 16)}, ${parseInt(particle.color.slice(5, 7), 16)}, ${particle.alpha})`;
        ctx.fill();
    }, []);

    const update = useCallback((particle) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        particle.x += particle.vx;
        particle.y += particle.vy;

        // Bounce off walls
        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;

        // Fade in/out
        particle.alpha += (Math.random() - 0.5) * 0.02; // Slight random fade
        if (particle.alpha > 0.8) particle.alpha = 0.8;
        if (particle.alpha < 0.1) particle.alpha = 0.1;
    }, []);

    const connectParticles = useCallback((ctx) => {
        for (let i = 0; i < particles.current.length; i++) {
            for (let j = i + 1; j < particles.current.length; j++) {
                const p1 = particles.current[i];
                const p2 = particles.current[j];
                const dist = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

                if (dist < connectDistance) {
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.strokeStyle = `rgba(100, 100, 100, ${1 - (dist / connectDistance) * 0.8})`; // Fading lines
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
    }, []);

    const animate = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!ctx || !canvas) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height); // Clear canvas

        particles.current.forEach(particle => {
            update(particle);
            draw(ctx, particle);
        });

        connectParticles(ctx);

        animationFrameId.current = requestAnimationFrame(animate);
    }, [draw, update, connectParticles]);

    const resizeCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            // Re-initialize particles on resize to distribute them correctly
            particles.current = Array.from({ length: maxParticles }, createParticle);
        }
    }, [createParticle]);

    useEffect(() => {
        if (!canvasRef.current || availableColors.length === 0) return;

        resizeCanvas(); // Initial size and particle creation
        window.addEventListener('resize', resizeCanvas);

        // Initialize particles if not already done
        if (particles.current.length === 0) {
            particles.current = Array.from({ length: maxParticles }, createParticle);
        }

        animationFrameId.current = requestAnimationFrame(animate);

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
        };
    }, [createParticle, animate, resizeCanvas, availableColors.length]);

    return (
        <canvas
            ref={canvasRef}
            className="fixed top-0 left-0 w-full h-full z-0 pointer-events-none" // z-0 to be behind everything
            style={{ zIndex: -1 }}
        ></canvas>
    );
};


const App = () => {
    const [currentPage, setCurrentPage] = useState('login');
    const [user, setUser] = useState(null);
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [appId, setAppId] = useState('');
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [provinces, setProvinces] = useState([]); // State to hold provinces for dropdown
    const [userProvince, setCurrentUserProvince] = useState(null);
    const [selectedProposalId, setSelectedProposalId] = useState(null);
    const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
    const [showAdminModifyProvincesModal, setShowAdminModifyProvincesModal] = useState(false);
    const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false); // New state for admin login

    useEffect(() => {
        try {
            const currentAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-council-app-id';
            const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
            const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

            setAppId(currentAppId);

            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            const firebaseAuth = getAuth(app);

            setDb(firestoreDb);
            setAuth(firebaseAuth);

            const unsubscribe = onAuthStateChanged(firebaseAuth, async (currentUser) => {
                if (currentUser) {
                    setUser(currentUser);
                    console.log("User authenticated:", currentUser.uid);
                } else {
                    console.log("No user authenticated. Attempting anonymous sign-in or custom token sign-in.");
                    if (initialAuthToken) {
                        try {
                            await signInWithCustomToken(firebaseAuth, initialAuthToken);
                            console.log("Signed in with custom token.");
                        } catch (error) {
                            console.error("Error signing in with custom token:", error);
                            try {
                                await signInAnonymously(firebaseAuth);
                                console.log("Signed in anonymously after custom token failure.");
                            } catch (anonError) {
                                console.error("Error signing in anonymously:", anonError);
                            }
                        }
                    } else {
                        try {
                            await signInAnonymously(firebaseAuth);
                            console.log("Signed in anonymously.");
                        } catch (error) {
                            console.error("Error signing in anonymously:", error);
                        }
                    }
                }
                setIsAuthReady(true);
            });

            return () => unsubscribe();
        } catch (error) {
            console.error("Error initializing Firebase:", error);
        }
    }, []);

    // Fetch provinces once Firebase is ready
    useEffect(() => {
        if (db && isAuthReady) {
            const fetchProvinces = async () => {
                try {
                    const publicProvincesCollectionRef = collection(db, `artifacts/${appId}/public/data/provinces`);
                    const querySnapshot = await getDocs(publicProvincesCollectionRef);
                    let fetchedProvinces = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setProvinces(fetchedProvinces);

                    if (fetchedProvinces.length === 0) {
                        console.log("No provinces found. Adding sample provinces.");
                        const sampleProvinces = [
                            { name: "Hovalen", voteWeight: 1.5, type: "Upper Council", password: "passwordHovalen", isDefaultPassword: true, color: provinceColors["Hovalen"] },
                            { name: "Izartil", voteWeight: 1.5, type: "Upper Council", password: "passwordIzartil", isDefaultPassword: true, color: provinceColors["Izartil"] },
                            { name: "Rilra", voteWeight: 1, type: "Lower Council", password: "passwordRilra", isDefaultPassword: true, color: provinceColors["Rilra"] },
                            { name: "Kobat", voteWeight: 1.5, type: "Upper Council", password: "passwordKobat", isDefaultPassword: true, color: provinceColors["Kobat"] },
                            { name: "Schrafen", voteWeight: 1, type: "Lower Council", password: "passwordSchrafen", isDefaultPassword: true, color: provinceColors["Schrafen"] },
                            { name: "Puron", voteWeight: 1, type: "Lower Council", password: "passwordPuron", isDefaultPassword: true, color: provinceColors["Puron"] },
                            { name: "Atitia", voteWeight: 1, type: "Lower Council", password: "passwordAtitia", isDefaultPassword: true, color: provinceColors["Atitia"] },
                            { name: "Artayos", voteWeight: 1, type: "Lower Council", password: "passwordArtayos", isDefaultPassword: true, color: provinceColors["Artayos"] },
                            { name: "Capital", voteWeight: 2, type: "King", password: "passwordCapital", isDefaultPassword: true, color: provinceColors["Capital"] },
                            { name: "Guzia", voteWeight: 0.5, type: "Territory", password: "passwordGuzia", isDefaultPassword: true, color: provinceColors["Guzia"] },
                            { name: "Astaria", voteWeight: 0.5, type: "Territory", password: "passwordAstaria", isDefaultPassword: true, color: provinceColors["Astaria"] }
                        ];
                        // Add a default admin user
                        sampleProvinces.push({ name: "Administrator", voteWeight: 0, type: "Admin", password: "passwordadmin", isDefaultPassword: true, color: provinceColors["Administrator"] });

                        for (const province of sampleProvinces) {
                            await setDoc(doc(publicProvincesCollectionRef, province.name), province);
                        }
                        fetchedProvinces = sampleProvinces.map(p => ({ id: p.name, ...p }));
                        setProvinces(fetchedProvinces);
                    }
                } catch (error) {
                    console.error("Error fetching or adding provinces:", error);
                }
            };
            fetchProvinces();
        }
    }, [db, appId, isAuthReady]);

    // Component for Login Page
    const Login = ({ onLoginSuccess, provinces }) => {
        const { db, appId } = useContext(FirebaseContext);
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

            // If Administrator is selected and not found in fetched provinces (e.g., first run)
            if (!provinceData && trimmedSelectedProvince === "Administrator") {
                provinceData = { name: "Administrator", password: "passwordadmin", isDefaultPassword: true };
            } else if (!provinceData) {
                setError('Selected province not found.');
                return;
            }

            // Fetch the actual province data from Firestore to get the current password and isDefaultPassword status
            try {
                const provinceDocRef = doc(db, `artifacts/${appId}/public/data/provinces`, trimmedSelectedProvince);
                const docSnap = await getDoc(provinceDocRef);

                if (docSnap.exists()) {
                    provinceData = { id: docSnap.id, ...docSnap.data() };
                } else {
                    // This case should ideally not happen if initial provinces are seeded correctly
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

        // Get the background color for the select box
        const selectBgColor = provinceColors[selectedProvince] || '#ffffff'; // Default to white if no color found

        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4 relative z-10"> {/* Added relative z-10 */}
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
                            style={{ backgroundColor: selectBgColor, color: (selectedProvince === "Capital" || selectedProvince === "Atitia" || selectedProvince === "Administrator") ? "#000000" : "#ffffff" }} // Adjust text color for light backgrounds
                            value={selectedProvince}
                            onChange={(e) => setSelectedProvince(e.target.value)}
                        >
                            <option value="">-- Select your Province/Role --</option>
                            {provinces
                                .filter(p => p.name !== "Administrator") // Filter out Admin from main list
                                // Removed .sort() to maintain original order
                                .map((p) => (
                                    <option key={p.id} value={p.name} style={{ backgroundColor: provinceColors[p.name] || '#ffffff', color: (p.name === "Capital" || p.name === "Atitia") ? "#000000" : "#ffffff" }}>
                                        {p.name === "Capital" ? "King (Capital)" : p.name}
                                    </option>
                                ))}
                            {/* Explicitly add Administrator option */}
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
                    {/* Removed Admin password tip */}
                </div>
            </div>
        );
    };

    // New Password Reset Modal Component
    const PasswordResetModal = ({ userProvince, onClose }) => {
        const { db, appId } = useContext(FirebaseContext);
        const [newPassword, setNewPassword] = useState('');
        const [confirmPassword, setConfirmPassword] = useState('');
        const [error, setError] = useState('');
        const [loading, setLoading] = useState(false);

        const handlePasswordReset = async () => {
            setError('');
            if (newPassword.length < 6) { // Basic password length validation
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
                onClose(); // Close the modal and proceed to dashboard
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

    // Component for Dashboard Page
    const Dashboard = ({ userProvince, onCreateProposal, onViewProposal, userId, onReviewPassedLaws, onModifyProvinces, isAdmin }) => {
        const { db, appId } = useContext(FirebaseContext);
        const [proposals, setProposals] = useState([]);
        const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'submitted'

        useEffect(() => {
            if (!db || !appId) return;

            const proposalsCollectionRef = collection(db, `artifacts/${appId}/public/data/proposals`);
            const q = query(proposalsCollectionRef);

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fetchedProposals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                // Sort proposals by dateCreated, newest first
                fetchedProposals.sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));

                // Separate mandatory proposals and sort them to the top
                const mandatoryProposals = fetchedProposals.filter(p => p.isMandatory && new Date(p.expiryDate).getTime() > new Date().getTime());
                const otherProposals = fetchedProposals.filter(p => !(p.isMandatory && new Date(p.expiryDate).getTime() > new Date().getTime()));

                // Sort mandatory proposals by dateCreated (newest first)
                mandatoryProposals.sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));

                // Combine: mandatory proposals first, then others (already sorted by dateCreated)
                setProposals([...mandatoryProposals, ...otherProposals]);

            }, (error) => {
                console.error("Error fetching proposals:", error);
            });

            return () => unsubscribe();
        }, [db, appId]);

        // Function to determine proposal status and styling
        const getProposalStatus = (proposal) => {
            const now = new Date();
            const expiryDate = new Date(proposal.expiryDate);
            const timeRemaining = expiryDate.getTime() - now.getTime();
            const hasVoted = proposal.votes && proposal.votes[userProvince];

            // If it's a mandatory proposal and still active, give it the mandatory style
            if (proposal.isMandatory && timeRemaining > 0) {
                return { status: 'mandatory-active', style: 'bg-red-100 text-red-800 border-red-500 relative' };
            }

            if (timeRemaining <= 0) {
                // Check for scribe's urgent laws (only if expired and not yet added)
                if (userProvince === 'Kobat' && (proposal.status === 'passed' || proposal.status === 'passedEarly') && !proposal.addedToLawBookDate) {
                    const passedDate = new Date(proposal.expiryDate); // Assuming expiryDate is when it "passed"
                    const timeSincePassed = now.getTime() - passedDate.getTime();
                    if (timeSincePassed > 2 * 24 * 60 * 60 * 1000) { // More than 2 days since passed
                        return { status: 'scribe-urgent', style: 'bg-red-200 text-red-800 border-red-500 animate-pulse' };
                    }
                }
                return { status: 'expired', style: 'bg-gray-300 text-gray-700' }; // Grayed out
            } else if (timeRemaining < 24 * 60 * 60 * 1000) { // Less than 24 hours remaining
                return { status: 'urgent', style: 'bg-red-200 text-red-800 border-red-500' }; // Red
            } else if (hasVoted) {
                return { status: 'voted', style: 'bg-yellow-200 text-yellow-800 border-yellow-500' }; // Yellow
            } else {
                return { status: 'active', style: 'bg-white text-gray-800 border-gray-200' }; // Default
            }
        };

        const filteredProposals = proposals.filter(proposal => {
            if (filterStatus === 'submitted') {
                return proposal.proposerProvince === userProvince;
            }
            return true;
        });

        // Separate proposals into categories for display
        const expiredProposals = filteredProposals.filter(p => getProposalStatus(p).status === 'expired' || p.status === 'passed' || p.status === 'failed' || p.status === 'passedEarly' || p.status === 'failedEarly' || p.status === 'scribe-urgent');
        const urgentProposals = filteredProposals.filter(p => getProposalStatus(p).status === 'urgent');
        const votedProposals = filteredProposals.filter(p => getProposalStatus(p).status === 'voted');
        const activeProposals = filteredProposals.filter(p => getProposalStatus(p).status === 'active' || getProposalStatus(p).status === 'mandatory-active');


        return (
            <div className="min-h-screen bg-gray-100 p-6 font-inter">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-2xl font-bold text-gray-800">{userProvince}</h1>
                    <div className="flex space-x-4">
                        {userProvince === 'Kobat' && (
                            <button
                                onClick={onReviewPassedLaws}
                                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105"
                            >
                                Review Passed Laws
                            </button>
                        )}
                        {isAdmin && (
                             <button
                                onClick={onModifyProvinces}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105"
                            >
                                Modify Provinces
                            </button>
                        )}
                        <button
                            onClick={onCreateProposal}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105"
                        >
                            Create Proposal
                        </button>
                        <button
                            onClick={() => {
                                setCurrentUserProvince(null);
                                setIsAdminLoggedIn(false);
                                setCurrentPage('login');
                            }}
                            className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105"
                        >
                            Logout
                        </button>
                    </div>
                    <div className="relative">
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="appearance-none bg-white border border-gray-300 text-gray-700 py-2 px-4 pr-8 rounded-xl leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="all">All Proposals</option>
                            <option value="submitted">My Submitted Proposals</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                        </div>
                    </div>
                </div>

                {/* Updated grid for even spacing */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Expired Proposals (Left) */}
                    <div className="col-span-1">
                        <h2 className="text-xl font-semibold text-gray-700 mb-4">Expired Proposals</h2>
                        <div className="space-y-4">
                            {expiredProposals.length === 0 && <p className="text-gray-500">No expired proposals.</p>}
                            {expiredProposals.map(proposal => (
                                <ProposalCard
                                    key={proposal.id}
                                    proposal={proposal}
                                    statusInfo={getProposalStatus(proposal)}
                                    onViewProposal={onViewProposal}
                                    provinces={provinces} // Pass provinces to calculate result
                                />
                            ))}
                        </div>
                    </div>

                    {/* Active Proposals (Center) */}
                    <div className="col-span-1">
                        <h2 className="text-xl font-semibold text-gray-700 mb-4">Active Proposals</h2>
                        <div className="space-y-4">
                            {activeProposals.length === 0 && <p className="text-gray-500">No active proposals.</p>}
                            {activeProposals.map(proposal => (
                                <ProposalCard
                                    key={proposal.id}
                                    proposal={proposal}
                                    statusInfo={getProposalStatus(proposal)}
                                    onViewProposal={onViewProposal}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Urgent & Voted Proposals (Right) */}
                    <div className="col-span-1">
                        <h2 className="text-xl font-semibold text-gray-700 mb-4">Urgent & Voted Proposals</h2>
                        <div className="space-y-4">
                            {urgentProposals.length === 0 && votedProposals.length === 0 && <p className="text-gray-500">No urgent or voted proposals.</p>}
                            {urgentProposals.map(proposal => (
                                <ProposalCard
                                    key={proposal.id}
                                    proposal={proposal}
                                    statusInfo={getProposalStatus(proposal)}
                                    onViewProposal={onViewProposal}
                                />
                            ))}
                            {votedProposals.map(proposal => (
                                <ProposalCard
                                    key={proposal.id}
                                    proposal={proposal}
                                    statusInfo={getProposalStatus(proposal)}
                                    onViewProposal={onViewProposal}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // Component for individual Proposal Card on Dashboard
    const ProposalCard = ({ proposal, statusInfo, onViewProposal, provinces }) => {
        const { id, title, synopsis, proposerProvince, dateCreated, expiryDate, votes, status: proposalStatus, addedToLawBookDate, legislationNumber, isMandatory } = proposal;
        const { style, status } = statusInfo;

        const calculateTimeRemaining = (expiry) => {
            const now = new Date();
            const expiryDateObj = new Date(expiry);
            const diffMs = expiryDateObj.getTime() - now.getTime();

            if (diffMs <= 0) return 'Expired';

            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

            if (diffDays > 0) return `${diffDays}d ${diffHours}h`;
            if (diffHours > 0) return `${diffHours}h ${diffMinutes}m`;
            return `${diffMinutes}m`;
        };

        const getTimeRemainingText = calculateTimeRemaining(expiryDate);

        // Function to calculate final result for expired proposals
        const getResult = () => {
            if (proposalStatus === 'passedEarly') return 'PASSED (Early)';
            if (proposalStatus === 'failedEarly') return 'FAILED (Early)';
            if (proposalStatus === 'passed') return 'PASSED';
            if (proposalStatus === 'failed') return 'FAILED';

            // If not explicitly passed/failed yet, calculate based on current votes if expired
            if (status !== 'expired' && status !== 'scribe-urgent' || !provinces) return null;

            let ayeWeight = 0;
            let nayWeight = 0;

            for (const provinceName in votes) {
                const voteType = votes[provinceName];
                const provinceData = provinces.find(p => p.name === provinceName);
                const weight = provinceData ? provinceData.voteWeight : 0;

                if (voteType === 'aye') {
                    ayeWeight += weight;
                } else if (voteType === 'nay') {
                    nayWeight += weight;
                }
            }

            // A proposal passes if aye votes > nay votes (simple majority for now, supermajority checked by King)
            if (ayeWeight > nayWeight) {
                return 'PASSED';
            } else if (nayWeight >= ayeWeight) { // Including tie as failed
                return 'FAILED';
            }
            return null; // Should not reach here for expired proposals
        };

        const result = getResult();

        return (
            <div
                className={`p-4 border rounded-xl shadow-sm cursor-pointer transition duration-200 ease-in-out hover:shadow-md ${style} ${status === 'expired' ? 'opacity-70' : ''} ${status === 'mandatory-active' ? 'relative pt-10' : ''}`}
                onClick={() => onViewProposal(id)}
            >
                {isMandatory && new Date(expiryDate).getTime() > new Date().getTime() && (
                    <div className="absolute top-0 left-0 right-0 bg-red-600 text-white text-center text-xs font-bold py-1 rounded-t-xl z-10">
                        MANDATORY
                    </div>
                )}
                <div className="flex justify-between items-start"> {/* Use flex to align title and number */}
                    <h3 className="text-lg font-bold mb-2">
                        {title}
                    </h3>
                    {legislationNumber && (
                        <span className="text-gray-500 text-sm font-semibold ml-2">#{legislationNumber}</span>
                    )}
                </div>
                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{synopsis}</p>
                <div className="flex justify-between items-center text-xs">
                    <div>
                        <p>Proposer: <span className="font-semibold">{proposerProvince}</span></p>
                        <p>Date: {new Date(dateCreated).toLocaleDateString()}</p>
                    </div>
                    {status !== 'expired' && status !== 'scribe-urgent' ? (
                        <p className="font-semibold">Time Left: {getTimeRemainingText}</p>
                    ) : (
                        <div className="flex items-center space-x-2">
                            <p className={`font-bold ${result === 'PASSED' || result === 'PASSED (Early)' ? 'text-green-600' : result === 'FAILED' || result === 'FAILED (Early)' ? 'text-red-600' : 'text-orange-600'}`}>
                                Result: {result}
                            </p>
                            {addedToLawBookDate && (
                                <span className="text-xs bg-gray-600 text-white px-2 py-1 rounded-full">Added</span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // Component for Create Proposal Page
    const CreateProposal = ({ onBackToDashboard, userProvince }) => {
        const { db, appId } = useContext(FirebaseContext);
        const [title, setTitle] = useState('');
        const [purpose, setPurpose] = useState('');
        const [whereasStatements, setWhereasStatements] = useState(['']); // Array for up to 10
        const [changes, setChanges] = useState('');
        const [showPreview, setShowPreview] = useState(false);
        const [error, setError] = useState('');
        const [loading, setLoading] = useState(false);

        const handleAddWhereas = () => {
            if (whereasStatements.length < 10) {
                setWhereasStatements([...whereasStatements, '']);
            }
        };

        const handleRemoveWhereas = (index) => {
            const newWhereas = whereasStatements.filter((_, i) => i !== index);
            setWhereasStatements(newWhereas.length > 0 ? newWhereas : ['']); // Ensure at least one
        };

        const handleWhereasChange = (index, value) => {
            const newWhereas = [...whereasStatements];
            newWhereas[index] = value;
            setWhereasStatements(newWhereas);
        };

        const validateForm = () => {
            if (!title.trim() || !purpose.trim() || !changes.trim()) {
                setError('All fields are required.');
                return false;
            }
            if (whereasStatements.some(s => !s.trim())) {
                setError('All "Whereas" statements must be filled.');
                return false;
            }
            if (whereasStatements.length === 0) {
                setError('At least one "Whereas" statement is required.');
                return false;
            }
            setError('');
            return true;
        };

        const handleSubmitProposal = async () => {
            if (!validateForm()) return;
            if (!db || !appId) {
                setError("Database not initialized. Please try again.");
                return;
            }

            setLoading(true);
            try {
                // Fetch all proposals to determine the next legislation number
                const proposalsCollectionRef = collection(db, `artifacts/${appId}/public/data/proposals`);
                const querySnapshot = await getDocs(proposalsCollectionRef);
                let maxLegislationNumber = 0;
                querySnapshot.forEach(docSnap => {
                    const data = docSnap.data();
                    if (data.legislationNumber) {
                        const num = parseInt(data.legislationNumber, 10);
                        if (!isNaN(num) && num > maxLegislationNumber) {
                            maxLegislationNumber = num;
                        }
                    }
                });
                const nextLegislationNumber = String(maxLegislationNumber + 1).padStart(3, '0');

                // Determine if the proposal is mandatory (created by Administrator)
                const isMandatoryProposal = userProvince === "Administrator";

                const newProposal = {
                    legislationNumber: nextLegislationNumber, // Assign legislation number
                    title,
                    purpose,
                    synopsis: purpose.substring(0, 150) + (purpose.length > 150 ? '...' : ''), // Auto-generate synopsis
                    whereasStatements: whereasStatements.filter(s => s.trim() !== ''), // Filter out empty ones
                    changes,
                    proposerProvince: userProvince,
                    dateCreated: new Date().toISOString(),
                    expiryDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48 hours for voting
                    votes: {},
                    voteCounts: { aye: 0, nay: 0, present: 0 },
                    status: 'active', // 'active', 'passed', 'failed', 'passedEarly', 'failedEarly'
                    amendment: null,
                    amendmentHistory: [],
                    addedToLawBookDate: null, // New field for scribe
                    isMandatory: isMandatoryProposal // Mark if mandatory
                };

                await addDoc(proposalsCollectionRef, newProposal);
                console.log("Proposal submitted successfully!");
                setLoading(false);
                onBackToDashboard();
            } catch (e) {
                console.error("Error adding document: ", e);
                setError("Failed to submit proposal. Please try again.");
                setLoading(false);
            }
        };

        const ProposalPreview = () => (
            <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-inner">
                <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">{title}</h3>
                <p className="text-gray-700 mb-4 text-center italic">{purpose}</p>
                <div className="mb-6">
                    {whereasStatements.filter(s => s.trim() !== '').map((statement, index) => (
                        <p key={index} className="text-gray-700 mb-2">
                            <span className="font-semibold">WHEREAS,</span> {statement.trim()};
                        </p>
                    ))}
                </div>
                <p className="text-gray-800 font-bold text-lg mb-2">THEREFORE, let the following changes be enacted:</p>
                <div className="bg-white p-4 rounded-lg border border-gray-300 whitespace-pre-wrap text-gray-700">
                    {changes}
                </div>
            </div>
        );

        return (
            <div className="min-h-screen bg-gray-100 p-6 font-inter">
                <div className="max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-lg">
                    <h2 className="text-3xl font-bold text-center text-gray-800 mb-8">Create New Law Proposal</h2>

                    {error && <p className="text-red-500 text-center mb-4">{error}</p>}

                    <div className="mb-6">
                        <label htmlFor="title" className="block text-gray-700 text-sm font-semibold mb-2">
                            Proposal Title:
                        </label>
                        <input
                            type="text"
                            id="title"
                            className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g., The Act of Provincial Autonomy"
                        />
                    </div>

                    <div className="mb-6">
                        <label htmlFor="purpose" className="block text-gray-700 text-sm font-semibold mb-2">
                            Proposal Purpose:
                        </label>
                        <textarea
                            id="purpose"
                            rows="3"
                            className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={purpose}
                            onChange={(e) => setPurpose(e.target.value)}
                            placeholder="Briefly state the main goal or reason for this proposal."
                        ></textarea>
                    </div>

                    <div className="mb-6">
                        <label className="block text-gray-700 text-sm font-semibold mb-2">
                            Whereas Statements (1-10):
                        </label>
                        {whereasStatements.map((statement, index) => (
                            <div key={index} className="flex items-center mb-2">
                                <span className="mr-2 text-gray-600 font-semibold">WHEREAS,</span>
                                <input
                                    type="text"
                                    className="shadow appearance-none border rounded-xl w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={statement}
                                    onChange={(e) => handleWhereasChange(index, e.target.value)}
                                    placeholder={`Statement ${index + 1}`}
                                />
                                {whereasStatements.length > 1 && (
                                    <button
                                        onClick={() => handleRemoveWhereas(index)}
                                        className="ml-2 text-red-500 hover:text-red-700 text-2xl"
                                        title="Remove statement"
                                    >
                                        &times;
                                    </button>
                                )}
                            </div>
                        ))}
                        {whereasStatements.length < 10 && (
                            <button
                                onClick={handleAddWhereas}
                                className="mt-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-1 px-3 rounded-xl text-sm transition duration-200"
                            >
                                Add Whereas Statement
                            </button>
                        )}
                    </div>

                    <div className="mb-6">
                        <label htmlFor="changes" className="block text-gray-700 text-sm font-semibold mb-2">
                            THEREFORE, let the following changes be enacted:
                        </label>
                        <textarea
                            id="changes"
                            rows="8"
                            className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                            value={changes}
                            onChange={(e) => setChanges(e.target.value)}
                            placeholder="Enter the specific legislative changes, new laws, or amendments to existing ones."
                        ></textarea>
                    </div>

                    <div className="flex justify-between items-center mt-8">
                        <button
                            onClick={() => setShowPreview(!showPreview)}
                            className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105"
                        >
                            {showPreview ? 'Hide Preview' : 'Preview'}
                        </button>
                        <button
                            onClick={handleSubmitProposal}
                            className={`bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={loading}
                        >
                            {loading ? 'Submitting...' : 'Submit Proposal'}
                        </button>
                    </div>

                    {showPreview && (
                        <div className="mt-8">
                            <h3 className="text-2xl font-bold text-center text-gray-800 mb-4 text-center">Proposal Document Preview</h3>
                            <ProposalPreview />
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // Helper function for highlighting diffs
    const generateHighlightedDiff = (originalText, amendedText, isAmendmentOfAmendment = false) => {
        // Ensure inputs are strings to prevent .split() error
        const orig = String(originalText || '');
        const amnd = String(amendedText || '');

        const originalLines = orig.split('\n');
        const amendedLines = amnd.split('\n');

        const finalRender = [];
        const originalLineSet = new Set(originalLines);
        const amendedLineSet = new Set(amendedLines);

        // A simple line-by-line diff.
        // Identify common lines first, then additions, then removals.
        // This is a basic approach and might not handle complex reordering perfectly.

        // Track processed lines to avoid duplicates in output
        const processedOriginalLines = new Set();
        const processedAmendedLines = new Set();

        // Pass 1: Identify and render common lines and additions
        for (let i = 0; i < amendedLines.length; i++) {
            const currentAmendedLine = amendedLines[i];
            // Check if this line exists in original and hasn't been processed as unchanged yet
            const isUnchanged = originalLineSet.has(currentAmendedLine) && !processedOriginalLines.has(currentAmendedLine);

            if (isUnchanged) {
                finalRender.push(<span key={`unchanged-${i}`} className="text-gray-700">{currentAmendedLine}<br/></span>);
                processedOriginalLines.add(currentAmendedLine);
                processedAmendedLines.add(currentAmendedLine);
            } else if (!originalLineSet.has(currentAmendedLine)) {
                // Line is new (addition)
                const colorClass = isAmendmentOfAmendment ? 'text-green-600' : 'text-blue-600';
                finalRender.push(<span key={`added-${i}`} className={colorClass}>{currentAmendedLine}<br/></span>);
                processedAmendedLines.add(currentAmendedLine);
            }
        }

        // Pass 2: Identify and render removals (lines only in original and not yet processed)
        for (let i = 0; i < originalLines.length; i++) {
            const currentOriginalLine = originalLines[i];
            // If the original line is not in the amended set AND it wasn't already marked as unchanged (which means it was a common line)
            if (!amendedLineSet.has(currentOriginalLine) && !processedOriginalLines.has(currentOriginalLine)) {
                const colorClass = isAmendmentOfAmendment ? 'text-orange-600 line-through' : 'text-red-600 line-through';
                finalRender.push(<span key={`removed-${i}`} className={colorClass}>{currentOriginalLine}<br/></span>);
                processedOriginalLines.add(currentOriginalLine);
            }
        }

        // The order might not be perfectly chronological for complex diffs,
        // but it ensures all types of changes are highlighted.
        // A more advanced diff algorithm would be needed for perfect sequential display.
        return finalRender;
    };


    // Component for Proposal Detail Page
    const ProposalDetail = ({ proposalId, onBackToDashboard, userProvince, provinces }) => {
        const { db, appId } = useContext(FirebaseContext);
        const [proposal, setProposal] = useState(null);
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState('');
        const [showAmendmentForm, setShowAmendmentForm] = useState(false);
        const [message, setMessage] = useState(''); // For success/error messages

        useEffect(() => {
            if (!db || !appId || !proposalId) {
                setLoading(false);
                return;
            }

            const proposalDocRef = doc(db, `artifacts/${appId}/public/data/proposals`, proposalId);
            const unsubscribe = onSnapshot(proposalDocRef, (docSnap) => {
                if (docSnap.exists()) {
                    setProposal({ id: docSnap.id, ...docSnap.data() });
                    setLoading(false);
                } else {
                    setError("Proposal not found.");
                    setLoading(false);
                }
            }, (err) => {
                console.error("Error fetching proposal details:", err);
                setError("Failed to load proposal details.");
                setLoading(false);
            });

            return () => unsubscribe();
        }, [db, appId, proposalId]);

        const calculateWeightedVotes = (votesMap, allProvinces) => {
            let aye = 0;
            let nay = 0;
            let present = 0;

            for (const provinceName in votesMap) {
                const voteType = votesMap[provinceName];
                const provinceData = allProvinces.find(p => p.name === provinceName);
                const weight = provinceData ? provinceData.voteWeight : 0;

                if (voteType === 'aye') {
                    aye += weight;
                } else if (voteType === 'nay') {
                    nay += weight;
                } else if (voteType === 'present') {
                    present += weight;
                }
            }
            return { aye, nay, present };
        };

        const handleVote = async (voteType) => {
            if (!db || !proposal || !userProvince) return;

            setMessage('');
            try {
                const proposalDocRef = doc(db, `artifacts/${appId}/public/data/proposals`, proposal.id);

                const currentProposalSnap = await getDoc(proposalDocRef);
                if (!currentProposalSnap.exists()) {
                    setMessage('Error: Proposal not found.');
                    return;
                }
                const currentProposal = currentProposalSnap.data();

                const now = new Date();
                const expiryDate = new Date(currentProposal.expiryDate);
                if (now.getTime() >= expiryDate.getTime() && currentProposal.status === 'active') {
                    // If time has elapsed and status is still active, mark as passed/failed
                    const currentVoteCounts = calculateWeightedVotes(currentProposal.votes || {}, provinces);
                    const newStatus = currentVoteCounts.aye > currentVoteCounts.nay ? 'passed' : 'failed';
                    await updateDoc(proposalDocRef, { status: newStatus });
                    setMessage('Voting has closed for this proposal.');
                    return;
                } else if (currentProposal.status !== 'active') {
                    setMessage(`Voting is already closed. Status: ${currentProposal.status}`);
                    return;
                }

                // If there's an active amendment, vote on the amendment instead
                if (currentProposal.amendment && currentProposal.amendment.status === 'active') {
                    const amendmentDocRef = doc(db, `artifacts/${appId}/public/data/proposals/${proposal.id}/amendments`, currentProposal.amendment.id);
                    const currentAmendmentSnap = await getDoc(amendmentDocRef);
                    if (!currentAmendmentSnap.exists()) {
                        setMessage('Error: Active amendment not found.');
                        return;
                    }
                    const currentAmendment = currentAmendmentSnap.data();

                    const newAmendmentVotes = { ...currentAmendment.votes, [userProvince]: voteType };
                    const newAmendmentVoteCounts = calculateWeightedVotes(newAmendmentVotes, provinces);

                    await updateDoc(amendmentDocRef, {
                        votes: newAmendmentVotes,
                        voteCounts: newAmendmentVoteCounts
                    });
                    setMessage(`Voted '${voteType}' on the amendment.`);
                } else {
                    // Vote on the main proposal
                    const newVotes = { ...currentProposal.votes, [userProvince]: voteType };
                    const newVoteCounts = calculateWeightedVotes(newVotes, provinces);

                    await updateDoc(proposalDocRef, {
                        votes: newVotes,
                        voteCounts: newVoteCounts
                    });
                    setMessage(`Voted '${voteType}' on the proposal.`);
                }
            } catch (e) {
                console.error("Error voting:", e);
                setMessage("Failed to cast vote. Please try again.");
            }
        };

        const handleEndVotingEarly = async () => {
            if (!db || !proposal || userProvince !== 'Capital') return; // Only King can do this

            setMessage('');
            try {
                const proposalDocRef = doc(db, `artifacts/${appId}/public/data/proposals`, proposal.id);
                const currentProposalSnap = await getDoc(proposalDocRef);
                if (!currentProposalSnap.exists()) {
                    setMessage('Error: Proposal not found.');
                    return;
                }
                const currentProposal = currentProposalSnap.data();

                if (currentProposal.status !== 'active') {
                    setMessage('Voting is not active for this proposal.');
                    return;
                }

                // Calculate current weighted votes
                const currentVoteCounts = calculateWeightedVotes(currentProposal.votes || {}, provinces);
                const totalVoteWeight = provinces.reduce((sum, p) => sum + p.voteWeight, 0);

                // Check for 60% supermajority (aye)
                const supermajorityThreshold = 0.60 * totalVoteWeight;
                if (currentVoteCounts.aye >= supermajorityThreshold) {
                    await updateDoc(proposalDocRef, {
                        status: 'passedEarly',
                        expiryDate: new Date().toISOString(), // End voting now
                        // Votes already recorded, no need for affirmation step in this simplified model
                    });
                    setMessage('Voting ended early! Proposal PASSED with supermajority.');
                } else {
                    // If no supermajority, the King can still end it, but it fails
                    await updateDoc(proposalDocRef, {
                        status: 'failedEarly',
                        expiryDate: new Date().toISOString(), // End voting now
                    });
                    setMessage('Voting ended early! Proposal FAILED (no supermajority).');
                }

            } catch (e) {
                console.error("Error ending voting early:", e);
                setMessage("Failed to end voting early. Please try again.");
            }
        };


        if (loading) {
            return <div className="min-h-screen flex items-center justify-center bg-gray-100"><p className="text-gray-700">Loading proposal...</p></div>;
        }

        if (error) {
            return <div className="min-h-screen flex items-center justify-center bg-gray-100"><p className="text-red-500">{error}</p></div>;
        }

        if (!proposal) {
            return <div className="min-h-screen flex items-center justify-center bg-gray-100"><p className="text-gray-700">Proposal data not available.</p></div>;
        }

        const currentVotes = proposal.amendment && proposal.amendment.status === 'active'
            ? proposal.amendment.votes || {}
            : proposal.votes || {};

        const currentVoteCounts = proposal.amendment && proposal.amendment.status === 'active'
            ? proposal.amendment.voteCounts || { aye: 0, nay: 0, present: 0 }
            : proposal.voteCounts || { aye: 0, nay: 0, present: 0 };

        let amendmentIndicator = null;
        let isAmendmentOfAmendment = false;

        if (proposal.amendment && proposal.amendment.status === 'active') {
            amendmentIndicator = (
                <p className="text-center text-lg font-bold text-orange-600 mb-4 animate-pulse">
                    VOTING ON AMENDMENT
                </p>
            );
            if (proposal.amendment.amendmentOfAmendment) {
                isAmendmentOfAmendment = true;
            }
        }

        const isVotingActive = new Date(proposal.expiryDate).getTime() > new Date().getTime() && proposal.status === 'active';
        const canKingEndEarly = userProvince === 'Capital' && isVotingActive;


        return (
            <div className="min-h-screen bg-gray-100 p-6 font-inter">
                <div className="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-lg">
                    <button
                        onClick={onBackToDashboard}
                        className="mb-6 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 px-4 rounded-xl transition duration-200"
                    >
                        &larr; Back to Dashboard
                    </button>

                    {message && (
                        <div className={`p-3 mb-4 rounded-xl text-center ${message.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {message}
                        </div>
                    )}

                    {amendmentIndicator}

                    <h2 className="text-3xl font-bold text-center text-gray-800 mb-4">
                        {proposal.legislationNumber && <span className="text-gray-500 mr-2">Proposal Number: {proposal.legislationNumber}: </span>}
                        {proposal.title}
                    </h2>
                    <p className="text-center text-gray-600 mb-6 italic">{proposal.purpose}</p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        {/* Left Column: Proposer Info & Vote Table */}
                        <div className="md:col-span-1">
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6">
                                <p className="text-gray-700 text-sm mb-2">
                                    <span className="font-semibold">Proposer:</span> {proposal.proposerProvince}
                                </p>
                                <p className="text-gray-700 text-sm mb-2">
                                    <span className="font-semibold">Date Proposed:</span> {new Date(proposal.dateCreated).toLocaleDateString()}</p>
                                <p className="text-gray-700 text-sm">
                                    <span className="font-semibold">Voting Ends:</span> {new Date(proposal.expiryDate).toLocaleString()}
                                </p>
                                <p className="text-gray-700 text-sm">
                                    <span className="font-semibold">Status:</span> {proposal.status.toUpperCase()} {/* Uppercase status */}
                                </p>
                            </div>

                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4">Province Votes</h3>
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="bg-gray-200 rounded-t-lg">
                                            <th className="p-2 rounded-tl-lg">Province</th>
                                            <th className="p-2 text-center">Aye</th>
                                            <th className="p-2 text-center">Nay</th>
                                            <th className="p-2 rounded-tr-lg text-center">Present</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {provinces
                                            .filter(p => p.name !== "Administrator") // Filter out Administrator
                                            .map((p) => ( // Removed sorting
                                            <tr key={p.name} className="border-b border-gray-200 last:border-b-0">
                                                <td className="p-2">{p.name === "Capital" ? "King (Capital)" : p.name}</td>
                                                <td className="p-2 text-center">
                                                    <div className={`w-3 h-3 rounded-full mx-auto ${currentVotes[p.name] === 'aye' ? 'bg-green-500 shadow-md shadow-green-300' : 'bg-gray-300'}`}></div>
                                                </td>
                                                <td className="p-2 text-center">
                                                    <div className={`w-3 h-3 rounded-full mx-auto ${currentVotes[p.name] === 'nay' ? 'bg-red-500 shadow-md shadow-red-300' : 'bg-gray-300'}`}></div>
                                                </td>
                                                <td className="p-2 text-center">
                                                    <div className={`w-3 h-3 rounded-full mx-auto ${currentVotes[p.name] === 'present' ? 'bg-orange-500 shadow-md shadow-orange-300' : 'bg-gray-300'}`}></div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Right Column: Proposal Text */}
                        <div className="md:col-span-2">
                            <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-inner mb-6">
                                <div className="mb-6">
                                    {proposal.whereasStatements.filter(s => s.trim() !== '').map((statement, index) => (
                                        <p key={index} className="text-gray-700 mb-2">
                                            <span className="font-semibold">WHEREAS,</span> {statement.trim()};
                                        </p>
                                    ))}
                                </div>
                                <p className="text-gray-800 font-bold text-lg mb-2">THEREFORE, let the following changes be enacted:</p>
                                <div className="bg-white p-4 rounded-lg border border-gray-300 whitespace-pre-wrap text-gray-700 font-mono">
                                    {proposal.amendment && proposal.amendment.status === 'active' ?
                                        generateHighlightedDiff(proposal.changes, proposal.amendment.amendedText, isAmendmentOfAmendment) :
                                        proposal.changes // Display original changes if no active amendment
                                    }
                                </div>
                            </div>

                            {/* Vote Tally */}
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4">Weighted Vote Tally</h3>
                                <div className="flex justify-around text-center">
                                    <div>
                                        <p className="text-green-600 text-2xl font-bold">{currentVoteCounts.aye.toFixed(1)}</p>
                                        <p className="text-gray-600 text-sm">Aye</p>
                                    </div>
                                    <div>
                                        <p className="text-red-600 text-2xl font-bold">{currentVoteCounts.nay.toFixed(1)}</p>
                                        <p className="text-gray-600 text-sm">Nay</p>
                                    </div>
                                    <div>
                                        <p className="text-orange-600 text-2xl font-bold">{currentVoteCounts.present.toFixed(1)}</p>
                                        <p className="text-gray-600 text-sm">Present</p>
                                    </div>
                                </div>
                            </div>

                            {/* Voting Buttons */}
                            {isVotingActive && (
                                <div className="flex justify-center space-x-4 mb-6">
                                    <button
                                        onClick={() => handleVote('aye')}
                                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105"
                                    >
                                        Vote Aye
                                    </button>
                                    <button
                                        onClick={() => handleVote('nay')}
                                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105"
                                    >
                                        Vote Nay
                                    </button>
                                    <button
                                        onClick={() => handleVote('present')}
                                        className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-8 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105"
                                    >
                                        Vote Present
                                    </button>
                                </div>
                            )}

                            {/* King's Early End Voting Button */}
                            {canKingEndEarly && (
                                <div className="text-center mt-4">
                                    <button
                                        onClick={handleEndVotingEarly}
                                        className="bg-red-700 hover:bg-red-800 text-white font-bold py-3 px-8 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105"
                                    >
                                        End Voting Early (King)
                                    </button>
                                </div>
                            )}

                            {/* Submit Amendment Button */}
                            {isVotingActive && (
                                <div className="text-center mt-4">
                                    <button
                                        onClick={() => setShowAmendmentForm(true)}
                                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105"
                                        disabled={proposal.amendment && proposal.amendment.amendmentOfAmendment} // Disable if already amended an amendment
                                    >
                                        Submit Amendment
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {showAmendmentForm && (
                    <AmendmentForm
                        proposal={proposal}
                        onClose={() => setShowAmendmentForm(false)}
                        userProvince={userProvince}
                        onAmendmentSubmitted={() => {
                            setShowAmendmentForm(false);
                            setMessage('Amendment submitted successfully! Voting has reset.');
                        }}
                    />
                )}
            </div>
        );
    };

    // Amendment Form Component (Modal)
    const AmendmentForm = ({ proposal, onClose, userProvince, onAmendmentSubmitted }) => {
        const { db, appId } = useContext(FirebaseContext);
        const [amendedText, setAmendedText] = useState(proposal.amendment?.amendedText || proposal.changes);
        const [error, setError] = useState('');
        const [loading, setLoading] = useState(false);

        const isAmendmentOfAmendment = proposal.amendment && proposal.amendment.status === 'active' && proposal.amendment.amendmentOfAmendment;

        const handleSubmitAmendment = async () => {
            if (!db || !appId) {
                setError("Database not initialized.");
                return;
            }
            if (!amendedText.trim()) {
                setError("Amendment text cannot be empty.");
                return;
            }

            setLoading(true);
            try {
                const proposalDocRef = doc(db, `artifacts/${appId}/public/data/proposals`, proposal.id);

                const currentProposalSnap = await getDoc(proposalDocRef);
                if (!currentProposalSnap.exists()) {
                    setError('Error: Proposal not found.');
                    setLoading(false);
                    return;
                }
                const currentProposalData = currentProposalSnap.data();

                const originalTextForDiff = currentProposalData.amendment && currentProposalData.amendment.status === 'active'
                    ? currentProposalData.amendment.amendedText
                    : currentProposalData.changes;

                if (currentProposalData.amendment && currentProposalData.amendment.status === 'active') {
                    if (currentProposalData.amendment.amendmentOfAmendment) {
                        setError("An amendment to an amendment has already been submitted. No further amendments can be made at this time.");
                        setLoading(false);
                        return;
                    }

                    const newAmendment = {
                        id: crypto.randomUUID(),
                        originalProposalId: proposal.id,
                        originalText: originalTextForDiff,
                        amendedText: amendedText,
                        proposerProvince: userProvince,
                        dateCreated: new Date().toISOString(),
                        expiryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                        votes: {},
                        voteCounts: { aye: 0, nay: 0, present: 0 },
                        status: 'active',
                        amendmentOfAmendment: true
                    };

                    const amendmentCollectionRef = collection(db, `artifacts/${appId}/public/data/proposals/${proposal.id}/amendments`);
                    await setDoc(doc(amendmentCollectionRef, newAmendment.id), newAmendment);

                    await updateDoc(proposalDocRef, {
                        amendment: {
                            id: newAmendment.id,
                            status: 'active',
                            amendmentOfAmendment: true
                        },
                        votes: {},
                        voteCounts: { aye: 0, nay: 0, present: 0 }
                    });

                    if (currentProposalData.amendment.id) {
                        const previousAmendmentDocRef = doc(db, `artifacts/${appId}/public/data/proposals/${proposal.id}/amendments`, currentProposalData.amendment.id);
                        await updateDoc(previousAmendmentDocRef, { status: 'superseded' });
                    }

                } else {
                    const newAmendment = {
                        id: crypto.randomUUID(),
                        originalProposalId: proposal.id,
                        originalText: originalTextForDiff,
                        amendedText: amendedText,
                        proposerProvince: userProvince,
                        dateCreated: new Date().toISOString(),
                        expiryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                        votes: {},
                        voteCounts: { aye: 0, nay: 0, present: 0 },
                        status: 'active',
                        amendmentOfAmendment: false
                    };

                    const amendmentCollectionRef = collection(db, `artifacts/${appId}/public/data/proposals/${proposal.id}/amendments`);
                    await setDoc(doc(amendmentCollectionRef, newAmendment.id), newAmendment);

                    await updateDoc(proposalDocRef, {
                        amendment: {
                            id: newAmendment.id,
                            status: 'active',
                            amendmentOfAmendment: false
                        },
                        votes: {},
                        voteCounts: { aye: 0, nay: 0, present: 0 }
                    });
                }

                setLoading(false);
                onAmendmentSubmitted();
            } catch (e) {
                console.error("Error submitting amendment:", e);
                setError("Failed to submit amendment. Please try again.");
                setLoading(false);
            }
        };

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-2xl relative">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 text-3xl font-bold"
                    >
                        &times;
                    </button>
                    <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
                        {isAmendmentOfAmendment ? "Amend Amendment" : "Submit Amendment"}
                    </h2>

                    {error && <p className="text-red-500 text-center mb-4">{error}</p>}

                    <p className="text-gray-700 text-sm mb-2">
                        Original Proposal Text (for reference):
                    </p>
                    <div className="bg-gray-100 p-4 rounded-lg border border-gray-300 mb-4 max-h-48 overflow-y-auto whitespace-pre-wrap text-gray-600 font-mono">
                        {proposal.changes}
                    </div>

                    <p className="text-gray-700 text-sm mb-2">
                        Edit Text for Amendment:
                    </p>
                    <textarea
                        rows="10"
                        className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono mb-4"
                        value={amendedText}
                        onChange={(e) => setAmendedText(e.target.value)}
                        placeholder="Make your proposed changes here. Removals will be red/orange strikethrough, additions will be blue/green."
                    ></textarea>

                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Amendment Preview:</h3>
                    <div className="bg-white p-4 rounded-lg border border-gray-300 whitespace-pre-wrap text-gray-700 font-mono mb-6">
                        {generateHighlightedDiff(
                            isAmendmentOfAmendment ? proposal.amendment.amendedText : proposal.changes,
                            amendedText,
                            isAmendmentOfAmendment
                        )}
                    </div>

                    <div className="flex justify-end space-x-4">
                        <button
                            onClick={onClose}
                            className="bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-xl transition duration-200"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmitAmendment}
                            className={`bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={loading}
                        >
                            {loading ? 'Submitting...' : 'Submit Amendment'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // New Scribe Review Page Component
    const ScribeReviewPage = ({ onBackToDashboard, userProvince }) => {
        const { db, appId, provinces } = useContext(FirebaseContext);
        const [passedLaws, setPassedLaws] = useState([]);
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState('');
        const [message, setMessage] = useState('');

        useEffect(() => {
            if (!db || !appId) return;

            const proposalsCollectionRef = collection(db, `artifacts/${appId}/public/data/proposals`);
            // Query for proposals that have passed (either normally or early) and are not yet added to the law book
            const q = query(proposalsCollectionRef,
                where('status', 'in', ['passed', 'passedEarly']),
                where('addedToLawBookDate', '==', null)
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fetchedLaws = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                // Sort by expiryDate (when they passed), oldest first for review priority
                fetchedLaws.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
                setPassedLaws(fetchedLaws);
                setLoading(false);
            }, (err) => {
                console.error("Error fetching passed laws for scribe:", err);
                setError("Failed to load passed laws.");
                setLoading(false);
            });

            return () => unsubscribe();
        }, [db, appId]);

        const handleMarkAsAdded = async (proposalId) => {
            if (!db) return;
            setMessage('');
            try {
                const proposalDocRef = doc(db, `artifacts/${appId}/public/data/proposals`, proposalId);
                await updateDoc(proposalDocRef, {
                    addedToLawBookDate: new Date().toISOString()
                });
                setMessage('Law marked as added to official document.');
            } catch (e) {
                    console.error("Error marking law as added:", e);
                    setMessage("Failed to mark law as added.");
            }
        };

        const getLawReviewStatus = (proposal) => {
            const now = new Date();
            const passedDate = new Date(proposal.expiryDate); // Assuming expiryDate is when it passed
            const timeSincePassed = now.getTime() - passedDate.getTime();

            if (timeSincePassed > 2 * 24 * 60 * 60 * 1000) { // More than 2 days
                return 'urgent';
            }
            return 'normal';
        };

        if (loading) {
            return <div className="min-h-screen flex items-center justify-center bg-gray-100"><p className="text-gray-700">Loading passed laws...</p></div>;
        }

        if (error) {
            return <div className="min-h-screen flex items-center justify-center bg-gray-100"><p className="text-red-500">{error}</p></div>;
        }

        return (
            <div className="min-h-screen bg-gray-100 p-6 font-inter">
                <div className="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-lg">
                    <button
                        onClick={onBackToDashboard}
                        className="mb-6 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-2 px-4 rounded-xl transition duration-200"
                    >
                        &larr; Back to Dashboard
                    </button>
                    <h2 className="text-3xl font-bold text-center text-gray-800 mb-8">Review Passed Laws (Scribe)</h2>

                    {message && (
                        <div className={`p-3 mb-4 rounded-xl text-center ${message.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                            {message}
                        </div>
                    )}

                    {passedLaws.length === 0 && <p className="text-gray-500 text-center">No laws currently awaiting review.</p>}

                    <div className="space-y-4">
                        {passedLaws.map(law => (
                            <div key={law.id} className={`p-4 border rounded-xl shadow-sm bg-gray-50 ${getLawReviewStatus(law) === 'urgent' ? 'border-red-500 animate-pulse' : 'border-gray-200'}`}>
                                <h3 className="text-lg font-bold mb-2">{law.title}</h3>
                                <p className="text-sm text-gray-600 mb-3 line-clamp-2">{law.synopsis}</p>
                                <div className="flex justify-between items-center text-xs text-gray-700">
                                    <p>Passed On: {new Date(law.expiryDate).toLocaleDateString()}</p>
                                    <button
                                        onClick={() => handleMarkAsAdded(law.id)}
                                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105"
                                    >
                                        Mark as Added
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    // New Admin Modify Provinces Modal Component
    const AdminModifyProvincesModal = ({ onClose, provinces, onProvinceUpdate, onPasswordReset }) => {
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
                            {provinces.filter(p => p.name !== "Administrator").map((p) => ( // Exclude admin from direct modification here
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


    // Main App rendering logic
    let content;
    if (!isAuthReady) {
        content = (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <p className="text-gray-700">Initializing app...</p>
            </div>
        );
    } else if (showPasswordResetModal) {
        content = (
            <PasswordResetModal
                userProvince={userProvince}
                onClose={() => {
                    setShowPasswordResetModal(false);
                    setCurrentPage('dashboard'); // Redirect to dashboard after password reset
                }}
            />
        );
    } else if (showAdminModifyProvincesModal) {
        content = (
            <AdminModifyProvincesModal
                onClose={() => setShowAdminModifyProvincesModal(false)}
                provinces={provinces}
                onProvinceUpdate={async (name, type, weight) => {
                    const provinceDocRef = doc(db, `artifacts/${appId}/public/data/provinces`, name);
                    await updateDoc(provinceDocRef, { type: type, voteWeight: weight });
                    // Re-fetch provinces to update state
                    const publicProvincesCollectionRef = collection(db, `artifacts/${appId}/public/data/provinces`);
                    const querySnapshot = await getDocs(publicProvincesCollectionRef);
                    setProvinces(querySnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
                }}
                onPasswordReset={async (name) => {
                    const provinceDocRef = doc(db, `artifacts/${appId}/public/data/provinces`, name);
                    await updateDoc(provinceDocRef, { password: `password${name}`, isDefaultPassword: true });
                    // No need to re-fetch provinces for password change visible in UI
                }}
            />
        );
    }
    else if (!userProvince) {
        content = <Login onLoginSuccess={(province) => {setCurrentUserProvince(province); setIsAdminLoggedIn(province === "Administrator"); setCurrentPage('dashboard');}} provinces={provinces} />;
    } else {
        switch (currentPage) {
            case 'dashboard':
                content = (
                    <Dashboard
                        userProvince={userProvince}
                        onCreateProposal={() => setCurrentPage('create-proposal')}
                        onViewProposal={(id) => {
                            setSelectedProposalId(id);
                            setCurrentPage('proposal-detail');
                        }}
                        onReviewPassedLaws={() => setCurrentPage('scribe-review')}
                        onModifyProvinces={() => setShowAdminModifyProvincesModal(true)}
                        isAdmin={isAdminLoggedIn}
                        userId={user?.uid}
                    />
                );
                break;
            case 'create-proposal':
                content = (
                    <CreateProposal
                        onBackToDashboard={() => setCurrentPage('dashboard')}
                        userProvince={userProvince}
                    />
                );
                break;
            case 'proposal-detail':
                content = (
                    <ProposalDetail
                        proposalId={selectedProposalId}
                        onBackToDashboard={() => setCurrentPage('dashboard')}
                        userProvince={userProvince}
                        provinces={provinces}
                    />
                );
                break;
            case 'scribe-review':
                content = (
                    <ScribeReviewPage
                        onBackToDashboard={() => setCurrentPage('dashboard')}
                        userProvince={userProvince}
                    />
                );
                break;
            default:
                content = <Login onLoginSuccess={(province) => {setCurrentUserProvince(province); setIsAdminLoggedIn(province === "Administrator"); setCurrentPage('dashboard');}} provinces={provinces} />;
        }
    }


    return (
        <FirebaseContext.Provider value={{ db, auth, appId, user, provinces }}>
            <div className="font-inter">
                {content}
            </div>
            {/* Animated Background */}
            <AnimatedBackground colors={Object.values(provinceColors)} />
            {/* Tailwind CSS CDN */}
            <script src="https://cdn.tailwindcss.com"></script>
            {/* Inter Font */}
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            <style>
                {`
                body {
                    font-family: 'Inter', sans-serif;
                }
                @keyframes pulse-red {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
                    50% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
                }
                .animate-pulse {
                    animation: pulse-red 2s infinite;
                }
                `}
            </style>
        </FirebaseContext.Provider>
    );
};

export default App;

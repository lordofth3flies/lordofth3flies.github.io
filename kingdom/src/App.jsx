import React, { useState, useEffect, createContext } from 'react';
import { auth, db, appId } from './firebase.js';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, setDoc, doc, updateDoc } from 'firebase/firestore';

// Import separated components
import AnimatedBackground from './components/AnimatedBackground.jsx';
import Login from './components/Login.jsx';
import Dashboard from './components/Dashboard.jsx';
import CreateProposal from './components/CreateProposal.jsx';
import CreateBudgetProposal from './components/CreateBudgetProposal.jsx';
import ProposalDetail from './components/ProposalDetail.jsx';
import ScribeReviewPage from './components/ScribeReviewPage.jsx';
import AdminModifyProvincesModal from './components/AdminModifyProvincesModal.jsx';
import PasswordResetModal from './components/PasswordResetModal.jsx';
import ProposalTypeSelectionModal from './components/ProposalTypeSelectionModal.jsx';

// Context for Firebase and User
export const FirebaseContext = createContext(null);

// Define province colors (can be moved to a separate constants file if preferred)
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
    "Administrator": "#FF3300"
};

const App = () => {
    const [currentPage, setCurrentPage] = useState('login');
    const [user, setUser] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [provinces, setProvinces] = useState([]);
    const [userProvince, setCurrentUserProvince] = useState(null);
    const [selectedProposalId, setSelectedProposalId] = useState(null);
    const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
    const [showAdminModifyProvincesModal, setShowAdminModifyProvincesModal] = useState(false);
    const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
    const [showProposalTypeSelectionModal, setShowProposalTypeSelectionModal] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                console.log("User authenticated:", currentUser.uid);
            } else {
                console.log("No user authenticated. Attempting anonymous sign-in.");
                try {
                    await signInAnonymously(auth);
                    console.log("Signed in anonymously.");
                } catch (error) {
                    console.error("Error signing in anonymously:", error);
                }
            }
            setIsAuthReady(true);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (db && isAuthReady && appId) {
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
                        sampleProvinces.push({ name: "Administrator", voteWeight: 0, type: "Admin", password: "passwordadmin", isDefaultPassword: true, color: provinceColors["Administrator"] });

                        for (const province of sampleProvinces) {
                            await setDoc(doc(publicProvincesCollectionRef, province.name), province);
                        }
                        setProvinces(fetchedProvinces);
                    }
                } catch (error) {
                    console.error("Error fetching or adding provinces:", error);
                }
            };
            fetchProvinces();
        }
    }, [db, isAuthReady, appId]);

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
                    setCurrentPage('dashboard');
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
                    const publicProvincesCollectionRef = collection(db, `artifacts/${appId}/public/data/provinces`);
                    const querySnapshot = await getDocs(publicProvincesCollectionRef);
                    setProvinces(querySnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
                }}
                onPasswordReset={async (name) => {
                    const provinceDocRef = doc(db, `artifacts/${appId}/public/data/provinces`, name);
                    await updateDoc(provinceDocRef, { password: `password${name}`, isDefaultPassword: true });
                }}
            />
        );
    } else if (showProposalTypeSelectionModal) {
        content = (
            <ProposalTypeSelectionModal
                onClose={() => setShowProposalTypeSelectionModal(false)}
                onSelectLawProposal={() => {
                    setShowProposalTypeSelectionModal(false);
                    setCurrentPage('create-proposal');
                }}
                onSelectBudgetProposal={() => {
                    setShowProposalTypeSelectionModal(false);
                    setCurrentPage('create-budget-proposal');
                }}
            />
        );
    } else if (!userProvince) {
        content = (
            <Login
                onLoginSuccess={(province) => {
                    setCurrentUserProvince(province);
                    setIsAdminLoggedIn(province === "Administrator");
                    setCurrentPage('dashboard');
                }}
                provinces={provinces}
                provinceColors={provinceColors}
                setShowPasswordResetModal={setShowPasswordResetModal}
                setCurrentUserProvince={setCurrentUserProvince}
                setIsAdminLoggedIn={setIsAdminLoggedIn}
            />
        );
    } else {
        switch (currentPage) {
            case 'dashboard':
                content = (
                    <Dashboard
                        userProvince={userProvince}
                        onCreateProposal={() => setShowProposalTypeSelectionModal(true)}
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
            case 'create-proposal': // Law Proposal
                content = (
                    <CreateProposal
                        onBackToDashboard={() => setCurrentPage('dashboard')}
                        userProvince={userProvince}
                    />
                );
                break;
            case 'create-budget-proposal': // New Budget Proposal
                content = (
                    <CreateBudgetProposal
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
                content = (
                    <Login
                        onLoginSuccess={(province) => {
                            setCurrentUserProvince(province);
                            setIsAdminLoggedIn(province === "Administrator");
                            setCurrentPage('dashboard');
                        }}
                        provinces={provinces}
                        provinceColors={provinceColors}
                        setShowPasswordResetModal={setShowPasswordResetModal}
                        setCurrentUserProvince={setCurrentUserProvince}
                        setIsAdminLoggedIn={setIsAdminLoggedIn}
                    />
                );
        }
    }

    return (
        <FirebaseContext.Provider value={{ db, auth, appId: appId, user, provinces, provinceColors }}>
            <div className="font-inter">
                {content}
            </div>
            <AnimatedBackground colors={Object.values(provinceColors)} adminColor={provinceColors["Administrator"]} />
        </FirebaseContext.Provider>
    );
};

export default App;

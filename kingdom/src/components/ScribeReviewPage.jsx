import React, { useState, useEffect, useContext } from 'react';
import { FirebaseContext } from '../App'; // Adjust path
import { collection, query, where, onSnapshot, updateDoc, doc } from 'firebase/firestore'; // Import necessary functions

const ScribeReviewPage = ({ onBackToDashboard, userProvince }) => {
    const { db, appId } = useContext(FirebaseContext);
    const [passedLaws, setPassedLaws] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!db || !appId) return;

        const proposalsCollectionRef = collection(db, `artifacts/${appId}/public/data/proposals`);
        const q = query(proposalsCollectionRef,
            where('status', 'in', ['passed', 'passedEarly']),
            where('addedToLawBookDate', '==', null)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedLaws = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
        const passedDate = new Date(proposal.expiryDate);
        const timeSincePassed = now.getTime() - passedDate.getTime();

        if (timeSincePassed > 2 * 24 * 60 * 60 * 1000) {
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

export default ScribeReviewPage;

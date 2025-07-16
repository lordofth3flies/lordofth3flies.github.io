import React, { useState, useContext } from 'react';
import { FirebaseContext } from '../App'; // Adjust path
import { collection, addDoc, getDocs } from 'firebase/firestore'; // Import necessary functions

const CreateProposal = ({ onBackToDashboard, userProvince }) => {
    const { db, appId } = useContext(FirebaseContext);
    const [title, setTitle] = useState('');
    const [purpose, setPurpose] = useState('');
    const [whereasStatements, setWhereasStatements] = useState(['']);
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
        setWhereasStatements(newWhereas.length > 0 ? newWhereas : ['']);
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

            const isMandatoryProposal = userProvince === "Administrator";

            const newProposal = {
                legislationNumber: nextLegislationNumber,
                title,
                purpose,
                synopsis: purpose.substring(0, 150) + (purpose.length > 150 ? '...' : ''),
                whereasStatements: whereasStatements.filter(s => s.trim() !== ''),
                changes,
                proposerProvince: userProvince,
                dateCreated: new Date().toISOString(),
                expiryDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
                votes: {},
                voteCounts: { aye: 0, nay: 0, present: 0 },
                status: 'active',
                amendment: null,
                amendmentHistory: [],
                addedToLawBookDate: null,
                isMandatory: isMandatoryProposal
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
            <h3 className="text-xl font-bold text-center text-gray-800 mb-4 text-center">{title}</h3>
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
                    {/* Swapped position of Preview and Cancel */}
                    <button
                        onClick={onBackToDashboard} // Cancel button
                        className="bg-gray-400 hover:bg-gray-500 text-white font-bold py-3 px-6 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105"
                    >
                        Cancel
                    </button>
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

export default CreateProposal;

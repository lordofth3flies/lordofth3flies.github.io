import React, { useState, useContext } from 'react';
import { FirebaseContext } from '../App'; // Adjust path
import { doc, getDoc, collection, setDoc, updateDoc } from 'firebase/firestore'; // Import necessary functions

// Helper function for highlighting diffs - copied here for local use
const generateHighlightedDiff = (originalText, amendedText, isAmendmentOfAmendment = false) => {
    const orig = String(originalText || '');
    const amnd = String(amendedText || '');

    const originalLines = orig.split('\n');
    const amendedLines = amnd.split('\n');

    const finalRender = [];
    const originalLineSet = new Set(originalLines);
    const amendedLineSet = new Set(amendedLines);

    const processedOriginalLines = new Set();
    const processedAmendedLines = new Set();

    for (let i = 0; i < amendedLines.length; i++) {
        const currentAmendedLine = amendedLines[i];
        const isUnchanged = originalLineSet.has(currentAmendedLine) && !processedOriginalLines.has(currentAmendedLine);

        if (isUnchanged) {
            finalRender.push(<span key={`unchanged-${i}`} className="text-gray-700">{currentAmendedLine}<br/></span>);
            processedOriginalLines.add(currentAmendedLine);
            processedAmendedLines.add(currentAmendedLine);
        } else if (!originalLineSet.has(currentAmendedLine)) {
            const colorClass = isAmendmentOfAmendment ? 'text-green-600' : 'text-blue-600';
            finalRender.push(<span key={`added-${i}`} className={colorClass}>{currentAmendedLine}<br/></span>);
            processedAmendedLines.add(currentAmendedLine);
        }
    }

    for (let i = 0; i < originalLines.length; i++) {
        const currentOriginalLine = originalLines[i];
        if (!amendedLineSet.has(currentOriginalLine) && !processedOriginalLines.has(currentOriginalLine)) {
            const colorClass = isAmendmentOfAmendment ? 'text-orange-600 line-through' : 'text-red-600 line-through';
            finalRender.push(<span key={`removed-${i}`} className={colorClass}>{currentOriginalLine}<br/></span>);
            processedOriginalLines.add(currentOriginalLine);
        }
    }
    return finalRender;
};


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

export default AmendmentForm;

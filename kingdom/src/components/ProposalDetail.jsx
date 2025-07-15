import React, { useState, useEffect, useContext } from 'react';
import { FirebaseContext } from '../App'; // Adjust path
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore'; // Import necessary functions
import AmendmentForm from './AmendmentForm'; // Adjust path

// Helper function for highlighting diffs - moved here for local use
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


const ProposalDetail = ({ proposalId, onBackToDashboard, userProvince }) => {
    const { db, appId, provinces } = useContext(FirebaseContext); // Access provinces from context
    const [proposal, setProposal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showAmendmentForm, setShowAmendmentForm] = useState(false);
    const [message, setMessage] = useState('');

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
                const currentVoteCounts = calculateWeightedVotes(currentProposal.votes || {}, provinces);
                const newStatus = currentVoteCounts.aye > currentVoteCounts.nay ? 'passed' : 'failed';
                await updateDoc(proposalDocRef, { status: newStatus });
                setMessage('Voting has closed for this proposal.');
                return;
            } else if (currentProposal.status !== 'active') {
                setMessage(`Voting is already closed. Status: ${currentProposal.status}`);
                return;
            }

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
        if (!db || !proposal || userProvince !== 'Capital') return;

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

            const currentVoteCounts = calculateWeightedVotes(currentProposal.votes || {}, provinces);
            const totalVoteWeight = provinces.reduce((sum, p) => sum + p.voteWeight, 0);

            const supermajorityThreshold = 0.60 * totalVoteWeight;
            if (currentVoteCounts.aye >= supermajorityThreshold) {
                await updateDoc(proposalDocRef, {
                    status: 'passedEarly',
                    expiryDate: new Date().toISOString(),
                });
                setMessage('Voting ended early! Proposal PASSED with supermajority.');
            } else {
                await updateDoc(proposalDocRef, {
                    status: 'failedEarly',
                    expiryDate: new Date().toISOString(),
                });
                setMessage('Voting ended early! Proposal FAILED (no supermajority).');
            }

        } catch (e) {
            console.error("Error ending voting early:", e);
            setMessage("Failed to end voting early. Please try again.");
        }
    };

    const handleWithdrawProposal = async () => {
        if (!db || !proposal || userProvince !== proposal.proposerProvince) {
            setMessage('You can only withdraw proposals you have proposed.');
            return;
        }

        setMessage('');
        try {
            const proposalDocRef = doc(db, `artifacts/${appId}/public/data/proposals`, proposal.id);
            await updateDoc(proposalDocRef, {
                status: 'withdrawn',
                expiryDate: new Date().toISOString() // Mark as expired immediately
            });
            setMessage('Proposal withdrawn successfully.');
            onBackToDashboard(); // Go back to dashboard after withdrawing
        } catch (e) {
            console.error("Error withdrawing proposal:", e);
            setMessage("Failed to withdraw proposal. Please try again.");
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
    const canWithdraw = userProvince === proposal.proposerProvince && proposal.status === 'active';


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
                                <span className="font-semibold">Status:</span> {proposal.status.toUpperCase()}
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
                                        .filter(p => p.name !== "Administrator")
                                        .map((p) => (
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
                                    proposal.changes
                                }
                            </div>
                        </div>

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

                        {canWithdraw && (
                            <div className="text-center mt-4">
                                <button
                                    onClick={handleWithdrawProposal}
                                    className="bg-gray-700 hover:bg-gray-800 text-white font-bold py-3 px-8 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105"
                                >
                                    Withdraw Proposal
                                </button>
                            </div>
                        )}

                        {isVotingActive && (
                            <div className="text-center mt-4">
                                <button
                                    onClick={() => setShowAmendmentForm(true)}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105"
                                    disabled={proposal.amendment && proposal.amendment.amendmentOfAmendment}
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

export default ProposalDetail;

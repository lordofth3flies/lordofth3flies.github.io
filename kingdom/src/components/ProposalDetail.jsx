import React, { useState, useEffect, useContext } from 'react';
import { FirebaseContext } from '../App'; // Adjust path
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore'; // Import necessary functions
import AmendmentForm from './AmendmentForm'; // Adjust path
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'; // Import Recharts components

// Helper function for highlighting text diffs (for law proposals)
const generateHighlightedTextDiff = (originalText, amendedText, isAmendmentOfAmendment = false) => {
    const orig = String(originalText || '');
    const amnd = String(amendedText || '');

    const originalLines = orig.split('\n');
    const amendedLines = amnd.split('\n');

    const finalRender = [];

    // This is a simplified diff. For robust, complex diffs (e.g., character-level, reordering),
    // a dedicated diffing library (like diff-match-patch) would be necessary.
    // This version focuses on clearly showing line additions and deletions.

    const tempOriginalLines = [...originalLines]; // Create a mutable copy

    for (let i = 0; i < amendedLines.length; i++) {
        const amendedLine = amendedLines[i];
        const originalIndex = tempOriginalLines.indexOf(amendedLine);

        if (originalIndex !== -1) {
            // Line exists in both and hasn't been "consumed" yet from original
            // Add any removed lines that appeared before this matched line in the original
            for (let j = 0; j < originalIndex; j++) {
                if (tempOriginalLines[j] !== null) { // If not already matched
                    const colorClass = isAmendmentOfAmendment ? 'text-orange-600 line-through' : 'text-red-600 line-through';
                    finalRender.push(<span key={`removed-${j}-${i}`} className={colorClass}>{tempOriginalLines[j]}<br/></span>);
                }
            }
            // Add the unchanged line
            finalRender.push(<span key={`unchanged-${i}`} className="text-gray-700">{amendedLine}<br/></span>);
            tempOriginalLines.splice(0, originalIndex + 1, ...Array(originalIndex + 1).fill(null)); // Mark consumed
        } else {
            // Line is new (added)
            const colorClass = isAmendmentOfAmendment ? 'text-green-600' : 'text-blue-600';
            finalRender.push(<span key={`added-${i}`} className={colorClass}>{amendedLine}<br/></span>);
        }
    }

    // After iterating through all amended lines, add any remaining original lines as removed
    tempOriginalLines.forEach((line, index) => {
        if (line !== null) {
            const colorClass = isAmendmentOfAmendment ? 'text-orange-600 line-through' : 'text-red-600 line-through';
            finalRender.push(<span key={`final-removed-${index}`} className={colorClass}>{line}<br/></span>);
        }
    });

    return finalRender;
};

// Define a set of colors for the pie chart slices (duplicated for self-containment)
const PIE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#d0ed57', '#a4de6c', '#83a6ed'];


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
                // Update votes directly on the amendment object within the main proposal document
                const updatedAmendment = { ...currentProposal.amendment };
                const newAmendmentVotes = { ...updatedAmendment.votes, [userProvince]: voteType };
                const newAmendmentVoteCounts = calculateWeightedVotes(newAmendmentVotes, provinces);

                updatedAmendment.votes = newAmendmentVotes;
                updatedAmendment.voteCounts = newAmendmentVoteCounts;

                await updateDoc(proposalDocRef, {
                    amendment: updatedAmendment // Update the entire amendment object
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
                expiryDate: new Date().toISOString()
            });
            setMessage('Proposal withdrawn successfully.');
            onBackToDashboard();
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

    // Determine which votes and vote counts to display
    const currentVotes = proposal.amendment && proposal.amendment.status === 'active'
        ? proposal.amendment.votes || {}
        : proposal.votes || {};

    const currentVoteCounts = proposal.amendment && proposal.amendment.status === 'active'
        ? proposal.amendment.voteCounts || { aye: 0, nay: 0, present: 0 }
        : proposal.voteCounts || { aye: 0, nay: 0, present: 0 };

    let amendmentIndicator = null;
    let isAmendmentOfAmendment = false;
    // Removed unused 'amendmentProposer' variable from declaration

    if (proposal.amendment && proposal.amendment.status === 'active') {
        amendmentIndicator = (
            <p className="text-center text-lg font-bold text-orange-600 mb-4 animate-pulse">
                VOTING ON AMENDMENT
            </p>
        );
        if (proposal.amendment.amendmentOfAmendment) {
            isAmendmentOfAmendment = true;
        }
        // amendmentProposer is now used directly in JSX if needed, not as a separate variable
    }

    const isVotingActive = new Date(proposal.expiryDate).getTime() > new Date().getTime() && proposal.status === 'active';
    const canKingEndEarly = userProvince === 'Capital' && isVotingActive;
    const canWithdraw = userProvince === proposal.proposerProvince && proposal.status === 'active';

    // Helper to render budget details
    const renderBudgetDetails = () => {
        // Use amended line items if an amendment is active, otherwise use original
        const displayedLineItems = proposal.amendment && proposal.amendment.status === 'active' && proposal.amendment.amendedLineItems
            ? proposal.amendment.amendedLineItems
            : proposal.lineItems;

        const originalLineItemsForDiff = proposal.amendment && proposal.amendment.status === 'active' && proposal.amendment.originalLineItems
            ? proposal.amendment.originalLineItems
            : proposal.lineItems;

        const pieChartData = displayedLineItems ? displayedLineItems.map(item => ({
            name: item.title,
            value: parseFloat(item.amount)
        })) : [];

        // Function to generate diff for budget line items (simplified for display here)
        const generateBudgetLineItemDiffDisplay = (originalItems, amendedItems, isAmendmentOfAmendment) => {
            const diffRender = [];
            const originalMap = new Map();
            originalItems.forEach((item, index) => originalMap.set(item.title, { ...item, originalIndex: index }));
            const amendedMap = new Map();
            amendedItems.forEach((item, index) => amendedMap.set(item.title, { ...item, amendedIndex: index }));

            const processedOriginalTitles = new Set();

            // First, process amended items to find added or modified items
            amendedItems.forEach((amendedItem, index) => {
                const originalItem = originalMap.get(amendedItem.title);
                if (originalItem) {
                    processedOriginalTitles.add(originalItem.title); // Mark this original item as processed

                    if (parseFloat(originalItem.amount) !== parseFloat(amendedItem.amount) || originalItem.description !== amendedItem.description) {
                        // Modified item (amount or description changed)
                        const colorClass = isAmendmentOfAmendment ? 'text-green-600' : 'text-blue-600';
                        diffRender.push(
                            <li key={`modified-${index}`} className={`text-sm ${colorClass}`}>
                                <span className="font-medium">{amendedItem.title}:</span> <span className="line-through text-red-500">${parseFloat(originalItem.amount).toLocaleString()}</span> &rarr; ${parseFloat(amendedItem.amount).toLocaleString()} - {amendedItem.description} (Modified)
                            </li>
                        );
                    } else {
                        // Unchanged item
                        diffRender.push(
                            <li key={`unchanged-${index}`} className="text-sm text-gray-700">
                                <span className="font-medium">{amendedItem.title}:</span> ${parseFloat(amendedItem.amount).toLocaleString()} - {amendedItem.description}
                            </li>
                        );
                    }
                } else {
                    // Added item
                    const colorClass = isAmendmentOfAmendment ? 'text-green-600' : 'text-blue-600';
                    diffRender.push(
                        <li key={`added-${index}`} className={`text-sm ${colorClass}`}>
                            <span className="font-medium">{amendedItem.title}:</span> ${parseFloat(amendedItem.amount).toLocaleString()} - {amendedItem.description} (Added)
                        </li>
                    );
                }
            });

            // Check for removed items
            originalItems.forEach((originalItem, index) => {
                if (!processedOriginalTitles.has(originalItem.title)) {
                    // Removed item
                    const colorClass = isAmendmentOfAmendment ? 'text-orange-600 line-through' : 'text-red-600 line-through';
                    diffRender.push(
                        <li key={`removed-${index}`} className={`text-sm ${colorClass}`}>
                            <span className="font-medium">{originalItem.title}:</span> ${parseFloat(originalItem.amount).toLocaleString()} - {originalItem.description} (Removed)
                        </li>
                    );
                }
            });

            // Note: This simplified diff does not guarantee exact original order for combined output
            // if lines were heavily reordered. It prioritizes showing all changes clearly.
            return diffRender;
        };


        return (
            <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-inner mb-6">
                <p className="text-gray-700 text-sm mb-2">
                    <span className="font-semibold">Budget Type:</span> {proposal.budgetType}
                </p>
                <p className="text-gray-700 text-sm mb-2">
                    <span className="font-semibold">Total Amount:</span> ${parseFloat(proposal.totalAmount).toLocaleString()}
                </p>
                <p className="text-gray-700 text-sm mb-4">
                    <span className="font-semibold">Purpose:</span> {proposal.budgetPurpose}
                </p>
                <h4 className="text-md font-semibold text-gray-800 mb-2">Line Items:</h4>
                {proposal.amendment && proposal.amendment.status === 'active' ? (
                    <ul className="list-disc list-inside ml-4 mb-4">
                        {generateBudgetLineItemDiffDisplay(
                            originalLineItemsForDiff,
                            displayedLineItems,
                            isAmendmentOfAmendment
                        )}
                    </ul>
                ) : (
                    proposal.lineItems && proposal.lineItems.length > 0 ? (
                        <ul className="list-disc list-inside ml-4 mb-4">
                            {proposal.lineItems.map((item, index) => (
                                <li key={index} className="text-sm text-gray-700">
                                    <span className="font-medium">{item.title}:</span> ${parseFloat(item.amount).toLocaleString()} - {item.description}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-gray-500 mb-4">No line items specified.</p>
                    )
                )}


                {/* Pie Chart for Line Items */}
                {pieChartData.length > 0 && pieChartData.some(data => data.value > 0) && (
                    <div className="mt-6 mb-6">
                        <h4 className="text-md font-bold text-gray-800 mb-2 text-center">Line Item Distribution</h4>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={pieChartData}
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                    labelLine={false}
                                >
                                    {pieChartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                )}

                <p className="text-gray-700 mt-4">
                    <span className="font-semibold">Justification:</span>
                    {proposal.amendment && proposal.amendment.status === 'active' && proposal.amendment.amendedJustification ?
                        generateHighlightedTextDiff(proposal.justification, proposal.amendment.amendedJustification, isAmendmentOfAmendment) :
                        proposal.justification
                    }
                </p>
            </div>
        );
    };

    // Helper to render law details
    const renderLawDetails = () => (
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
                    generateHighlightedTextDiff(proposal.changes, proposal.amendment.amendedText, isAmendmentOfAmendment) :
                    proposal.changes
                }
            </div>
        </div>
    );


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
                            {proposal.amendment && proposal.amendment.status === 'active' && (
                                <p className="text-gray-700 text-sm mb-2">
                                    <span className="font-semibold">Amendment Proposed By:</span> {proposal.amendment.proposerProvince}
                                </p>
                            )}
                            <p className="text-gray-700 text-sm mb-2">
                                <span className="font-semibold">Date Proposed:</span> {new Date(proposal.dateCreated).toLocaleDateString()}</p>
                            <p className="text-gray-700 text-sm">
                                <span className="font-semibold">Voting Ends:</span> {new Date(proposal.expiryDate).toLocaleString()}
                            </p>
                            <p className="text-gray-700 text-sm">
                                <span className="font-semibold">Status:</span> {proposal.status.toUpperCase()}
                            </p>
                            {proposal.type && (
                                <p className="text-gray-700 text-sm">
                                    <span className="font-semibold">Type:</span> {proposal.type.toUpperCase()}
                                </p>
                            )}
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
                        {/* Conditionally render details based on proposal type */}
                        {proposal.type === 'budget' ? renderBudgetDetails() : renderLawDetails()}

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

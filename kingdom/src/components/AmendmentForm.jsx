import React, { useState, useContext } from 'react';
import { FirebaseContext } from '../App'; // Adjust path
import { doc, getDoc, updateDoc } from 'firebase/firestore'; // Import necessary functions
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'; // Removed Legend from import as it's not directly used in this component.

// Define a set of colors for the pie chart slices
const PIE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#d0ed57', '#a4de6c', '#83a6ed'];

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

// Helper function for highlighting budget line item diffs
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

    // Second, process original items to find removed items
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


const AmendmentForm = ({ proposal, onClose, userProvince, onAmendmentSubmitted }) => {
    const { db, appId } = useContext(FirebaseContext);
    // State for law proposal text
    const [amendedText, setAmendedText] = useState(proposal.amendment?.amendedText || proposal.changes);
    // State for budget proposal line items
    const [amendedLineItems, setAmendedLineItems] = useState(
        proposal.type === 'budget' ?
        (proposal.amendment?.amendedLineItems || proposal.lineItems || []) :
        []
    );
    const [amendedJustification, setAmendedJustification] = useState(
        proposal.type === 'budget' ?
        (proposal.amendment?.amendedJustification || proposal.justification || '') :
        ''
    );

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const isAmendmentOfAmendment = proposal.amendment && proposal.amendment.status === 'active' && proposal.amendment.amendmentOfAmendment;

    const handleAddLineItem = () => {
        setAmendedLineItems([...amendedLineItems, { title: '', amount: '', description: '' }]);
    };

    const handleRemoveLineItem = (index) => {
        const newLineItems = amendedLineItems.filter((_, i) => i !== index);
        setAmendedLineItems(newLineItems.length > 0 ? newLineItems : [{ title: '', amount: '', description: '' }]);
    };

    const handleLineItemChange = (index, field, value) => {
        const newLineItems = [...amendedLineItems];
        newLineItems[index][field] = value;
        setAmendedLineItems(newLineItems);
    };

    const validateBudgetAmendment = () => {
        if (!amendedJustification.trim()) {
            setError('Justification is required.');
            return false;
        }
        if (amendedLineItems.some(item => !item.title.trim() || isNaN(parseFloat(item.amount)) || parseFloat(item.amount) <= 0 || !item.description.trim() || item.description.length > 100)) {
            setError('All line items must have a title, a positive amount, and a description (max 100 characters).');
            return false;
        }
        setError('');
        return true;
    };


    const handleSubmitAmendment = async () => {
        if (proposal.type === 'budget' && !validateBudgetAmendment()) return;
        if (proposal.type === 'law' && !amendedText.trim()) { // Basic validation for law amendment
            setError("Amendment text cannot be empty.");
            return;
        }

        if (!db || !appId) {
            setError("Database not initialized.");
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

            let newAmendmentData = {};
            let originalContentForDiff = {}; // Content to compare against

            if (proposal.type === 'law') {
                originalContentForDiff = currentProposalData.amendment && currentProposalData.amendment.status === 'active'
                    ? currentProposalData.amendment.amendedText
                    : currentProposalData.changes;

                newAmendmentData = {
                    amendedText: amendedText,
                    originalText: originalContentForDiff,
                };
            } else if (proposal.type === 'budget') {
                originalContentForDiff = currentProposalData.amendment && currentProposalData.amendment.status === 'active'
                    ? currentProposalData.amendment.amendedLineItems
                    : proposal.lineItems;

                newAmendmentData = {
                    amendedLineItems: amendedLineItems.map(item => ({ // Ensure data is clean
                        title: item.title.trim(),
                        amount: parseFloat(item.amount),
                        description: item.description.trim()
                    })),
                    amendedJustification: amendedJustification.trim(),
                    originalLineItems: originalContentForDiff,
                    originalJustification: currentProposalData.amendment && currentProposalData.amendment.status === 'active'
                        ? currentProposalData.amendment.amendedJustification
                        : proposal.justification,
                };
            }

            const baseAmendmentFields = {
                id: crypto.randomUUID(),
                originalProposalId: proposal.id,
                proposerProvince: userProvince,
                dateCreated: new Date().toISOString(),
                expiryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                votes: {},
                voteCounts: { aye: 0, nay: 0, present: 0 },
                status: 'active',
                amendmentOfAmendment: currentProposalData.amendment && currentProposalData.amendment.status === 'active'
            };

            await updateDoc(proposalDocRef, {
                amendment: { ...baseAmendmentFields, ...newAmendmentData },
                votes: {}, // Reset main proposal votes when an amendment is active
                voteCounts: { aye: 0, nay: 0, present: 0 } // Reset main proposal vote counts
            });

            setLoading(false);
            onAmendmentSubmitted();
        } catch (e) {
            console.error("Error submitting amendment:", e);
            setError("Failed to submit amendment. Please try again.");
            setLoading(false);
        }
    };

    const renderLawAmendmentForm = () => (
        <>
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
                {generateHighlightedTextDiff(
                    isAmendmentOfAmendment ? proposal.amendment.amendedText : proposal.changes,
                    amendedText,
                    isAmendmentOfAmendment
                )}
            </div>
        </>
    );

    const renderBudgetAmendmentForm = () => {
        const originalLineItemsForPreview = proposal.amendment && proposal.amendment.status === 'active' && proposal.amendment.originalLineItems
            ? proposal.amendment.originalLineItems
            : proposal.lineItems;

        const originalJustificationForPreview = proposal.amendment && proposal.amendment.status === 'active' && proposal.amendment.originalJustification
            ? proposal.amendment.originalJustification
            : proposal.justification;

        const originalPieChartData = originalLineItemsForPreview.map(item => ({
            name: item.title,
            value: parseFloat(item.amount)
        }));

        const amendedPieChartData = amendedLineItems.map(item => ({
            name: item.title,
            value: parseFloat(item.amount)
        }));

        return (
            <>
                <p className="text-gray-700 text-sm mb-2">
                    Original Justification:
                </p>
                <div className="bg-gray-100 p-4 rounded-lg border border-gray-300 mb-4 max-h-24 overflow-y-auto whitespace-pre-wrap text-gray-600 font-mono">
                    {originalJustificationForPreview}
                </div>

                <p className="text-gray-700 text-sm mb-2">
                    Edit Justification:
                </p>
                <textarea
                    rows="4"
                    className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono mb-4"
                    value={amendedJustification}
                    onChange={(e) => setAmendedJustification(e.target.value)}
                    placeholder="Edit justification for the budget proposal."
                ></textarea>

                <div className="mb-6">
                    <label className="block text-gray-700 text-sm font-semibold mb-2">
                        Edit Line Items:
                    </label>
                    <div className="max-h-48 overflow-y-auto pr-2"> {/* Added max-height and overflow for line items */}
                        {amendedLineItems.map((item, index) => (
                            <div key={index} className="flex flex-col md:flex-row gap-2 mb-3 p-2 border rounded-xl bg-gray-50">
                                <input
                                    type="text"
                                    className="shadow appearance-none border rounded-xl py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
                                    value={item.title}
                                    onChange={(e) => handleLineItemChange(index, 'title', e.target.value)}
                                    placeholder="Item Title"
                                />
                                <input
                                    type="number"
                                    step="0.01"
                                    className="shadow appearance-none border rounded-xl py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 w-24"
                                    value={item.amount}
                                    onChange={(e) => handleLineItemChange(index, 'amount', e.target.value)}
                                    placeholder="Amount"
                                />
                                <textarea
                                    rows="1"
                                    className="shadow appearance-none border rounded-xl py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 flex-2"
                                    value={item.description}
                                    onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                                    placeholder="Description (max 100 chars)"
                                    maxLength="100"
                                ></textarea>
                                {amendedLineItems.length > 1 && (
                                    <button
                                        onClick={() => handleRemoveLineItem(index)}
                                        className="text-red-500 hover:text-red-700 text-2xl px-2"
                                        title="Remove line item"
                                    >
                                        &times;
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={handleAddLineItem}
                        className="mt-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-1 px-3 rounded-xl text-sm transition duration-200"
                    >
                        Add Line Item
                    </button>
                </div>

                <h3 className="text-lg font-semibold text-gray-800 mb-2">Amendment Preview:</h3>
                <div className="bg-white p-4 rounded-lg border border-gray-300 whitespace-pre-wrap text-gray-700 font-mono mb-6">
                    <h4 className="text-md font-bold text-gray-800 mb-2">Line Item Changes:</h4>
                    <ul className="list-disc list-inside ml-4 mb-4">
                        {generateBudgetLineItemDiffDisplay(
                            originalLineItemsForPreview,
                            amendedLineItems,
                            isAmendmentOfAmendment
                        )}
                    </ul>
                    <h4 className="text-md font-bold text-gray-800 mb-2">Justification Changes:</h4>
                    <p className="whitespace-pre-wrap">
                        {generateHighlightedTextDiff(
                            originalJustificationForPreview,
                            amendedJustification,
                            isAmendmentOfAmendment
                        )}
                    </p>
                </div>

                {/* Before and After Pie Charts */}
                <div className="flex flex-col md:flex-row justify-around items-center mt-6 mb-6 gap-4">
                    {originalPieChartData.length > 0 && originalPieChartData.some(data => data.value > 0) && (
                        <div className="text-center">
                            <h4 className="text-md font-bold text-gray-800 mb-2">Original Distribution</h4>
                            <ResponsiveContainer width={200} height={200}>
                                <PieChart>
                                    <Pie
                                        data={originalPieChartData}
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={80}
                                        dataKey="value"
                                        labelLine={false}
                                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                    >
                                        {originalPieChartData.map((entry, index) => (
                                            <Cell key={`orig-cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                    {amendedPieChartData.length > 0 && amendedPieChartData.some(data => data.value > 0) && (
                        <div className="text-center">
                            <h4 className="text-md font-bold text-gray-800 mb-2">Amended Distribution</h4>
                            <ResponsiveContainer width={200} height={200}>
                                <PieChart>
                                    <Pie
                                        data={amendedPieChartData}
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={80}
                                        dataKey="value"
                                        labelLine={false}
                                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                    >
                                        {amendedPieChartData.map((entry, index) => (
                                            <Cell key={`amend-cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
                { (originalPieChartData.length === 0 || !originalPieChartData.some(data => data.value > 0)) &&
                  (amendedPieChartData.length === 0 || !amendedPieChartData.some(data => data.value > 0)) &&
                  <p className="text-sm text-gray-500 text-center">No valid line item amounts to display charts.</p>
                }
            </>
        );
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

                {/* Added a scrollable container for the form content */}
                <div className="max-h-[calc(100vh-200px)] overflow-y-auto pr-4 mb-4"> {/* Adjust max-h as needed */}
                    {proposal.type === 'law' ? renderLawAmendmentForm() : renderBudgetAmendmentForm()}
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

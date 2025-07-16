import React, { useState, useContext } from 'react';
import { FirebaseContext } from '../App'; // Adjust path
import { collection, addDoc, getDocs } from 'firebase/firestore'; // Import necessary functions
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'; // Import Recharts components

const CreateBudgetProposal = ({ onBackToDashboard, userProvince }) => {
    const { db, appId } = useContext(FirebaseContext);
    const [budgetType, setBudgetType] = useState('');
    const [totalAmount, setTotalAmount] = useState('');
    const [budgetPurpose, setBudgetPurpose] = useState('');
    const [lineItems, setLineItems] = useState([{ title: '', amount: '', description: '' }]);
    const [justification, setJustification] = useState('');
    const [showPreview, setShowPreview] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Define a set of colors for the pie chart slices
    const PIE_COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#d0ed57', '#a4de6c', '#83a6ed'];

    const handleAddLineItem = () => {
        setLineItems([...lineItems, { title: '', amount: '', description: '' }]);
    };

    const handleRemoveLineItem = (index) => {
        const newLineItems = lineItems.filter((_, i) => i !== index);
        setLineItems(newLineItems.length > 0 ? newLineItems : [{ title: '', amount: '', description: '' }]);
    };

    const handleLineItemChange = (index, field, value) => {
        const newLineItems = [...lineItems];
        newLineItems[index][field] = value;
        setLineItems(newLineItems);
    };

    const validateForm = () => {
        if (!budgetType || !totalAmount || !budgetPurpose.trim() || !justification.trim()) {
            setError('Budget Type, Total Amount, Purpose, and Justification are required.');
            return false;
        }
        if (isNaN(parseFloat(totalAmount)) || parseFloat(totalAmount) <= 0) {
            setError('Total Amount must be a positive number.');
            return false;
        }
        if (lineItems.some(item => !item.title.trim() || isNaN(parseFloat(item.amount)) || parseFloat(item.amount) <= 0 || !item.description.trim() || item.description.length > 100)) {
            setError('All line items must have a title, a positive amount, and a description (max 100 characters).');
            return false;
        }
        setError('');
        return true;
    };

    const handleSubmitBudgetProposal = async () => {
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
                type: 'budget', // Mark as budget proposal
                budgetType,
                totalAmount: parseFloat(totalAmount),
                budgetPurpose,
                lineItems: lineItems.map(item => ({
                    title: item.title.trim(),
                    amount: parseFloat(item.amount),
                    description: item.description.trim()
                })),
                justification,
                title: `Budget for ${budgetType} - #${nextLegislationNumber}`, // Auto-generated title for card
                purpose: budgetPurpose.substring(0, 150) + (budgetPurpose.length > 150 ? '...' : ''), // Synopsis for card
                synopsis: budgetPurpose.substring(0, 150) + (budgetPurpose.length > 150 ? '...' : ''), // Synopsis for card
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
            console.log("Budget Proposal submitted successfully!");
            setLoading(false);
            onBackToDashboard();
        } catch (e) {
            console.error("Error adding budget proposal document: ", e);
            setError("Failed to submit budget proposal. Please try again.");
            setLoading(false);
        }
    };

    const BudgetProposalPreview = () => {
        // Prepare data for the pie chart
        const pieChartData = lineItems.map(item => ({
            name: item.title,
            value: parseFloat(item.amount)
        }));

        return (
            <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 shadow-inner">
                <h3 className="text-xl font-bold text-center text-gray-800 mb-4">Budget Proposal Preview</h3>
                <p className="text-gray-700 mb-2">
                    <span className="font-semibold">Budget Type:</span> {budgetType}
                </p>
                <p className="text-gray-700 mb-2">
                    <span className="font-semibold">Total Amount:</span> ${parseFloat(totalAmount).toLocaleString()}
                </p>
                <p className="text-gray-700 mb-4">
                    <span className="font-semibold">Purpose:</span> {budgetPurpose}
                </p>
                <h4 className="text-md font-bold text-gray-800 mb-2">Line Items:</h4>
                {lineItems.length > 0 ? (
                    <ul className="list-disc list-inside ml-4 mb-4">
                        {lineItems.map((item, index) => (
                            <li key={index} className="text-sm text-gray-700">
                                <span className="font-medium">{item.title}:</span> ${parseFloat(item.amount).toLocaleString()} - {item.description}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-gray-500 mb-4">No line items specified.</p>
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
                                    labelLine={false} // Hide the line connecting label to slice
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
                    <span className="font-semibold">Justification:</span> {justification}
                </p>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-100 p-6 font-inter">
            <div className="max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-lg">
                <h2 className="text-3xl font-bold text-center text-gray-800 mb-8">Create New Budget Proposal</h2>

                {error && <p className="text-red-500 text-center mb-4">{error}</p>}

                <div className="mb-4">
                    <label htmlFor="budget-type" className="block text-gray-700 text-sm font-semibold mb-2">
                        Budget Type:
                    </label>
                    <select
                        id="budget-type"
                        className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={budgetType}
                        onChange={(e) => setBudgetType(e.target.value)}
                    >
                        <option value="">-- Select Budget Type --</option>
                        <option value="King's Budget">King's Budget</option>
                        <option value="Council Budget">Council Budget</option>
                    </select>
                </div>

                <div className="mb-4">
                    <label htmlFor="total-amount" className="block text-gray-700 text-sm font-semibold mb-2">
                        Total Amount:
                    </label>
                    <input
                        type="number"
                        id="total-amount"
                        className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={totalAmount}
                        onChange={(e) => setTotalAmount(e.target.value)}
                        placeholder="e.g., 10000"
                    />
                </div>

                <div className="mb-6">
                    <label htmlFor="budget-purpose" className="block text-gray-700 text-sm font-semibold mb-2">
                        Purpose of Allocation:
                    </label>
                    <textarea
                        id="budget-purpose"
                        rows="3"
                        className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={budgetPurpose}
                        onChange={(e) => setBudgetPurpose(e.target.value)}
                        placeholder="Briefly state the main goal or reason for this budget allocation."
                    ></textarea>
                </div>

                <div className="mb-6">
                    <label className="block text-gray-700 text-sm font-semibold mb-2">
                        Line Items:
                    </label>
                    {lineItems.map((item, index) => (
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
                            {lineItems.length > 1 && (
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
                    <button
                        onClick={handleAddLineItem}
                        className="mt-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-1 px-3 rounded-xl text-sm transition duration-200"
                    >
                        Add Line Item
                    </button>
                </div>

                <div className="mb-6">
                    <label htmlFor="justification" className="block text-gray-700 text-sm font-semibold mb-2">
                        Justification/Explanation:
                    </label>
                    <textarea
                        id="justification"
                        rows="6"
                        className="shadow appearance-none border rounded-xl w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        value={justification}
                        onChange={(e) => setJustification(e.target.value)}
                        placeholder="Provide any additional justification or explanation for this budget proposal."
                    ></textarea>
                </div>

                <div className="flex justify-between items-center mt-8">
                    <button
                        onClick={onBackToDashboard}
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
                        onClick={handleSubmitBudgetProposal}
                        className={`bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        disabled={loading}
                    >
                        {loading ? 'Submitting...' : 'Submit Budget Proposal'}
                    </button>
                </div>

                {showPreview && (
                    <div className="mt-8">
                        <h3 className="text-2xl font-bold text-gray-800 mb-4 text-center">Budget Proposal Document Preview</h3>
                        <BudgetProposalPreview />
                    </div>
                )}
            </div>
        </div>
    );
};

export default CreateBudgetProposal;

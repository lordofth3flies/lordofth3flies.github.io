import React from 'react';

const ProposalTypeSelectionModal = ({ onClose, onSelectLawProposal, onSelectBudgetProposal }) => {
    return (
        // The outer div acts as the modal overlay. Ensure it captures clicks and has a high z-index.
        <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            // Adding an onClick here to close the modal if clicking outside the inner content
            // This also helps confirm the overlay is interactive
            onClick={onClose}
        >
            {/* The inner modal content. Stop propagation to prevent clicking this from closing the modal */}
            <div
                className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md relative"
                onClick={(e) => e.stopPropagation()} // Prevent clicks inside the modal from closing it
            >
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 text-3xl font-bold"
                >
                    &times;
                </button>
                <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">Select Proposal Type</h2>

                <div className="flex flex-col space-y-4">
                    <button
                        onClick={onSelectLawProposal}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105"
                    >
                        Law Proposal
                    </button>
                    <button
                        onClick={onSelectBudgetProposal}
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl focus:outline-none focus:shadow-outline transition duration-200 ease-in-out transform hover:scale-105"
                    >
                        Budget Proposal
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProposalTypeSelectionModal;

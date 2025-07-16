import React, { useContext } from 'react';
import { FirebaseContext } from '../App'; // Adjust path

const ProposalCard = ({ proposal, statusInfo, onViewProposal }) => {
    const { provinces } = useContext(FirebaseContext); // Access provinces from context
    const { id, title, synopsis, proposerProvince, dateCreated, expiryDate, votes, status: proposalStatus, addedToLawBookDate, legislationNumber, isMandatory, type, budgetType } = proposal; // Added type and budgetType
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

    const getResult = () => {
        if (proposalStatus === 'passedEarly') return 'PASSED (Early)';
        if (proposalStatus === 'failedEarly') return 'FAILED (Early)';
        if (proposalStatus === 'passed') return 'PASSED';
        if (proposalStatus === 'failed') return 'FAILED';
        if (proposalStatus === 'withdrawn') return 'WITHDRAWN'; // Handle withdrawn status

        if (status !== 'expired' && status !== 'scribe-urgent' && status !== 'withdrawn' || !provinces) return null;

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

        if (ayeWeight > nayWeight) {
            return 'PASSED';
        } else if (nayWeight >= ayeWeight) {
            return 'FAILED';
        }
        return null;
    };

    const result = getResult();

    return (
        <div
            className={`p-4 border rounded-xl shadow-sm cursor-pointer transition duration-200 ease-in-out hover:shadow-md ${style} ${status === 'expired' || status === 'withdrawn' ? 'opacity-70' : ''} ${status === 'mandatory-active' ? 'relative pt-10' : ''}`}
            onClick={() => onViewProposal(id)}
        >
            {isMandatory && new Date(expiryDate).getTime() > new Date().getTime() && (
                <div className="absolute top-0 left-0 right-0 bg-red-600 text-white text-center text-xs font-bold py-1 rounded-t-xl z-10">
                    MANDATORY
                </div>
            )}
            <div className="flex justify-between items-start">
                <h3 className="text-lg font-bold mb-2">
                    {title}
                </h3>
                {legislationNumber && (
                    <span className="text-gray-500 text-sm font-semibold ml-2">#{legislationNumber}</span>
                )}
            </div>
            {type === 'budget' && budgetType && (
                <p className="text-xs text-gray-500 mb-1">Budget Type: <span className="font-semibold">{budgetType}</span></p>
            )}
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">{synopsis}</p>
            <div className="flex justify-between items-center text-xs">
                <div>
                    <p>Proposer: <span className="font-semibold">{proposerProvince}</span></p>
                    <p>Date: {new Date(dateCreated).toLocaleDateString()}</p>
                </div>
                {status !== 'expired' && status !== 'scribe-urgent' && status !== 'withdrawn' ? (
                    <p className="font-semibold">Time Left: {getTimeRemainingText}</p>
                ) : (
                    <div className="flex items-center space-x-2">
                        <p className={`font-bold ${result === 'PASSED' || result === 'PASSED (Early)' ? 'text-green-600' : result === 'FAILED' || result === 'FAILED (Early)' ? 'text-red-600' : result === 'WITHDRAWN' ? 'text-gray-600' : 'text-orange-600'}`}>
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

export default ProposalCard;

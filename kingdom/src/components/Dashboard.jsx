import React, { useState, useEffect, useContext } from 'react';
import { FirebaseContext } from '../App'; // Adjust path
import { collection, query, onSnapshot } from 'firebase/firestore';
import ProposalCard from './ProposalCard'; // Adjust path

const Dashboard = ({ userProvince, onCreateProposal, onViewProposal, onReviewPassedLaws, onModifyProvinces, isAdmin }) => {
    const { db, appId } = useContext(FirebaseContext);
    const [proposals, setProposals] = useState([]);
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'submitted'
    const [showOlderExpired, setShowOlderExpired] = useState(false); // State for collapsing older proposals

    useEffect(() => {
        if (!db || !appId) return;

        const proposalsCollectionRef = collection(db, `artifacts/${appId}/public/data/proposals`);
        const q = query(proposalsCollectionRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedProposals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort proposals by dateCreated, newest first
            fetchedProposals.sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));

            // Separate mandatory proposals and sort them to the top
            const mandatoryProposals = fetchedProposals.filter(p => p.isMandatory && new Date(p.expiryDate).getTime() > new Date().getTime());
            const otherProposals = fetchedProposals.filter(p => !(p.isMandatory && new Date(p.expiryDate).getTime() > new Date().getTime()));

            // Sort mandatory proposals by dateCreated (newest first)
            mandatoryProposals.sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));

            // Combine: mandatory proposals first, then others (already sorted by dateCreated)
            setProposals([...mandatoryProposals, ...otherProposals]);

        }, (error) => {
            console.error("Error fetching proposals:", error);
        });

        return () => unsubscribe();
    }, [db, appId]);

    // Function to determine proposal status and styling
    const getProposalStatus = (proposal) => {
        const now = new Date();
        const expiryDate = new Date(proposal.expiryDate);
        const timeRemaining = expiryDate.getTime() - now.getTime();
        const hasVoted = proposal.votes && proposal.votes[userProvince];

        // If it's a mandatory proposal and still active, give it the mandatory style
        if (proposal.isMandatory && timeRemaining > 0) {
            return { status: 'mandatory-active', style: 'bg-red-100 text-red-800 border-red-500 relative' };
        }
        
        // Handle withdrawn proposals
        if (proposal.status === 'withdrawn') {
            return { status: 'withdrawn', style: 'bg-gray-200 text-gray-600 border-gray-400' };
        }

        if (timeRemaining <= 0) {
            // Check for scribe's urgent laws (only if expired and not yet added)
            if (userProvince === 'Kobat' && (proposal.status === 'passed' || proposal.status === 'passedEarly') && !proposal.addedToLawBookDate) {
                const passedDate = new Date(proposal.expiryDate); // Assuming expiryDate is when it "passed"
                const timeSincePassed = now.getTime() - passedDate.getTime();
                if (timeSincePassed > 2 * 24 * 60 * 60 * 1000) { // More than 2 days since passed
                    return { status: 'scribe-urgent', style: 'bg-red-200 text-red-800 border-red-500 animate-pulse' };
                }
            }
            return { status: 'expired', style: 'bg-gray-300 text-gray-700' }; // Grayed out
        } else if (timeRemaining < 24 * 60 * 60 * 1000) { // Less than 24 hours remaining
            return { status: 'urgent', style: 'bg-red-200 text-red-800 border-red-500' }; // Red
        } else if (hasVoted) {
            return { status: 'voted', style: 'bg-yellow-200 text-yellow-800 border-yellow-500' }; // Yellow
        } else {
            return { status: 'active', style: 'bg-white text-gray-800 border-gray-200' }; // Default
        }
    };

    const filteredProposals = proposals.filter(proposal => {
        if (filterStatus === 'submitted') {
            return proposal.proposerProvince === userProvince;
        }
        return true;
    });

    // Separate proposals into categories for display
    const activeProposals = filteredProposals.filter(p => getProposalStatus(p).status === 'active' || getProposalStatus(p).status === 'mandatory-active' || getProposalStatus(p).status === 'urgent' || getProposalStatus(p).status === 'voted');
    
    // All expired and withdrawn proposals
    const allExpiredAndWithdrawn = filteredProposals.filter(p => 
        getProposalStatus(p).status === 'expired' || 
        p.status === 'passed' || 
        p.status === 'failed' || 
        p.status === 'passedEarly' || 
        p.status === 'failedEarly' || 
        p.status === 'scribe-urgent' ||
        p.status === 'withdrawn'
    );

    // Separate "older" expired proposals (older than 5 days from creation)
    const now = new Date();
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    const olderExpiredProposals = allExpiredAndWithdrawn.filter(p => {
        const createdDate = new Date(p.dateCreated);
        return createdDate < fiveDaysAgo;
    }).sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated)); // Sort newest first within older

    const recentExpiredProposals = allExpiredAndWithdrawn.filter(p => {
        const createdDate = new Date(p.dateCreated);
        return createdDate >= fiveDaysAgo;
    }).sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated)); // Sort newest first within recent


    return (
        <div className="min-h-screen bg-gray-100 p-6 font-inter">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-2xl font-bold text-gray-800">{userProvince}</h1>
                <div className="flex space-x-4">
                    {userProvince === 'Kobat' && (
                        <button
                            onClick={onReviewPassedLaws}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105"
                        >
                            Review Passed Laws
                        </button>
                    )}
                    {isAdmin && (
                         <button
                            onClick={onModifyProvinces}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105"
                        >
                            Modify Provinces
                        </button>
                    )}
                    <button
                        onClick={onCreateProposal} // This will now open the selection modal
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105"
                    >
                        Create Proposal
                    </button>
                    <button
                        onClick={() => {
                            window.location.reload(); // Simple full page reload for logout
                        }}
                        className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-xl shadow-md transition duration-200 ease-in-out transform hover:scale-105"
                    >
                        Logout
                    </button>
                </div>
                <div className="relative">
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="appearance-none bg-white border border-gray-300 text-gray-700 py-2 px-4 pr-8 rounded-xl leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="all">All Proposals</option>
                        <option value="submitted">My Submitted Proposals</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="col-span-1">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Expired Proposals</h2>
                    <div className="space-y-4">
                        {recentExpiredProposals.length === 0 && olderExpiredProposals.length === 0 && <p className="text-gray-500">No expired proposals.</p>}
                        {recentExpiredProposals.map(proposal => (
                            <ProposalCard
                                key={proposal.id}
                                proposal={proposal}
                                statusInfo={getProposalStatus(proposal)}
                                onViewProposal={onViewProposal}
                            />
                        ))}
                    </div>

                    {/* Collapsible "Older" section */}
                    {olderExpiredProposals.length > 0 && (
                        <div className="mt-6">
                            <button
                                onClick={() => setShowOlderExpired(!showOlderExpired)}
                                className="w-full text-left py-2 px-4 bg-gray-200 hover:bg-gray-300 rounded-xl font-semibold text-gray-700 flex justify-between items-center"
                            >
                                Older ({olderExpiredProposals.length})
                                <svg
                                    className={`w-4 h-4 transition-transform duration-300 ${showOlderExpired ? 'rotate-180' : ''}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                                </svg>
                            </button>
                            {showOlderExpired && (
                                <div className="space-y-4 mt-4">
                                    {olderExpiredProposals.map(proposal => (
                                        <ProposalCard
                                            key={proposal.id}
                                            proposal={proposal}
                                            statusInfo={getProposalStatus(proposal)}
                                            onViewProposal={onViewProposal}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="col-span-1">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Active Proposals</h2>
                    <div className="space-y-4">
                        {activeProposals.length === 0 && <p className="text-gray-500">No active proposals.</p>}
                        {activeProposals.map(proposal => (
                            <ProposalCard
                                key={proposal.id}
                                proposal={proposal}
                                statusInfo={getProposalStatus(proposal)}
                                onViewProposal={onViewProposal}
                            />
                        ))}
                    </div>
                </div>

                <div className="col-span-1">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Urgent & Voted Proposals</h2>
                    <div className="space-y-4">
                        {activeProposals.filter(p => getProposalStatus(p).status === 'urgent' || getProposalStatus(p).status === 'voted').length === 0 && <p className="text-gray-500">No urgent or voted proposals.</p>}
                        {activeProposals.filter(p => getProposalStatus(p).status === 'urgent').map(proposal => (
                            <ProposalCard
                                key={proposal.id}
                                proposal={proposal}
                                statusInfo={getProposalStatus(proposal)}
                                onViewProposal={onViewProposal}
                            />
                        ))}
                        {activeProposals.filter(p => getProposalStatus(p).status === 'voted').map(proposal => (
                            <ProposalCard
                                key={proposal.id}
                                proposal={proposal}
                                statusInfo={getProposalStatus(proposal)}
                                onViewProposal={onViewProposal}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;

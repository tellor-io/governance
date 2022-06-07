// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "./TellorFlex.sol";

/**
 @author Tellor Inc.
 @title Governance
 @dev This is a governance contract to be used with TellorFlex. It handles disputing
 * Tellor oracle data, proposing system parameter changes, and voting on those
 * disputes and proposals.
*/
contract Governance {
    // Storage
    TellorFlex public tellor; // Tellor oracle contract
    IERC20 public token; // token used for dispute fees, same as reporter staking token
    address public teamMultisig; // address of team multisig wallet, one of four stakeholder groups
    uint256 public voteCount; // total number of votes initiated
    uint256 public disputeFee; // dispute fee for a vote
    mapping(uint256 => Dispute) private disputeInfo; // mapping of dispute IDs to the details of the dispute
    mapping(bytes32 => uint256) private openDisputesOnId; // mapping of a query ID to the number of disputes on that query ID
    mapping(address => bool) private users; // mapping of users with voting power, determined by governance proposal votes
    mapping(uint256 => Vote) private voteInfo; // mapping of dispute IDs to the details of the vote
    mapping(bytes32 => uint256[]) private voteRounds; // mapping of vote identifier hashes to an array of dispute IDs
    mapping(address => uint256) private voteTallyByAddress; // mapping of addresses to the number of votes they have cast

    enum VoteResult {
        FAILED,
        PASSED,
        INVALID
    } // status of a potential vote

    // Structs
    struct Dispute {
        bytes32 queryId; // query ID of disputed value
        uint256 timestamp; // timestamp of disputed value
        bytes value; // disputed value
        address disputedReporter; // reporter who submitted the disputed value
        uint256 slashedAmount; // amount of tokens slashed from reporter
    }

    struct Tally {
        uint256 doesSupport; // number of votes in favor
        uint256 against; // number of votes against
        uint256 invalidQuery; // number of votes for invalid
    }

    struct Vote {
        bytes32 identifierHash; // identifier hash of the vote
        uint256 voteRound; // the round of voting on a given dispute or proposal
        uint256 startDate; // timestamp of when vote was initiated
        uint256 blockNumber; // block number of when vote was initiated
        uint256 fee; // fee paid to initiate the vote round
        uint256 tallyDate; // timestamp of when the votes were tallied
        Tally tokenholders; // vote tally of tokenholders
        Tally users; // vote tally of users
        Tally reporters; // vote tally of reporters
        Tally teamMultisig; // vote tally of teamMultisig
        bool executed; // boolean of whether the vote was executed
        VoteResult result; // VoteResult after votes were tallied
        bool isDispute; // boolean of whether the vote is a dispute as opposed to a proposal
        bytes data; // arguments used to execute a proposal
        bytes4 voteFunction; // hash of the function associated with a proposal vote
        address voteAddress; // address of contract to execute function on
        address initiator; // address which initiated dispute/proposal
        mapping(address => bool) voted; // mapping of address to whether or not they voted
    }

    // Events
    event NewDispute(
        uint256 _disputeId,
        bytes32 _queryId,
        uint256 _timestamp,
        address _reporter
    ); // Emitted when a new dispute is opened
    event NewVote(
        address _contract,
        bytes4 _function,
        bytes _data,
        uint256 _disputeId
    ); // Emitted when a new proposal vote is initiated
    event Voted(
        uint256 _disputeId,
        bool _supports,
        address _voter,
        bool _invalidQuery
    ); // Emitted when an address casts their vote
    event VoteExecuted(uint256 _disputeId, VoteResult _result); // Emitted when a vote is executed
    event VoteTallied(
        uint256 _disputeId,
        VoteResult _result,
        address _initiator,
        address _reporter
    ); // Emitted when all casting for a vote is tallied

    /**
     * @dev Initializes contract parameters
     * @param _tellor address of tellor oracle contract to be governed
     * @param _disputeFee base dispute fee
     * @param _teamMultisig address of tellor team multisig, one of four voting
     * stakeholder groups
     */
    constructor(
        address _tellor,
        uint256 _disputeFee,
        address _teamMultisig
    ) {
        tellor = TellorFlex(_tellor);
        token = tellor.token();
        disputeFee = _disputeFee;
        teamMultisig = _teamMultisig;
    }

    /**
     * @dev Helps initialize a dispute by assigning it a disputeId
     * @param _queryId being disputed
     * @param _timestamp being disputed
     */
    function beginDispute(bytes32 _queryId, uint256 _timestamp) external {
        // Ensure value actually exists
        require(
            tellor.getBlockNumberByTimestamp(_queryId, _timestamp) != 0,
            "no value exists at given timestamp"
        );
        bytes32 _hash = keccak256(abi.encodePacked(_queryId, _timestamp));
        // Increment vote count and push new vote round
        voteCount++;
        uint256 _disputeId = voteCount;
        voteRounds[_hash].push(_disputeId);
        // Check if dispute is started within correct time frame
        if (voteRounds[_hash].length > 1) {
            uint256 _prevId = voteRounds[_hash][voteRounds[_hash].length - 2];
            require(
                block.timestamp - voteInfo[_prevId].tallyDate < 1 days,
                "New dispute round must be started within a day"
            ); // Within a day for new round
        } else {
            require(
                block.timestamp - _timestamp < tellor.reportingLock(),
                "Dispute must be started within reporting lock time"
            ); // New dispute within reporting lock
            openDisputesOnId[_queryId]++;
        }
        // Create new vote and dispute
        Vote storage _thisVote = voteInfo[_disputeId];
        Dispute storage _thisDispute = disputeInfo[_disputeId];
        // Initialize dispute information - query ID, timestamp, value, etc.
        _thisDispute.queryId = _queryId;
        _thisDispute.timestamp = _timestamp;
        _thisDispute.value = tellor.retrieveData(_queryId, _timestamp);
        _thisDispute.disputedReporter = tellor.getReporterByTimestamp(
            _queryId,
            _timestamp
        );
        // Initialize vote information - hash, initiator, block number, etc.
        _thisVote.identifierHash = _hash;
        _thisVote.initiator = msg.sender;
        _thisVote.blockNumber = block.number;
        _thisVote.startDate = block.timestamp;
        _thisVote.voteRound = voteRounds[_hash].length;
        _thisVote.isDispute = true;
        // Calculate dispute fee based on number of current vote rounds
        uint256 _fee;
        if (voteRounds[_hash].length == 1) {
            _fee = disputeFee * 2**(openDisputesOnId[_queryId] - 1);
        } else {
            _fee = disputeFee * 2**(voteRounds[_hash].length - 1);
        }
        if (_fee > tellor.stakeAmount()) {
          _fee = tellor.stakeAmount();
        }
        _thisVote.fee = _fee;
        _thisVote.fee = _fee;
        require(
            token.transferFrom(msg.sender, address(this), _fee),
            "Fee must be paid"
        ); // This is the dispute fee. Returned if dispute passes
        if (voteRounds[_hash].length == 1) {
            _thisDispute.slashedAmount = tellor.slashReporter(
                _thisDispute.disputedReporter,
                address(this)
            );
            tellor.removeValue(_queryId, _timestamp);
        } else {
            _thisDispute.slashedAmount = disputeInfo[voteRounds[_hash][0]]
                .slashedAmount;
        }
        emit NewDispute(
            _disputeId,
            _queryId,
            _timestamp,
            _thisDispute.disputedReporter
        );
    }

    /**
     * @dev Executes vote by using result and transferring balance to either
     * initiator or disputed reporter
     * @param _disputeId is the ID of the vote being executed
     */
    function executeVote(uint256 _disputeId) external {
        // Ensure validity of vote ID, vote has been executed, and vote must be tallied
        Vote storage _thisVote = voteInfo[_disputeId];
        require(_disputeId <= voteCount, "Vote ID must be valid");
        require(!_thisVote.executed, "Vote has been executed");
        require(_thisVote.tallyDate > 0, "Vote must be tallied");
        // Ensure vote must be final vote and that time has to be pass (86400 = 24 * 60 * 60 for seconds in a day)
        require(
            voteRounds[_thisVote.identifierHash].length == _thisVote.voteRound,
            "Must be the final vote"
        );
        require(
            block.timestamp - _thisVote.tallyDate >=
                86400 * _thisVote.voteRound,
            "Vote needs to be tallied and time must pass"
        );
        _thisVote.executed = true;
        if (!_thisVote.isDispute) {
            // If vote is not in dispute and passed, execute proper vote function with vote data
            if (_thisVote.result == VoteResult.PASSED) {
                address _destination = _thisVote.voteAddress;
                bool _succ;
                bytes memory _res;
                (_succ, _res) = _destination.call(
                    abi.encodePacked(_thisVote.voteFunction, _thisVote.data)
                ); //When testing _destination.call can require higher gas than the standard. Be sure to increase the gas if it fails.
            }
            emit VoteExecuted(_disputeId, _thisVote.result);
        } else {
            Dispute storage _thisDispute = disputeInfo[_disputeId];
            if (
                voteRounds[_thisVote.identifierHash].length ==
                _thisVote.voteRound
            ) {
                openDisputesOnId[_thisDispute.queryId]--;
            }
            uint256 _i;
            uint256 _voteID;
            if (_thisVote.result == VoteResult.PASSED) {
                // If vote is in dispute and passed, iterate through each vote round and transfer the dispute to initiator
                for (
                    _i = voteRounds[_thisVote.identifierHash].length;
                    _i > 0;
                    _i--
                ) {
                    _voteID = voteRounds[_thisVote.identifierHash][_i - 1];
                    _thisVote = voteInfo[_voteID];
                    // If the first vote round, also make sure to transfer the reporter's slashed stake to the initiator
                    if (_i == 1) {
                        token.transfer(
                            _thisVote.initiator,
                            _thisDispute.slashedAmount
                        );
                    }
                    token.transfer(_thisVote.initiator, _thisVote.fee);
                }
            } else if (_thisVote.result == VoteResult.INVALID) {
                // If vote is in dispute and is invalid, iterate through each vote round and transfer the dispute fee to initiator
                for (
                    _i = voteRounds[_thisVote.identifierHash].length;
                    _i > 0;
                    _i--
                ) {
                    _voteID = voteRounds[_thisVote.identifierHash][_i - 1];
                    _thisVote = voteInfo[_voteID];
                    token.transfer(_thisVote.initiator, _thisVote.fee);
                }
                // Transfer slashed tokens back to disputed reporter
                token.transfer(
                    _thisDispute.disputedReporter,
                    _thisDispute.slashedAmount
                );
            } else if (_thisVote.result == VoteResult.FAILED) {
                // If vote is in dispute and fails, iterate through each vote round and transfer the dispute fee to disputed reporter
                uint256 _reporterReward = 0;
                for (
                    _i = voteRounds[_thisVote.identifierHash].length;
                    _i > 0;
                    _i--
                ) {
                    _voteID = voteRounds[_thisVote.identifierHash][_i - 1];
                    _thisVote = voteInfo[_voteID];
                    _reporterReward += _thisVote.fee;
                }
                _reporterReward += _thisDispute.slashedAmount;
                token.transfer(_thisDispute.disputedReporter, _reporterReward);
            }
            emit VoteExecuted(_disputeId, voteInfo[_disputeId].result);
        }
    }

    /**
     * @dev Initializes proposal to update user stakeholder list
     * @param _address address whose user status to update
     * @param _isUser true to set address as user, false to remove address from user list
     * @param _timestamp used to differentiate proposals. If set to zero, timestamp
     * will automatically be reset to block timestamp
     */
    function proposeUpdateUserList(
        address _address,
        bool _isUser,
        uint256 _timestamp
    ) external {
        _proposeVote(
            address(this),
            bytes4(keccak256(bytes("updateUserList(address,bool)"))),
            abi.encode(_address, _isUser),
            _timestamp
        );
    }

    /**
     * @dev Tallies the votes and begins the 1 day challenge period
     * @param _disputeId is the dispute id
     */
    function tallyVotes(uint256 _disputeId) external {
        // Ensure vote has not been executed and that vote has not been tallied
        Vote storage _thisVote = voteInfo[_disputeId];
        require(!_thisVote.executed, "Dispute has already been executed");
        require(_thisVote.tallyDate == 0, "Vote has already been tallied");
        require(_disputeId <= voteCount, "Vote does not exist");
        // Determine appropriate vote duration and quorum based on dispute status
        uint256 _duration = 2 days;
        if (!_thisVote.isDispute) {
            _duration = 7 days;
        }
        // Ensure voting is not still open
        require(
            block.timestamp - _thisVote.startDate > _duration,
            "Time for voting has not elapsed"
        );
        // Get total votes from each separate stakeholder group.  This will allow
        // normalization so each group's votes can be combined and compared to
        // determine the vote outcome.
        uint256 tokenVoteSum = _thisVote.tokenholders.doesSupport +
            _thisVote.tokenholders.against +
            _thisVote.tokenholders.invalidQuery;
        uint256 reportersVoteSum = _thisVote.reporters.doesSupport +
            _thisVote.reporters.against +
            _thisVote.reporters.invalidQuery;
        uint256 multisigVoteSum = _thisVote.teamMultisig.doesSupport +
            _thisVote.teamMultisig.against +
            _thisVote.teamMultisig.invalidQuery;
        uint256 usersVoteSum = _thisVote.users.doesSupport +
            _thisVote.users.against +
            _thisVote.users.invalidQuery;
        // Cannot divide by zero
        if (
            tokenVoteSum * reportersVoteSum * multisigVoteSum * usersVoteSum ==
            0
        ) {
            if (tokenVoteSum == 0) {
                tokenVoteSum++;
            }
            if (reportersVoteSum == 0) {
                reportersVoteSum++;
            }
            if (multisigVoteSum == 0) {
                multisigVoteSum++;
            }
            if (usersVoteSum == 0) {
                usersVoteSum++;
            }
        }
        // Normalize and combine each stakeholder group votes
        uint256 scaledDoesSupport = ((_thisVote.tokenholders.doesSupport *
            10000) / tokenVoteSum) +
            ((_thisVote.reporters.doesSupport * 10000) / reportersVoteSum) +
            ((_thisVote.teamMultisig.doesSupport * 10000) / multisigVoteSum) +
            ((_thisVote.users.doesSupport * 10000) / multisigVoteSum);
        uint256 scaledAgainst = ((_thisVote.tokenholders.against * 10000) /
            tokenVoteSum) +
            ((_thisVote.reporters.against * 10000) / reportersVoteSum) +
            ((_thisVote.teamMultisig.against * 10000) / multisigVoteSum) +
            ((_thisVote.users.against * 10000) / multisigVoteSum);
        uint256 scaledInvalid = ((_thisVote.tokenholders.invalidQuery * 10000) /
            tokenVoteSum) +
            ((_thisVote.reporters.invalidQuery * 10000) / reportersVoteSum) +
            ((_thisVote.teamMultisig.invalidQuery * 10000) / multisigVoteSum) +
            ((_thisVote.users.invalidQuery * 10000) / multisigVoteSum);
        // If there are more invalid votes than for and against, result is invalid
        if (
            scaledInvalid >= scaledDoesSupport &&
            scaledInvalid >= scaledAgainst &&
            _thisVote.isDispute
        ) {
            _thisVote.result = VoteResult.INVALID;
        } else if (scaledDoesSupport > scaledAgainst) {
            // If there are more support votes than against votes, allow the vote to pass
            _thisVote.result = VoteResult.PASSED;
        }
        // If there are more against votes than support votes, the result failed
        else {
            _thisVote.result = VoteResult.FAILED;
        }
        _thisVote.tallyDate = block.timestamp; // Update time vote was tallied
        emit VoteTallied(
            _disputeId,
            _thisVote.result,
            _thisVote.initiator,
            disputeInfo[_disputeId].disputedReporter
        );
    }

    /**
     * @dev Changes address's status as user. Can only be called by this contract
     * through a proposeUpdateUserList proposal
     * @param _address address whose user status to update
     * @param _isUser true to set address as user, false to remove address from user list
     */
    function updateUserList(address _address, bool _isUser) external {
        require(
            msg.sender == address(this),
            "Only governance can update user list"
        );
        users[_address] = _isUser;
    }

    /**
     * @dev Enables the sender address to cast a vote
     * @param _disputeId is the ID of the vote
     * @param _supports is the address's vote: whether or not they support or are against
     * @param _invalidQuery is whether or not the dispute is valid
     */
    function vote(
        uint256 _disputeId,
        bool _supports,
        bool _invalidQuery
    ) external {
        // Ensure that dispute has not been executed and that vote does not exist and is not tallied
        require(_disputeId <= voteCount, "Vote does not exist");
        Vote storage _thisVote = voteInfo[_disputeId];
        require(_thisVote.tallyDate == 0, "Vote has already been tallied");
        require(!_thisVote.voted[msg.sender], "Sender has already voted");
        // Update voting status and increment total queries for support, invalid, or against based on vote
        _thisVote.voted[msg.sender] = true;
        uint256 voteWeight = token.balanceOf(msg.sender);
        (, uint256 stakedBalance, uint256 lockedBalance, , ) = tellor
            .getStakerInfo(msg.sender);
        voteWeight += stakedBalance + lockedBalance;
        if (_thisVote.isDispute && _invalidQuery) {
            if (voteWeight > 0) {
                _thisVote.tokenholders.invalidQuery += voteWeight;
            }
            voteWeight = tellor.getReportsSubmittedByAddress(msg.sender);
            if (voteWeight > 0) {
                _thisVote.reporters.invalidQuery += voteWeight;
            }
            if (users[msg.sender]) {
                _thisVote.users.invalidQuery += 1;
            }
            if (msg.sender == teamMultisig) {
                _thisVote.teamMultisig.invalidQuery += 1;
            }
        } else if (_supports) {
            if (voteWeight > 0) {
                _thisVote.tokenholders.doesSupport += voteWeight;
            }
            voteWeight = tellor.getReportsSubmittedByAddress(msg.sender);
            if (voteWeight > 0) {
                _thisVote.reporters.doesSupport += voteWeight;
            }
            if (users[msg.sender]) {
                _thisVote.users.doesSupport += 1;
            }
            if (msg.sender == teamMultisig) {
                _thisVote.teamMultisig.doesSupport += 1;
            }
        } else {
            if (voteWeight > 0) {
                _thisVote.tokenholders.against += voteWeight;
            }
            voteWeight = tellor.getReportsSubmittedByAddress(msg.sender);
            if (voteWeight > 0) {
                _thisVote.reporters.against += voteWeight;
            }
            if (users[msg.sender]) {
                _thisVote.users.against += 1;
            }
            if (msg.sender == teamMultisig) {
                _thisVote.teamMultisig.against += 1;
            }
        }
        voteTallyByAddress[msg.sender]++;
        emit Voted(_disputeId, _supports, msg.sender, _invalidQuery);
    }

    // Getters
    /**
     * @dev Determines if an address voted for a specific vote
     * @param _disputeId is the ID of the vote
     * @param _voter is the address of the voter to check for
     * @return bool of whether or note the address voted for the specific vote
     */
    function didVote(uint256 _disputeId, address _voter)
        external
        view
        returns (bool)
    {
        return voteInfo[_disputeId].voted[_voter];
    }

    /**
     * @dev Returns info on a dispute for a given ID
     * @param _disputeId is the ID of a specific dispute
     * @return bytes32 of the data ID of the dispute
     * @return uint256 of the timestamp of the dispute
     * @return bytes memory of the value being disputed
     * @return address of the reporter being disputed
     */
    function getDisputeInfo(uint256 _disputeId)
        external
        view
        returns (
            bytes32,
            uint256,
            bytes memory,
            address
        )
    {
        Dispute storage _d = disputeInfo[_disputeId];
        return (_d.queryId, _d.timestamp, _d.value, _d.disputedReporter);
    }

    /**
     * @dev Returns the number of open disputes for a specific query ID
     * @param _queryId is the ID of a specific data feed
     * @return uint256 of the number of open disputes for the query ID
     */
    function getOpenDisputesOnId(bytes32 _queryId)
        external
        view
        returns (uint256)
    {
        return openDisputesOnId[_queryId];
    }

    /**
     * @dev Returns the total number of votes
     * @return uint256 of the total number of votes
     */
    function getVoteCount() external view returns (uint256) {
        return voteCount;
    }

    /**
     * @dev Returns info on a vote for a given vote ID
     * @param _disputeId is the ID of a specific vote
     * @return bytes32 identifier hash of the vote
     * @return uint256[8] memory of the pertinent round info (vote rounds, start date, fee, etc.)
     * @return bool[2] memory of both whether or not the vote was executed and is dispute
     * @return VoteResult result of the vote
     * @return bytes memory of the argument data of a proposal vote
     * @return bytes4 of the function selector proposed to be called
     * @return address[2] memory of the Tellor system contract address and vote initiator
     */
    function getVoteInfo(uint256 _disputeId)
        external
        view
        returns (
            bytes32,
            uint256[17] memory,
            bool[2] memory,
            VoteResult,
            bytes memory,
            bytes4,
            address[2] memory
        )
    {
        Vote storage _v = voteInfo[_disputeId];
        return (
            _v.identifierHash,
            [
                _v.voteRound,
                _v.startDate,
                _v.blockNumber,
                _v.fee,
                _v.tallyDate,
                _v.tokenholders.doesSupport,
                _v.tokenholders.against,
                _v.tokenholders.invalidQuery,
                _v.users.doesSupport,
                _v.users.against,
                _v.users.invalidQuery,
                _v.reporters.doesSupport,
                _v.reporters.against,
                _v.reporters.invalidQuery,
                _v.teamMultisig.doesSupport,
                _v.teamMultisig.against,
                _v.teamMultisig.invalidQuery
            ],
            [_v.executed, _v.isDispute],
            _v.result,
            _v.data,
            _v.voteFunction,
            [_v.voteAddress, _v.initiator]
        );
    }

    /**
     * @dev Returns an array of voting rounds for a given vote
     * @param _hash is the identifier hash for a vote
     * @return uint256[] memory dispute IDs of the vote rounds
     */
    function getVoteRounds(bytes32 _hash)
        external
        view
        returns (uint256[] memory)
    {
        return voteRounds[_hash];
    }

    /**
     * @dev Returns the total number of votes cast by an address
     * @param _voter is the address of the voter to check for
     * @return uint256 of the total number of votes cast by the voter
     */
    function getVoteTallyByAddress(address _voter)
        external
        view
        returns (uint256)
    {
        return voteTallyByAddress[_voter];
    }

    /**
     * @dev Returns boolean value for whether a given address is set as a user with
     * voting rights
     * @param _address address of potential user
     * @return bool whether or not the address is set as a user
     */
    function isUser(address _address) external view returns (bool) {
        return users[_address];
    }

    // Internal
    /**
     * @dev Proposes a vote for an associated Tellor contract and function, and defines the properties of the vote
     * @param _contract is the Tellor contract to propose a vote for -> used to calculate identifier hash
     * @param _function is the Tellor function to propose a vote for -> used to calculate identifier hash
     * @param _data is the function argument data associated with the vote proposal -> used to calculate identifier hash
     * @param _timestamp is the timestamp associated with the vote -> used to calculate identifier hash
     */
    function _proposeVote(
        address _contract,
        bytes4 _function,
        bytes memory _data,
        uint256 _timestamp
    ) internal {
        // Update vote count, vote ID, current vote, and timestamp
        voteCount++;
        uint256 _disputeId = voteCount;
        Vote storage _thisVote = voteInfo[_disputeId];
        if (_timestamp == 0) {
            _timestamp = block.timestamp;
        }
        // Calculate vote identifier hash and push to vote rounds
        bytes32 _hash = keccak256(
            abi.encodePacked(_contract, _function, _data, _timestamp)
        );
        voteRounds[_hash].push(_disputeId);
        // Ensure new dispute round started within a day
        if (voteRounds[_hash].length > 1) {
            uint256 _prevId = voteRounds[_hash][voteRounds[_hash].length - 2];
            require(
                block.timestamp - voteInfo[_prevId].tallyDate < 1 days,
                "New dispute round must be started within a day"
            ); // 1 day for new disputes
        }
        // Calculate fee to propose vote. Starts as just 10 tokens flat, doubles with each round
        uint256 _fee = 10e18 * 2**(voteRounds[_hash].length - 1);
        require(
            token.transferFrom(msg.sender, address(this), _fee),
            "Fee must be paid"
        );
        // Update information on vote -- hash, vote round, start date, block number, fee, etc.
        _thisVote.identifierHash = _hash;
        _thisVote.voteRound = voteRounds[_hash].length;
        _thisVote.startDate = block.timestamp;
        _thisVote.blockNumber = block.number;
        _thisVote.fee = _fee;
        _thisVote.data = _data;
        _thisVote.voteFunction = _function;
        _thisVote.voteAddress = _contract;
        _thisVote.initiator = msg.sender;
        emit NewVote(_contract, _function, _data, _disputeId);
    }
}

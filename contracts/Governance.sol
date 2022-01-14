// // SPDX-License-Identifier: MIT
// pragma solidity 0.8.3;

// interface ITellorFlex {
//
// }
// contract Governance {
//   address token;
//   address tellor;
//   function beginDispute()
//   function proposeVote()
//   function vote()
//   function executeVote()
//   function tallyVotes()
//   function updateMinDisputeFee()
// }


// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "Flex.sol";


contract Governance {
    // Storage
    TellorFlex public tellor;
    IERC20 public token;
    uint256 public voteCount; // total number of votes initiated
    uint256 public disputeFee; // dispute fee for a vote
    uint256 public minimumDisputeFee;
    mapping(bytes32 => uint256[]) private voteRounds; // mapping of vote identifier hashes to an array of dispute IDs
    mapping(uint256 => Vote) private voteInfo; // mapping of vote IDs to the details of the vote
    mapping(uint256 => Dispute) private disputeInfo; // mapping of dispute IDs to the details of the dispute
    mapping(bytes32 => uint256) private openDisputesOnId; // mapping of a query ID to the number of disputes on that query ID
    enum VoteResult {
        FAILED,
        PASSED,
        INVALID
    } // status of a potential vote

    struct Dispute {
        bytes32 queryId; // query ID of disputed value
        uint256 timestamp; // timestamp of disputed value
        bytes value; // disputed value
        address disputedReporter; // reporter who submitted the disputed value
        uint256 slashedAmount; // amount of tokens slashed from reporter
    }

    struct Vote {
        bytes32 identifierHash; // identifier hash of the vote
        uint256 voteRound; // the round of voting on a given dispute or proposal
        uint256 startDate; // timestamp of when vote was initiated
        uint256 blockNumber; // block number of when vote was initiated
        uint256 fee; // fee associated with the vote
        uint256 tallyDate; // timestamp of when the votes were tallied
        uint256 doesSupport; // number of votes in favor
        uint256 against; // number of votes against
        bool executed; // boolean of is the dispute settled
        VoteResult result; // VoteResult of did the vote pass?
        bool isDispute; // boolean of is the vote a dispute as opposed to a proposal
        uint256 invalidQuery; // number of votes for invalid
        bytes data; // arguments used to execute a proposal
        bytes4 voteFunction; // hash of the function associated with a proposal vote
        address voteAddress; // address of contract to execute function on
        address initiator; // address which initiated dispute/proposal
        mapping(address => bool) voted; // mapping of address to whether or not they voted
    }

    event NewDispute(
        uint256 _disputeId,
        bytes32 _queryId,
        uint256 _timestamp,
        address _reporter
    ); // Emitted when a new dispute is opened
    event VoteExecuted(uint256 _disputeId, VoteResult _result); // Emitted when a vote is executed

    constructor(address _tellor, uint256 _minimumDisputeFee) {
      tellor = TellorFlex(_tellor);
      minimumDisputeFee = _minimumDisputeFee;
    }

    function beginDispute(bytes32 _queryId, uint256 _timestamp) public {
      // Ensure value actually exists
      require(
          tellor.getBlockNumberByTimestamp(_queryId, _timestamp) !=
              0,
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
              block.timestamp - _timestamp < IOracle(_oracle).reportingLock(),
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
      _thisDispute.value = IOracle(_oracle).getValueByTimestamp(
          _queryId,
          _timestamp
      );
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
        IOracle(_oracle).removeValue(_queryId, _timestamp);
    } else {
        _fee = disputeFee * 2**(voteRounds[_hash].length - 1);
    }
    _thisVote.fee = (_fee * 9) / 10;
    require(
        token.transferFrom(
            msg.sender,
            address(this),
            _fee
        ),
        "Fee must be paid"
    ); // This is the fork fee. Returned if dispute passes
    if(voteRounds[_hash].length == 1) {
      _thisDispute.slashedAmount = tellor.slashReporter(_thisDispute.disputedReporter, address(this));
      tellor.removeValue(_queryId, _timestamp);
      updateMinDisputeFee();
    }
    emit NewDispute(_disputeId, _queryId, _timestamp, _thisDispute.disputedReporter);
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
              ); // Be sure to send enough gas!
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
                      token.transfer(_thisVote.initiator, _thisDispute.slashedAmount);
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
              // uint256 _stakeCount = IController(TELLOR_ADDRESS).getUintVar(
              //     _STAKE_COUNT
              // );
              // IController(TELLOR_ADDRESS).changeUint(
              //     _STAKE_COUNT,
              //     _stakeCount + 1
              // );
              // _controller.changeStakingStatus(
              //     _thisDispute.disputedReporter,
              //     1
              // ); // Change staking status of disputed reporter, but don't slash
              // Transfer slashed tokens back to disputed reporter
              token.transfer(_thisDispute.disputedReporter, _thisDispute.slashedAmount);
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
              token.transfer(
                  _thisDispute.disputedReporter,
                  _reporterReward
              );
              // uint256 _stakeCount = IController(TELLOR_ADDRESS).getUintVar(
              //     _STAKE_COUNT
              // );
              // IController(TELLOR_ADDRESS).changeUint(
              //     _STAKE_COUNT,
              //     _stakeCount - 1
              // );
              // _controller.changeStakingStatus(
              //     _thisDispute.disputedReporter,
              //     1
              // );
          }
          emit VoteExecuted(_disputeId, voteInfo[_disputeId].result);
      }
  }

  function proposeChangeGovernanceAddress(address _newGovernanceAddress, uint256 _timestamp) external {
    _proposeVote(
      tellor.address,
      bytes4(keccak256(abi.encode("changeGovernanceAddress(address)"))),
      abi.encode(_newGovernanceAddress),
      _timestamp
    );
  }

  function proposeChangeReportingLock(uint256 _newReportingLock, uint256 _timestamp) external {
    _proposeVote(
      tellor.address,
      bytes4(keccak256(abi.encode("changeReportingLock(uint256)"))),
      abi.encode(_newReportingLock),
      _timestamp
    );
  }

  function proposeChangeStakeAmount(uint256 _newStakeAmount) external {
    _proposeVote(
      tellor.address,
      bytes4(keccak256(abi.encode("changeStakeAmount(uint256)"))),
      abi.encode(_newStakeAmount),
      _timestamp
    );
  }

  function proposeChangeUserList(address _address, bool _isUser) external {}

  /**
   * @dev Tallies the votes and begins the 1 day challenge period
   * @param _disputeId is the dispute id
   */
  function tallyVotes(uint256 _disputeId) external {
      // Ensure vote has not been executed and that vote has not been tallied
      Vote storage _thisVote = voteInfo[_disputeId];
      require(!_thisVote.executed, "Dispute has been already executed");
      require(_thisVote.tallyDate == 0, "Vote should not already be tallied");
      require(_disputeId <= voteCount, "Vote does not exist");
      // Determine appropriate vote duration and quorum based on dispute status
      uint256 _duration = 2 days;
      uint256 _quorum = 0;
      if (!_thisVote.isDispute) {
          _duration = 7 days;
          _quorum = 5;
      }
      // Ensure voting is not still open
      require(
          block.timestamp - _thisVote.startDate > _duration,
          "Time for voting has not elapsed"
      );
      // If there are more invalid votes than for and against, result is invalid
      if (
          _thisVote.invalidQuery >= _thisVote.doesSupport &&
          _thisVote.invalidQuery >= _thisVote.against &&
          _thisVote.isDispute
      ) {
          _thisVote.result = VoteResult.INVALID;
      } else if (_thisVote.doesSupport > _thisVote.against) {
          // If there are more support votes than against votes, and the vote has reached quorum, allow the vote to pass
          if (
              _thisVote.doesSupport >=
              ((IController(TELLOR_ADDRESS).uints(_TOTAL_SUPPLY) * _quorum) /
                  100)
          ) {
              _thisVote.result = VoteResult.PASSED;
              Dispute storage _thisDispute = disputeInfo[_disputeId];
              // In addition, change staking status of disputed miner as appropriate
              (uint256 _status, ) = IController(TELLOR_ADDRESS).getStakerInfo(
                  _thisDispute.disputedReporter
              );
              if (_thisVote.isDispute && _status == 3) {
                  IController(TELLOR_ADDRESS).changeStakingStatus(
                      _thisDispute.disputedReporter,
                      4
                  );
              }
          }
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
   * @dev This function updates the minimum dispute fee as a function of the amount
   * of staked miners
   */
  function updateMinDisputeFee() public {
      uint256 _stakeAmt = tellor.stakeAmount;
      uint256 _trgtMiners = IController(TELLOR_ADDRESS).uints(_TARGET_MINERS);
      uint256 _stakeCount = tellor.totalStakeAmount / _stakeAmt;
      uint256 _minFee = IController(TELLOR_ADDRESS).uints(
          _MINIMUM_DISPUTE_FEE
      );
      uint256 _reducer;
      // Calculate total dispute fee using stake count
      if (_stakeCount > 0) {
          _reducer =
              (((_stakeAmt - _minFee) * (_stakeCount * 1000)) / _trgtMiners) /
              1000;
      }
      if (_reducer >= _stakeAmt - _minFee) {
          disputeFee = _minFee;
      } else {
          disputeFee = _stakeAmt - _reducer;
      }
  }

  function vote(
      uint256 _disputeId,
      bool _supports,
      bool _invalidQuery
  ) external {
      // require(
      //     delegateOfAt(msg.sender, voteInfo[_disputeId].blockNumber) ==
      //         address(0),
      //     "the vote should not be delegated"
      // );
      _vote(msg.sender, _disputeId, _supports, _invalidQuery);
  }

  function _proposeVote(address _contract, bytes4 _function, bytes calldata _data, uint256 _timestamp) internal {
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
    // Calculate fee to do anything (just 10 tokens flat, no refunds.  Goes up quickly to prevent spamming)
    uint256 _fee = 10e18 * 2**(voteRounds[_hash].length - 1);
    require(
        IController(TELLOR_ADDRESS).approveAndTransferFrom(
            msg.sender,
            address(this),
            _fee
        ),
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
    emit NewVote(_function, _data, _disputeId);
  }

  function _vote(
      address _voter,
      uint256 _disputeId,
      bool _supports,
      bool _invalidQuery
  ) internal {
      // Ensure that dispute has not been executed and that vote does not exist and is not tallied
      require(_disputeId <= voteCount, "Vote does not exist");
      Vote storage _thisVote = voteInfo[_disputeId];
      require(_thisVote.tallyDate == 0, "Vote has already been tallied");
      // IController _controller = IController(TELLOR_ADDRESS);
      uint256 voteWeight = token.balanceOf(_voter);
      IOracle _oracle = IOracle(_controller.addresses(_ORACLE_CONTRACT));
      // ITreasury _treasury = ITreasury(
      //     _controller.addresses(_TREASURY_CONTRACT)
      // );
      // Add to vote weight of voter based on treasury funds, reports submitted, and total tips
      // voteWeight += _treasury.getTreasuryFundsByUser(_voter);
      voteWeight += _oracle.getReportsSubmittedByAddress(_voter) * 1e18;
      
      voteWeight += _oracle.getTipsByUser(_voter);
      // Make sure voter can't already be disputed, has already voted, or if balance is 0
      (uint256 _status, ) = _controller.getStakerInfo(_voter);
      require(_status != 3, "Cannot vote if being disputed");
      require(!_thisVote.voted[_voter], "Sender has already voted");
      require(voteWeight > 0, "User balance is 0");
      // Update voting status and increment total queries for support, invalid, or against based on vote
      _thisVote.voted[_voter] = true;
      if (_thisVote.isDispute && _invalidQuery) {
          _thisVote.invalidQuery += voteWeight;
      } else if (_supports) {
          _thisVote.doesSupport += voteWeight;
      } else {
          _thisVote.against += voteWeight;
      }
      emit Voted(_disputeId, _supports, _voter, voteWeight, _invalidQuery);
  }
}

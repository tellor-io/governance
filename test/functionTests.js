const {expect,assert} = require("chai");
const web3 = require('web3');
const h = require("./helpers/helpers");
const QUERYID1 = h.uintTob32(1)
const abiCoder = new ethers.utils.AbiCoder
const autopayQueryData = abiCoder.encode(["string", "bytes"], ["AutopayAddresses", abiCoder.encode(['bytes'], ['0x'])])
const autopayQueryId = ethers.utils.keccak256(autopayQueryData)

describe("Governance Function Tests", function() {

  let gov, flex, accounts, token, autopay, autopayArray;

  beforeEach(async function() {
    accounts = await ethers.getSigners();
    const Token = await ethers.getContractFactory("StakingToken");
    token = await Token.deploy();
    await token.deployed();
    const Governance = await ethers.getContractFactory("Governance");
    const TellorFlex = await ethers.getContractFactory("TellorFlex")
    flex = await TellorFlex.deploy(token.address, accounts[0].address, web3.utils.toWei("10"), 86400 / 2)
    await flex.deployed();
    gov = await Governance.deploy(flex.address, accounts[0].address);
    await gov.deployed();
    await flex.init(gov.address)
    const Autopay = await ethers.getContractFactory("AutopayMock");
    autopay = await Autopay.deploy(token.address);
    await token.mint(accounts[1].address, web3.utils.toWei("1000"));
    autopayArray = abiCoder.encode(["address[]"], [[autopay.address]]);
  });
  it("Test Constructor()", async function() {
    assert(await gov.tellor() == flex.address, "tellor address should be correct")
    //???assert(await gov.disputeFee() == web3.utils.toWei("10"), "min dispute fee should be set properly")
    assert(await gov.teamMultisig() == accounts[0].address, "team multisig should be set correctly")
  });
  it("Test beginDispute()", async function() {
    await token.connect(accounts[1]).approve(flex.address, web3.utils.toWei("1000"))
    await flex.connect(accounts[1]).depositStake(web3.utils.toWei("10"))
    await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("100"))
    await token.connect(accounts[1]).transfer(accounts[3].address, web3.utils.toWei("100"))
    let blocky = await h.getBlock()
    await token.connect(accounts[2]).approve(gov.address, web3.utils.toWei("10"))
    let balance1 = await token.balanceOf(accounts[2].address)
    await h.expectThrow(gov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp)) //no value exists for the timestamp provided
    await flex.connect(accounts[1]).submitValue(QUERYID1, h.bytes(100), 0, '0x')
    blocky = await h.getBlock()
    await h.expectThrow(gov.connect(accounts[4]).beginDispute(QUERYID1, blocky.timestamp)) // must have tokens to pay/begin dispute
    await token.connect(accounts[2]).approve(gov.address, web3.utils.toWei("10"))
    await gov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp);
    let balance2 = await token.balanceOf(accounts[2].address)
    let vars = await gov.getDisputeInfo(1)
    let _hash = ethers.utils.solidityKeccak256(['bytes32', 'uint256'], [h.uintTob32(1), blocky.timestamp])
    assert(vars[0] == QUERYID1, "queryID should be correct")
    assert(vars[1] == blocky.timestamp, "timestamp should be correct")
    assert(vars[2] == h.bytes(100), "value should be correct")
    assert(vars[3] == accounts[1].address, "accounts[1] should be correct")
    assert(await gov.getOpenDisputesOnId(QUERYID1) == 1, "open disputes on ID should be correct")
    assert(await gov.getVoteRounds(_hash) == 1, "number of vote rounds should be correct")
    //???assert(balance1 - balance2 - web3.utils.toWei("10") == 0, "dispute fee paid should be correct")
    await h.advanceTime(86400 * 2);
    await gov.tallyVotes(1)
    await h.advanceTime(86400 * 2);
    await gov.executeVote(1)
    await h.advanceTime(86400 * 2)
    await token.connect(accounts[2]).approve(gov.address, web3.utils.toWei("10"))
    await h.expectThrow(gov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp)) //assert second dispute started within a day
    await token.connect(accounts[3]).approve(flex.address, web3.utils.toWei("1000"))
    await flex.connect(accounts[3]).depositStake(web3.utils.toWei("10"))
    await flex.connect(accounts[3]).submitValue(QUERYID1, h.bytes(100), 0, '0x')
    blocky = await h.getBlock()
    await h.advanceTime(86400 + 10)
    await token.connect(accounts[2]).approve(gov.address, web3.utils.toWei("10"))
    await h.expectThrow(gov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp)) //fast forward assert
  });
  it("Test executeVote()", async function() {
    await token.connect(accounts[1]).approve(flex.address, web3.utils.toWei("1000"))
    await flex.connect(accounts[1]).depositStake(web3.utils.toWei("10"))
    await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("100"))
    await token.connect(accounts[1]).transfer(accounts[3].address, web3.utils.toWei("100"))
    let blocky = await h.getBlock()
    await token.connect(accounts[2]).approve(gov.address, web3.utils.toWei("10"))
    let balance1 = await token.balanceOf(accounts[2].address)
    await h.expectThrow(gov.connect(accounts[2]).executeVote(1)) //1 vote ID must be valid
    await flex.connect(accounts[1]).submitValue(QUERYID1, h.bytes(100), 0, '0x')
    blocky = await h.getBlock()
    await h.expectThrow(gov.connect(accounts[4]).beginDispute(QUERYID1, blocky.timestamp)) // must have tokens to pay for dispute
    await gov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp);
    let balance2 = await token.balanceOf(accounts[2].address)
    let vars = await gov.getDisputeInfo(1)
    let _hash = ethers.utils.solidityKeccak256(['bytes32', 'uint256'], [h.uintTob32(1), blocky.timestamp])
    assert(vars[0] == QUERYID1, "queryID should be correct")
    assert(vars[1] == blocky.timestamp, "timestamp should be correct")
    assert(vars[2] == h.bytes(100), "value should be correct")
    assert(vars[3] == accounts[1].address, "accounts[1] should be correct")
    assert(await gov.getOpenDisputesOnId(QUERYID1) == 1, "open disputes on ID should be correct")
    assert(await gov.getVoteRounds(_hash) == 1, "number of vote rounds should be correct")
    assert(balance1 - balance2 - web3.utils.toWei("10") == 0, "dispute fee paid should be correct")
    await h.expectThrow(gov.connect(accounts[2]).executeVote(10)) //dispute id must exist
    await h.advanceTime(86400 * 2);
    await h.expectThrow(gov.connect(accounts[2]).executeVote(1)) //vote must be tallied
    await gov.connect(accounts[2]).vote(1, true, false)
    await gov.tallyVotes(1)
    await h.expectThrow(gov.connect(accounts[2]).executeVote(1)) //a day must pass before execution
    await h.advanceTime(86400 * 2);
    await gov.executeVote(1)
    await h.expectThrow(gov.connect(accounts[2]).executeVote(1)) //vote already executed
    await h.advanceTime(86400 * 2)
    await token.connect(accounts[2]).approve(gov.address, web3.utils.toWei("10"))
    await h.expectThrow(gov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp)) //assert second dispute started within a day
    vars = await gov.getVoteInfo(1)
    assert(vars[0] == _hash, "hash should be correct")
    assert(vars[1][0] == 1, "vote round should be correct")
    assert(vars[2] == true, "vote should be executed")
    assert(vars[3] == true, "vote should pass")
    await token.connect(accounts[3]).approve(flex.address, web3.utils.toWei("1000"))
    await flex.connect(accounts[3]).depositStake(web3.utils.toWei("10"))
    await flex.connect(accounts[3]).submitValue(QUERYID1, h.bytes(100), 0, '0x')
    blocky = await h.getBlock()
    await token.connect(accounts[2]).approve(gov.address, web3.utils.toWei("10"))
    await gov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp) //fast forward assert
    await h.advanceTime(86400 * 2);
    await gov.tallyVotes(2)
    await token.connect(accounts[2]).approve(gov.address, web3.utils.toWei("20"))
    await gov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp)
    await h.advanceTime(86400 * 2);
    await h.expectThrow(gov.connect(accounts[2]).executeVote(1)) //vote must be the final vote
    await h.advanceTime(86400 * 2);
    await gov.tallyVotes(3)
    await h.advanceTime(86400);
    await h.expectThrow(gov.connect(accounts[2]).executeVote(3)) //must wait longer for further rounds
    await h.advanceTime(86400);
    await gov.connect(accounts[2]).executeVote(3) //must wait longer for further rounds
  });
  it("Test tallyVotes()", async function() {
    // Test tallyVotes on dispute
    // tallyVotes (1dispute could not have been executed, 2)or tallied, 
    // 3)dispute does not exist 4) cannot tally before the voting time has ended)
    await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("20"))
    await token.connect(accounts[2]).approve(flex.address, web3.utils.toWei("20"))
    await flex.connect(accounts[2]).depositStake(web3.utils.toWei("20"))
    await flex.connect(accounts[2]).submitValue(h.uintTob32(1), h.uintTob32(100), 0, '0x')
    blocky = await h.getBlock()
    await h.expectThrow(gov.connect(accounts[1]).tallyVotes(1)) // Cannot tally a dispute that does not exist
    
    await token.connect(accounts[1]).approve(gov.address, web3.utils.toWei("10"))
    await gov.connect(accounts[1]).beginDispute(h.uintTob32(1), blocky.timestamp)
    await gov.connect(accounts[1]).vote(1, true, false)
    await h.expectThrow(gov.connect(accounts[1]).tallyVotes(1)) // Time for voting has not elapsed
    await h.advanceTime(86400 * 2)
    await gov.connect(accounts[1]).tallyVotes(1)
    blocky = await h.getBlock()
    await h.advanceTime(86400)
    await h.expectThrow(gov.connect(accounts[1]).tallyVotes(1)) // cannot re-tally a dispute --BL
    voteInfo = await gov.getVoteInfo(1)
    assert(voteInfo[3] == 1, "Vote result should change")
    assert(voteInfo[1][4] == blocky.timestamp, "Tally date should be correct")
    await gov.executeVote(1)
    await h.expectThrow(gov.connect(accounts[1]).tallyVotes(1)) // Dispute has been already executed
  });
  it("Test vote()", async function() {
    // vote (1 dispute must exist, 2)cannot have been tallied, 3)sender has already voted)
    await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("20"))
    await token.connect(accounts[2]).approve(flex.address, web3.utils.toWei("20"))
    await flex.connect(accounts[2]).depositStake(web3.utils.toWei("20"))
    await flex.connect(accounts[2]).submitValue(h.uintTob32(1), h.uintTob32(100), 0, '0x')
    blocky = await h.getBlock()
    await token.connect(accounts[1]).approve(gov.address, web3.utils.toWei("10"))
    await gov.connect(accounts[1]).beginDispute(h.uintTob32(1), blocky.timestamp)
    await h.expectThrow(gov.connect(accounts[1]).vote(2, true, false)) // Can't vote on dispute does not exist
    await gov.connect(accounts[1]).vote(1, true, false)
    await gov.connect(accounts[2]).vote(1, false, false)
    await h.expectThrow(gov.connect(accounts[1]).vote(1, true, false)) // Sender has already voted
    await h.advanceTime(86400 * 2)
    await gov.connect(accounts[1]).tallyVotes(1)
    await h.expectThrow(gov.connect(accounts[1]).vote(1, true, false)) // Vote has already been tallied
    voteInfo = await gov.getVoteInfo(1)
    assert(voteInfo[1][5] - await token.balanceOf(accounts[1].address) == 0, "Tokenholders doesSupport tally should be correct")
    assert(voteInfo[1][6] == web3.utils.toWei("10"), "Tokenholders doesSupport tally should be correct")
    assert(voteInfo[1][7] == 0, "Tokenholders invalid tally should be correct")
    assert(voteInfo[1][8] == 0, "Users doesSupport tally should be correct")
    assert(voteInfo[1][9] == 0, "Users against tally should be correct")
    assert(voteInfo[1][10] == 0, "Users invalid tally should be correct")
    assert(voteInfo[1][11] == 0, "Reporters doesSupport tally should be correct")
    assert(voteInfo[1][12] == 1, "Reporters against tally should be correct")
    assert(voteInfo[1][13] == 0, "Reporters invalid tally should be correct")
    assert(voteInfo[1][14] == 0, "teamMultisig doesSupport tally should be correct")
    assert(voteInfo[1][15] == 0, "teamMultisig against tally should be correct")
    assert(voteInfo[1][16] == 0, "teamMultisig invalid tally should be correct")
    assert(await gov.didVote(1, accounts[1].address), "Voter's voted status should be correct")
    assert(await gov.didVote(1, accounts[2].address), "Voter's voted status should be correct")
    assert(await gov.didVote(1, accounts[3].address) == false, "Voter's voted status should be correct")
    assert(await gov.getVoteTallyByAddress(accounts[1].address) == 1, "Vote tally by address should be correct")
    assert(await gov.getVoteTallyByAddress(accounts[2].address) == 1, "Vote tally by address should be correct")
  });
  it("Test didVote()", async function() {
    await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("20"))
    await token.connect(accounts[2]).approve(flex.address, web3.utils.toWei("20"))
    await flex.connect(accounts[2]).depositStake(web3.utils.toWei("20"))
    await flex.connect(accounts[2]).submitValue(h.uintTob32(1), h.uintTob32(100), 0, '0x')
    blocky = await h.getBlock()
    await token.connect(accounts[1]).approve(gov.address, web3.utils.toWei("10"))
    await gov.connect(accounts[1]).beginDispute(h.uintTob32(1), blocky.timestamp)
    assert(await gov.didVote(1, accounts[1].address) == false, "Voter's voted status should be correct")
    await gov.connect(accounts[1]).vote(1, true, false)
    assert(await gov.didVote(1, accounts[1].address), "Voter's voted status should be correct")
  });
  it("Test getDisputeInfo()", async function() {
    await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("20"))
    await token.connect(accounts[2]).approve(flex.address, web3.utils.toWei("20"))
    await flex.connect(accounts[2]).depositStake(web3.utils.toWei("20"))
    await flex.connect(accounts[2]).submitValue(h.uintTob32(1), h.uintTob32(100), 0, '0x')
    blocky = await h.getBlock()
    await token.connect(accounts[1]).approve(gov.address, web3.utils.toWei("10"))
    await gov.connect(accounts[1]).beginDispute(h.uintTob32(1), blocky.timestamp)
    disputeInfo = await gov.getDisputeInfo(1)
    assert(disputeInfo[0] == h.uintTob32(1), "Disputed query id should be correct")
    assert(disputeInfo[1] == blocky.timestamp, "Disputed timestamp should be correct")
    assert(disputeInfo[2] == h.uintTob32(100), "Disputed value should be correct")
    assert(disputeInfo[3] == accounts[2].address, "Disputed reporter should be correct")
  });
  it("Test getOpenDisputesOnId()", async function() {
    await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("20"))
    await token.connect(accounts[2]).approve(flex.address, web3.utils.toWei("20"))
    await flex.connect(accounts[2]).depositStake(web3.utils.toWei("20"))
    await flex.connect(accounts[2]).submitValue(h.uintTob32(1), h.uintTob32(100), 0, '0x')
    blocky = await h.getBlock()
    await token.connect(accounts[1]).approve(gov.address, web3.utils.toWei("10"))
    assert(await gov.getOpenDisputesOnId(h.uintTob32(1)) == 0, "Open disputes on ID should be correct")
    await gov.connect(accounts[1]).beginDispute(h.uintTob32(1), blocky.timestamp)
    assert(await gov.getOpenDisputesOnId(h.uintTob32(1)) == 1, "Open disputes on ID should be correct")
    await gov.connect(accounts[1]).vote(1, true, false)
    await h.advanceTime(86400 * 2)
    await gov.connect(accounts[1]).tallyVotes(1)
    await h.advanceTime(86400)
    await gov.executeVote(1)
    assert(await gov.getOpenDisputesOnId(h.uintTob32(1)) == 0, "Open disputes on ID should be correct")
  });
  it("Test getVoteCount()", async function() {
    assert(await gov.getVoteCount() == 0, "Vote count should start at 0")
    await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("20"))
    await token.connect(accounts[2]).approve(flex.address, web3.utils.toWei("20"))
    await flex.connect(accounts[2]).depositStake(web3.utils.toWei("20"))
    await flex.connect(accounts[2]).submitValue(h.uintTob32(1), h.uintTob32(100), 0, '0x')
    blocky = await h.getBlock()
    await token.connect(accounts[1]).approve(gov.address, web3.utils.toWei("10"))
    await gov.connect(accounts[1]).beginDispute(h.uintTob32(1), blocky.timestamp)
    assert(await gov.getVoteCount() == 1, "Vote count should increment correctly")
    await h.advanceTime(86400 * 2)
    await gov.connect(accounts[1]).tallyVotes(1)
    await h.advanceTime(86400)
    await gov.executeVote(1)
    assert(await gov.getVoteCount() == 1, "Vote count should not change after vote execution")
    await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("20"))
    await token.connect(accounts[2]).approve(flex.address, web3.utils.toWei("20"))
    await flex.connect(accounts[2]).depositStake(web3.utils.toWei("20"))
    await flex.connect(accounts[2]).submitValue(h.uintTob32(1), h.uintTob32(100), 0, '0x')
    blocky = await h.getBlock()
    await token.connect(accounts[1]).approve(gov.address, web3.utils.toWei("10"))
    await gov.connect(accounts[1]).beginDispute(h.uintTob32(1), blocky.timestamp)
    assert(await gov.getVoteCount() == 2, "Vote count should increment correctly")
  });
  it("Test getVoteInfo()", async function() {
    await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("20"))
    await token.connect(accounts[2]).approve(flex.address, web3.utils.toWei("20"))
    await flex.connect(accounts[2]).depositStake(web3.utils.toWei("20"))
    await flex.connect(accounts[2]).submitValue(h.uintTob32(1), h.uintTob32(100), 0, '0x')
    blocky0 = await h.getBlock()
    await token.connect(accounts[1]).approve(gov.address, web3.utils.toWei("10"))
    await gov.connect(accounts[1]).beginDispute(h.uintTob32(1), blocky0.timestamp)
    blocky1 = await h.getBlock()
    await gov.connect(accounts[1]).vote(1, true, false)
    await h.advanceTime(86400 * 7)
    await gov.connect(accounts[1]).tallyVotes(1)
    blocky2 = await h.getBlock()
    await h.advanceTime(86400)
    await gov.executeVote(1)
    voteInfo = await gov.getVoteInfo(1)
    hash = ethers.utils.solidityKeccak256(['bytes32', 'uint256'], [h.uintTob32(1), blocky0.timestamp])
    assert(voteInfo[0] == hash, "Vote hash should be correct")
    assert(voteInfo[1][0] == 1, "Vote round should be correct")
    assert(voteInfo[1][1] == blocky1.timestamp, "Vote start date should be correct")
    assert(voteInfo[1][2] == blocky1.number, "Vote blocknumber should be correct")
    assert(voteInfo[1][3] == web3.utils.toWei("10"), "Vote fee should be correct")
    assert(voteInfo[1][4] == blocky2.timestamp, "Vote tallyDate should be correct")
    assert(voteInfo[1][5] == web3.utils.toWei("970"), "Vote tokenholders doesSupport should be correct")
    assert(voteInfo[1][6] == 0, "Vote tokenholders against should be correct")
    assert(voteInfo[1][7] == 0, "Vote tokenholders invalid should be correct")
    assert(voteInfo[1][8] == 0, "Vote users doesSupport should be correct")
    assert(voteInfo[1][9] == 0, "Vote users against should be correct")
    assert(voteInfo[1][10] == 0, "Vote users invalid should be correct")
    assert(voteInfo[1][11] == 0, "Vote reporters doesSupport should be correct")
    assert(voteInfo[1][12] == 0, "Vote reporters against should be correct")
    assert(voteInfo[1][13] == 0, "Vote reporters invalid should be correct")
    assert(voteInfo[1][14] == 0, "Vote teamMultisig doesSupport should be correct")
    assert(voteInfo[1][15] == 0, "Vote teamMultisig against should be correct")
    assert(voteInfo[1][16] == 0, "Vote teamMultisig invalid should be correct")
    assert(voteInfo[2] == true, "Vote executed should be true")
    assert(voteInfo[3] == 1, "Vote result should be PASSED")
    assert(voteInfo[4] == accounts[1].address, "Vote initiator address should be correct")
  });
  it("Test getVoteRounds()", async function() {
    await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("20"))
    await token.connect(accounts[2]).approve(flex.address, web3.utils.toWei("20"))
    await flex.connect(accounts[2]).depositStake(web3.utils.toWei("20"))
    await flex.connect(accounts[2]).submitValue(h.uintTob32(1), h.uintTob32(100), 0, '0x')
    blocky0 = await h.getBlock()
    await token.connect(accounts[1]).approve(gov.address, web3.utils.toWei("10"))
    await gov.connect(accounts[1]).beginDispute(h.uintTob32(1), blocky0.timestamp)
    blocky1 = await h.getBlock()
    hash = ethers.utils.solidityKeccak256(['bytes32', 'uint256'], [h.uintTob32(1), blocky0.timestamp])
    voteRounds = await gov.getVoteRounds(hash)
    assert(voteRounds.length == 1, "Vote rounds length should be correct")
    assert(voteRounds[0] == 1, "Vote rounds disputeIds should be correct")
    await h.advanceTime(86400 * 2)
    await gov.connect(accounts[1]).tallyVotes(1)
    await token.connect(accounts[1]).approve(gov.address, web3.utils.toWei("20"))
    await gov.connect(accounts[1]).beginDispute(h.uintTob32(1), blocky0.timestamp)
    voteRounds = await gov.getVoteRounds(hash)
    assert(voteRounds.length == 2, "Vote rounds length should be correct")
    assert(voteRounds[0] == 1, "Vote round disputeId should be correct")
    assert(voteRounds[1] == 2, "Vote round disputeId should be correct")
  });
  it("Test getVoteTallyByAddress()", async function() {
    await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("20"))
    await token.connect(accounts[2]).approve(flex.address, web3.utils.toWei("20"))
    await flex.connect(accounts[2]).depositStake(web3.utils.toWei("20"))
    await flex.connect(accounts[2]).submitValue(h.uintTob32(1), h.uintTob32(100), 0, '0x')
    blocky0 = await h.getBlock()
    await token.connect(accounts[1]).approve(gov.address, web3.utils.toWei("10"))
    await gov.connect(accounts[1]).beginDispute(h.uintTob32(1), blocky0.timestamp)
    await token.connect(accounts[1]).transfer(accounts[3].address, web3.utils.toWei("20"))
    await token.connect(accounts[3]).approve(flex.address, web3.utils.toWei("20"))
    await flex.connect(accounts[3]).depositStake(web3.utils.toWei("20"))
    await flex.connect(accounts[3]).submitValue(h.uintTob32(1), h.uintTob32(100), 0, '0x')
    blocky0 = await h.getBlock()
    await token.connect(accounts[1]).approve(gov.address, web3.utils.toWei("10"))
    await gov.connect(accounts[1]).beginDispute(h.uintTob32(1), blocky0.timestamp)
    assert(await gov.getVoteTallyByAddress(accounts[1].address) == 0, "Vote tally should be correct")
    await gov.connect(accounts[1]).vote(1, true, false)
    assert(await gov.getVoteTallyByAddress(accounts[1].address) == 1, "Vote tally should be correct")
    await gov.connect(accounts[1]).vote(2, true, false)
    assert(await gov.getVoteTallyByAddress(accounts[1].address) == 2, "Vote tally should be correct")
  })
});
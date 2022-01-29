const {
  expect,
  assert
} = require("chai");
const web3 = require('web3');
const h = require("./helpers/helpers");
const QUERYID1 = h.uintTob32(1)

describe("Polygon Governance End-To-End Tests", function() {

  let polyGov, flex, accounts, token;

  beforeEach(async function() {
    accounts = await ethers.getSigners();
    const Token = await ethers.getContractFactory("StakingToken");
    token = await Token.deploy();
    await token.deployed();
    const PolygonGovernance = await ethers.getContractFactory("Governance");
    const TellorFlex = await ethers.getContractFactory("TellorFlex")
    flex = await TellorFlex.deploy(token.address, accounts[0].address, web3.utils.toWei("10"), 86400 / 2)
    await flex.deployed();
    polyGov = await PolygonGovernance.deploy(flex.address, web3.utils.toWei("10"), accounts[0].address);
    await polyGov.deployed();
    await flex.changeGovernanceAddress(polyGov.address);
    await token.mint(accounts[1].address, web3.utils.toWei("1000"));
  });
  it("Test multiple disputes", async function() {
    await token.connect(accounts[1]).approve(flex.address, web3.utils.toWei("1000"))
    await flex.connect(accounts[1]).depositStake(web3.utils.toWei("10"))
    await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("100"))
    await token.connect(accounts[1]).transfer(accounts[3].address, web3.utils.toWei("100"))
    await token.connect(accounts[1]).transfer(accounts[4].address, web3.utils.toWei("100"))
    await token.connect(accounts[1]).transfer(accounts[5].address, web3.utils.toWei("100"))
    await token.connect(accounts[4]).approve(flex.address, web3.utils.toWei("100"))
    await flex.connect(accounts[4]).depositStake(web3.utils.toWei("10"))
    await token.connect(accounts[5]).approve(flex.address, web3.utils.toWei("100"))
    await flex.connect(accounts[5]).depositStake(web3.utils.toWei("10"))
    let blocky = await h.getBlock()
    await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("10"))
    let balance1 = await token.balanceOf(accounts[2].address)
    await h.expectThrow(polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp)) //no value exists
    await flex.connect(accounts[1]).submitValue(QUERYID1, h.bytes(100), 0, '0x')
    blocky = await h.getBlock()
    await flex.connect(accounts[4]).submitValue(h.hash('0x123456'), h.bytes(200), 0, '0x123456')
    let blocky2 = await h.getBlock()
    await flex.connect(accounts[5]).submitValue(h.hash('0x1234'), h.bytes("a"), 0, '0x1234')
    let blocky3 = await h.getBlock()
    await h.expectThrow(polyGov.connect(accounts[4]).beginDispute(QUERYID1, blocky.timestamp)) // must have tokens to
    await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("30"))
    await polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp);
    await polyGov.connect(accounts[2]).beginDispute(h.hash('0x123456'), blocky2.timestamp);
    await polyGov.connect(accounts[2]).beginDispute(h.hash('0x1234'), blocky3.timestamp);
    assert(await polyGov.voteCount() == 3, "vote count should be 3")
    let balance2 = await token.balanceOf(accounts[2].address)
    let vars = await polyGov.getDisputeInfo(1)
    let _hash = ethers.utils.solidityKeccak256(['bytes32', 'uint256'], [h.uintTob32(1), blocky.timestamp])
    assert(vars[0] == QUERYID1, "queryID should be correct")
    assert(vars[1] == blocky.timestamp, "timestamp should be correct")
    assert(vars[2] == h.bytes(100), "value should be correct")
    assert(vars[3] == accounts[1].address, "accounts[1] should be correct")
    assert(await polyGov.getOpenDisputesOnId(QUERYID1) == 1, "open disputes on ID should be correct")
    assert(await polyGov.getVoteRounds(_hash) == 1, "number of vote rounds should be correct")
    vars = await polyGov.getDisputeInfo(2)
    _hash = await ethers.utils.solidityKeccak256(['bytes32', 'uint256'], [h.hash('0x123456'), blocky2.timestamp])
    assert(vars[0] == h.hash('0x123456'), "queryID should be correct")
    assert(vars[1] == blocky2.timestamp, "timestamp should be correct")
    assert(vars[2] == h.bytes(200), "value should be correct")
    assert(vars[3] == accounts[4].address, "accounts[1] should be correct")
    assert(await polyGov.getOpenDisputesOnId(h.hash('0x123456')) == 1, "open disputes on ID should be correct")
    let vr = await polyGov.getVoteRounds(_hash)
    assert(vr.length == 1, "number of vote rounds should be correct")
    vars = await polyGov.getDisputeInfo(3)
    _hash = ethers.utils.solidityKeccak256(['bytes32', 'uint256'], [h.hash('0x1234'), blocky3.timestamp])
    assert(vars[0] == h.hash('0x1234'), "queryID should be correct")
    assert(vars[1] == blocky3.timestamp, "timestamp should be correct")
    assert(vars[2] == h.bytes("a"), "value should be correct")
    assert(vars[3] == accounts[5].address, "accounts[1] should be correct")
    assert(await polyGov.getOpenDisputesOnId(h.hash('0x1234')) == 1, "open disputes on ID should be correct")
    vr = await polyGov.getVoteRounds(_hash)
    assert(vr.length == 1, "number of vote rounds should be correct")
    await h.advanceTime(86400 * 2);
    await polyGov.tallyVotes(1)
    await polyGov.tallyVotes(2)
    await polyGov.tallyVotes(3)
    for (var i = 1; i < 4; i++) {
      vars = await polyGov.getVoteInfo(i)
      assert(vars[2][1] == true, "Vote isDispute should be false")
      assert(vars[3] == 2, "Vote result should be INVALID")
    }
    await h.advanceTime(86400 * 2);
    await polyGov.executeVote(1)
    await polyGov.executeVote(2)
    await polyGov.executeVote(3)
  });
  it("Test multiple disputes, changing stake amount mid dispute", async function() {
    // Propose change stake amount, but don't execute yet
    await token.connect(accounts[1]).approve(polyGov.address, web3.utils.toWei("10"))
    await polyGov.connect(accounts[1]).proposeChangeStakeAmount(web3.utils.toWei("50"), 0)
    await polyGov.connect(accounts[1]).vote(1, true, false)
    await h.advanceTime(86400 * 7) // 7 days
    await polyGov.connect(accounts[1]).tallyVotes(1)
    await h.advanceTime(86400)
    // Stake reporters
    await token.connect(accounts[1]).approve(flex.address, web3.utils.toWei("1000"))
    await flex.connect(accounts[1]).depositStake(web3.utils.toWei("10"))
    await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("100"))
    await token.connect(accounts[1]).transfer(accounts[3].address, web3.utils.toWei("100"))
    await token.connect(accounts[1]).transfer(accounts[4].address, web3.utils.toWei("100"))
    await token.connect(accounts[1]).transfer(accounts[5].address, web3.utils.toWei("100"))
    await token.connect(accounts[4]).approve(flex.address, web3.utils.toWei("100"))
    await flex.connect(accounts[4]).depositStake(web3.utils.toWei("10"))
    await token.connect(accounts[5]).approve(flex.address, web3.utils.toWei("100"))
    await flex.connect(accounts[5]).depositStake(web3.utils.toWei("10"))
    // Submit values
    await flex.connect(accounts[1]).submitValue(QUERYID1, h.bytes(100), 0, '0x')
    blocky = await h.getBlock()
    await flex.connect(accounts[4]).submitValue(h.hash('0x123456'), h.bytes(200), 0, '0x123456')
    let blocky2 = await h.getBlock()
    await flex.connect(accounts[5]).submitValue(h.hash('0x1234'), h.bytes("a"), 0, '0x1234')
    let blocky3 = await h.getBlock()
    // Dispute values
    await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("30"))
    await polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp);
    await polyGov.connect(accounts[2]).beginDispute(h.hash('0x123456'), blocky2.timestamp);
    await polyGov.connect(accounts[2]).beginDispute(h.hash('0x1234'), blocky3.timestamp);
    // Vote dispute 2
    await polyGov.connect(accounts[1]).vote(2, false, false) // account1 vote against dispute
    await polyGov.connect(accounts[2]).vote(2, true, false)
    await polyGov.connect(accounts[3]).vote(2, true, false)
    // Vote dispute 3
    await polyGov.connect(accounts[1]).vote(3, true, false) // account1 vote against dispute
    await polyGov.connect(accounts[2]).vote(3, true, false)
    await polyGov.connect(accounts[3]).vote(3, true, false)
    // Vote dispute 4
    await polyGov.connect(accounts[1]).vote(4, true, false) // account1 vote against dispute
    await polyGov.connect(accounts[2]).vote(4, true, false)
    await polyGov.connect(accounts[3]).vote(4, true, false)
    // Execute changeStakeAmount proposal
    await polyGov.executeVote(1)
    assert(await flex.stakeAmount() == web3.utils.toWei("50"), "Stake amount should change")
    // Tally votes 2-4
    await h.advanceTime(86400 * 2)
    await polyGov.tallyVotes(2)
    await polyGov.tallyVotes(3)
    await polyGov.tallyVotes(4)
    // Execute votes 2-4
    await h.advanceTime(86400)
    balance1 = await token.balanceOf(accounts[1].address)
    balance2 = await token.balanceOf(accounts[2].address)
    balance4 = await token.balanceOf(accounts[4].address)
    balance5 = await token.balanceOf(accounts[5].address)
    await polyGov.executeVote(2)
    await polyGov.executeVote(3)
    await polyGov.executeVote(4)
    assert(await token.balanceOf(accounts[1].address) - balance1 == web3.utils.toWei("20"), "account1 balance should increase by original stake amount plus fee amount")
    assert(await token.balanceOf(accounts[2].address) - balance2 == web3.utils.toWei("40"), "account2 balance should increase by 2x original stake amount plus 2x fee amount")
    assert(await token.balanceOf(accounts[4].address) - balance4 == 0, "account4 balance should not change")
    assert(await token.balanceOf(accounts[5].address) - balance5 == 0, "account5 balance should not change")
  });
  it("Test multiple disputes, changing governance address mid dispute", async function() {
    // Deploy new governance contract
    const PolygonGovernance = await ethers.getContractFactory("Governance");
    let polyGov2 = await PolygonGovernance.deploy(flex.address, web3.utils.toWei("10"), accounts[0].address);
    // Propose change governnace address, but don't execute yet
    await token.connect(accounts[1]).approve(polyGov.address, web3.utils.toWei("10"))
    await polyGov.connect(accounts[1]).proposeChangeGovernanceAddress(polyGov2.address, 0)
    await polyGov.connect(accounts[1]).vote(1, true, false)
    await h.advanceTime(86400 * 7) // 7 days
    await polyGov.connect(accounts[1]).tallyVotes(1)
    await h.advanceTime(86400)
    // Stake reporters
    await token.connect(accounts[1]).approve(flex.address, web3.utils.toWei("1000"))
    await flex.connect(accounts[1]).depositStake(web3.utils.toWei("10"))
    await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("100"))
    await token.connect(accounts[1]).transfer(accounts[3].address, web3.utils.toWei("100"))
    await token.connect(accounts[1]).transfer(accounts[4].address, web3.utils.toWei("100"))
    await token.connect(accounts[1]).transfer(accounts[5].address, web3.utils.toWei("100"))
    await token.connect(accounts[4]).approve(flex.address, web3.utils.toWei("100"))
    await flex.connect(accounts[4]).depositStake(web3.utils.toWei("10"))
    await token.connect(accounts[5]).approve(flex.address, web3.utils.toWei("100"))
    await flex.connect(accounts[5]).depositStake(web3.utils.toWei("10"))
    // Submit values
    await flex.connect(accounts[1]).submitValue(QUERYID1, h.bytes(100), 0, '0x')
    blocky = await h.getBlock()
    await flex.connect(accounts[4]).submitValue(h.hash('0x123456'), h.bytes(200), 0, '0x123456')
    let blocky2 = await h.getBlock()
    await flex.connect(accounts[5]).submitValue(h.hash('0x1234'), h.bytes("a"), 0, '0x1234')
    let blocky3 = await h.getBlock()
    // Dispute values
    await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("30"))
    await polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp);
    await polyGov.connect(accounts[2]).beginDispute(h.hash('0x123456'), blocky2.timestamp);
    await polyGov.connect(accounts[2]).beginDispute(h.hash('0x1234'), blocky3.timestamp);
    // Vote dispute 2
    await polyGov.connect(accounts[1]).vote(2, false, false) // account1 vote against dispute
    await polyGov.connect(accounts[2]).vote(2, true, false)
    await polyGov.connect(accounts[3]).vote(2, true, false)
    // Vote dispute 3
    await polyGov.connect(accounts[1]).vote(3, true, false) // account1 vote against dispute
    await polyGov.connect(accounts[2]).vote(3, true, false)
    await polyGov.connect(accounts[3]).vote(3, true, false)
    // Vote dispute 4
    await polyGov.connect(accounts[1]).vote(4, true, false) // account1 vote against dispute
    await polyGov.connect(accounts[2]).vote(4, true, false)
    await polyGov.connect(accounts[3]).vote(4, true, false)
    // Execute changeStakeAmount proposal
    await polyGov.executeVote(1)
    assert(await flex.governance() == polyGov2.address, "Governance address should change")
    // Tally votes 2-4
    await h.advanceTime(86400 * 2)
    await polyGov.tallyVotes(2)
    await polyGov.tallyVotes(3)
    await polyGov.tallyVotes(4)
    // Execute votes 2-4
    await h.advanceTime(86400)
    balance1 = await token.balanceOf(accounts[1].address)
    balance2 = await token.balanceOf(accounts[2].address)
    balance4 = await token.balanceOf(accounts[4].address)
    balance5 = await token.balanceOf(accounts[5].address)
    await polyGov.executeVote(2)
    await polyGov.executeVote(3)
    await polyGov.executeVote(4)
    assert(await token.balanceOf(accounts[1].address) - balance1 == web3.utils.toWei("20"), "account1 balance should increase by original stake amount plus fee amount")
    assert(await token.balanceOf(accounts[2].address) - balance2 == web3.utils.toWei("40"), "account2 balance should increase by 2x original stake amount plus 2x fee amount")
    assert(await token.balanceOf(accounts[4].address) - balance4 == 0, "account4 balance should not change")
    assert(await token.balanceOf(accounts[5].address) - balance5 == 0, "account5 balance should not change")
    // Another dispute
    await flex.connect(accounts[1]).depositStake(web3.utils.toWei("10"))
    await flex.connect(accounts[1]).submitValue(QUERYID1, h.bytes(100), 0, '0x')
    blocky = await h.getBlock()
    await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("10"))
    await h.expectThrow(polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp)) // no longer governance contract
    await token.connect(accounts[2]).approve(polyGov2.address, web3.utils.toWei("10"))
    await polyGov2.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp)
  });
  it("Test multiple disputes, change time lock mid dispute", async function() {
    // Propose change time lock, but don't execute yet
    await token.connect(accounts[1]).approve(polyGov.address, web3.utils.toWei("10"))
    await polyGov.connect(accounts[1]).proposeChangeReportingLock(86400 / 4, 0)
    await polyGov.connect(accounts[1]).vote(1, true, false)
    await h.advanceTime(86400 * 7) // 7 days
    await polyGov.connect(accounts[1]).tallyVotes(1)
    await h.advanceTime(86400)
    // Stake reporters
    await token.connect(accounts[1]).approve(flex.address, web3.utils.toWei("1000"))
    await flex.connect(accounts[1]).depositStake(web3.utils.toWei("10"))
    await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("100"))
    await token.connect(accounts[1]).transfer(accounts[3].address, web3.utils.toWei("100"))
    await token.connect(accounts[1]).transfer(accounts[4].address, web3.utils.toWei("100"))
    await token.connect(accounts[1]).transfer(accounts[5].address, web3.utils.toWei("100"))
    await token.connect(accounts[4]).approve(flex.address, web3.utils.toWei("100"))
    await flex.connect(accounts[4]).depositStake(web3.utils.toWei("10"))
    await token.connect(accounts[5]).approve(flex.address, web3.utils.toWei("100"))
    await flex.connect(accounts[5]).depositStake(web3.utils.toWei("10"))
    // Submit values
    await flex.connect(accounts[1]).submitValue(QUERYID1, h.bytes(100), 0, '0x')
    blocky = await h.getBlock()
    await flex.connect(accounts[4]).submitValue(h.hash('0x123456'), h.bytes(200), 0, '0x123456')
    let blocky2 = await h.getBlock()
    await flex.connect(accounts[5]).submitValue(h.hash('0x1234'), h.bytes("a"), 0, '0x1234')
    let blocky3 = await h.getBlock()
    // Dispute values
    await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("30"))
    await polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp);
    await polyGov.connect(accounts[2]).beginDispute(h.hash('0x123456'), blocky2.timestamp);
    await polyGov.connect(accounts[2]).beginDispute(h.hash('0x1234'), blocky3.timestamp);
    // Vote dispute 2
    await polyGov.connect(accounts[1]).vote(2, false, false) // account1 vote against dispute
    await polyGov.connect(accounts[2]).vote(2, true, false)
    await polyGov.connect(accounts[3]).vote(2, true, false)
    // Vote dispute 3
    await polyGov.connect(accounts[1]).vote(3, true, false) // account1 vote against dispute
    await polyGov.connect(accounts[2]).vote(3, true, false)
    await polyGov.connect(accounts[3]).vote(3, true, false)
    // Vote dispute 4
    await polyGov.connect(accounts[1]).vote(4, true, false) // account1 vote against dispute
    await polyGov.connect(accounts[2]).vote(4, true, false)
    await polyGov.connect(accounts[3]).vote(4, true, false)
    // Execute changeStakeAmount proposal
    await polyGov.executeVote(1)
    assert(await flex.getReportingLock() == 86400 / 4, "Reporting lock should change")
    await h.expectThrow(polyGov.tallyVotes(2)); // voting period still active
    // Tally votes 2-4
    await h.advanceTime(86400 * 2)
    await polyGov.tallyVotes(2)
    await polyGov.tallyVotes(3)
    await polyGov.tallyVotes(4)
    // Execute votes 2-4
    await h.advanceTime(86400)
    balance1 = await token.balanceOf(accounts[1].address)
    balance2 = await token.balanceOf(accounts[2].address)
    balance4 = await token.balanceOf(accounts[4].address)
    balance5 = await token.balanceOf(accounts[5].address)
    await polyGov.executeVote(2)
    await polyGov.executeVote(3)
    await polyGov.executeVote(4)
    assert(await token.balanceOf(accounts[1].address) - balance1 == web3.utils.toWei("20"), "account1 balance should increase by original stake amount plus fee amount")
    assert(await token.balanceOf(accounts[2].address) - balance2 == web3.utils.toWei("40"), "account2 balance should increase by 2x original stake amount plus 2x fee amount")
    assert(await token.balanceOf(accounts[4].address) - balance4 == 0, "account4 balance should not change")
    assert(await token.balanceOf(accounts[5].address) - balance5 == 0, "account5 balance should not change")
    // Another submission
    await flex.connect(accounts[1]).depositStake(web3.utils.toWei("10"))
    await flex.connect(accounts[1]).submitValue(QUERYID1, h.bytes(100), 0, '0x')
    blocky = await h.getBlock()
    await h.expectThrow(flex.connect(accounts[1]).submitValue(QUERYID1, h.bytes(100), 0, '0x')) // still in reporting lock
    await h.advanceTime(86400 / 4)
    await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("10"))
    await h.expectThrow(polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp)) // Dispute must be started within reporting lock time
    await flex.connect(accounts[1]).submitValue(QUERYID1, h.bytes(100), 0, '0x')
    blocky = await h.getBlock()
    await polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp)
  });
  it("Test no votes on a dispute", async function() {
    await token.connect(accounts[1]).approve(flex.address, web3.utils.toWei("10"))
    await flex.connect(accounts[1]).depositStake(web3.utils.toWei("10"))
    await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("100"))
    await flex.connect(accounts[1]).submitValue(QUERYID1, h.bytes(100), 0, '0x')
    blocky = await h.getBlock()
    await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("10"))
    await polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp)
    await h.advanceTime(86400 * 2)
    await polyGov.tallyVotes(1)
    await h.advanceTime(86400)
    balance1 = await token.balanceOf(accounts[1].address)
    balance2 = await token.balanceOf(accounts[2].address)
    await polyGov.executeVote(1)
    assert(await token.balanceOf(accounts[1].address) - balance1 == web3.utils.toWei("10"), "account1 balance should increase by original stake amount")
    assert(await token.balanceOf(accounts[2].address) - balance2 == web3.utils.toWei("10"), "account2 balance should increase by fee amount")
    voteInfo = await polyGov.getVoteInfo(1)
    assert(voteInfo[3] == 2, "Vote result should be correct")
  });
  it("Test multiple vote rounds on a dispute, all passing", async function() {
    await token.connect(accounts[1]).approve(flex.address, web3.utils.toWei("10"))
    await flex.connect(accounts[1]).depositStake(web3.utils.toWei("10"))
    await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("100"))
    await flex.connect(accounts[1]).submitValue(QUERYID1, h.bytes(100), 0, '0x')
    blocky = await h.getBlock()
    // Round 1
    await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("10"))
    await polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp)
    await polyGov.connect(accounts[1]).vote(1, true, false)
    await polyGov.connect(accounts[2]).vote(1, true, false)
    await h.advanceTime(86400 * 2)
    await polyGov.tallyVotes(1)
    // Round 2
    await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("20"))
    await polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp)
    await polyGov.connect(accounts[1]).vote(2, true, false)
    await polyGov.connect(accounts[2]).vote(2, true, false)
    await h.advanceTime(86400 * 2)
    await polyGov.tallyVotes(2)
    // Round 3
    await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("40"))
    await polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp)
    await polyGov.connect(accounts[1]).vote(3, true, false)
    await polyGov.connect(accounts[2]).vote(3, true, false)
    await h.advanceTime(86400 * 2)
    await polyGov.tallyVotes(3)
    // Execute
    await h.advanceTime(86400 * 3)
    balance1 = await token.balanceOf(accounts[1].address)
    balance2 = await token.balanceOf(accounts[2].address)
    balanceGov = await token.balanceOf(polyGov.address)
    await h.expectThrow(polyGov.executeVote(1)) // Must be the final vote
    await h.expectThrow(polyGov.executeVote(2)) // Must be the final vote
    await polyGov.executeVote(3)
    await h.expectThrow(polyGov.executeVote(3)) // Vote has been executed
    assert(await token.balanceOf(accounts[1].address) - balance1 == 0, "account1 balance should not change")
    assert(await token.balanceOf(accounts[2].address) - balance2 == web3.utils.toWei("80"), "account2 balance should increase by original stake amount plus fee amount")
    assert(balanceGov - await token.balanceOf(polyGov.address) == web3.utils.toWei("80"), "governance balance should decrease by original stake amount plus fee amount")
    voteInfo = await polyGov.getVoteInfo(3)
    assert(voteInfo[3] == 1, "Vote result should be correct")
  });
  it("Test multiple vote rounds on a dispute,  overturn result", async function() {
    await token.connect(accounts[1]).approve(flex.address, web3.utils.toWei("10"))
    await flex.connect(accounts[1]).depositStake(web3.utils.toWei("10"))
    await token.connect(accounts[1]).transfer(accounts[2].address, web3.utils.toWei("100"))
    await flex.connect(accounts[1]).submitValue(QUERYID1, h.bytes(100), 0, '0x')
    blocky = await h.getBlock()
    // Round 1
    await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("10"))
    await polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp)
    await polyGov.connect(accounts[1]).vote(1, true, false)
    await polyGov.connect(accounts[2]).vote(1, true, false)
    await h.advanceTime(86400 * 2)
    await polyGov.tallyVotes(1)
    // Round 2
    await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("20"))
    await polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp)
    await polyGov.connect(accounts[1]).vote(2, true, false)
    await polyGov.connect(accounts[2]).vote(2, true, false)
    await h.advanceTime(86400 * 2)
    await polyGov.tallyVotes(2)
    // Round 3
    await token.connect(accounts[2]).approve(polyGov.address, web3.utils.toWei("40"))
    await polyGov.connect(accounts[2]).beginDispute(QUERYID1, blocky.timestamp)
    await polyGov.connect(accounts[1]).vote(3, false, false)
    await polyGov.connect(accounts[2]).vote(3, false, false)
    await h.advanceTime(86400 * 2)
    await polyGov.tallyVotes(3)
    // Execute
    await h.advanceTime(86400 * 3)
    balance1 = await token.balanceOf(accounts[1].address)
    balance2 = await token.balanceOf(accounts[2].address)
    balanceGov = await token.balanceOf(polyGov.address)
    await h.expectThrow(polyGov.executeVote(1)) // Must be the final vote
    await h.expectThrow(polyGov.executeVote(2)) // Must be the final vote
    await polyGov.executeVote(3)
    await h.expectThrow(polyGov.executeVote(3)) // Vote has been executed
    assert(await token.balanceOf(accounts[1].address) - balance1 == web3.utils.toWei("80"), "account1 balance should increase by original stake amount plus fee amount")
    assert(await token.balanceOf(accounts[2].address) - balance2 == 0, "account2 balance should not change")
    assert(balanceGov - await token.balanceOf(polyGov.address) == web3.utils.toWei("80"), "governance balance should decrease by original stake amount plus fee amount")
    voteInfo = await polyGov.getVoteInfo(3)
    assert(voteInfo[3] == 0, "Vote result should be correct")
  });  
})
